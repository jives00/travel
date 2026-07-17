// Copied from Quest's src/lib/constants.ts pattern — swap in Travel's API port (3008).
export const API_BASES = [
  process.env.EXPO_PUBLIC_API_URL ?? "http://100.115.171.80:3008", // Tailscale primary
  process.env.EXPO_PUBLIC_API_LAN_URL ?? "http://192.168.0.105:3008", // LAN fallback
];
