export const WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

export const RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);
// Helper property in case length is checked
RED.length = 18;

export const BLACK = new Set(
  Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => !RED.has(n))
);
BLACK.length = 18;

export const MULT = {
  straight: 35,
  split: 17,
  street: 11,
  corner: 8,
  sixline: 5,
  dozen: 2,
  column: 2,
  red: 1,
  black: 1,
  odd: 1,
  even: 1,
  low: 1,
  high: 1
};

export const cryptoRng = {
  int: (n) => crypto.randomInt(n)
};

export function seededRng(seed = 0) {
  let s = (Math.floor(Number(seed)) >>> 0) || 1;
  return {
    int: (n) => {
      // Mulberry32
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return Math.floor(r * n);
    }
  };
}

export function spin(rng = cryptoRng) {
  return rng.int(37);
}

function rowOf(n) {
  return Math.ceil(n / 3);
}

function colOf(n) {
  return ((n - 1) % 3) + 1;
}

export function validatePosition(pos) {
  if (!pos || typeof pos !== 'object') {
    throw new Error('Position must be an object');
  }
  const { type, stake } = pos;
  let { numbers } = pos;

  if (typeof type !== 'string' || !(type in MULT)) {
    throw new Error(`Invalid position type: ${type}`);
  }

  const nStake = Math.floor(Number(stake));
  if (!Number.isInteger(nStake) || nStake <= 0) {
    throw new Error(`Invalid stake amount: ${stake}`);
  }

  let normNumbers = [];

  switch (type) {
    case 'straight': {
      const n = Array.isArray(numbers) ? numbers[0] : numbers;
      const num = Number(n);
      if (!Number.isInteger(num) || num < 0 || num > 36) {
        throw new Error(`Straight position requires a number 0-36, got ${n}`);
      }
      normNumbers = [num];
      break;
    }

    case 'split': {
      if (!Array.isArray(numbers) || numbers.length !== 2) {
        throw new Error('Split position requires exactly 2 numbers');
      }
      const [a, b] = [...numbers].map(Number).sort((x, y) => x - y);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b > 36 || a === b) {
        throw new Error(`Invalid numbers for split: [${numbers}]`);
      }
      if (a === 0) {
        if (b !== 1 && b !== 2 && b !== 3) {
          throw new Error(`0 can only split with 1, 2 or 3, got [${a}, ${b}]`);
        }
      } else {
        const ra = rowOf(a), ca = colOf(a);
        const rb = rowOf(b), cb = colOf(b);
        const sameRowAdjCol = ra === rb && Math.abs(ca - cb) === 1;
        const sameColAdjRow = ca === cb && Math.abs(ra - rb) === 1;
        if (!sameRowAdjCol && !sameColAdjRow) {
          throw new Error(`Numbers [${a}, ${b}] are not adjacent on roulette layout`);
        }
      }
      normNumbers = [a, b];
      break;
    }

    case 'street': {
      if (!Array.isArray(numbers) || numbers.length !== 3) {
        throw new Error('Street position requires exactly 3 numbers');
      }
      const sorted = [...numbers].map(Number).sort((x, y) => x - y);
      const [a, b, c] = sorted;
      const isZeroStreet1 = a === 0 && b === 1 && c === 2;
      const isZeroStreet2 = a === 0 && b === 2 && c === 3;
      if (isZeroStreet1 || isZeroStreet2) {
        normNumbers = sorted;
        break;
      }
      if (a < 1 || c > 36) {
        throw new Error(`Invalid street numbers: [${numbers}]`);
      }
      const r = rowOf(a);
      if (rowOf(b) !== r || rowOf(c) !== r || b !== a + 1 || c !== a + 2 || colOf(a) !== 1) {
        throw new Error(`Numbers [${numbers}] do not form a valid street row`);
      }
      normNumbers = sorted;
      break;
    }

    case 'corner': {
      if (!Array.isArray(numbers) || numbers.length !== 4) {
        throw new Error('Corner position requires exactly 4 numbers');
      }
      const sorted = [...numbers].map(Number).sort((x, y) => x - y);
      const [a, b, c, d] = sorted;
      if (a < 1 || d > 36) {
        throw new Error(`Invalid corner numbers: [${numbers}]`);
      }
      const colA = colOf(a);
      const rowA = rowOf(a);
      if (colA === 3 || rowA === 12) {
        throw new Error(`Cannot form a corner starting at ${a}`);
      }
      if (b !== a + 1 || c !== a + 3 || d !== a + 4) {
        throw new Error(`Numbers [${numbers}] do not form a 2x2 corner square`);
      }
      normNumbers = sorted;
      break;
    }

    case 'sixline': {
      if (!Array.isArray(numbers) || numbers.length !== 6) {
        throw new Error('Six line position requires exactly 6 numbers');
      }
      const sorted = [...numbers].map(Number).sort((x, y) => x - y);
      const [a] = sorted;
      if (a < 1 || sorted[5] > 36 || colOf(a) !== 1 || rowOf(a) >= 12) {
        throw new Error(`Invalid six line numbers: [${numbers}]`);
      }
      for (let i = 0; i < 6; i++) {
        if (sorted[i] !== a + i) {
          throw new Error(`Numbers [${numbers}] do not form 2 adjacent rows`);
        }
      }
      normNumbers = sorted;
      break;
    }

    case 'dozen': {
      let d = Array.isArray(numbers) ? numbers[0] : numbers;
      if (Array.isArray(numbers) && numbers.length === 12) {
        if (numbers[0] === 1 && numbers[11] === 12) d = 1;
        else if (numbers[0] === 13 && numbers[11] === 24) d = 2;
        else if (numbers[0] === 25 && numbers[11] === 36) d = 3;
      }
      const dozenNum = Number(d);
      if (![1, 2, 3].includes(dozenNum)) {
        throw new Error(`Dozen must be 1, 2 or 3, got ${d}`);
      }
      normNumbers = [dozenNum];
      break;
    }

    case 'column': {
      let c = Array.isArray(numbers) ? numbers[0] : numbers;
      if (Array.isArray(numbers) && numbers.length === 12) {
        if (numbers[0] === 1 && numbers[1] === 4) c = 1;
        else if (numbers[0] === 2 && numbers[1] === 5) c = 2;
        else if (numbers[0] === 3 && numbers[1] === 6) c = 3;
      }
      const colNum = Number(c);
      if (![1, 2, 3].includes(colNum)) {
        throw new Error(`Column must be 1, 2 or 3, got ${c}`);
      }
      normNumbers = [colNum];
      break;
    }

    case 'red':
    case 'black':
    case 'odd':
    case 'even':
    case 'low':
    case 'high': {
      normNumbers = Array.isArray(numbers) ? numbers : [];
      break;
    }

    default:
      throw new Error(`Unhandled position type: ${type}`);
  }

  return {
    ...pos,
    type,
    numbers: normNumbers,
    stake: nStake,
    mult: MULT[type]
  };
}

