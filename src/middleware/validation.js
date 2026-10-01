const { z } = require('zod');

// ──────────────────────────────────────────────
// AUTH SCHEMAS
// ──────────────────────────────────────────────

const adminLoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const studentLoginSchema = z.object({
  enrollmentNumber: z.string().min(1, 'Enrollment number is required').trim(),
  password: z.string().min(1, 'Password is required'),
});

const enrollmentVerifySchema = z.object({
  enrollmentNumber: z.string().min(1, 'Enrollment number is required').trim(),
});

const studentRegisterSchema = z.object({
  enrollmentNumber: z.string().min(1, 'Enrollment number is required').trim(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// ──────────────────────────────────────────────
// ACADEMIC YEAR SCHEMAS
// ──────────────────────────────────────────────

const academicYearSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  startYear: z.number().int().min(2020).max(2100),
  endYear: z.number().int().min(2020).max(2100),
  type: z.enum(['ODD', 'EVEN']),
});

// ──────────────────────────────────────────────
// EXAM SCHEMAS
// ──────────────────────────────────────────────

const examSchema = z.object({
  name: z.string().min(1, 'Exam name is required').trim(),
  academicYearId: z.string().min(1, 'Academic year is required'),
  semesters: z.array(z.number().int().min(1).max(10)).min(1, 'Select at least one semester'),
});

// ──────────────────────────────────────────────
// ELIGIBILITY SCHEMAS
// ──────────────────────────────────────────────

const eligibilityCriteriaSchema = z.object({
  minAttendancePercent: z.number().min(0).max(100),
  feesRequired: z.enum(['Paid', 'Any']),
});

const eligibilityAnalysisSchema = z.object({
  semesters: z.array(z.number().int()).min(1),
  programs: z.array(z.string()).min(1),
  minAttendancePercent: z.number().min(0).max(100),
  feesRequired: z.enum(['Paid', 'Any']),
});

const eligibilityOverrideSchema = z.object({
  override: z.enum(['ELIGIBLE', 'NOT_ELIGIBLE']),
  reason: z.string().optional(),
});

// ──────────────────────────────────────────────
// HALL TICKET SETTINGS SCHEMA
// ──────────────────────────────────────────────

const hallTicketSettingsSchema = z.object({
  availableFrom: z.string().datetime().optional().nullable(),
  availableTo: z.string().datetime().optional().nullable(),
});

// ──────────────────────────────────────────────
// VALIDATION MIDDLEWARE FACTORY
// ──────────────────────────────────────────────

/**
 * Creates middleware that validates req.body against a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 */
function validate(schema) {
  return (req, res, next) => {
    try {
      const result = schema.parse(req.body);
      req.validatedBody = result;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => e.message);
        return res.status(400).json({
          error: 'Validation failed',
          details: messages,
        });
      }
      next(error);
    }
  };
}

module.exports = {
  adminLoginSchema,
  studentLoginSchema,
  enrollmentVerifySchema,
  studentRegisterSchema,
  academicYearSchema,
  examSchema,
  eligibilityCriteriaSchema,
  eligibilityAnalysisSchema,
  eligibilityOverrideSchema,
  hallTicketSettingsSchema,
  validate,
};
