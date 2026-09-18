-- External links attached to a trip — photo albums today, with room for a blog
-- post or a video later without a second table (hence `kind` as an enum).
--
-- Scope: a link points at the whole trip (both FKs null), one city, or one
-- specific activity. At most one of the two is set; the API enforces that, the
-- schema only allows it. Both are ON DELETE SET NULL rather than CASCADE —
-- deleting a city must not delete the album of what you did there, it just
-- widens the link back to the trip.
--
-- `thumbnail_source` is the escape hatch: 'auto' is whatever the og:image
-- scrape found and may be re-fetched or overwritten freely, 'manual' is a URL
-- the user typed and must never be clobbered by a later scrape.
CREATE TABLE IF NOT EXISTS trip_links (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  trip_id             INT NOT NULL,
  leg_id              INT NULL,
  itinerary_item_id   INT NULL,
  kind                ENUM('photo_album') NOT NULL DEFAULT 'photo_album',
  label               VARCHAR(255) NOT NULL,
  url                 VARCHAR(2048) NOT NULL,
  thumbnail_url       VARCHAR(2048) NULL,
  thumbnail_source    ENUM('auto','manual') NOT NULL DEFAULT 'auto',
  -- When the scrape last ran, successfully or not. Null means never attempted.
  thumbnail_fetched_at DATETIME NULL,
  sort_order          INT NOT NULL DEFAULT 0,
  created_at          DATETIME DEFAULT NOW(),
  updated_at          DATETIME DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_trip_links_trip_id (trip_id),
  INDEX idx_trip_links_leg_id (leg_id),
  INDEX idx_trip_links_itinerary_item_id (itinerary_item_id),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (leg_id) REFERENCES legs(id) ON DELETE SET NULL,
  FOREIGN KEY (itinerary_item_id) REFERENCES itinerary_items(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
