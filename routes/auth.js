// ─── routes/auth.js ──────────────────────────────────────────
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const router  = express.Router();

// Helper: sign JWT
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ─── POST /api/auth/register ─────────────────────────────────
router.post('/register', async (req, res) => {
  const db = req.app.locals.db;
  const admin = req.app.locals.admin;
  const { name, email, phone, address, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  }

  try {
    const usersRef = db.collection('users');
    const existing = await usersRef.where('email', '==', email.toLowerCase()).get();
    
    if (!existing.empty) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const newUser = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone || null,
      address: address || null,
      password_hash: hash,
      role: 'user',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await usersRef.add(newUser);
    const user  = { id: docRef.id, name: newUser.name, email: newUser.email, role: 'user' };
    const token = signToken(user);

    return res.status(201).json({ success: true, token, user });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─── POST /api/auth/login ────────────────────────────────────
router.post('/login', async (req, res) => {
  const db = req.app.locals.db;
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', email.toLowerCase().trim()).get();

    if (snapshot.empty) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const doc = snapshot.docs[0];
    const user = { id: doc.id, ...doc.data() };

    if (user.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Please use the admin login page.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const tokenUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token     = signToken(tokenUser);

    return res.json({ success: true, token, user: tokenUser });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─── POST /api/auth/admin/login ──────────────────────────────
router.post('/admin/login', async (req, res) => {
  const db = req.app.locals.db;
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', email.toLowerCase().trim()).where('role', '==', 'admin').get();

    if (snapshot.empty) {
      return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
    }

    const doc = snapshot.docs[0];
    const user = { id: doc.id, ...doc.data() };

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
    }

    const tokenUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token     = signToken(tokenUser);

    return res.json({ success: true, token, user: tokenUser });
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─── GET /api/auth/me ────────────────────────────────────────
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ success: false });

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ success: true, user: decoded });
  } catch {
    return res.status(401).json({ success: false });
  }
});

module.exports = router;
