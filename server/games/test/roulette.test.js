import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WHEEL,
  RED,
  BLACK,
  MULT,
  cryptoRng,
  seededRng,
  spin,
  validatePosition,
  settle
} from '../roulette.js';

test('WHEEL has 37 unique numbers from 0 to 36', () => {
  assert.equal(WHEEL.length, 37);
  const set = new Set(WHEEL);
  assert.equal(set.size, 37);
  for (let i = 0; i <= 36; i++) {
    assert.ok(set.has(i), `Wheel missing ${i}`);
  }
});

test('RED has 18 numbers and does not contain 0', () => {
  const redSize = RED.size ?? RED.length;
  assert.equal(redSize, 18);
  assert.equal(RED.has(0), false);
  const blackSize = BLACK.size ?? BLACK.length;
  assert.equal(blackSize, 18);
  assert.equal(BLACK.has(0), false);
  for (const n of RED) {
    assert.equal(BLACK.has(n), false);
  }
});

test('seededRng(42) gives deterministic repeatable sequence', () => {
  const rng1 = seededRng(42);
  const rng2 = seededRng(42);
  const seq1 = Array.from({ length: 100 }, () => rng1.int(37));
  const seq2 = Array.from({ length: 100 }, () => rng2.int(37));
  assert.deepEqual(seq1, seq2);
});

test('every position type wins and loses correctly', () => {
  const cases = [
    { pos: { type: 'straight', numbers: [17], stake: 10 }, winResult: 17, loseResult: 18, winPayout: 360 },
    { pos: { type: 'split', numbers: [1, 2], stake: 10 }, winResult: 2, loseResult: 3, winPayout: 180 },
    { pos: { type: 'street', numbers: [1, 2, 3], stake: 10 }, winResult: 3, loseResult: 4, winPayout: 120 },
    { pos: { type: 'street', numbers: [0, 1, 2], stake: 10 }, winResult: 0, loseResult: 3, winPayout: 120 },
    { pos: { type: 'corner', numbers: [1, 2, 4, 5], stake: 10 }, winResult: 5, loseResult: 3, winPayout: 90 },
    { pos: { type: 'sixline', numbers: [1, 2, 3, 4, 5, 6], stake: 10 }, winResult: 6, loseResult: 7, winPayout: 60 },
    { pos: { type: 'dozen', numbers: [1], stake: 10 }, winResult: 12, loseResult: 13, winPayout: 30 },
    { pos: { type: 'column', numbers: [1], stake: 10 }, winResult: 4, loseResult: 5, winPayout: 30 },
    { pos: { type: 'red', numbers: [], stake: 10 }, winResult: 1, loseResult: 2, winPayout: 20 },
    { pos: { type: 'black', numbers: [], stake: 10 }, winResult: 2, loseResult: 1, winPayout: 20 },
    { pos: { type: 'odd', numbers: [], stake: 10 }, winResult: 3, loseResult: 4, winPayout: 20 },
    { pos: { type: 'even', numbers: [], stake: 10 }, winResult: 4, loseResult: 3, winPayout: 20 },
    { pos: { type: 'low', numbers: [], stake: 10 }, winResult: 18, loseResult: 19, winPayout: 20 },
    { pos: { type: 'high', numbers: [], stake: 10 }, winResult: 19, loseResult: 18, winPayout: 20 }
  ];

  for (const c of cases) {
    const [winSettled] = settle([c.pos], c.winResult);
    assert.equal(winSettled.payout, c.winPayout, `${c.pos.type} should win ${c.winPayout}`);

    const [loseSettled] = settle([c.pos], c.loseResult);
    assert.equal(loseSettled.payout, 0, `${c.pos.type} should lose with 0 payout`);
  }
});

