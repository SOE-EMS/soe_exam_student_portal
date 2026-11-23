const prisma = require('../config/database');
const bcrypt = require('bcrypt');

/**
 * Seed admin account from environment variables
 * Called once during server startup
 */
async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.log('[Seed] ADMIN_EMAIL or ADMIN_PASSWORD not configured in environment — skipping admin seed.');
    return;
  }

  // Security check: Flag weak or default credentials
  const weakPasswords = ['admin', 'admin123', 'admin1234', 'admin@123', 'password', '12345678'];
  if (weakPasswords.includes(adminPassword.toLowerCase())) {
    console.warn('[Security Warning] ADMIN_PASSWORD is set to a common default. Please update ADMIN_PASSWORD in your .env file with a strong secret.');
  }

  try {
    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN', email: adminEmail },
    });

    if (existingAdmin) {
      console.log(`[Seed] Admin account verified: ${adminEmail}`);
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        role: 'ADMIN',
        isActive: true,
        isActivated: true,
      },
    });

    console.log(`[Seed] Admin account initialized securely: ${adminEmail}`);
  } catch (error) {
    console.error('[Seed] Failed to seed admin account:', error.message);
  }
}

module.exports = { seedAdmin };
