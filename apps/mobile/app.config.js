// Extends app.json with the Android Google Maps SDK key, injected from an env var
// so the key is never committed. The var name matches what CI already writes to
// apps/mobile/.env (deploy.yml): EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY. For a local
// dev build, put the same line in apps/mobile/.env (or export it) before
// `expo prebuild`. The key must be an Android-restricted key (package name
// com.travel.mobile + the build's SHA-1). Without it, react-native-maps renders a
// blank/gray map on Android — everything else still works.
const { withAppBuildGradle } = require("@expo/config-plugins");

const base = require("./app.json").expo;

// `expo prebuild` regenerates android/app/build.gradle with a hardcoded debug
// signingConfig (storePassword/keyAlias/keyPassword all literal 'android').
// CI overwrites debug.keystore with the real release keystore (see
// deploy.yml's "Inject signing keystore" step) but still signs through this
// same debug signingConfig, so the hardcoded password no longer matches the
// injected keystore. Read the real credentials from env at Gradle build time
// (falling back to Expo's stock debug values for local dev builds), so CI's
// ANDROID_KEYSTORE_PASSWORD/ANDROID_KEY_ALIAS/ANDROID_KEY_PASSWORD env vars
// (set on the "Build release APK" step) actually get used.
function withReleaseKeystoreSigning(config) {
  return withAppBuildGradle(config, (config) => {
    config.modResults.contents = config.modResults.contents
      .replace(
        /storePassword 'android'/,
        "storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD') ?: 'android'"
      )
      .replace(
        /keyAlias 'androiddebugkey'/,
        "keyAlias System.getenv('ANDROID_KEY_ALIAS') ?: 'androiddebugkey'"
      )
      .replace(
        /keyPassword 'android'/,
        "keyPassword System.getenv('ANDROID_KEY_PASSWORD') ?: 'android'"
      );
    return config;
  });
}

module.exports = () =>
  withReleaseKeystoreSigning({
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
