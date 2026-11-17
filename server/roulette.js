// Rotational Variance Instrument — European single-zero roulette (leisure-rules skill §2).
// Server-authoritative and provably fair: before a spin the player sees sha256(seed); the spin
// derives the pocket from that seed, then reveals it and commits the next one.
import { randomBytes, createHash } from 'node:crypto';
import { VAULT, player } from './ledger.js';

export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const LIMITS = { minBet: 100, maxSpin: 2_500_000, maxBets: 80 }; // ¤ 1.00 min, ¤ 25,000 per spin

const key = (nums) => [...nums].sort((a, b) => a - b).join(',');
// every legal inside combination, keyed by sorted numbers
const INSIDE = (() => {
  const m = new Map();
  const add = (kind, nums) => m.set(key(nums), { kind, nums: [...nums].sort((a, b) => a - b) });
  for (let n = 0; n <= 36; n++) add('straight', [n]);
  for (let n = 1; n <= 36; n++) {
    if (n <= 33) add('split', [n, n + 3]);
    if (n % 3 !== 0) add('split', [n, n + 1]);
    if (n % 3 !== 0 && n <= 32) add('corner', [n, n + 1, n + 3, n + 4]);
  }
  add('split', [0, 1]); add('split', [0, 2]); add('split', [0, 3]);
  for (let s = 1; s <= 12; s++) add('street', [3 * s - 2, 3 * s - 1, 3 * s]);
  add('street', [0, 1, 2]); add('street', [0, 2, 3]); // trios
  add('corner', [0, 1, 2, 3]); // first four
  for (let s = 1; s <= 11; s++) add('sixline', [3 * s - 2, 3 * s - 1, 3 * s, 3 * s + 1, 3 * s + 2, 3 * s + 3]);
  return m;
})();
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const OUTSIDE = {
  red: [...RED], black: range(1, 36).filter((n) => !RED.has(n)),
  odd: range(1, 36).filter((n) => n % 2), even: range(1, 36).filter((n) => !(n % 2)),
  low: range(1, 18), high: range(19, 36),
  dozen1: range(1, 12), dozen2: range(13, 24), dozen3: range(25, 36),
  column1: range(1, 36).filter((n) => n % 3 === 1), column2: range(1, 36).filter((n) => n % 3 === 2), column3: range(1, 36).filter((n) => n % 3 === 0),
};

/** Normalise one client bet into { kind, nums, amount, mult } or throw. mult = profit multiple (35, 17, ...). */
export function normaliseBet(b) {
  const amount = Number(b?.amount);
  if (!Number.isSafeInteger(amount) || amount < LIMITS.minBet) throw new Error(`Minimum allocation per position is ¤ ${(LIMITS.minBet / 100).toFixed(2)}.`);
  let kind, nums;
  if (b.outside) {
    if (!OUTSIDE[b.outside]) throw new Error('Unknown position.');
    kind = b.outside; nums = OUTSIDE[b.outside];
  } else {
    const n = (b.numbers || []).map(Number);
    if (!n.length || n.some((x) => !Number.isInteger(x) || x < 0 || x > 36) || new Set(n).size !== n.length) throw new Error('Invalid numbers.');
    const hit = INSIDE.get(key(n));
    if (!hit) throw new Error('Those numbers do not form a valid position.');
    kind = hit.kind; nums = hit.nums;
  }
  return { kind, nums, amount, mult: 36 / nums.length - 1 };
}

/** Total returned (stake + profit) for a pocket. */
export const returnsFor = (bets, pocket) => bets.reduce((s, b) => s + (b.nums.includes(pocket) ? b.amount * (b.mult + 1) : 0), 0);

export function pocketFromSeed(seedHex) {
  const limit = Math.floor(2 ** 32 / 37) * 37; // rejection sampling: no modulo bias
  for (let i = 0; ; i++) {
    const v = createHash('sha256').update(`${seedHex}:${i}`).digest().readUInt32BE(0);
    if (v < limit) return v % 37;
  }
}
const sha = (s) => createHash('sha256').update(s).digest('hex');

