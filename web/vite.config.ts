import { defineConfig } from "vite";

// The python game server runs on :8000 (uvicorn server.app:app); the browser
// only ever talks to /api on this origin.
export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
  },
});
