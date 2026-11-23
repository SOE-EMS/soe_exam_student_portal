const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { excelUpload, handleMulterError } = require('../middleware/fileUpload');
const ExcelJS = require('exceljs');

// ──────────────────────────────────────────────
// LIST SUBJECTS
// ──────────────────────────────────────────────

router.get('/', requireAdmin, async (req, res) => {
  try {
    const { search, program, semester, status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const where = {};
    if (search) {
      where.OR = [
        { subjectCode: { contains: search } },
        { subjectName: { contains: search } }
      ];
    }
    if (program) where.program = program;
    if (semester && !isNaN(parseInt(semester))) where.semester = parseInt(semester);
    if (status) {
      where.isActive = status === 'active';
    }

    const [subjects, total] = await Promise.all([
      prisma.subjectMaster.findMany({
        where,
        orderBy: [{ subjectCode: 'asc' }],
        skip,
        take: parseInt(limit),
      }),
      prisma.subjectMaster.count({ where }),
    ]);

    res.json({
      subjects,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      }
    });
  } catch (error) {
    console.error('[SubjectMaster] List error:', error.message);
    res.status(500).json({ error: 'Failed to load subjects.' });
  }
});

// ──────────────────────────────────────────────
// CREATE SUBJECT
// ──────────────────────────────────────────────

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { subjectCode, subjectName, program, semester, isActive } = req.body;

    if (!subjectCode || !subjectName) {
      return res.status(400).json({ error: 'Subject Code and Subject Name are required.' });
    }

    const existing = await prisma.subjectMaster.findUnique({
      where: { subjectCode: subjectCode.trim() },
    });
    if (existing) {
      return res.status(409).json({ error: 'Subject Code already exists.' });
    }

    const subject = await prisma.subjectMaster.create({
      data: {
        subjectCode: subjectCode.trim(),
        subjectName: subjectName.trim(),
        program: program?.trim() || null,
        semester: semester ? parseInt(semester) : null,
        isActive: isActive !== undefined ? isActive : true,
      }
    });

    res.status(201).json({ message: 'Subject created successfully', subject });
  } catch (error) {
    console.error('[SubjectMaster] Create error:', error.message);
    res.status(500).json({ error: 'Failed to create subject.' });
  }
});

// ──────────────────────────────────────────────
// UPDATE SUBJECT
// ──────────────────────────────────────────────

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { subjectName, program, semester, isActive } = req.body;

    const existing = await prisma.subjectMaster.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Subject not found.' });
    }

    const subject = await prisma.subjectMaster.update({
      where: { id },
      data: {
        subjectName: subjectName?.trim(),
        program: program?.trim() || null,
        semester: semester ? parseInt(semester) : null,
        isActive: isActive !== undefined ? isActive : true,
      }
    });

    res.json({ message: 'Subject updated successfully', subject });
  } catch (error) {
    console.error('[SubjectMaster] Update error:', error.message);
    res.status(500).json({ error: 'Failed to update subject.' });
  }
});

// ──────────────────────────────────────────────
// BULK LOOKUP
// ──────────────────────────────────────────────

router.get('/lookup', requireAdmin, async (req, res) => {
  try {
    const { codes } = req.query; // Comma separated codes
    if (!codes) {
      return res.json({ mapping: {} });
    }

    const subjectCodes = codes.split(',').map(c => c.trim()).filter(Boolean);
    const subjects = await prisma.subjectMaster.findMany({
      where: { subjectCode: { in: subjectCodes } },
      select: { subjectCode: true, subjectName: true }
    });

    const mapping = {};
    subjects.forEach(s => {
      mapping[s.subjectCode] = s.subjectName;
    });

    res.json({ mapping });
  } catch (error) {
    console.error('[SubjectMaster] Lookup error:', error.message);
    res.status(500).json({ error: 'Failed to lookup subjects.' });
  }
});

// ──────────────────────────────────────────────
// UPLOAD EXCEL
// ──────────────────────────────────────────────

