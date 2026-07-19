-- Budget: per-trip expense lines. Each line starts as an estimate and is later
-- superseded by an actual (typed, or derived live from a linked booking's price).
-- All `*_home_amount`/`*_fx_rate` are frozen at entry time for typed values
-- (see packages/core/fx.ts); booking-derived actuals convert at read time.
CREATE TABLE IF NOT EXISTS expenses (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  trip_id             INT NOT NULL,
  leg_id              INT NULL,
  category            ENUM('flights','lodging','food','activities','transit','shopping','other') NOT NULL,
  label               VARCHAR(255) NOT NULL,

  -- estimate side (nullable set — a line can be actual-only)
  est_amount          DECIMAL(12,2) NULL,
  est_currency        CHAR(3) NULL,
  est_fx_rate         DECIMAL(18,8) NULL,   -- home per entered, frozen
  est_home_amount     DECIMAL(12,2) NULL,

  -- typed actual side (nullable set — null when actual comes from a linked
  -- booking, or when the line is still just an estimate)
  act_amount          DECIMAL(12,2) NULL,
  act_currency        CHAR(3) NULL,
  act_fx_rate         DECIMAL(18,8) NULL,
  act_home_amount     DECIMAL(12,2) NULL,

  -- when set, the actual is derived live from this booking's price (overrides act_*)
  actual_booking_id   INT NULL,

  home_currency       CHAR(3) NOT NULL,     -- snapshot at creation
  place_id            INT NULL,
  itinerary_item_id   INT NULL,
  notes               TEXT NULL,
  created_at          DATETIME DEFAULT NOW(),
  updated_at          DATETIME DEFAULT NOW() ON UPDATE NOW(),

  INDEX idx_expenses_trip_id (trip_id),
  INDEX idx_expenses_leg_id (leg_id),
  INDEX idx_expenses_actual_booking_id (actual_booking_id),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (leg_id) REFERENCES legs(id) ON DELETE SET NULL,
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL,
  FOREIGN KEY (itinerary_item_id) REFERENCES itinerary_items(id) ON DELETE SET NULL,
  FOREIGN KEY (actual_booking_id) REFERENCES bookings(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
