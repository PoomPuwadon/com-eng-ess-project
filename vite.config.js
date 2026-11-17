import { defineConfig } from 'vite';

// The game server (server/index.js) owns all money, data and agents; Vite proxies /api to it.
export default defineConfig({
  server: {
    proxy: { '/api': { target: `http://localhost:${process.env.GAME_PORT || 8787}`, changeOrigin: true, ws: true } },
  },
});
