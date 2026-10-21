-- Network-map MySQL schema (full relational + platform)
-- Charset/collation for Cyrillic and emoji-safe text

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(64) PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organizations (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  map_object_limit_unlocked TINYINT(1) NOT NULL DEFAULT 0,
  custom_map_object_limit INT NULL,
  max_concurrent_users INT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  contact_email VARCHAR(255) NULL,
  two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
  two_factor_secret VARCHAR(255) NULL,
  embed_enabled TINYINT(1) NOT NULL DEFAULT 0,
  embed_token VARCHAR(128) NULL,
  embed_created_at DATETIME(3) NULL,
  zabbix_enabled TINYINT(1) NOT NULL DEFAULT 0,
  zabbix_api_url VARCHAR(512) NULL,
  zabbix_api_token VARCHAR(512) NULL,
  zabbix_updated_at DATETIME(3) NULL,
  zabbix_poll_interval_sec INT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_orgs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(128) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'user',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  email VARCHAR(255) NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 1,
  organization_id VARCHAR(64) NULL,
  avatar_updated_at DATETIME(3) NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_users_username (username),
  INDEX idx_users_org (organization_id),
  CONSTRAINT fk_users_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  organization_id VARCHAR(64) NULL,
  expires_at DATETIME(3) NOT NULL,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_org (organization_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key VARCHAR(128) PRIMARY KEY,
  setting_value LONGTEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_settings (
  org_id VARCHAR(64) NOT NULL,
  setting_key VARCHAR(128) NOT NULL,
  setting_value LONGTEXT NULL,
  PRIMARY KEY (org_id, setting_key),
  CONSTRAINT fk_org_settings_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_map_start (
  user_id VARCHAR(64) PRIMARY KEY,
  payload_json JSON NOT NULL,
  CONSTRAINT fk_map_start_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_themes (
  user_id VARCHAR(64) PRIMARY KEY,
  theme VARCHAR(16) NOT NULL,
  CONSTRAINT fk_themes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS history_events (
  id VARCHAR(64) PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  timestamp DATETIME(3) NOT NULL,
  action_type VARCHAR(64) NULL,
  action_name VARCHAR(255) NULL,
  icon VARCHAR(32) NULL,
  user_json JSON NULL,
  details_json JSON NULL,
  INDEX idx_history_org_ts (org_id, timestamp),
  CONSTRAINT fk_history_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_chat_messages (
  id VARCHAR(64) PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  payload_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_chat_org_created (org_id, created_at),
  CONSTRAINT fk_chat_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_chat_media (
  id VARCHAR(64) PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  payload_json JSON NOT NULL,
  INDEX idx_chat_media_org (org_id),
  CONSTRAINT fk_chat_media_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS device_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NULL,
  token VARCHAR(512) NOT NULL,
  platform VARCHAR(64) NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_device_token (token(191)),
  INDEX idx_device_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pricing_plans (
  id VARCHAR(64) PRIMARY KEY,
  payload_json JSON NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS visit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  at_time DATETIME(3) NOT NULL,
  username VARCHAR(128) NULL,
  user_id VARCHAR(64) NULL,
  organization_id VARCHAR(64) NULL,
  ip VARCHAR(64) NULL,
  source VARCHAR(128) NULL,
  user_agent VARCHAR(512) NULL,
  INDEX idx_visits_at (at_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_threads (
  id VARCHAR(64) PRIMARY KEY,
  visitor_id VARCHAR(128) NOT NULL,
  name VARCHAR(120) NULL,
  email VARCHAR(200) NULL,
  page VARCHAR(200) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  unread_by_admin TINYINT(1) NOT NULL DEFAULT 0,
  unread_by_visitor TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_support_visitor (visitor_id),
  INDEX idx_support_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_messages (
  id VARCHAR(64) PRIMARY KEY,
  thread_id VARCHAR(64) NOT NULL,
  from_role VARCHAR(16) NOT NULL,
  body TEXT NOT NULL,
  at_time DATETIME(3) NOT NULL,
  INDEX idx_support_msg_thread (thread_id, at_time),
  CONSTRAINT fk_support_msg_thread FOREIGN KEY (thread_id) REFERENCES support_threads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  payload_json JSON NULL,
  INDEX idx_prt_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  payload_json JSON NULL,
  INDEX idx_evt_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Temporary full-map blob per org (cutover safety); also used as cache/snapshot
CREATE TABLE IF NOT EXISTS org_map_blobs (
  org_id VARCHAR(64) PRIMARY KEY,
  map_json LONGTEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_map_blob_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Map core
CREATE TABLE IF NOT EXISTS map_objects (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  unique_id VARCHAR(128) NOT NULL,
  type VARCHAR(64) NOT NULL,
  name VARCHAR(255) NULL,
  lat DOUBLE NULL,
  lon DOUBLE NULL,
  revision INT NOT NULL DEFAULT 0,
  cabinet_id VARCHAR(128) NULL,
  cabinet_order INT NULL,
  attrs_json JSON NULL,
  UNIQUE KEY uq_map_obj (org_id, unique_id),
  INDEX idx_map_obj_type (org_id, type),
  CONSTRAINT fk_map_obj_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS map_cables (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  unique_id VARCHAR(128) NOT NULL,
  cable_type VARCHAR(64) NULL,
  fiber_count INT NULL,
  fiber_palette_json JSON NULL,
  name VARCHAR(255) NULL,
  distance DOUBLE NULL,
  manufacturer VARCHAR(128) NULL,
  model VARCHAR(128) NULL,
  from_unique_id VARCHAR(128) NULL,
  to_unique_id VARCHAR(128) NULL,
  geometry_json JSON NULL,
  revision INT NOT NULL DEFAULT 0,
  attrs_json JSON NULL,
  UNIQUE KEY uq_map_cable (org_id, unique_id),
  CONSTRAINT fk_map_cable_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cable_route_points (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  cable_unique_id VARCHAR(128) NOT NULL,
  seq INT NOT NULL,
  object_unique_id VARCHAR(128) NOT NULL,
  UNIQUE KEY uq_route (org_id, cable_unique_id, seq),
  INDEX idx_route_cable (org_id, cable_unique_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cable_underground_spans (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  cable_unique_id VARCHAR(128) NOT NULL,
  entry_manhole_id VARCHAR(128) NULL,
  exit_manhole_id VARCHAR(128) NULL,
  path_coords_json JSON NULL,
  INDEX idx_ug_cable (org_id, cable_unique_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS node_switches (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  node_unique_id VARCHAR(128) NOT NULL,
  switch_json JSON NOT NULL,
  seq INT NOT NULL DEFAULT 0,
  INDEX idx_node_sw (org_id, node_unique_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS object_photos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  object_unique_id VARCHAR(128) NOT NULL,
  photo_json JSON NOT NULL,
  seq INT NOT NULL DEFAULT 0,
  INDEX idx_photos_obj (org_id, object_unique_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fiber / splice model
CREATE TABLE IF NOT EXISTS fiber_splices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  host_unique_id VARCHAR(128) NOT NULL,
  cable_a_id VARCHAR(128) NOT NULL,
  fiber_a INT NOT NULL,
  cable_b_id VARCHAR(128) NOT NULL,
  fiber_b INT NOT NULL,
  label VARCHAR(255) NULL,
  UNIQUE KEY uq_splice (org_id, host_unique_id, cable_a_id, fiber_a, cable_b_id, fiber_b),
  INDEX idx_splice_host (org_id, host_unique_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fiber_used (
  org_id VARCHAR(64) NOT NULL,
  host_unique_id VARCHAR(128) NOT NULL,
  cable_id VARCHAR(128) NOT NULL,
  fiber_number INT NOT NULL,
  PRIMARY KEY (org_id, host_unique_id, cable_id, fiber_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fiber_labels (
  org_id VARCHAR(64) NOT NULL,
  host_unique_id VARCHAR(128) NOT NULL,
  cable_id VARCHAR(128) NOT NULL,
  fiber_number INT NOT NULL,
  label VARCHAR(255) NOT NULL,
  PRIMARY KEY (org_id, host_unique_id, cable_id, fiber_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cross_fiber_ports (
  org_id VARCHAR(64) NOT NULL,
  cross_unique_id VARCHAR(128) NOT NULL,
  cable_id VARCHAR(128) NOT NULL,
  fiber_number INT NOT NULL,
  port_number VARCHAR(64) NOT NULL,
  PRIMARY KEY (org_id, cross_unique_id, cable_id, fiber_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cross_port_patches (
  org_id VARCHAR(64) NOT NULL,
  from_cross_id VARCHAR(128) NOT NULL,
  from_port VARCHAR(64) NOT NULL,
  to_cross_id VARCHAR(128) NOT NULL,
  to_port VARCHAR(64) NOT NULL,
  PRIMARY KEY (org_id, from_cross_id, from_port)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fiber_assignments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  host_unique_id VARCHAR(128) NOT NULL,
  cable_id VARCHAR(128) NOT NULL,
  fiber_number INT NOT NULL,
  kind VARCHAR(32) NOT NULL,
  target_id VARCHAR(128) NULL,
  extras_json JSON NULL,
  UNIQUE KEY uq_fiber_assign (org_id, host_unique_id, cable_id, fiber_number, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS splitters (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  splitter_id VARCHAR(128) NOT NULL,
  host_unique_id VARCHAR(128) NULL,
  name VARCHAR(255) NULL,
  split_ratio INT NOT NULL DEFAULT 2,
  layout_json JSON NULL,
  input_json JSON NULL,
  UNIQUE KEY uq_splitter (org_id, splitter_id),
  INDEX idx_splitter_host (org_id, host_unique_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS splitter_outputs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  splitter_id VARCHAR(128) NOT NULL,
  output_index INT NOT NULL,
  target_kind VARCHAR(32) NULL,
  payload_json JSON NULL,
  UNIQUE KEY uq_sp_out (org_id, splitter_id, output_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS device_incoming_fibers (
  org_id VARCHAR(64) NOT NULL,
  object_unique_id VARCHAR(128) NOT NULL,
  cable_id VARCHAR(128) NOT NULL,
  fiber_number INT NOT NULL,
  PRIMARY KEY (org_id, object_unique_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS olt_port_assignments (
  org_id VARCHAR(64) NOT NULL,
  olt_unique_id VARCHAR(128) NOT NULL,
  port_number VARCHAR(64) NOT NULL,
  cable_id VARCHAR(128) NOT NULL,
  fiber_number INT NOT NULL,
  PRIMARY KEY (org_id, olt_unique_id, port_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
