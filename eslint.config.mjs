// Repo-wide flat ESLint config: core + typescript-eslint + the published @re-cinq/eslint-plugin-re-lint house rules, every rule at "error".
import eslintJs from "@eslint/js";
import tseslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";
import markdown from "@eslint/markdown";
import globals from "globals";
import reLint from "@re-cinq/eslint-plugin-re-lint";

const TEMPLATE_ENGINE_ALLOWED = [
  "packages/store/src/template.ts",
  "packages/store/src/template.test.ts",
  "packages/store/src/event-match.ts",
];
const FIRST_PARTY = { firstPartyScopes: ["@floor", "@re-cinq"] };

export default tseslint.config(
  {
    // examples/code/**/*.ts is a reader's file, outside every workspace: no tsconfig covers it.
    ignores: ["website/**", "examples/code/**/*.{ts,tsx}", "**/dist/**", "**/node_modules/**", "**/coverage/**", ".backup-2026-09-27/**"],
  },

  // Type-aware TypeScript across every workspace package.
  {
    files: ["**/*.{ts,tsx}"],
    extends: [eslintJs.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        // Config files sit beside a package, not under its src/, so no tsconfig covers them.
        projectService: {
          allowDefaultProject: [
            "*.mjs",
            "packages/*/vitest.config.ts",
            "apps/*/vitest.config.ts",
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 16,
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    plugins: { "re-lint": reLint },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-unnecessary-condition": "error",
      // A test that never imports the module it names is testing nothing.
      "re-lint/test-imports-its-subject": ["error", FIRST_PARTY],
      // jscpd-backed; scoped to the source trees, never node_modules/dist/docs.
      "re-lint/no-duplicate-code": [
        "error",
        {
          roots: ["packages", "apps"],
          formats: ["typescript"],
          minTokens: 50,
          ignore: ["**/dist/**", "**/*.d.ts"],
        },
      ],
    },
  },

  // The house preset: every rule in it is already "error" (its own convention).
  ...reLint.configs.recommended({ tseslint, stylistic }),

  // Two overrides on top of the preset, both matching lore's own eslint.config.mjs.
  {
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      // The pure replay in transition.ts needs a state and an accounting object alongside its visit and graph.
      "max-params": ["error", { max: 4 }],
      // `on`/`to` match lore's WalkEdge; `id` is standard; `by` is the Item's own provenance field (docs/assembly_run_storage.md). Short, not vague.
      "id-length": ["error", { min: 3, exceptions: ["on", "to", "id", "by"] }],
      // RFC 9457's own name for the status, not a boolean negated at the use site.
      "re-lint/no-negative-names": ["error", { allow: ["notFound"] }],
    },
  },

  // The template engine is a security boundary: only event-match.ts (plus the engine's own file and tests) may reach it; everyone else goes through event-match.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: TEMPLATE_ENGINE_ALLOWED,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/template", "**/template.js"],
              message: "The template engine is a security boundary: go through event-match.ts, never import renderTemplate directly.",
            },
          ],
        },
      ],
    },
  },

  // The studio's page runs in a browser, not in Node.
  {
    files: ["packages/studio/web/**/*.{ts,tsx}", "packages/graph/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
  },

  // A React component is a PascalCase function: the preset's naming rule, restated with that one exception.
  {
    files: ["packages/studio/web/**/*.tsx", "packages/graph/**/*.tsx"],
    rules: {
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "default", format: ["camelCase"], leadingUnderscore: "forbid" },
        { selector: "variable", format: ["camelCase", "UPPER_CASE"] },
        { selector: "function", format: ["camelCase", "PascalCase"] },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "interface", format: ["PascalCase"], custom: { regex: "^I[A-Z]", match: false } },
        { selector: "typeAlias", format: ["PascalCase"], custom: { regex: "Type$", match: false } },
        { selector: "import", format: null },
        { selector: "objectLiteralProperty", format: null },
      ],
    },
  },

  // The graph drawing is SVG geometry copied from lore: pixel offsets and the x, y, cx, cy of SVG itself are its vocabulary, and its files stay close to lore's so a later sync is a diff.
  {
    files: ["packages/graph/src/**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-magic-numbers": "off", "id-length": "off" },
  },

  // A config file has no tsconfig of its own, so no strict-mode info reaches this type-aware rule.
  {
    files: ["**/vitest.config.ts"],
    rules: { "@typescript-eslint/no-unnecessary-condition": "off" },
  },

  // Markdown link hygiene on the plan itself; no spec/ADR link convention assumed here.
  {
    files: ["docs/**/*.md"],
    plugins: { markdown, "re-lint": reLint },
    language: "markdown/gfm",
    rules: { "re-lint/no-dead-md-links": "error" },
  },
  {
    files: ["packages/station/src/station.test.ts"],
    rules: { "re-lint/max-comment-lines": ["error", { max: 1 }] }, // TypeDoc reads the named example region.
  },

);

// Opt-in rules left off: no-cross-layer-import (no layers.yaml), the models/enforce/api-error trio (no such module yet), no-forbidden-imports (nothing forbidden yet), the UI-only rules (no UI here), and the spec-link rules (docs/ is a plan, not a specs/adrs tree).
