const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Helper to construct WHERE clause and parameters for raw SQL
function buildWhereClause(query) {
  let where = 'WHERE esd."examId" = ?';
  const params = [query.examId];

  if (query.semester) {
    where += ' AND esd.semester = ?';
    params.push(parseInt(query.semester));
  }
  if (query.program) {
    where += ' AND esd.program = ?';
    params.push(query.program);
  }
  if (query.division) {
    where += ' AND esd.division = ?';
    params.push(query.division);
  }
  if (query.status) {
    if (query.status === 'ELIGIBLE') {
      where += ' AND e."finalEligibility" = \'ELIGIBLE\'';
    } else if (query.status === 'NOT_ELIGIBLE') {
      where += ' AND e."finalEligibility" = \'NOT_ELIGIBLE\'';
    }
  }

  // Search
  if (query.search) {
    where += ' AND (esd."enrollmentNumber" LIKE ? OR esd."studentName" LIKE ?)';
    params.push(`%${query.search}%`);
    params.push(`%${query.search}%`);
  }

  return { where, params };
}

// ──────────────────────────────────────────────
// SUMMARY CARDS
// ──────────────────────────────────────────────
router.get('/summary', requireAdmin, async (req, res) => {
  try {
    const { examId } = req.query;
    if (!examId) return res.status(400).json({ error: 'Exam ID required' });

    const { where, params } = buildWhereClause(req.query);

    const sql = `
      SELECT 
        COUNT(esd.id) as total,
        SUM(CASE WHEN e."finalEligibility" = 'ELIGIBLE' THEN 1 ELSE 0 END) as eligible,
        SUM(CASE WHEN e."finalEligibility" = 'NOT_ELIGIBLE' THEN 1 ELSE 0 END) as notEligible
      FROM "ExamStudentData" esd
      LEFT JOIN "Eligibility" e ON e."examId" = esd."examId" AND e."enrollmentNumber" = esd."enrollmentNumber"
      ${where}
    `;

    const result = await prisma.$queryRawUnsafe(sql, ...params);
    
    let total = Number(result[0].total || 0);
    let eligible = Number(result[0].eligible || 0);
    let notEligible = Number(result[0].notEligible || 0);
    let percentage = total > 0 ? ((eligible / total) * 100).toFixed(2) : 0;

    res.json({ total, eligible, notEligible, percentage });
  } catch (error) {
    console.error('[EligibleAnalysis] Summary error:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ──────────────────────────────────────────────
// GROUPED ANALYSIS (Semester / Program / Division)
// ──────────────────────────────────────────────
router.get('/group-by/:type', requireAdmin, async (req, res) => {
  try {
    const { examId } = req.query;
    const { type } = req.params;
    if (!examId) return res.status(400).json({ error: 'Exam ID required' });

    const { where, params } = buildWhereClause(req.query);

    let groupByField = '';
    let selectFields = '';

    if (type === 'semester') {
      groupByField = 'esd.semester';
      selectFields = 'esd.semester';
    } else if (type === 'program') {
      groupByField = 'esd.program';
      selectFields = 'esd.program';
    } else if (type === 'division') {
      groupByField = 'esd.division, esd.semester, esd.program';
      selectFields = 'esd.division, esd.semester, esd.program';
    } else {
      return res.status(400).json({ error: 'Invalid group type' });
    }

    const sql = `
      SELECT 
        ${selectFields},
        COUNT(esd.id) as total,
        SUM(CASE WHEN e."finalEligibility" = 'ELIGIBLE' THEN 1 ELSE 0 END) as eligible,
        SUM(CASE WHEN e."finalEligibility" = 'NOT_ELIGIBLE' THEN 1 ELSE 0 END) as notEligible
      FROM "ExamStudentData" esd
      LEFT JOIN "Eligibility" e ON e."examId" = esd."examId" AND e."enrollmentNumber" = esd."enrollmentNumber"
      ${where}
      GROUP BY ${groupByField}
      ORDER BY ${type === 'semester' ? 'esd.semester' : groupByField} ASC
    `;

    const result = await prisma.$queryRawUnsafe(sql, ...params);

    const formatted = result.map(row => {
      const obj = {};
      for (const key in row) {
        obj[key] = typeof row[key] === 'bigint' ? Number(row[key]) : row[key];
      }
      return obj;
    });

    res.json(formatted);
  } catch (error) {
    console.error('[EligibleAnalysis] Grouping error:', error);
    res.status(500).json({ error: 'Failed to fetch grouped data' });
  }
});

// ──────────────────────────────────────────────
// STUDENT LEVEL DETAILS
// ──────────────────────────────────────────────
router.get('/students', requireAdmin, async (req, res) => {
  try {
    const { examId, page = 1, limit = 20 } = req.query;
    if (!examId) return res.status(400).json({ error: 'Exam ID required' });

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const { where, params } = buildWhereClause(req.query);

    const countSql = `
      SELECT COUNT(esd.id) as total
      FROM "ExamStudentData" esd
      LEFT JOIN "Eligibility" e ON e."examId" = esd."examId" AND e."enrollmentNumber" = esd."enrollmentNumber"
      ${where}
    `;
    const countResult = await prisma.$queryRawUnsafe(countSql, ...params);
    const total = Number(countResult[0].total || 0);

    const sql = `
      SELECT 
        esd."enrollmentNumber", esd."studentName", esd.program, esd.semester, esd.division, 
        esd."attendancePercent", esd."feesStatus",
        e."calculatedEligibility", e."adminOverride", e."finalEligibility"
      FROM "ExamStudentData" esd
      LEFT JOIN "Eligibility" e ON e."examId" = esd."examId" AND e."enrollmentNumber" = esd."enrollmentNumber"
      ${where}
      ORDER BY esd."enrollmentNumber" ASC
      LIMIT ? OFFSET ?
    `;
    const rows = await prisma.$queryRawUnsafe(sql, ...params, parseInt(limit), skip);

    res.json({
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[EligibleAnalysis] Students fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// ──────────────────────────────────────────────
// EXPORT EXCEL
// ──────────────────────────────────────────────
router.get('/export/excel', requireAdmin, async (req, res) => {
  try {
    const { examId, type } = req.query; 
    if (!examId) return res.status(400).json({ error: 'Exam ID required' });

    const { where, params } = buildWhereClause(req.query);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Eligibility Analysis');

    if (type === 'students') {
      worksheet.columns = [
        { header: 'Enrollment', key: 'enrollmentNumber', width: 20 },
        { header: 'Student Name', key: 'studentName', width: 30 },
        { header: 'Program', key: 'program', width: 15 },
        { header: 'Sem', key: 'semester', width: 10 },
        { header: 'Div', key: 'division', width: 10 },
        { header: 'Attendance %', key: 'attendancePercent', width: 15 },
        { header: 'Fees Status', key: 'feesStatus', width: 15 },
        { header: 'Calculated', key: 'calculatedEligibility', width: 15 },
        { header: 'Override', key: 'adminOverride', width: 15 },
        { header: 'Final Status', key: 'finalEligibility', width: 15 },
      ];

      const sql = `
        SELECT 
          esd."enrollmentNumber", esd."studentName", esd.program, esd.semester, esd.division, 
          esd."attendancePercent", esd."feesStatus",
          e."calculatedEligibility", e."adminOverride", e."finalEligibility"
        FROM "ExamStudentData" esd
        LEFT JOIN "Eligibility" e ON e."examId" = esd."examId" AND e."enrollmentNumber" = esd."enrollmentNumber"
        ${where}
        ORDER BY esd."enrollmentNumber" ASC
      `;
      const rows = await prisma.$queryRawUnsafe(sql, ...params);
      rows.forEach(r => worksheet.addRow(r));
    } else {
      let groupByField = '';
      if (type === 'semester') groupByField = 'esd.semester';
      else if (type === 'program') groupByField = 'esd.program';
      else if (type === 'division') groupByField = 'esd.division, esd.semester, esd.program';

      if (type === 'division') {
        worksheet.columns = [
          { header: 'Division', key: 'division', width: 15 },
          { header: 'Semester', key: 'semester', width: 10 },
          { header: 'Program', key: 'program', width: 20 },
          { header: 'Total Students', key: 'total', width: 15 },
          { header: 'Eligible', key: 'eligible', width: 15 },
          { header: 'Not Eligible', key: 'notEligible', width: 15 },
        ];
      } else if (type === 'program') {
        worksheet.columns = [
          { header: 'Program', key: 'program', width: 30 },
          { header: 'Total Students', key: 'total', width: 15 },
          { header: 'Eligible', key: 'eligible', width: 15 },
          { header: 'Not Eligible', key: 'notEligible', width: 15 },
        ];
      } else {
        worksheet.columns = [
          { header: 'Semester', key: 'semester', width: 15 },
          { header: 'Total Students', key: 'total', width: 15 },
          { header: 'Eligible', key: 'eligible', width: 15 },
          { header: 'Not Eligible', key: 'notEligible', width: 15 },
        ];
      }

      const sql = `
        SELECT 
          ${groupByField},
          COUNT(esd.id) as total,
          SUM(CASE WHEN e."finalEligibility" = 'ELIGIBLE' THEN 1 ELSE 0 END) as eligible,
          SUM(CASE WHEN e."finalEligibility" = 'NOT_ELIGIBLE' THEN 1 ELSE 0 END) as notEligible
        FROM "ExamStudentData" esd
        LEFT JOIN "Eligibility" e ON e."examId" = esd."examId" AND e."enrollmentNumber" = esd."enrollmentNumber"
        ${where}
        GROUP BY ${groupByField}
        ORDER BY ${type === 'semester' ? 'esd.semester' : groupByField} ASC
      `;
      const rows = await prisma.$queryRawUnsafe(sql, ...params);
      rows.forEach(r => {
        const obj = {};
        for (const k in r) obj[k] = typeof r[k] === 'bigint' ? Number(r[k]) : r[k];
        worksheet.addRow(obj);
      });
    }

    worksheet.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Eligible_Analysis_${type}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('[EligibleAnalysis] Export excel error:', error);
    res.status(500).json({ error: 'Failed to export excel' });
  }
});

module.exports = router;
