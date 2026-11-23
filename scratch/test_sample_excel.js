const prisma = require('../src/config/database');
const { generateSampleExcel } = require('../src/services/excel.service');

async function testSample() {
  console.log('Testing generateSampleExcel...');
  const exam = await prisma.exam.findFirst();
  if (!exam) return console.log('No exam found');

  const wb = await generateSampleExcel(exam.id);
  const sheet = wb.getWorksheet('Student Data');
  const headers = [];
  sheet.getRow(1).eachCell((cell, col) => {
    headers.push({ col, header: cell.value });
  });

  console.log('Sample Template Headers:');
  headers.forEach(h => console.log(`  Col ${h.col}: ${h.header}`));

  const row2 = [];
  sheet.getRow(2).eachCell((cell, col) => {
    row2.push({ col, val: cell.value });
  });
  console.log('Sample Row 2:');
  row2.forEach(r => console.log(`  Col ${r.col}: ${r.val}`));

  await prisma.$disconnect();
}

testSample().catch(console.error);
