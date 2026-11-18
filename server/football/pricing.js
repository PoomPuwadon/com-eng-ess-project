// House pricing for football fixtures (the football-data.org free tier carries no bookmaker odds).
// A Poisson goals model: each side's expected goals from league attack/defence rates (standings:
// goals for/against per game, relative to the league average), times a home advantage. Prices are
// labelled "house pricing" everywhere and carry the house margin (leisure-rules: institutional advantage).
import { priceFromProb } from '../realtime/pricing.js';

const HOME_ADV = 1.12, BASE_HOME = 1.5, BASE_AWAY = 1.2, MAXG = 10;
const fact = (n) => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };
const pois = (k, l) => (Math.exp(-l) * l ** k) / fact(k);

/** team rates from a standings row { playedGames, goalsFor, goalsAgainst } relative to the league */
export function expectedGoals(home, away, league) {
  if (!home || !away || !league || !home.playedGames || !away.playedGames) return { lh: BASE_HOME, la: BASE_AWAY, model: 'baseline' };
  const avg = league.avgGoals / 2 || 1.35;
  const att = (r) => (r.goalsFor / r.playedGames) / avg, def = (r) => (r.goalsAgainst / r.playedGames) / avg;
  const shrink = (x, n) => (x * n + 1 * 4) / (n + 4); // early-season rows lean to the average
  const lh = avg * HOME_ADV * shrink(att(home), home.playedGames) * shrink(def(away), away.playedGames);
  const la = (avg / HOME_ADV) * shrink(att(away), away.playedGames) * shrink(def(home), home.playedGames);
  return { lh: Math.min(4, Math.max(0.3, lh)), la: Math.min(4, Math.max(0.2, la)), model: 'standings' };
}

/** fair probabilities for 1X2, over/under 2.5 and both-teams-to-score */
export function probabilities({ lh, la }) {
  let H = 0, D = 0, A = 0, over = 0, btts = 0;
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
    const p = pois(i, lh) * pois(j, la);
    if (i > j) H += p; else if (i === j) D += p; else A += p;
    if (i + j > 2.5) over += p;
    if (i > 0 && j > 0) btts += p;
  }
  const t = H + D + A;
  return { H: H / t, D: D / t, A: A / t, O25: over / t, U25: 1 - over / t, BTTS_Y: btts / t, BTTS_N: 1 - btts / t };
}

export const MARKETS = {
  '1X2': { label: 'Match result', picks: { H: 'Home', D: 'Draw', A: 'Away' } },
  OU25: { label: 'Total goals 2.5', picks: { O25: 'Over 2.5', U25: 'Under 2.5' } },
  BTTS: { label: 'Both teams score', picks: { BTTS_Y: 'Yes', BTTS_N: 'No' } },
};

export function priceFixture(xg) {
  const p = probabilities(xg);
  const out = {};
  for (const [m, def] of Object.entries(MARKETS)) out[m] = Object.fromEntries(Object.keys(def.picks).map((k) => [k, priceFromProb(p[k])]));
  return { prices: out, probs: p, xg };
}

/** settle a pick on the full-time score (90 min + stoppage: regularTime when the match went further) */
export function pickWins(pick, h, a) {
  switch (pick) {
    case 'H': return h > a; case 'D': return h === a; case 'A': return h < a;
    case 'O25': return h + a > 2.5; case 'U25': return h + a < 2.5;
    case 'BTTS_Y': return h > 0 && a > 0; case 'BTTS_N': return h === 0 || a === 0;
    default: return false;
  }
}
