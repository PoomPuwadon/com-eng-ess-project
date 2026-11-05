// Fails if a hard-banned word appears in player-facing strings (voice-and-satire skill).
// Scans string literals in src/ and the HTML text, ignoring comments.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BANNED = ['casino', 'gambling', 'gamble', 'gambler', 'bet slip', 'bookie', 'jackpot', 'slot machine', 'loan shark', 'addiction', 'rigged'];
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(js|html)$/.test(p) && files.push(p); } };
walk('src');
files.push('index.html');

let bad = 0;
for (const f of files) {
  const text = readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/<!--[\s\S]*?-->/g, '');
  const strings = f.endsWith('.html') ? [text.replace(/<[^>]+>/g, ' ')] : [...text.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);
  for (const s of strings) for (const w of BANNED) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(s)) { console.error(`${f}: banned word "${w}" in: ${s.slice(0, 80)}`); bad++; }
  }
}
if (bad) { console.error(`${bad} banned-word hit(s).`); process.exit(1); }
console.log(`Banned-word check passed (${files.length} files).`);
