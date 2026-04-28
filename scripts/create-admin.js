require('dotenv').config();
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

let privateKey = process.env.FIREBASE_PRIVATE_KEY;
if (privateKey && privateKey.startsWith('"') && privateKey.endsWith('"')) {
  privateKey = privateKey.slice(1, -1).replace(/\\n/g, '\n');
} else if (privateKey) {
  privateKey = privateKey.replace(/\\n/g, '\n');
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey
  })
});
const db = admin.firestore();

async function createAdmin() {
  const email = 'admin@gms.gov.in';
  const password = 'admin123';
  const name = 'GMS Administrator';

  const usersRef = db.collection('users');
  const existing = await usersRef.where('email', '==', email).get();

  if (!existing.empty) {
    console.log('ℹ️  Admin account already exists in Firestore.');
  } else {
    const hash = await bcrypt.hash(password, 10);
    await usersRef.add({
      name: name,
      email: email,
      password_hash: hash,
      role: 'admin',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Admin account created in Firestore!');
    console.log('   📧 Email   :', email);
    console.log('   🔑 Password:', password);
  }
}

createAdmin().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
