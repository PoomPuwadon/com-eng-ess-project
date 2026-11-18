// A small fixed-price position book for one live event (a bout or a race), on the double-entry ledger.
//   open:  PLAYER -> ESCROW:BET:<ref>                         WAGER_PLACED
//   gain:  ESCROW -> PLAYER (stake) + VAULT -> PLAYER (profit) WAGER_WON
//   lost:  ESCROW -> VAULT                                    WAGER_LOST
//   void:  ESCROW -> PLAYER                                   WAGER_VOID
// The vault must be able to cover the worst case of every open position at acceptance.
import { VAULT, player } from '../ledger.js';
import { payoutFor } from './pricing.js';

export const MIN_STAKE = 100, MAX_STAKE = 1_000_000; // ¤ 1.00 .. ¤ 10,000.00
const err = (status, message) => Object.assign(new Error(message), { status });

export function createBook(ledger, eventRef) {
  const positions = [];
  let settled = false;
  const exposure = () => positions.reduce((s, p) => s + (p.status === 'open' ? payoutFor(p.stake, p.price) - p.stake : 0), 0);

  function open({ playerId, pick, stake, price, label }) {
    if (settled) throw err(409, 'Pricing for this event has closed.');
    if (!Number.isSafeInteger(stake) || stake < MIN_STAKE || stake > MAX_STAKE) throw err(400, `Allocation must be between ¤${MIN_STAKE / 100} and ¤${(MAX_STAKE / 100).toLocaleString('en-US')}.`);
    if (!price || price < 1) throw err(409, 'No pricing available for that selection.');
    const profit = payoutFor(stake, price) - stake;
    if (ledger.balance(VAULT) < exposure() + profit) throw err(409, 'The Treasury Reserve cannot underwrite that allocation right now.');
    const id = positions.length + 1, ref = `${eventRef}:${id}`;
    ledger.post({ actor: `player:${playerId}`, reason: 'WAGER_PLACED', ref, idem: `pos:${ref}:open`, transfers: [{ from: player(playerId), to: `ESCROW:BET:${ref}`, amount: stake }] });
    const p = { id, ref, playerId, pick, stake, price, label, status: 'open', payout: 0 };
    positions.push(p);
    return p;
  }

  /** winners: Set of picks that realise a gain; null = void everything (stakes returned) */
  function settle(winners) {
    if (settled) return [];
    settled = true;
    for (const p of positions) {
      const esc = `ESCROW:BET:${p.ref}`, who = player(p.playerId);
      if (winners === null) {
        ledger.post({ actor: 'system:settlement', reason: 'WAGER_VOID', ref: p.ref, idem: `pos:${p.ref}:settle`, transfers: [{ from: esc, to: who, amount: p.stake }] });
        p.status = 'void'; p.payout = p.stake;
      } else if (winners.has(p.pick)) {
        const pay = payoutFor(p.stake, p.price);
        ledger.post({ actor: 'system:settlement', reason: 'WAGER_WON', ref: p.ref, idem: `pos:${p.ref}:settle`, transfers: [{ from: esc, to: who, amount: p.stake }, { from: VAULT, to: who, amount: pay - p.stake }] });
        p.status = 'gain'; p.payout = pay;
      } else {
        ledger.post({ actor: 'system:settlement', reason: 'WAGER_LOST', ref: p.ref, idem: `pos:${p.ref}:settle`, transfers: [{ from: esc, to: VAULT, amount: p.stake }] });
        p.status = 'contributed';
      }
    }
    return positions;
  }

  return { open, settle, positions, exposure, get settled() { return settled; } };
}
