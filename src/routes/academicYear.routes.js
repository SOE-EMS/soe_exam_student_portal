const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { validate, academicYearSchema } = require('../middleware/validation');
const { logAudit } = require('../services/audit.service');

// ──────────────────────────────────────────────
// CREATE ACADEMIC YEAR
// ──────────────────────────────────────────────

router.post('/', requireAdmin, validate(academicYearSchema), async (req, res) => {
  try {
    const { name, startYear, endYear, type } = req.validatedBody;

    const existing = await prisma.academicYear.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({ error: 'Academic year with this name already exists.' });
    }

    const academicYear = await prisma.academicYear.create({
      data: { name, startYear, endYear, type, isActive: true },
    });

    await logAudit({
      userId: req.session.userId,
      action: 'ACADEMIC_YEAR_CREATED',
      entity: 'AcademicYear',
      entityId: academicYear.id,
      details: { name, startYear, endYear, type },
      ipAddress: req.ip,
    });

    res.status(201).json({ message: 'Academic year created.', academicYear });
  } catch (error) {
    console.error('[AY] Create error:', error.message);
    res.status(500).json({ error: 'Failed to create academic year.' });
  }
});

// ──────────────────────────────────────────────
// LIST ACADEMIC YEARS
// ──────────────────────────────────────────────

router.get('/', requireAdmin, async (req, res) => {
  try {
    const academicYears = await prisma.academicYear.findMany({
      orderBy: [{ startYear: 'desc' }, { type: 'asc' }],
      include: { _count: { select: { exams: true } } },
    });
    res.json({ academicYears });
  } catch (error) {
    console.error('[AY] List error:', error.message);
    res.status(500).json({ error: 'Failed to load academic years.' });
  }
});

// ──────────────────────────────────────────────
// UPDATE ACADEMIC YEAR
// ──────────────────────────────────────────────

router.put('/:id', requireAdmin, validate(academicYearSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, startYear, endYear, type } = req.validatedBody;

    const academicYear = await prisma.academicYear.update({
      where: { id },
      data: { name, startYear, endYear, type },
    });

    await logAudit({
      userId: req.session.userId,
      action: 'ACADEMIC_YEAR_UPDATED',
      entity: 'AcademicYear',
      entityId: id,
      details: { name, startYear, endYear, type },
      ipAddress: req.ip,
    });

    res.json({ message: 'Academic year updated.', academicYear });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Academic year not found.' });
    console.error('[AY] Update error:', error.message);
    res.status(500).json({ error: 'Failed to update academic year.' });
  }
});

// ──────────────────────────────────────────────
// TOGGLE ACTIVE STATUS
// ──────────────────────────────────────────────

router.patch('/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const current = await prisma.academicYear.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Academic year not found.' });

    const updated = await prisma.academicYear.update({
      where: { id },
      data: { isActive: !current.isActive },
    });

    await logAudit({
      userId: req.session.userId,
      action: current.isActive ? 'ACADEMIC_YEAR_DEACTIVATED' : 'ACADEMIC_YEAR_ACTIVATED',
      entity: 'AcademicYear',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json({ message: `Academic year ${updated.isActive ? 'activated' : 'deactivated'}.`, academicYear: updated });
  } catch (error) {
    console.error('[AY] Toggle error:', error.message);
    res.status(500).json({ error: 'Failed to toggle status.' });
  }
});

// ──────────────────────────────────────────────
// DELETE ACADEMIC YEAR
// ──────────────────────────────────────────────

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.academicYear.delete({ where: { id } });

    await logAudit({
      userId: req.session.userId,
      action: 'ACADEMIC_YEAR_DELETED',
      entity: 'AcademicYear',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json({ message: 'Academic year deleted.' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Academic year not found.' });
    console.error('[AY] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete academic year.' });
  }
});

module.exports = router;
