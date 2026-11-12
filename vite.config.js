import { defineConfig } from 'vite';

// Allow the Cloudflare quick-tunnel hostname to reach the dev/preview servers.
// /ws is proxied to the presence server (server/index.mjs) so `npm run dev` gets multiplayer too.
const ws = { '/ws': { target: 'ws://localhost:8787', ws: true } };
export default defineConfig({
  server: { allowedHosts: ['.trycloudflare.com'], proxy: ws },
  preview: { allowedHosts: ['.trycloudflare.com'], proxy: ws },
});
