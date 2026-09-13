-- Funding sources: where the money for a budget line actually came from.
--
-- A user-defined list rather than an enum, because the useful distinctions are
-- personal ("CC points" vs. a specific card) and change over time without a
-- migration. The API treats the name as opaque — nothing branches on it, so
-- renaming "Off balance" doesn't change any rollup arithmetic.
--
-- No cash-vs-non-cash flag: the by-source rollup is the answer to "what did this
-- actually cost me", and grouping is enough to read it. Deliberate — see the
-- decision notes on todo item 12.
CREATE TABLE IF NOT EXISTS funding_sources (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  name        VARCHAR(80) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  DATETIME DEFAULT NOW(),
  updated_at  DATETIME DEFAULT NOW() ON UPDATE NOW(),
  UNIQUE KEY uniq_funding_user_name (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Both budget line sources carry it: an `expenses` row is only half the budget,
-- since a priced booking becomes a line with no expense row at all (see the
-- rollup in expenses.routes.ts). A column on `expenses` alone would leave every
-- booking-derived line permanently unattributed.
--
-- ON DELETE SET NULL: removing a source in settings unassigns its lines rather
-- than deleting spend.
ALTER TABLE expenses
  ADD COLUMN funding_source_id INT NULL,
  ADD COLUMN points INT UNSIGNED NULL,
  ADD INDEX idx_expenses_funding_source_id (funding_source_id),
  ADD FOREIGN KEY (funding_source_id) REFERENCES funding_sources(id) ON DELETE SET NULL;

-- `points` is a bare quantity, never FX-converted: "58,000 Avios" fits none of
-- the amount/currency/fx_rate/home_amount columns, and pretending it does would
-- put miles into the home-currency total. It sits *beside* the cash side — a
-- line can carry the cash value it displaced, the point count, or both.
ALTER TABLE bookings
  ADD COLUMN funding_source_id INT NULL,
  ADD COLUMN points INT UNSIGNED NULL,
  ADD INDEX idx_bookings_funding_source_id (funding_source_id),
  ADD FOREIGN KEY (funding_source_id) REFERENCES funding_sources(id) ON DELETE SET NULL;

-- Seed the starting set for everyone who already exists. New installs get the
-- same three from ensureAdminUser() — the admin row is created after migrations
-- run, so it can't be covered here.
INSERT INTO funding_sources (user_id, name, sort_order)
SELECT u.id, d.name, d.sort_order
  FROM users u
  JOIN (
          SELECT 'Regular cash' AS name, 0 AS sort_order
    UNION SELECT 'Off balance',          1
    UNION SELECT 'CC points',            2
  ) d;
