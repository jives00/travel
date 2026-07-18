const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

// pnpm monorepo: deps are hoisted to the workspace-root node_modules (and pnpm's
// virtual store), not apps/mobile/node_modules. Without this, Metro resolves
// `expo` from the root and falls back to expo/AppEntry, whose hardcoded
// `../../App` import points above the repo root and fails ("Unable to resolve
// ../../App"). Watch the workspace root and add both node_modules roots so the
// local `main: index.ts` entry and every hoisted/symlinked dependency resolve.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// pnpm symlinks packages into a virtual store; Metro must follow those symlinks
// to their real paths rather than treating each as its own resolution root.
config.resolver.unstable_enableSymlinks = true;

module.exports = withNativeWind(config, { input: "./global.css" });
