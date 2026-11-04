import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  base: "./",
  build: {
    outDir: resolve(__dirname, "../assets/velaris"),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, "src/main.tsx"),
      output: { entryFileNames: "velaris.js", assetFileNames: "velaris.[ext]" }
    }
  }
});
