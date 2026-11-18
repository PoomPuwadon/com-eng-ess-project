// Pricing and payout maths for the live arena events (leisure-rules / money-ledger skills).
// All prices are decimal multipliers (stake x price is returned on a realised gain, stake included).
// Payouts are integer minor units rounded DOWN; the rounding remainder stays with the vault.

export const MARGIN = 0.06; // institutional advantage on live arena pricing
export const MIN_PRICE = 1.05, MAX_PRICE = 50;
const clamp = (v) => Math.min(MAX_PRICE, Math.max(MIN_PRICE, v));
const round2 = (v) => Math.floor(v * 100) / 100; // quote prices down to 2 dp (never in the player's favour)

/** price from an implied probability, with the house margin */
export const priceFromProb = (p) => (p <= 0 ? MAX_PRICE : round2(clamp((1 - MARGIN) / p)));

/**
 * Combat Sports Pavilion: the implied chance of each boxer is their share of the remaining health of
 * everyone still standing. Equal at the bell (2 boxers -> 1.88 each); a low-health boxer pays far more.
 * healths: number[] (0 = knocked out, cannot be backed -> null).
 */
export function fightPrices(healths) {
  const alive = healths.map((h) => Math.max(0, h));
  const total = alive.reduce((a, b) => a + b, 0);
  return alive.map((h) => (h <= 0 || total <= 0 ? null : priceFromProb(h / total)));
}

/**
 * Equine Performance Centre: implied chance grows with track position (cubed, plus a head start so
 * everyone is equal at the gate). Trailing horses pay more if they come through and take the line.
 */
export const RACE_HEAD = 40;
export function racePrices(dists) {
  const w = dists.map((d) => (Math.max(0, d) + RACE_HEAD) ** 3);
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((x) => priceFromProb(x / total));
}

/** returned amount for a realised gain (stake included), minor units, rounded down */
export const payoutFor = (stake, price) => Math.floor(stake * price);

/**
 * Click-speed horse: taps per second -> metres per second (capped so auto-clickers gain nothing past 14 tps).
 * Tuned (user, 2026-11-18: "far too quick") so one 272 m lap takes a fast clicker 25-40 s:
 * 10 tps -> 7.8 m/s (~35 s), 12 tps -> 9.2 m/s (~30 s), the 14 tps cap -> 10.6 m/s (~26 s); idle 0.8 m/s.
 */
export const MAX_TPS = 14;
export const speedFromTps = (tps) => 0.8 + 0.7 * Math.min(MAX_TPS, Math.max(0, tps));
