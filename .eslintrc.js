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
    indent: ["error", 2, { SwitchCase: 1 }],
  },
};
