const ExcelJS = require('exceljs');
const prisma = require('../config/database');

async function generateSeatingSampleExcel() {
  const workbook = new ExcelJS.Workbook();
  
  // Sheet 1: Seating Arrangement Template
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

async function parseAndValidateSeatingExcel(buffer, examId) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(1);

  if (!sheet) {
    return { valid: false, errors: [{ row: 0, message: 'Invalid workbook structure. Sheet 1 missing.' }] };
  }

  const row1 = sheet.getRow(1);
  const row2 = sheet.getRow(2);

  const hA1 = String(row1.getCell(1).value || '').trim();
  const hC1 = String(row1.getCell(3).value || '').trim();
  const hC2 = String(row2.getCell(3).value || '').trim();
  const hD2 = String(row2.getCell(4).value || '').trim();
  const hE1 = String(row1.getCell(5).value || '').trim();
  const hF1 = String(row1.getCell(6).value || '').trim();
  const hG1 = String(row1.getCell(7).value || '').trim();

  // Validate required headers — Block No. and Subject Block are optional for backward compat
  if (!hA1.includes('Classroom') || !hC1.includes('nrolment No') && !hC1.includes('nrollment No') || !hC2.includes('From') || !hD2.includes('To') || !hE1.includes('Total Count')) {
    return { valid: false, errors: [{ row: 0, message: 'Invalid seating arrangement template. Please download and use the latest Sample Seating Arrangement Excel file.' }] };
  }

  const hasBlockNoCol = hF1.includes('Block No');
  const hasSubjectBlockCol = hG1.includes('Subject Block');

  const arrangements = [];
  const errors = [];
  
  let blockNumberCounter = 1;

  sheet.eachRow((row, rowNum) => {
    if (rowNum <= 2) return; // skip header

    const classroom = String(row.getCell(1).value || '').trim();
    const branch = String(row.getCell(2).value || '').trim();
    const fromEnrollment = String(row.getCell(3).value || '').trim();
    const toEnrollment = String(row.getCell(4).value || '').trim();
    const totalCount = parseInt(row.getCell(5).value);

    if (!classroom && !fromEnrollment && !toEnrollment) return;

    if (!classroom) errors.push({ row: rowNum, message: 'Missing Classroom No.' });
    if (!branch) errors.push({ row: rowNum, message: 'Missing Branch.' });
    if (!fromEnrollment || !toEnrollment) errors.push({ row: rowNum, message: 'Missing enrollment range (From/To).' });
    if (isNaN(totalCount) || totalCount <= 0) errors.push({ row: rowNum, message: 'Invalid Total Count.' });

    // Parse Block No.
    let blockNumber;
    if (hasBlockNoCol) {
      const rawBlockNo = row.getCell(6).value;
      blockNumber = parseInt(rawBlockNo);
      if (isNaN(blockNumber) || blockNumber <= 0 || !Number.isInteger(parseFloat(rawBlockNo))) {
        errors.push({ row: rowNum, message: `Invalid Block No.: "${rawBlockNo}". Must be a positive integer.` });
        blockNumber = blockNumberCounter;
      }
    } else {
      blockNumber = blockNumberCounter;
    }

    // Parse Subject Block
    let subjectBlock;
    if (hasSubjectBlockCol) {
      const rawSubjectBlock = String(row.getCell(7).value || '').trim();
      subjectBlock = parseInt(rawSubjectBlock);
      
      // Validate: must be positive integer, NOT "1 of 3" format
      if (rawSubjectBlock.includes('of')) {
        errors.push({ row: rowNum, message: `Invalid Subject Block: "${rawSubjectBlock}". Enter a number only (e.g. 1), not "1 of 3".` });
        subjectBlock = blockNumberCounter;
      } else if (isNaN(subjectBlock) || subjectBlock <= 0 || !Number.isInteger(parseFloat(rawSubjectBlock))) {
        errors.push({ row: rowNum, message: `Invalid Subject Block: "${rawSubjectBlock}". Must be a positive integer.` });
        subjectBlock = blockNumberCounter;
      }
    } else {
      // Default: same as auto-incremented block number
      subjectBlock = blockNumberCounter;
    }

    blockNumberCounter++;

    arrangements.push({
      rowNum,
      blockNumber,
      subjectBlock,
      classroom,
      branch,
      fromEnrollment,
      toEnrollment,
      totalCount: totalCount || 0,
      actualCount: 0,
      status: 'Valid'
    });
  });

  // Validate overlapping ranges
  for (let i = 0; i < arrangements.length; i++) {
    for (let j = i + 1; j < arrangements.length; j++) {
      const a = arrangements[i];
      const b = arrangements[j];
      
      if (a.fromEnrollment && b.fromEnrollment && a.toEnrollment && b.toEnrollment) {
        if (a.fromEnrollment <= b.toEnrollment && b.fromEnrollment <= a.toEnrollment) {
          errors.push({
            row: 0,
            message: `Overlapping enrollment range: Row ${a.rowNum} and Row ${b.rowNum} (${a.fromEnrollment}-${a.toEnrollment} vs ${b.fromEnrollment}-${b.toEnrollment})`,
          });
        }
      }
    }
  }

  // Calculate actual counts using DB
  for (const arr of arrangements) {
    if (arr.fromEnrollment && arr.toEnrollment) {
      const actualStudents = await prisma.examStudentData.count({
        where: {
          examId,
          enrollmentNumber: {
            gte: arr.fromEnrollment,
            lte: arr.toEnrollment,
          },
        },
      });

      arr.actualCount = actualStudents;

      if (arr.actualCount !== arr.totalCount) {
        arr.status = 'Warning';
        errors.push({
          row: arr.rowNum,
          message: `Classroom ${arr.classroom}: Expected ${arr.totalCount} students, but found ${arr.actualCount} in database.`
        });
      }
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

    for (const arr of arrangements) {
      await tx.seatingArrangement.create({
        data: { 
          examId, 
          blockNumber: arr.blockNumber,
          subjectBlock: arr.subjectBlock,
          classroom: arr.classroom,
          fromEnrollment: arr.fromEnrollment,
          toEnrollment: arr.toEnrollment,
          blockCount: arr.totalCount
        },
      });

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

      for (const student of students) {
        await tx.blockAssignment.create({
          data: {
            examId,
            enrollmentNumber: student.enrollmentNumber,
            blockNumber: arr.blockNumber,
            classroom: arr.classroom,
          },
        });
      }
    }

    return { blocks: arrangements.length };
  });
}

async function generateSeatingExportExcel(examId) {
  const arrangements = await prisma.seatingArrangement.findMany({
    where: { examId },
    orderBy: { blockNumber: 'asc' },
  });

  if (arrangements.length === 0) {
    throw new Error('No seating arrangements found for this exam.');
  }

  // Get branch info from student data per block
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

  // Get branch data from student data
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

  return workbook;
}

module.exports = {
  generateSeatingSampleExcel,
  parseAndValidateSeatingExcel,
  commitSeatingData,
  generateSeatingExportExcel
};
