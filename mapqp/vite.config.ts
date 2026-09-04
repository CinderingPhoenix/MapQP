import { reactRouter } from "@react-router/dev/vite";
import babel from '@rolldown/plugin-babel';
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(), 
    reactRouter(),    
    babel({}),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["cope-prior-slot.ngrok-free.dev"],
  },
});
