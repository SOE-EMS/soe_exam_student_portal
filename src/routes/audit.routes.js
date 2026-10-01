const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

// ──────────────────────────────────────────────
// GET AUDIT LOGS
// ──────────────────────────────────────────────

router.get('/', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, entity, action } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const where = {};
    if (entity) where.entity = entity;
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Format for response
    const formattedLogs = logs.map(log => ({
      id: log.id,
      user: log.user?.email || 'System',
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      details: log.details,
      ipAddress: log.ipAddress,
      timestamp: log.createdAt,
    }));

    res.json({
      logs: formattedLogs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('[Audit] Fetch error:', error.message);
    res.status(500).json({ error: 'Failed to load audit logs.' });
  }
});

// ──────────────────────────────────────────────
// GET FILTERS
// ──────────────────────────────────────────────

router.get('/filters', requireAdmin, async (req, res) => {
  try {
    const actions = await prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' }
    });
    const entities = await prisma.auditLog.findMany({
      distinct: ['entity'],
      select: { entity: true },
      orderBy: { entity: 'asc' }
    });

    res.json({
      actions: actions.map(a => a.action),
      entities: entities.map(e => e.entity),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load filters.' });
  }
});

module.exports = router;
