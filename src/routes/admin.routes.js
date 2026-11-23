const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const prisma = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { validate, adminAddStudentSchema } = require('../middleware/validation');
const { sendStudentWelcomeEmail } = require('../services/email.service');
const { logAudit } = require('../services/audit.service');

// ──────────────────────────────────────────────
// DASHBOARD STATISTICS
// ──────────────────────────────────────────────

router.get('/dashboard/stats', requireAdmin, async (req, res) => {
  try {
    const [
      totalStudents,
      totalExams,
      eligibleCount,
      notEligibleCount,
      totalBlocks,
      hallTicketSettings,
      blockReportCount,
    ] = await Promise.all([
      prisma.examStudentData.groupBy({
        by: ['enrollmentNumber'],
        _count: true,
      }).then(r => r.length),
      prisma.exam.count(),
      prisma.eligibility.count({ where: { finalEligibility: 'ELIGIBLE' } }),
      prisma.eligibility.count({ where: { finalEligibility: 'NOT_ELIGIBLE' } }),
      prisma.seatingArrangement.count(),
      prisma.hallTicketSettings.count(),
      prisma.auditLog.count({ where: { action: 'BLOCK_REPORT_GENERATED' } }),
    ]);

    res.json({
      totalStudents,
      totalExams,
      eligibleStudents: eligibleCount,
      notEligibleStudents: notEligibleCount,
      totalBlocks,
      hallTicketsGenerated: hallTicketSettings,
      blockReportsGenerated: blockReportCount,
    });
  } catch (error) {
    console.error('[Admin] Dashboard stats error:', error.message);
    res.status(500).json({ error: 'Failed to load dashboard statistics.' });
  }
});

// ──────────────────────────────────────────────
// RECENT ACTIVITY (from Audit Log)
// ──────────────────────────────────────────────

router.get('/dashboard/activity', requireAdmin, async (req, res) => {
  try {
    const activities = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        user: { select: { email: true, role: true } },
      },
    });

    res.json({ activities });
  } catch (error) {
    console.error('[Admin] Activity error:', error.message);
    res.status(500).json({ error: 'Failed to load activity.' });
  }
});

// ──────────────────────────────────────────────
// STUDENT MANAGEMENT
// ──────────────────────────────────────────────

/**
 * List all students (with search and status filters)
 */
router.get('/students', requireAdmin, async (req, res) => {
  try {
    const { search, status } = req.query;

    const where = { role: 'STUDENT' };

    if (status === 'ACTIVATED') {
      where.isActivated = true;
    } else if (status === 'PENDING') {
      where.isActivated = false;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { studentProfile: { name: { contains: q, mode: 'insensitive' } } },
        { studentProfile: { enrollmentNumber: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const students = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        isActivated: true,
        createdAt: true,
        studentProfile: {
          select: {
            id: true,
            name: true,
            enrollmentNumber: true,
            program: true,
            semester: true,
            division: true,
            photoUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ students });
  } catch (error) {
    console.error('[Admin] List students error:', error.message);
    res.status(500).json({ error: 'Failed to fetch students list.' });
  }
});

/**
 * Add / Register a new student by Admin
 */
router.post('/students', requireAdmin, validate(adminAddStudentSchema), async (req, res) => {
  try {
    const { name, email, program, semester, division } = req.validatedBody;
    let { enrollmentNumber } = req.validatedBody;

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Check if email already registered in User table
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'A student with this college email is already registered.' });
    }

    // 2. Check or deduce enrollment number
    if (!enrollmentNumber || !enrollmentNumber.trim()) {
      // Check if this student exists in ExamStudentData
      const examData = await prisma.examStudentData.findFirst({
        where: { studentEmailId: { equals: normalizedEmail, mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
      });

      if (examData && examData.enrollmentNumber) {
        enrollmentNumber = examData.enrollmentNumber;
      } else {
        // Generate a unique fallback enrollment number
        enrollmentNumber = 'STU' + Date.now().toString().slice(-6);
      }
    } else {
      enrollmentNumber = enrollmentNumber.trim();
    }

    // Check if enrollment number is already assigned to a student profile
    const existingProfile = await prisma.studentProfile.findUnique({
      where: { enrollmentNumber },
    });

    if (existingProfile) {
      return res.status(409).json({
        error: `Enrollment number "${enrollmentNumber}" is already linked to another account.`,
      });
    }

    // 3. Generate secure random password placeholder (student sets their own password on first login)
    const randomPasswordBytes = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(randomPasswordBytes, 12);

    // 4. Create user + profile in transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          role: 'STUDENT',
          isActive: false, // inactive until activated
          isActivated: false,
        },
      });

      const profile = await tx.studentProfile.create({
        data: {
          userId: user.id,
          name: name.trim(),
          enrollmentNumber,
          program: program || 'B.Tech',
          semester: semester ? parseInt(semester, 10) : 1,
          division: division || null,
        },
      });

      return { user, profile };
    });

    // 5. Send welcome email via SMTP
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host');
    const loginUrl = `${protocol}://${host}/student/login`;

    let emailSent = false;
    try {
      await sendStudentWelcomeEmail({
        to: normalizedEmail,
        studentName: result.profile.name,
        loginUrl,
      });
      emailSent = true;
    } catch (emailErr) {
      console.error('[Admin] Welcome email send error:', emailErr.message);
    }

    // 6. Log Audit
    await logAudit({
      userId: req.session.userId,
      action: 'STUDENT_REGISTERED_BY_ADMIN',
      entity: 'StudentProfile',
      entityId: result.profile.id,
      details: { email: normalizedEmail, name: result.profile.name, enrollmentNumber },
      ipAddress: req.ip,
    });

    res.status(201).json({
      message: emailSent
        ? 'Student registered successfully. Welcome email sent.'
        : 'Student registered successfully (welcome email could not be delivered).',
      emailSent,
      student: {
        id: result.user.id,
        name: result.profile.name,
        email: result.user.email,
        enrollmentNumber: result.profile.enrollmentNumber,
        isActivated: result.user.isActivated,
      },
    });
  } catch (error) {
    console.error('[Admin] Add student error:', error.message);
    res.status(500).json({ error: 'Internal server error while registering student.' });
  }
});

/**
 * Resend Welcome Email for unactivated student
 */
router.post('/students/:id/resend-welcome', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: { studentProfile: true },
    });

    if (!user || user.role !== 'STUDENT' || !user.email) {
      return res.status(404).json({ error: 'Student account not found.' });
    }

    if (user.isActivated) {
      return res.status(400).json({ error: 'Student has already activated their account.' });
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host');
    const loginUrl = `${protocol}://${host}/student/login`;

    await sendStudentWelcomeEmail({
      to: user.email,
      studentName: user.studentProfile?.name || 'Student',
      loginUrl,
    });

    await logAudit({
      userId: req.session.userId,
      action: 'WELCOME_EMAIL_RESENT',
      entity: 'User',
      entityId: user.id,
      details: { email: user.email },
      ipAddress: req.ip,
    });

    res.json({ message: 'Welcome email resent successfully.' });
  } catch (error) {
    console.error('[Admin] Resend welcome error:', error.message);
    res.status(500).json({ error: 'Failed to resend welcome email: ' + error.message });
  }
});

module.exports = router;
