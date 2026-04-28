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
    const cSnapshot = await db.collection('complaints').get();
    const uSnapshot = await db.collection('users').where('role', '==', 'user').get();
    
    const stats = {
      total: cSnapshot.size,
      submitted: 0,
      pending: 0,
      in_progress: 0,
      resolved: 0,
      rejected: 0,
      reopened: 0,
      total_users: uSnapshot.size,
      today: 0
    };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    cSnapshot.forEach(doc => {
      const data = doc.data();
      const st = data.status;
      if (st === 'Submitted') stats.submitted++;
      if (st === 'Pending') stats.pending++;
      if (st === 'In Progress') stats.in_progress++;
      if (st === 'Resolved') stats.resolved++;
      if (st === 'Rejected') stats.rejected++;
      if (st === 'Reopened') stats.reopened++;

      let createdAt = data.created_at;
      if (createdAt && createdAt.toDate) createdAt = createdAt.toDate();
      if (createdAt && createdAt >= todayStart) {
        stats.today++;
      }
    });

    return res.json({ success: true, stats });
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

  const { search, status, category, priority } = req.query;

  try {
    let query = db.collection('complaints');
    if (status) query = query.where('status', '==', status);
    if (category) query = query.where('category', '==', category);
    if (priority) query = query.where('priority', '==', priority);

    const snapshot = await query.orderBy('created_at', 'desc').get();
    let allComplaints = [];

    // Map user_id to user_name, user_email
    const userDocs = await db.collection('users').get();
    const userMap = {};
    userDocs.forEach(d => { userMap[d.id] = d.data(); });

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.created_at && data.created_at.toDate) data.created_at = data.created_at.toDate();
      if (data.updated_at && data.updated_at.toDate) data.updated_at = data.updated_at.toDate();
      
      const user = userMap[data.user_id] || {};
      data.user_name = user.name || 'Unknown';
      data.user_email = user.email || 'Unknown';

      allComplaints.push({ id: doc.id, ...data });
    });

    if (search) {
      const lowerSearch = search.toLowerCase();
      allComplaints = allComplaints.filter(c => 
        (c.complaint_id && c.complaint_id.toLowerCase().includes(lowerSearch)) || 
        (c.title && c.title.toLowerCase().includes(lowerSearch)) ||
        (c.user_name && c.user_name.toLowerCase().includes(lowerSearch)) ||
        (c.user_email && c.user_email.toLowerCase().includes(lowerSearch))
      );
    }

    const total = allComplaints.length;
    const offset = (page - 1) * limit;
    const paginated = allComplaints.slice(offset, offset + limit);

    return res.json({
      success: true,
      complaints: paginated,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to load complaints.' });
  }
});

// ─── GET /api/admin/complaints/:id ───────────────────────────
router.get('/complaints/:id', async (req, res) => {
  const db  = req.app.locals.db;
  const admin = req.app.locals.admin;
  const cid = req.params.id;

  try {
    // Mark as viewed in timeline if first admin view
    const viewCheck = await db.collection('complaint_updates')
      .where('complaint_id', '==', cid)
      .where('action', '==', 'viewed')
      .get();

    const cSnapshot = await db.collection('complaints').where('complaint_id', '==', cid).get();
    
    if (cSnapshot.empty) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const complaintDoc = cSnapshot.docs[0];
    const complaint = complaintDoc.data();
    if (complaint.created_at && complaint.created_at.toDate) complaint.created_at = complaint.created_at.toDate();
    if (complaint.updated_at && complaint.updated_at.toDate) complaint.updated_at = complaint.updated_at.toDate();

    if (viewCheck.empty) {
      await db.collection('complaint_updates').add({
        complaint_id: cid,
        status: complaint.status,
        remark: 'Viewed by admin',
        updated_by: req.user.id,
        action: 'viewed',
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Attach user data
    if (complaint.user_id) {
      const uDoc = await db.collection('users').doc(complaint.user_id).get();
      if (uDoc.exists) {
        const uData = uDoc.data();
        complaint.user_name = uData.name;
        complaint.user_email = uData.email;
        complaint.user_phone = uData.phone;
        complaint.user_address = uData.address;
      }
    }

    // Timeline
    const tSnapshot = await db.collection('complaint_updates')
      .where('complaint_id', '==', cid)
      .orderBy('created_at', 'asc')
      .get();
      
    let timeline = [];
    for (let doc of tSnapshot.docs) {
      const t = doc.data();
      if (t.created_at && t.created_at.toDate) t.created_at = t.created_at.toDate();
      
      if (t.updated_by) {
        const uDoc = await db.collection('users').doc(t.updated_by).get();
        if (uDoc.exists) t.updated_by_name = uDoc.data().name;
      }
      timeline.push(t);
    }

    return res.json({ success: true, complaint, timeline });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to load complaint.' });
  }
});

// ─── PUT /api/admin/complaints/:id/status ────────────────────
router.put('/complaints/:id/status', async (req, res) => {
  const db  = req.app.locals.db;
  const admin = req.app.locals.admin;
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
    const cSnapshot = await db.collection('complaints').where('complaint_id', '==', cid).get();
    if (cSnapshot.empty) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const docRef = cSnapshot.docs[0].ref;
    const complaint = cSnapshot.docs[0].data();

    await docRef.update({
      status,
      admin_remark: remark.trim(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('complaint_updates').add({
      complaint_id: cid,
      status,
      remark: remark.trim(),
      updated_by: req.user.id,
      action: 'status_change',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    // Real-time notification
    const io = req.app.locals.io;
    if (io) {
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
    const usersSnapshot = await db.collection('users').where('role', '==', 'user').get();
    const complaintsSnapshot = await db.collection('complaints').get();

    const counts = {};
    complaintsSnapshot.forEach(doc => {
      const uid = doc.data().user_id;
      counts[uid] = (counts[uid] || 0) + 1;
    });

    let users = [];
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.created_at && data.created_at.toDate) data.created_at = data.created_at.toDate();
      users.push({
        id: doc.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        created_at: data.created_at,
        complaint_count: counts[doc.id] || 0
      });
    });

    // Sort by created_at desc
    users.sort((a, b) => {
      if (!a.created_at) return 1;
      if (!b.created_at) return -1;
      return b.created_at - a.created_at;
    });

    return res.json({ success: true, users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to load users.' });
  }
});

module.exports = router;
