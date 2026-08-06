import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    outDir: "dist/client",
    /*
     * This is an iPad-first sideline tool, and coaching devices are often several
     * iOS releases behind. Vite's default target assumes a much newer engine, so
     * a slightly older iPad would fail to parse the bundle and render nothing at
     * all. Targeting Safari 14 keeps the output compatible with those devices.
     */
    target: ["es2020", "safari14", "chrome87", "firefox78", "edge88"],
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
