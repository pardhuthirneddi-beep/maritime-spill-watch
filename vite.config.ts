import { vlyPlugin } from "@vly-ai/integrations";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    vlyPlugin(),
    tailwindcss(),
    // Cesium 3D engine static assets (Workers, Assets, Widgets) — served at
    // /cesium/ for the 3D Intelligence view (CESIUM_BASE_URL in Globe3DView).
    viteStaticCopy({
      targets: [
        { src: "node_modules/cesium/Build/Cesium/Workers", dest: "cesium" },
        { src: "node_modules/cesium/Build/Cesium/ThirdParty", dest: "cesium" },
        { src: "node_modules/cesium/Build/Cesium/Assets", dest: "cesium" },
        { src: "node_modules/cesium/Build/Cesium/Widgets", dest: "cesium" },
      ],
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
  },
  build: {
    sourcemap: false,
    target: "esnext",
    chunkSizeWarningLimit: 2000,
  },

  server: {
    allowedHosts: true,
    host: true,
    port: 5173,
    hmr: false,
  },
});
