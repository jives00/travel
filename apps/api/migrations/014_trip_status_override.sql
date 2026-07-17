ALTER TABLE trips
  ADD COLUMN status_override ENUM('dreaming','planned','active','past') NULL,
  ADD COLUMN is_primary TINYINT(1) NOT NULL DEFAULT 0;
