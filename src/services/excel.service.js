const ExcelJS = require('exceljs');
const prisma = require('../config/database');

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
    { header: 'Academic Year', key: 'academicYear', width: 16 },
    { header: 'Semester', key: 'semester', width: 12 },
    { header: 'Program', key: 'program', width: 12 },
    { header: 'Enrollment', key: 'enrollment', width: 16 },
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Division', key: 'division', width: 12 },
    { header: 'Attendance %', key: 'attendance', width: 14 },
    { header: 'Fees Status', key: 'feesStatus', width: 14 },
    { header: 'Student Email ID', key: 'studentEmailId', width: 24 },
  ];

  // Dynamic date columns (from existing schedules, or blank for new exam)
  const dateColumns = [];
  if (exam.schedules.length > 0) {
    const uniqueDates = [...new Set(
      exam.schedules.map(s => formatDate(s.examDate))
    )];
    uniqueDates.forEach(date => {
      dateColumns.push({ header: date, key: `date_${date}`, width: 18 });
    });
  }

  // Trailing columns
  const trailingColumns = [
    { header: 'Time', key: 'time', width: 22 },
  ];

  dataSheet.columns = [...fixedColumns, ...dateColumns, ...trailingColumns];

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

  // Add a sample row
  const sampleRow = {
    srNo: 1,
    academicYear: exam.academicYear.name,
    semester: exam.semesters.length > 0 ? exam.semesters[0].semester : 3,
    program: 'SOE',
    enrollment: '26CV3X001',
    name: 'Aarav Patel 001',
    division: 'CV3',
    attendance: 85,
    feesStatus: 'Paid',
    studentEmailId: 'aarav@example.com',
    time: '10:30AM TO 11:30 AM',
  };
  const sampleRow2 = {
    srNo: 2,
    academicYear: exam.academicYear.name,
    semester: exam.semesters.length > 0 ? exam.semesters[0].semester : 3,
    program: 'SOE',
    enrollment: '26CV3X002',
    name: 'Vivaan Patel 002',
    division: 'CV3',
    attendance: 70,
    feesStatus: 'Paid',
    studentEmailId: 'vivaan@example.com',
    time: '01:30 PM TO 02:25 PM',
  };
  dateColumns.forEach(col => {
    sampleRow[col.key] = 'SECV2330 / CFLS2140';
    sampleRow2[col.key] = 'SECV2330 / CFLS2140';
  });
  dataSheet.addRow(sampleRow);
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
    'DATE COLUMNS:',
    '─────────────',
    '9. Each date column header represents an exam date (DD-MM-YYYY).',
    '10. Enter the SUBJECT CODE under each date for the student.',
    '11. You can add MORE date columns by simply adding new columns with date headers.',
    '12. The system will dynamically detect all date-format columns.',
    '',
    'ATTENDANCE, FEES & EMAIL:',
    '────────────────────────',
    '13. Attendance %: Number between 0-100.',
    '14. Fees Status: "Paid" or "Unpaid".',
    '15. Student Email ID: Must be a valid email format.',
    '',
    'TIME COLUMN:',
    '────────────',
    '15. Time: e.g. "10:30AM TO 11:30 AM". Defines the exact exam time for the student.',
    '',
    'RE-UPLOAD RULES:',
    '────────────────',
    '16. If an enrollment already exists, its data will be UPDATED.',
    '17. If a cell is BLANK, the previous value is PRESERVED (not overwritten).',
    '18. New enrollments will be CREATED.',
    '',
    'IMPORTANT:',
    '──────────',
    '19. Do NOT include macros or VBA.',
    '20. Save as .xlsx format only.',
    '21. Max file size: 10MB.',
  ];

  instructions.forEach(text => {
    instrSheet.addRow({ text });
  });

  return workbook;
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
      strValue = String(rawValue || '').trim();
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
  const dateColumns = headers.filter(h => datePattern.test(h.value));
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
      const cell = row.getCell(colNum);
      if (cell.value === null || cell.value === undefined) return null;
      return String(cell.value).trim() || null;
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
        subCodes.forEach(code => {
          subjects.push({
            dateStr: dc.value,
            subjectCode: code,
            time: time,
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
    let studentEmailId = studentEmailIdRaw ? studentEmailIdRaw.trim() : null;
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

  return {
    valid: errors.length === 0,
    errors,
    dateColumns: dateColumns.map(dc => dc.value),
    summary: {
      totalRows: rows.length,
      newRecords: newRecords.length,
      updateRecords: updateRecords.length,
      unchangedRecords: unchangedRecords.length,
      duplicateEnrollments: duplicateEnrollments.length,
      validationErrors: errors.length,
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

    // CREATE new records
    for (const row of newRecords) {
      const studentData = await tx.examStudentData.create({
        data: {
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
        },
      });

      // SYNC TO PROFILE IF EXISTS
      const existingProfile = await tx.studentProfile.findUnique({
        where: { enrollmentNumber: row.enrollment }
      });
      if (existingProfile) {
        const profileUpdateData = {};
        if (row.name) profileUpdateData.name = row.name;
        if (row.program) profileUpdateData.program = row.program;
        if (row.semester) profileUpdateData.semester = row.semester;
        if (row.division) profileUpdateData.division = row.division;

        if (Object.keys(profileUpdateData).length > 0) {
          await tx.studentProfile.update({
            where: { id: existingProfile.id },
            data: profileUpdateData
          });
        }
        if (row.studentEmailId) {
          await tx.user.update({
            where: { id: existingProfile.userId },
            data: { email: row.studentEmailId }
          });
        }
      }

      // Create subject links
      for (const subj of row.subjects) {
        const scheduleId = scheduleMap.get(`${subj.dateStr}_${subj.subjectCode}_${subj.time}`);
        if (scheduleId) {
          await tx.studentExamSubject.create({
            data: {
              examStudentDataId: studentData.id,
              examScheduleId: scheduleId,
            },
          });
        }
      }
      created++;
    }

    // UPDATE existing records (smart upsert: blank = no change)
    for (const row of updateRecords) {
      const updateData = {};

      // Only update non-null/non-blank fields
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

        // SYNC TO PROFILE IF EXISTS
        const existingProfile = await tx.studentProfile.findUnique({
          where: { enrollmentNumber: row.enrollment }
        });
        if (existingProfile) {
          const profileUpdateData = {};
          if (updateData.studentName !== undefined) profileUpdateData.name = updateData.studentName;
          if (updateData.program !== undefined) profileUpdateData.program = updateData.program;
          if (updateData.semester !== undefined) profileUpdateData.semester = updateData.semester;
          if (updateData.division !== undefined) profileUpdateData.division = updateData.division;

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

      // Update subject links
      for (const subj of row.subjects) {
        const scheduleId = scheduleMap.get(`${subj.dateStr}_${subj.subjectCode}_${subj.time}`);
        if (scheduleId) {
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
            },
            update: {},
          });
        }
      }
      updated++;
    }

    return { created, updated };
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
};
