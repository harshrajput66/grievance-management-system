// ============================================================
// GMS — Grievance Management System Server
// ============================================================
require('dotenv').config();

const express   = require('express');
const http      = require('http');
const path      = require('path');
const cors      = require('cors');
const jwt       = require('jsonwebtoken');
const multer    = require('multer');
// Firebase Admin Setup
const admin = require('firebase-admin');

// Ensure private key string parses newlines properly
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

// Cloudinary & Multer Setup
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'gms_complaints_proofs',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf'],
    public_id: (req, file) => `proof-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 }
});

const app    = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ─── Attach shared objects to app ─────────────────────────────
app.use((req, res, next) => {
  req.app.locals.db     = db;
  req.app.locals.upload = upload;
  req.app.locals.admin  = admin; // Pass admin reference if needed (e.g. for FieldValue)
  next();
});

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/admin',      require('./routes/admin'));



// ─── SPA HTML Page Routing ────────────────────────────────────
// User pages
app.get('/',                     (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login',                (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register',             (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/user/dashboard',       (req, res) => res.sendFile(path.join(__dirname, 'public', 'user-dashboard.html')));
app.get('/user/raise-complaint', (req, res) => res.sendFile(path.join(__dirname, 'public', 'raise-complaint.html')));
app.get('/user/my-complaints',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'my-complaints.html')));
app.get('/user/complaint/:id',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'complaint-detail.html')));

// Admin pages
app.get('/admin/login',              (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html')));
app.get('/admin/dashboard',          (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html')));
app.get('/admin/complaints',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'complaints.html')));
app.get('/admin/complaint/:id',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'complaint-detail.html')));

// ─── 404 Fallback ─────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'API endpoint not found.' });
  }
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error Handler ────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
});

// ─── Start Server ─────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`\n🏛️  GMS Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
