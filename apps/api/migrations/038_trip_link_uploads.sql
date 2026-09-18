-- Uploaded thumbnails, because a URL is not always enough.
--
-- The og:image scrape works for providers that publish a public preview
-- (a Google Photos *share link* does — verified), but it cannot work at all for
-- some: Synology Photos serves thumbnails behind a `SynoToken` bound to a login
-- session, and its QuickConnect share page is a JS bootstrap with no preview
-- tag and no server-reachable image behind it. No amount of scraping fixes
-- that, so the bytes have to come from the one place that *can* see the photo:
-- the user's own browser.
--
-- `thumbnail_file` is the stored filename, kept separately from `thumbnail_url`
-- so the old file can be deleted when a thumbnail is replaced or cleared —
-- `thumbnail_url` holds the servable path and is what clients render, which
-- means an upload needs no client-side branching to display.
--
-- 'upload' joins the existing precedence: an upload and a typed URL are both
-- deliberate user choices and both beat a scrape, which may never overwrite
-- either.
ALTER TABLE trip_links
  MODIFY COLUMN thumbnail_source ENUM('auto','manual','upload') NOT NULL DEFAULT 'auto',
  ADD COLUMN thumbnail_file VARCHAR(255) NULL;
