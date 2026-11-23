const prisma = require('../config/database');

/**
 * Shared Subject-wise Roll Number Service for Improvement Examination
 * 
 * Rules:
 * - Generates numbering independently for each subject.
 * - Only applicants receive Roll Nos.
 * - A student may have different Roll Nos in different subjects.
 * - 1-based sequential integers: 1, 2, 3, ...
 * - Sequenced by student enrollment number ascending across the entire subject applicant roster.
 * - Maintained across blocks (does NOT restart per block).
 * - Single source of truth used by both Block Report and Hall Ticket.
 */

/**
 * Get roll number mapping for a specific subject in an exam
 * @param {string} examId 
 * @param {string} subjectCode 
 * @returns {Promise<Map<string, number>>} Map of enrollmentNumber -> rollNumber
 */
async function getSubjectRollNumberMap(examId, subjectCode) {
  const studentSubjects = await prisma.studentExamSubject.findMany({
    where: {
      examSchedule: {
        examId,
        subjectCode: subjectCode.trim(),
      },
    },
    include: {
      examStudentData: {
        select: {
          enrollmentNumber: true,
          studentName: true,
        },
      },
    },
  });

  const rollMap = new Map();
  // Check if roll numbers are already stored in DB (e.g. from Excel upload)
  studentSubjects.forEach(ss => {
    const enr = ss.examStudentData?.enrollmentNumber;
    if (enr && ss.rollNumber !== null && ss.rollNumber !== undefined) {
      rollMap.set(enr, ss.rollNumber);
    }
  });

  // For any missing, compute sequentially
  const distinctEnrollments = [...new Set(
    studentSubjects.map(ss => ss.examStudentData.enrollmentNumber).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  distinctEnrollments.forEach((enrollment, index) => {
    if (!rollMap.has(enrollment)) {
      rollMap.set(enrollment, index + 1);
    }
  });

  return rollMap;
}

/**
 * Get roll number mapping for all subjects in an exam
 * @param {string} examId 
 * @returns {Promise<Map<string, Map<string, number>>>} Map of subjectCode -> Map<enrollmentNumber, rollNumber>
 */
async function getExamRollNumberMap(examId) {
  const studentSubjects = await prisma.studentExamSubject.findMany({
    where: {
      examSchedule: {
        examId,
      },
    },
    include: {
      examSchedule: {
        select: {
          subjectCode: true,
        },
      },
      examStudentData: {
        select: {
          enrollmentNumber: true,
          studentName: true,
        },
      },
    },
  });

  const examRollMap = new Map();
  studentSubjects.forEach(ss => {
    const code = (ss.examSchedule?.subjectCode || '').trim();
    const enrollment = ss.examStudentData?.enrollmentNumber;
    if (!code || !enrollment) return;

    if (!examRollMap.has(code)) {
      examRollMap.set(code, new Map());
    }
    if (ss.rollNumber !== null && ss.rollNumber !== undefined) {
      examRollMap.get(code).set(enrollment, ss.rollNumber);
    }
  });

  // Group enrollments by subject code
  const subjectEnrollments = new Map();
  for (const ss of studentSubjects) {
    const code = (ss.examSchedule?.subjectCode || '').trim();
    const enrollment = ss.examStudentData?.enrollmentNumber;
    if (!code || !enrollment) continue;

    if (!subjectEnrollments.has(code)) {
      subjectEnrollments.set(code, new Set());
    }
    subjectEnrollments.get(code).add(enrollment);
  }

  // Create sequential 1-based roll numbers for any unassigned
  for (const [code, enrollmentsSet] of subjectEnrollments.entries()) {
    if (!examRollMap.has(code)) {
      examRollMap.set(code, new Map());
    }
    const subMap = examRollMap.get(code);
    const sorted = Array.from(enrollmentsSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    sorted.forEach((enr, idx) => {
      if (!subMap.has(enr)) {
        subMap.set(enr, idx + 1);
      }
    });
  }

  return examRollMap;
}

/**
 * Get a single student's roll number for a given subject
 * @param {string} examId 
 * @param {string} subjectCode 
 * @param {string} enrollmentNumber 
 * @returns {Promise<number|null>}
 */
async function getStudentRollNumber(examId, subjectCode, enrollmentNumber) {
  const rollMap = await getSubjectRollNumberMap(examId, subjectCode);
  return rollMap.get(enrollmentNumber) || null;
}

/**
 * Sync calculated roll numbers to the database StudentExamSubject records
 * @param {string} examId 
 */
async function syncRollNumbersToDatabase(examId) {
  const examRollMap = await getExamRollNumberMap(examId);

  const studentSubjects = await prisma.studentExamSubject.findMany({
    where: {
      examSchedule: { examId },
    },
    include: {
      examSchedule: { select: { subjectCode: true } },
      examStudentData: { select: { enrollmentNumber: true } },
    },
  });

  const updates = [];
  for (const ss of studentSubjects) {
    const code = (ss.examSchedule?.subjectCode || '').trim();
    const enrollment = ss.examStudentData?.enrollmentNumber;
    const rollNo = examRollMap.get(code)?.get(enrollment) || null;

    if (rollNo && ss.rollNumber !== rollNo) {
      updates.push(
        prisma.studentExamSubject.update({
          where: { id: ss.id },
          data: { rollNumber: rollNo },
        })
      );
    }
  }

  for (let i = 0; i < updates.length; i += 50) {
    await Promise.all(updates.slice(i, i + 50));
  }
}

module.exports = {
  getSubjectRollNumberMap,
  getExamRollNumberMap,
  getStudentRollNumber,
  syncRollNumbersToDatabase,
};
