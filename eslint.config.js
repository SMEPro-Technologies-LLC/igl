// ESLint, flat config. Runs in CI (npm run lint) over the runtime, the
// provisioning service, the hosted API, the operator console, the tests and
// the examples. The rule set is the recommended one plus the handful of
// rules that catch what a governed runtime cannot afford: unchecked
// prototype access, unused code paths and implicit globals.
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/**", "**/.wrangler/**", "artifacts/**", "docs/assets/**", "platform/site/**", "**/*.min.js", "provision/identities.mjs"] },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.node, ...globals.es2024 } },
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none", ignoreRestSiblings: true }],
      "no-prototype-builtins": "error",
      "no-implicit-globals": "error",
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }],
      "eqeqeq": ["error", "smart"],
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["platform/api/src/**", "platform/ops/src/**", "platform/site/functions/**"],
    languageOptions: { globals: { ...globals.serviceworker, ...globals.browser, Buffer: "readonly", process: "readonly", AbortSignal: "readonly", crypto: "readonly" } },
  },
  {
    files: ["provision/studio.js", "platform/site/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
];
