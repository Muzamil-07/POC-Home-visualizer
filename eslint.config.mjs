import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Offline CLI tooling — Node scripts, not part of the Next app bundle.
    "scripts/**",
    // Paused walkable-route experiments — kept for later, not part of this POC.
    "src/components/viewer/Route*.tsx",
    "src/components/viewer/TourMotionController.tsx",
    "src/components/viewer/TourPlaybackAlerts.tsx",
    "src/components/viewer/tour-motion.ts",
    "src/lib/compile-walkable-path.ts",
    "src/lib/route-validation.ts",
    "src/lib/tour-coverage.ts",
    "src/lib/tour-steering.ts",
    "src/lib/walkable-route.ts",
  ]),
]);

export default eslintConfig;
