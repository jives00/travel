-- Free-form notes attached to a single calendar day of a trip ("go see the west
-- side of the city"). Primarily how a Free Day — a day with nothing scheduled —
-- still carries a plan, but any day can have one.
--
-- One note per (trip, date): the unique key is what lets the write path be a
-- single idempotent upsert keyed on the date the client already knows, with no
-- note id to track. Clearing the text deletes the row rather than storing "".
CREATE TABLE IF NOT EXISTS day_notes (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  trip_id    INT NOT NULL,
  note_date  DATE NOT NULL,
  note       TEXT NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
  UNIQUE KEY uniq_day_notes_trip_date (trip_id, note_date),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
