import { spin, settle, validatePosition, cryptoRng } from './roulette.js';

// PROTOTYPE: replaced by the real ledger + login later. Balances live in server memory.
export class RouletteRoom {
  constructor(rng = cryptoRng, send = () => {}, broadcast = () => {}, now = Date.now) {
    this.rng = rng;
    this.send = send;
    this.broadcast = broadcast;
    this.now = typeof now === 'function' ? now : () => Date.now();

    this.balances = new Map(); // playerName -> integer NU balance
    this.treasury = 0; // Losses add, gains subtract. May go negative in prototype.

    this.config = {
      startBalance: 10000,
      min: 10,
      maxPerPosition: 5000,
      maxPerRound: 20000,
      phases: {
        open: 35,
        closed: 3,
        spinning: 12,
        result: 8
      }
    };

    this.history = []; // last 12 winning numbers
    this.roundId = 0;
    this.phase = 'OPEN';
    this.endsAt = this.getTime() + this.config.phases.open * 1000;
    this.result = null;

    // playerId -> Array of { cid, type, numbers, stake, mult, playerName }
    this.positions = new Map();
  }

  getTime() {
    return this.now();
  }

  getBalance(name) {
    if (!name) return this.config.startBalance;
    if (!this.balances.has(name)) {
      this.balances.set(name, this.config.startBalance);
    }
    return this.balances.get(name);
  }

  setBalance(name, amount) {
    const val = Math.floor(Number(amount));
    if (!Number.isInteger(val) || val < 0) {
      throw new Error('Balance must be a non-negative integer');
    }
    this.balances.set(name, val);
    return val;
  }

  adjustBalance(name, delta) {
    const d = Math.floor(Number(delta));
    if (!Number.isInteger(d)) {
      throw new Error('Delta must be an integer');
    }
    const current = this.getBalance(name);
    const updated = current + d;
    if (updated < 0) {
      throw new Error('Balance cannot go negative');
    }
    this.balances.set(name, updated);
    return updated;
  }

  resetBalance(name) {
    this.balances.set(name, this.config.startBalance);
    return this.config.startBalance;
  }

  setConfig(newConfig) {
    if (!newConfig || typeof newConfig !== 'object') {
      throw new Error('Config must be an object');
    }

    const next = {
      ...this.config,
      ...newConfig,
      phases: {
        ...this.config.phases,
        ...(newConfig.phases || {})
      }
    };

    const p = next.phases;
    const phasesSum = p.open + p.closed + p.spinning + p.result;
    if (phasesSum > 60) {
      throw new Error(`Phases must sum to at most 60 s, got ${phasesSum} s`);
    }

    for (const [k, v] of Object.entries(p)) {
      if (typeof v !== 'number' || v < 2) {
        throw new Error(`Phase ${k} duration must be at least 2 s, got ${v}`);
      }
    }

    if (next.startBalance <= 0 || next.min <= 0 || next.maxPerPosition <= 0 || next.maxPerRound <= 0) {
      throw new Error('Limits and starting balance must be positive integers');
    }

    if (next.min > next.maxPerPosition || next.maxPerPosition > next.maxPerRound) {
      throw new Error('Limits must satisfy min <= maxPerPosition <= maxPerRound');
    }

    this.config = next;
    return this.config;
  }

  getPositions(playerId) {
    return this.positions.get(playerId) || [];
  }

  // Returns { ok: true, position, balance } or { ok: false, reason }
  placePosition(playerId, playerName, { type, numbers, stake, cid }) {
    if (this.phase !== 'OPEN') {
      return { ok: false, reason: 'Positions are only accepted during OPEN phase' };
    }

    let norm;
    try {
      norm = validatePosition({ type, numbers, stake });
    } catch (err) {
      return { ok: false, reason: err.message };
    }

    const { min, maxPerPosition, maxPerRound } = this.config;
    if (norm.stake < min) {
      return { ok: false, reason: `Minimum position is ${min} NU` };
    }
    if (norm.stake > maxPerPosition) {
      return { ok: false, reason: `Maximum per position is ${maxPerPosition} NU` };
    }

    const currentPositions = this.positions.get(playerId) || [];
    const currentTotal = currentPositions.reduce((sum, p) => sum + p.stake, 0);
    if (currentTotal + norm.stake > maxPerRound) {
      return { ok: false, reason: `Maximum per round is ${maxPerRound} NU` };
    }

    const balance = this.getBalance(playerName);
    if (balance < norm.stake) {
      return { ok: false, reason: 'Insufficient balance' };
    }

    const newBalance = balance - norm.stake;
    this.balances.set(playerName, newBalance);

    const posRecord = {
      ...norm,
      cid,
      playerName
    };
    currentPositions.push(posRecord);
    this.positions.set(playerId, currentPositions);

    return {
      ok: true,
      position: posRecord,
      balance: newBalance
    };
  }

