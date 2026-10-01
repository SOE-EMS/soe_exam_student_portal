const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { validate, examSchema } = require('../middleware/validation');
const { logAudit } = require('../services/audit.service');

// ──────────────────────────────────────────────
// CREATE EXAM (within Academic Year)
// ──────────────────────────────────────────────

router.post('/', requireAdmin, validate(examSchema), async (req, res) => {
  try {
    const { name, academicYearId, semesters } = req.validatedBody;

    // Verify academic year exists
    const ay = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
    if (!ay) return res.status(404).json({ error: 'Academic year not found.' });

    const exam = await prisma.$transaction(async (tx) => {
      const newExam = await tx.exam.create({
        data: {
          name,
          academicYearId,
          isActive: true,
        },
      });

      // Create semester associations
      await tx.examSemester.createMany({
        data: semesters.map(sem => ({
          examId: newExam.id,
          semester: sem,
        })),
      });

      return newExam;
    });

    const created = await prisma.exam.findUnique({
      where: { id: exam.id },
      include: {
        academicYear: true,
        semesters: true,
      },
    });

    await logAudit({
      userId: req.session.userId,
      action: 'EXAM_CREATED',
      entity: 'Exam',
      entityId: exam.id,
      details: { name, academicYearId, semesters },
      ipAddress: req.ip,
    });

    res.status(201).json({ message: 'Exam created.', exam: created });
  } catch (error) {
    console.error('[Exam] Create error:', error.message);
    res.status(500).json({ error: 'Failed to create exam.' });
  }
});

// ──────────────────────────────────────────────
// LIST EXAMS (optionally filter by academic year)
// ──────────────────────────────────────────────

router.get('/', requireAdmin, async (req, res) => {
  try {
    const { academicYearId } = req.query;
    const where = {};
    if (academicYearId) where.academicYearId = academicYearId;

    const exams = await prisma.exam.findMany({
      where,
      include: {
        academicYear: true,
        semesters: { orderBy: { semester: 'asc' } },
        _count: {
          select: {
            studentData: true,
            seatingArrangements: true,
            eligibilities: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ exams });
  } catch (error) {
    console.error('[Exam] List error:', error.message);
    res.status(500).json({ error: 'Failed to load exams.' });
  }
});

// ──────────────────────────────────────────────
// GET SINGLE EXAM
// ──────────────────────────────────────────────

router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id },
      include: {
        academicYear: true,
        semesters: { orderBy: { semester: 'asc' } },
        _count: {
          select: {
            studentData: true,
            schedules: true,
            seatingArrangements: true,
            eligibilities: true,
          },
        },
      },
    });

    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    res.json({ exam });
  } catch (error) {
    console.error('[Exam] Get error:', error.message);
    res.status(500).json({ error: 'Failed to load exam.' });
  }
});

// ──────────────────────────────────────────────
// UPDATE EXAM
// ──────────────────────────────────────────────

router.put('/:id', requireAdmin, validate(examSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, academicYearId, semesters } = req.validatedBody;

    const exam = await prisma.$transaction(async (tx) => {
      const updated = await tx.exam.update({
        where: { id },
        data: { name, academicYearId },
      });

      // Replace semesters
      await tx.examSemester.deleteMany({ where: { examId: id } });
      await tx.examSemester.createMany({
        data: semesters.map(sem => ({ examId: id, semester: sem })),
      });

      return updated;
    });

    const result = await prisma.exam.findUnique({
      where: { id },
      include: { academicYear: true, semesters: true },
    });

    await logAudit({
      userId: req.session.userId,
      action: 'EXAM_UPDATED',
      entity: 'Exam',
      entityId: id,
      details: { name, semesters },
      ipAddress: req.ip,
    });

    res.json({ message: 'Exam updated.', exam: result });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Exam not found.' });
    console.error('[Exam] Update error:', error.message);
    res.status(500).json({ error: 'Failed to update exam.' });
  }
});

// ──────────────────────────────────────────────
// TOGGLE EXAM ACTIVE
// ──────────────────────────────────────────────

router.patch('/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const current = await prisma.exam.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Exam not found.' });

    const updated = await prisma.exam.update({
      where: { id },
      data: { isActive: !current.isActive },
    });

    await logAudit({
      userId: req.session.userId,
      action: current.isActive ? 'EXAM_DEACTIVATED' : 'EXAM_ACTIVATED',
      entity: 'Exam',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json({ message: `Exam ${updated.isActive ? 'activated' : 'deactivated'}.`, exam: updated });
  } catch (error) {
    console.error('[Exam] Toggle error:', error.message);
    res.status(500).json({ error: 'Failed to toggle exam.' });
  }
});

// ──────────────────────────────────────────────
// DELETE EXAM
// ──────────────────────────────────────────────

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.exam.delete({ where: { id } });

    await logAudit({
      userId: req.session.userId,
      action: 'EXAM_DELETED',
      entity: 'Exam',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json({ message: 'Exam deleted.' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Exam not found.' });
    console.error('[Exam] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete exam.' });
  }
});

module.exports = router;
