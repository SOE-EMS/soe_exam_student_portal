const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function disableStudent() {
  const eligible = await prisma.eligibility.findFirst({
    where: { finalEligibility: 'ELIGIBLE' }
  });

  if (!eligible) {
      console.log("No eligible students found.");
      return;
  }

  const enrollment = eligible.enrollmentNumber;
  console.log("Found eligible student:", enrollment);

  const profile = await prisma.studentProfile.findUnique({
      where: { enrollmentNumber: enrollment },
      include: { user: true }
  });

  if (profile && profile.user) {
      await prisma.user.update({
          where: { id: profile.user.id },
          data: { isActive: false }
      });
      console.log("Disabled user:", profile.user.email);
  }

  const seating = await prisma.blockAssignment.findFirst({
      where: { enrollmentNumber: enrollment, examId: eligible.examId }
  });
  console.log("Seating:", seating);

  const schedule = await prisma.examStudentData.findFirst({
      where: { examId: eligible.examId, enrollmentNumber: enrollment },
      include: { subjects: { include: { examSchedule: true } } }
  });
  
  const schedules = schedule?.subjects.map(s => s.examSchedule).filter(Boolean);
  console.log("Schedules found:", schedules?.length);
  
  console.log(`Test with examId: ${eligible.examId} and enrollmentNumber: ${enrollment}`);
}

disableStudent().catch(console.error).finally(() => prisma.$disconnect());
