require('dotenv').config();
const mysql = require('mysql2/promise');
async function test() {
  console.log('Trying password:', JSON.stringify(process.env.DB_PASSWORD));
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });
    console.log('✅ Connected to MySQL!');
    await conn.end();
  } catch(e) {
    console.log('❌ Failed:', e.message);
  }
}
test();
