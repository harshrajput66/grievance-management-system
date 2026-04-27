// ─── routes/admin.js ─────────────────────────────────────────
// Admin-facing complaint management APIs
const express = require('express');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const router  = express.Router();

// All admin routes require JWT + admin role
router.use(verifyToken, requireAdmin);

// ─── GET /api/admin/stats ────────────────────────────────────
router.get('/stats', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const [[stats]] = await db.execute(
      `SELECT
         COUNT(*)                     AS total,
         SUM(status = 'Submitted')    AS submitted,
         SUM(status = 'Pending')      AS pending,
         SUM(status = 'In Progress')  AS in_progress,
         SUM(status = 'Resolved')     AS resolved,
         SUM(status = 'Rejected')     AS rejected,
         SUM(status = 'Reopened')     AS reopened,
         COUNT(DISTINCT user_id)      AS total_users
       FROM complaints`
    );

    const [[todayRow]] = await db.execute(
      `SELECT COUNT(*) AS today FROM complaints WHERE DATE(created_at) = CURDATE()`
    );

    return res.json({ success: true, stats: { ...stats, today: todayRow.today } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to load stats.' });
  }
});

// ─── GET /api/admin/complaints ───────────────────────────────
router.get('/complaints', async (req, res) => {
  const db    = req.app.locals.db;
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 15);
  const offset = (page - 1) * limit;

  const { search, status, category, priority } = req.query;

  let where  = 'WHERE 1=1';
  const vals = [];

  if (search) {
    where += ' AND (c.complaint_id LIKE ? OR c.title LIKE ? OR u.name LIKE ? OR u.email LIKE ?)';
    vals.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status)   { where += ' AND c.status = ?';   vals.push(status); }
  if (category) { where += ' AND c.category = ?'; vals.push(category); }
  if (priority) { where += ' AND c.priority = ?'; vals.push(priority); }

  try {
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM complaints c JOIN users u ON u.id = c.user_id ${where}`,
      vals
    );

    const [complaints] = await db.execute(
      `SELECT c.complaint_id, c.title, c.category, c.priority, c.status,
              c.admin_remark, c.created_at, c.updated_at,
              u.name AS user_name, u.email AS user_email
       FROM complaints c
       JOIN users u ON u.id = c.user_id
       ${where}
       ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
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

// ─── GET /api/admin/complaints/:id ───────────────────────────
router.get('/complaints/:id', async (req, res) => {
  const db  = req.app.locals.db;
  const cid = req.params.id;

  try {
    // Mark as viewed in timeline if first admin view
    const [viewCheck] = await db.execute(
      `SELECT id FROM complaint_updates WHERE complaint_id = ? AND action = 'viewed' LIMIT 1`,
      [cid]
    );
    if (viewCheck.length === 0) {
      await db.execute(
        `INSERT INTO complaint_updates (complaint_id, status, remark, updated_by, action)
         SELECT ?, status, 'Viewed by admin', ?, 'viewed' FROM complaints WHERE complaint_id = ?`,
        [cid, req.user.id, cid]
      );
    }

    const [rows] = await db.execute(
      `SELECT c.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone, u.address AS user_address
       FROM complaints c
       JOIN users u ON u.id = c.user_id
       WHERE c.complaint_id = ?`,
      [cid]
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

// ─── PUT /api/admin/complaints/:id/status ────────────────────
router.put('/complaints/:id/status', async (req, res) => {
  const db  = req.app.locals.db;
  const cid = req.params.id;
  const { status, remark } = req.body;

  const validStatuses = ['Submitted', 'Pending', 'In Progress', 'Resolved', 'Rejected', 'Reopened'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status value.' });
  }
  if (!remark || remark.trim().length < 5) {
    return res.status(400).json({ success: false, message: 'Admin remark is required (min 5 characters).' });
  }

  try {
    const [rows] = await db.execute(
      'SELECT id, user_id, title FROM complaints WHERE complaint_id = ?', [cid]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    await db.execute(
      `UPDATE complaints SET status = ?, admin_remark = ?, updated_at = NOW() WHERE complaint_id = ?`,
      [status, remark.trim(), cid]
    );

    await db.execute(
      `INSERT INTO complaint_updates (complaint_id, status, remark, updated_by, action)
       VALUES (?, ?, ?, ?, 'status_change')`,
      [cid, status, remark.trim(), req.user.id]
    );

    // Real-time notification to the specific user
    const io = req.app.locals.io;
    if (io) {
      const complaint = rows[0];
      io.to(`user_${complaint.user_id}`).emit('complaint:notification', {
        complaintId: cid,
        status,
        message: `Your complaint "${complaint.title}" status updated to "${status}"`,
        remark: remark.trim()
      });
      io.to('admin_room').emit('complaint:updated', { complaintId: cid, status });
    }

    return res.json({ success: true, message: 'Complaint status updated successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to update complaint.' });
  }
});

// ─── GET /api/admin/users ────────────────────────────────────
router.get('/users', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const [users] = await db.execute(
      `SELECT u.id, u.name, u.email, u.phone, u.created_at,
              COUNT(c.id) AS complaint_count
       FROM users u
       LEFT JOIN complaints c ON c.user_id = u.id
       WHERE u.role = 'user'
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    return res.json({ success: true, users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to load users.' });
  }
});

module.exports = router;
