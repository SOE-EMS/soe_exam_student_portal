const prisma = require('../config/database');

/**
 * Log an admin action to the audit trail
 * Never logs passwords or secrets
 *
 * @param {Object} params
 * @param {string} params.userId - ID of the user performing the action
 * @param {string} params.action - Action description (e.g., "EXAM_CREATED", "EXCEL_UPLOADED")
 * @param {string} params.entity - Entity type (e.g., "Exam", "ExamStudentData")
 * @param {string} [params.entityId] - ID of the affected entity
 * @param {Object} [params.details] - Additional details (will be JSON-stringified)
 * @param {string} [params.ipAddress] - Client IP address
 */
async function logAudit({ userId, action, entity, entityId, details, ipAddress }) {
  try {
    // Sanitize details — never log sensitive fields
    let sanitizedDetails = details;
    if (details && typeof details === 'object') {
      const { password, secret, token, ...safe } = details;
      sanitizedDetails = safe;
    }

    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId: entityId || null,
        details: sanitizedDetails ? JSON.stringify(sanitizedDetails) : null,
        ipAddress: ipAddress || null,
      },
    });
  } catch (error) {
    // Audit logging should not crash the application
    console.error('[Audit] Failed to log:', error.message);
  }
}

/**
 * Get audit logs with pagination and filters
 */
async function getAuditLogs({ page = 1, limit = 50, action, entity, userId }) {
  const where = {};
  if (action) where.action = action;
  if (entity) where.entity = entity;
  if (userId) where.userId = userId;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

module.exports = {
  logAudit,
  getAuditLogs,
};
