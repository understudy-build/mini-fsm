import { svelte } from "@sveltejs/vite-plugin-svelte"
import { defineConfig } from "vitest/config"

// Solid and Svelte ship non-reactive server builds under the default Node conditions.
export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ["browser", "development"] },
})
