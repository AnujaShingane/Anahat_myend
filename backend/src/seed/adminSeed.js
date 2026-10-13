import { env } from '../config/env.js';
import { User } from '../models/postgres/index.js';
import { hashPassword } from '../utils/password.js';

// Admin is fixed via .env. Nobody can register as admin through the API.
export async function ensureAdmin() {
  if (!env.admin.email || !env.admin.password) return;
  const exists = await User.findOne({ where: { email: env.admin.email.toLowerCase() } });
  if (exists) return;
  await User.create({
    firstName: env.admin.name.split(' ')[0], lastName: env.admin.name.split(' ').slice(1).join(' ') || 'Admin',
    email: env.admin.email.toLowerCase(), passwordHash: await hashPassword(env.admin.password),
    role: 'admin', isApproved: true, isProfileComplete: true,
  });
  console.log(`✔ Admin account created: ${env.admin.email}`);
}

// Allow `npm run seed:admin`
if (process.argv[1]?.endsWith('adminSeed.js')) {
  const { connectPostgres } = await import('../config/postgres.js');
  await connectPostgres();
  await ensureAdmin();
  process.exit(0);
}
