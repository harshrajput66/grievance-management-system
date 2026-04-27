// ─── routes/complaints.js ────────────────────────────────────
// Citizen-facing complaint APIs
const express = require('express');
const path    = require('path');
const { verifyToken, requireUser } = require('../middleware/auth');
const router  = express.Router();

// All complaint routes require a logged-in user
router.use(verifyToken);

// ─── Helper: generate unique complaint ID ────────────────────
function generateComplaintId() {
  const now = new Date();
  const yy  = String(now.getFullYear()).slice(2);
  const mm  = String(now.getMonth() + 1).padStart(2, '0');
  const dd  = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `GMS-${yy}${mm}${dd}-${rand}`;
}

// ─── GET /api/complaints/stats ───────────────────────────────
router.get('/stats', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;
  try {
    const [rows] = await db.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'Submitted')   AS submitted,
         SUM(status = 'Pending')     AS pending,
         SUM(status = 'In Progress') AS in_progress,
         SUM(status = 'Resolved')    AS resolved,
         SUM(status = 'Rejected')    AS rejected,
         SUM(status = 'Reopened')    AS reopened
       FROM complaints WHERE user_id = ?`,
      [userId]
    );
    return res.json({ success: true, stats: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to load stats.' });
  }
});

// ─── GET /api/complaints ─────────────────────────────────────
router.get('/', async (req, res) => {
  const db     = req.app.locals.db;
  const userId = req.user.id;
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(50, parseInt(req.query.limit) || 10);
  const offset = (page - 1) * limit;

  const { search, status, category, priority } = req.query;

  let where  = 'WHERE user_id = ?';
  const vals = [userId];

  if (search) {
    where += ' AND (complaint_id LIKE ? OR title LIKE ?)';
    vals.push(`%${search}%`, `%${search}%`);
  }
  if (status)   { where += ' AND status = ?';   vals.push(status); }
  if (category) { where += ' AND category = ?'; vals.push(category); }
  if (priority) { where += ' AND priority = ?'; vals.push(priority); }

  try {
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM complaints ${where}`, vals
    );

    const [complaints] = await db.execute(
      `SELECT complaint_id, title, category, priority, status, admin_remark, created_at
       FROM complaints ${where}
       ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      vals
    );

    return res.json({
      success: true,
      complaints,
      pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to load complaints.' });
  }
});

// ─── POST /api/complaints ────────────────────────────────────
router.post('/', async (req, res) => {
  const db     = req.app.locals.db;
  const userId = req.user.id;
  const upload = req.app.locals.upload;

  upload.single('proof')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    const { title, description, category, priority, location } = req.body;

    if (!title || !description || !category) {
      return res.status(400).json({ success: false, message: 'Title, description and category are required.' });
    }
    if (description.length < 20) {
      return res.status(400).json({ success: false, message: 'Description must be at least 20 characters.' });
    }

    let complaintId;
    let attempts = 0;
    do {
      complaintId = generateComplaintId();
      const [ex] = await db.execute('SELECT id FROM complaints WHERE complaint_id = ?', [complaintId]);
      if (ex.length === 0) break;
      attempts++;
    } while (attempts < 5);

    const proofUrl  = req.file ? `/uploads/${req.file.filename}` : null;
    const proofName = req.file ? req.file.originalname : null;

    try {
      await db.execute(
        `INSERT INTO complaints
           (complaint_id, user_id, title, description, category, priority, status, location, proof_url, proof_original_name)
         VALUES (?, ?, ?, ?, ?, ?, 'Submitted', ?, ?, ?)`,
        [complaintId, userId, title.trim(), description.trim(),
         category, priority || 'Medium', location || null, proofUrl, proofName]
      );

      // Insert timeline entry
      await db.execute(
        `INSERT INTO complaint_updates (complaint_id, status, remark, updated_by, action)
         VALUES (?, 'Submitted', 'Complaint submitted by citizen.', ?, 'submitted')`,
        [complaintId, userId]
      );

      // Emit socket event for admin
      const io = req.app.locals.io;
      if (io) io.to('admin_room').emit('complaint:new', { complaintId, title });

      return res.status(201).json({ success: true, complaintId });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Failed to submit complaint.' });
    }
  });
});

// ─── GET /api/complaints/:id ─────────────────────────────────
router.get('/:id', async (req, res) => {
  const db     = req.app.locals.db;
  const userId = req.user.id;
  const cid    = req.params.id;

  try {
    const [rows] = await db.execute(
      `SELECT c.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
       FROM complaints c
       JOIN users u ON u.id = c.user_id
       WHERE c.complaint_id = ? AND c.user_id = ?`,
      [cid, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const [timeline] = await db.execute(
      `SELECT cu.*, u.name AS updated_by_name
       FROM complaint_updates cu
       LEFT JOIN users u ON u.id = cu.updated_by
       WHERE cu.complaint_id = ?
       ORDER BY cu.created_at ASC`,
      [cid]
    );

    return res.json({ success: true, complaint: rows[0], timeline });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to load complaint.' });
  }
});

// ─── POST /api/complaints/:id/reopen ─────────────────────────
router.post('/:id/reopen', requireUser, async (req, res) => {
  const db     = req.app.locals.db;
  const userId = req.user.id;
  const cid    = req.params.id;
  const { reason } = req.body;

  if (!reason || reason.trim().length < 10) {
    return res.status(400).json({ success: false, message: 'Please provide a reopen reason (min 10 characters).' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT id, status FROM complaints WHERE complaint_id = ? AND user_id = ?`,
      [cid, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }
    if (!['Resolved', 'Rejected'].includes(rows[0].status)) {
      return res.status(400).json({ success: false, message: 'Only Resolved or Rejected complaints can be reopened.' });
    }

    await db.execute(
      `UPDATE complaints SET status = 'Reopened', updated_at = NOW() WHERE complaint_id = ?`,
      [cid]
    );

    await db.execute(
      `INSERT INTO complaint_updates (complaint_id, status, remark, updated_by, action)
       VALUES (?, 'Reopened', ?, ?, 'reopened')`,
      [cid, `Reopened by citizen: ${reason.trim()}`, userId]
    );

    const io = req.app.locals.io;
    if (io) io.to('admin_room').emit('complaint:reopened', { complaintId: cid });

    return res.json({ success: true, message: 'Complaint reopened successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to reopen complaint.' });
  }
});

module.exports = router;
