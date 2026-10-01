const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

// ──────────────────────────────────────────────
// DASHBOARD STATISTICS
// ──────────────────────────────────────────────

router.get('/dashboard/stats', requireAdmin, async (req, res) => {
  try {
    const [
      totalStudents,
      totalExams,
      eligibleCount,
      notEligibleCount,
      totalBlocks,
      hallTicketSettings,
      blockReportCount,
    ] = await Promise.all([
      prisma.examStudentData.groupBy({
        by: ['enrollmentNumber'],
        _count: true,
      }).then(r => r.length),
      prisma.exam.count(),
      prisma.eligibility.count({ where: { finalEligibility: 'ELIGIBLE' } }),
      prisma.eligibility.count({ where: { finalEligibility: 'NOT_ELIGIBLE' } }),
      prisma.seatingArrangement.count(),
      prisma.hallTicketSettings.count(),
      prisma.auditLog.count({ where: { action: 'BLOCK_REPORT_GENERATED' } }),
    ]);

    res.json({
      totalStudents,
      totalExams,
      eligibleStudents: eligibleCount,
      notEligibleStudents: notEligibleCount,
      totalBlocks,
      hallTicketsGenerated: hallTicketSettings,
      blockReportsGenerated: blockReportCount,
    });
  } catch (error) {
    console.error('[Admin] Dashboard stats error:', error.message);
    res.status(500).json({ error: 'Failed to load dashboard statistics.' });
  }
});

// ──────────────────────────────────────────────
// RECENT ACTIVITY (from Audit Log)
// ──────────────────────────────────────────────

router.get('/dashboard/activity', requireAdmin, async (req, res) => {
  try {
    const activities = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        user: { select: { email: true, role: true } },
      },
    });

    res.json({ activities });
  } catch (error) {
    console.error('[Admin] Activity error:', error.message);
    res.status(500).json({ error: 'Failed to load activity.' });
  }
});

module.exports = router;
