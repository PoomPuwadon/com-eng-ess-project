// Leisure Suite games: real engines (house-edge checks) and ledger settlement (conservation, vault, escrow).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { createApp } from '../app.js';
import { REEL, slotPay, baccaratDeal, baccaratReturn, crapsRound, hv, isBJ, bjReturn, shoe, dealerPlay, LIMITS } from '../games/leisure.js';
import { VAULT, player } from '../ledger.js';

const quiet = { log() {}, warn() {}, error() {} };
const mkApp = () => createApp({ dbFile: ':memory:', startingBalance: 1_000_000, offline: true, llmEnabled: false, anthropicKey: '', geminiKey: '', finnhubKey: '', modelTick: 'claude-haiku-5-5', llmMonthlyCapUsd: 75, lotteryBackfillFrom: '2020-01-01' }, quiet);
const sum = (a) => a.reduce((x, y) => x + y, 0);

test('slots: exhaustive RTP is 94-96 % (house edge 4-6 %)', () => {
  const syms = Object.keys(REEL), T = sum(Object.values(REEL));
  let rtp = 0;
  for (const a of syms) for (const b of syms) for (const c of syms) rtp += (REEL[a] / T) * (REEL[b] / T) * (REEL[c] / T) * slotPay(a, b, c);
  assert.ok(rtp > 0.94 && rtp < 0.96, `rtp ${rtp}`);
});

test('baccarat: banker -1.06 %, player -1.24 % (simulation), never invents a hand', () => {
  const N = 300_000; let b = 0, p = 0; const rnd = randomInt;
  for (let i = 0; i < N; i++) {
    const d = baccaratDeal(shoe(8, rnd).slice(0, 12)); // a few cards are all a round needs
    b += baccaratReturn('banker', d.winner, 100) - 100; p += baccaratReturn('player', d.winner, 100) - 100;
    assert.ok(d.player.length >= 2 && d.player.length <= 3 && d.banker.length >= 2 && d.banker.length <= 3);
  }
  assert.ok(Math.abs(b / (N * 100) + 0.0106) < 0.012, `banker ${b / (N * 100)}`);
  assert.ok(Math.abs(p / (N * 100) + 0.0124) < 0.012, `player ${p / (N * 100)}`);
});

test('craps: pass line ~ -1.41 %, don\'t pass ~ -1.36 % (simulation)', () => {
  const N = 300_000; let pass = 0, dont = 0;
  for (let i = 0; i < N; i++) {
    const a = crapsRound('pass'), r = crapsRound('dont');
    pass += a.result === 'win' ? 100 : -100; dont += r.result === 'win' ? 100 : r.result === 'push' ? 0 : -100;
  }
  assert.ok(Math.abs(pass / (N * 100) + 0.0141) < 0.012, `pass ${pass / (N * 100)}`);
  assert.ok(Math.abs(dont / (N * 100) + 0.0136) < 0.012, `dont ${dont / (N * 100)}`);
});

test('blackjack rules: totals, blackjack 3:2, push, double, dealer stands on 17', () => {
  const c = (r) => ({ r, u: '♠' });
  assert.equal(hv([c('A'), c('K')]), 21); assert.equal(hv([c('A'), c('A'), c('9')]), 21); assert.equal(hv([c('K'), c('Q'), c('5')]), 25);
  assert.equal(bjReturn([c('A'), c('K')], [c('10'), c('7')], 100, false), 250, 'blackjack pays 3:2');
  assert.equal(bjReturn([c('A'), c('K')], [c('A'), c('Q')], 100, false), 100, 'both blackjack: push');
  assert.equal(bjReturn([c('10'), c('9')], [c('10'), c('9')], 100, false), 100);
  assert.equal(bjReturn([c('10'), c('9')], [c('10'), c('K'), c('5')], 100, false), 200);
  assert.equal(bjReturn([c('10'), c('K'), c('5')], [c('10'), c('7')], 100, false), 0, 'bust loses');
  assert.equal(bjReturn([c('5'), c('6'), c('K')], [c('10'), c('8')], 200, true), 400, 'doubled win returns both stakes plus winnings');
  const d = dealerPlay([c('6'), c('A')], [c('5'), c('K'), c('9')]); assert.ok(hv(d) >= 17);
  assert.equal(isBJ([c('A'), c('K'), c('Q')]), false);
});

test('ledger: every game settles against the vault, conservation holds, blackjack escrow always returns to zero', () => {
  const app = mkApp(), L = app.leisure, { player: p } = app.players.create(), acct = player(p.id), start = app.ledger.balance(acct), vault0 = app.ledger.balance(VAULT);
  const total = () => app.ledger.balance(acct) + app.ledger.balance(VAULT);
  for (let i = 0; i < 40; i++) { L.slots(p.id, 100); L.baccarat(p.id, ['player', 'banker', 'tie'][i % 3], 100); L.craps(p.id, i % 2 ? 'pass' : 'dont', 100); }
  assert.equal(total(), start + vault0, 'player + vault is conserved by one-shot games');
  for (let i = 0; i < 40; i++) {
    let r = L.bjDeal(p.id, 200);
    if (!r.done) { if (i % 3 === 0) r = L.bjAct(p.id, 'double'); else { while (!r.done && r.pv < 17) r = L.bjAct(p.id, 'hit'); if (!r.done) r = L.bjAct(p.id, 'stand'); } }
    assert.ok(r.done && Number.isInteger(r.net));
  }
  assert.equal(total(), start + vault0, 'blackjack settles back to the same total');
  assert.equal(L.bjState(p.id), null);
  assert.ok(app.ledger.reconcile().ok, JSON.stringify(app.ledger.reconcile().problems));
  const escrows = app.db.all("SELECT account_id, balance FROM balances WHERE account_id LIKE 'ESCROW:BET:bj%' AND balance != 0");
  assert.equal(escrows.length, 0, 'no stake left in escrow');
});

test('limits and guards: bad stakes, no double-up after hitting, no second hand, liquidity', () => {
  const app = mkApp(), L = app.leisure, { player: p } = app.players.create();
  assert.throws(() => L.slots(p.id, 50), /between/); assert.throws(() => L.slots(p.id, LIMITS.max + 1), /between/); assert.throws(() => L.baccarat(p.id, 'nobody', 100), /Choose/);

  let r = L.bjDeal(p.id, 100);
  if (!r.done) { assert.throws(() => L.bjDeal(p.id, 100), /current hand/); r = L.bjAct(p.id, 'hit'); if (!r.done) assert.throws(() => L.bjAct(p.id, 'double'), /first two/); app.leisure.sweep(); }
});
