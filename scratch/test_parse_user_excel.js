const ExcelJS = require('exceljs');
const fs = require('fs');

async function testParse() {
  const filePath = 'c:/Users/Dharmesh Purani/Downloads/Students_Exam_Data_In_Upload_Format_With_RollNo.xlsx';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const dataSheet = workbook.getWorksheet('Student Data') || workbook.worksheets[0];

  const headers = [];
  dataSheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    let strValue = '';
    const rawValue = cell.value;
    if (rawValue instanceof Date) {
      const dd = String(rawValue.getDate()).padStart(2, '0');
      const mm = String(rawValue.getMonth() + 1).padStart(2, '0');
      const yyyy = rawValue.getFullYear();
      strValue = `${dd}-${mm}-${yyyy}`;
    } else {
      strValue = String(cell.text || rawValue || '').trim();
      if (strValue.includes('/')) strValue = strValue.replace(/\//g, '-');
      if (/^\d{4}-\d{2}-\d{2}$/.test(strValue)) {
        const parts = strValue.split('-');
        strValue = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    headers.push({ col: colNumber, value: strValue });
  });

  console.log('Processed Headers:');
  headers.forEach(h => console.log(`  Col ${h.col}: ${h.value}`));

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

  console.log('Date Columns detected:');
  dateColumns.forEach(d => console.log(`  Date ${d.value} at Col ${d.col}, RollNo Col: ${d.rollNoCol}`));

  // Check first 3 rows
  for (let r = 2; r <= 5; r++) {
    const row = dataSheet.getRow(r);
    const enr = row.getCell(5).value;
    const name = row.getCell(6).value;
    const applied = [];
    dateColumns.forEach(dc => {
      const sub = row.getCell(dc.col).value;
      if (sub) {
        const roll = dc.rollNoCol ? row.getCell(dc.rollNoCol).value : null;
        applied.push({ date: dc.value, sub, roll });
      }
    });
    console.log(`Row ${r}: ${enr} (${name}) ->`, applied);
  }
}

testParse().catch(console.error);
