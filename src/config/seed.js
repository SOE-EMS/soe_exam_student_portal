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
    console.log('[Seed] ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed.');
    return;
  }

  try {
    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN', email: adminEmail },
    });

    if (existingAdmin) {
      console.log(`[Seed] Admin account already exists: ${adminEmail}`);
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        role: 'ADMIN',
        isActive: true,
      },
    });

    console.log(`[Seed] Admin account created: ${adminEmail}`);
  } catch (error) {
    console.error('[Seed] Failed to seed admin account:', error.message);
  }
}

module.exports = { seedAdmin };
