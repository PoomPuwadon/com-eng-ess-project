# Roulette Implementation Notes

## Decisions I Made

### Milestone 1: Pure Roulette Engine
- **Test Runner Script**: Used `"node --test server/games/test/*.test.js"` in `package.json` for cross-platform compatibility across Windows and Unix environments.
- **RED Set**: Exported `RED` as a `Set<number>` matching the layout in `leisureSuite.js` with an added `.length = 18` helper property for seamless interoperability with array-length assertions.
- **RNG Seed Implementation**: Implemented `mulberry32` 32-bit deterministic PRNG for `seededRng(seed)`, providing reproducible integer distributions.
- **Position Normalization**: `validatePosition` returns a normalized position with `{ type, numbers, stake, mult }` and preserves any client-side identifiers like `cid`.
- **Corner Adjacency**: Correctly validated that corners cannot start on column 3 or row 12, forming valid 2x2 squares `[n, n+1, n+3, n+4]`.
