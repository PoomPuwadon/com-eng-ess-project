# Roulette Implementation Notes

## Decisions I Made

### Milestone 1: Pure Roulette Engine
- **Test Runner Script**: Used `"node --test server/games/test/*.test.js"` in `package.json` for cross-platform compatibility across Windows and Unix environments.
- **RED Set**: Exported `RED` as a `Set<number>` matching the layout in `leisureSuite.js` with an added `.length = 18` helper property for seamless interoperability with array-length assertions.
- **RNG Seed Implementation**: Implemented `mulberry32` 32-bit deterministic PRNG for `seededRng(seed)`, providing reproducible integer distributions.
- **Position Normalization**: `validatePosition` returns a normalized position with `{ type, numbers, stake, mult }` and preserves any client-side identifiers like `cid`.
- **Corner Adjacency**: Correctly validated that corners cannot start on column 3 or row 12, forming valid 2x2 squares `[n, n+1, n+3, n+4]`.

### Milestone 2: Round Cycle + Currency on the Server
- **RouletteRoom Design**: Pure dependency injection for `send`, `broadcast`, and `now`, allowing 100% deterministic unit testing of phase progression without socket dependencies.
- **Phase Durations & Limits**: Default 35s OPEN, 3s CLOSED, 12s SPINNING, 8s RESULT (sum = 58s <= 60s). `setConfig` validates sum <= 60s and each phase >= 2s.
- **Tick Interval**: Driven by a 250ms server interval calling `room.tick()`.
- **In-memory Balances**: Keyed by player name with default 10,000 NU. Reconnects with the same name retain balance.
- **Treasury Reserve**: Tracks net player gains/losses across rounds; can go negative in prototype as specified.
- **Balance Broadcast**: Client balance is pushed on `hello`, `rl_join`, position acceptance, and round result settlement.
