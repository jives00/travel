-- Silenced "Trip readiness" nudges (see packages/core/src/readiness.ts).
--
-- One row per dismissed *subject* ("leg:7:dates"), not per rendered message —
-- the message is a count over a changing set, so dismissing it would hide a
-- city added later. The key's shape is owned by core; the API only stores it,
-- which is why there's no enum here.
--
-- Server-side rather than local storage because a dismissal has to hold across
-- web and mobile.
CREATE TABLE IF NOT EXISTS readiness_dismissals (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  trip_id      INT NOT NULL,
  nudge_key    VARCHAR(190) NOT NULL,
  dismissed_at DATETIME DEFAULT NOW(),
  UNIQUE KEY uniq_readiness_trip_key (trip_id, nudge_key),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
