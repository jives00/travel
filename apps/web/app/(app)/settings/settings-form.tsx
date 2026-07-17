"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { travelApi } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";

export function SettingsForm() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery(travelApi.queries.settingsQuery());
  const { theme, setTheme } = useTheme();
  const [homeCurrency, setHomeCurrency] = useState("");
  const [bufferM, setBufferM] = useState("");

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
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Theme</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setTheme("light")}
            className={`rounded px-3 py-1 ${theme === "light" ? "bg-category-transit text-white" : "bg-surface text-text-secondary"}`}
          >
            Light
          </button>
          <button
            onClick={() => setTheme("dark")}
            className={`rounded px-3 py-1 ${theme === "dark" ? "bg-category-transit text-white" : "bg-surface text-text-secondary"}`}
          >
            Dark
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Distance unit</h2>
        <div className="flex gap-2">
          <button
            onClick={() => updateUnit("mi")}
            className={`rounded px-3 py-1 ${settings.distanceUnit === "mi" ? "bg-category-transit text-white" : "bg-surface text-text-secondary"}`}
          >
            Miles
          </button>
          <button
            onClick={() => updateUnit("km")}
            className={`rounded px-3 py-1 ${settings.distanceUnit === "km" ? "bg-category-transit text-white" : "bg-surface text-text-secondary"}`}
          >
            Kilometers
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Default map travel mode</h2>
        <div className="flex gap-2">
          {(["walk", "transit", "drive"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => updateTravelMode(mode)}
              className={`rounded px-3 py-1 capitalize ${
                settings.defaultTravelMode === mode ? "bg-category-transit text-white" : "bg-surface text-text-secondary"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </section>

      <section>
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

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Home currency</h2>
        <p className="mb-1 text-sm text-text-secondary">Currently {settings.homeCurrency ?? "not set"}</p>
        <div className="flex gap-2">
          <input
            className="w-24 rounded border border-gridline bg-transparent p-1 uppercase text-text-primary"
            placeholder="USD"
            maxLength={3}
            value={homeCurrency}
            onChange={(e) => setHomeCurrency(e.target.value)}
          />
          <button onClick={saveHomeCurrency} className="rounded bg-category-transit px-3 py-1 text-sm text-white">
            Save
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Private itinerary items</h2>
        <p className="mb-2 text-sm text-text-secondary">
          Places and ideas can be marked private. Control whether they show up in your itinerary here.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => updateShowPrivateItems(true)}
            className={`rounded px-3 py-1 ${settings.showPrivateItems ? "bg-category-transit text-white" : "bg-surface text-text-secondary"}`}
          >
            Show private items
          </button>
          <button
            onClick={() => updateShowPrivateItems(false)}
            className={`rounded px-3 py-1 ${!settings.showPrivateItems ? "bg-category-transit text-white" : "bg-surface text-text-secondary"}`}
          >
            Hide private items
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Data</h2>
        <button onClick={clearCache} className="text-sm text-status-critical">
          Clear local cache
        </button>
      </section>
    </div>
  );
}
