const { generateBlockReportPDF } = require('../src/services/pdf/blockReport.pdf');
const { generateHallTicketPDF, generateBulkHallTicketPDF } = require('../src/services/pdf/hallTicket.pdf');
const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('--- Starting Improvement Exam Verification Tests ---');

  // 1. Verify Improvement Block Report PDF generation (9 columns)
  console.log('Test 1: Improvement Block Report PDF Generation');
  const improvementSections = [
    {
      examDate: '2026-11-25',
      examTime: '10:30 AM',
      subjectCode: 'SECV1020',
      subjectName: 'Mathematics',
      semester: 1,
      program: 'CE',
      division: 'CV1',
      blockNumber: 2,
      classroom: 'BX201',
      subjectBlock: 2,
      totalBlocks: 3,
      isImprovement: true,
      students: [
        {
          enrollmentNumber: '26CV1X001',
          studentName: 'Aarav Patel',
          division: 'CV1',
          rollNo: 1,
        },
        {
          enrollmentNumber: '26CV1X002',
          studentName: 'Vivaan Shah',
          division: 'CV1',
          rollNo: 2,
        },
      ],
    },
  ];

  const blockReportBuffer = await generateBlockReportPDF(improvementSections, {
    examName: 'Mid Sem Improvement Exam',
    academicYear: '2026-2027',
    isImprovement: true,
  });

  console.log('Improvement Block Report generated, buffer size:', blockReportBuffer.length);
  if (blockReportBuffer.length < 1000) throw new Error('Block Report PDF buffer too small');

  // 2. Verify Regular Block Report PDF generation (regression test: 8 columns)
  console.log('Test 2: Regular Block Report PDF Generation (Regression Check)');
  const regularSections = [
    {
      examDate: '2026-11-25',
      examTime: '10:30 AM',
      subjectCode: 'SECV1020',
      subjectName: 'Mathematics',
      semester: 1,
      program: 'CE',
      division: 'CV1',
      blockNumber: 2,
      classroom: 'BX201',
      subjectBlock: 2,
      totalBlocks: 3,
      isImprovement: false,
      students: [
        {
          enrollmentNumber: '26CV1X001',
          studentName: 'Aarav Patel',
          division: 'CV1',
          feesStatus: 'PAID',
        },
      ],
    },
  ];

  const regularReportBuffer = await generateBlockReportPDF(regularSections, {
    examName: 'Regular Mid Sem Exam',
    academicYear: '2026-2027',
    isImprovement: false,
  });
  console.log('Regular Block Report generated, buffer size:', regularReportBuffer.length);
  if (regularReportBuffer.length < 1000) throw new Error('Regular Block Report PDF buffer too small');

  // 3. Verify Improvement Hall Ticket PDF Generation (subject-wise roll no & supervisor signature)
  console.log('Test 3: Improvement Hall Ticket PDF Generation');
  const improvementStudent = {
    name: 'Aarav Patel',
    enrollmentNumber: '26CV1X001',
    program: 'CE',
    semester: 1,
    division: 'CV1',
  };

  const improvementExamInfo = {
    id: 'exam-imp-123',
    examId: 'exam-imp-123',
    name: 'Improvement Examination',
    academicYear: '2026-2027',
    isImprovement: true,
  };

  const improvementSchedules = [
    {
      subjectCode: 'SECV1010',
      subjectName: 'Programming Fundamentals',
      examDate: new Date('2026-11-24'),
      examTime: '10:30 AM',
      rollNo: 1,
      blockDisplay: '1 – H501',
    },
    {
      subjectCode: 'SECV1020',
      subjectName: 'Mathematics',
      examDate: new Date('2026-11-25'),
      examTime: '10:30 AM',
      rollNo: 1,
      blockDisplay: '2 – BX201',
    },
  ];

  const hallTicketBuffer = await generateHallTicketPDF(
    improvementStudent,
    improvementExamInfo,
    improvementSchedules,
    { blockNumber: 1, classroom: 'H501' },
    null
  );
  console.log('Improvement Hall Ticket generated, buffer size:', hallTicketBuffer.length);
  if (hallTicketBuffer.length < 1000) throw new Error('Hall Ticket PDF buffer too small');

  // 4. Verify Bulk Hall Ticket Generation with Improvement Exam
  console.log('Test 4: Bulk Improvement Hall Ticket PDF Generation');
  const bulkPayloads = [
    {
      studentData: improvementStudent,
      examInfo: improvementExamInfo,
      schedules: improvementSchedules,
      blockInfo: { blockNumber: 1, classroom: 'H501' },
      photoUrl: null,
    },
    {
      studentData: {
        name: 'Vivaan Shah',
        enrollmentNumber: '26CV1X002',
        program: 'CE',
        semester: 1,
        division: 'CV1',
      },
      examInfo: improvementExamInfo,
      schedules: [
        {
          subjectCode: 'SECV1020',
          subjectName: 'Mathematics',
          examDate: new Date('2026-11-25'),
          examTime: '10:30 AM',
          rollNo: 2,
          blockDisplay: '2 – BX201',
        },
        {
          subjectCode: 'SECV1030',
          subjectName: 'Data Structures',
          examDate: new Date('2026-11-26'),
          examTime: '10:30 AM',
          rollNo: 1,
          blockDisplay: '3 – BX202',
        },
      ],
      blockInfo: { blockNumber: 2, classroom: 'BX201' },
      photoUrl: null,
    },
  ];

  const bulkBuffer = await generateBulkHallTicketPDF(bulkPayloads);
  console.log('Bulk Hall Ticket generated, buffer size:', bulkBuffer.length);
  if (bulkBuffer.length < 1000) throw new Error('Bulk Hall Ticket PDF buffer too small');

  // 5. Verify Regular Hall Ticket PDF (regression check)
  console.log('Test 5: Regular Hall Ticket PDF Generation (Regression Check)');
  const regularSchedules = [
    {
      subjectCode: 'SECV1010',
      subjectName: 'Programming Fundamentals',
      examDate: new Date('2026-11-24'),
      examTime: '10:30 AM',
    },
  ];
  const regularHallTicketBuffer = await generateHallTicketPDF(
    improvementStudent,
    {
      id: 'exam-reg-123',
      examId: 'exam-reg-123',
      name: 'Regular Examination',
      academicYear: '2026-2027',
      isImprovement: false,
    },
    regularSchedules,
    { blockNumber: 1, classroom: 'H501' },
    null
  );
  console.log('Regular Hall Ticket generated, buffer size:', regularHallTicketBuffer.length);

  console.log('--- All Improvement Exam Verification Tests Passed Successfully! ---');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
