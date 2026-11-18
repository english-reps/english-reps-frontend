import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3007,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://127.0.0.1:8000",
        changeOrigin: false,
        configure(proxy) {
          proxy.on("proxyReq", (proxyRequest, incoming) => {
            proxyRequest.setHeader(
              "X-Forwarded-For",
              incoming.socket.remoteAddress || "unknown",
            );
          });
        },
      },
    },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
