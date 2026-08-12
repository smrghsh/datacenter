import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// HTTPS by default: WebXR requires a secure context (AVP Safari on the LAN).
// NO_SSL=1 opts out for plain-http tooling (screenshot runs etc).
const useSsl = !process.env.NO_SSL;

export default defineConfig({
  root: "src/",
  publicDir: "../static/",
  base: "./",
  server: {
    host: true,
    https: useSsl,
  },
  build: {
    outDir: "../docs",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
  },
  plugins: useSsl ? [basicSsl()] : [],
});
