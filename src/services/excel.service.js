const ExcelJS = require('exceljs');
const prisma = require('../config/database');
const { syncRollNumbersToDatabase } = require('./rollNumber.service');

/**
 * Generate sample Excel template for an exam
 * Dynamically creates exam date columns based on schedules
 */
async function generateSampleExcel(examId) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      academicYear: true,
      semesters: { orderBy: { semester: 'asc' } },
      schedules: { orderBy: { examDate: 'asc' } },
    },
  });

  if (!exam) throw new Error('Exam not found');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SOE Examination Portal';

  // ─── DATA SHEET ───
  const dataSheet = workbook.addWorksheet('Student Data');

  // Fixed columns
  const fixedColumns = [
    { header: 'Sr No', key: 'srNo', width: 8 },
    { header: 'Academic Year', key: 'academicYear', width: 22 },
    { header: 'Semester', key: 'semester', width: 12 },
    { header: 'Program', key: 'program', width: 12 },
    { header: 'Enrollment', key: 'enrollment', width: 18 },
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Division', key: 'division', width: 12 },
    { header: 'Attendance %', key: 'attendance', width: 14 },
    { header: 'Fees Status', key: 'feesStatus', width: 14 },
    { header: 'Student Email ID', key: 'studentEmailId', width: 26 },
    { header: 'Time', key: 'time', width: 22 },
  ];

  // Dynamic date columns with paired Roll No columns
  const dateColumns = [];
  if (exam.schedules && exam.schedules.length > 0) {
    const uniqueDates = [...new Set(
      exam.schedules.map(s => formatDate(s.examDate))
    )];
    uniqueDates.forEach(date => {
      const parts = date.split('-');
      const dObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      const monStr = !isNaN(dObj) ? dObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : date;
      
      dateColumns.push({ header: date, key: `date_${date}`, width: 16 });
      dateColumns.push({ header: `Roll No (${monStr})`, key: `roll_${date}`, width: 16 });
    });
  } else {
    dateColumns.push({ header: '24-11-2026', key: 'date_24-11-2026', width: 16 });
    dateColumns.push({ header: 'Roll No (24 Nov)', key: 'roll_24-11-2026', width: 16 });
    dateColumns.push({ header: '25-11-2026', key: 'date_25-11-2026', width: 16 });
    dateColumns.push({ header: 'Roll No (25 Nov)', key: 'roll_25-11-2026', width: 16 });
    dateColumns.push({ header: '26-11-2026', key: 'date_26-11-2026', width: 16 });
    dateColumns.push({ header: 'Roll No (26 Nov)', key: 'roll_26-11-2026', width: 16 });
  }

  dataSheet.columns = [...fixedColumns, ...dateColumns];

  // Style header row
  const headerRow = dataSheet.getRow(1);
  headerRow.font = { bold: true, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A5F' },
  };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 24;

  // Add sample rows
  const sampleRow1 = {
    srNo: 1,
    academicYear: exam.academicYear.name,
    semester: exam.semesters.length > 0 ? exam.semesters[0].semester : 1,
    program: 'ICA',
    enrollment: '26IC02AI001',
    name: 'SIDRAH MALIK',
    division: 'ICA2',
    attendance: 85,
    feesStatus: 'Paid',
    studentEmailId: '26IC02AI001@ppsu.ac.in',
    time: '10:00 AM TO 1:00 PM',
  };
  const sampleRow2 = {
    srNo: 2,
    academicYear: exam.academicYear.name,
    semester: exam.semesters.length > 0 ? exam.semesters[0].semester : 1,
    program: 'ICA',
    enrollment: '26IC02AI002',
    name: 'KAGZI MO ASIF ABDUL FARID',
    division: 'ICA1',
    attendance: 80,
    feesStatus: 'Paid',
    studentEmailId: '26IC02AI002@ppsu.ac.in',
    time: '10:00 AM TO 1:00 PM',
  };

  dateColumns.forEach(col => {
    if (col.key.startsWith('date_')) {
      sampleRow1[col.key] = 'ICASH1010';
      sampleRow2[col.key] = 'ICACS1010';
    } else if (col.key.startsWith('roll_')) {
      sampleRow1[col.key] = 35;
      sampleRow2[col.key] = 36;
    }
  });

  dataSheet.addRow(sampleRow1);
  dataSheet.addRow(sampleRow2);

  // ─── INSTRUCTIONS SHEET ───
  const instrSheet = workbook.addWorksheet('Instructions');
  instrSheet.columns = [{ header: 'Instructions', key: 'text', width: 80 }];
  instrSheet.getRow(1).font = { bold: true, size: 13 };

  const instructions = [
    '',
    'EXCEL UPLOAD INSTRUCTIONS',
    '─────────────────────────────────────────',
    '',
    '1. Do NOT modify the column headers.',
    '2. Sr No is auto-generated, but include it in order.',
    `3. Academic Year: Use "${exam.academicYear.name}"`,
    `4. Semesters: ${exam.semesters.map(s => s.semester).join(', ')}`,
    '5. Program: SOE, IDS, ICA, etc.',
    '6. Enrollment: Student enrollment number (e.g., 24CE001). Must be unique.',
    '7. Name: Full student name.',
    '8. Division: e.g., G1D1, G1D2, etc.',
    '9. Student Email ID: Valid email address (e.g., student@example.com).',
    '',
    'DATE & ROLL NO COLUMNS:',
    '───────────────────────',
    '9. Each exam date column (DD-MM-YYYY) is paired with a Roll No column (e.g., Roll No (24 Nov)).',
    '10. Under each date, enter the SUBJECT CODE (e.g., ICASH1010). Leave blank if not applying.',
    '11. Under the Roll No column, enter the student\'s pre-assigned Roll No for that subject.',
    '12. If Roll No is left blank, the system will auto-assign sequential Roll Numbers.',
    '13. You can add more date and Roll No column pairs as needed.',
    '',
    'ATTENDANCE, FEES & EMAIL:',
    '────────────────────────',
    '14. Attendance %: Number between 0-100.',
    '15. Fees Status: "Paid" or "Unpaid".',
    '16. Student Email ID: Must be a valid email format.',
    '',
    'TIME COLUMN:',
    '────────────',
    '17. Time: e.g. "10:00 AM TO 1:00 PM". Defines the exact exam time for the student.',
    '',
    'RE-UPLOAD RULES:',
    '────────────────',
    '18. If an enrollment already exists, its data will be UPDATED.',
    '19. If a cell is BLANK, the previous value is PRESERVED (not overwritten).',
    '20. New enrollments will be CREATED.',
    '',
    'IMPORTANT:',
    '──────────',
    '21. Do NOT include macros or VBA.',
    '22. Save as .xlsx format only.',
    '23. Max file size: 10MB.',
  ];

  instructions.forEach(text => {
    instrSheet.addRow({ text });
  });

  return workbook;
}

