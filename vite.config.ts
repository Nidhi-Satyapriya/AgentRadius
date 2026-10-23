import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { API_HOST, API_PORT, UI_DEV_PORT } from "./src/api/config.ts";

export default defineConfig({
  root: "src/ui",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: UI_DEV_PORT,
    strictPort: true,
    proxy: {
      // changeOrigin rewrites Host so the API's DNS-rebinding check sees its own address.
      "/api": { target: `http://${API_HOST}:${API_PORT}`, changeOrigin: true },
    },
  },
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true,
  },
});
