const prisma = require('../src/config/database');

async function testBulkReal() {
  const examId = 'cmwszlk4e000218scmif1y3v4';
  const students = await prisma.examStudentData.findMany({
    where: { examId },
    select: { enrollmentNumber: true, attendancePercent: true, feesStatus: true }
  });
  console.log('Testing with', students.length, 'real students...');
  const start = Date.now();
  
  const enrollments = students.map(s => s.enrollmentNumber);
  const eligibleEnrollments = [];
  const notEligibleEnrollments = [];
  students.forEach(s => {
    eligibleEnrollments.push(s.enrollmentNumber);
  });

  await prisma.$transaction(async (tx) => {
    await tx.exam.update({
      where: { id: examId },
      data: { eligibilityVersion: { increment: 1 } },
    });
    await tx.blockReportGeneration.updateMany({
      where: { examId },
      data: { isOutdated: true },
    });
    await tx.hallTicketGeneration.updateMany({
      where: { examId },
      data: { isOutdated: true },
    });

    const existingList = await tx.eligibility.findMany({
      where: { examId, enrollmentNumber: { in: enrollments } },
      select: { enrollmentNumber: true },
    });
    const existingSet = new Set(existingList.map(e => e.enrollmentNumber));
    const newEnrollments = enrollments.filter(e => !existingSet.has(e));

    if (newEnrollments.length > 0) {
      await tx.eligibility.createMany({
        data: newEnrollments.map(enr => ({
          examId,
          enrollmentNumber: enr,
          calculatedEligibility: 'ELIGIBLE',
          finalEligibility: 'ELIGIBLE',
        })),
        skipDuplicates: true,
      });
    }

    for (let i = 0; i < eligibleEnrollments.length; i += 500) {
      const chunk = eligibleEnrollments.slice(i, i + 500);
      await tx.eligibility.updateMany({
        where: { examId, enrollmentNumber: { in: chunk }, adminOverride: null },
        data: { calculatedEligibility: 'ELIGIBLE', finalEligibility: 'ELIGIBLE' },
      });
      await tx.eligibility.updateMany({
        where: { examId, enrollmentNumber: { in: chunk }, NOT: { adminOverride: null } },
        data: { calculatedEligibility: 'ELIGIBLE' },
      });
    }
  }, {
    maxWait: 15000,
    timeout: 30000,
  });

  console.log('SUCCESSFULLY applied to 949 students in', Date.now() - start, 'ms!');
  await prisma.$disconnect();
}

testBulkReal().catch(console.error);
