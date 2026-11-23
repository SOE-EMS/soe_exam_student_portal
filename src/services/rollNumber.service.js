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

  const distinctEnrollments = [...new Set(
    studentSubjects.map(ss => ss.examStudentData.enrollmentNumber).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const rollMap = new Map();
  distinctEnrollments.forEach((enrollment, index) => {
    rollMap.set(enrollment, index + 1);
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

  // Create sequential 1-based roll numbers per subject
  const examRollMap = new Map();
  for (const [code, enrollmentsSet] of subjectEnrollments.entries()) {
    const sorted = Array.from(enrollmentsSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const rollMap = new Map();
    sorted.forEach((enr, idx) => {
      rollMap.set(enr, idx + 1);
    });
    examRollMap.set(code, rollMap);
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

  for (const ss of studentSubjects) {
    const code = (ss.examSchedule?.subjectCode || '').trim();
    const enrollment = ss.examStudentData?.enrollmentNumber;
    const rollNo = examRollMap.get(code)?.get(enrollment) || null;

    if (rollNo && ss.rollNumber !== rollNo) {
      await prisma.studentExamSubject.update({
        where: { id: ss.id },
        data: { rollNumber: rollNo },
      });
    }
  }
}

module.exports = {
  getSubjectRollNumberMap,
  getExamRollNumberMap,
  getStudentRollNumber,
  syncRollNumbersToDatabase,
};
