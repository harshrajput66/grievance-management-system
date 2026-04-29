// ─── routes/complaints.js ────────────────────────────────────
// Citizen-facing complaint APIs
const express = require('express');
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
    const snapshot = await db.collection('complaints').where('user_id', '==', userId).get();
    const stats = {
      total: snapshot.size,
      submitted: 0,
      pending: 0,
      in_progress: 0,
      resolved: 0,
      rejected: 0,
      reopened: 0
    };
    snapshot.forEach(doc => {
      const data = doc.data();
      const st = data.status;
      if (st === 'Submitted') stats.submitted++;
      if (st === 'Pending') stats.pending++;
      if (st === 'In Progress') stats.in_progress++;
      if (st === 'Resolved') stats.resolved++;
      if (st === 'Rejected') stats.rejected++;
      if (st === 'Reopened') stats.reopened++;
    });
    return res.json({ success: true, stats });
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

  const { search, status, category, priority } = req.query;

  try {
    let query = db.collection('complaints').where('user_id', '==', userId);
    
    if (status) query = query.where('status', '==', status);
    if (category) query = query.where('category', '==', category);
    if (priority) query = query.where('priority', '==', priority);

    const snapshot = await query.get();
    let allComplaints = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      // Handle created_at formatting safely if it's a Firestore Timestamp
      if (data.created_at && data.created_at.toDate) {
        data.created_at = data.created_at.toDate();
      }
      allComplaints.push({ id: doc.id, ...data });
    });

    if (search) {
      const lowerSearch = search.toLowerCase();
      allComplaints = allComplaints.filter(c => 
        (c.complaint_id && c.complaint_id.toLowerCase().includes(lowerSearch)) || 
        (c.title && c.title.toLowerCase().includes(lowerSearch))
      );
    }

    allComplaints.sort((a, b) => {
      if (!a.created_at) return 1;
      if (!b.created_at) return -1;
      return b.created_at.getTime() - a.created_at.getTime();
    });

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

// ─── POST /api/complaints ────────────────────────────────────
router.post('/', async (req, res) => {
  const db     = req.app.locals.db;
  const admin  = req.app.locals.admin;
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
    while (attempts < 5) {
      complaintId = generateComplaintId();
      const ex = await db.collection('complaints').where('complaint_id', '==', complaintId).get();
      if (ex.empty) break;
      attempts++;
    }

    // Since we use multer-storage-cloudinary, req.file.path contains the Cloudinary URL
    const proofUrl  = req.file ? req.file.path : null;
    const proofName = req.file ? req.file.originalname : null;

    try {
      const newComplaint = {
        complaint_id: complaintId,
        user_id: userId,
        title: title.trim(),
        description: description.trim(),
        category,
        priority: priority || 'Medium',
        status: 'Submitted',
        location: location || null,
        proof_url: proofUrl,
        proof_original_name: proofName,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      };

      await db.collection('complaints').add(newComplaint);

      // Insert timeline entry
      await db.collection('complaint_updates').add({
        complaint_id: complaintId,
        status: 'Submitted',
        remark: 'Complaint submitted by citizen.',
        updated_by: userId,
        action: 'submitted',
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });

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
    const cSnapshot = await db.collection('complaints')
      .where('complaint_id', '==', cid)
      .where('user_id', '==', userId)
      .get();

    if (cSnapshot.empty) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    let complaint = cSnapshot.docs[0].data();
    if (complaint.created_at && complaint.created_at.toDate) complaint.created_at = complaint.created_at.toDate();
    if (complaint.updated_at && complaint.updated_at.toDate) complaint.updated_at = complaint.updated_at.toDate();

    // Fetch user details
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      complaint.user_name = userData.name;
      complaint.user_email = userData.email;
      complaint.user_phone = userData.phone;
    }

    // Fetch timeline
    const tSnapshot = await db.collection('complaint_updates')
      .where('complaint_id', '==', cid)
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

    timeline.sort((a, b) => {
      if (!a.created_at) return -1;
      if (!b.created_at) return 1;
      return a.created_at.getTime() - b.created_at.getTime();
    });

    return res.json({ success: true, complaint, timeline });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to load complaint.' });
  }
});

// ─── POST /api/complaints/:id/reopen ─────────────────────────
router.post('/:id/reopen', requireUser, async (req, res) => {
  const db     = req.app.locals.db;
  const admin  = req.app.locals.admin;
  const userId = req.user.id;
  const cid    = req.params.id;
  const { reason } = req.body;

  if (!reason || reason.trim().length < 10) {
    return res.status(400).json({ success: false, message: 'Please provide a reopen reason (min 10 characters).' });
  }

  try {
    const cSnapshot = await db.collection('complaints')
      .where('complaint_id', '==', cid)
      .where('user_id', '==', userId)
      .get();

    if (cSnapshot.empty) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const docRef = cSnapshot.docs[0].ref;
    const data = cSnapshot.docs[0].data();

    if (!['Resolved', 'Rejected'].includes(data.status)) {
      return res.status(400).json({ success: false, message: 'Only Resolved or Rejected complaints can be reopened.' });
    }

    await docRef.update({
      status: 'Reopened',
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('complaint_updates').add({
      complaint_id: cid,
      status: 'Reopened',
      remark: `Reopened by citizen: ${reason.trim()}`,
      updated_by: userId,
      action: 'reopened',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    const io = req.app.locals.io;
    if (io) io.to('admin_room').emit('complaint:reopened', { complaintId: cid });

    return res.json({ success: true, message: 'Complaint reopened successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to reopen complaint.' });
  }
});

module.exports = router;
