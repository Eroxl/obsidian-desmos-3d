import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        console: "readonly",
        crypto: "readonly",
        document: "readonly",
        DOMParser: "readonly",
        getComputedStyle: "readonly",
        HTMLCanvasElement: "readonly",
        parent: "readonly",
        Proxy: "readonly",
        Reflect: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        TextEncoder: "readonly",
        window: "readonly",
      },
    },

    rules: {},
  },
]);