  clearPositions(playerId, playerName) {
    if (this.phase !== 'OPEN') {
      return { ok: false, reason: 'Positions can only be cleared during OPEN phase' };
    }
    const currentPositions = this.positions.get(playerId) || [];
    if (!currentPositions.length) {
      return { ok: true, balance: this.getBalance(playerName), refunded: 0 };
    }

    const totalRefund = currentPositions.reduce((sum, p) => sum + p.stake, 0);
    const newBalance = this.getBalance(playerName) + totalRefund;
    this.balances.set(playerName, newBalance);
    this.positions.delete(playerId);

    return {
      ok: true,
      balance: newBalance,
      refunded: totalRefund
    };
  }

  cancelPlayerPositions(playerId, playerName) {
    // Admin action: can refund at any time
    const currentPositions = this.positions.get(playerId) || [];
    if (!currentPositions.length) return 0;
    const totalRefund = currentPositions.reduce((sum, p) => sum + p.stake, 0);
    const newBalance = this.getBalance(playerName) + totalRefund;
    this.balances.set(playerName, newBalance);
    this.positions.delete(playerId);
    return totalRefund;
  }

  tick() {
    const t = this.getTime();
    if (t < this.endsAt) return;

    switch (this.phase) {
      case 'OPEN': {
        this.phase = 'CLOSED';
        this.endsAt = t + this.config.phases.closed * 1000;
        this.result = null;
        this.broadcast({
          t: 'rl_phase',
          phase: 'CLOSED',
          endsAt: this.endsAt,
          roundId: this.roundId
        });
        break;
      }

      case 'CLOSED': {
        this.phase = 'SPINNING';
        this.endsAt = t + this.config.phases.spinning * 1000;
        this.result = spin(this.rng);
        this.broadcast({
          t: 'rl_phase',
          phase: 'SPINNING',
          endsAt: this.endsAt,
          roundId: this.roundId,
          result: this.result
        });
        break;
      }

      case 'SPINNING': {
        this.phase = 'RESULT';
        this.endsAt = t + this.config.phases.result * 1000;
        this.history.push(this.result);
        if (this.history.length > 12) this.history.shift();

        // Settle positions for all players
        for (const [playerId, posList] of this.positions.entries()) {
          const playerName = posList[0]?.playerName;
          const settled = settle(posList, this.result);
          let totalStake = 0;
          let totalPayout = 0;
          for (const s of settled) {
            totalStake += s.stake;
            totalPayout += s.payout;
          }
          const net = totalPayout - totalStake;
          const curBal = this.getBalance(playerName);
          const finalBal = curBal + totalPayout;
          this.balances.set(playerName, finalBal);

          if (net > 0) {
            this.treasury -= net;
          } else if (net < 0) {
            this.treasury += Math.abs(net);
          }

          this.send(playerId, {
            t: 'rl_result',
            roundId: this.roundId,
            result: this.result,
            net,
            balance: finalBal
          });
          this.send(playerId, {
            t: 'bal',
            balance: finalBal
          });
        }

        this.broadcast({
          t: 'rl_phase',
          phase: 'RESULT',
          endsAt: this.endsAt,
          roundId: this.roundId,
          result: this.result
        });
        break;
      }

      case 'RESULT': {
        this.phase = 'OPEN';
        this.roundId++;
        this.positions.clear();
        this.result = null;
        this.endsAt = t + this.config.phases.open * 1000;

        this.broadcast({
          t: 'rl_phase',
          phase: 'OPEN',
          endsAt: this.endsAt,
          roundId: this.roundId
        });
        break;
      }
    }
  }
}
