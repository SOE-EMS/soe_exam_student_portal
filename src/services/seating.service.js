const ExcelJS = require('exceljs');
const prisma = require('../config/database');
const { getSubjectRollNumberMap } = require('./rollNumber.service');

const APPROVED_CLASSROOMS = [
  'H501', 'BX201', 'BX202', 'H801', 'B006', 'B007', 'B011', 'B012', 'B013',
  'BX101', 'BX102', 'BX103', 'BX104', 'BX203', 'C006', 'C007', 'C011',
  'C012', 'C013', 'C103', 'C106', 'C107'
];
const DEFAULT_CLASSROOM_CAPACITY = 35;

/**
 * Download sample Excel template for Seating Arrangement
 * Supports both REGULAR (7 cols) and IMPROVEMENT (8 cols with Subject Code)
 */
async function generateSeatingSampleExcel(type = 'REGULAR') {
  const isImprovement = String(type).toUpperCase() === 'IMPROVEMENT';
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Seating Arrangement');

  if (isImprovement) {
    // 8 columns for Improvement Exam
    sheet.getCell('A1').value = 'Classroom No.';
    sheet.getCell('B1').value = 'Branch';
    sheet.getCell('C1').value = 'Subject Code';
    sheet.getCell('D1').value = 'Enrollment No.';
    sheet.getCell('F1').value = 'Total Count';
    sheet.getCell('G1').value = 'Block No.';
    sheet.getCell('H1').value = 'Subject Block';

    sheet.getCell('D2').value = 'From';
    sheet.getCell('E2').value = 'To';

    sheet.mergeCells('A1:A2');
    sheet.mergeCells('B1:B2');
    sheet.mergeCells('C1:C2');
    sheet.mergeCells('D1:E1');
    sheet.mergeCells('F1:F2');
    sheet.mergeCells('G1:G2');
    sheet.mergeCells('H1:H2');

    const headerCells = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2', 'F1', 'F2', 'G1', 'G2', 'H1', 'H2'];
    headerCells.forEach(cellAddress => {
      const cell = sheet.getCell(cellAddress);
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2F2F2' }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Sample data rows
    sheet.addRow(['H501', 'CV', 'SECV1010', '26CV1X001', '26CV1X035', 35, 1, 'SECV1010(1)']);
    sheet.addRow(['BX201', 'CV', 'SECV1010', '26CV1X036', '26CV1X070', 35, 2, 'SECV1010(2)']);
    sheet.addRow(['BX202', 'CE', 'SECV1020', '26CV1X001', '26CV1X030', 30, 3, 'SECV1020(1)']);
    sheet.addRow(['H801', 'IT', 'SEIT1010', '26IT1X001', '26IT1X030', 30, 4, 'SEIT1010(1)']);

    sheet.columns = [
      { width: 18 }, // Classroom No.
      { width: 14 }, // Branch
      { width: 18 }, // Subject Code
      { width: 18 }, // From
      { width: 18 }, // To
      { width: 15 }, // Total Count
      { width: 12 }, // Block No.
      { width: 22 }, // Subject Block
    ];

    sheet.views = [{ state: 'frozen', ySplit: 2 }];
    sheet.autoFilter = 'A2:H2';

    // Sheet 2: Instructions
    const instrSheet = workbook.addWorksheet('Instructions');
    instrSheet.addRow(['Instructions for Improvement Exam Seating Arrangement Upload']);
    instrSheet.getCell('A1').font = { bold: true, size: 14 };
    instrSheet.addRow([]);
    instrSheet.addRow(['1. Classroom No. must be a valid room from the approved list (e.g. H501, BX201).']);
    instrSheet.addRow(['2. Branch must reflect the student program/branch (e.g. CV, CE, IT, ICA, SOE).']);
    instrSheet.addRow(['3. Subject Code is required for every row and must match Subject Master (e.g. SECV1010, SOESH1020).']);
    instrSheet.addRow(['4. Enrollment No. From and To define the enrollment range corresponding to sequential subject roll numbers.']);
    instrSheet.addRow(['5. Total Count must represent the number of students in that block.']);
    instrSheet.addRow(['6. Block No. is the physical examination block sequence number (integer: 1, 2, 3...).']);
    instrSheet.addRow(['7. Subject Block must follow the format: SUBJECTCODE(BLOCKNUMBER), e.g. SECV1010(1), SECV1010(2).']);
    instrSheet.addRow(['8. Do not mix different subjects within the same block.']);
    instrSheet.addRow(['9. Roll numbers must be continuous and sequential within each subject.']);
    instrSheet.getColumn(1).width = 100;

    return workbook;
  }

  // Standard 7 columns for Regular Exam
  sheet.getCell('A1').value = 'Classroom No.';
  sheet.getCell('B1').value = 'Branch';
  sheet.getCell('C1').value = 'Enrollment No.';
  sheet.getCell('E1').value = 'Total Count';
  sheet.getCell('F1').value = 'Block No.';
  sheet.getCell('G1').value = 'Subject Block';

  sheet.getCell('C2').value = 'From';
  sheet.getCell('D2').value = 'To';

  sheet.mergeCells('A1:A2');
  sheet.mergeCells('B1:B2');
  sheet.mergeCells('C1:D1');
  sheet.mergeCells('E1:E2');
  sheet.mergeCells('F1:F2');
  sheet.mergeCells('G1:G2');

  const headerCells = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2', 'F1', 'F2', 'G1', 'G2'];
  headerCells.forEach(cellAddress => {
    const cell = sheet.getCell(cellAddress);
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  // Sample data
  sheet.addRow(['H501', 'CV', '26CV3X001', '26CV3X035', 35, 1, 1]);
  sheet.addRow(['BX201', 'CV', '26CV3X036', '26CV3X070', 35, 2, 2]);
  sheet.addRow(['BX202', 'CV', '26CV3X071', '26CV3X090', 20, 3, 3]);
  sheet.addRow(['H801', 'IT', '26IT3X001', '26IT3X030', 30, 4, 1]);

  sheet.columns = [
    { width: 18 }, // Classroom No.
    { width: 12 }, // Branch
    { width: 18 }, // From
    { width: 18 }, // To
    { width: 15 }, // Total Count
    { width: 12 }, // Block No.
    { width: 15 }, // Subject Block
  ];

  sheet.views = [{ state: 'frozen', ySplit: 2 }];

  // Sheet 2: Instructions
  const instrSheet = workbook.addWorksheet('Instructions');
  instrSheet.addRow(['Instructions for Seating Arrangement Upload']);
  instrSheet.getCell('A1').font = { bold: true, size: 14 };
  instrSheet.addRow([]);
  instrSheet.addRow(['1. Classroom No. must be valid.']);
  instrSheet.addRow(['2. Branch must match Admin/student data.']);
  instrSheet.addRow(['3. Enrollment From and To define the enrollment range.']);
  instrSheet.addRow(['4. Total Count should represent the number of students expected in that block.']);
  instrSheet.addRow(['5. Block No. is the physical examination block number (integer).']);
  instrSheet.addRow(['6. Subject Block is the fixed block position number (integer only, e.g. 1, 2, 3). Do NOT enter "1 of 3".']);
  instrSheet.addRow(['7. Do not change the header names.']);
  instrSheet.addRow(['8. Do not add/remove columns.']);
  instrSheet.addRow(['9. Enrollment numbers must belong to existing Admin exam data.']);
  instrSheet.addRow(['10. Do not create overlapping ranges.']);
  instrSheet.addRow(['11. Do not duplicate students across blocks.']);
  instrSheet.getColumn(1).width = 100;

  return workbook;
}

/**
 * Parse and validate seating arrangement Excel
 * Supports both 7-column (Regular) and 8-column (Improvement with Subject Code) formats
 */
async function parseAndValidateSeatingExcel(buffer, examId) {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  const isImprovement = exam?.type === 'IMPROVEMENT' || (exam?.name && exam.name.toLowerCase().includes('improvement'));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(1);

  if (!sheet) {
    return { valid: false, errors: [{ row: 0, message: 'Invalid workbook structure. Sheet 1 missing.' }] };
  }

  const row1 = sheet.getRow(1);
  const row2 = sheet.getRow(2);

  const hA1 = String(row1.getCell(1).value || '').trim();
  const hB1 = String(row1.getCell(2).value || '').trim();
  const hC1 = String(row1.getCell(3).value || '').trim();

  // Detect if 8-column format with Subject Code
  const hasSubjectCodeCol = hC1.toLowerCase().includes('subject');

  let colMap = {};
  if (hasSubjectCodeCol) {
    colMap = {
      classroom: 1,
      branch: 2,
      subjectCode: 3,
      from: 4,
      to: 5,
      totalCount: 6,
      blockNo: 7,
      subjectBlock: 8
    };
  } else {
    colMap = {
      classroom: 1,
      branch: 2,
      subjectCode: null,
      from: 3,
      to: 4,
      totalCount: 5,
      blockNo: 6,
      subjectBlock: 7
    };
  }

  // Header validation
  if (!hA1.includes('Classroom') || !hB1.includes('Branch')) {
    return { valid: false, errors: [{ row: 0, message: 'Invalid seating arrangement template. Missing Classroom No. or Branch column.' }] };
  }

  // Pre-load subject roll mappings for Improvement Exam
  const subjectRollToEnr = new Map();
  const subjectEnrToRoll = new Map();

  if (isImprovement) {
    const schedules = await prisma.examSchedule.findMany({
      where: { examId },
      select: { subjectCode: true },
    });
    for (const s of schedules) {
      if (!subjectRollToEnr.has(s.subjectCode)) {
        const rollMap = await getSubjectRollNumberMap(examId, s.subjectCode);
        const revMap = new Map();
        for (const [enr, r] of rollMap.entries()) {
          revMap.set(r, enr);
        }
        subjectRollToEnr.set(s.subjectCode, revMap);
        subjectEnrToRoll.set(s.subjectCode, rollMap);
      }
    }
  }

  const arrangements = [];
  const errors = [];
  let blockNumberCounter = 1;

  sheet.eachRow((row, rowNum) => {
    if (rowNum <= 2) return; // skip header

    const classroom = String(row.getCell(colMap.classroom).value || '').trim();
    const branch = String(row.getCell(colMap.branch).value || '').trim();
    const rawFrom = row.getCell(colMap.from).value;
    const rawTo = row.getCell(colMap.to).value;
    const totalCount = parseInt(row.getCell(colMap.totalCount).value);
    const subjectCode = colMap.subjectCode ? String(row.getCell(colMap.subjectCode).value || '').trim() : '';

    if (!classroom && (rawFrom === null || rawFrom === undefined) && (rawTo === null || rawTo === undefined)) return;

    if (!classroom) errors.push({ row: rowNum, message: 'Missing Classroom No.' });
    if (!branch) errors.push({ row: rowNum, message: 'Missing Branch.' });
    if (isImprovement && hasSubjectCodeCol && !subjectCode) {
      errors.push({ row: rowNum, message: 'Missing Subject Code for Improvement Exam.' });
    }
    if (rawFrom === null || rawFrom === undefined || rawTo === null || rawTo === undefined || String(rawFrom).trim() === '' || String(rawTo).trim() === '') {
      errors.push({ row: rowNum, message: 'Missing enrollment/roll range (From/To).' });
    }
    if (isNaN(totalCount) || totalCount <= 0) errors.push({ row: rowNum, message: 'Invalid Total Count.' });

    const isNumericFrom = /^\d+$/.test(String(rawFrom !== null && rawFrom !== undefined ? rawFrom : '').trim());
    const isNumericTo = /^\d+$/.test(String(rawTo !== null && rawTo !== undefined ? rawTo : '').trim());

    let fromEnrollment = String(rawFrom !== null && rawFrom !== undefined ? rawFrom : '').trim();
    let toEnrollment = String(rawTo !== null && rawTo !== undefined ? rawTo : '').trim();
    let fromRoll = null;
    let toRoll = null;

    if (isNumericFrom && isNumericTo) {
      fromRoll = parseInt(rawFrom);
      toRoll = parseInt(rawTo);
      if (fromRoll > toRoll) {
        errors.push({ row: rowNum, message: `From Roll No. (${fromRoll}) cannot be greater than To Roll No. (${toRoll}).` });
      }
      if (subjectCode && subjectRollToEnr.has(subjectCode)) {
        const revMap = subjectRollToEnr.get(subjectCode);
        fromEnrollment = revMap.get(fromRoll) || fromEnrollment;
        toEnrollment = revMap.get(toRoll) || toEnrollment;
      }
    }

    // Parse Block No.
    let blockNumber;
    const rawBlockNo = row.getCell(colMap.blockNo).value;
    if (rawBlockNo !== null && rawBlockNo !== undefined && String(rawBlockNo).trim() !== '') {
      blockNumber = parseInt(rawBlockNo);
      if (isNaN(blockNumber) || blockNumber <= 0 || !Number.isInteger(parseFloat(rawBlockNo))) {
        errors.push({ row: rowNum, message: `Invalid Block No.: "${rawBlockNo}". Must be a positive integer.` });
        blockNumber = blockNumberCounter;
      }
    } else {
      blockNumber = blockNumberCounter;
    }

    // Parse Subject Block
    let subjectBlock = blockNumberCounter;
    let subjectBlockStr = '';
    const rawSubjectBlock = String(row.getCell(colMap.subjectBlock).value || '').trim();

    if (rawSubjectBlock) {
      subjectBlockStr = rawSubjectBlock;
      const parenMatch = rawSubjectBlock.match(/\((\d+)\)/);
      if (parenMatch) {
        subjectBlock = parseInt(parenMatch[1]);
      } else {
        const parsedInt = parseInt(rawSubjectBlock);
        if (!isNaN(parsedInt) && parsedInt > 0) {
          subjectBlock = parsedInt;
          if (subjectCode) subjectBlockStr = `${subjectCode}(${parsedInt})`;
        } else {
          errors.push({ row: rowNum, message: `Invalid Subject Block: "${rawSubjectBlock}". Expected format like ${subjectCode || 'SUBJECT'}(1) or an integer.` });
        }
      }
    } else {
      subjectBlock = blockNumberCounter;
      subjectBlockStr = subjectCode ? `${subjectCode}(${subjectBlock})` : String(blockNumberCounter);
    }

    blockNumberCounter++;

    arrangements.push({
      rowNum,
      blockNumber,
      subjectBlock,
      subjectBlockStr,
      subjectCode,
      classroom,
      branch,
      fromRoll,
      toRoll,
      fromEnrollment,
      toEnrollment,
      totalCount: totalCount || 0,
      actualCount: 0,
      status: 'Valid'
    });
  });

  // Overlapping check within the same subject (or global if regular)
  for (let i = 0; i < arrangements.length; i++) {
    for (let j = i + 1; j < arrangements.length; j++) {
      const a = arrangements[i];
      const b = arrangements[j];
      const sameSubject = (a.subjectCode && b.subjectCode) ? (a.subjectCode === b.subjectCode) : true;
      if (sameSubject) {
        if (a.fromRoll !== null && a.toRoll !== null && b.fromRoll !== null && b.toRoll !== null) {
          if (a.fromRoll <= b.toRoll && b.fromRoll <= a.toRoll) {
            errors.push({
              row: 0,
              message: `Overlapping roll number range${a.subjectCode ? ' for ' + a.subjectCode : ''}: Row ${a.rowNum} and Row ${b.rowNum} (${a.fromRoll}-${a.toRoll} vs ${b.fromRoll}-${b.toRoll})`,
            });
          }
        } else if (a.fromEnrollment && b.fromEnrollment && a.toEnrollment && b.toEnrollment) {
          if (a.fromEnrollment <= b.toEnrollment && b.fromEnrollment <= a.toEnrollment) {
            errors.push({
              row: 0,
              message: `Overlapping enrollment range${a.subjectCode ? ' for ' + a.subjectCode : ''}: Row ${a.rowNum} and Row ${b.rowNum} (${a.fromEnrollment}-${a.toEnrollment} vs ${b.fromEnrollment}-${b.toEnrollment})`,
            });
          }
        }
      }
    }
  }

  // Calculate actual counts using DB
  for (const arr of arrangements) {
    let actualStudents = 0;

    if (arr.fromRoll !== null && arr.toRoll !== null && arr.subjectCode && subjectEnrToRoll.has(arr.subjectCode)) {
      const enrToRoll = subjectEnrToRoll.get(arr.subjectCode);
      for (const [enr, r] of enrToRoll.entries()) {
        if (r >= arr.fromRoll && r <= arr.toRoll) {
          actualStudents++;
        }
      }
    } else if (arr.fromEnrollment && arr.toEnrollment) {
      if (arr.subjectCode) {
        actualStudents = await prisma.studentExamSubject.count({
          where: {
            examSchedule: { examId, subjectCode: arr.subjectCode },
            examStudentData: {
              enrollmentNumber: {
                gte: arr.fromEnrollment,
                lte: arr.toEnrollment,
              },
            },
          },
        });
      } else {
        actualStudents = await prisma.examStudentData.count({
          where: {
            examId,
            enrollmentNumber: {
              gte: arr.fromEnrollment,
              lte: arr.toEnrollment,
            },
          },
        });
      }
    }

    arr.actualCount = actualStudents;

    if (arr.actualCount !== arr.totalCount) {
      arr.status = 'Warning';
      errors.push({
        row: arr.rowNum,
        message: `Classroom ${arr.classroom}${arr.subjectCode ? ' (' + arr.subjectCode + ')' : ''}: Expected ${arr.totalCount} students, but found ${arr.actualCount} in database.`
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: arrangements,
    summary: {
      totalBlocks: arrangements.length,
      errors: errors.length
    }
  };
}

/**
 * Commit seating arrangement to database
 */
async function commitSeatingData(examId, arrangements, userId) {
  return await prisma.$transaction(async (tx) => {
    await tx.seatingArrangement.deleteMany({ where: { examId } });
    await tx.blockAssignment.deleteMany({ where: { examId } });

    // Mark existing block reports and hall ticket generations as outdated
    await tx.blockReportGeneration.updateMany({
      where: { examId, isOutdated: false },
      data: { isOutdated: true }
    });
    await tx.hallTicketGeneration.updateMany({
      where: { examId, isOutdated: false },
      data: { isOutdated: true }
    });

    const assignmentMap = new Map();

    for (const arr of arrangements) {
      const subjectBlockDisplay = arr.subjectBlockStr || (arr.subjectCode ? `${arr.subjectCode}(${arr.subjectBlock})` : String(arr.subjectBlock));

      await tx.seatingArrangement.create({
        data: { 
          examId, 
          blockNumber: arr.blockNumber,
          subjectBlock: arr.subjectBlock || 0,
          subjectBlockStr: subjectBlockDisplay,
          subjectCode: arr.subjectCode || null,
          classroom: arr.classroom,
          fromEnrollment: arr.fromEnrollment,
          toEnrollment: arr.toEnrollment,
          blockCount: arr.totalCount || arr.blockCount || 0
        },
      });

      // Find all students in this range
      let enrollments = [];
      if (arr.fromRoll !== null && arr.fromRoll !== undefined && arr.toRoll !== null && arr.toRoll !== undefined && arr.subjectCode) {
        const rollMap = await getSubjectRollNumberMap(examId, arr.subjectCode);
        for (const [enr, r] of rollMap.entries()) {
          if (r >= arr.fromRoll && r <= arr.toRoll) {
            enrollments.push(enr);
          }
        }
      } else if (arr.subjectCode) {
        const studentSubjects = await tx.studentExamSubject.findMany({
          where: {
            examSchedule: { examId, subjectCode: arr.subjectCode },
            examStudentData: {
              enrollmentNumber: {
                gte: arr.fromEnrollment,
                lte: arr.toEnrollment,
              },
            },
          },
          select: { examStudentData: { select: { enrollmentNumber: true } } },
          orderBy: { examStudentData: { enrollmentNumber: 'asc' } },
        });
        enrollments = studentSubjects.map(s => s.examStudentData.enrollmentNumber);
      } else {
        const students = await tx.examStudentData.findMany({
          where: {
            examId,
            enrollmentNumber: {
              gte: arr.fromEnrollment,
              lte: arr.toEnrollment,
            },
          },
          select: { enrollmentNumber: true },
          orderBy: { enrollmentNumber: 'asc' },
        });
        enrollments = students.map(s => s.enrollmentNumber);
      }

      for (const enr of enrollments) {
        if (!assignmentMap.has(enr)) {
          assignmentMap.set(enr, {
            examId,
            enrollmentNumber: enr,
            blockNumber: arr.blockNumber,
            classroom: arr.classroom,
          });
        }
      }
    }

    // Bulk create block assignments in chunks of 500
    const assignments = Array.from(assignmentMap.values());
    for (let i = 0; i < assignments.length; i += 500) {
      await tx.blockAssignment.createMany({
        data: assignments.slice(i, i + 500),
        skipDuplicates: true,
      });
    }

    return { blocks: arrangements.length };
  }, { timeout: 45000 });
}

/**
 * Generate subject-wise classroom allocations for Improvement Exam
 * Allocates students sequentially by roll number into approved classrooms
 */
async function generateImprovementSeatingAllocations(examId) {
  const schedules = await prisma.examSchedule.findMany({
    where: { examId },
    orderBy: { subjectCode: 'asc' },
    include: {
      subjects: {
        include: {
          examStudentData: true,
        },
      },
    },
  });

  // Group student registrations across schedules by subjectCode
  const subjectsMap = new Map();
  for (const schedule of schedules) {
    const code = schedule.subjectCode;
    if (!subjectsMap.has(code)) {
      subjectsMap.set(code, []);
    }
    const students = schedule.subjects.map(s => s.examStudentData).filter(Boolean);
    subjectsMap.get(code).push(...students);
  }

  const allocations = [];
  let globalBlockNumber = 1;
  let roomIndex = 0;

  for (const [subjectCode, rawStudents] of subjectsMap.entries()) {
    const rollMap = await getSubjectRollNumberMap(examId, subjectCode);

    // Deduplicate by enrollment within this subject
    const studentMap = new Map();
    rawStudents.forEach(s => {
      if (!studentMap.has(s.enrollmentNumber)) {
        studentMap.set(s.enrollmentNumber, s);
      }
    });

    const uniqueStudents = Array.from(studentMap.values());
    // Sort students by subject roll number ascending, then enrollment
    uniqueStudents.sort((a, b) => {
      const rollA = rollMap.get(a.enrollmentNumber) || 999999;
      const rollB = rollMap.get(b.enrollmentNumber) || 999999;
      if (rollA !== rollB) return rollA - rollB;
      return a.enrollmentNumber.localeCompare(b.enrollmentNumber, undefined, { numeric: true });
    });

    if (uniqueStudents.length === 0) continue;

    const blockSize = DEFAULT_CLASSROOM_CAPACITY; // 35 per block
    let subjectBlockCounter = 1;

    for (let i = 0; i < uniqueStudents.length; i += blockSize) {
      const slice = uniqueStudents.slice(i, i + blockSize);
      const fromEnrollment = slice[0].enrollmentNumber;
      const toEnrollment = slice[slice.length - 1].enrollmentNumber;
      const classroom = APPROVED_CLASSROOMS[roomIndex % APPROVED_CLASSROOMS.length];
      roomIndex++;

      const branch = slice[0].program || 'SOE';
      const subjectBlockStr = `${subjectCode}(${subjectBlockCounter})`;

      allocations.push({
        blockNumber: globalBlockNumber,
        subjectBlock: subjectBlockCounter,
        subjectBlockStr,
        subjectCode,
        classroom,
        branch,
        fromEnrollment,
        toEnrollment,
        totalCount: slice.length,
        actualCount: slice.length,
      });

      globalBlockNumber++;
      subjectBlockCounter++;
    }
  }

  return allocations;
}

/**
 * Validate seating allocations before export (Section 8 rules)
 */
async function validateSeatingBeforeExport(examId, allocations) {
  const errors = [];
  const warnings = [];

  if (!allocations || allocations.length === 0) {
    errors.push('No seating allocations found for this examination.');
    return { valid: false, errors, warnings };
  }

  // 1. All subject registrations are allocated
  const schedules = await prisma.examSchedule.findMany({
    where: { examId },
    include: {
      subjects: { select: { id: true } }
    }
  });

  const allocatedSubjects = new Set(allocations.map(a => a.subjectCode).filter(Boolean));
  for (const sched of schedules) {
    if (sched.subjects.length > 0 && !allocatedSubjects.has(sched.subjectCode)) {
      errors.push(`Subject ${sched.subjectCode} has ${sched.subjects.length} registered students but no seating allocation.`);
    }
  }

  // Group allocations by subject
  const allocationsBySubject = {};
  for (const arr of allocations) {
    if (!arr.subjectCode) {
      errors.push(`Block ${arr.blockNumber} in classroom ${arr.classroom} is missing Subject Code.`);
      continue;
    }
    if (!allocationsBySubject[arr.subjectCode]) {
      allocationsBySubject[arr.subjectCode] = [];
    }
    allocationsBySubject[arr.subjectCode].push(arr);
  }

  // Validate each subject's allocations
  for (const [subjCode, arrs] of Object.entries(allocationsBySubject)) {
    const rollMap = await getSubjectRollNumberMap(examId, subjCode);

    arrs.forEach((a, idx) => {
      // Check Subject Block format
      const expectedBlockNum = idx + 1;
      const expectedBlockStr = `${subjCode}(${expectedBlockNum})`;
      if (a.subjectBlockStr && !a.subjectBlockStr.includes(String(expectedBlockNum))) {
        warnings.push(`Subject ${subjCode}: Block ${a.blockNumber} subject block label "${a.subjectBlockStr}" may not match sequence number ${expectedBlockNum}.`);
      }

      // Check enrollment from/to
      const fromRoll = rollMap.get(a.fromEnrollment);
      const toRoll = rollMap.get(a.toEnrollment);

      if (fromRoll === undefined || toRoll === undefined) {
        warnings.push(`Subject ${subjCode}: Enrollment range (${a.fromEnrollment} - ${a.toEnrollment}) contains unmapped enrollment.`);
      } else if (fromRoll > toRoll) {
        errors.push(`Subject ${subjCode}: Inverted enrollment range in Block ${a.blockNumber} (${a.fromEnrollment} [Roll ${fromRoll}] > ${a.toEnrollment} [Roll ${toRoll}]).`);
      }

      // Check classroom capacity
      if ((a.totalCount || a.blockCount) > 40) {
        warnings.push(`Classroom ${a.classroom} has ${a.totalCount || a.blockCount} students, which may exceed single-block capacity.`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Generate Seating Arrangement Excel Export
 * For Improvement Exam: 8 columns, exact sample layout, subject-wise roll ranges
 * For Regular Exam: standard 7 columns
 */
async function generateSeatingExportExcel(examId) {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw new Error('Exam not found.');

  const isImprovement = exam.type === 'IMPROVEMENT' || (exam.name && exam.name.toLowerCase().includes('improvement'));

  if (!isImprovement) {
    // Preserve existing Regular Exam export exactly as is
    const arrangements = await prisma.seatingArrangement.findMany({
      where: { examId },
      orderBy: { blockNumber: 'asc' },
    });

    if (arrangements.length === 0) {
      throw new Error('No seating arrangements found for this exam.');
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Seating Arrangement');

    sheet.getCell('A1').value = 'Classroom No.';
    sheet.getCell('B1').value = 'Branch';
    sheet.getCell('C1').value = 'Enrollment No.';
    sheet.getCell('E1').value = 'Total Count';
    sheet.getCell('F1').value = 'Block No.';
    sheet.getCell('G1').value = 'Subject Block';

    sheet.getCell('C2').value = 'From';
    sheet.getCell('D2').value = 'To';

    sheet.mergeCells('A1:A2');
    sheet.mergeCells('B1:B2');
    sheet.mergeCells('C1:D1');
    sheet.mergeCells('E1:E2');
    sheet.mergeCells('F1:F2');
    sheet.mergeCells('G1:G2');

    const headerCells = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2', 'F1', 'F2', 'G1', 'G2'];
    headerCells.forEach(cellAddress => {
      const cell = sheet.getCell(cellAddress);
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    for (const arr of arrangements) {
      const firstStudent = await prisma.examStudentData.findFirst({
        where: {
          examId,
          enrollmentNumber: { gte: arr.fromEnrollment, lte: arr.toEnrollment },
        },
        select: { program: true },
        orderBy: { enrollmentNumber: 'asc' },
      });
      const branch = firstStudent?.program || '';

      sheet.addRow([
        arr.classroom,
        branch,
        arr.fromEnrollment,
        arr.toEnrollment,
        arr.blockCount,
        arr.blockNumber,
        arr.subjectBlock,
      ]);
    }

    sheet.columns = [
      { width: 18 },
      { width: 12 },
      { width: 18 },
      { width: 18 },
      { width: 15 },
      { width: 12 },
      { width: 15 },
    ];

    sheet.views = [{ state: 'frozen', ySplit: 2 }];
    return workbook;
  }

  // ──────────────────────────────────────────────
  // IMPROVEMENT EXAM EXPORT
  // ──────────────────────────────────────────────
  let arrangements = await prisma.seatingArrangement.findMany({
    where: { examId },
    orderBy: { blockNumber: 'asc' },
  });

  // If no arrangements exist or arrangements lack subjectCode, auto-generate allocations
  if (arrangements.length === 0 || !arrangements.some(a => a.subjectCode)) {
    const generated = await generateImprovementSeatingAllocations(examId);
    if (generated.length === 0) {
      throw new Error('No students or subjects registered for this Improvement Exam.');
    }

    if (arrangements.length === 0) {
      await commitSeatingData(examId, generated, 'system');
      arrangements = await prisma.seatingArrangement.findMany({
        where: { examId },
        orderBy: { blockNumber: 'asc' },
      });
    } else {
      arrangements = generated;
    }
  }

  // Pre-export validation
  const validation = await validateSeatingBeforeExport(examId, arrangements);
  if (!validation.valid && validation.errors.length > 0) {
    throw new Error('Seating validation failed before export:\n' + validation.errors.join('\n'));
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Seating Arrangement');

  // Row 1
  sheet.getCell('A1').value = 'Classroom No.';
  sheet.getCell('B1').value = 'Branch';
  sheet.getCell('C1').value = 'Subject Code';
  sheet.getCell('D1').value = 'Enrollment No.';
  sheet.getCell('F1').value = 'Total Count';
  sheet.getCell('G1').value = 'Block No.';
  sheet.getCell('H1').value = 'Subject Block';

  // Row 2
  sheet.getCell('D2').value = 'From';
  sheet.getCell('E2').value = 'To';

  sheet.mergeCells('A1:A2');
  sheet.mergeCells('B1:B2');
  sheet.mergeCells('C1:C2');
  sheet.mergeCells('D1:E1');
  sheet.mergeCells('F1:F2');
  sheet.mergeCells('G1:G2');
  sheet.mergeCells('H1:H2');

  const headerCells = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2', 'F1', 'F2', 'G1', 'G2', 'H1', 'H2'];
  headerCells.forEach(cellAddress => {
    const cell = sheet.getCell(cellAddress);
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF2F2F2' }
    };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  // Populate data rows
  for (const arr of arrangements) {
    let branch = arr.branch;
    if (!branch) {
      const firstStudent = await prisma.examStudentData.findFirst({
        where: {
          examId,
          enrollmentNumber: { gte: arr.fromEnrollment, lte: arr.toEnrollment },
        },
        select: { program: true },
        orderBy: { enrollmentNumber: 'asc' },
      });
      branch = firstStudent?.program || 'SOE';
    }

    const subjectBlockDisplay = arr.subjectBlockStr || (arr.subjectCode ? `${arr.subjectCode}(${arr.subjectBlock})` : String(arr.subjectBlock));
    const totalCount = arr.totalCount || arr.blockCount || 0;

    const row = sheet.addRow([
      arr.classroom,
      branch,
      arr.subjectCode || '—',
      arr.fromEnrollment,
      arr.toEnrollment,
      totalCount,
      arr.blockNumber,
      subjectBlockDisplay,
    ]);

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
      };
      if ([1, 2, 3, 4, 5, 6, 7, 8].includes(colNumber)) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
  }

  sheet.columns = [
    { width: 18 }, // Classroom No.
    { width: 14 }, // Branch
    { width: 18 }, // Subject Code
    { width: 18 }, // From
    { width: 18 }, // To
    { width: 15 }, // Total Count
    { width: 12 }, // Block No.
    { width: 22 }, // Subject Block
  ];

  sheet.views = [{ state: 'frozen', ySplit: 2 }];
  sheet.autoFilter = `A2:H${arrangements.length + 2}`;

  return workbook;
}

module.exports = {
  generateSeatingSampleExcel,
  parseAndValidateSeatingExcel,
  commitSeatingData,
  validateSeatingBeforeExport,
  generateImprovementSeatingAllocations,
  generateSeatingExportExcel,
};
