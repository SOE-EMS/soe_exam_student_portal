const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { requireStudent } = require('../middleware/auth');
const { photoUpload, handleMulterError } = require('../middleware/fileUpload');
const { uploadImage, deleteImage } = require('../config/cloudinary');
const { buildHallTicket } = require('./hallTicket.routes');

// ──────────────────────────────────────────────
// GET STUDENT DASHBOARD DATA
// ──────────────────────────────────────────────

router.get('/dashboard', requireStudent, async (req, res) => {
  try {
    const profile = await prisma.studentProfile.findFirst({
      where: { userId: req.session.userId },
    });

    if (!profile) return res.status(404).json({ error: 'Student profile not found.' });

    // Get eligibility records
    const eligibilities = await prisma.eligibility.findMany({
      where: { enrollmentNumber: profile.enrollmentNumber },
      include: {
        exam: {
          include: { academicYear: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get hall ticket availability for eligible exams
    const eligibleExamIds = eligibilities
      .filter(e => e.finalEligibility === 'ELIGIBLE')
      .map(e => e.examId);

    const hallTicketSettings = await prisma.hallTicketSettings.findMany({
      where: { examId: { in: eligibleExamIds } },
    });
    const settingsMap = new Map(hallTicketSettings.map(s => [s.examId, s]));

    const now = new Date();

    const exams = eligibilities.map(e => {
      const settings = settingsMap.get(e.examId);
      const isAvailable = e.finalEligibility === 'ELIGIBLE' &&
        settings &&
        (!settings.availableFrom || new Date(settings.availableFrom) <= now) &&
        (!settings.availableTo || new Date(settings.availableTo) >= now);

      return {
        examId: e.examId,
        examName: e.exam.name,
        academicYear: e.exam.academicYear.name,
        eligibility: e.finalEligibility,
        isOverridden: !!e.adminOverride,
        hallTicketAvailable: isAvailable,
        availableFrom: settings?.availableFrom || null,
        availableTo: settings?.availableTo || null,
      };
    });

    res.json({
      student: {
        name: profile.name,
        enrollmentNumber: profile.enrollmentNumber,
        program: profile.program,
        semester: profile.semester,
        division: profile.division,
        photoUrl: profile.photoUrl,
      },
      exams,
    });
  } catch (error) {
    console.error('[Student] Dashboard error:', error.message);
    res.status(500).json({ error: 'Failed to load dashboard.' });
  }
});

// ──────────────────────────────────────────────
// DOWNLOAD HALL TICKET (student self-service)
// ──────────────────────────────────────────────

router.get('/hall-ticket/:examId', requireStudent, async (req, res) => {
  try {
    const { examId } = req.params;

    const profile = await prisma.studentProfile.findFirst({
      where: { userId: req.session.userId },
    });
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    // Check hall ticket availability window
    const settings = await prisma.hallTicketSettings.findUnique({
      where: { examId },
    });

    const now = new Date();
    if (settings) {
      if (settings.availableFrom && new Date(settings.availableFrom) > now) {
        return res.status(403).json({
          error: `Hall tickets will be available from ${new Date(settings.availableFrom).toLocaleString()}.`,
        });
      }
      if (settings.availableTo && new Date(settings.availableTo) < now) {
        return res.status(403).json({
          error: 'Hall ticket download period has ended.',
        });
      }
    }

    const { pdf, studentName } = await buildHallTicket(examId, profile.enrollmentNumber);

    const filename = `${profile.enrollmentNumber}-${studentName}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(pdf);
  } catch (error) {
    console.error('[Student] Hall ticket error:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Failed to download hall ticket.' });
  }
});

// ──────────────────────────────────────────────
// UPDATE PHOTO (one-time re-upload)
// ──────────────────────────────────────────────

router.post(
  '/update-photo',
  requireStudent,
  photoUpload.single('photo'),
  handleMulterError,
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No photo uploaded.' });

      const profile = await prisma.studentProfile.findFirst({
        where: { userId: req.session.userId },
      });
      if (!profile) return res.status(404).json({ error: 'Profile not found.' });

      // Delete old photo from Cloudinary
      if (profile.photoPublicId) {
        try {
          await deleteImage(profile.photoPublicId);
        } catch (e) {
          console.error('[Student] Old photo delete error:', e.message);
        }
      }

      // Upload new photo
      const result = await uploadImage(req.file.buffer, {
        folder: `soe-student-portal/photos/${profile.enrollmentNumber}`,
      });

      await prisma.studentProfile.update({
        where: { id: profile.id },
        data: {
          photoUrl: result.secure_url,
          photoPublicId: result.public_id,
        },
      });

      res.json({
        message: 'Photo updated successfully.',
        photoUrl: result.secure_url,
      });
    } catch (error) {
      console.error('[Student] Photo update error:', error.message);
      res.status(500).json({ error: 'Failed to update photo.' });
    }
  }
);

module.exports = router;
