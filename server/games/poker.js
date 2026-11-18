// Heads-up Texas Hold'em against a house bot (Private Card Salon, leisure-rules §4): real hand evaluator, Monte-Carlo equity bot.
// The bot is strong but beatable: it plays from simulated equity with fixed-limit sizing (bet = 2 units, one raise to 4 units per street) and a little
// controlled bluffing. Pure functions only; the ledger part lives in leisure.js.
import { randomInt } from 'node:crypto';

const RANKS = '23456789TJQKA';
export const newDeck = (rnd = randomInt) => { const d = []; for (let r = 0; r < 13; r++) for (let s = 0; s < 4; s++) d.push(r * 4 + s); for (let i = d.length - 1; i > 0; i--) { const j = rnd(i + 1); [d[i], d[j]] = [d[j], d[i]]; } return d; };
export const cardName = (c) => `${RANKS[c >> 2]}${'♠♥♦♣'[c & 3]}`;

/** score of the best five of up to seven cards: higher is better (category * 15^5 + tiebreak ranks) */
export function score(cards) {
  const r = cards.map((c) => c >> 2), s = cards.map((c) => c & 3);
  const cnt = new Array(13).fill(0); for (const x of r) cnt[x]++;
  let flush = -1; for (let u = 0; u < 4; u++) if (s.filter((x) => x === u).length >= 5) flush = u;
  const straightHigh = (set) => { const has = (x) => set[x] > 0; for (let hi = 12; hi >= 4; hi--) if ([0, 1, 2, 3, 4].every((k) => has(hi - k))) return hi; return has(12) && has(0) && has(1) && has(2) && has(3) ? 3 : -1; };
  const enc = (cat, ks) => ks.slice(0, 5).reduce((a, k) => a * 15 + k + 1, cat) * 1; // cat first, then up to five kickers
  const mk = (cat, ks) => { let v = cat; for (let i = 0; i < 5; i++) v = v * 15 + (ks[i] != null ? ks[i] + 1 : 0); return v; };
  void enc;
  if (flush >= 0) {
    const fs = new Array(13).fill(0); cards.forEach((c) => { if ((c & 3) === flush) fs[c >> 2]++; });
    const sf = straightHigh(fs); if (sf >= 0) return mk(8, [sf]);
  }
  const groups = cnt.map((n, rank) => [n, rank]).filter(([n]) => n > 0).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  if (groups[0][0] === 4) return mk(7, [groups[0][1], groups.slice(1).map((g) => g[1])[0]]);
  if (groups[0][0] === 3 && groups[1] && groups[1][0] >= 2) return mk(6, [groups[0][1], groups[1][1]]);
  if (flush >= 0) { const ks = cards.filter((c) => (c & 3) === flush).map((c) => c >> 2).sort((a, b) => b - a); return mk(5, ks); }
  const st = straightHigh(cnt); if (st >= 0) return mk(4, [st]);
  if (groups[0][0] === 3) return mk(3, [groups[0][1], ...groups.slice(1).map((g) => g[1]).slice(0, 2)]);
  if (groups[0][0] === 2 && groups[1] && groups[1][0] === 2) { const pairs = groups.filter((g) => g[0] === 2).map((g) => g[1]).slice(0, 2); const kick = groups.filter((g) => !pairs.includes(g[1])).map((g) => g[1])[0]; return mk(2, [...pairs, kick]); }
  if (groups[0][0] === 2) return mk(1, [groups[0][1], ...groups.slice(1).map((g) => g[1]).slice(0, 3)]);
  return mk(0, groups.map((g) => g[1]).slice(0, 5));
}
export const categoryName = (sc) => ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'][Math.floor(sc / 15 ** 5)];

/** probability the hand beats a random opponent hand given the board (sims random run-outs) */
export function equity(hole, board, sims = 200, rnd = randomInt) {
  const known = new Set([...hole, ...board]); const rest = []; for (let c = 0; c < 52; c++) if (!known.has(c)) rest.push(c);
  let win = 0;
  for (let i = 0; i < sims; i++) {
    const d = rest.slice(); for (let k = 0; k < 2 + (5 - board.length); k++) { const j = k + rnd(d.length - k); [d[k], d[j]] = [d[j], d[k]]; }
    const opp = [d[0], d[1]], run = [...board, ...d.slice(2, 2 + 5 - board.length)];
    const a = score([...hole, ...run]), b = score([...opp, ...run]);
    win += a > b ? 1 : a === b ? 0.5 : 0;
  }
  return win / sims;
}

/** the bot's decision. facing: the amount (in units) it must call (0 = may check). Returns 'fold' | 'check' | 'call' | 'bet' | 'raise' */
export function botAct({ hole, board, facing, canRaise, potUnits }, rnd = randomInt) {
  const eq = equity(hole, board, 200, rnd), bluff = rnd(100) < 12;
  if (facing > 0) {
    const need = facing / (potUnits + facing); // pot odds
    if (eq > 0.74 && canRaise) return 'raise';
    return eq + 0.03 >= need || (bluff && eq > 0.3 && canRaise && false) ? 'call' : 'fold';
  }
  return eq > 0.62 || (bluff && board.length > 0) ? 'bet' : 'check';
}
