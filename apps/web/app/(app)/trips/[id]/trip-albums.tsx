"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TripLink } from "@travel/types";
import { travelApi } from "@/lib/api";
import { Modal } from "./itinerary-panels";

const inputClass = "w-full rounded border border-gridline bg-transparent p-2 text-text-primary";

/** Photo albums and other links out — their own section of the trip page, never
 * folded into the recap's city blocks (plans/todo.md #9b): the summary text and
 * the photos are two different things to look at.
 *
 * Thumbnails are uploaded, never fetched — see `TripLink` in `@travel/types`.
 * Name, link, picture and delete all live in one editor, so there is no second
 * path that can get the thumbnail wrong.
 *
 * Placement is the caller's, via `tripLinksQuery`: an empty box on a trip that
 * hasn't happened yet is a footer, not a headline, so it sinks to the bottom
 * until there's something in it. See `albumsAtTop` in trip-detail.tsx. */
export function TripAlbums({ tripId }: { tripId: number }) {
  const queryClient = useQueryClient();
  const { data: links } = useQuery(travelApi.queries.tripLinksQuery(tripId));
  const [editing, setEditing] = useState<TripLink | "new" | null>(null);

  const rows = links ?? [];

  return (
    <section className="rounded border border-gridline bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase text-text-muted">Photo albums</h2>
        <button onClick={() => setEditing("new")} className="text-xs text-category-transit hover:underline">
          + Add album
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">
          No albums linked yet — add a share link and a picture for the card.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {rows.map((link) => (
            <div key={link.id} className="group w-[336px] shrink-0">
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="block overflow-hidden rounded border border-gridline"
              >
                {link.thumbnailUrl ? (
                  // Deliberately not next/image: these are served by our own API
                  // from a bind-mounted volume, and the optimizer would buy
                  // nothing for an upload that is already card-sized.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={link.thumbnailUrl}
                    alt=""
                    className="h-[189px] w-full bg-page object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-[189px] w-full items-center justify-center bg-page text-text-muted">
                    <span className="material-symbols-outlined" aria-hidden="true">
                      photo_library
                    </span>
                  </div>
                )}
              </a>
              <div className="mt-1 flex items-start justify-between gap-1">
                <div className="truncate text-base text-text-primary" title={link.label}>
                  {link.label}
                </div>
                <button
                  onClick={() => setEditing(link)}
                  aria-label={`Edit ${link.label}`}
                  className="mt-0.5 text-text-muted opacity-0 transition-opacity hover:text-text-primary group-hover:opacity-100 focus:opacity-100"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    edit
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <AlbumModal
          tripId={tripId}
          link={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["tripLinks", tripId] });
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function AlbumModal({
  tripId,
  link,
  onClose,
  onSaved,
}: {
  tripId: number;
  link: TripLink | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(link?.label ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(link?.thumbnailUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const remove = useMutation({
    mutationFn: () => travelApi.tripLinks.remove(tripId, link!.id),
    onSuccess: onSaved,
  });

  async function uploadTo(linkId: number) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    await travelApi.tripLinks.uploadImage(tripId, linkId, form);
  }

  async function save() {
    if (!label.trim() || !url.trim()) return;
    if (!/^https?:\/\//i.test(url.trim())) {
      setError("The link must start with http:// or https://");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // A new album has no id to upload against until it exists, so the picture
      // is always a second request — done here rather than left to the user.
      if (link) {
        await travelApi.tripLinks.update(tripId, link.id, { label: label.trim(), url: url.trim() });
        await uploadTo(link.id);
      } else {
        const created = await travelApi.tripLinks.create(tripId, { label: label.trim(), url: url.trim() });
        await uploadTo(created.id);
      }
      onSaved();
    } catch {
      setError("Couldn't save that album.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-3 text-lg font-semibold text-text-primary">{link ? "Edit album" : "Add album"}</h2>
      <div className="space-y-3">
        <input
          className={inputClass}
          placeholder="Name (e.g. Seville — day 2)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="Share link (https://…)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <div>
          <label className="mb-1 block text-xs uppercase text-text-muted">Card image</label>
          <div className="flex items-center gap-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-20 w-36 rounded border border-gridline object-cover" />
            ) : (
              <div className="flex h-20 w-36 items-center justify-center rounded border border-gridline text-text-muted">
                <span className="material-symbols-outlined" aria-hidden="true">
                  photo_library
                </span>
              </div>
            )}
            <label className="cursor-pointer text-sm text-category-transit hover:underline">
              {preview ? "Choose a different image" : "Choose an image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0] ?? null;
                  // Reset first: picking the same file twice in a row fires no
                  // change event otherwise.
                  e.target.value = "";
                  if (!picked) return;
                  setFile(picked);
                  setPreview(URL.createObjectURL(picked));
                }}
              />
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-status-critical">{error}</p>}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving || !label.trim() || !url.trim()}
            className="rounded bg-category-transit px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-text-secondary">
            Cancel
          </button>
        </div>
        {link && (
          <button onClick={() => remove.mutate()} className="text-sm text-status-critical hover:underline">
            Delete
          </button>
        )}
      </div>
    </Modal>
  );
}
