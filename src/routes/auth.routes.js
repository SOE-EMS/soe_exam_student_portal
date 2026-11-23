const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const prisma = require('../config/database');
const fs = require('fs');
const path = require('path');
const { regenerateSession } = require('../middleware/auth');
const { authRateLimiter } = require('../middleware/security');
const {
  validate,
  adminLoginSchema,
  studentLoginSchema,
  studentCheckEmailSchema,
  studentVerifyOtpSchema,
} = require('../middleware/validation');
const {
  studentPhotoUpload,
  handleStudentPhotoMulterError,
  MAX_STUDENT_PHOTO_SIZE,
  validateImageMagicBytes,
} = require('../middleware/fileUpload');
const { logAudit } = require('../services/audit.service');
const { uploadImage } = require('../config/cloudinary');
const {
  sendStudentOtpEmail,
  sendStudentActivationSuccessEmail,
} = require('../services/email.service');

// ──────────────────────────────────────────────
// ADMIN LOGIN
// ──────────────────────────────────────────────

router.post(
  '/admin/login',
  authRateLimiter(),
  validate(adminLoginSchema),
  async (req, res) => {
    try {
      const { email, password } = req.validatedBody;

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user || user.role !== 'ADMIN') {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: 'Account is deactivated.' });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      // Regenerate session to prevent fixation
      await regenerateSession(req, {
        userId: user.id,
        role: user.role,
        email: user.email,
      });

      await logAudit({
        userId: user.id,
        action: 'ADMIN_LOGIN',
        entity: 'User',
        entityId: user.id,
        ipAddress: req.ip,
      });

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      console.error('[Auth] Admin login error:', error.message);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

// ──────────────────────────────────────────────
// STUDENT — CHECK EMAIL & SEND FIRST-TIME OTP
// ──────────────────────────────────────────────

router.post(
  '/student/check-email',
  authRateLimiter(),
  validate(studentCheckEmailSchema),
  async (req, res) => {
    try {
      const normalizedEmail = req.validatedBody.email.toLowerCase().trim();

      // 1. Check if user exists in database
      let user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { studentProfile: true },
      });

      // If not in User table, check if present in ExamStudentData
      if (!user) {
        const examStudent = await prisma.examStudentData.findFirst({
          where: { studentEmailId: { equals: normalizedEmail, mode: 'insensitive' } },
          orderBy: { createdAt: 'desc' },
        });

        if (!examStudent) {
          return res.status(404).json({
            error: 'This college email is not registered in our records. Please contact your administrator.',
          });
        }

        // Create pending account on the fly from admin's exam data
        const randomPass = crypto.randomBytes(32).toString('hex');
        const hashedPassword = await bcrypt.hash(randomPass, 12);

        user = await prisma.$transaction(async (tx) => {
          const newUser = await tx.user.create({
            data: {
              email: normalizedEmail,
              password: hashedPassword,
              role: 'STUDENT',
              isActive: false,
              isActivated: false,
            },
          });

          const profile = await tx.studentProfile.create({
            data: {
              userId: newUser.id,
              name: examStudent.studentName,
              enrollmentNumber: examStudent.enrollmentNumber,
              program: examStudent.program,
              semester: examStudent.semester,
              division: examStudent.division || null,
            },
          });

          return { ...newUser, studentProfile: profile };
        });
      }

      if (user.role !== 'STUDENT') {
        return res.status(403).json({ error: 'Access denied for this account type.' });
      }

      // If already activated, prompt for regular password login
      if (user.isActivated) {
        return res.json({
          isActivated: true,
          email: user.email,
          studentName: user.studentProfile?.name || 'Student',
          message: 'Account is already activated. Please enter your password.',
        });
      }

      // 2. Cooldown check for sending OTP
      const recentOtp = await prisma.otpVerification.findFirst({
        where: {
          email: normalizedEmail,
          isUsed: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      const now = new Date();
      if (recentOtp && recentOtp.resendAfter > now) {
        const secondsLeft = Math.ceil((recentOtp.resendAfter.getTime() - now.getTime()) / 1000);
        return res.json({
          isActivated: false,
          requiresOtp: true,
          email: normalizedEmail,
          studentName: user.studentProfile?.name || 'Student',
          enrollmentNumber: user.studentProfile?.enrollmentNumber,
          resendCooldown: secondsLeft,
          message: `Verification code already sent. You can resend in ${secondsLeft}s.`,
        });
      }

      // 3. Generate 6-digit random numeric OTP
      const rawOtp = crypto.randomInt(100000, 1000000).toString();
      const otpHash = await bcrypt.hash(rawOtp, 10);

      // Invalidate any older unused OTPs for this email
      await prisma.otpVerification.updateMany({
        where: { email: normalizedEmail, isUsed: false },
        data: { isUsed: true },
      });

      // Save new OTP (10 min expiry, 60s resend cooldown, 5 max attempts)
      await prisma.otpVerification.create({
        data: {
          email: normalizedEmail,
          otpHash,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          resendAfter: new Date(Date.now() + 60 * 1000),
          attempts: 0,
          maxAttempts: 5,
        },
      });

      // 4. Send OTP email via SMTP
      await sendStudentOtpEmail({
        to: normalizedEmail,
        studentName: user.studentProfile?.name,
        otp: rawOtp,
        expiresInMinutes: 10,
      });

      res.json({
        isActivated: false,
        requiresOtp: true,
        email: normalizedEmail,
        studentName: user.studentProfile?.name || 'Student',
        enrollmentNumber: user.studentProfile?.enrollmentNumber,
        resendCooldown: 60,
        message: 'Verification code sent to your college email.',
      });
    } catch (error) {
      console.error('[Auth] Check email error:', error.message);
      res.status(500).json({ error: 'Failed to verify college email address: ' + error.message });
    }
  }
);

// ──────────────────────────────────────────────
// STUDENT — RESEND OTP
// ──────────────────────────────────────────────

router.post(
  '/student/resend-otp',
  authRateLimiter(),
  validate(studentCheckEmailSchema),
  async (req, res) => {
    try {
      const normalizedEmail = req.validatedBody.email.toLowerCase().trim();

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { studentProfile: true },
      });

      if (!user || user.role !== 'STUDENT') {
        return res.status(404).json({ error: 'Student account not found.' });
      }

      if (user.isActivated) {
        return res.status(400).json({ error: 'Account is already activated. Please login.' });
      }

      // Check cooldown
      const recentOtp = await prisma.otpVerification.findFirst({
        where: {
          email: normalizedEmail,
          isUsed: false,
        },
        orderBy: { createdAt: 'desc' },
      });

      const now = new Date();
      if (recentOtp && recentOtp.resendAfter > now) {
        const secondsLeft = Math.ceil((recentOtp.resendAfter.getTime() - now.getTime()) / 1000);
        return res.status(429).json({
          error: `Please wait ${secondsLeft} seconds before requesting a new code.`,
          resendCooldown: secondsLeft,
        });
      }

      // Generate new OTP
      const rawOtp = crypto.randomInt(100000, 1000000).toString();
      const otpHash = await bcrypt.hash(rawOtp, 10);

      // Invalidate older OTPs
      await prisma.otpVerification.updateMany({
        where: { email: normalizedEmail, isUsed: false },
        data: { isUsed: true },
      });

      // Save new OTP
      await prisma.otpVerification.create({
        data: {
          email: normalizedEmail,
          otpHash,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          resendAfter: new Date(Date.now() + 60 * 1000),
          attempts: 0,
          maxAttempts: 5,
        },
      });

      // Send OTP
      await sendStudentOtpEmail({
        to: normalizedEmail,
        studentName: user.studentProfile?.name,
        otp: rawOtp,
        expiresInMinutes: 10,
      });

      res.json({
        success: true,
        message: 'A fresh verification code has been sent to your email.',
        resendCooldown: 60,
      });
    } catch (error) {
      console.error('[Auth] Resend OTP error:', error.message);
      res.status(500).json({ error: 'Failed to resend code: ' + error.message });
    }
  }
);

