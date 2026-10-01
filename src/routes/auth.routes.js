const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const prisma = require('../config/database');
const fs = require('fs');
const path = require('path');
const { regenerateSession } = require('../middleware/auth');
const { authRateLimiter } = require('../middleware/security');
const {
  validate,
  adminLoginSchema,
  studentLoginSchema,
  enrollmentVerifySchema,
  studentRegisterSchema,
} = require('../middleware/validation');
const { photoUpload, handleMulterError } = require('../middleware/fileUpload');
const { uploadImage } = require('../config/cloudinary');
const { logAudit } = require('../services/audit.service');

// ──────────────────────────────────────────────
// ADMIN LOGIN
// ──────────────────────────────────────────────

router.post(
  '/admin/login',
  authRateLimiter(),
  validate(adminLoginSchema),
  async (req, res) => {
    try {
      const { email, password } = req.validatedBody;

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user || user.role !== 'ADMIN') {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: 'Account is deactivated.' });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      // Regenerate session to prevent fixation
      await regenerateSession(req, {
        userId: user.id,
        role: user.role,
        email: user.email,
      });

      await logAudit({
        userId: user.id,
        action: 'ADMIN_LOGIN',
        entity: 'User',
        entityId: user.id,
        ipAddress: req.ip,
      });

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      console.error('[Auth] Admin login error:', error.message);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

// ──────────────────────────────────────────────
// STUDENT ENROLLMENT VERIFICATION
// ──────────────────────────────────────────────

router.post(
  '/student/verify-enrollment',
  authRateLimiter(),
  validate(enrollmentVerifySchema),
  async (req, res) => {
    try {
      const { enrollmentNumber } = req.validatedBody;

      // Check if enrollment exists in admin exam data
      const examData = await prisma.examStudentData.findFirst({
        where: { enrollmentNumber },
        orderBy: { createdAt: 'desc' },
        select: {
          studentName: true,
          enrollmentNumber: true,
          program: true,
          semester: true,
          division: true,
          studentEmailId: true,
        },
      });

      if (!examData) {
        return res.status(404).json({
          verified: false,
          error: 'Enrollment number not found in admin data. Registration is not allowed.',
        });
      }

      // Check if account already exists
      const existingProfile = await prisma.studentProfile.findUnique({
        where: { enrollmentNumber },
      });

      if (existingProfile) {
        return res.status(409).json({
          verified: false,
          accountExists: true,
          error: 'An account already exists for this enrollment number. Please login instead.',
        });
      }

      res.json({
        verified: true,
        student: {
          name: examData.studentName,
          enrollmentNumber: examData.enrollmentNumber,
          program: examData.program,
          semester: examData.semester,
          division: examData.division,
          studentEmailId: examData.studentEmailId,
        },
      });
    } catch (error) {
      console.error('[Auth] Enrollment verification error:', error.message);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

// ──────────────────────────────────────────────
// STUDENT REGISTRATION
// ──────────────────────────────────────────────

router.post(
  '/student/register',
  authRateLimiter(),
  photoUpload.single('photo'),
  handleMulterError,
  async (req, res) => {
    try {
      const { enrollmentNumber, password } = req.body;

      // Validate inputs
      const parsed = studentRegisterSchema.safeParse({ enrollmentNumber, password });
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.errors.map(e => e.message),
        });
      }

      // Verify enrollment exists in admin data
      const examData = await prisma.examStudentData.findFirst({
        where: { enrollmentNumber: parsed.data.enrollmentNumber },
        orderBy: { createdAt: 'desc' },
      });

      if (!examData) {
        return res.status(403).json({
          error: 'Enrollment number not found in admin data. Registration denied.',
        });
      }

      // Check for existing account
      const existingProfile = await prisma.studentProfile.findUnique({
        where: { enrollmentNumber: parsed.data.enrollmentNumber },
      });

      if (existingProfile) {
        return res.status(409).json({
          error: 'Account already exists for this enrollment number.',
        });
      }

      // Save photo locally
      let photoUrl = null;
      let photoPublicId = null;

      if (req.file) {
        try {
          const uploadDir = path.join(__dirname, '../../public/uploads/photos');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          const ext = path.extname(req.file.originalname) || '.jpg';
          const filename = `${parsed.data.enrollmentNumber}-${Date.now()}${ext}`;
          const filePath = path.join(uploadDir, filename);
          fs.writeFileSync(filePath, req.file.buffer);
          
          photoUrl = `/uploads/photos/${filename}`;
          photoPublicId = filename;
        } catch (uploadErr) {
          console.error('[Auth] Photo upload error:', uploadErr.message);
          return res.status(500).json({ error: 'Failed to save photo locally. Please try again.' });
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(parsed.data.password, 12);

      // Create user + student profile in transaction
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: examData.studentEmailId || null,
            password: hashedPassword,
            role: 'STUDENT',
            isActive: true,
          },
        });

        const profile = await tx.studentProfile.create({
          data: {
            userId: user.id,
            enrollmentNumber: examData.enrollmentNumber,
            name: examData.studentName,
            program: examData.program,
            semester: examData.semester,
            division: examData.division || null,
            photoUrl,
            photoPublicId,
          },
        });

        return { user, profile };
      });

      await logAudit({
        userId: result.user.id,
        action: 'STUDENT_REGISTERED',
        entity: 'StudentProfile',
        entityId: result.profile.id,
        details: { enrollmentNumber: examData.enrollmentNumber },
        ipAddress: req.ip,
      });

      res.status(201).json({
        message: 'Account created successfully. You can now login.',
        student: {
          enrollmentNumber: result.profile.enrollmentNumber,
          name: result.profile.name,
        },
      });
    } catch (error) {
      console.error('[Auth] Student registration error:', error.message);
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Account already exists for this enrollment.' });
      }
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

// ──────────────────────────────────────────────
// STUDENT LOGIN
// ──────────────────────────────────────────────

router.post(
  '/student/login',
  authRateLimiter(),
  validate(studentLoginSchema),
  async (req, res) => {
    try {
      const { enrollmentNumber, password } = req.validatedBody;

      const profile = await prisma.studentProfile.findUnique({
        where: { enrollmentNumber },
        include: { user: true },
      });

      if (!profile || !profile.user) {
        return res.status(401).json({ error: 'Invalid enrollment number or password.' });
      }

      if (!profile.user.isActive) {
        return res.status(403).json({ error: 'Account is deactivated.' });
      }

      const validPassword = await bcrypt.compare(password, profile.user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid enrollment number or password.' });
      }

      await regenerateSession(req, {
        userId: profile.user.id,
        role: profile.user.role,
        enrollmentNumber: profile.enrollmentNumber,
      });

      res.json({
        message: 'Login successful',
        student: {
          id: profile.id,
          enrollmentNumber: profile.enrollmentNumber,
          name: profile.name,
          program: profile.program,
          semester: profile.semester,
          photoUrl: profile.photoUrl,
        },
      });
    } catch (error) {
      console.error('[Auth] Student login error:', error.message);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

// ──────────────────────────────────────────────
// LOGOUT
// ──────────────────────────────────────────────

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[Auth] Logout error:', err.message);
      return res.status(500).json({ error: 'Failed to logout.' });
    }
    res.clearCookie('soe.sid');
    res.json({ message: 'Logged out successfully.' });
  });
});

// ──────────────────────────────────────────────
// CHECK AUTH STATUS
// ──────────────────────────────────────────────

router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    userId: req.session.userId,
    role: req.session.role,
    email: req.session.email || null,
    enrollmentNumber: req.session.enrollmentNumber || null,
  });
});

module.exports = router;
