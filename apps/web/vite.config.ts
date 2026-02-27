import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const configuredApiBase = process.env.VITE_API_BASE_URL?.trim();
const apiBaseUrl = configuredApiBase && configuredApiBase.length > 0 ? configuredApiBase : "http://localhost:3000";
const configuredAppToken = process.env.VITE_APP_TOKEN?.trim() || process.env.APP_TOKEN?.trim() || "";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  },
  define: {
    __API_BASE_URL__: JSON.stringify(apiBaseUrl),
    __APP_TOKEN__: JSON.stringify(configuredAppToken)
  }
});
