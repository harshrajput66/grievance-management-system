require('dotenv').config();
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function setup() {
  const DB = process.env.DB_NAME || 'gms_db';

  // Connect without a DB first
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  console.log('✅ Connected to MySQL');

  // Use query() for DDL (CREATE/ALTER) — execute() is for DML only
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  console.log(`✅ Database \`${DB}\` ready`);

  await conn.query(`USE \`${DB}\``);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      name          VARCHAR(100)  NOT NULL,
      email         VARCHAR(150)  UNIQUE NOT NULL,
      phone         VARCHAR(15),
      address       TEXT,
      password_hash VARCHAR(255)  NOT NULL,
      role          ENUM('user','admin') DEFAULT 'user',
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Table: users');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS complaints (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      complaint_id        VARCHAR(25)   UNIQUE NOT NULL,
      user_id             INT           NOT NULL,
      title               VARCHAR(255)  NOT NULL,
      description         TEXT          NOT NULL,
      category            VARCHAR(100)  NOT NULL,
      priority            ENUM('Low','Medium','High','Urgent') DEFAULT 'Medium',
      status              ENUM('Submitted','Pending','In Progress','Resolved','Rejected','Reopened') DEFAULT 'Submitted',
      location            VARCHAR(255),
      proof_url           VARCHAR(500),
      proof_original_name VARCHAR(255),
      admin_remark        TEXT,
      created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  console.log('✅ Table: complaints');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS complaint_updates (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      complaint_id VARCHAR(25) NOT NULL,
      status       VARCHAR(50),
      remark       TEXT,
      updated_by   INT,
      action       VARCHAR(50) DEFAULT 'status_change',
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Table: complaint_updates');

  // Seed admin account
  const email    = 'admin@gms.gov.in';
  const password = 'admin123';
  const name     = 'GMS Administrator';

  const [existing] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    console.log('ℹ️  Admin account already exists — skipping');
  } else {
    const hash = await bcrypt.hash(password, 10);
    await conn.execute(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, 'admin']
    );
    console.log('✅ Admin account created!');
    console.log('   📧 Email   :', email);
    console.log('   🔑 Password:', password);
  }

  await conn.end();
  console.log('\n🎉 Setup complete! Now run: node server.js\n');
}

setup().catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