test('0 loses every outside position', () => {
  const outsidePositions = [
    { type: 'dozen', numbers: [1], stake: 100 },
    { type: 'dozen', numbers: [2], stake: 100 },
    { type: 'dozen', numbers: [3], stake: 100 },
    { type: 'column', numbers: [1], stake: 100 },
    { type: 'column', numbers: [2], stake: 100 },
    { type: 'column', numbers: [3], stake: 100 },
    { type: 'red', numbers: [], stake: 100 },
    { type: 'black', numbers: [], stake: 100 },
    { type: 'odd', numbers: [], stake: 100 },
    { type: 'even', numbers: [], stake: 100 },
    { type: 'low', numbers: [], stake: 100 },
    { type: 'high', numbers: [], stake: 100 }
  ];

  const settled = settle(outsidePositions, 0);
  for (const s of settled) {
    assert.equal(s.payout, 0, `0 must lose ${s.type}`);
  }
});

test('invalid splits, corners and streets throw', () => {
  // Invalid split: diagonal or far apart
  assert.throws(() => validatePosition({ type: 'split', numbers: [1, 5], stake: 10 }));
  assert.throws(() => validatePosition({ type: 'split', numbers: [1, 3], stake: 10 }));
  assert.throws(() => validatePosition({ type: 'split', numbers: [0, 4], stake: 10 }));

  // Invalid corner: not 2x2
  assert.throws(() => validatePosition({ type: 'corner', numbers: [1, 2, 3, 4], stake: 10 }));
  assert.throws(() => validatePosition({ type: 'corner', numbers: [1, 2, 4, 6], stake: 10 }));
  assert.throws(() => validatePosition({ type: 'corner', numbers: [3, 4, 6, 7], stake: 10 }));

  // Invalid street: not full row
  assert.throws(() => validatePosition({ type: 'street', numbers: [2, 3, 4], stake: 10 }));
  assert.throws(() => validatePosition({ type: 'street', numbers: [0, 3, 4], stake: 10 }));
});

test('simulation of 2,000,000 spins for straight, red and dozen matches house edge within 4 SE', () => {
  const N = 2_000_000;
  const rng = seededRng(1337);

  const straightPos = validatePosition({ type: 'straight', numbers: [7], stake: 1 });
  const redPos = validatePosition({ type: 'red', numbers: [], stake: 1 });
  const dozenPos = validatePosition({ type: 'dozen', numbers: [1], stake: 1 });

  let sumStraight = 0;
  let sumSqStraight = 0;

  let sumRed = 0;
  let sumSqRed = 0;

  let sumDozen = 0;
  let sumSqDozen = 0;

  for (let i = 0; i < N; i++) {
    const outcome = spin(rng);

    // Straight (number 7)
    const payStraight = outcome === 7 ? 36 : 0;
    sumStraight += payStraight;
    sumSqStraight += payStraight * payStraight;

    // Red
    const payRed = RED.has(outcome) ? 2 : 0;
    sumRed += payRed;
    sumSqRed += payRed * payRed;

    // Dozen (1-12)
    const payDozen = outcome >= 1 && outcome <= 12 ? 3 : 0;
    sumDozen += payDozen;
    sumSqDozen += payDozen * payDozen;
  }

  const expectedEdge = 1 / 37;

  function checkEdge(name, sum, sumSq) {
    const meanReturn = sum / N;
    const measuredEdge = 1 - meanReturn;
    const sampleVar = (sumSq - (sum * sum) / N) / (N - 1);
    const se = Math.sqrt(sampleVar / N);
    const diff = Math.abs(measuredEdge - expectedEdge);

    console.log(
      `  [${name}] measured edge: ${(measuredEdge * 100).toFixed(4)}%, ` +
        `expected: ${(expectedEdge * 100).toFixed(4)}%, 4*SE: ${(4 * se * 100).toFixed(4)}%`
    );

    assert.ok(
      diff <= 4 * se,
      `${name} edge ${measuredEdge} differs from expected ${expectedEdge} by ${diff} > 4*SE (${4 * se})`
    );
  }

  checkEdge('Straight', sumStraight, sumSqStraight);
  checkEdge('Red', sumRed, sumSqRed);
  checkEdge('Dozen', sumDozen, sumSqDozen);
});
