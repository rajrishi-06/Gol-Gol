import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    target: "es2020",
    cssCodeSplit: true,
    // Split heavy, cache-stable vendors into their own chunks so the app
    // shell and route chunks stay small and long-term cacheable.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@googlemaps")) return "googlemaps";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("react-dom") || id.includes("react-router") || id.includes("/react/")) {
            return "react-vendor";
          }
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
