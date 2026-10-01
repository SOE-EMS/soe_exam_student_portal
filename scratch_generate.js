const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateBulkHallTicketPDF } = require('./src/services/pdf/hallTicket.pdf');

async function testGenerate() {
  // Get an eligible student
  const eligibility = await prisma.eligibility.findFirst({
    where: { finalEligibility: 'ELIGIBLE' }
  });

  if (!eligibility) {
      console.log("No eligible students found.");
      return;
  }

  const enrollmentNumber = eligibility.enrollmentNumber;
  const examId = eligibility.examId;

  console.log("Testing with student:", enrollmentNumber);

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { academicYear: true },
  });

  const studentData = await prisma.examStudentData.findUnique({
    where: { examId_enrollmentNumber: { examId, enrollmentNumber } },
    include: {
      subjects: { include: { examSchedule: true } },
    },
  });

  const blockAssignment = await prisma.blockAssignment.findUnique({
    where: { examId_enrollmentNumber: { examId, enrollmentNumber } },
  });

  const profile = await prisma.studentProfile.findUnique({
    where: { enrollmentNumber },
  });

  const schedules = studentData.subjects.map(s => s.examSchedule).filter(Boolean);
  schedules.sort((a, b) => new Date(a.examDate) - new Date(b.examDate));

  const payload = {
    studentData: {
      name: studentData.studentName,
      enrollmentNumber: studentData.enrollmentNumber,
      program: studentData.program,
      semester: studentData.semester,
      division: studentData.division,
    },
    examInfo: {
      examName: exam.name,
      academicYear: exam.academicYear.name,
    },
    schedules,
    blockInfo: blockAssignment,
    photoUrl: profile?.photoUrl || null
  };

  console.log("Generating PDF...");
  const pdfBuffer = await generateBulkHallTicketPDF([payload, payload]); // Generate 2 pages to test bulk
  fs.writeFileSync('./scratch_output.pdf', pdfBuffer);
  console.log("Saved to scratch_output.pdf");
}

testGenerate().catch(console.error).finally(() => prisma.$disconnect());
