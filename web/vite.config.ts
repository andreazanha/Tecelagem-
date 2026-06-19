import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Em dev, o front roda no Vite (5173) e a API no Worker (wrangler dev, 8787).
// As chamadas /api são redirecionadas para o Worker.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
