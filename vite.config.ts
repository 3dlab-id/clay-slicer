import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static SPA — builds to dist/, deployable as-is to Cloudflare Pages.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
});
