// ─── scripts/create-admin.js ──────────────────────────────────
// Run once to create the default admin account:
//   node scripts/create-admin.js
// ─────────────────────────────────────────────────────────────
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql  = require('mysql2/promise');

async function createAdmin() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     process.env.DB_PORT     || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'gms_db',
  });

  const email    = 'admin@gms.gov.in';
  const password = 'admin123';
  const name     = 'GMS Administrator';

  const hash = await bcrypt.hash(password, 10);

  const [existing] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    console.log('✅ Admin already exists:', email);
    await conn.end();
    return;
  }

  await conn.execute(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [name, email, hash, 'admin']
  );

  console.log('✅ Admin account created!');
  console.log('   Email   :', email);
  console.log('   Password:', password);
  console.log('   ⚠️  Change the password before deploying to production.');

  await conn.end();
}

createAdmin().catch(err => {
  console.error('❌ Error creating admin:', err.message);
  process.exit(1);
});
