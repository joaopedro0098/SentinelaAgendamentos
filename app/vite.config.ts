import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { projectAliases } from "./vite-plugins/agenda-alias";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [projectAliases(__dirname), react()],
  resolve: {
    alias: {
      "@agenda": path.resolve(__dirname, "./agenda/src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
});
