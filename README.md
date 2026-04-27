# 🏛️ GMS — Grievance Management System
### Government Civic Grievance Portal | Node.js + Express + MySQL + Socket.IO

---

## 📁 Project Structure

```
greviance management/
├── server.js                   # Express entry point
├── package.json
├── .env                        # DB credentials + JWT secret
├── db/
│   └── schema.sql              # MySQL table definitions
├── middleware/
│   └── auth.js                 # JWT verification middleware
├── routes/
│   ├── auth.js                 # POST /api/auth/login, /register, /admin/login
│   ├── complaints.js           # Citizen complaint CRUD
│   └── admin.js                # Admin complaint management
├── scripts/
│   └── create-admin.js         # Seed default admin account
└── public/                     # Static frontend (served by Express)
    ├── index.html              # Landing page
    ├── login.html              # Citizen login
    ├── register.html           # Citizen registration
    ├── user-dashboard.html     # Citizen dashboard
    ├── raise-complaint.html    # Submit complaint form
    ├── my-complaints.html      # Citizen complaint list
    ├── complaint-detail.html   # Citizen complaint detail + timeline
    ├── admin/
    │   ├── login.html          # Admin login
    │   ├── dashboard.html      # Admin overview dashboard
    │   ├── complaints.html     # All complaints list
    │   └── complaint-detail.html  # Admin complaint management
    ├── css/
    │   └── style.css
    ├── js/
    │   └── app.js
    └── uploads/                # File uploads (Multer destination)
```

---

## ⚡ Quick Setup (Step by Step)

### 1. Install MySQL

Download and install **MySQL Community Server**:
👉 https://dev.mysql.com/downloads/mysql/

During installation, set a root password. Remember it!

### 2. Configure Environment

Edit the `.env` file in the project root:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_ROOT_PASSWORD    ← Change this!
DB_NAME=gms_db
JWT_SECRET=gms_super_secret_jwt_key_2024_change_in_production
JWT_EXPIRES_IN=7d
```

### 3. Create the Database

Open MySQL Command Line Client and run:

```sql
SOURCE C:/Users/harsh/Downloads/greviance management/db/schema.sql;
```

OR use MySQL Workbench:
- Open the schema.sql file and execute it.

### 4. Create the Admin Account

Run this once from the project folder:

```bash
node scripts/create-admin.js
```

This creates:
- **Email:** admin@gms.gov.in
- **Password:** admin123

### 5. Start the Server

```bash
node server.js
```

Or with auto-reload (install nodemon first):
```bash
npm install -g nodemon
nodemon server.js
```

### 6. Open in Browser

| Page | URL |
|------|-----|
| 🏛️ Landing Page | http://localhost:3000 |
| 👤 Citizen Login | http://localhost:3000/login |
| 🔑 Admin Login | http://localhost:3000/admin/login |
| 📊 Admin Dashboard | http://localhost:3000/admin/dashboard |

---

## 🔌 API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register citizen |
| POST | `/api/auth/login` | Citizen login |
| POST | `/api/auth/admin/login` | Admin login |

### Complaints (Citizen)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/complaints` | List my complaints |
| GET | `/api/complaints/stats` | My complaint stats |
| POST | `/api/complaints` | Submit new complaint |
| GET | `/api/complaints/:id` | Complaint detail + timeline |
| POST | `/api/complaints/:id/reopen` | Reopen complaint |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | System-wide stats |
| GET | `/api/admin/complaints` | All complaints |
| GET | `/api/admin/complaints/:id` | Complaint + timeline |
| PUT | `/api/admin/complaints/:id/status` | Update status + remark |

---

## 🔴 Socket.IO Events

| Event | Direction | Trigger |
|-------|-----------|---------|
| `complaint:new` | Server → Admin | New complaint submitted |
| `complaint:notification` | Server → User | Status updated by admin |
| `complaint:updated` | Server → Admin | Status changed |
| `complaint:reopened` | Server → Admin | Complaint reopened |

---

## 🛡️ Tech Stack

- **Runtime:** Node.js v22
- **Framework:** Express.js
- **Database:** MySQL (mysql2 driver)
- **Auth:** JWT + bcryptjs
- **Uploads:** Multer (5MB limit, JPEG/PNG/GIF/PDF)
- **Realtime:** Socket.IO 4.x
- **Frontend:** Vanilla HTML/CSS/JS + custom design system
