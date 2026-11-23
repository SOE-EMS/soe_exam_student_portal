const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const {
  validate,
  eligibilityCriteriaSchema,
  eligibilityAnalysisSchema,
  eligibilityOverrideSchema,
} = require('../middleware/validation');
const { logAudit } = require('../services/audit.service');
const { invalidateStudentCache, invalidateExamCache } = require('../services/pdfCache.service');

// ──────────────────────────────────────────────
// SET ELIGIBILITY CRITERIA
// ──────────────────────────────────────────────

router.post('/criteria/:examId', requireAdmin, validate(eligibilityCriteriaSchema), async (req, res) => {
  try {
    const { examId } = req.params;
    const { minAttendancePercent, feesRequired } = req.validatedBody;

    const criteria = await prisma.eligibilityCriteria.upsert({
      where: { examId },
      create: { examId, minAttendancePercent, feesRequired },
      update: { minAttendancePercent, feesRequired },
    });

    // Invalidate cached PDFs for this exam
    invalidateExamCache(examId);

    await logAudit({
      userId: req.session.userId,
      action: 'ELIGIBILITY_CRITERIA_SET',
      entity: 'EligibilityCriteria',
      entityId: examId,
      details: { minAttendancePercent, feesRequired },
      ipAddress: req.ip,
    });

    res.json({ message: 'Eligibility criteria saved.', criteria });
  } catch (error) {
    console.error('[Eligibility] Criteria error:', error.message, error.stack);
    res.status(500).json({ error: error.message || 'Failed to save criteria.' });
  }
});

// ──────────────────────────────────────────────
// GET CRITERIA
// ──────────────────────────────────────────────

