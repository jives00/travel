CREATE TABLE IF NOT EXISTS list_items (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  list_id    INT NOT NULL,
  text       VARCHAR(500) NOT NULL,
  done       TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT NOW(),
  INDEX idx_list_items_list_id (list_id),
  FOREIGN KEY (list_id) REFERENCES custom_lists(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Carry over any existing place-based list entries as plain text items.
INSERT INTO list_items (list_id, text, sort_order, created_at)
SELECT lp.list_id, p.name, lp.sort_order, lp.added_at
FROM list_places lp
JOIN places p ON p.id = lp.place_id;

DROP TABLE IF EXISTS list_places;
