"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FundingSource } from "@travel/types";
import { travelApi } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";

export function SettingsForm() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery(travelApi.queries.settingsQuery());
  const { theme, setTheme } = useTheme();
  const [homeCurrency, setHomeCurrency] = useState("");
  const [bufferM, setBufferM] = useState("");
  const [homeTimezone, setHomeTimezone] = useState("");

  async function updateUnit(distanceUnit: "km" | "mi") {
    await travelApi.settings.update({ distanceUnit });
    await queryClient.invalidateQueries({ queryKey: ["settings"] });
  }

  async function updateTravelMode(defaultTravelMode: "walk" | "transit" | "drive") {
    await travelApi.settings.update({ defaultTravelMode });
    await queryClient.invalidateQueries({ queryKey: ["settings"] });
  }

  async function updateShowPrivateItems(showPrivateItems: boolean) {
    await travelApi.settings.update({ showPrivateItems });
    await queryClient.invalidateQueries({ queryKey: ["settings"] });
  }

  async function saveHomeCurrency() {
    if (homeCurrency.trim().length !== 3) return;
    await travelApi.settings.update({ homeCurrency: homeCurrency.trim().toUpperCase() });
    await queryClient.invalidateQueries({ queryKey: ["settings"] });
    setHomeCurrency("");
  }

  async function saveHomeTimezone(value: string | null) {
    await travelApi.settings.update({ homeTimezone: value });
    await queryClient.invalidateQueries({ queryKey: ["settings"] });
    setHomeTimezone("");
  }

  async function saveBuffer() {
    const value = Number(bufferM);
    if (!value || value <= 0) return;
    await travelApi.settings.update({ defaultBufferM: value });
    await queryClient.invalidateQueries({ queryKey: ["settings"] });
    setBufferM("");
  }

  function clearCache() {
    queryClient.clear();
    window.location.reload();
  }

  if (!settings) return null;

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Settings</h1>

      <section className="rounded border border-gridline bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Theme</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setTheme("light")}
            className={`rounded px-3 py-1 ${theme === "light" ? "bg-category-transit text-white" : "border border-gridline text-text-secondary"}`}
          >
            Light
          </button>
          <button
            onClick={() => setTheme("dark")}
            className={`rounded px-3 py-1 ${theme === "dark" ? "bg-category-transit text-white" : "border border-gridline text-text-secondary"}`}
          >
            Dark
          </button>
        </div>
      </section>

      <section className="rounded border border-gridline bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Distance unit</h2>
        <div className="flex gap-2">
          <button
            onClick={() => updateUnit("mi")}
            className={`rounded px-3 py-1 ${settings.distanceUnit === "mi" ? "bg-category-transit text-white" : "border border-gridline text-text-secondary"}`}
          >
            Miles
          </button>
          <button
            onClick={() => updateUnit("km")}
            className={`rounded px-3 py-1 ${settings.distanceUnit === "km" ? "bg-category-transit text-white" : "border border-gridline text-text-secondary"}`}
          >
            Kilometers
          </button>
        </div>
      </section>

      <section className="rounded border border-gridline bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Default map travel mode</h2>
        <div className="flex gap-2">
          {(["walk", "transit", "drive"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => updateTravelMode(mode)}
              className={`rounded px-3 py-1 capitalize ${
                settings.defaultTravelMode === mode ? "bg-category-transit text-white" : "border border-gridline text-text-secondary"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded border border-gridline bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Default route buffer</h2>
        <p className="mb-1 text-sm text-text-secondary">Currently {settings.defaultBufferM}m</p>
        <div className="flex gap-2">
          <input
            type="number"
            className="w-24 rounded border border-gridline bg-transparent p-1 text-text-primary"
            placeholder="meters"
            value={bufferM}
            onChange={(e) => setBufferM(e.target.value)}
          />
          <button onClick={saveBuffer} className="rounded bg-category-transit px-3 py-1 text-sm text-white">
            Save
          </button>
        </div>
      </section>

      <section className="rounded border border-gridline bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Home currency</h2>
        <p className="mb-1 text-sm text-text-secondary">Currently {settings.homeCurrency ?? "not set"}</p>
        <div className="flex gap-2">
          <input
            className="w-24 rounded border border-gridline bg-transparent p-1 uppercase text-text-primary placeholder:normal-case"
            placeholder="e.g. USD"
            maxLength={3}
            value={homeCurrency}
            onChange={(e) => setHomeCurrency(e.target.value)}
          />
          <button onClick={saveHomeCurrency} className="rounded bg-category-transit px-3 py-1 text-sm text-white">
            Save
          </button>
        </div>
      </section>

      <section className="rounded border border-gridline bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Home timezone</h2>
        <p className="mb-1 text-sm text-text-secondary">
          Used by &ldquo;Add to Google Calendar&rdquo; for anything not tied to a city — trip cities carry their own
          zone. Leave it unset to let your calendar decide.
        </p>
        <p className="mb-1 text-sm text-text-secondary">Currently {settings.homeTimezone ?? "not set"}</p>
        <div className="flex flex-wrap gap-2">
          <input
            className="w-56 rounded border border-gridline bg-transparent p-1 text-text-primary"
            placeholder="e.g. America/Chicago"
            maxLength={64}
            value={homeTimezone}
            onChange={(e) => setHomeTimezone(e.target.value)}
          />
          <button
            onClick={() => saveHomeTimezone(homeTimezone.trim())}
            disabled={!homeTimezone.trim()}
            className="rounded bg-category-transit px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            Save
          </button>
          {/* The browser already knows the answer, so typing an IANA id by hand
              should never be the only way in. */}
          <button
            onClick={() => saveHomeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)}
            className="rounded border border-gridline px-3 py-1 text-sm text-text-secondary"
          >
            Use this device&rsquo;s
          </button>
          {settings.homeTimezone && (
            <button
              onClick={() => saveHomeTimezone(null)}
              className="rounded border border-gridline px-3 py-1 text-sm text-text-secondary"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      <section className="rounded border border-gridline bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Private itinerary items</h2>
        <p className="mb-2 text-sm text-text-secondary">
          Places and ideas can be marked private. Control whether they show up in your itinerary here.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => updateShowPrivateItems(true)}
            className={`rounded px-3 py-1 ${settings.showPrivateItems ? "bg-category-transit text-white" : "border border-gridline text-text-secondary"}`}
          >
            Show private items
          </button>
          <button
            onClick={() => updateShowPrivateItems(false)}
            className={`rounded px-3 py-1 ${!settings.showPrivateItems ? "bg-category-transit text-white" : "border border-gridline text-text-secondary"}`}
          >
            Hide private items
          </button>
        </div>
      </section>

      <FundingSourcesSection />

      <section className="rounded border border-gridline bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Data</h2>
        <button onClick={clearCache} className="text-sm text-status-critical">
          Clear local cache
        </button>
      </section>
    </div>
  );
}

/** The API client throws an Error whose message is the raw response body — a
 * JSON `{ "error": "..." }` for our 4xx replies. Surface just the message. */
function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    return (JSON.parse(raw) as { error?: string }).error ?? raw;
  } catch {
    return raw;
  }
}

/** Manage the funding sources a budget line can be attributed to. Seeded with
 * "Regular cash" / "Off balance" / "CC points" (migration 035); everything past
 * that is the user's own vocabulary — the app never branches on the name. */
function FundingSourcesSection() {
  const queryClient = useQueryClient();
  // `error` is read, not ignored: a failed load and an empty list look
  // identical otherwise, which is exactly what made a 401 here read as "there
  // are no funding sources".
  const { data: sources, error: loadError } = useQuery(travelApi.queries.fundingSourcesQuery());
  const [adding, setAdding] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["fundingSources"] });
  }

  // The name is the only thing a source has, so a duplicate is a real 409 from
  // the server rather than something to swallow — surface it.
  async function run(work: () => Promise<unknown>) {
    setError(null);
    try {
      await work();
      await refresh();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    }
  }

  async function add() {
    const name = adding.trim();
    if (!name) return;
    if (await run(() => travelApi.fundingSources.create({ name }))) setAdding("");
  }

  async function rename(source: FundingSource) {
    const name = editingName.trim();
    if (!name || name === source.name) {
      setEditingId(null);
      return;
    }
    if (await run(() => travelApi.fundingSources.update(source.id, { name }))) setEditingId(null);
  }

  return (
    <section className="rounded border border-gridline bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Funding sources</h2>
      <p className="mb-3 text-sm text-text-secondary">
        Where the money for an expense or booking came from. Deleting one leaves its budget lines in place — they
        just go back to unassigned.
      </p>

      <ul className="mb-3 divide-y divide-gridline rounded border border-gridline">
        {(sources ?? []).map((source) => (
          <li key={source.id} className="flex items-center gap-2 p-2">
            {editingId === source.id ? (
              <>
                <input
                  autoFocus
                  className="flex-1 rounded border border-gridline bg-transparent p-1 text-text-primary"
                  maxLength={80}
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename(source);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                <button onClick={() => rename(source)} className="text-sm text-category-transit">
                  Save
                </button>
                <button onClick={() => setEditingId(null)} className="text-sm text-text-secondary">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-text-primary">{source.name}</span>
                <button
                  onClick={() => {
                    setEditingId(source.id);
                    setEditingName(source.name);
                    setError(null);
                  }}
                  className="text-sm text-text-secondary hover:text-text-primary"
                >
                  Rename
                </button>
                <button
                  onClick={() => run(() => travelApi.fundingSources.remove(source.id))}
                  className="text-sm text-text-muted hover:text-status-critical"
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
        {loadError && (
          <li className="p-3 text-center text-sm text-status-critical">
            Couldn&rsquo;t load funding sources — {errorText(loadError)}
          </li>
        )}
        {!loadError && sources?.length === 0 && (
          <li className="p-3 text-center text-sm text-text-muted">No funding sources yet.</li>
        )}
      </ul>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-gridline bg-transparent p-1 text-text-primary"
          placeholder="Add a source (e.g. Amex, gift card)"
          maxLength={80}
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <button
          onClick={add}
          disabled={!adding.trim()}
          className="rounded bg-category-transit px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-status-critical">{error}</p>}
    </section>
  );
}