/**
 * Neutralize dangerous spreadsheet formula prefixes (=, +, -, @, \t, \r)
 * to prevent CSV / Excel Formula Injection (CWE-1236)
 */
function sanitizeCellString(str) {
  if (typeof str !== 'string') return str;
  const trimmed = str.trim();
  if (!trimmed) return trimmed;
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    // Standalone signed numbers (e.g. "+5", "-2.5") remain numeric
    if (/^[+\-]?\d+(\.\d+)?$/.test(trimmed)) {
      return trimmed;
    }
    // Deactivate formula execution with single quote
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Extract clean string value from ExcelJS cell, handling hyperlinks, rich text, dates, and formulas
 */
function extractCellString(cell) {
  if (!cell || cell.value === null || cell.value === undefined) return null;
  const val = cell.value;

  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    const s = String(val).trim();
    if (s === '[object Object]') return null;
    return sanitizeCellString(s) || null;
  }

  if (val instanceof Date) {
    return val;
  }

  if (typeof val === 'object') {
    // 1. Text property (string, object with text, or richText)
    if (typeof val.text === 'string' && val.text.trim() !== '[object Object]') {
      return sanitizeCellString(val.text.trim()) || null;
    }
    if (val.text && typeof val.text === 'object') {
      if (Array.isArray(val.text.richText)) {
        return sanitizeCellString(val.text.richText.map(r => r.text || '').join('').trim()) || null;
      }
      if (typeof val.text.text === 'string') {
        return sanitizeCellString(val.text.text.trim()) || null;
      }
    }

    // 2. Hyperlink property on val or cell
    const hl = val.hyperlink || (cell && cell.hyperlink);
    if (hl && typeof hl === 'string') {
      const cleanHl = hl.replace(/^mailto:/i, '').trim();
      if (cleanHl && cleanHl !== '[object Object]') {
        return sanitizeCellString(cleanHl) || null;
      }
    }

    // 3. Rich text array
    if (Array.isArray(val.richText)) {
      return sanitizeCellString(val.richText.map(r => r.text || '').join('').trim()) || null;
    }

    // 4. Formula result
    if (val.result !== undefined && val.result !== null) {
      if (typeof val.result === 'object') {
        return extractCellString({ value: val.result });
      }
      const resStr = String(val.result).trim();
      if (resStr && resStr !== '[object Object]') {
        return sanitizeCellString(resStr) || null;
      }
    }

    // 5. Formula string fallback (e.g., HYPERLINK("mailto:email", "email"))
    if (typeof val.formula === 'string') {
      const quotedMatches = val.formula.match(/"([^"]+)"/g);
      if (quotedMatches && quotedMatches.length > 0) {
        // Find if any quoted token is an email or URL
        for (const q of quotedMatches) {
          const inner = q.replace(/^"|"$/g, '').replace(/^mailto:/i, '').trim();
          if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(inner)) {
            return sanitizeCellString(inner);
          }
        }
        // Fallback to last quoted string (usually display text in =HYPERLINK(url, text))
        const lastQuoted = quotedMatches[quotedMatches.length - 1].replace(/^"|"$/g, '').trim();
        if (lastQuoted && lastQuoted !== '[object Object]') {
          return sanitizeCellString(lastQuoted);
        }
      }
    }

    // 6. Inspect values of the object for any valid string/email
    for (const key of Object.keys(val)) {
      const prop = val[key];
      if (typeof prop === 'string' && prop.trim() && prop.trim() !== '[object Object]') {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(prop.trim())) {
          return sanitizeCellString(prop.trim());
        }
      }
    }

    // 7. Cell.text fallback
    if (cell && typeof cell.text === 'string' && cell.text.trim() && cell.text.trim() !== '[object Object]') {
      return sanitizeCellString(cell.text.trim()) || null;
    }

    return null;
  }

  if (cell && typeof cell.text === 'string' && cell.text.trim() && cell.text.trim() !== '[object Object]') {
    return sanitizeCellString(cell.text.trim()) || null;
  }

  return null;
}

