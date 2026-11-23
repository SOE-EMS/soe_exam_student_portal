const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { validate, hallTicketSettingsSchema } = require('../middleware/validation');
const {
  generateHallTicketPDF,
  generateBulkHallTicketPDF,
  verifyTicketToken,
} = require('../services/pdf/hallTicket.pdf');
const { getExamRollNumberMap } = require('../services/rollNumber.service');
const {
  computeCacheKey,
  getCachedPDF,
  saveCachedPDF,
  invalidateExamCache,
} = require('../services/pdfCache.service');
const { logAudit } = require('../services/audit.service');

// ──────────────────────────────────────────────
// SET HALL TICKET AVAILABILITY PERIOD
// ──────────────────────────────────────────────

router.post('/settings/:examId', requireAdmin, validate(hallTicketSettingsSchema), async (req, res) => {
  try {
    const { examId } = req.params;
    const { availableFrom, availableTo } = req.validatedBody;

    const settings = await prisma.hallTicketSettings.upsert({
      where: { examId },
      create: {
        examId,
        availableFrom: availableFrom ? new Date(availableFrom) : null,
        availableTo: availableTo ? new Date(availableTo) : null,
      },
      update: {
        availableFrom: availableFrom ? new Date(availableFrom) : null,
        availableTo: availableTo ? new Date(availableTo) : null,
      },
    });

    // Invalidate cache when settings window changes
    invalidateExamCache(examId);

    await logAudit({
      userId: req.session.userId,
      action: 'HALL_TICKET_PERIOD_SET',
      entity: 'HallTicketSettings',
      entityId: examId,
      details: { availableFrom, availableTo },
      ipAddress: req.ip,
    });

    res.json({ message: 'Hall ticket availability period set.', settings });
  } catch (error) {
    console.error('[HallTicket] Settings error:', error.message);
    res.status(500).json({ error: 'Failed to save settings.' });
  }
});

// ──────────────────────────────────────────────
// GET SETTINGS
// ──────────────────────────────────────────────

