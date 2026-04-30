/* =========================================================
   GMS — Shared JavaScript Utilities
   ========================================================= */

const API_BASE = '/api';

// ─── Firebase Realtime ─────────────────────────────────────────
const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_FIREBASE_API_KEY",
  authDomain: "resolvex-ba0b9.firebaseapp.com",
  projectId: "resolvex-ba0b9",
  storageBucket: "resolvex-ba0b9.appspot.com",
  messagingSenderId: "REPLACE_WITH_MESSAGING_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID"
};

let db = null;
try {
  if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
  }
} catch (err) {
  console.warn("Firebase config is missing or invalid. Real-time updates disabled.");
}

const FirebaseRealtime = {
  listenForAdminUpdates(onNew, onReopened) {
    if (!db) return () => {};
    let isInitial = true;
    return db.collection('complaints').onSnapshot(snapshot => {
      if (isInitial) {
        isInitial = false;
        return;
      }
      snapshot.docChanges().forEach(change => {
        const data = change.doc.data();
        if (change.type === 'added') {
          onNew({ complaintId: data.complaint_id, title: data.title });
        }
        if (change.type === 'modified' && data.status === 'Reopened') {
          onReopened({ complaintId: data.complaint_id });
        }
      });
    }, err => console.error(err));
  },

  listenForUserUpdates(userId, onStatusChange) {
    if (!db || !userId) return () => {};
    let isInitial = true;
    return db.collection('complaints').where('user_id', '==', userId).onSnapshot(snapshot => {
      if (isInitial) {
        isInitial = false;
        return;
      }
      snapshot.docChanges().forEach(change => {
        if (change.type === 'modified') {
          const data = change.doc.data();
          onStatusChange({
            complaintId: data.complaint_id,
            status: data.status,
            title: data.title
          });
        }
      });
    }, err => console.error(err));
  }
};
// ─── Auth Helpers ────────────────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem('gms_token'),
  getUser:  () => { try { return JSON.parse(localStorage.getItem('gms_user')); } catch { return null; } },
  isLoggedIn: () => !!Auth.getToken(),
  isAdmin: () => Auth.getUser()?.role === 'admin',

  save: (token, user) => {
    localStorage.setItem('gms_token', token);
    localStorage.setItem('gms_user', JSON.stringify(user));
  },

  logout: () => {
    localStorage.removeItem('gms_token');
    localStorage.removeItem('gms_user');
  },

  requireAuth: (role = null) => {
    if (!Auth.isLoggedIn()) {
      window.location.href = role === 'admin' ? '/admin/login' : '/login';
      return false;
    }
    if (role === 'admin' && !Auth.isAdmin()) {
      window.location.href = '/login';
      return false;
    }
    if (role === 'user' && Auth.isAdmin()) {
      window.location.href = '/admin/dashboard';
      return false;
    }
    return true;
  }
};

// ─── API Helper ──────────────────────────────────────────────
const API = {
  async request(method, endpoint, data = null, isFormData = false) {
    const headers = {};
    const token = Auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const config = { method, headers };
    if (data) config.body = isFormData ? data : JSON.stringify(data);

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, config);
      const json = await res.json();
      if (res.status === 401) {
        Auth.logout();
        window.location.href = Auth.isAdmin() ? '/admin/login' : '/login';
      }
      return { ok: res.ok, status: res.status, data: json };
    } catch (err) {
      return { ok: false, data: { success: false, message: 'Network error. Please try again.' } };
    }
  },

  get:    (endpoint)       => API.request('GET', endpoint),
  post:   (endpoint, data) => API.request('POST', endpoint, data),
  put:    (endpoint, data) => API.request('PUT', endpoint, data),
  delete: (endpoint)       => API.request('DELETE', endpoint),
  upload: (endpoint, formData) => API.request('POST', endpoint, formData, true),
};

// ─── Toast Notifications ─────────────────────────────────────
const Toast = {
  container: null,

  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      document.body.appendChild(this.container);
    }
  },

  show(message, type = 'info', duration = 4000) {
    this.init();
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    this.container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)'; toast.style.transition = '0.3s'; setTimeout(() => toast.remove(), 300); }, duration);
  },

  success: (msg) => Toast.show(msg, 'success'),
  error:   (msg) => Toast.show(msg, 'error'),
  info:    (msg) => Toast.show(msg, 'info'),
  warning: (msg) => Toast.show(msg, 'warning'),
};

