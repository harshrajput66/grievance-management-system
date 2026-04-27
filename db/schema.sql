-- ============================================================
-- GMS — Grievance Management System Database Schema
-- Run: mysql -u root -p < db/schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS gms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gms_db;

-- ─── Users ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100)  NOT NULL,
  email         VARCHAR(150)  UNIQUE NOT NULL,
  phone         VARCHAR(15),
  address       TEXT,
  password_hash VARCHAR(255)  NOT NULL,
  role          ENUM('user','admin') DEFAULT 'user',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── Complaints ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complaints (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id  VARCHAR(25)   UNIQUE NOT NULL,
  user_id       INT           NOT NULL,
  title         VARCHAR(255)  NOT NULL,
  description   TEXT          NOT NULL,
  category      VARCHAR(100)  NOT NULL,
  priority      ENUM('Low','Medium','High','Urgent') DEFAULT 'Medium',
  status        ENUM('Submitted','Pending','In Progress','Resolved','Rejected','Reopened') DEFAULT 'Submitted',
  location      VARCHAR(255),
  proof_url     VARCHAR(500),
  proof_original_name VARCHAR(255),
  admin_remark  TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Complaint Updates (Timeline) ────────────────────────────
CREATE TABLE IF NOT EXISTS complaint_updates (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id  VARCHAR(25)   NOT NULL,
  status        VARCHAR(50),
  remark        TEXT,
  updated_by    INT,
  action        VARCHAR(50)   DEFAULT 'status_change',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_complaints_user_id   ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status    ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_category  ON complaints(category);
CREATE INDEX IF NOT EXISTS idx_complaint_updates_cid ON complaint_updates(complaint_id);

-- ─── Default Admin Account ────────────────────────────────────
-- Password: admin123  (bcrypt hash generated separately, update before prod)
-- To insert: run node scripts/create-admin.js or insert manually after bcrypt
-- INSERT INTO users (name, email, password_hash, role) VALUES
--   ('Administrator', 'admin@gms.gov.in', '$2a$10$...', 'admin');
