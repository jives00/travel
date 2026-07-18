// Extends app.json with the Android Google Maps SDK key, injected from an env var
// so the key is never committed. The var name matches what CI already writes to
// apps/mobile/.env (deploy.yml): EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY. For a local
// dev build, put the same line in apps/mobile/.env (or export it) before
// `expo prebuild`. The key must be an Android-restricted key (package name
// com.travel.mobile + the build's SHA-1). Without it, react-native-maps renders a
// blank/gray map on Android — everything else still works.
const base = require("./app.json").expo;

module.exports = () => ({
  ...base,
  android: {
    ...base.android,
    config: {
      ...(base.android?.config ?? {}),
      googleMaps: {
        apiKey:
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? process.env.GOOGLE_MAPS_ANDROID_KEY ?? "",
      },
    },
  },
});
