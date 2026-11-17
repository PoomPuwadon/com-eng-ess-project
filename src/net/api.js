// Client side of the game server: guest session, JSON API, live event stream.
// The client never computes balances or outcomes — it shows what the server says.

const TOKEN_KEY = 'firm.session.v1';
let token = null;
let me = null;
const meListeners = new Set();
const handlers = new Map();
let es = null;
export let online = false;

const store = {
  // this tab's identity first (two tabs can be two different people), then the browser's last one
  get() { try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(v) { try { sessionStorage.setItem(TOKEN_KEY, v); localStorage.setItem(TOKEN_KEY, v); } catch { /* private mode: session lasts this tab */ } },
};

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

export async function startSession() {
  try {
    const out = await api('/api/session', { method: 'POST', body: { token: store.get() } });
    token = out.token; store.set(token);
    setMe(out.player);
    online = true;
    connectStream();
    return me;
  } catch (e) {
    online = false;
    setTimeout(startSession, 5000); // server not up yet (dev): keep trying quietly
    throw e;
  }
}

export function setMe(p) { if (!p) return; me = { ...(me || {}), ...p }; for (const fn of meListeners) fn(me); }
export const getMe = () => me;
export function onMe(fn) { meListeners.add(fn); if (me) fn(me); return () => meListeners.delete(fn); }
export async function refreshMe() { try { setMe((await api('/api/me')).player); } catch { /* offline */ } }
export const setBalance = (balance) => { if (me && Number.isFinite(balance)) setMe({ balance }); };

/** Subscribe to a server event (quotes, trade, order, firm, roulette, lottery, trip). */
export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  if (es) es.addEventListener(event, wrap(event));
  return () => handlers.get(event).delete(fn);
}
const wrapped = new Map();
function wrap(event) {
  if (!wrapped.has(event)) wrapped.set(event, (e) => { let d; try { d = JSON.parse(e.data); } catch { return; } for (const fn of handlers.get(event) || []) fn(d); });
  return wrapped.get(event);
}
function connectStream() {
  if (es) return;
  es = new EventSource('/api/stream');
  for (const ev of handlers.keys()) es.addEventListener(ev, wrap(ev));
  es.onerror = () => { /* EventSource reconnects by itself */ };
}

// ---------------------------------------------------------------- formatting (voice-and-satire: "¤" notional units)
export const fmt = (minor, { sign = false, dp = 2 } = {}) => {
  const v = (minor ?? 0) / 100;
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return `${v < 0 ? '−' : sign && v > 0 ? '+' : ''}¤${s}`;
};
export const pct = (x, dp = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(dp)}%`;
export const px = (p) => (p == null ? '—' : p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const ago = (ms) => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  return s < 60 ? `${Math.round(s)} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- name + password sign-in
export const getToken = () => token;
const ACCOUNT_KEY = 'firm.account.v1';
export const savedAccount = () => { try { return localStorage.getItem(ACCOUNT_KEY); } catch { return null; } };
/** mode: 'enter' (sign in, or open an account if the name is new) | 'login' | 'register' */
export async function signIn(name, password, mode = 'enter') {
  const out = await api(`/api/auth/${mode}`, { method: 'POST', body: { name, password } });
  token = out.token; store.set(token);
  try { localStorage.setItem(ACCOUNT_KEY, out.player.name); } catch { /* private mode */ }
  me = null; setMe(out.player);
  online = true;
  connectStream();
  for (const fn of sessionListeners) fn(out);
  return out;
}
const sessionListeners = new Set();
/** called after a successful sign-in (the realtime link reconnects with the new identity) */
export const onSignIn = (fn) => { sessionListeners.add(fn); return () => sessionListeners.delete(fn); };
