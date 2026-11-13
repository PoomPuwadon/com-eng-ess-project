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

### Milestone 3: Admin Messages on the Server
- **AdminManager Module**: Isolated all admin commands (`adm_list`, `adm_set`, `adm_config`, `adm_audit`) in `server/games/admin.js` for unit testability.
- **Server Enforcement**: All admin messages strictly verify `p.admin` server-side before execution; non-admins receive `{ t: 'denied' }`.
- **Live Sync**: Any admin edit pushes immediate updates (`bal` or `you`) to the target player, broadcasts fresh `adm_players` to all online admins, and records an in-memory audit log entry (capped at 200 items).
- **Result Integrity**: Absolutely no admin mechanism exists to set, predict, or reveal the spin outcome early.

### Milestone 4: Roulette Overlay UI (Client)
- **RouletteController Module**: Built HTML overlay UI in `src/roulette.js` styled after the firm's HUD theme.
- **Persistent Balance Display**: Top HUD banner displays "NU X,XXX" with the mandatory non-currency legal notice.
- **Touch & Key Access**: Proximity check on floor VT-01 (<= 2.5m from any table) reveals the "Join Rotational Variance Instrument" button. Key R is explicitly allowed even under prototype testing lockdown.
- **Intuitive Betting Grid**: Offers rapid straight placement, automated row-selection for street bets, multi-cell staging for split/corner/sixline, and outside dozen/column/even-money boxes.
- **Repeat & Clear**: Supports clearing staged/open allocations and repeating the previous round's positions.

### Milestone 5: 3D Spin + Ball, and the Admin Panel UI
- **Single InstancedMesh Ball System**: Rendered one ball per table using a single `THREE.InstancedMesh(SphereGeometry(0.025))` added to the scene graph with zero additional draw calls per table.
- **Rotor & Ball Dynamics**: In SPINNING phase, rotors accelerate to 12 rad/s then ease down; ball spirals inward in reverse direction (`-t * speed`) and drops into the winning pocket slice during the final 2 seconds (`Math.PI/2` offset aligns 0 with the green slice).
- **Idle Ball Occlusion**: During non-SPINNING phases, the ball instance matrices are scaled to 0 and moved below the floor plane.
- **Admin Panel UI**: Implemented in `src/adminPanel.js` with live "Players" management (balance set/add, rename, role dropdown, reset, refund, teleport, kick), "Settings" editor with instant phase and limit validation, and "Audit log" table displaying the latest 200 actions with the Treasury Reserve header.
