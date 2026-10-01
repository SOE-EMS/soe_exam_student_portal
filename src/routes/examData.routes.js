const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../services/audit.service');

// ──────────────────────────────────────────────
// GET FILTERS FOR EXAM
// ──────────────────────────────────────────────

router.get('/:examId/filters', requireAdmin, async (req, res) => {
  try {
    const { examId } = req.params;
    
    const [programs, divisions, semesters] = await Promise.all([
      prisma.examStudentData.findMany({
        where: { examId },
        distinct: ['program'],
        select: { program: true },
      }),
      prisma.examStudentData.findMany({
        where: { examId },
        distinct: ['division'],
        select: { division: true },
      }),
      prisma.examStudentData.findMany({
        where: { examId },
        distinct: ['semester'],
        select: { semester: true },
        orderBy: { semester: 'asc' },
      }),
    ]);

    res.json({
      programs: programs.map(p => p.program).filter(Boolean),
      divisions: divisions.map(d => d.division).filter(Boolean),
      semesters: semesters.map(s => s.semester),
    });
  } catch (error) {
    console.error('[ExamData] Filters error:', error.message);
    res.status(500).json({ error: 'Failed to load filters.' });
  }
});

// ──────────────────────────────────────────────
// LIST EXAM DATA (paginated, filtered, sortable)
// ──────────────────────────────────────────────