export function createRoulette(db, ledger, bus, players) {
  const seedKey = (pid) => `roulette:seed:${pid}`;
  function commitment(pid) {
    let seed = db.kvGet(seedKey(pid));
    if (!seed) { seed = randomBytes(32).toString('hex'); db.kvSet(seedKey(pid), seed); }
    return sha(seed);
  }

  function spin(pid, rawBets) {
    if (!Array.isArray(rawBets) || !rawBets.length) throw Object.assign(new Error('Place at least one position.'), { status: 400 });
    if (rawBets.length > LIMITS.maxBets) throw Object.assign(new Error('Too many positions on one rotation.'), { status: 400 });
    let bets;
    try { bets = rawBets.map(normaliseBet); } catch (e) { throw Object.assign(e, { status: 400 }); }
    const stake = bets.reduce((s, b) => s + b.amount, 0);
    if (stake > LIMITS.maxSpin) throw Object.assign(new Error(`Table limit is ¤ ${(LIMITS.maxSpin / 100).toLocaleString()} per rotation.`), { status: 400 });
    const acct = player(pid);
    if (ledger.balance(acct) < stake) throw Object.assign(new Error('You are currently liquidity-constrained for this allocation.'), { status: 402 });
    // the Treasury must be able to cover the worst outcome before the ball is released
    const worst = Math.max(...range(0, 36).map((p) => returnsFor(bets, p)));
    if (ledger.balance(VAULT) + stake < worst) throw Object.assign(new Error('The Treasury Reserve cannot underwrite this rotation right now.'), { status: 409 });

    const seed = db.kvGet(seedKey(pid)) || randomBytes(32).toString('hex');
    const pocket = pocketFromSeed(seed);
    const returned = returnsFor(bets, pocket);
    const round = db.tx(() => {
      const { lastInsertRowid } = db.run('INSERT INTO roulette_rounds(player_id, result, bets, stake, returned, seed_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        pid, pocket, JSON.stringify(bets.map(({ kind, nums, amount }) => ({ kind, nums, amount }))), stake, returned, sha(seed), Date.now());
      const id = Number(lastInsertRowid);
      ledger.post({ actor: `player:${pid}`, reason: 'ROUND_SETTLED', ref: `roulette:${id}`, idem: `roulette:${id}`,
        transfers: [{ from: acct, to: VAULT, amount: stake }, { from: VAULT, to: acct, amount: returned }] });
      db.kvSet(seedKey(pid), randomBytes(32).toString('hex')); // commit the next seed
      return id;
    });
    const out = {
      round, pocket, color: pocket === 0 ? 'green' : RED.has(pocket) ? 'red' : 'black', stake, returned, net: returned - stake,
      wins: bets.filter((b) => b.nums.includes(pocket)).map((b) => ({ kind: b.kind, nums: b.nums, amount: b.amount, returned: b.amount * (b.mult + 1) })),
      seed, seedHash: sha(seed), nextSeedHash: commitment(pid), balance: ledger.balance(acct),
    };
    bus?.emit('roulette', { round, pocket, color: out.color, net: out.net, stake, name: players.nameOf(pid), at: Date.now() });
    return out;
  }

  const recent = (limit = 24) => db.all('SELECT id, result AS pocket, stake, returned, created_at FROM roulette_rounds ORDER BY id DESC LIMIT ?', limit)
    .map((r) => ({ ...r, color: r.pocket === 0 ? 'green' : RED.has(r.pocket) ? 'red' : 'black' }));
  const stats = () => db.get('SELECT COUNT(*) AS rounds, COALESCE(SUM(stake), 0) AS staked, COALESCE(SUM(returned), 0) AS returned FROM roulette_rounds');

  return { spin, recent, stats, commitment, LIMITS };
}
