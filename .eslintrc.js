/* eslint-env node */
module.exports = {
  env: {
    node: true,
  },
  root: true,
  extends: ["eslint:recommended", "prettier"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  rules: {
    semi: [2, "always"],
    "no-multiple-empty-lines": [2, { max: 1, maxEOF: 0 }],

    // Quality rules (equivalent to PHPMD)
    complexity: ["warn", 20],
    "max-depth": ["warn", 4],
    "max-lines-per-function": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
    "max-params": ["warn", 5],
    "max-nested-callbacks": ["warn", 4],
    "no-duplicate-imports": "error",
  },
};
