// ============================================================
// GMS — Grievance Management System Server
// ============================================================
require('dotenv').config();

const express   = require('express');
const http      = require('http');
const path      = require('path');
const cors      = require('cors');
const mysql     = require('mysql2/promise');
const jwt       = require('jsonwebtoken');
const multer    = require('multer');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

// ─── Multer Configuration ─────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public', 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `proof-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.pdf'];
  const ext     = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('Only images (JPEG, PNG, GIF) and PDF files are allowed.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 }
});

// ─── Database Connection Pool ─────────────────────────────────
let db;
async function initDB() {
  db = await mysql.createPool({
    host:            process.env.DB_HOST     || 'localhost',
    port:            process.env.DB_PORT     || 3306,
    user:            process.env.DB_USER     || 'root',
    password:        process.env.DB_PASSWORD || '',
    database:        process.env.DB_NAME     || 'gms_db',
    waitForConnections: true,
    connectionLimit:    10,
    charset:            'utf8mb4'
  });

  // Test connection
  const conn = await db.getConnection();
  console.log('✅ MySQL connected to database:', process.env.DB_NAME || 'gms_db');
  conn.release();
}

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ─── Attach shared objects to app ─────────────────────────────
app.use((req, res, next) => {
  req.app.locals.db     = db;
  req.app.locals.io     = io;
  req.app.locals.upload = upload;
  next();
});

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/admin',      require('./routes/admin'));

// ─── Socket.IO ───────────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const user = socket.user;
  console.log(`[Socket] Connected: ${user.name} (${user.role})`);

  if (user.role === 'admin') {
    socket.join('admin_room');
  }

  socket.on('join:user', (userId) => {
    if (String(user.id) === String(userId)) {
      socket.join(`user_${userId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${user.name}`);
  });
});

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
async function start() {
  try {
    await initDB();

    // Ensure uploads directory exists
    const fs = require('fs');
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    server.listen(PORT, () => {
      console.log(`\n🏛️  GMS Server running at http://localhost:${PORT}`);
      console.log(`   Admin Login : http://localhost:${PORT}/admin/login`);
      console.log(`   Citizen     : http://localhost:${PORT}/\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    console.error('\n💡 Make sure MySQL is running and .env is configured correctly.');
    process.exit(1);
  }
}

start();