router.get('/:examId', requireAdmin, async (req, res) => {
  try {
    const { examId } = req.params;
    const {
      page = 1,
      limit = 25,
      search,
      semester,
      program,
      division,
      feesStatus,
      sortBy = 'enrollmentNumber',
      sortOrder = 'asc',
    } = req.query;

    const where = { examId };

    if (search) {
      where.OR = [
        { enrollmentNumber: { contains: search, mode: 'insensitive' } },
        { studentName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (semester) where.semester = parseInt(semester);
    if (program) where.program = program;
    if (division) where.division = division;
    if (feesStatus) where.feesStatus = feesStatus;

    const validSortFields = ['enrollmentNumber', 'studentName', 'semester', 'program', 'division', 'attendancePercent', 'feesStatus', 'studentEmailId', 'createdAt'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'enrollmentNumber';
    const orderDir = sortOrder === 'desc' ? 'desc' : 'asc';

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [data, total] = await Promise.all([
      prisma.examStudentData.findMany({
        where,
        include: {
          subjects: {
            include: { examSchedule: true },
          },
        },
        orderBy: { [orderField]: orderDir },
        skip,
        take,
      }),
      prisma.examStudentData.count({ where }),
    ]);

    // Attach eligibility records for the fetched page
    const enrollments = data.map(d => d.enrollmentNumber);
    const eligibilities = await prisma.eligibility.findMany({
      where: {
        examId,
        enrollmentNumber: { in: enrollments }
      }
    });
    const eligMap = {};
    for (const e of eligibilities) eligMap[e.enrollmentNumber] = e;

    data.forEach(d => {
      d.eligibility = eligMap[d.enrollmentNumber] || null;
    });

    // Get distinct filter values for the exam
    const [programs, divisions, semesters] = await Promise.all([
      prisma.examStudentData.findMany({
        where: { examId },
        distinct: ['program'],
        select: { program: true },
      }),
      prisma.examStudentData.findMany({
        where: { examId },
        distinct: ['division'],
        select: { division: true },
      }),
      prisma.examStudentData.findMany({
        where: { examId },
        distinct: ['semester'],
        select: { semester: true },
        orderBy: { semester: 'asc' },
      }),
    ]);

    res.json({
      data,
      filters: {
        programs: programs.map(p => p.program).filter(Boolean),
        divisions: divisions.map(d => d.division).filter(Boolean),
        semesters: semesters.map(s => s.semester),
      },
      pagination: {
        page: parseInt(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error('[ExamData] List error:', error.message);
    res.status(500).json({ error: 'Failed to load exam data.' });
  }
});

// ──────────────────────────────────────────────
// UPDATE SINGLE RECORD (inline edit)
// ──────────────────────────────────────────────

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { studentName, program, semester, division, attendancePercent, feesStatus, studentEmailId } = req.body;

    const updateData = {};
    if (studentName !== undefined) updateData.studentName = studentName;
    if (program !== undefined) updateData.program = program;
    if (semester !== undefined) updateData.semester = parseInt(semester);
    if (division !== undefined) updateData.division = division;
    if (attendancePercent !== undefined) updateData.attendancePercent = parseFloat(attendancePercent);
    if (feesStatus !== undefined) updateData.feesStatus = feesStatus;
    if (studentEmailId !== undefined) {
      if (studentEmailId && studentEmailId.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        if (!emailRegex.test(studentEmailId.trim())) {
          return res.status(400).json({ error: 'Invalid Student Email ID format.' });
        }
        updateData.studentEmailId = studentEmailId.trim();
      } else {
        updateData.studentEmailId = null;
      }
    }

    let updatedStudent;

    await prisma.$transaction(async (tx) => {
      // 1. Update Student Data
      updatedStudent = await tx.examStudentData.update({
        where: { id },
        data: updateData,
      });

      // SYNC TO PROFILE IF EXISTS
      const profileUpdateData = {};
      if (updateData.studentName !== undefined) profileUpdateData.name = updateData.studentName;
      if (updateData.program !== undefined) profileUpdateData.program = updateData.program;
      if (updateData.semester !== undefined) profileUpdateData.semester = updateData.semester;
      if (updateData.division !== undefined) profileUpdateData.division = updateData.division;

      if (Object.keys(profileUpdateData).length > 0 || updateData.studentEmailId !== undefined) {
        const existingProfile = await tx.studentProfile.findUnique({
          where: { enrollmentNumber: updatedStudent.enrollmentNumber }
        });

        if (existingProfile) {
          if (Object.keys(profileUpdateData).length > 0) {
            await tx.studentProfile.update({
              where: { id: existingProfile.id },
              data: profileUpdateData
            });
          }

          if (updateData.studentEmailId !== undefined) {
            await tx.user.update({
              where: { id: existingProfile.userId },
              data: { email: updateData.studentEmailId }
            });
          }
        }
      }

      // 2. Fetch Criteria
      const criteria = await tx.eligibilityCriteria.findUnique({
        where: { examId: updatedStudent.examId }
      });

      // 3. Recalculate Eligibility if criteria exists
      if (criteria) {
        const meetsAttendance = (updatedStudent.attendancePercent || 0) >= criteria.minAttendancePercent;
        const meetsFees = criteria.feesRequired === 'Any' || updatedStudent.feesStatus === 'Paid';
        const calculatedStatus = meetsAttendance && meetsFees ? 'ELIGIBLE' : 'NOT_ELIGIBLE';

        const existingElig = await tx.eligibility.findUnique({
          where: { examId_enrollmentNumber: { examId: updatedStudent.examId, enrollmentNumber: updatedStudent.enrollmentNumber } }
        });

        const finalEligibility = existingElig?.adminOverride || calculatedStatus;

        await tx.eligibility.upsert({
          where: { examId_enrollmentNumber: { examId: updatedStudent.examId, enrollmentNumber: updatedStudent.enrollmentNumber } },
          create: {
            examId: updatedStudent.examId,
            enrollmentNumber: updatedStudent.enrollmentNumber,
            calculatedEligibility: calculatedStatus,
            finalEligibility,
          },
          update: {
            calculatedEligibility: calculatedStatus,
            finalEligibility,
          }
        });

        // 4. Invalidate Downstream Outputs (Block Reports)
        await tx.exam.update({
          where: { id: updatedStudent.examId },
          data: { eligibilityVersion: { increment: 1 } },
        });

        await tx.blockReportGeneration.updateMany({
          where: { examId: updatedStudent.examId },
          data: { isOutdated: true },
        });

        // Also invalidate hall ticket generations
        await tx.hallTicketGeneration.updateMany({
          where: { examId: updatedStudent.examId },
          data: { isOutdated: true },
        });
      }
    });

    await logAudit({
      userId: req.session.userId,
      action: 'EXAM_DATA_EDITED',
      entity: 'ExamStudentData',
      entityId: id,
      details: { enrollmentNumber: updatedStudent.enrollmentNumber, changes: updateData },
      ipAddress: req.ip,
    });

    res.json({ message: 'Record updated, eligibility recalculated, and reports marked outdated.', data: updatedStudent });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Record not found.' });
    console.error('[ExamData] Update error:', error.message);
    res.status(500).json({ error: 'Failed to update record.' });
  }
});

// ──────────────────────────────────────────────
// DELETE SINGLE RECORD
// ──────────────────────────────────────────────

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const record = await prisma.examStudentData.findUnique({ where: { id } });
    if (!record) return res.status(404).json({ error: 'Record not found.' });

    await prisma.examStudentData.delete({ where: { id } });

    await logAudit({
      userId: req.session.userId,
      action: 'EXAM_DATA_DELETED',
      entity: 'ExamStudentData',
      entityId: id,
      details: { enrollmentNumber: record.enrollmentNumber },
      ipAddress: req.ip,
    });

    res.json({ message: 'Record deleted.' });
  } catch (error) {
    console.error('[ExamData] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete record.' });
  }
});

module.exports = router;