// ─── Format Helpers ──────────────────────────────────────────
const Format = {
  date: (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  datetime: (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  },

  timeAgo: (d) => {
    const diff = Date.now() - new Date(d).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  },

  statusBadge: (status) => {
    const cls = {
      'Submitted':   'status-submitted',
      'Pending':     'status-pending',
      'In Progress': 'status-in-progress',
      'Resolved':    'status-resolved',
      'Rejected':    'status-rejected',
      'Reopened':    'status-reopened',
    }[status] || 'status-submitted';
    return `<span class="badge-pill ${cls}">${status}</span>`;
  },

  priorityBadge: (priority) => {
    const cls = { 'Low': 'priority-low', 'Medium': 'priority-medium', 'High': 'priority-high', 'Urgent': 'priority-urgent' }[priority] || 'priority-medium';
    return `<span class="badge-pill ${cls}">${priority}</span>`;
  },

  categoryIcon: (cat) => {
    const icons = {
      'Garbage and Sanitation':       '🗑️',
      'Illegal Construction':         '🏗️',
      'Encroachments':                '🚧',
      'Streetlight Issues':           '💡',
      'Potholes and Road Maintenance':'🛣️',
      'Drainage and Waterlogging':    '🌊',
      'Horticulture':                 '🌳',
      'Stray Animals':                '🐄',
      'C&D Waste':                    '🧱',
      'Public Health':                '🏥',
    };
    return icons[cat] || '📋';
  },

  timelineDotClass: (action, status) => {
    if (action === 'submitted') return '';
    if (action === 'reopened') return 'purple';
    if (status === 'Resolved') return 'success';
    if (status === 'Rejected') return 'danger';
    if (status === 'In Progress') return 'admin';
    if (status === 'Pending') return 'warning';
    return '';
  },

  timelineIcon: (action, status) => {
    if (action === 'submitted') return '📝';
    if (action === 'viewed') return '👁️';
    if (action === 'reopened') return '🔄';
    if (status === 'Resolved') return '✅';
    if (status === 'Rejected') return '❌';
    if (status === 'In Progress') return '⚙️';
    if (status === 'Pending') return '⏳';
    return '💬';
  }
};

// ─── Sidebar Setup ───────────────────────────────────────────
function setupSidebar() {
  const user = Auth.getUser();
  if (!user) return;

  // Set user name / role in sidebar footer
  const nameEl = document.getElementById('sidebar-user-name');
  const roleEl = document.getElementById('sidebar-user-role');
  const avatarEl = document.getElementById('sidebar-avatar');

  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = user.role === 'admin' ? 'Administrator' : 'Citizen';
  if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();

  // Logout
  document.querySelectorAll('.btn-logout').forEach(btn => {
    btn.addEventListener('click', () => {
      Auth.logout();
      window.location.href = user.role === 'admin' ? '/admin/login' : '/login';
    });
  });

  // Mobile sidebar toggle
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay?.classList.toggle('show');
    });
    overlay?.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    });
  }

  // Mark active nav link
  const path = window.location.pathname;
  document.querySelectorAll('.sidebar-nav a').forEach(link => {
    if (link.getAttribute('href') === path) link.classList.add('active');
  });
}

// ─── Pagination ──────────────────────────────────────────────
function renderPagination(containerId, pagination, onPageChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const { page, pages, total } = pagination;
  if (pages <= 1) { el.innerHTML = ''; return; }

  let html = `<div class="d-flex align-items-center justify-content-between">
    <small class="text-muted">Showing page ${page} of ${pages} (${total} total)</small>
    <div class="d-flex gap-2">`;

  if (page > 1) html += `<button class="btn btn-outline btn-sm" onclick="(${onPageChange})(${page - 1})">← Prev</button>`;

  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) {
    html += `<button class="btn ${i === page ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="(${onPageChange})(${i})">${i}</button>`;
  }

  if (page < pages) html += `<button class="btn btn-outline btn-sm" onclick="(${onPageChange})(${page + 1})">Next →</button>`;

  html += `</div></div>`;
  el.innerHTML = html;
}

// ─── Category Descriptions ───────────────────────────────────
const CATEGORY_DESCRIPTIONS = {
  'Garbage and Sanitation':         'Overflowing dhalaos, no door-to-door collection, street littering',
  'Illegal Construction':           'Unauthorized construction, extra floors without permission',
  'Encroachments':                  'Vendors/shops illegally occupying roads or footpaths',
  'Streetlight Issues':             'Faulty or non-working street lights',
  'Potholes and Road Maintenance':  'Damaged roads, potholes, missing road markings',
  'Drainage and Waterlogging':      'Blocked drains, stagnant water, waterlogging',
  'Horticulture':                   'Overgrown trees, poorly maintained parks and green areas',
  'Stray Animals':                  'Stray dogs/cattle causing nuisance',
  'C&D Waste':                      'Illegal dumping of construction and demolition debris',
  'Public Health':                  'Mosquito breeding, carcass removal delays, disease risk',
};

const CATEGORIES = Object.keys(CATEGORY_DESCRIPTIONS);
const STATUSES = ['Submitted', 'Pending', 'In Progress', 'Resolved', 'Rejected', 'Reopened'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
