const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { generateBlockLabelPDF } = require('../services/pdf/blockLabel.pdf');

// ──────────────────────────────────────────────
// GENERATE BLOCK LABELS PDF
// ──────────────────────────────────────────────

router.get('/:examId', requireAdmin, async (req, res) => {
  try {
    const { examId } = req.params;
    const { date, blockNumber } = req.query;

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { academicYear: true },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    const arrangements = await prisma.seatingArrangement.findMany({
      where: {
        examId,
        ...(blockNumber ? { blockNumber: parseInt(blockNumber) } : {}),
      },
      orderBy: { blockNumber: 'asc' },
    });

    if (arrangements.length === 0) {
      return res.status(404).json({ error: 'No seating arrangements found.' });
    }

    // Build block label data (extract actual divisions and subjects from assignments)
    const blockData = await Promise.all(arrangements.map(async arr => {
      // Find students assigned to this block
      const assignments = await prisma.blockAssignment.findMany({
        where: { examId, blockNumber: arr.blockNumber }
      });
      const enrollments = assignments.map(a => a.enrollmentNumber);

      // Find their exam data (for divisions and semesters)
      const studentData = await prisma.examStudentData.findMany({
        where: { examId, enrollmentNumber: { in: enrollments } }
      });
      const divisions = [...new Set(studentData.map(s => s.division).filter(Boolean))].join(', ');
      const semesters = [...new Set(studentData.map(s => s.semester).filter(Boolean))];

      if (semesters.length > 1) {
        throw new Error('Cannot generate Block Label because students assigned to this block belong to multiple semesters.');
      }
      
      const semester = semesters.length === 1 ? semesters[0] : '—';

      let subjectCodes = '—';
      let subjectNames = '—';
      let examTimes = '—';

      if (date && enrollments.length > 0) {
        // Date comes as YYYY-MM-DD, parse safely to match database dates
        const parsedDate = new Date(date);
        
        // Find schedules for this date
        const dateSchedules = await prisma.examSchedule.findMany({
          where: {
            examId,
            examDate: {
              gte: new Date(parsedDate.setHours(0,0,0,0)),
              lt: new Date(parsedDate.setHours(23,59,59,999))
            }
          }
        });
        const dateScheduleIds = dateSchedules.map(s => s.id);

        if (dateScheduleIds.length > 0) {
          // Find which of these subjects the block students are taking
          const subjects = await prisma.studentExamSubject.findMany({
            where: {
              examStudentDataId: { in: studentData.map(s => s.id) },
              examScheduleId: { in: dateScheduleIds }
            },
            include: { examSchedule: true }
          });
          
          subjectCodes = [...new Set(subjects.map(s => s.examSchedule.subjectCode).filter(Boolean))].join(', ') || '—';
          subjectNames = [...new Set(subjects.map(s => s.examSchedule.subjectName || s.examSchedule.subjectCode).filter(Boolean))].join(', ') || '—';
          examTimes = [...new Set(subjects.map(s => s.examSchedule.examTime).filter(Boolean))].join(', ') || '—';
        }
      }

      return {
        blockNumber: arr.blockNumber,
        classroom: arr.classroom,
        division: divisions || '—',
        semester,
        examDate: date || '—',
        examTime: examTimes,
        subjectCode: subjectCodes,
        subjectName: subjectNames,
        blockCount: arr.blockCount,
      };
    }));

    const pdfBuffer = await generateBlockLabelPDF(blockData, {
      examName: exam.name,
      academicYear: exam.academicYear.name,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=block_labels_${examId}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[BlockLabel] Generate error:', error.message);
    if (error.message.startsWith('Cannot generate Block Label')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to generate block labels.' });
  }
});

module.exports = router;
