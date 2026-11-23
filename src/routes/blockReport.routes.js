const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { generateBlockReportPDF } = require('../services/pdf/blockReport.pdf');
const { getSubjectRollNumberMap } = require('../services/rollNumber.service');
const { logAudit } = require('../services/audit.service');

// ──────────────────────────────────────────────
// GENERATE BLOCK REPORT
// Admin selects: Exam + Date + Time
// System auto-detects subjects for that Date + Time
// ──────────────────────────────────────────────

router.post('/generate', requireAdmin, async (req, res) => {
  try {
    const { examId, date, time } = req.body;

    if (!examId || !date) {
      return res.status(400).json({ error: 'Exam and date are required.' });
    }

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { academicYear: true },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    // Auto-detect subjects for the given date + time
    const parsedDate = new Date(date);
    const allSchedules = await prisma.examSchedule.findMany({
      where: { examId },
      orderBy: { subjectCode: 'asc' },
    });

    let schedules = allSchedules.filter(s => {
      const sDateStr = formatDate(s.examDate);
      if (sDateStr === date) return true;
      const d = new Date(s.examDate);
      const localStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return localStr === date;
    });

    if (time && time.trim() && schedules.length > 0) {
      const normalizedTime = String(time)
        .toUpperCase()
        .replace(/([0-9])([AP]M)/g, '$1 $2') // Add space before AM/PM
        .replace(/\s+/g, ' ') // Collapse spaces
        .replace(/\s*-\s*/g, ' TO ') // Replace hyphen with TO
        .trim();

      const timeMatched = schedules.filter(s => {
        if (!s.examTime || !s.examTime.trim()) return false;
        const sTime = s.examTime.toUpperCase().replace(/\s+/g, ' ').trim();
        return sTime === normalizedTime;
      });

      if (timeMatched.length > 0) {
        schedules = timeMatched;
      }
    }

    if (schedules.length === 0) {
      return res.status(404).json({ error: 'No examination subjects are scheduled for the selected examination, date and time.' });
    }

    // Build sections: one per subject per block
    const sections = [];
    
    // Store all eligible enrollments across all schedules for snapshotting
    const globalEligibleEnrollments = new Set();

    for (const schedule of schedules) {
      const isImprovement = exam.type === 'IMPROVEMENT';
      const rollMap = isImprovement ? await getSubjectRollNumberMap(examId, schedule.subjectCode) : null;

      // Get students with this subject who are ELIGIBLE
      const studentSubjects = await prisma.studentExamSubject.findMany({
        where: { examScheduleId: schedule.id },
        include: {
          examStudentData: true,
        },
      });

      // Filter only eligible students
      const eligibleEnrollments = new Set();
      const eligibilities = await prisma.eligibility.findMany({
        where: {
          examId,
          enrollmentNumber: { in: studentSubjects.map(ss => ss.examStudentData.enrollmentNumber) },
          finalEligibility: 'ELIGIBLE',
        },
      });
      eligibilities.forEach(e => {
        eligibleEnrollments.add(e.enrollmentNumber);
        globalEligibleEnrollments.add(e.enrollmentNumber);
      });

      const eligibleStudents = studentSubjects
        .filter(ss => eligibleEnrollments.has(ss.examStudentData.enrollmentNumber))
        .map(ss => ss.examStudentData);

      if (isImprovement) {
        const subjectArrangements = await prisma.seatingArrangement.findMany({
          where: { examId, subjectCode: schedule.subjectCode },
          orderBy: { blockNumber: 'asc' },
        });

        if (subjectArrangements.length > 0) {
          const totalBlocks = subjectArrangements.length;
          subjectArrangements.forEach(arr => {
            const arrStudents = eligibleStudents.filter(student => {
              const r = rollMap ? rollMap.get(student.enrollmentNumber) : null;
              if (/^\d+$/.test(arr.fromEnrollment) && /^\d+$/.test(arr.toEnrollment) && r !== null && r !== undefined) {
                return r >= parseInt(arr.fromEnrollment) && r <= parseInt(arr.toEnrollment);
              }
              return student.enrollmentNumber >= arr.fromEnrollment && student.enrollmentNumber <= arr.toEnrollment;
            });

            if (arrStudents.length > 0) {
              if (rollMap) {
                arrStudents.sort((a, b) => (rollMap.get(a.enrollmentNumber) || 0) - (rollMap.get(b.enrollmentNumber) || 0));
              } else {
                arrStudents.sort((a, b) => a.enrollmentNumber.localeCompare(b.enrollmentNumber));
              }

              sections.push({
                examDate: formatDate(schedule.examDate),
                examTime: schedule.examTime || time || '—',
                subjectCode: schedule.subjectCode,
                subjectName: schedule.subjectName,
                semester: arrStudents[0]?.semester || '—',
                program: arrStudents[0]?.program || '—',
                division: arrStudents[0]?.division || '—',
                blockNumber: arr.blockNumber,
                classroom: arr.classroom,
                subjectBlock: arr.subjectBlock,
                subjectBlockStr: arr.subjectBlockStr || (arr.subjectCode ? `${arr.subjectCode}(${arr.subjectBlock})` : String(arr.subjectBlock)),
                totalBlocks,
                isImprovement,
                students: arrStudents.map(s => ({
                  enrollmentNumber: s.enrollmentNumber,
                  studentName: s.studentName,
                  division: s.division,
                  feesStatus: s.feesStatus,
                  rollNo: rollMap ? (rollMap.get(s.enrollmentNumber) || null) : null,
                })),
              });
            }
          });
          continue;
        }
      }

      // Group eligible students by block
      const blockAssignments = await prisma.blockAssignment.findMany({
        where: {
          examId,
          enrollmentNumber: { in: eligibleStudents.map(s => s.enrollmentNumber) },
        },
      });
      const blockMap = new Map(blockAssignments.map(b => [b.enrollmentNumber, b]));

      // Group students by block
      const blockGroups = {};
      eligibleStudents.forEach(student => {
        const block = blockMap.get(student.enrollmentNumber);
        const blockNum = block ? block.blockNumber : 0;
        const classroom = block ? block.classroom : '—';

        if (!blockGroups[blockNum]) {
          blockGroups[blockNum] = { classroom, students: [] };
        }
        blockGroups[blockNum].students.push(student);
      });

      // Create section for each block
      Object.entries(blockGroups).forEach(([blockNum, group]) => {
        group.students.sort((a, b) => a.enrollmentNumber.localeCompare(b.enrollmentNumber));

        sections.push({
          examDate: formatDate(schedule.examDate),
          examTime: schedule.examTime || time || '—',
          subjectCode: schedule.subjectCode,
          subjectName: schedule.subjectName,
          semester: group.students[0]?.semester || '—',
          program: group.students[0]?.program || '—',
          division: group.students[0]?.division || '—',
          blockNumber: parseInt(blockNum),
          classroom: group.classroom,
          isImprovement,
          students: group.students.map(s => ({
            enrollmentNumber: s.enrollmentNumber,
            studentName: s.studentName,
            division: s.division,
            feesStatus: s.feesStatus,
            rollNo: rollMap ? (rollMap.get(s.enrollmentNumber) || null) : null,
          })),
        });
      });
    }

    // ──────────────────────────────────────────────
    // ENRICH SECTIONS WITH SUBJECT BLOCK + TOTAL BLOCKS
    // ──────────────────────────────────────────────
    const seatingArrangements = await prisma.seatingArrangement.findMany({
      where: { examId },
      orderBy: { blockNumber: 'asc' },
    });

    // Build lookup: blockNumber → subjectBlock
    const subjectBlockMap = new Map(seatingArrangements.map(a => [a.blockNumber, a.subjectBlock]));
    // Total blocks = count of distinct subject blocks in seating
    const totalBlocks = seatingArrangements.length;

    // Attach subjectBlock and totalBlocks to each section
    sections.forEach(section => {
      if (!section.subjectBlock) {
        section.subjectBlock = subjectBlockMap.get(section.blockNumber) || section.blockNumber;
      }
      if (!section.totalBlocks) {
        section.totalBlocks = totalBlocks;
      }
    });


    if (sections.length === 0) {
      // Check if we found subjects but failed on seating/eligibility
      const totalStudents = schedules.length > 0;
      
      // We know schedules.length > 0 because of earlier check
      // Did we fail at finding block assignments or eligible students?
      
      // Let's do a quick check to see if there were ANY block assignments for these exams
      const anyBlocks = await prisma.blockAssignment.count({
        where: { examId }
      });
      
      if (anyBlocks === 0) {
        return res.status(404).json({ error: 'Subjects found, but no seating/block assignments were found for the selected examination date and time.' });
      } else {
        return res.status(404).json({ error: 'Subjects and blocks found, but no students are currently Final Eligible for the selected examination date and time.' });
      }
    }

    // ──────────────────────────────────────────────
    // SNAPSHOT GENERATION (STALE DATA PROTECTION)
    // ──────────────────────────────────────────────
    const allEligibleEnrollments = Array.from(globalEligibleEnrollments);
    await prisma.$transaction(async (tx) => {
      // Clean up previous generations for this date so old stale records do not linger
      await tx.blockReportGeneration.deleteMany({
        where: {
          examId,
          examDate: parsedDate,
        }
      });

      const generation = await tx.blockReportGeneration.create({
        data: {
          examId,
          examDate: parsedDate,
          examTime: time || null,
          eligibilityVersion: exam.eligibilityVersion,
          isOutdated: false,
        }
      });
      
      const studentRecords = allEligibleEnrollments.map(enr => ({
        generationId: generation.id,
        enrollmentNumber: enr,
      }));
      
      // SQLite limit might apply if chunks are too large, but usually fine for <10k rows
      await tx.blockReportGeneratedStudent.createMany({
        data: studentRecords
      });
    });

    sections.sort((a, b) => {
      if (a.subjectCode !== b.subjectCode) return a.subjectCode.localeCompare(b.subjectCode);
      return a.blockNumber - b.blockNumber;
    });

    const pdfBuffer = await generateBlockReportPDF(sections, {
      examName: exam.name,
      academicYear: exam.academicYear.name,
      isImprovement: exam.type === 'IMPROVEMENT',
    });

    await logAudit({
      userId: req.session.userId,
      action: 'BLOCK_REPORT_GENERATED',
      entity: 'BlockReport',
      entityId: examId,
      details: { date, time, subjects: schedules.map(s => s.subjectCode), sections: sections.length },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=block_report_${date}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[BlockReport] Generate error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate block report.' });
  }
});

// ──────────────────────────────────────────────
// GET STATUS (CHECK IF OUTDATED REPORTS EXIST)
// ──────────────────────────────────────────────

router.get('/status/:examId', requireAdmin, async (req, res) => {
  try {
    const generations = await prisma.blockReportGeneration.findMany({
      where: { examId: req.params.examId },
      orderBy: { createdAt: 'desc' },
    });

    if (generations.length === 0) {
      return res.json({ hasOutdated: false, outdatedCount: 0 });
    }

    const seenDates = new Set();
    const latestGenerations = [];
    for (const g of generations) {
      const d = formatDate(g.examDate);
      if (!seenDates.has(d)) {
        seenDates.add(d);
        latestGenerations.push(g);
      }
    }

    const outdatedList = latestGenerations.filter(g => g.isOutdated);

    res.json({
      hasOutdated: outdatedList.length > 0,
      outdatedCount: outdatedList.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check block report status.' });
  }
});

// ──────────────────────────────────────────────
// GET AVAILABLE DATES FOR BLOCK REPORT
// ──────────────────────────────────────────────

router.get('/dates/:examId', requireAdmin, async (req, res) => {
  try {
    const schedules = await prisma.examSchedule.findMany({
      where: { examId: req.params.examId },
      select: { examDate: true, examTime: true },
    });

    const dateTimesMap = {};
    const datesSet = new Set();
    const allTimesSet = new Set();

    schedules.forEach(s => {
      const d = formatDate(s.examDate);
      datesSet.add(d);
      if (!dateTimesMap[d]) dateTimesMap[d] = new Set();
      const timeVal = (s.examTime && s.examTime.trim()) ? s.examTime.trim() : '10:30 AM TO 11:30 AM';
      dateTimesMap[d].add(timeVal);
      allTimesSet.add(timeVal);
    });

    const dates = Array.from(datesSet).sort();
    const times = Array.from(allTimesSet).sort();
    const dateTimes = {};
    for (const d of dates) {
      dateTimes[d] = Array.from(dateTimesMap[d] || []);
    }

    res.json({ dates, times, dateTimes });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load dates.' });
  }
});

function formatDate(date) {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

module.exports = router;
