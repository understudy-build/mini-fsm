import { defineConfig } from "tsdown"

// One entry per export. Adapters import the core from the shared index chunk,
// and every framework stays external through peerDependencies.
export default defineConfig({
  entry: ["src/index.ts", "src/check.ts", "src/adapters/*.ts"],
  format: "esm",
  platform: "neutral",
  // oxc emits declarations without type inference, so a src export without an
  // explicit type fails the build.
  dts: { generator: "oxc" },
  fixedExtension: false,
})
