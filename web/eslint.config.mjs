import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** @type {import("eslint").Linter.Config[]} */
const nextConfigs = require("eslint-config-next/core-web-vitals");

/** Next 16 / react-hooks 7 — too strict for normal fetch/sync-from-props effects in this codebase. */
const eslintConfig = [
  ...nextConfigs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    ignores: [".next/**", "out/**", "node_modules/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
