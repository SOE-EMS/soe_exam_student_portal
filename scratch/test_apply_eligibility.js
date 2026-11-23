const prisma = require('../src/config/database');

async function testApply() {
  console.log('Testing eligibility apply optimization...');
  const exam = await prisma.exam.findFirst({
    where: { type: 'IMPROVEMENT' }
  });
  if (!exam) {
    console.log('No improvement exam found.');
    return;
  }

  const students = await prisma.examStudentData.findMany({
    where: { examId: exam.id },
    select: { enrollmentNumber: true, attendancePercent: true, feesStatus: true }
  });
  console.log(`Found ${students.length} students in exam ${exam.name}.`);

  const startTime = Date.now();
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    await tx.exam.update({
      where: { id: exam.id },
      data: { eligibilityVersion: { increment: 1 } },
    });

    const enrollments = students.map(s => s.enrollmentNumber);
    const existingEligibilities = await tx.eligibility.findMany({
      where: { examId: exam.id, enrollmentNumber: { in: enrollments } },
    });
    const existingMap = new Map(existingEligibilities.map(e => [e.enrollmentNumber, e]));

    const operations = [];
    for (const student of students) {
      const calculatedStatus = 'ELIGIBLE';
      const existing = existingMap.get(student.enrollmentNumber);
      const finalEligibility = existing?.adminOverride || calculatedStatus;

      operations.push(
        tx.eligibility.upsert({
          where: { examId_enrollmentNumber: { examId: exam.id, enrollmentNumber: student.enrollmentNumber } },
          create: {
            examId: exam.id,
            enrollmentNumber: student.enrollmentNumber,
            calculatedEligibility: calculatedStatus,
            finalEligibility,
          },
          update: {
            calculatedEligibility: calculatedStatus,
            finalEligibility,
          },
        })
      );
    }

    for (let i = 0; i < operations.length; i += 50) {
      await Promise.all(operations.slice(i, i + 50));
    }
    updated = operations.length;
  }, {
    maxWait: 15000,
    timeout: 60000,
  });

  const duration = Date.now() - startTime;
  console.log(`Successfully updated ${updated} students in ${duration}ms!`);
  await prisma.$disconnect();
}

testApply().catch(err => {
  console.error('Test apply failed:', err);
  process.exit(1);
});