router.get('/settings/:examId', requireAdmin, async (req, res) => {
  try {
    const settings = await prisma.hallTicketSettings.findUnique({
      where: { examId: req.params.examId },
    });
    res.json({ settings: settings || { availableFrom: null, availableTo: null } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

// ──────────────────────────────────────────────
// PUBLIC QR VERIFICATION ENDPOINT
// ──────────────────────────────────────────────

router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const result = verifyTicketToken(token);

    if (!result.valid) {
      if (req.accepts('html')) {
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>PPSU - Verification Failed</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
          </head>
          <body class="bg-light d-flex align-items-center min-vh-100">
            <div class="container text-center py-5">
              <div class="card shadow-sm mx-auto p-4 border-danger" style="max-width: 450px; border-radius: 16px;">
                <div class="text-danger mb-3"><i class="fas fa-times-circle fa-4x"></i></div>
                <h4 class="text-danger fw-bold">Verification Failed</h4>
                <p class="text-muted mt-2">The QR code or verification token is invalid or has been tampered with.</p>
                <div class="badge bg-danger text-wrap p-2 mt-2">Tampered / Forged Token</div>
              </div>
            </div>
          </body>
          </html>
        `);
      }
      return res.status(400).json({ valid: false, error: result.error });
    }

    const { examId, enrollmentNumber } = result;

    const [exam, studentData, eligibility] = await Promise.all([
      prisma.exam.findUnique({
        where: { id: examId },
        include: { academicYear: true },
      }),
      prisma.examStudentData.findUnique({
        where: { examId_enrollmentNumber: { examId, enrollmentNumber } },
        include: { subjects: true },
      }),
      prisma.eligibility.findUnique({
        where: { examId_enrollmentNumber: { examId, enrollmentNumber } },
      }),
    ]);

    if (!exam || !studentData) {
      return res.status(404).json({ valid: false, error: 'Student or Exam record not found' });
    }

    const isEligible = eligibility && eligibility.finalEligibility === 'ELIGIBLE';

    if (req.accepts('html')) {
      const statusColor = isEligible ? 'success' : 'danger';
      const statusBadge = isEligible ? 'VERIFIED OFFICIAL ADMIT CARD' : 'NOT ELIGIBLE / REVOKED';
      const statusIcon = isEligible ? 'fa-check-circle' : 'fa-exclamation-triangle';

      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>PPSU Hall Ticket Verification</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
          <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
          <style>
            body { background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            .verification-card { max-width: 480px; border-radius: 16px; border: none; box-shadow: 0 10px 25px rgba(0,0,0,0.06); }
            .header-banner { background: #1e3a5f; color: white; border-radius: 16px 16px 0 0; padding: 20px; }
          </style>
        </head>
        <body class="d-flex align-items-center min-vh-100 py-4">
          <div class="container">
            <div class="card verification-card mx-auto">
              <div class="header-banner text-center">
                <h5 class="fw-bold mb-1">P P Savani University</h5>
                <div style="font-size: 13px; opacity: 0.9;">School of Engineering &bull; Examination Authority</div>
              </div>
              <div class="card-body p-4 text-center">
                <div class="text-${statusColor} mb-2">
                  <i class="fas ${statusIcon} fa-3x"></i>
                </div>
                <span class="badge bg-${statusColor} px-3 py-2 fs-6 mb-3">${statusBadge}</span>

                <div class="text-start bg-light p-3 rounded border mt-3" style="font-size: 14px;">
                  <div class="mb-2"><strong>Student Name:</strong> ${studentData.studentName}</div>
                  <div class="mb-2"><strong>Enrollment No:</strong> ${studentData.enrollmentNumber}</div>
                  <div class="mb-2"><strong>Program &amp; Sem:</strong> ${studentData.program} (Sem ${studentData.semester})</div>
                  <div class="mb-2"><strong>Exam:</strong> ${exam.name} (${exam.academicYear.name})</div>
                  <div class="mb-2"><strong>Total Subjects:</strong> ${studentData.subjects.length}</div>
                  <div><strong>Verified At:</strong> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
                </div>

                <div class="text-muted small mt-3">
                  <i class="fas fa-lock me-1"></i> Cryptographically Signed &amp; Verified
                </div>
              </div>
            </div>
          </div>
        </body>
        </html>
      `);
    }

    res.json({
      valid: true,
      status: isEligible ? 'ELIGIBLE' : 'REVOKED',
      student: {
        name: studentData.studentName,
        enrollmentNumber: studentData.enrollmentNumber,
        program: studentData.program,
        semester: studentData.semester,
      },
      exam: {
        name: exam.name,
        academicYear: exam.academicYear.name,
      },
      subjectsCount: studentData.subjects.length,
      verifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Verify] Error:', error.message);
    res.status(500).json({ valid: false, error: 'Verification failed' });
  }
});

// ──────────────────────────────────────────────
// GENERATE HALL TICKET (admin — any student)
// ──────────────────────────────────────────────

router.get('/generate/:examId/:enrollmentNumber', requireAdmin, async (req, res) => {
  try {
    const { examId, enrollmentNumber } = req.params;
    const { pdf, studentName } = await buildHallTicket(examId, enrollmentNumber);

    const filename = `${enrollmentNumber}-${studentName}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(pdf);
  } catch (error) {
    console.error('[HallTicket] Generate error:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Failed to generate hall ticket.' });
  }
});

/**
 * Build hall ticket PDF for a student
 * Shared by admin and student endpoints
 */
async function buildHallTicket(examId, enrollmentNumber) {
  // Get exam info
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { academicYear: true },
  });
  if (!exam) throw Object.assign(new Error('Exam not found.'), { status: 404 });

  // Check eligibility
  const eligibility = await prisma.eligibility.findUnique({
    where: { examId_enrollmentNumber: { examId, enrollmentNumber } },
  });
  if (!eligibility || eligibility.finalEligibility !== 'ELIGIBLE') {
    throw Object.assign(new Error('Student is not eligible for this exam.'), { status: 403 });
  }

  // Ensure they are part of a valid (not outdated) Block Report Generation
  // Removed strict check to allow students to download hall tickets before seating is finalized.
  /*
  const activeReport = await prisma.blockReportGeneratedStudent.findFirst({
    where: {
      enrollmentNumber,
      generation: {
        examId,
        isOutdated: false,
      }
    }
  });

  if (!activeReport) {
    throw Object.assign(new Error('Hall Ticket unavailable: Student is not part of a finalized Block Report, or the Block Report is outdated and needs to be regenerated by the Admin.'), { status: 403 });
  }
  */

  // Get student data
  const studentData = await prisma.examStudentData.findUnique({
    where: { examId_enrollmentNumber: { examId, enrollmentNumber } },
    include: {
      subjects: { include: { examSchedule: true } },
    },
  });
  if (!studentData) throw Object.assign(new Error('Student data not found.'), { status: 404 });

  // Get student profile (for photo)
  const profile = await prisma.studentProfile.findUnique({
    where: { enrollmentNumber },
  });

  // Get block assignment
  const blockAssignment = await prisma.blockAssignment.findUnique({
    where: { examId_enrollmentNumber: { examId, enrollmentNumber } },
  });

  const isImprovement = exam.type === 'IMPROVEMENT';
  let rollMap = null;
  if (isImprovement) {
    rollMap = await getExamRollNumberMap(examId);
  }

  // Get schedules for this student
  const schedules = studentData.subjects
    .map(s => {
      if (!s.examSchedule) return null;
      const sched = { ...s.examSchedule };
      if (isImprovement) {
        sched.rollNo = (rollMap && rollMap.get(sched.subjectCode)?.get(enrollmentNumber)) ?? s.rollNumber ?? null;
      }
      sched.blockDisplay = blockAssignment ? `${blockAssignment.blockNumber} – ${blockAssignment.classroom}` : (blockAssignment?.classroom || '—');
      return sched;
    })
    .filter(Boolean);
  schedules.sort((a, b) => new Date(a.examDate) - new Date(b.examDate));

  // Check PDF Cache (Exam-Eve Rush Optimization)
  const cacheKey = computeCacheKey({
    examId,
    enrollmentNumber,
    photoUrl: profile?.photoUrl,
    schedules,
    eligibilityStatus: eligibility.finalEligibility,
  });

  const cachedBuffer = await getCachedPDF(examId, enrollmentNumber, cacheKey);
  if (cachedBuffer) {
    return { pdf: cachedBuffer, studentName: studentData.studentName, fromCache: true };
  }

  const pdf = await generateHallTicketPDF(
    {
      name: studentData.studentName,
      enrollmentNumber: studentData.enrollmentNumber,
      program: studentData.program,
      semester: studentData.semester,
      division: studentData.division,
    },
    {
      id: exam.id,
      examId: exam.id,
      name: exam.name,
      examName: exam.name,
      academicYear: exam.academicYear.name,
      isImprovement,
    },
    schedules,
    blockAssignment,
    profile?.photoUrl || null
  );

  // Save to cache asynchronously without blocking
  await saveCachedPDF(examId, enrollmentNumber, cacheKey, pdf);

  return { pdf, studentName: studentData.studentName, fromCache: false };
}

/**
 * Build hall ticket data for bulk generation (admin-initiated)
 * Skips block report check — admin generation doesn't require finalized block report
 * Still enforces: finalEligibility, seating, schedule
 */
async function buildHallTicketForBulk(examId, enrollmentNumber, exam, rollMap = null) {
  // Check eligibility
  const eligibility = await prisma.eligibility.findUnique({
    where: { examId_enrollmentNumber: { examId, enrollmentNumber } },
  });
  if (!eligibility || eligibility.finalEligibility !== 'ELIGIBLE') {
    return { error: 'Not eligible', enrollmentNumber };
  }

  // Get student data
  const studentData = await prisma.examStudentData.findUnique({
    where: { examId_enrollmentNumber: { examId, enrollmentNumber } },
    include: {
      subjects: { include: { examSchedule: true } },
    },
  });
  if (!studentData) return { error: 'Student data not found', enrollmentNumber };

  // Get block assignment
  const blockAssignment = await prisma.blockAssignment.findUnique({
    where: { examId_enrollmentNumber: { examId, enrollmentNumber } },
  });
  if (!blockAssignment) return { error: 'Missing block/seating assignment', enrollmentNumber };

  const isImprovement = exam.type === 'IMPROVEMENT';
  if (isImprovement && !rollMap) {
    rollMap = await getExamRollNumberMap(examId);
  }

  // Get schedules
  const schedules = studentData.subjects
    .map(s => {
      if (!s.examSchedule) return null;
      const sched = { ...s.examSchedule };
      if (isImprovement) {
        sched.rollNo = (rollMap && rollMap.get(sched.subjectCode)?.get(enrollmentNumber)) ?? s.rollNumber ?? null;
      }
      sched.blockDisplay = blockAssignment ? `${blockAssignment.blockNumber} – ${blockAssignment.classroom}` : (blockAssignment?.classroom || '—');
      return sched;
    })
    .filter(Boolean);
  if (schedules.length === 0) return { error: 'Missing exam schedule', enrollmentNumber };
  schedules.sort((a, b) => new Date(a.examDate) - new Date(b.examDate));

  // Get student profile (for photo)
  const profile = await prisma.studentProfile.findUnique({
    where: { enrollmentNumber },
  });

  const payload = {
    studentData: {
      name: studentData.studentName,
      enrollmentNumber: studentData.enrollmentNumber,
      program: studentData.program,
      semester: studentData.semester,
      division: studentData.division,
    },
    examInfo: {
      id: exam.id,
      examId: exam.id,
      name: exam.name,
      examName: exam.name,
      academicYear: exam.academicYear.name,
      isImprovement,
    },
    schedules,
    blockInfo: blockAssignment,
    photoUrl: profile?.photoUrl || null
  };

  return { payload, enrollmentNumber };
}

// ──────────────────────────────────────────────
// GET FILTER OPTIONS (dependent dropdowns)
// ──────────────────────────────────────────────

router.get('/filters/:examId', requireAdmin, async (req, res) => {
  try {
    const { examId } = req.params;
    const { semester, program, division } = req.query;

    // Build dependent filter conditions
    const where = { examId };
    if (semester) where.semester = parseInt(semester);
    if (program) where.program = program;
    if (division) where.division = division;

    const [programs, divisions, semesters] = await Promise.all([
      prisma.examStudentData.findMany({
        where,
        distinct: ['program'],
        select: { program: true },
        orderBy: { program: 'asc' },
      }),
      prisma.examStudentData.findMany({
        where,
        distinct: ['division'],
        select: { division: true },
        orderBy: { division: 'asc' },
      }),
      prisma.examStudentData.findMany({
        where,
        distinct: ['semester'],
        select: { semester: true },
        orderBy: { semester: 'asc' },
      }),
    ]);

    res.json({
      programs: programs.map(p => p.program).filter(Boolean),
      divisions: divisions.map(d => d.division).filter(Boolean),
      semesters: semesters.map(s => s.semester),
    });
  } catch (error) {
    console.error('[HallTicket] Filters error:', error.message);
    res.status(500).json({ error: 'Failed to load filter options.' });
  }
});

// ──────────────────────────────────────────────
// SEARCH / PREVIEW STUDENTS FOR GENERATION
// ──────────────────────────────────────────────

router.post('/search/:examId', requireAdmin, async (req, res) => {
  try {
    const { examId } = req.params;
    const { program, semester, division, enrollmentNumber } = req.body;

    // Validate exam exists
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    // Build filter with AND logic
    const where = { examId };
    if (program) where.program = program;
    if (semester) where.semester = parseInt(semester);
    if (division) where.division = division;
    if (enrollmentNumber) {
      where.enrollmentNumber = { contains: enrollmentNumber.trim(), mode: 'insensitive' };
    }

    // Fetch students
    const students = await prisma.examStudentData.findMany({
      where,
      include: {
        subjects: { include: { examSchedule: true } },
      },
      orderBy: { enrollmentNumber: 'asc' },
    });

    if (students.length === 0) {
      return res.json({
        message: 'No students found for the selected filters.',
        counts: { total: 0, eligible: 0, notEligible: 0, ready: 0, missingSeating: 0, missingSchedule: 0 },
        students: [],
      });
    }

    // Get eligibility for all found students
    const enrollments = students.map(s => s.enrollmentNumber);
    const eligibilities = await prisma.eligibility.findMany({
      where: { examId, enrollmentNumber: { in: enrollments } },
    });
    const eligMap = new Map(eligibilities.map(e => [e.enrollmentNumber, e]));

    // Get block assignments
    const blockAssignments = await prisma.blockAssignment.findMany({
      where: { examId, enrollmentNumber: { in: enrollments } },
    });
    const blockMap = new Map(blockAssignments.map(b => [b.enrollmentNumber, b]));

    // Build enriched student list with validation
    let eligible = 0, notEligible = 0, ready = 0, missingSeating = 0, missingSchedule = 0;

    const enrichedStudents = students.map(s => {
      const elig = eligMap.get(s.enrollmentNumber);
      const block = blockMap.get(s.enrollmentNumber);
      const schedules = s.subjects.map(sub => sub.examSchedule).filter(Boolean);

      const finalEligibility = elig?.finalEligibility || 'PENDING';
      const isEligible = finalEligibility === 'ELIGIBLE';
      const hasSeating = !!block;
      const hasSchedule = schedules.length > 0;
      const isReady = isEligible && hasSeating && hasSchedule;

      if (isEligible) eligible++;
      else notEligible++;
      if (isReady) ready++;
      if (isEligible && !hasSeating) missingSeating++;
      if (isEligible && !hasSchedule) missingSchedule++;

      const issues = [];
      if (!isEligible) issues.push('Not eligible');
      if (isEligible && !hasSeating) issues.push('Missing block/seating');
      if (isEligible && !hasSchedule) issues.push('Missing exam schedule');

      return {
        enrollmentNumber: s.enrollmentNumber,
        studentName: s.studentName,
        program: s.program,
        semester: s.semester,
        division: s.division || '—',
        finalEligibility,
        isOverridden: !!elig?.adminOverride,
        blockNumber: block?.blockNumber || null,
        classroom: block?.classroom || null,
        hasSchedule,
        scheduleCount: schedules.length,
        isReady,
        issues,
      };
    });

    // Generate message based on results
    let message = `${students.length} student(s) found.`;
    if (eligible === 0 && students.length > 0) {
      message = 'Students found, but no students are currently Final Eligible for Hall Ticket generation.';
    }
    if (missingSeating > 0) {
      message += ` ${missingSeating} eligible student(s) do not have a valid block/seating assignment.`;
    }

    res.json({
      message,
      counts: {
        total: students.length,
        eligible,
        notEligible,
        ready,
        missingSeating,
        missingSchedule,
      },
      students: enrichedStudents,
    });
  } catch (error) {
    console.error('[HallTicket] Search error:', error.message);
    res.status(500).json({ error: 'Failed to search students.' });
  }
});

// ──────────────────────────────────────────────
// BULK GENERATE HALL TICKETS (Combined PDF)
// ──────────────────────────────────────────────

router.post('/generate-bulk/:examId', requireAdmin, async (req, res) => {
  try {
    const { examId } = req.params;
    const { enrollmentNumbers, filterCriteria } = req.body;

    if (!enrollmentNumbers || !Array.isArray(enrollmentNumbers) || enrollmentNumbers.length === 0) {
      return res.status(400).json({ error: 'No students selected for generation.' });
    }

    // Prevent duplicate generation — check if same request is already in progress
    const inProgress = await prisma.hallTicketGeneration.findFirst({
      where: { examId, status: 'IN_PROGRESS' },
    });
    if (inProgress) {
      return res.status(409).json({ error: 'A Hall Ticket generation is already in progress for this exam. Please wait.' });
    }

    // Get exam info
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { academicYear: true },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    // Check for duplicate enrollment numbers
    const uniqueEnrollments = [...new Set(enrollmentNumbers)];

    // Create generation record (IN_PROGRESS)
    const generation = await prisma.hallTicketGeneration.create({
      data: {
        examId,
        generatedBy: req.session.userId,
        filterCriteria: filterCriteria ? JSON.stringify(filterCriteria) : null,
        totalStudents: uniqueEnrollments.length,
        status: 'IN_PROGRESS',
        dataVersion: exam.eligibilityVersion,
      },
    });

    // Generate PDFs for each student
    const payloads = [];
    const generatedStudents = [];
    const skippedStudents = [];

    const isImprovement = exam.type === 'IMPROVEMENT';
    const rollMap = isImprovement ? await getExamRollNumberMap(examId) : null;

    for (const enrollment of uniqueEnrollments) {
      const result = await buildHallTicketForBulk(examId, enrollment, exam, rollMap);
      if (result.error) {
        skippedStudents.push({ enrollmentNumber: enrollment, reason: result.error });
      } else {
        payloads.push(result.payload);
        generatedStudents.push(enrollment);
      }
    }

    if (payloads.length === 0) {
      // Update generation as failed
      await prisma.hallTicketGeneration.update({
        where: { id: generation.id },
        data: {
          status: 'FAILED',
          generatedCount: 0,
          skippedCount: skippedStudents.length,
        },
      });

      return res.status(400).json({
        error: 'No valid Hall Tickets could be generated.',
        skipped: skippedStudents,
      });
    }

    // Combine all PDFs into one buffer
    const combinedPdf = await generateBulkHallTicketPDF(payloads);

    // Update generation record
    await prisma.$transaction(async (tx) => {
      await tx.hallTicketGeneration.update({
        where: { id: generation.id },
        data: {
          status: 'COMPLETED',
          generatedCount: generatedStudents.length,
          skippedCount: skippedStudents.length,
        },
      });

      // Record generated students
      if (generatedStudents.length > 0) {
        await tx.hallTicketGeneratedStudent.createMany({
          data: generatedStudents.map(enr => ({
            generationId: generation.id,
            enrollmentNumber: enr,
          })),
        });
      }
    });

    // Audit log
    await logAudit({
      userId: req.session.userId,
      action: 'HALL_TICKET_BULK_GENERATED',
      entity: 'HallTicketGeneration',
      entityId: generation.id,
      details: {
        examId,
        filterCriteria: filterCriteria || null,
        totalRequested: uniqueEnrollments.length,
        generated: generatedStudents.length,
        skipped: skippedStudents.length,
        skippedDetails: skippedStudents,
      },
      ipAddress: req.ip,
    });

    // Build filename
    let filename = 'HallTickets';
    if (filterCriteria?.program) filename += `_${filterCriteria.program}`;
    if (filterCriteria?.semester) filename += `_Sem${filterCriteria.semester}`;
    if (filterCriteria?.division) filename += `_${filterCriteria.division}`;
    if (uniqueEnrollments.length === 1) filename = `${uniqueEnrollments[0]}_HallTicket`;
    filename = filename.replace(/[^a-zA-Z0-9_-]/g, '') + '.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('X-Generated-Count', generatedStudents.length);
    res.setHeader('X-Skipped-Count', skippedStudents.length);
    res.setHeader('X-Skipped-Details', JSON.stringify(skippedStudents));
    res.send(combinedPdf);
  } catch (error) {
    console.error('[HallTicket] Bulk generate error:', error.message);
    res.status(500).json({ error: 'Failed to generate hall tickets.' });
  }
});

// ──────────────────────────────────────────────
// GENERATION HISTORY
// ──────────────────────────────────────────────

router.get('/history/:examId', requireAdmin, async (req, res) => {
  try {
    const { examId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [generations, total] = await Promise.all([
      prisma.hallTicketGeneration.findMany({
        where: { examId },
        include: {
          user: { select: { email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.hallTicketGeneration.count({ where: { examId } }),
    ]);

    res.json({
      generations: generations.map(g => ({
        id: g.id,
        generatedBy: g.user?.email || 'Unknown',
        filterCriteria: g.filterCriteria ? JSON.parse(g.filterCriteria) : null,
        totalStudents: g.totalStudents,
        generatedCount: g.generatedCount,
        skippedCount: g.skippedCount,
        status: g.status,
        isOutdated: g.isOutdated,
        createdAt: g.createdAt,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('[HallTicket] History error:', error.message);
    res.status(500).json({ error: 'Failed to load generation history.' });
  }
});

module.exports = router;
module.exports.buildHallTicket = buildHallTicket;
