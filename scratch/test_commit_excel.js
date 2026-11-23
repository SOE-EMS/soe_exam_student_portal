const prisma = require('../src/config/database');
const { commitExcelData } = require('../src/services/excel.service');

async function testCommit() {
  console.log('Testing commitExcelData with mock data...');

  // Find or create an improvement exam
  let exam = await prisma.exam.findFirst({
    where: { type: 'IMPROVEMENT' },
    include: { academicYear: true }
  });

  if (!exam) {
    const ay = await prisma.academicYear.findFirst();
    exam = await prisma.exam.create({
      data: {
        name: 'Test Improvement Exam',
        academicYearId: ay.id,
        type: 'IMPROVEMENT',
      },
      include: { academicYear: true }
    });
  }

  // Ensure subject master has test subjects
  await prisma.subjectMaster.upsert({
    where: { subjectCode: 'TEST101' },
    create: { subjectCode: 'TEST101', subjectName: 'Test Subject 1' },
    update: {},
  });
  await prisma.subjectMaster.upsert({
    where: { subjectCode: 'TEST102' },
    create: { subjectCode: 'TEST102', subjectName: 'Test Subject 2' },
    update: {},
  });

  const mockParsedData = {
    newRecords: [
      {
        rowNumber: 2,
        academicYear: exam.academicYear.name,
        semester: 1,
        program: 'B.Tech',
        enrollment: 'TESTENR001',
        name: 'Test Student 1',
        division: 'A',
        attendance: 85,
        feesStatus: 'Paid',
        studentEmailId: 'teststudent1@example.com',
        subjects: [
          { dateStr: '24-11-2026', subjectCode: 'TEST101', subjectName: 'Test Subject 1', time: '10:00 AM TO 1:00 PM' },
          { dateStr: '25-11-2026', subjectCode: 'TEST102', subjectName: 'Test Subject 2', time: '10:00 AM TO 1:00 PM' },
        ]
      },
      {
        rowNumber: 3,
        academicYear: exam.academicYear.name,
        semester: 1,
        program: 'B.Tech',
        enrollment: 'TESTENR002',
        name: 'Test Student 2',
        division: 'A',
        attendance: 90,
        feesStatus: 'Paid',
        studentEmailId: 'teststudent2@example.com',
        subjects: [
          { dateStr: '24-11-2026', subjectCode: 'TEST101', subjectName: 'Test Subject 1', time: '10:00 AM TO 1:00 PM' },
        ]
      }
    ],
    updateRecords: [],
    dateColumns: ['24-11-2026', '25-11-2026']
  };

  try {
    const res = await commitExcelData(exam.id, mockParsedData, 'admin-test-id');
    console.log('commitExcelData succeeded:', res);

    // Verify created data
    const students = await prisma.examStudentData.findMany({
      where: { examId: exam.id, enrollmentNumber: { in: ['TESTENR001', 'TESTENR002'] } },
      include: { subjects: { include: { examSchedule: true } } }
    });
    console.log(`Found ${students.length} students created.`);
    students.forEach(s => {
      console.log(`Student ${s.enrollmentNumber}: ${s.subjects.length} subjects`);
      s.subjects.forEach(subj => {
        console.log(`  - ${subj.examSchedule.subjectCode}: Roll No = ${subj.rollNumber}`);
      });
    });

    // Cleanup test data
    await prisma.examStudentData.deleteMany({
      where: { examId: exam.id, enrollmentNumber: { in: ['TESTENR001', 'TESTENR002'] } }
    });
    console.log('Cleanup completed successfully.');
  } catch (err) {
    console.error('commitExcelData failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testCommit();
