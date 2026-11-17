// Time-zone helpers (no dependency): US market hours (America/New_York) and Bangkok dates.

const partsCache = new Map();
function fmtFor(tz) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
    partsCache.set(tz, f);
  }
  return f;
}
/** Wall-clock parts of a UTC instant in a zone. */
export function zoned(ms, tz) {
  const o = {};
  for (const p of fmtFor(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second, wd: o.weekday, date: `${o.year}-${o.month}-${o.day}` };
}
/** UTC ms for a wall-clock time in a zone. */
export function fromZoned(y, m, d, h, mi, tz) {
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 3; i++) {
    const z = zoned(guess, tz);
    const asUtc = Date.UTC(z.y, z.m - 1, z.d, z.h, z.mi);
    guess -= asUtc - Date.UTC(y, m - 1, d, h, mi);
  }
  return guess;
}
export const addDays = (date, n) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

// ---------------------------------------------------------------- NYSE calendar (static, per free-data-sources skill)
const NY = 'America/New_York';
const HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
  '2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19', '2028-07-04', '2028-09-04', '2028-11-23', '2028-12-25',
]);
const EARLY_CLOSE = new Set(['2026-11-27', '2026-12-24', '2027-11-26', '2028-07-03', '2028-11-24']);

export const isTradingDay = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd !== 0 && wd !== 6 && !HOLIDAYS.has(date);
};
const sessionOf = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return { open: fromZoned(y, m, d, 9, 30, NY), close: fromZoned(y, m, d, EARLY_CLOSE.has(date) ? 13 : 16, 0, NY) };
};

/** { open, label, nextOpen, lastClose, session } for the US equity market at `now`. */
export function marketStatus(now = Date.now()) {
  const today = zoned(now, NY).date;
  if (isTradingDay(today)) {
    const s = sessionOf(today);
    if (now >= s.open && now < s.close) return { open: true, label: 'Market open', session: s, nextOpen: null, closesAt: s.close };
  }
  let d = today, nextOpen = null;
  for (let i = 0; i < 10; i++) {
    if (isTradingDay(d)) { const s = sessionOf(d); if (s.open > now) { nextOpen = s.open; break; } }
    d = addDays(d, 1);
  }
  let p = today, lastClose = null;
  for (let i = 0; i < 10; i++) {
    if (isTradingDay(p)) { const s = sessionOf(p); if (s.close <= now) { lastClose = s.close; break; } }
    p = addDays(p, -1);
  }
  return { open: false, label: 'Market closed', nextOpen, lastClose };
}

// ---------------------------------------------------------------- Bangkok (Thai lottery)
export const BKK = 'Asia/Bangkok';
export const bkkDate = (ms = Date.now()) => zoned(ms, BKK).date;
export const bkkTime = (ms = Date.now()) => { const z = zoned(ms, BKK); return z.h * 60 + z.mi; };
export const dayKey = (ms = Date.now()) => bkkDate(ms); // agent daily counters reset 00:00 Asia/Bangkok
