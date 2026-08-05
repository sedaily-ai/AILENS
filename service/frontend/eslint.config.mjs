import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

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
  ]),
  // FSD Boundaries rules
  {
    plugins: {
      boundaries,
    },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "src/app/*" },
        { type: "pages", pattern: "src/pages/*" },
        { type: "widgets", pattern: "src/widgets/*" },
        { type: "features", pattern: "src/features/*" },
        { type: "entities", pattern: "src/entities/*" },
        { type: "shared", pattern: "src/shared/*" },
      ],
      "boundaries/ignore": ["**/*.test.*", "**/*.spec.*"],
    },
    rules: {
      "boundaries/element-types": [
        "warn",
        {
          default: "disallow",
          rules: [
            // app can import from pages, widgets, features, entities, shared
            { from: "app", allow: ["pages", "widgets", "features", "entities", "shared"] },
            // pages can import from widgets, features, entities, shared
            { from: "pages", allow: ["widgets", "features", "entities", "shared"] },
            // widgets can import from features, entities, shared
            { from: "widgets", allow: ["features", "entities", "shared"] },
            // features can import from entities, shared
            { from: "features", allow: ["entities", "shared"] },
            // entities can import from shared only
            { from: "entities", allow: ["shared"] },
            // shared can only import from shared
            { from: "shared", allow: ["shared"] },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
