// Feeds real server data into the 3D world's screens: the trading-floor walls, the building-wide
// ticker, the firm P&L boards and the Probability Research Institute heat-map. Pulled on a slow
// schedule and on server events — screens redraw only when data changes, never per frame.
import { api, on } from './net/api.js';
import { setTradingData } from './world/tradingScreens.js';
import { setLiveFeed } from './world/screens.js';
import { setLottoRoom } from './world/lottoFeed.js';
import { setLobbyFeed } from './world/lobbyScreens.js';

let quotes = null, wall = null, firm = null;
const push = () => {
  if (quotes) setLiveFeed({ quotes: quotes.quotes, source: quotes.source });
  if (firm) setLiveFeed({ firm: firm.book, nav: firm.navHistory.map((p) => p.nav) });
  if (quotes) setTradingData({ quotes: quotes.quotes, wall: wall?.symbols, book: firm?.book });
};
async function loadQuotes() { try { quotes = await api('/api/market/quotes'); push(); } catch { /* server down */ } }
async function loadWall() { try { wall = await api('/api/market/wall'); push(); } catch { /* server down */ } }
async function loadFirm() { try { firm = await api('/api/firm/book'); push(); } catch { /* server down */ } }
async function loadDepts() { try { setLobbyFeed({ depts: await api('/api/firm/departments') }); } catch { /* server down */ } }
async function loadLotto() {
  try {
    const s = await api('/api/lottery/state');
    setLottoRoom(s);
    const feat = s.run?.stages.find((x) => x.id === 'features');
    if (feat) setLiveFeed({ lotto: { grid: feat.data.last2Grid, next: s.calendar.next, picks: s.run.picks.last2.slice(0, 5).map((x) => x.v), draws: s.draws } });
  } catch { /* server down */ }
}

let started = false;
export function startLiveData() {
  if (started) return;
  started = true;
  loadQuotes(); loadWall(); loadFirm(); loadLotto(); loadDepts();
  on('trade', () => setTimeout(loadDepts, 1500));
  setInterval(loadDepts, 60_000);
  let pend = 0;
  on('quotes', (s) => { quotes = s; clearTimeout(pend); pend = setTimeout(push, 500); });
  on('trade', () => { clearTimeout(pend); pend = setTimeout(loadFirm, 800); });
  on('firm', () => loadFirm());
  let lp = 0;
  on('lottery', () => { clearTimeout(lp); lp = setTimeout(loadLotto, 600); }); // runs, decisions, sales, new official draws, settlements
  setInterval(loadWall, 120_000);
  setInterval(loadFirm, 60_000);
  setInterval(loadLotto, 300_000);
}
