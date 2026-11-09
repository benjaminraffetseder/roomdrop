import { fileURLToPath, URL } from "node:url"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import wails from "@wailsio/runtime/plugins/vite"
import { defineConfig } from "vite"

const goModule = "github.com/benjaminraffetseder/roomdrop"

export default defineConfig({
  base: "./",
  build: {
    license: { fileName: "FRONTEND_LICENSES.md" },
  },
  plugins: [react(), tailwindcss(), wails("./bindings")],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@wails": fileURLToPath(
        new URL(`./bindings/${goModule}`, import.meta.url),
      ),
    },
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
})