// ──────────────────────────────────────────────
// STUDENT — VERIFY OTP STEP
// ──────────────────────────────────────────────

router.post(
  '/student/verify-otp',
  authRateLimiter(),
  validate(studentVerifyOtpSchema),
  async (req, res) => {
    try {
      const { email, otp } = req.validatedBody;
      const normalizedEmail = email.toLowerCase().trim();

      const activeOtp = await prisma.otpVerification.findFirst({
        where: {
          email: normalizedEmail,
          isUsed: false,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!activeOtp) {
        return res.status(400).json({ error: 'No active verification code found. Please request a new code.' });
      }

      // Check expiry
      if (new Date() > activeOtp.expiresAt) {
        return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
      }

      // Check attempts
      if (activeOtp.attempts >= activeOtp.maxAttempts) {
        return res.status(400).json({
          error: 'Too many incorrect attempts. For security, please request a new verification code.',
        });
      }

      // Compare hash
      const isValid = await bcrypt.compare(otp.trim(), activeOtp.otpHash);
      if (!isValid) {
        const nextAttempts = activeOtp.attempts + 1;
        await prisma.otpVerification.update({
          where: { id: activeOtp.id },
          data: { attempts: nextAttempts },
        });

        const remaining = activeOtp.maxAttempts - nextAttempts;
        return res.status(400).json({
          error: remaining > 0
            ? `Incorrect verification code. ${remaining} attempt(s) remaining.`
            : 'Too many incorrect attempts. Please request a new verification code.',
        });
      }

      // OTP is valid!
      res.json({
        verified: true,
        message: 'Email verified successfully. You can now set your password and upload your photo.',
      });
    } catch (error) {
      console.error('[Auth] Verify OTP error:', error.message);
      res.status(500).json({ error: 'Failed to verify code: ' + error.message });
    }
  }
);

// ──────────────────────────────────────────────
// STUDENT — COMPLETE ACTIVATION (Password + 50 KB Photo)
// ──────────────────────────────────────────────

router.post(
  '/student/complete-activation',
  authRateLimiter(),
  studentPhotoUpload.single('photo'),
  handleStudentPhotoMulterError,
  async (req, res) => {
    try {
      const { email, otp, password, confirmPassword, consent } = req.body;

      if (!email || !otp || !password || !confirmPassword) {
        return res.status(400).json({ error: 'All fields (email, code, password, confirm password) are required.' });
      }

      // Check Privacy & DPDP Act consent
      if (consent !== 'true' && consent !== true && consent !== '1') {
        return res.status(400).json({ error: 'You must review the Examination Privacy Notice and give consent to complete registration.' });
      }

      const normalizedEmail = email.toLowerCase().trim();

      if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match.' });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      }

      // Validate photo strictly <= 50 KB
      if (!req.file) {
        return res.status(400).json({ error: 'Profile photo is required. Please upload your photo.' });
      }

      if (req.file.size > MAX_STUDENT_PHOTO_SIZE) {
        return res.status(400).json({
          error: `Profile photo is too large (${(req.file.size / 1024).toFixed(1)} KB). Maximum allowed size is 50 KB.`,
        });
      }

      // Verify authentic image magic bytes (JPEG or PNG)
      if (!validateImageMagicBytes(req.file.buffer)) {
        return res.status(400).json({
          error: 'Invalid image file signature. Only authentic JPEG and PNG photos are accepted.',
        });
      }

      // Validate OTP
      const activeOtp = await prisma.otpVerification.findFirst({
        where: {
          email: normalizedEmail,
          isUsed: false,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!activeOtp || new Date() > activeOtp.expiresAt) {
        return res.status(400).json({ error: 'Verification code has expired. Please restart activation.' });
      }

      if (activeOtp.attempts >= activeOtp.maxAttempts) {
        return res.status(400).json({ error: 'Too many failed attempts. Please request a new verification code.' });
      }

      const isOtpValid = await bcrypt.compare(otp.trim(), activeOtp.otpHash);
      if (!isOtpValid) {
        return res.status(400).json({ error: 'Invalid verification code.' });
      }

      // Find user & profile
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { studentProfile: true },
      });

      if (!user || user.role !== 'STUDENT') {
        return res.status(404).json({ error: 'Student record not found.' });
      }

      // Save photo to Cloudinary CDN (Vercel serverless compatible) with local fallback
      let photoUrl = null;
      let photoPublicId = null;

      const enrollment = user.studentProfile?.enrollmentNumber || user.id;

      if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
        try {
          const uploadRes = await uploadImage(req.file.buffer, {
            folder: `soe-student-portal/photos/${enrollment}`,
          });
          photoUrl = uploadRes.secure_url;
          photoPublicId = uploadRes.public_id;
        } catch (cloudErr) {
          console.warn('[Auth] Cloudinary upload error, using local fallback:', cloudErr.message);
        }
      }

      // Local fallback if Cloudinary is not configured or failed
      if (!photoUrl) {
        const uploadDir = process.env.VERCEL
          ? path.join(require('os').tmpdir(), 'photos')
          : path.join(__dirname, '../../public/uploads/photos');

        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        const ext = path.extname(req.file.originalname) || '.jpg';
        const filename = `student-${enrollment}-${Date.now()}${ext}`;
        const filePath = path.join(uploadDir, filename);

        fs.writeFileSync(filePath, req.file.buffer);
        photoUrl = `/uploads/photos/${filename}`;
        photoPublicId = filename;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Perform atomic activation update
      await prisma.$transaction(async (tx) => {
        // 1. Update user
        await tx.user.update({
          where: { id: user.id },
          data: {
            password: hashedPassword,
            isActive: true,
            isActivated: true,
          },
        });

        // 2. Update student profile
        if (user.studentProfile) {
          await tx.studentProfile.update({
            where: { id: user.studentProfile.id },
            data: {
              photoUrl,
              photoPublicId: filename,
            },
          });
        }

        // 3. Mark OTP as used
        await tx.otpVerification.update({
          where: { id: activeOtp.id },
          data: { isUsed: true },
        });
      });

      // Send activation confirmation email
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.get('host');
      const loginUrl = `${protocol}://${host}/student/login`;

      try {
        await sendStudentActivationSuccessEmail({
          to: normalizedEmail,
          studentName: user.studentProfile?.name || 'Student',
          loginUrl,
        });
      } catch (emailErr) {
        console.error('[Auth] Activation success email send error:', emailErr.message);
      }

      // Auto login: establish session
      await regenerateSession(req, {
        userId: user.id,
        role: user.role,
        email: user.email,
        enrollmentNumber: user.studentProfile?.enrollmentNumber,
      });

      await logAudit({
        userId: user.id,
        action: 'STUDENT_ACCOUNT_ACTIVATED',
        entity: 'User',
        entityId: user.id,
        details: { email: normalizedEmail, enrollment: user.studentProfile?.enrollmentNumber },
        ipAddress: req.ip,
      });

      res.status(200).json({
        success: true,
        message: 'Account activated successfully! Redirecting to your dashboard...',
        redirectUrl: '/student/dashboard',
        student: {
          id: user.id,
          name: user.studentProfile?.name,
          enrollmentNumber: user.studentProfile?.enrollmentNumber,
          photoUrl,
        },
      });
    } catch (error) {
      console.error('[Auth] Complete activation error:', error.message);
      res.status(500).json({ error: 'Failed to complete account activation: ' + error.message });
    }
  }
);

// ──────────────────────────────────────────────
// REGULAR STUDENT LOGIN (Email + Password)
// ──────────────────────────────────────────────

router.post(
  '/student/login',
  authRateLimiter(),
  validate(studentLoginSchema),
  async (req, res) => {
    try {
      const { email, enrollmentNumber, password } = req.validatedBody;
      const identifier = (email || enrollmentNumber).trim();

      let profile;
      let user;

      // Check whether identifier is email or enrollment number
      if (identifier.includes('@')) {
        const normalizedEmail = identifier.toLowerCase();
        user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: { studentProfile: true },
        });
        profile = user?.studentProfile;
      } else {
        profile = await prisma.studentProfile.findUnique({
          where: { enrollmentNumber: identifier },
          include: { user: true },
        });
        user = profile?.user;
      }

      if (!user || user.role !== 'STUDENT') {
        return res.status(401).json({ error: 'Invalid email address or password.' });
      }

      // Check if account has completed first-time activation
      if (!user.isActivated) {
        return res.status(403).json({
          error: 'Your account has not been activated yet. Please complete first-time activation.',
          notActivated: true,
          email: user.email,
        });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid email address or password.' });
      }

      await regenerateSession(req, {
        userId: user.id,
        role: user.role,
        email: user.email,
        enrollmentNumber: profile?.enrollmentNumber,
      });

      await logAudit({
        userId: user.id,
        action: 'STUDENT_LOGIN',
        entity: 'User',
        entityId: user.id,
        ipAddress: req.ip,
      });

      res.json({
        message: 'Login successful',
        student: {
          id: profile?.id,
          email: user.email,
          enrollmentNumber: profile?.enrollmentNumber,
          name: profile?.name,
          program: profile?.program,
          semester: profile?.semester,
          photoUrl: profile?.photoUrl,
        },
      });
    } catch (error) {
      console.error('[Auth] Student login error:', error.message);
      res.status(500).json({ error: 'Internal server error during login.' });
    }
  }
);

// ──────────────────────────────────────────────
// LOGOUT
// ──────────────────────────────────────────────

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[Auth] Logout error:', err.message);
      return res.status(500).json({ error: 'Failed to logout.' });
    }
    res.clearCookie('soe.sid');
    res.json({ message: 'Logged out successfully.' });
  });
});

// ──────────────────────────────────────────────
// CHECK AUTH STATUS
// ──────────────────────────────────────────────

router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    userId: req.session.userId,
    role: req.session.role,
    email: req.session.email || null,
    enrollmentNumber: req.session.enrollmentNumber || null,
  });
});

module.exports = router;