function extractCellValue(cell) {
  if (!cell || cell.value === null || cell.value === undefined) return null;
  const val = cell.value;
  if (typeof val === 'object') {
    if (val.result !== undefined && val.result !== null) return String(val.result).trim();
    if (val.text !== undefined && val.text !== null) return String(val.text).trim();
    if (Array.isArray(val.richText)) return val.richText.map(t => t.text || '').join('').trim();
  }
  return String(val).trim();
}

router.post('/upload', requireAdmin, excelUpload.single('file'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ error: 'Excel file is empty.' });
    }

    // Identify columns
    const headers = {};
    const firstRow = worksheet.getRow(1);
    
    firstRow.eachCell((cell, colNumber) => {
      const val = (extractCellValue(cell) || '').toLowerCase();
      if (val.includes('code')) headers.subjectCode = colNumber;
      else if (val.includes('name')) headers.subjectName = colNumber;
      else if (val.includes('program') || val.includes('branch') || val.includes('course')) headers.program = colNumber;
      else if (val.includes('sem')) headers.semester = colNumber;
    });

    if (!headers.subjectCode || !headers.subjectName) {
      return res.status(400).json({ error: 'Excel file must contain "Subject Code" and "Subject Name" columns.' });
    }

    const subjects = [];
    const errors = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header

      const subjectCode = extractCellValue(row.getCell(headers.subjectCode));
      const subjectName = extractCellValue(row.getCell(headers.subjectName));
      
      if (!subjectCode && !subjectName) {
        return; // skip empty rows
      }

      if (!subjectCode || !subjectName) {
        errors.push(`Row ${rowNumber}: Missing Subject Code or Name`);
        return;
      }

      const program = headers.program ? extractCellValue(row.getCell(headers.program)) : null;
      const semesterRaw = headers.semester ? extractCellValue(row.getCell(headers.semester)) : null;
      const semester = semesterRaw ? parseInt(semesterRaw) : null;

      subjects.push({
        subjectCode: subjectCode.toUpperCase(),
        subjectName,
        program: program || null,
        semester: isNaN(semester) ? null : semester,
      });
    });

    if (subjects.length === 0) {
      return res.status(400).json({ error: 'No valid data rows found.', rowErrors: errors });
    }

    // Upsert all subjects sequentially to avoid PgBouncer transaction-mode connection pooler issues
    let added = 0;
    let updated = 0;

    for (const sub of subjects) {
      const existing = await prisma.subjectMaster.findUnique({
        where: { subjectCode: sub.subjectCode },
      });

      if (existing) {
        await prisma.subjectMaster.update({
          where: { id: existing.id },
          data: {
            subjectName: sub.subjectName,
            program: sub.program || existing.program,
            semester: sub.semester !== null ? sub.semester : existing.semester,
          },
        });
        updated++;
      } else {
        await prisma.subjectMaster.create({
          data: sub,
        });
        added++;
      }
    }

    res.json({
      message: 'Upload successful',
      stats: { total: subjects.length, added, updated },
      rowErrors: errors
    });

  } catch (error) {
    console.error('[SubjectMaster] Upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to process Excel file. Ensure it is a valid .xlsx format.' });
  }
});

// ──────────────────────────────────────────────
// DOWNLOAD SAMPLE
// ──────────────────────────────────────────────
router.get('/sample', requireAdmin, async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Subjects');

    worksheet.columns = [
      { header: 'Subject Code', key: 'code', width: 20 },
      { header: 'Subject Name', key: 'name', width: 40 },
      { header: 'Program', key: 'program', width: 20 },
      { header: 'Semester', key: 'semester', width: 15 }
    ];

    // Style headers
    worksheet.getRow(1).font = { bold: true };

    // Add sample rows
    worksheet.addRow({ code: 'SECV2330', name: 'Computer Networks', program: 'B.Tech', semester: 3 });
    worksheet.addRow({ code: 'CFLS2140', name: 'Communication Skills', program: 'B.Tech', semester: 2 });
    worksheet.addRow({ code: 'MATH1010', name: 'Engineering Mathematics', program: 'B.Tech', semester: 1 });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Subject_Master_Sample.xlsx');
    res.setHeader('Content-Length', buffer.length);
    
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('[SubjectMaster] Download sample error:', error);
    res.status(500).send('Failed to generate sample file');
  }
});

module.exports = router;
