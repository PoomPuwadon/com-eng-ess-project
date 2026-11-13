import test from 'node:test';
import assert from 'node:assert/strict';
import { RouletteRoom } from '../rouletteRoom.js';
import { seededRng } from '../roulette.js';

test('phases over 60 s and under 2 s are rejected by setConfig', () => {
  const room = new RouletteRoom();

  // Sum > 60
  assert.throws(() => {
    room.setConfig({
      phases: { open: 40, closed: 5, spinning: 15, result: 10 } // sum = 70
    });
  });

  // Any phase < 2
  assert.throws(() => {
    room.setConfig({
      phases: { open: 35, closed: 1, spinning: 12, result: 8 }
    });
  });

  // Valid config accepts
  const valid = room.setConfig({
    phases: { open: 30, closed: 4, spinning: 10, result: 6 }
  });
  assert.equal(valid.phases.open, 30);
});

test('positions outside OPEN phase are rejected', () => {
  let now = 1000;
  const room = new RouletteRoom(seededRng(1), () => {}, () => {}, () => now);

  // Transition to CLOSED
  now += 36000;
  room.tick();
  assert.equal(room.phase, 'CLOSED');

  const res = room.placePosition(1, 'Alice', { type: 'red', numbers: [], stake: 50, cid: 'c1' });
  assert.equal(res.ok, false);
  assert.match(res.reason, /OPEN phase/);
});

test('no message broadcast before SPINNING contains result', () => {
  let now = 0;
  const broadcastMessages = [];
  const room = new RouletteRoom(
    seededRng(123),
    () => {},
    (msg) => broadcastMessages.push(msg),
    () => now
  );

  // Initial phase is OPEN
  assert.equal(room.phase, 'OPEN');

  // Advance to CLOSED
  now += 36000;
  room.tick();
  assert.equal(room.phase, 'CLOSED');

  for (const m of broadcastMessages) {
    if (m.phase === 'CLOSED' || m.phase === 'OPEN') {
      assert.equal(m.result, undefined, 'Result must NOT be included in OPEN/CLOSED phase broadcasts');
    }
  }

  // Advance to SPINNING
  now += 4000;
  room.tick();
  assert.equal(room.phase, 'SPINNING');

  const spinningMsg = broadcastMessages.find((m) => m.phase === 'SPINNING');
  assert.ok(spinningMsg, 'Must broadcast SPINNING');
  assert.equal(typeof spinningMsg.result, 'number', 'SPINNING must announce result');
});

test('balance never goes negative and deducts stake on placement', () => {
  let now = 0;
  const room = new RouletteRoom(seededRng(1), () => {}, () => {}, () => now);
  assert.equal(room.getBalance('Bob'), 10000);

  // Try to bet more than balance
  const excessive = room.placePosition(2, 'Bob', {
    type: 'straight',
    numbers: [10],
    stake: 15000,
    cid: 'c1'
  });
  // Fails maxPerPosition or balance
  assert.equal(excessive.ok, false);

  // Lower maxPerPosition and set Bob balance to 50
  room.setBalance('Bob', 50);
  const tooMuch = room.placePosition(2, 'Bob', {
    type: 'straight',
    numbers: [10],
    stake: 60,
    cid: 'c2'
  });
  assert.equal(tooMuch.ok, false);
  assert.equal(tooMuch.reason, 'Insufficient balance');
  assert.equal(room.getBalance('Bob'), 50);

  // Valid bet deducts
  const valid = room.placePosition(2, 'Bob', {
    type: 'straight',
    numbers: [10],
    stake: 30,
    cid: 'c3'
  });
  assert.equal(valid.ok, true);
  assert.equal(room.getBalance('Bob'), 20);
});

test('a full round credits the right payout to winning player and updates treasury', () => {
  let now = 0;
  const sent = [];
  // seededRng(42) gives specific known first spin
  const rng = seededRng(42);
  const nextSpin = rng.int(37); // peek what next spin will be

  // Create room with rng that starts before that peek
  const roomRng = seededRng(42);
  const room = new RouletteRoom(
    roomRng,
    (id, msg) => sent.push({ id, msg }),
    () => {},
    () => now
  );

  // Place winning straight on nextSpin
  const p1 = room.placePosition(1, 'Winner', {
    type: 'straight',
    numbers: [nextSpin],
    stake: 100,
    cid: 'w1'
  });
  assert.equal(p1.ok, true);
  assert.equal(room.getBalance('Winner'), 9900); // 10000 - 100

  // Place losing straight on different number
  const loseNum = (nextSpin + 1) % 37;
  const p2 = room.placePosition(2, 'Loser', {
    type: 'straight',
    numbers: [loseNum],
    stake: 100,
    cid: 'l1'
  });
  assert.equal(p2.ok, true);
  assert.equal(room.getBalance('Loser'), 9900);

  // Advance OPEN -> CLOSED
  now += 36000;
  room.tick();
  assert.equal(room.phase, 'CLOSED');

  // Advance CLOSED -> SPINNING
  now += 4000;
  room.tick();
  assert.equal(room.phase, 'SPINNING');
  assert.equal(room.result, nextSpin);

  // Advance SPINNING -> RESULT
  now += 13000;
  room.tick();
  assert.equal(room.phase, 'RESULT');

  // Winner payout: 100 * 36 = 3600. Balance becomes 9900 + 3600 = 13500. Net = +3500.
  assert.equal(room.getBalance('Winner'), 13500);

  // Loser payout: 0. Balance stays 9900. Net = -100.
  assert.equal(room.getBalance('Loser'), 9900);

  // Check rl_result message sent to Winner
  const winnerResult = sent.find((s) => s.id === 1 && s.msg.t === 'rl_result');
  assert.ok(winnerResult);
  assert.equal(winnerResult.msg.net, 3500);
  assert.equal(winnerResult.msg.balance, 13500);

  // Check Treasury: winner net +3500, loser net -100 -> treasury net change = -(3500 - 100) = -3400
  assert.equal(room.treasury, -3400);
});
