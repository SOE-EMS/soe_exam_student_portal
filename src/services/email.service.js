const nodemailer = require('nodemailer');

/**
 * Create and return a Nodemailer SMTP transporter.
 */
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration missing: host, user, or pass not set in environment.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  });
}

/**
 * Verify SMTP connection and credentials.
 */
async function verifyConnection() {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('[SMTP] Connection and credentials verified successfully.');
    return { success: true };
  } catch (error) {
    console.error('[SMTP] Verification failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send an email using configured SMTP settings.
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.text] - Plain text content
 */
async function sendEmail({ to, subject, html, text }) {
  if (!to) {
    throw new Error('Recipient email (to) is required.');
  }

  const fromName = process.env.SMTP_FROM_NAME || 'SOE Examination Portal';
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  const fromAddress = `"${fromName}" <${fromEmail}>`;

  const transporter = createTransporter();

  const mailOptions = {
    from: fromAddress,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[SMTP] Email sent successfully to ${to} (MessageId: ${info.messageId})`);
    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
    };
  } catch (error) {
    console.error(`[SMTP] Failed to send email to ${to}:`, error.message);
    throw error;
  }
}

/**
 * Send a test email to verify end-to-end delivery.
 */
async function sendTestEmail(toEmail) {
  const subject = 'Test Email — SOE Examination Portal SMTP Service';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #1e40af; margin-bottom: 16px;">SMTP Verification Successful</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hello,</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">
        This is a verification email from the <strong>SOE Examination Portal</strong>. Your SMTP configuration is working properly and ready to send actual emails.
      </p>
      <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 20px 0;">
        <p style="margin: 0; color: #475569; font-size: 14px;"><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p style="margin: 4px 0 0; color: #475569; font-size: 14px;"><strong>Recipient:</strong> ${toEmail}</p>
        <p style="margin: 4px 0 0; color: #475569; font-size: 14px;"><strong>Status:</strong> Active & Verified</p>
      </div>
      <p style="color: #64748b; font-size: 13px; margin-top: 24px;">
        This email was automatically triggered to verify SMTP email service integration.
      </p>
    </div>
  `;

  return sendEmail({ to: toEmail, subject, html });
}

/**
 * Send welcome email when admin registers a new student.
 */
async function sendStudentWelcomeEmail({ to, studentName, loginUrl }) {
  const subject = 'Welcome to SOE Examination Portal — Activate Your Account';
  const institutionName = process.env.INSTITUTION_NAME || 'School of Engineering';
  const targetUrl = loginUrl || process.env.INSTITUTION_WEBSITE || 'http://localhost:3000/student/login';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .wrapper { max-width: 600px; margin: 20px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 32px 24px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
        .header p { margin: 6px 0 0; font-size: 14px; opacity: 0.9; }
        .body { padding: 32px 24px; color: #334155; line-height: 1.6; }
        .greeting { font-size: 18px; font-weight: 600; color: #1e293b; margin-bottom: 16px; }
        .notice-box { background: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; border-radius: 6px; margin: 20px 0; }
        .steps-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0; }
        .steps-card h3 { margin: 0 0 12px; font-size: 15px; color: #1e40af; }
        .steps-list { margin: 0; padding-left: 20px; }
        .steps-list li { margin-bottom: 8px; font-size: 14px; }
        .btn-container { text-align: center; margin: 32px 0; }
        .btn { display: inline-block; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #ffffff !important; text-decoration: none; font-weight: 600; padding: 14px 32px; border-radius: 8px; font-size: 15px; box-shadow: 0 4px 12px rgba(30,64,175,0.25); }
        .footer { background: #f1f5f9; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>${institutionName}</h1>
          <p>Student Examination Portal</p>
        </div>
        <div class="body">
          <div class="greeting">Welcome, ${studentName || 'Student'}!</div>
          <p>
            Your student account has been created by the administration for the <strong>SOE Examination Portal</strong>.
          </p>
          <div class="notice-box">
            <strong>Action Required:</strong> Please complete your first-time account activation to set your password and access your exam eligibility and hall tickets.
          </div>
          <div class="steps-card">
            <h3>Quick Activation Steps:</h3>
            <ol class="steps-list">
              <li>Click the activation button below to visit the portal.</li>
              <li>Enter your registered college email: <strong>${to}</strong></li>
              <li>Verify the one-time verification code (OTP) sent to your inbox.</li>
              <li>Create your secure password and upload your profile photo (max 50 KB).</li>
            </ol>
          </div>
          <div class="btn-container">
            <a href="${targetUrl}" class="btn">Activate Your Account &rarr;</a>
          </div>
          <p style="font-size: 13px; color: #64748b;">
            Direct link: <a href="${targetUrl}" style="color: #3b82f6;">${targetUrl}</a>
          </p>
        </div>
        <div class="footer">
          <p style="margin: 0;">This is an automated notification. Please do not reply directly to this email.</p>
          <p style="margin: 4px 0 0;">&copy; ${new Date().getFullYear()} ${institutionName}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to, subject, html });
}

/**
 * Send OTP verification email for account activation.
 */
async function sendStudentOtpEmail({ to, studentName, otp, expiresInMinutes = 10 }) {
  const subject = `${otp} is your verification code — SOE Examination Portal`;
  const institutionName = process.env.INSTITUTION_NAME || 'School of Engineering';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .wrapper { max-width: 540px; margin: 20px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 28px 24px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
        .body { padding: 32px 24px; color: #334155; line-height: 1.6; text-align: center; }
        .otp-box { background: #f1f5f9; border: 2px dashed #3b82f6; border-radius: 12px; padding: 18px 24px; margin: 24px auto; display: inline-block; }
        .otp-code { font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #1e40af; font-family: monospace; }
        .info-text { font-size: 14px; color: #64748b; margin: 16px 0; }
        .warning-box { background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 12px; font-size: 13px; color: #92400e; margin-top: 24px; text-align: left; }
        .footer { background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>Email Verification</h1>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">${institutionName}</p>
        </div>
        <div class="body">
          <p style="font-size: 16px; margin: 0 0 12px; color: #1e293b;">Hello <strong>${studentName || 'Student'}</strong>,</p>
          <p style="margin: 0; font-size: 14px;">Use the verification code below to verify your college email address and activate your account:</p>
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
          </div>
          <p class="info-text">
            This code is single-use and will expire in <strong>${expiresInMinutes} minutes</strong>.
          </p>
          <div class="warning-box">
            <strong>Security Notice:</strong> Never share this code with anyone. Institutional staff will never ask for your verification code.
          </div>
        </div>
        <div class="footer">
          <p style="margin: 0;">If you did not request this verification code, please ignore this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to, subject, html });
}

/**
 * Send confirmation email after successful account activation.
 */
async function sendStudentActivationSuccessEmail({ to, studentName, loginUrl }) {
  const subject = 'Account Activated Successfully — SOE Examination Portal';
  const institutionName = process.env.INSTITUTION_NAME || 'School of Engineering';
  const targetUrl = loginUrl || process.env.INSTITUTION_WEBSITE || 'http://localhost:3000/student/login';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .wrapper { max-width: 560px; margin: 20px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #059669, #10b981); padding: 32px 24px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
        .body { padding: 32px 24px; color: #334155; line-height: 1.6; }
        .success-box { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; margin: 20px 0; color: #065f46; font-size: 14px; }
        .btn-container { text-align: center; margin: 28px 0; }
        .btn { display: inline-block; background: linear-gradient(135deg, #1e40af, #3b82f6); color: #ffffff !important; text-decoration: none; font-weight: 600; padding: 13px 30px; border-radius: 8px; font-size: 14px; }
        .footer { background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>Account Activated!</h1>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">${institutionName}</p>
        </div>
        <div class="body">
          <p style="font-size: 16px; margin: 0 0 12px; color: #1e293b;">Dear <strong>${studentName || 'Student'}</strong>,</p>
          <div class="success-box">
            Your account on the SOE Examination Portal has been activated successfully. Your password and profile photo have been saved.
          </div>
          <p style="font-size: 14px;">
            You can now log in anytime using your registered college email (<strong>${to}</strong>) and your password to check examination eligibility, schedules, and download hall tickets.
          </p>
          <div class="btn-container">
            <a href="${targetUrl}" class="btn">Log In to Student Portal &rarr;</a>
          </div>
        </div>
        <div class="footer">
          <p style="margin: 0;">&copy; ${new Date().getFullYear()} ${institutionName}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to, subject, html });
}

module.exports = {
  createTransporter,
  verifyConnection,
  sendEmail,
  sendTestEmail,
  sendStudentWelcomeEmail,
  sendStudentOtpEmail,
  sendStudentActivationSuccessEmail,
};
