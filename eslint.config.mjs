import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  {
    ignores: [
      "apps/**",
      "dist/**",
      "node_modules/**",
      "packages/*/dist/**",
      "packages/*/runtime/**",
      "packages/*/cli/**",
      "packages/*/tests/**",
      "python-poc/**",
      ".tmp/**",
      "output/**",
      "**/*.config.js",
      "**/*.config.ts",
    ],
  },
  ...tseslint.configs["flat/recommended"],
  {
    files: ["packages/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
];