router.get('/criteria/:examId', requireAdmin, async (req, res) => {
  try {
    const criteria = await prisma.eligibilityCriteria.findUnique({
      where: { examId: req.params.examId },
    });
    res.json({ criteria: criteria || { minAttendancePercent: 0, feesRequired: 'Any' } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load criteria.' });
  }
});

// ──────────────────────────────────────────────
// ANALYSIS (PREVIEW ONLY — no DB changes)
// ──────────────────────────────────────────────

router.post('/analyze/:examId', requireAdmin, validate(eligibilityAnalysisSchema), async (req, res) => {
  try {
    const { examId } = req.params;
    const { semesters, programs, minAttendancePercent, feesRequired } = req.validatedBody;

    // We will build:
    // 1. matrix (semester x program)
    // 2. totals per semester
    // 3. totals per program
    // 4. grand total
    // 5. student level analysis

    const matrix = {};
    const programTotals = {};
    const semesterTotals = {};
    const studentAnalysis = [];
    
    let grandEligible = 0;
    let grandNotEligible = 0;
    let grandTotal = 0;

    for (const sem of semesters) {
      matrix[sem] = {};
      semesterTotals[sem] = { total: 0, eligible: 0, notEligible: 0 };
    }
    
    for (const prog of programs) {
      programTotals[prog] = { total: 0, eligible: 0, notEligible: 0 };
    }

    for (const sem of semesters) {
      for (const prog of programs) {
        matrix[sem][prog] = { total: 0, eligible: 0, notEligible: 0 };
      }
    }

    const students = await prisma.examStudentData.findMany({
      where: {
        examId,
        semester: { in: semesters },
        program: { in: programs },
      },
      select: {
        enrollmentNumber: true,
        studentName: true,
        semester: true,
        program: true,
        attendancePercent: true,
        feesStatus: true,
      },
      orderBy: { enrollmentNumber: 'asc' }
    });

    for (const s of students) {
      const sem = s.semester;
      const prog = s.program;
      if (!matrix[sem] || !matrix[sem][prog]) continue;

      const meetsAttendance = (s.attendancePercent || 0) >= minAttendancePercent;
      const meetsFees = feesRequired === 'Any' || s.feesStatus === 'Paid';

      let isEligible = true;
      let reasons = [];
      if (!meetsAttendance) {
        isEligible = false;
        reasons.push('Attendance below required percentage');
      }
      if (!meetsFees) {
        isEligible = false;
        reasons.push('Fees status is not Paid');
      }

      if (isEligible) {
        matrix[sem][prog].eligible++;
        semesterTotals[sem].eligible++;
        programTotals[prog].eligible++;
        grandEligible++;
      } else {
        matrix[sem][prog].notEligible++;
        semesterTotals[sem].notEligible++;
        programTotals[prog].notEligible++;
        grandNotEligible++;
      }

      matrix[sem][prog].total++;
      semesterTotals[sem].total++;
      programTotals[prog].total++;
      grandTotal++;

      studentAnalysis.push({
        enrollmentNumber: s.enrollmentNumber,
        name: s.studentName,
        semester: s.semester,
        program: s.program,
        attendance: s.attendancePercent || 0,
        fees: s.feesStatus || 'Unknown',
        result: isEligible ? 'Eligible' : 'Not Eligible',
        reason: isEligible ? '' : reasons.join(' + ')
      });
    }

    res.json({
      message: 'Analysis complete. This is preview only — no data has been changed.',
      criteria: { minAttendancePercent, feesRequired },
      matrix,
      semesterTotals,
      programTotals,
      grand: { eligible: grandEligible, notEligible: grandNotEligible, total: grandTotal },
      studentAnalysis
    });
  } catch (error) {
    console.error('[Eligibility] Analysis error:', error.message);
    res.status(500).json({ error: 'Failed to analyze eligibility.' });
  }
});

// ──────────────────────────────────────────────
// APPLY ELIGIBILITY (batch update)
// ──────────────────────────────────────────────

router.post('/apply/:examId', requireAdmin, validate(eligibilityAnalysisSchema), async (req, res) => {
  try {
    const { examId } = req.params;
    const { semesters, programs, minAttendancePercent, feesRequired } = req.validatedBody;

    let updated = 0;

    await prisma.$transaction(async (tx) => {
      // 1. Increment Eligibility Version and invalidate block reports
      await tx.exam.update({
        where: { id: examId },
        data: { eligibilityVersion: { increment: 1 } },
      });

      await tx.blockReportGeneration.updateMany({
        where: { examId },
        data: { isOutdated: true },
      });

      // Also invalidate hall ticket generations
      await tx.hallTicketGeneration.updateMany({
        where: { examId },
        data: { isOutdated: true },
      });

      // 2. Fetch all matching students in ONE single query
      const students = await tx.examStudentData.findMany({
        where: {
          examId,
          semester: { in: semesters },
          program: { in: programs },
        },
        select: {
          enrollmentNumber: true,
          attendancePercent: true,
          feesStatus: true,
        },
      });

      if (students.length === 0) return;

      const enrollments = students.map(s => s.enrollmentNumber);

      // 3. Fetch existing profiles in ONE single query
      const profiles = await tx.studentProfile.findMany({
        where: { enrollmentNumber: { in: enrollments } },
        select: { id: true, enrollmentNumber: true },
      });
      const profileMap = new Map(profiles.map(p => [p.enrollmentNumber, p.id]));

      // 4. Fetch existing eligibility records in ONE single query
      const existingEligibilities = await tx.eligibility.findMany({
        where: { examId, enrollmentNumber: { in: enrollments } },
      });
      const existingMap = new Map(existingEligibilities.map(e => [e.enrollmentNumber, e]));

      // 5. Prepare upsert operations
      const operations = [];
      for (const student of students) {
        const meetsAttendance = (student.attendancePercent || 0) >= minAttendancePercent;
        const meetsFees = feesRequired === 'Any' || student.feesStatus === 'Paid';
        const calculatedStatus = meetsAttendance && meetsFees ? 'ELIGIBLE' : 'NOT_ELIGIBLE';

        const existing = existingMap.get(student.enrollmentNumber);
        const finalEligibility = existing?.adminOverride || calculatedStatus;
        const profileId = profileMap.get(student.enrollmentNumber) || null;

        operations.push(
          tx.eligibility.upsert({
            where: { examId_enrollmentNumber: { examId, enrollmentNumber: student.enrollmentNumber } },
            create: {
              examId,
              enrollmentNumber: student.enrollmentNumber,
              studentProfileId: profileId,
              calculatedEligibility: calculatedStatus,
              finalEligibility,
            },
            update: {
              calculatedEligibility: calculatedStatus,
              finalEligibility,
              ...(profileId ? { studentProfileId: profileId } : {}),
            },
          })
        );
      }

      // Execute in concurrent chunks of 50
      for (let i = 0; i < operations.length; i += 50) {
        await Promise.all(operations.slice(i, i + 50));
      }
      updated = operations.length;
    }, {
      maxWait: 15000,
      timeout: 60000,
    });

    // Invalidate cached tickets for this exam
    invalidateExamCache(examId);

    await logAudit({
      userId: req.session.userId,
      action: 'ELIGIBILITY_APPLIED',
      entity: 'Eligibility',
      entityId: examId,
      details: { semesters, programs, minAttendancePercent, feesRequired, updated },
      ipAddress: req.ip,
    });

    res.json({
      message: `Eligibility applied to ${updated} students. Older Block Reports & Hall Tickets marked outdated.`,
      updated,
    });
  } catch (error) {
    console.error('[Eligibility] Apply error:', error.message);
    res.status(500).json({ error: error.message ? `Failed to apply eligibility: ${error.message}` : 'Failed to apply eligibility.' });
  }
});

// ──────────────────────────────────────────────
// ADMIN OVERRIDE (single student)
// ──────────────────────────────────────────────

router.put('/override/:examId/:enrollmentNumber', requireAdmin, validate(eligibilityOverrideSchema), async (req, res) => {
  try {
    const { examId, enrollmentNumber } = req.params;
    const { override, reason } = req.validatedBody;

    const eligibility = await prisma.eligibility.findUnique({
      where: { examId_enrollmentNumber: { examId, enrollmentNumber } },
    });

    if (!eligibility) {
      return res.status(404).json({ error: 'Eligibility record not found. Apply eligibility first.' });
    }

    let updated;
    await prisma.$transaction(async (tx) => {
      // 1. Increment Eligibility Version and invalidate block reports
      await tx.exam.update({
        where: { id: examId },
        data: { eligibilityVersion: { increment: 1 } },
      });

      await tx.blockReportGeneration.updateMany({
        where: { examId },
        data: { isOutdated: true },
      });

      // Also invalidate hall ticket generations
      await tx.hallTicketGeneration.updateMany({
        where: { examId },
        data: { isOutdated: true },
      });

      updated = await tx.eligibility.update({
        where: { examId_enrollmentNumber: { examId, enrollmentNumber } },
        data: {
          adminOverride: override,
          overrideReason: reason || null,
          finalEligibility: override, // Override takes precedence
        },
      });
    });

    // Invalidate cached ticket for this student
    invalidateStudentCache(examId, enrollmentNumber);

    await logAudit({
      userId: req.session.userId,
      action: 'ELIGIBILITY_OVERRIDE',
      entity: 'Eligibility',
      entityId: eligibility.id,
      details: { enrollmentNumber, override, reason },
      ipAddress: req.ip,
    });

    res.json({ message: 'Override applied. Older Block Reports & Hall Tickets marked outdated.', eligibility: updated });
  } catch (error) {
    console.error('[Eligibility] Override error:', error.message);
    res.status(500).json({ error: 'Failed to apply override.' });
  }
});

// ──────────────────────────────────────────────
// REMOVE OVERRIDE (revert to calculated)
// ──────────────────────────────────────────────

router.delete('/override/:examId/:enrollmentNumber', requireAdmin, async (req, res) => {
  try {
    const { examId, enrollmentNumber } = req.params;

    const eligibility = await prisma.eligibility.findUnique({
      where: { examId_enrollmentNumber: { examId, enrollmentNumber } },
    });

    if (!eligibility) return res.status(404).json({ error: 'Eligibility record not found.' });

    let updated;
    await prisma.$transaction(async (tx) => {
      // 1. Increment Eligibility Version and invalidate block reports
      await tx.exam.update({
        where: { id: examId },
        data: { eligibilityVersion: { increment: 1 } },
      });

      await tx.blockReportGeneration.updateMany({
        where: { examId },
        data: { isOutdated: true },
      });

      // Also invalidate hall ticket generations
      await tx.hallTicketGeneration.updateMany({
        where: { examId },
        data: { isOutdated: true },
      });

      updated = await tx.eligibility.update({
        where: { examId_enrollmentNumber: { examId, enrollmentNumber } },
        data: {
          adminOverride: null,
          overrideReason: null,
          finalEligibility: eligibility.calculatedEligibility,
        },
      });
    });

    // Invalidate cached ticket for this student
    invalidateStudentCache(examId, enrollmentNumber);

    await logAudit({
      userId: req.session.userId,
      action: 'ELIGIBILITY_OVERRIDE_REMOVED',
      entity: 'Eligibility',
      entityId: eligibility.id,
      details: { enrollmentNumber },
      ipAddress: req.ip,
    });

    res.json({ message: 'Override removed. Reverted to calculated eligibility. Older Block Reports & Hall Tickets marked outdated.', eligibility: updated });
  } catch (error) {
    console.error('[Eligibility] Remove override error:', error.message);
    res.status(500).json({ error: 'Failed to remove override.' });
  }
});

// ──────────────────────────────────────────────
// LIST ELIGIBILITY (with filters)
// ──────────────────────────────────────────────

router.get('/:examId', requireAdmin, async (req, res) => {
  try {
    const { examId } = req.params;
    const { page = 1, limit = 50, status, search, semester, program } = req.query;

    const where = { examId };
    if (status) where.finalEligibility = status;
    if (search) {
      where.enrollmentNumber = { contains: search, mode: 'insensitive' };
    }

    // Join with exam data for semester/program filter
    let enrollmentFilter;
    if (semester || program) {
      const dataWhere = { examId };
      if (semester) dataWhere.semester = parseInt(semester);
      if (program) dataWhere.program = program;
      const filtered = await prisma.examStudentData.findMany({
        where: dataWhere,
        select: { enrollmentNumber: true },
      });
      enrollmentFilter = filtered.map(f => f.enrollmentNumber);
      where.enrollmentNumber = { in: enrollmentFilter };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [eligibilities, total] = await Promise.all([
      prisma.eligibility.findMany({
        where,
        orderBy: { enrollmentNumber: 'asc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.eligibility.count({ where }),
    ]);

    // Enrich with student data
    const enrollments = eligibilities.map(e => e.enrollmentNumber);
    const studentData = await prisma.examStudentData.findMany({
      where: { examId, enrollmentNumber: { in: enrollments } },
      select: {
        enrollmentNumber: true,
        studentName: true,
        semester: true,
        program: true,
        division: true,
        attendancePercent: true,
        feesStatus: true,
      },
    });
    const studentMap = new Map(studentData.map(s => [s.enrollmentNumber, s]));

    const enriched = eligibilities.map(e => ({
      ...e,
      student: studentMap.get(e.enrollmentNumber) || null,
    }));

    res.json({
      eligibilities: enriched,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('[Eligibility] List error:', error.message);
    res.status(500).json({ error: 'Failed to load eligibility data.' });
  }
});

module.exports = router;
