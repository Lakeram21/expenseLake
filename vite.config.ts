import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/recharts/") || id.includes("/node_modules/d3-")) return "charts";
          if (id.includes("/node_modules/@firebase/firestore/")) return "firebase-firestore";
          if (id.includes("/node_modules/@firebase/auth/")) return "firebase-auth";
          if (id.includes("/node_modules/@firebase/storage/")) return "firebase-storage";
          if (id.includes("/node_modules/@firebase/functions/")) return "firebase-functions";
          if (id.includes("/node_modules/@firebase/app/") || id.includes("/node_modules/firebase/")) return "firebase-core";
          if (id.includes("/node_modules/@firebase/")) return "firebase-shared";
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/") || id.includes("/node_modules/scheduler/")) return "react";
        },
      },
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "functions/src/**/*.test.ts"],
    exclude: ["functions/lib/**", "functions/node_modules/**", "node_modules/**", "dist/**"],
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    coverage: { reporter: ["text", "html"] },
  },
});