export function isWinningPosition(pos, result) {
  if (result === 0) {
    // 0 loses every outside position
    if (['red', 'black', 'odd', 'even', 'low', 'high', 'dozen', 'column'].includes(pos.type)) {
      return false;
    }
    // Inside positions with 0 win
    if (pos.type === 'straight') return pos.numbers[0] === 0;
    if (['split', 'street'].includes(pos.type)) return pos.numbers.includes(0);
    return false;
  }

  switch (pos.type) {
    case 'straight':
    case 'split':
    case 'street':
    case 'corner':
    case 'sixline':
      return pos.numbers.includes(result);

    case 'dozen': {
      const d = pos.numbers[0];
      if (d === 1) return result >= 1 && result <= 12;
      if (d === 2) return result >= 13 && result <= 24;
      if (d === 3) return result >= 25 && result <= 36;
      return false;
    }

    case 'column': {
      const c = pos.numbers[0];
      return ((result - 1) % 3) + 1 === c;
    }

    case 'red':
      return RED.has(result);

    case 'black':
      return BLACK.has(result);

    case 'odd':
      return result % 2 === 1;

    case 'even':
      return result % 2 === 0;

    case 'low':
      return result >= 1 && result <= 18;

    case 'high':
      return result >= 19 && result <= 36;

    default:
      return false;
  }
}

export function settle(positions, result) {
  if (!Array.isArray(positions)) return [];
  return positions.map((pos) => {
    const valid = validatePosition(pos);
    const win = isWinningPosition(valid, result);
    const payout = win ? Math.floor(valid.stake * (valid.mult + 1)) : 0;
    return {
      ...valid,
      payout
    };
  });
}
