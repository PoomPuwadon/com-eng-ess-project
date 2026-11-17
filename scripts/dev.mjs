// `npm run dev`: start the game server and the Vite client together; Ctrl+C stops both.
import { spawn } from 'node:child_process';

const kids = [
  spawn(process.execPath, ['--watch-path=server', 'server/index.js'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', process.env.VITE_PORT || '5173', '--strictPort'], { stdio: 'inherit' }),
];
const stop = () => { for (const k of kids) k.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const k of kids) k.on('exit', (code) => { if (code) { console.error(`[dev] a process exited with ${code}`); stop(); } });
