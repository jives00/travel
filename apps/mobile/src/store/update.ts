// SDK 54's expo-file-system replaced the old string-path + createDownloadResumable
// API with a File/Directory-based one; the old API is kept available under
// /legacy specifically for code (like this, copied from Quest) written against it.
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { create } from "zustand";
import { ProbingBaseUrlResolver } from "../lib/apiBase";

// Copied near-verbatim from Quest's src/store/update.ts.
const BUILD_TAG = process.env.EXPO_PUBLIC_BUILD_TAG ?? "dev";
const baseUrl = new ProbingBaseUrlResolver();

interface UpdateState {
  availableTag: string | null;
  apkUrl: string | null;
  downloading: boolean;
  progress: number;
  checkForUpdate: () => Promise<void>;
  startUpdate: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  availableTag: null,
  apkUrl: null,
  downloading: false,
  progress: 0,

  async checkForUpdate() {
    const base = await baseUrl.getBaseUrl();
    const res = await fetch(`${base}/api/app/version`);
    if (!res.ok) return;
    const data = (await res.json()) as { tag: string | null; apkUrl: string | null };
    if (data.tag && data.tag !== BUILD_TAG) {
      set({ availableTag: data.tag, apkUrl: data.apkUrl });
    }
  },

  async startUpdate() {
    const { apkUrl } = get();
    if (!apkUrl) return;
    set({ downloading: true, progress: 0 });

    const destination = `${FileSystem.documentDirectory}update.apk`;
    const download = FileSystem.createDownloadResumable(apkUrl, destination, {}, (p) => {
      set({ progress: p.totalBytesWritten / p.totalBytesExpectedToWrite });
    });

    const result = await download.downloadAsync();
    set({ downloading: false });
    if (!result) return;

    const contentUri = await FileSystem.getContentUriAsync(result.uri);
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: "application/vnd.android.package-archive",
    });
  },
}));