/**
 * Parse and validate uploaded Excel file
 * Returns parsed data + validation results
 */
async function parseAndValidateExcel(buffer, examId) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const dataSheet = workbook.getWorksheet('Student Data') || workbook.getWorksheet(1);
  if (!dataSheet) {
    return { valid: false, errors: ['Worksheet "Student Data" not found.'] };
  }

  const headerRow = dataSheet.getRow(1);
  const headers = [];
  headerRow.eachCell((cell, colNumber) => {
    let rawValue = cell.value;
    let strValue = '';
    
    // Handle Excel Date objects
    if (rawValue instanceof Date) {
      const dd = String(rawValue.getDate()).padStart(2, '0');
      const mm = String(rawValue.getMonth() + 1).padStart(2, '0');
      const yyyy = rawValue.getFullYear();
      strValue = `${dd}-${mm}-${yyyy}`;
    } else {
      const extracted = extractCellString(cell);
      strValue = (extracted instanceof Date) ? '' : (extracted || '');
      // Handle DD/MM/YYYY or YYYY-MM-DD to DD-MM-YYYY
      if (strValue.includes('/')) {
        strValue = strValue.replace(/\//g, '-');
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(strValue)) {
        const parts = strValue.split('-');
        strValue = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    
    headers.push({ col: colNumber, value: strValue, original: rawValue });
  });

  // Validate required columns
  const requiredHeaders = ['Semester', 'Program', 'Enrollment', 'Name', 'Time'];
  const missingHeaders = requiredHeaders.filter(
    h => !headers.some(hdr => hdr.value.toLowerCase() === h.toLowerCase())
  );

  if (missingHeaders.length > 0) {
    return { valid: false, errors: [`Missing required columns: ${missingHeaders.join(', ')}`] };
  }

  // Detect dynamic date columns (DD-MM-YYYY format)
  const datePattern = /^\d{2}-\d{2}-\d{4}$/;
  const dateColumns = [];
  headers.forEach((h, idx) => {
    if (datePattern.test(h.value)) {
      let rollNoCol = null;
      if (idx + 1 < headers.length) {
        const nextHeader = headers[idx + 1];
        if (/roll\s*no/i.test(nextHeader.value)) {
          rollNoCol = nextHeader.col;
        }
      }
      dateColumns.push({ col: h.col, value: h.value, rollNoCol });
    }
  });
  const fixedColMap = {};
  headers.forEach(h => {
    const key = h.value.toLowerCase().replace(/\s+/g, '');
    fixedColMap[key] = h.col;
  });

  // Parse rows
  const rows = [];
  const errors = [];
  const enrollments = new Set();
  const duplicateEnrollments = [];

  dataSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const getValue = (colNum) => {
      if (!colNum) return null;
      const cell = row.getCell(colNum);
      const extracted = extractCellString(cell);
      if (extracted === null || extracted === undefined) return null;
      if (extracted instanceof Date) {
        const dd = String(extracted.getDate()).padStart(2, '0');
        const mm = String(extracted.getMonth() + 1).padStart(2, '0');
        const yyyy = extracted.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
      }
      return String(extracted).trim() || null;
    };

    const enrollment = getValue(fixedColMap['enrollment']);
    if (!enrollment) {
      // Skip completely empty rows
      const hasAnyData = headers.some(h => getValue(h.col));
      if (hasAnyData) {
        errors.push({ row: rowNumber, message: 'Missing enrollment number.' });
      }
      return;
    }

    // Check duplicates within file
    if (enrollments.has(enrollment)) {
      duplicateEnrollments.push({ row: rowNumber, enrollment });
      errors.push({ row: rowNumber, message: `Duplicate enrollment: ${enrollment}` });
      return;
    }
    enrollments.add(enrollment);

    // Parse subject mappings from date columns
    const subjects = [];
    const timeRaw = getValue(fixedColMap['time']);
    
    function normalizeTime(t) {
      if (!t) return '';
      return String(t)
        .toUpperCase()
        .replace(/([0-9])([AP]M)/g, '$1 $2') // Add space before AM/PM
        .replace(/\s+/g, ' ') // Collapse spaces
        .replace(/\s*-\s*/g, ' TO ') // Replace hyphen with TO
        .trim();
    }
    const time = normalizeTime(timeRaw);

    dateColumns.forEach(dc => {
      const subjectCode = getValue(dc.col);
      if (subjectCode) {
        const subCodes = subjectCode.split(/[/,;]/).map(s => s.trim()).filter(Boolean);
        const rollVal = dc.rollNoCol ? getValue(dc.rollNoCol) : null;
        const parsedRoll = rollVal && !isNaN(parseInt(rollVal)) ? parseInt(rollVal) : null;

        subCodes.forEach(code => {
          subjects.push({
            dateStr: dc.value,
            subjectCode: code,
            time: time,
            rollNo: parsedRoll,
          });
        });
      }
    });

    const attendanceRaw = getValue(fixedColMap['attendance%'] || fixedColMap['attendance']);
    const attendance = attendanceRaw ? parseFloat(attendanceRaw) : null;
    if (attendance !== null && (isNaN(attendance) || attendance < 0 || attendance > 100)) {
      errors.push({ row: rowNumber, message: `Invalid attendance value: ${attendanceRaw}` });
    }

    // Validate Student Email ID
    const studentEmailIdRaw = getValue(fixedColMap['studentemailid']);
    let studentEmailId = studentEmailIdRaw ? studentEmailIdRaw.replace(/^mailto:/i, '').trim() : null;
    if (studentEmailId) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!emailRegex.test(studentEmailId)) {
        errors.push({ row: rowNumber, message: `Invalid Student Email ID: ${studentEmailId}` });
        studentEmailId = null; // Don't store invalid email
      }
    }

    rows.push({
      rowNumber,
      academicYear: getValue(fixedColMap['academicyear']),
      semester: getValue(fixedColMap['semester']) ? parseInt(getValue(fixedColMap['semester'])) : null,
      program: getValue(fixedColMap['program']),
      enrollment,
      name: getValue(fixedColMap['name']),
      division: getValue(fixedColMap['division']),
      attendance: attendance !== null && !isNaN(attendance) ? attendance : null,
      feesStatus: getValue(fixedColMap['feesstatus'] || fixedColMap['fees']),
      studentEmailId,
      subjects,
    });
  });

  if (rows.length === 0) {
    return { valid: false, errors: ['No data rows found in the Excel file.'] };
  }

  // Subject Master validation
  const allSubjectCodes = new Set();
  rows.forEach(r => r.subjects.forEach(s => allSubjectCodes.add(s.subjectCode)));
  
  const subjectMasterRecords = await prisma.subjectMaster.findMany({
    where: { subjectCode: { in: Array.from(allSubjectCodes) } }
  });
  const subjectMap = new Map(subjectMasterRecords.map(s => [s.subjectCode, s.subjectName]));
  
  rows.forEach(r => {
    r.subjects.forEach(s => {
      if (subjectMap.has(s.subjectCode)) {
        s.subjectName = subjectMap.get(s.subjectCode);
      } else {
        s.subjectName = null;
        errors.push({ row: r.rowNumber, message: `Subject Not Found in Master: ${s.subjectCode}` });
      }
    });
  });

  // Check existing records in DB for smart upsert classification
  const existingRecords = await prisma.examStudentData.findMany({
    where: {
      examId,
      enrollmentNumber: { in: rows.map(r => r.enrollment) },
    },
    select: { enrollmentNumber: true, id: true },
  });

  const existingMap = new Map(existingRecords.map(r => [r.enrollmentNumber, r.id]));

  const newRecords = [];
  const updateRecords = [];
  const unchangedRecords = [];

  rows.forEach(row => {
    if (existingMap.has(row.enrollment)) {
      updateRecords.push({ ...row, existingId: existingMap.get(row.enrollment) });
    } else {
      newRecords.push(row);
    }
  });

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, name: true, type: true },
  });

  let totalApplications = 0;
  const subjectApplicationCounts = {};
  const dateApplicationCounts = {};

  rows.forEach(r => {
    r.subjects.forEach(s => {
      totalApplications++;
      subjectApplicationCounts[s.subjectCode] = (subjectApplicationCounts[s.subjectCode] || 0) + 1;
      dateApplicationCounts[s.dateStr] = (dateApplicationCounts[s.dateStr] || 0) + 1;
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    dateColumns: dateColumns.map(dc => dc.value),
    summary: {
      totalRows: rows.length,
      totalStudents: rows.length,
      totalApplications,
      subjectApplicationCounts,
      dateApplicationCounts,
      newRecords: newRecords.length,
      updateRecords: updateRecords.length,
      unchangedRecords: unchangedRecords.length,
      duplicateEnrollments: duplicateEnrollments.length,
      validationErrors: errors.length,
      examType: exam?.type || 'REGULAR',
    },
    data: {
      newRecords,
      updateRecords,
      dateColumns: dateColumns.map(dc => dc.value),
    },
  };
}

/**
 * Commit parsed Excel data to database
 * Uses transaction — full rollback on failure
 * Implements smart upsert: blank cells = NO CHANGE
 */
async function commitExcelData(examId, parsedData, userId) {
  const { newRecords, updateRecords, dateColumns } = parsedData;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { academicYear: true },
  });

  if (!exam) throw new Error('Exam not found');

  const result = await prisma.$transaction(async (tx) => {
    let created = 0;
    let updated = 0;

    // Process date columns → create/update ExamSchedule
    const scheduleMap = new Map();
    for (const dateStr of dateColumns) {
      const examDate = parseDate(dateStr);
      if (!examDate) continue;

      // Collect all unique subject/time combinations for this date
      const subjectDetails = new Map();
      [...newRecords, ...updateRecords].forEach(row => {
        row.subjects.forEach(s => {
          if (s.dateStr === dateStr && s.subjectCode) {
            subjectDetails.set(`${s.subjectCode}::${s.time}`, s.subjectName);
          }
        });
      });

      for (const [item, subjectName] of subjectDetails.entries()) {
        const [subjectCode, time] = item.split('::');
        const examTime = time || ''; // Use empty string if no time
        const resolvedName = subjectName || subjectCode; // fallback to code if null
        
        const schedule = await tx.examSchedule.upsert({
          where: {
            examId_examDate_subjectCode_examTime: {
              examId,
              examDate,
              subjectCode,
              examTime,
            },
          },
          create: {
            examId,
            examDate,
            subjectCode,
            examTime,
            subjectName: resolvedName,
          },
          update: {
            subjectName: resolvedName, // Update name if it was previously defaulted
          },
        });
        scheduleMap.set(`${dateStr}_${subjectCode}_${time}`, schedule.id);
      }
    }

    // Pre-calculate subject roll numbers for Improvement Exams
    const rollNumberMap = new Map(); // key: `${subjectCode}_${enrollmentNumber}` -> rollNo
    if (exam.type === 'IMPROVEMENT') {
      const subjectApplicants = new Map();
      [...newRecords, ...updateRecords].forEach(row => {
        row.subjects.forEach(s => {
          if (s.subjectCode) {
            if (!subjectApplicants.has(s.subjectCode)) {
              subjectApplicants.set(s.subjectCode, new Set());
            }
            subjectApplicants.get(s.subjectCode).add(row.enrollment);
          }
        });
      });

      // Include any existing applications already in database
      const existingSS = await tx.studentExamSubject.findMany({
        where: { examSchedule: { examId } },
        select: {
          examSchedule: { select: { subjectCode: true } },
          examStudentData: { select: { enrollmentNumber: true } },
        },
      });
      existingSS.forEach(ss => {
        const code = ss.examSchedule?.subjectCode;
        const enr = ss.examStudentData?.enrollmentNumber;
        if (code && enr) {
          if (!subjectApplicants.has(code)) subjectApplicants.set(code, new Set());
          subjectApplicants.get(code).add(enr);
        }
      });

      for (const [code, enrollmentsSet] of subjectApplicants.entries()) {
        const sorted = Array.from(enrollmentsSet).sort((a, b) =>
          String(a).localeCompare(String(b), undefined, { numeric: true })
        );
        sorted.forEach((enr, idx) => {
          rollNumberMap.set(`${code}_${enr}`, idx + 1);
        });
      }
    }

    // 1. CREATE new records in high-performance chunks
    if (newRecords.length > 0) {
      const studentDataList = newRecords.map(row => ({
        examId,
        academicYear: row.academicYear || exam.academicYear.name,
        semester: row.semester || 1,
        program: row.program || '',
        enrollmentNumber: row.enrollment,
        studentName: row.name || '',
        division: row.division || null,
        attendancePercent: row.attendance,
        feesStatus: row.feesStatus || null,
        studentEmailId: row.studentEmailId || null,
      }));

      for (let i = 0; i < studentDataList.length; i += 500) {
        await tx.examStudentData.createMany({
          data: studentDataList.slice(i, i + 500),
          skipDuplicates: true,
        });
      }
      created = newRecords.length;
    }

    // Fetch created/existing student IDs to map subjects
    const allStudentData = await tx.examStudentData.findMany({
      where: {
        examId,
        enrollmentNumber: { in: [...newRecords, ...updateRecords].map(r => r.enrollment) },
      },
      select: { id: true, enrollmentNumber: true },
    });
    const studentDataIdMap = new Map(allStudentData.map(s => [s.enrollmentNumber, s.id]));

    // Batch insert StudentExamSubject for new records
    if (newRecords.length > 0) {
      const subjectLinksToCreate = [];
      for (const row of newRecords) {
        const studentDataId = studentDataIdMap.get(row.enrollment);
        if (!studentDataId) continue;

        for (const subj of row.subjects) {
          const scheduleId = scheduleMap.get(`${subj.dateStr}_${subj.subjectCode}_${subj.time}`);
          if (scheduleId) {
            const rollNo = (subj.rollNo !== null && subj.rollNo !== undefined)
              ? subj.rollNo
              : (exam.type === 'IMPROVEMENT' ? (rollNumberMap.get(`${subj.subjectCode}_${row.enrollment}`) || null) : null);

            subjectLinksToCreate.push({
              examStudentDataId: studentDataId,
              examScheduleId: scheduleId,
              rollNumber: rollNo,
            });
          }
        }
      }

      for (let i = 0; i < subjectLinksToCreate.length; i += 500) {
        await tx.studentExamSubject.createMany({
          data: subjectLinksToCreate.slice(i, i + 500),
          skipDuplicates: true,
        });
      }

      // Batch insert Eligibility for Improvement Exam
      if (exam.type === 'IMPROVEMENT') {
        const eligibilityList = newRecords.map(row => ({
          examId,
          enrollmentNumber: row.enrollment,
          calculatedEligibility: 'ELIGIBLE',
          finalEligibility: 'ELIGIBLE',
        }));

        for (let i = 0; i < eligibilityList.length; i += 500) {
          await tx.eligibility.createMany({
            data: eligibilityList.slice(i, i + 500),
            skipDuplicates: true,
          });
        }
      }
    }

    // Link existing student profiles
    const allEnrollments = [...newRecords, ...updateRecords].map(r => r.enrollment);
    const existingProfiles = await tx.studentProfile.findMany({
      where: { enrollmentNumber: { in: allEnrollments } },
      select: { id: true, enrollmentNumber: true, userId: true },
    });
    const profileMap = new Map(existingProfiles.map(p => [p.enrollmentNumber, p]));

    if (existingProfiles.length > 0) {
      for (const prof of existingProfiles) {
        await tx.eligibility.updateMany({
          where: { examId, enrollmentNumber: prof.enrollmentNumber },
          data: { studentProfileId: prof.id },
        });

        const row = [...newRecords, ...updateRecords].find(r => r.enrollment === prof.enrollmentNumber);
        if (row) {
          const profileUpdateData = {};
          if (row.name) profileUpdateData.name = row.name;
          if (row.program) profileUpdateData.program = row.program;
          if (row.semester) profileUpdateData.semester = row.semester;
          if (row.division) profileUpdateData.division = row.division;

          if (Object.keys(profileUpdateData).length > 0) {
            await tx.studentProfile.update({
              where: { id: prof.id },
              data: profileUpdateData,
            });
          }
        }
      }
    }

    // 2. UPDATE existing records (smart upsert: blank = no change)
    for (const row of updateRecords) {
      const updateData = {};

      if (row.academicYear) updateData.academicYear = row.academicYear;
      if (row.semester) updateData.semester = row.semester;
      if (row.program) updateData.program = row.program;
      if (row.name) updateData.studentName = row.name;
      if (row.division) updateData.division = row.division;
      if (row.attendance !== null) updateData.attendancePercent = row.attendance;
      if (row.feesStatus) updateData.feesStatus = row.feesStatus;
      if (row.studentEmailId) updateData.studentEmailId = row.studentEmailId;

      if (Object.keys(updateData).length > 0) {
        await tx.examStudentData.update({
          where: { id: row.existingId },
          data: updateData,
        });
      }

      // Update subject links
      for (const subj of row.subjects) {
        const scheduleId = scheduleMap.get(`${subj.dateStr}_${subj.subjectCode}_${subj.time}`);
        if (scheduleId) {
          const rollNo = (subj.rollNo !== null && subj.rollNo !== undefined)
            ? subj.rollNo
            : (exam.type === 'IMPROVEMENT' ? (rollNumberMap.get(`${subj.subjectCode}_${row.enrollment}`) || null) : null);

          await tx.studentExamSubject.upsert({
            where: {
              examStudentDataId_examScheduleId: {
                examStudentDataId: row.existingId,
                examScheduleId: scheduleId,
              },
            },
            create: {
              examStudentDataId: row.existingId,
              examScheduleId: scheduleId,
              rollNumber: rollNo,
            },
            update: {
              rollNumber: rollNo,
            },
          });
        }
      }

      if (exam.type === 'IMPROVEMENT') {
        const activeScheduleIds = row.subjects
          .map(s => scheduleMap.get(`${s.dateStr}_${s.subjectCode}_${s.time}`))
          .filter(Boolean);
        await tx.studentExamSubject.deleteMany({
          where: {
            examStudentDataId: row.existingId,
            examScheduleId: { notIn: activeScheduleIds },
          },
        });

        const prof = profileMap.get(row.enrollment);
        await tx.eligibility.upsert({
          where: { examId_enrollmentNumber: { examId, enrollmentNumber: row.enrollment } },
          create: {
            examId,
            enrollmentNumber: row.enrollment,
            studentProfileId: prof?.id || null,
            calculatedEligibility: 'ELIGIBLE',
            finalEligibility: 'ELIGIBLE',
          },
          update: {},
        });
      }

      updated++;
    }

    return { created, updated };
  }, {
    maxWait: 15000,
    timeout: 120000,
  });

  return result;
}

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────

function formatDate(date) {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function parseDate(dateStr) {
  // Parse DD-MM-YYYY
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  const date = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
  if (isNaN(date.getTime())) return null;
  return date;
}

module.exports = {
  generateSampleExcel,
  parseAndValidateExcel,
  commitExcelData,
  sanitizeCellString,
};
