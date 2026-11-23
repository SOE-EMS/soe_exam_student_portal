const prisma = require('../src/config/database');

async function testBulkUpdate() {
  console.log('Testing bulk updateMany optimization on Neon Postgres...');
  const exam = await prisma.exam.findFirst({
    where: { type: 'IMPROVEMENT' }
  });
  if (!exam) return console.log('No exam found');

  const students = await prisma.examStudentData.findMany({
    where: { examId: exam.id },
    select: { enrollmentNumber: true, attendancePercent: true, feesStatus: true }
  });
  console.log(`Testing with ${students.length} students in ${exam.name}...`);

  const startTime = Date.now();

  const minAttendancePercent = 0;
  const feesRequired = 'Any';

  const eligibleEnrollments = [];
  const notEligibleEnrollments = [];
  const enrollments = [];

  students.forEach(s => {
    enrollments.push(s.enrollmentNumber);
    const meetsAttendance = (s.attendancePercent || 0) >= minAttendancePercent;
    const meetsFees = feesRequired === 'Any' || s.feesStatus === 'Paid';
    if (meetsAttendance && meetsFees) {
      eligibleEnrollments.push(s.enrollmentNumber);
    } else {
      notEligibleEnrollments.push(s.enrollmentNumber);
    }
  });

  await prisma.$transaction(async (tx) => {
    // 1. Version increment & invalidation
    await tx.exam.update({
      where: { id: exam.id },
      data: { eligibilityVersion: { increment: 1 } },
    });
    await tx.blockReportGeneration.updateMany({
      where: { examId: exam.id },
      data: { isOutdated: true },
    });
    await tx.hallTicketGeneration.updateMany({
      where: { examId: exam.id },
      data: { isOutdated: true },
    });

    // 2. Existing check
    const existingList = await tx.eligibility.findMany({
      where: { examId: exam.id, enrollmentNumber: { in: enrollments } },
      select: { enrollmentNumber: true },
    });
    const existingSet = new Set(existingList.map(e => e.enrollmentNumber));
    const newEnrollments = enrollments.filter(e => !existingSet.has(e));

    // 3. Insert any new
    if (newEnrollments.length > 0) {
      const newRecords = newEnrollments.map(enr => {
        const isEligible = eligibleEnrollments.includes(enr);
        const status = isEligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE';
        return {
          examId: exam.id,
          enrollmentNumber: enr,
          calculatedEligibility: status,
          finalEligibility: status,
        };
      });
      await tx.eligibility.createMany({
        data: newRecords,
        skipDuplicates: true,
      });
    }

    // 4. Bulk update eligible
    if (eligibleEnrollments.length > 0) {
      for (let i = 0; i < eligibleEnrollments.length; i += 500) {
        const chunk = eligibleEnrollments.slice(i, i + 500);
        await tx.eligibility.updateMany({
          where: { examId: exam.id, enrollmentNumber: { in: chunk }, adminOverride: null },
          data: { calculatedEligibility: 'ELIGIBLE', finalEligibility: 'ELIGIBLE' },
        });
        await tx.eligibility.updateMany({
          where: { examId: exam.id, enrollmentNumber: { in: chunk }, NOT: { adminOverride: null } },
          data: { calculatedEligibility: 'ELIGIBLE' },
        });
      }
    }

    // 5. Bulk update not eligible
    if (notEligibleEnrollments.length > 0) {
      for (let i = 0; i < notEligibleEnrollments.length; i += 500) {
        const chunk = notEligibleEnrollments.slice(i, i + 500);
        await tx.eligibility.updateMany({
          where: { examId: exam.id, enrollmentNumber: { in: chunk }, adminOverride: null },
          data: { calculatedEligibility: 'NOT_ELIGIBLE', finalEligibility: 'NOT_ELIGIBLE' },
        });
        await tx.eligibility.updateMany({
          where: { examId: exam.id, enrollmentNumber: { in: chunk }, NOT: { adminOverride: null } },
          data: { calculatedEligibility: 'NOT_ELIGIBLE' },
        });
      }
    }
  }, {
    maxWait: 15000,
    timeout: 30000,
  });

  const duration = Date.now() - startTime;
  console.log(`SUCCESS! Bulk updated in ${duration}ms!`);
  await prisma.$disconnect();
}

testBulkUpdate().catch(console.error);
