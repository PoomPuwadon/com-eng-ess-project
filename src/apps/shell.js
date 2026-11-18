// App shell: one full-screen overlay hosting the in-world applications, and the wallet bar.
// While an app is open the game ignores movement keys and the mouse is released.
import './apps.css';
import { onMe, fmt, online, startSession, esc, savedAccount } from '../net/api.js';

const APPS = new Map(); // id -> { title, sub, mount(body, ctx) -> { unmount?, tabs? } }
let current = null;
const root = document.createElement('div');
root.id = 'app';
root.innerHTML = '<div class="frame"><header><div><h2></h2><div class="sub"></div></div><div class="sp"></div><button class="close">Close · Esc</button></header><div class="tabs" hidden></div><div class="body"></div><div class="notice">All balances are notional. No real currency is accepted, held or paid out.</div></div>';
document.body.appendChild(root);
const $ = (s) => root.querySelector(s);
$('.close').onclick = () => closeApp();
root.addEventListener('mousedown', (e) => { if (e.target === root) closeApp(); });

export function registerApp(id, def) { APPS.set(id, def); }
export const appOpen = () => Boolean(current);
export const currentApp = () => current?.id || null;

export function openApp(id, opts = {}) {
  const def = APPS.get(id);
  if (!def) return;
  if (current) closeApp();
  document.exitPointerLock?.();
  $('h2').textContent = def.title;
  $('.sub').textContent = def.sub || '';
  const body = $('.body');
  body.innerHTML = '';
  body.scrollTop = 0;
  const tabsEl = $('.tabs');
  tabsEl.hidden = true; tabsEl.innerHTML = '';
  const ctx = {
    setSub: (t) => { $('.sub').textContent = t; },
    /** tabs: [{ id, label }], onTab(id) */
    tabs(list, onTab, initial) {
      tabsEl.hidden = false;
      tabsEl.innerHTML = list.map((t) => `<button data-tab="${t.id}">${esc(t.label)}</button>`).join('');
      const select = (tid) => { for (const b of tabsEl.children) b.classList.toggle('on', b.dataset.tab === tid); body.scrollTop = 0; onTab(tid); };
      tabsEl.onclick = (e) => { const t = e.target.closest('button')?.dataset.tab; if (t) select(t); };
      select(initial || list[0].id);
      return select;
    },
    opts,
  };
  const inst = def.mount(body, ctx) || {};
  current = { id, inst };
  root.classList.add('on');
  document.body.classList.add('app-open');
}

export function closeApp() {
  if (!current) return;
  try { current.inst.unmount?.(); } catch (e) { console.error(e); }
  current = null;
  root.classList.remove('on');
  document.body.classList.remove('app-open');
  $('.body').innerHTML = '';
}

addEventListener('keydown', (e) => {
  if (!current) return;
  if (e.code === 'Escape') { e.preventDefault(); closeApp(); }
}, true);

// ---------------------------------------------------------------- wallet bar
// Liquidity + your name only (user, 2026-11-18): no app buttons on the bar. The applications are reached
// in the building (E at a roulette table, M markets, L research); signing in is on the welcome screen,
// and clicking your name switches account / signs in.
export function buildWallet({ onOpen }) {
  const w = document.createElement('div');
  w.id = 'wallet';
  w.innerHTML = `<span class="dot" title="Server connection"></span>
    <div class="who"><small>Liquidity</small><span class="bal">—</span></div>
    <div class="who acct" role="button" tabindex="0" data-app="signin" title="Sign in, sign up or switch account"><small>Associate <i>· switch</i></small><span class="nm">connecting…</span></div>`;
  document.body.appendChild(w);
  const act = (e) => { const a = e.target.closest('[data-app]')?.dataset.app; if (a) { e.stopPropagation(); onOpen(a); } };
  w.addEventListener('click', act);
  w.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
  let last = null;
  onMe((me) => {
    const bal = w.querySelector('.bal');
    bal.textContent = fmt(me.balance);
    if (last != null && me.balance !== last) { bal.classList.remove('flash-up', 'flash-down'); void bal.offsetWidth; bal.classList.add(me.balance > last ? 'flash-up' : 'flash-down'); }
    last = me.balance;
    w.querySelector('.nm').textContent = me.name;
    w.querySelector('.dot').classList.add('on');
    // guests are invited to sign in / up; account holders can switch accounts
    const acct = savedAccount() === me.name, el = w.querySelector('.acct');
    el.querySelector('i').textContent = acct ? '· switch' : '· sign in';
    el.title = acct ? `Signed in as ${me.name}. Click to sign in to another account, or open a new one.` : 'Guest session. Click to sign in, or sign up for an account.';
  });
  startSession().catch(() => { w.querySelector('.nm').textContent = 'server offline — retrying'; });
  void online;
  return w;
}
