const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { excelUpload, handleMulterError } = require('../middleware/fileUpload');
const { generateSampleExcel, parseAndValidateExcel, commitExcelData } = require('../services/excel.service');
const { logAudit } = require('../services/audit.service');

// ──────────────────────────────────────────────
// DOWNLOAD SAMPLE EXCEL
// ──────────────────────────────────────────────

router.get('/template/:examId', requireAdmin, async (req, res) => {
  try {
    const workbook = await generateSampleExcel(req.params.examId);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sample_exam_data.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('[Excel] Sample download error:', error.message);
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
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
      }

      const { examId } = req.params;

      // Verify exam exists
      const exam = await prisma.exam.findUnique({ where: { id: examId } });
      if (!exam) return res.status(404).json({ error: 'Exam not found.' });

      // Parse and validate
      const result = await parseAndValidateExcel(req.file.buffer, examId);

      if (!result.valid && result.errors.length > 0 && !result.data) {
        return res.status(400).json({
          error: 'Excel validation failed.',
          errors: result.errors,
        });
      }

      // Store parsed data in session for confirmation step
      req.session.pendingUpload = {
        examId,
        data: result.data,
        summary: result.summary,
        timestamp: Date.now(),
      };
      req.session.save();

      res.json({
        message: 'Excel parsed successfully. Review and confirm upload.',
        summary: result.summary,
        dateColumns: result.dateColumns,
        errors: result.errors,
      });
    } catch (error) {
      console.error('[Excel] Upload error:', error.message);
      res.status(500).json({ error: 'Failed to process Excel file.' });
    }
  }
);

// ──────────────────────────────────────────────
// CONFIRM UPLOAD (commit to database)
// ──────────────────────────────────────────────

router.post('/confirm/:examId', requireAdmin, async (req, res) => {
  try {
    const { examId } = req.params;

    // Retrieve pending upload from session
    const pending = req.session.pendingUpload;
    if (!pending || pending.examId !== examId) {
      return res.status(400).json({ error: 'No pending upload found. Please upload again.' });
    }

    // Check if data is stale (older than 30 minutes)
    if (Date.now() - pending.timestamp > 30 * 60 * 1000) {
      delete req.session.pendingUpload;
      req.session.save();
      return res.status(400).json({ error: 'Upload data expired. Please upload again.' });
    }

    // Commit data with full transaction
    const result = await commitExcelData(examId, pending.data, req.session.userId);

    // Clear pending upload
    delete req.session.pendingUpload;
    req.session.save();

    await logAudit({
      userId: req.session.userId,
      action: 'EXCEL_UPLOADED',
      entity: 'ExamStudentData',
      entityId: examId,
      details: {
        created: result.created,
        updated: result.updated,
      },
      ipAddress: req.ip,
    });

    res.json({
      message: 'Data uploaded successfully.',
      created: result.created,
      updated: result.updated,
    });
  } catch (error) {
    console.error('[Excel] Confirm error:', error.message);
    res.status(500).json({
      error: 'Upload failed. All changes have been rolled back.',
    });
  }
});

// ──────────────────────────────────────────────
// CANCEL PENDING UPLOAD
// ──────────────────────────────────────────────

router.post('/cancel', requireAdmin, (req, res) => {
  delete req.session.pendingUpload;
  req.session.save();
  res.json({ message: 'Upload cancelled.' });
});

module.exports = router;
