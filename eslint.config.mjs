import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "extension/**",
      "prisma/dev.db",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      // Scripts and a few adapters legitimately use `any` at the JSON boundary.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default config;
