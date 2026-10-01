const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { excelUpload, handleMulterError } = require('../middleware/fileUpload');
const { logAudit } = require('../services/audit.service');
const { generateSeatingSampleExcel, parseAndValidateSeatingExcel, commitSeatingData, generateSeatingExportExcel } = require('../services/seating.service');

// ──────────────────────────────────────────────
// DOWNLOAD SAMPLE EXCEL
// ──────────────────────────────────────────────

router.get('/sample', requireAdmin, async (req, res) => {
  try {
    const workbook = await generateSeatingSampleExcel();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Seating_Arrangement_Sample.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('[Seating] Sample download error:', error.message);
    res.status(500).json({ error: 'Failed to generate sample Excel.' });
  }
});

// ──────────────────────────────────────────────
// UPLOAD & VALIDATE EXCEL (preview before commit)
// ──────────────────────────────────────────────

router.post(
  '/upload/:examId',
  requireAdmin,
  excelUpload.single('file'),
  handleMulterError,
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

      const { examId } = req.params;
      const exam = await prisma.exam.findUnique({ where: { id: examId } });
      if (!exam) return res.status(404).json({ error: 'Exam not found.' });

      const result = await parseAndValidateSeatingExcel(req.file.buffer, examId);

      if (!result.valid && result.errors.length > 0 && !result.data) {
        return res.status(400).json({
          error: 'Seating validation failed.',
          errors: result.errors,
        });
      }

      req.session.pendingSeatingUpload = {
        examId,
        data: result.data,
        summary: result.summary,
        timestamp: Date.now(),
      };
      req.session.save();

      res.json({
        message: 'Excel parsed successfully. Review and confirm upload.',
        summary: result.summary,
        errors: result.errors,
        sampleData: result.data.slice(0, 5), // Send first 5 rows for preview table
        sessionId: req.sessionID
      });
    } catch (error) {
      console.error('[Seating] Upload error:', error.message);
      res.status(500).json({ error: 'Failed to upload seating arrangement.' });
    }
  }
);

// ──────────────────────────────────────────────
// CONFIRM UPLOAD (commit to database)
// ──────────────────────────────────────────────

router.post('/confirm/:examId', requireAdmin, async (req, res) => {
  try {
    const { examId } = req.params;
    const pending = req.session.pendingSeatingUpload;

    if (!pending || pending.examId !== examId) {
      return res.status(400).json({ error: 'No pending upload found. Please upload again.' });
    }
    if (Date.now() - pending.timestamp > 30 * 60 * 1000) {
      delete req.session.pendingSeatingUpload;
      req.session.save();
      return res.status(400).json({ error: 'Upload data expired. Please upload again.' });
    }

    const result = await commitSeatingData(examId, pending.data, req.session.userId);

    delete req.session.pendingSeatingUpload;
    req.session.save();

    await logAudit({
      userId: req.session.userId,
      action: 'SEATING_UPLOADED',
      entity: 'SeatingArrangement',
      entityId: examId,
      details: { blocks: result.blocks },
      ipAddress: req.ip,
    });

    res.json({
      message: 'Seating arrangement uploaded successfully.',
      blocks: result.blocks,
    });
  } catch (error) {
    console.error('[Seating] Confirm error:', error.message);
    res.status(500).json({
      error: 'Upload failed. All changes have been rolled back.',
    });
  }
});

router.post('/cancel', requireAdmin, (req, res) => {
  delete req.session.pendingSeatingUpload;
  req.session.save();
  res.json({ message: 'Upload cancelled.' });
});

// ──────────────────────────────────────────────
// EXPORT SEATING ARRANGEMENT AS EXCEL
// ──────────────────────────────────────────────

router.get('/export/:examId', requireAdmin, async (req, res) => {
  try {
    const workbook = await generateSeatingExportExcel(req.params.examId);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Seating_Arrangement_Export.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('[Seating] Export error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to export seating arrangement.' });
  }
});

// ──────────────────────────────────────────────
// GET SEATING ARRANGEMENTS
// ──────────────────────────────────────────────

router.get('/:examId', requireAdmin, async (req, res) => {
  try {
    const arrangements = await prisma.seatingArrangement.findMany({
      where: { examId: req.params.examId },
      orderBy: { blockNumber: 'asc' },
    });

    // Get actual student counts per block
    const blockCounts = await prisma.blockAssignment.groupBy({
      by: ['blockNumber'],
      where: { examId: req.params.examId },
      _count: true,
    });

    const countMap = new Map(blockCounts.map(b => [b.blockNumber, b._count]));

    const result = arrangements.map(a => ({
      ...a,
      actualStudentCount: countMap.get(a.blockNumber) || 0,
    }));

    res.json({ arrangements: result });
  } catch (error) {
    console.error('[Seating] Get error:', error.message);
    res.status(500).json({ error: 'Failed to load seating arrangements.' });
  }
});

// ──────────────────────────────────────────────
// DELETE SEATING (reset)
// ──────────────────────────────────────────────

router.delete('/:examId', requireAdmin, async (req, res) => {
  try {
    const { examId } = req.params;

    await prisma.$transaction(async (tx) => {
      await tx.blockAssignment.deleteMany({ where: { examId } });
      await tx.seatingArrangement.deleteMany({ where: { examId } });
    });

    await logAudit({
      userId: req.session.userId,
      action: 'SEATING_DELETED',
      entity: 'SeatingArrangement',
      entityId: examId,
      ipAddress: req.ip,
    });

    res.json({ message: 'Seating arrangement deleted.' });
  } catch (error) {
    console.error('[Seating] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete seating.' });
  }
});


module.exports = router;
