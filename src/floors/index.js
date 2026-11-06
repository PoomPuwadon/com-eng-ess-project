import { buildBase, finalize } from './base.js';
import { buildScreens } from '../world/screens.js';
import { shiftedCtx } from '../world/geom.js';
import { lobby, plaza } from './lobby.js';
import { department, control, lottery } from './officeTower.js';
import { trading } from './tradingFloor.js';
import { racing } from './visitorsTower.js';
import { leisure } from './leisureSuite.js';
import { pavilion as muaythai } from './pavilion.js';
import { arena } from './arena.js';
import { hall } from './halls.js';
import { basement, bridge } from './basementBridge.js';

const PROPS = {
  lobby, plaza, trading, department, control, lottery,
  leisure, football: arena, muaythai, racing,
  basement, bridge,
};

// Rev 8 (compact lobby): the towers moved 30 m towards the atrium. Prop builders still use their
// original tower coordinates; this offset moves them with their tower. Builders that read the
// layout data or were rewritten in world coordinates (lobby, plaza, department, lottery,
// trading, leisure, arena, pavilion, bridge, halls) need none.
const PROP_DX = { control: 30, basement: 30, racing: -30 };

// Build one floor: generic shell (incl. lift shafts + landing doors) + its props.
export function buildFloor(floor) {
  const ctx = buildBase(floor);
  const fn = PROPS[floor.props];
  if (fn) fn(shiftedCtx(ctx, PROP_DX[floor.props] || 0));
  if (!floor.customHall) for (const rm of floor.rooms) if (rm.hall) hall(ctx, rm); // Phase 1 floors build their own hall
  return finalize(ctx, buildScreens);
}
