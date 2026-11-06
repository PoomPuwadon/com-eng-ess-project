// Single source of truth for the building layout (Phase 0 greybox, rev 10).
// Must match .claude/skills/greybox-layout/SKILL.md. 1 unit = 1 metre.
// Axes: +X east, +Y up, +Z south. Origin = centre of the Grand Lobby (atrium) floor.
//
// Massing: Office Tower (west) | Grand Lobby atrium (between) | Visitors' Tower (east).
// The glass bridge spans the atrium at Y = 37 and is visible from the lobby floor.

export const ROLES = ['visitor', 'cleared', 'tour', 'admin', 'ceo'];
export const ROLE_LABELS = {
  visitor: 'Visitor',
  cleared: 'Visitor (Link Access Credential)',
  tour: 'Visitor on Executive Tour',
  admin: 'Staff (Admin)',
  ceo: 'Chief Executive',
};

const STAFFISH = ['cleared', 'tour', 'admin', 'ceo'];
export const AREA_ACCESS = {
  public: ROLES,
  staff_side: STAFFISH, // past the staff turnstiles
  bridge: STAFFISH, // the glass bridge checkpoints
  ot_view: STAFFISH, // office tower department floors (cleared = view only)
  control: ['tour', 'admin', 'ceo'], // OT-05
  basement: ['tour', 'admin', 'ceo'], // B1 via CEO private elevator
  staff_b1: ['admin', 'ceo'], // B1 via the staff low-rise bank
  freight: ['admin', 'ceo'], // freight lifts (riding with the robots)
  ceo_lift: ['tour', 'admin', 'ceo'], // the Chief Executive Lifts (tours board in the lobby)
  backstage: ['admin', 'ceo'], // Combat Pavilion: service corridor, backstage, focus room, walkout tunnel, ringside
};
export const canAccess = (role, area) => (AREA_ACCESS[area] || []).includes(role);

export const REFUSALS = {
  staff_side: 'Staff Access only. Please enjoy the Wellness Tower.',
  bridge: 'Your Link Access Credential is pending. Please enjoy the Wellness Tower.',
  ot_view: 'This floor is reserved for value creators.',
  control: 'The Executive Floor is by invitation only.',
  basement: 'The Treasury Reserve is viewable on Executive Tours only.',
  staff_b1: 'The Treasury Reserve is viewable on Executive Tours only.',
  freight: 'This lift is reserved for Autonomous Liquidity Couriers.',
  ceo_lift: 'The Chief Executive Lift operates by invitation only.',
  backstage: 'Competitors and officials only beyond this point.',
};

const r = (x0, x1, z0, z1) => ({ x0, x1, z0, z1 });

// ---------------------------------------------------------------- footprints
export const ATRIUM = { ...r(-30, 30, -40, 30), height: 48 }; // rev 8: compact (60 x 70 m)
export const OT_B = r(-110, -30, -40, 40);
export const VT_B = r(30, 210, -60, 60);
export const BRIDGE_Y = 15; // rev 10: The Link joins the Trading Floor and the Leisure Suite

// ---------------------------------------------------------------- elevator banks
// Every car runs in its own shaft. Shafts sit on the tower facade that faces the atrium.
// side(floor): which face of the car opens at that stop ('e' or 'w').
const OT_FLOORS = ['OT-01', 'OT-02', 'OT-03', 'OT-04', 'OT-05'];
const VT_FLOORS = ['VT-01', 'VT-02', 'VT-03', 'VT-04'];
const otSide = (f) => (f === 'L0' || f === 'B1' ? 'e' : 'w');
const vtSide = (f) => (f === 'L0' || f === 'B1' ? 'w' : 'e');

export const BANKS = {
  ot_low: {
    name: 'Office Low-Rise', label: 'Floors B1 · L · 1–2', tower: 'OT', stops: ['B1', 'L0', 'OT-01', 'OT-02'],
    stopArea: { B1: 'staff_b1', L0: 'staff_side', default: 'ot_view' }, side: otSide,
    cars: 4, shaft: { x0: -34, x1: -30, z0: -38.6, pitch: 3.2 }, speed: 5, carH: 2.8, doorW: 1.8, doorH: 2.5,
  },
  ot_high: {
    name: 'Office High-Rise', label: 'Floors L · 3–5 (express)', tower: 'OT', stops: ['L0', 'OT-03', 'OT-04', 'OT-05'],
    stopArea: { L0: 'staff_side', 'OT-05': 'control', default: 'ot_view' }, side: otSide,
    cars: 4, shaft: { x0: -34, x1: -30, z0: -21, pitch: 3.2 }, speed: 7, carH: 2.8, doorW: 1.8, doorH: 2.5,
  },
  // Chief Executive Lifts (rev 12): one big car (9 x 4.4 m, 15+ people) per tower, between the
  // low-rise and high-rise banks. Office: every floor from the Treasury Reserve to the Executive Floor.
  ceo: {
    name: 'Chief Executive Lift', label: 'Treasury Reserve · Lobby · Floors 1–5', tower: 'OT', stops: ['B1', 'L0', ...OT_FLOORS],
    stopArea: { 'OT-05': 'control', B1: 'basement', default: 'ceo_lift' }, side: otSide,
    cars: 1, shaft: { x0: -39, x1: -30, z0: -25.6, pitch: 4.4 }, speed: 7, carH: 3.6, doorW: 3.2, doorH: 3.0,
  },
  freight_ot: {
    name: 'Freight Lift — Office Tower', label: 'ALC service', tower: 'OT', stops: ['B1', ...OT_FLOORS],
    stopArea: { default: 'freight' }, side: otSide,
    cars: 1, shaft: { x0: -35, x1: -30, z0: 21, pitch: 5 }, speed: 3, carH: 3.2, doorW: 3, doorH: 2.9,
  },
  vt_low: {
    name: 'Wellness Low-Rise', label: 'Floors L · 1–2', tower: 'VT', stops: ['L0', 'VT-01', 'VT-02'],
    stopArea: { default: 'public' }, side: vtSide,
    cars: 4, shaft: { x0: 30, x1: 34, z0: -38.6, pitch: 3.2 }, speed: 5, carH: 2.8, doorW: 1.8, doorH: 2.5,
  },
  ceo_vt: {
    name: 'Chief Executive Lift — Wellness', label: 'Lobby · Wellness floors 1–4', tower: 'VT', stops: ['L0', 'VT-01', 'VT-02', 'VT-03', 'VT-04'],
    stopArea: { default: 'ceo_lift' }, side: vtSide,
    cars: 1, shaft: { x0: 30, x1: 39, z0: -25.6, pitch: 4.4 }, speed: 7, carH: 3.6, doorW: 3.2, doorH: 3.0,
  },
  vt_high: {
    name: 'Wellness High-Rise', label: 'Floors L · 3–4 (express)', tower: 'VT', stops: ['L0', 'VT-03', 'VT-04'],
    stopArea: { default: 'public' }, side: vtSide,
    cars: 4, shaft: { x0: 30, x1: 34, z0: -21, pitch: 3.2 }, speed: 8, carH: 2.8, doorW: 1.8, doorH: 2.5,
  },
  freight_vt: {
    name: 'Freight Lift — Wellness Tower', label: 'ALC service', tower: 'VT', stops: ['B1', ...VT_FLOORS],
    stopArea: { default: 'freight' }, side: vtSide,
    cars: 1, shaft: { x0: 30, x1: 35, z0: 21, pitch: 5 }, speed: 3, carH: 3.2, doorW: 3, doorH: 2.9,
  },
};
export const stopArea = (bank, floorId) => BANKS[bank].stopArea[floorId] || BANKS[bank].stopArea.default;

// One shaft per car.
export const CARS = Object.entries(BANKS).flatMap(([bankId, b]) => Array.from({ length: b.cars }, (_, i) => ({
  id: `${bankId}_${i + 1}`,
  label: `${b.tower}-${bankId.includes('low') ? 'L' : bankId.includes('high') ? 'H' : bankId.startsWith('ceo') ? 'X' : 'F'}${i + 1}`,
  bank: bankId,
  x0: b.shaft.x0, x1: b.shaft.x1, z0: b.shaft.z0 + i * b.shaft.pitch, z1: b.shaft.z0 + (i + 1) * b.shaft.pitch,
  carH: b.carH, doorW: b.doorW, doorH: b.doorH,
})));
export const CAR_BY_ID = Object.fromEntries(CARS.map((c) => [c.id, c]));

// Landing (call) zone of a bank on a floor: 8 m deep strip in front of the opening face.
export function landingZone(bankId, floorId) {
  const b = BANKS[bankId];
  if (!b.stops.includes(floorId)) return null;
  const cars = CARS.filter((c) => c.bank === bankId);
  const z0 = Math.min(...cars.map((c) => c.z0)), z1 = Math.max(...cars.map((c) => c.z1));
  const side = b.side(floorId);
  const x = side === 'w' ? cars[0].x0 : cars[0].x1;
  const zone = side === 'w' ? r(x - 8, x, z0, z1) : r(x, x + 8, z0, z1);
  return { bank: bankId, ...zone, side, face: side === 'w' ? -Math.PI / 2 : Math.PI / 2 };
}

// ---------------------------------------------------------------- floors
// Tower floors: the lift hall fills the strip next to the shafts (OT_HALL / VT_HALL); everything
// beyond its portal wall is the floor's main space (open plan unless stated).
export const OT_HALL = r(-50, -30, -40, 40);
export const VT_HALL = r(30, 50, -60, 60);
const OT_MAIN = r(-110, -50, -40, 40);
const VT_MAIN = r(50, 210, -60, 60);
const deptFloor = (id, elevation, roomId, sign, short) => ({
  id, tower: 'OT', short, sign, elevation, height: 5, bounds: OT_B, area: 'ot_view',
  rooms: [{ id: roomId, sign, short, ...OT_MAIN, full: true }],
  props: 'department',
});

export const FLOORS = [
  // ------------------------------------------------------------ basement
  {
    id: 'B1', tower: 'B1', short: 'Basement', sign: 'Basement', elevation: -10, height: 10,
    bounds: r(-80, 130, -40, 40), area: 'basement',
    rooms: [
      { id: 'vault', sign: 'Treasury Reserve', short: 'Vault', ...r(-29, 21, -25.2, 32.5), h: 9.5,
        doors: [{ side: 'n', width: 8 }, { side: 'w', at: -23.4, width: 3.4 }, { side: 'w', at: 23.5, width: 4 }] }, // CEO lift + freight open straight in
      { id: 'server_room', sign: 'Infrastructure Core (IT)', short: 'Server Room', ...r(-78, -38, 5, 35), h: 6, doors: ['n', 'e'], doorWidth: 4 },
      { id: 'cash_robot_depot', sign: 'Autonomous Liquidity Courier Depot', short: 'ALC Depot', ...r(40, 70, -38, -18), h: 6, doors: ['n', 'w'], doorWidth: 6 },
      { id: 'b1_service_corridor', sign: 'Service Corridor', short: 'Corridor', ...r(-80, 130, -40, 40), full: true },
    ],
    props: 'basement',
  },
  // ------------------------------------------------------------ grand lobby (atrium between the towers)
  {
    id: 'L0', tower: 'L0', short: 'Grand Lobby', sign: 'Grand Lobby', elevation: 0, height: ATRIUM.height,
    bounds: r(ATRIUM.x0, ATRIUM.x1, ATRIUM.z0, ATRIUM.z1), area: 'public', glassRoof: true, lux: true, // Phase 1 look
    openings: [{ side: 'w', from: -3, to: 3, y0: BRIDGE_Y, y1: BRIDGE_Y + 4 }, { side: 'e', from: -3, to: 3, y0: BRIDGE_Y, y1: BRIDGE_Y + 4 },
      { side: 's', from: -5, to: 5, y1: 6 }], // main entrance from the plaza
    rooms: [
      { id: 'grand_lobby', sign: 'Grand Lobby', short: 'Grand Lobby', ...r(-30, 30, -40, 30), full: true, noSign: true },
      { id: 'security_checkpoint', sign: 'Asset Protection Screening', short: 'Screening', ...r(-4.8, 4.8, 22, 28.6), zone: true },
      { id: 'seating_west', sign: 'Lobby Lounge', short: 'Lounge', ...r(-20, -9, 9.5, 18.5), zone: true },
      { id: 'seating_east', sign: 'Lobby Lounge', short: 'Lounge', ...r(9, 20, 9.5, 18.5), zone: true },
      { id: 'lobby_water_feature', sign: 'Reflection Pool (beneath The Link)', short: 'Water Feature', ...r(-8, 8, -5, 5), zone: true },
      { id: 'reception_desk', sign: 'Reception', short: 'Reception', ...r(-7, 7, -23.5, -19.5), zone: true },
      { id: 'concierge', sign: 'Concierge', short: 'Concierge', ...r(14, 19.5, -30, -26.5), zone: true },
      { id: 'mezzanine_lounge', sign: "Members' Mezzanine", short: 'Mezzanine', ...r(-29, 29, -39, -33), zone: true },
      { id: 'lobby_escalators', sign: 'Escalators to the Mezzanine', short: 'Escalators', ...r(-14.4, -10.4, -33, -19.5), zone: true },
      { id: 'staff_turnstiles', sign: 'Staff Access', short: 'Staff Gates', ...r(-23, -19, -25, -19), zone: true },
      { id: 'visitor_gates', sign: 'Guest Access', short: 'Guest Gates', ...r(19, 23, -25, -19), zone: true },
      { id: 'staff_elevator_bank', sign: 'Office Tower Lifts (Staff)', short: 'Office Lifts', ...r(-30, -22, -38.6, -8), zone: true },
      { id: 'visitor_elevator_bank', sign: 'Wellness Tower Lifts (Guests)', short: 'Wellness Lifts', ...r(22, 30, -38.6, -8), zone: true },
    ],
    props: 'lobby',
    spawn: { x: 0, z: 27.5, yaw: Math.PI }, // review spawn: arrival foyer, facing north
  },
  // ------------------------------------------------------------ entrance plaza (outdoors)
  {
    id: 'PLAZA', tower: 'PLAZA', short: 'Plaza', sign: 'Entrance Plaza', elevation: 0, height: 6, // low volume: its bounds overlap the towers' corners above the plinths
    bounds: r(-40, 40, 30, 62), area: 'public', outdoor: true, lux: true,
    rooms: [
      { id: 'entrance_plaza', sign: 'Entrance Plaza', short: 'Plaza', ...r(-40, 40, 30, 62), full: true, noSign: true },
      { id: 'drop_off', sign: 'Arrivals Drop-off', short: 'Drop-off', ...r(-34, 34, 49, 55), zone: true },
    ],
    props: 'plaza',
    spawn: { x: 0, z: 57.5, yaw: Math.PI }, // game start: outside, facing the building
  },
  // ------------------------------------------------------------ office tower
  {
    id: 'OT-01', tower: 'OT', short: 'Trading', sign: 'Trading Floor', elevation: 15, height: 12,
    bounds: OT_B, area: 'ot_view', lux: true, customHall: true, // Phase 1 look; lift hall built by tradingFloor.js
    openings: [{ side: 'e', from: -3, to: 3 }], // The Link
    rooms: [
      { id: 'ot_bridge_checkpoint', sign: 'Link Checkpoint', short: 'Checkpoint', ...r(-38, -31, -6, 6), zone: true },
      { id: 'trading_floor', sign: 'Trading Floor', short: 'Trading', ...OT_MAIN, full: true, noSign: true },
    ],
    props: 'trading',
  },
  {
    id: 'OT-02', tower: 'OT', short: 'Prob. Inst.', sign: 'Probability Research Institute', elevation: 27, height: 10,
    bounds: OT_B, area: 'ot_view',
    rooms: [{ id: 'lottery_institute', sign: 'Probability Research Institute', short: 'Prob. Inst.', ...OT_MAIN, full: true }],
    props: 'lottery',
  },
  deptFloor('OT-03', 37, 'thai_desk', 'Thai Markets Desk', 'Thai Desk'),
  deptFloor('OT-04', 42, 'security_hq', 'Asset Protection HQ', 'Security HQ'),
  {
    id: 'OT-05', tower: 'OT', short: 'Executive', sign: 'Executive Floor', elevation: 47, height: 8,
    bounds: OT_B, area: 'control',
    rooms: [
      { id: 'ceo_office', sign: 'Office of the Chief Executive', short: 'CEO Office', ...r(-108, -83, 18, 38), h: 6, doors: ['n', 'e'], doorWidth: 4 },
      { id: 'boardroom', sign: 'Boardroom', short: 'Boardroom', ...r(-79, -52, 23, 38), h: 6, doors: ['n'], doorWidth: 4 },
      { id: 'cfo_office', sign: 'Office of the CFO', short: 'CFO Office', ...r(-62, -52, -38, -26), h: 5, doors: ['s', 'w'], doorWidth: 3 },
      { id: 'legal', sign: 'Legal & Compliance', short: 'Legal', ...r(-108, -88, -38, -23), h: 5, doors: ['e'], doorWidth: 3 },
      { id: 'it', sign: 'Information Technology', short: 'IT', ...r(-108, -88, -19, -4), h: 5, doors: ['e'], doorWidth: 3 },
      { id: 'hr', sign: 'Human Capital', short: 'HR', ...r(-108, -88, 0, 14), h: 5, doors: ['e'], doorWidth: 3 },
      { id: 'security_monitoring', sign: 'Surveillance Operations Centre', short: 'Monitoring', ...r(-84, -66, -38, -26), h: 5, doors: ['s', 'e'], doorWidth: 3 },
      { id: 'cigar_lounge', sign: "Private Members' Lounge", short: 'Cigar Lounge', ...r(-84, -64, -22, -7), h: 5, doors: ['e', 's'], doorWidth: 3 },
      { id: 'master_dashboards', sign: 'Enterprise Performance Centre', short: 'Dashboards', ...r(-84, -59, -2, 13), h: 6, doors: ['n', 's', 'e'], doorWidth: 4 },
      { id: 'trophy_wall', sign: 'Hall of Achievement', short: 'Trophy Wall', ...r(-83, -60, 15, 21), zone: true },
    ],
    props: 'control',
  },
  // ------------------------------------------------------------ bridge (spans the atrium)
  {
    id: 'BRIDGE', tower: 'BRIDGE', short: 'The Link', sign: 'The Link', elevation: BRIDGE_Y, height: 4,
    bounds: r(-30, 30, -3, 3), area: 'bridge', castShadows: true, lux: true, // Phase 1 (seen from the lobby)
    rooms: [{ id: 'glass_bridge', sign: 'The Link — Authorised Synergy Only', short: 'Glass Bridge', ...r(-30, 30, -3, 3), full: true }],
    props: 'bridge',
  },
  // ------------------------------------------------------------ visitors' tower
  {
    id: 'VT-01', tower: 'VT', short: 'Leisure Suite', sign: 'Executive Leisure Suite', elevation: 15, height: 22,
    bounds: VT_B, area: 'public', lux: true, customHall: true, // Phase 1 look (leisureSuite.js)
    openings: [{ side: 'w', from: -3, to: 3 }], // The Link
    rooms: [
      { id: 'vt_bridge_checkpoint', sign: 'Link Checkpoint', short: 'Checkpoint', ...r(31, 38, -6, 6), zone: true },
      { id: 'leisure_suite', sign: 'Executive Leisure Suite', short: 'Leisure Suite', ...VT_MAIN, full: true },
      { id: 'zone_yield_terminals', sign: 'Automated Yield Terminals', short: 'Yield Terms', ...r(52, 116, -56, -12), zone: true },
      { id: 'zone_rotational', sign: 'Rotational Variance Instruments', short: 'Rotational', ...r(120, 206, -56, -12), zone: true },
      { id: 'zone_twentyone', sign: 'Twenty-One Advisory Tables', short: 'Twenty-One', ...r(52, 96, 12, 56), zone: true },
      { id: 'zone_private_banking', sign: 'Private Banking Tables', short: 'Priv. Banking', ...r(98, 124, 12, 56), zone: true },
      { id: 'zone_kinetic_pit', sign: 'Kinetic Probability Pit', short: 'Kinetic Pit', ...r(126, 148, 12, 56), zone: true },
      { id: 'card_salon', sign: 'Private Card Salon — Strategic Negotiation', short: 'Card Salon', ...r(152, 206, 12, 56), zone: true }, // Phase 1: glass partition (leisureSuite.js)
      { id: 'card_salon_high_limit', sign: 'High-Conviction Salon', short: 'High Limit', ...r(193, 205, 43, 55), zone: true },
    ],
    props: 'leisure',
  },
  {
    id: 'VT-02', tower: 'VT', short: 'Sports Arena', sign: 'Sports Analytics Arena', elevation: 53.5, height: 13.5,
    // Compact arrivals hall at 53.5 m (lifts stop here) whose exit IS the arena portal; the bowl
    // (centre X 108, wall r 58 touching the hall's east wall) sinks 16.5 m to the Leisure Suite's
    // ceiling at 37 m. A grand stair runs from the portal straight down to the pit.
    below: 16.5, slabHoleCircle: { cx: 108, cz: 0, r: 58 },
    bounds: VT_B, area: 'public', lux: true, customHall: true, // Phase 1 look (sportsArena.js)
    rooms: [
      { id: 'football_arena', sign: 'Sports Analytics Arena', short: 'Sports Arena', ...VT_MAIN, full: true, noSign: true },
      { id: 'arena_floor', sign: 'Analytics Pit', short: 'Arena Pit', ...r(98, 118, -10, 10), zone: true },
      { id: 'arena_grand_stair', sign: 'Grand Stair', short: 'Grand Stair', ...r(50, 89, -7, 7), zone: true, noSign: true },
    ],
    slabColor: 0x1d2433, ceilColor: 0x10151f,
    props: 'football',
  },
  {
    // A realistic stadium (rev 11, see floors/pavilion.js): narrow arrivals hall → ticket gates →
    // grand stairs up to the spectator concourse (6.1 m) → vomitories → cross-aisle → seats. The
    // ringside floor, walkout tunnel, the black focus room at its end, backstage and the service corridor
    // are staff/competitors only. (User, 2026-11-06: dressing rooms and concourse position windows removed.)
    id: 'VT-03', tower: 'VT', short: 'Combat Pav.', sign: 'Combat Sports Analytics Pavilion', elevation: 67, height: 25,
    bounds: VT_B, area: 'public', slabColor: 0x1c1a1f, ceilColor: 0x120d0b, lux: true, customHall: true, // Phase 1 look (combatPavilion.js)
    rooms: [
      { id: 'muay_thai_arena', sign: 'Combat Sports Analytics Pavilion', short: 'Combat Pav.', ...r(44, 172, -53.4, 53.4), full: true, noSign: true },
      { id: 'ringside', sign: 'Ringside (officials & competitors)', short: 'Ringside', ...r(106, 134, -14, 14), full: true, noSign: true },
      { id: 'pavilion_entry', sign: 'Pavilion Entrance', short: 'Entrance', ...r(44, 55.2, -4, 4), full: true, noSign: true },
      { id: 'pavilion_service_corridor', sign: 'Service Corridor', short: 'Service', ...r(44, 209, -59, -53.4), full: true, noSign: true },
      { id: 'pavilion_backstage', sign: "Competitors' Quarters", short: 'Backstage', ...r(172, 209, -53.4, 59), full: true, noSign: true },
      // small black room at the end of the walkout road: the tunnel opens straight into it (west side),
      // a door at the back leads to backstage / the service corridor
      { id: 'focus_room', sign: "Competitors' Focus Room", short: 'Focus Room', ...r(172, 180, -4, 4), h: 4.2, open: ['w'], doors: [{ side: 'e', at: 0, width: 2, top: 3 }], color: 0x0b0b0d, floorColor: 0x050506, noSign: true, noDoorSigns: true },
    ],
    // Fighter walkout routes (for the planned "put players in the ring" feature): black focus room →
    // tunnel under the concourse → lit walkway through the seats → ring steps → corner.
    walkout: {
      red: [[178, -1.6], [175, -1.2], [128, -1.2], [126.6, 0], [124, 0], [115.6, -4.4]],
      blue: [[178, 1.6], [175, 1.2], [128, 1.2], [126.6, 0], [124, 0], [124.4, 4.4]],
    },
    props: 'muaythai',
  },
  {
    id: 'VT-04', tower: 'VT', short: 'Equine Ctr', sign: 'Equine Performance Centre', elevation: 92, height: 20,
    bounds: VT_B, area: 'public',
    rooms: [
      { id: 'racing_hall', sign: 'Equine Performance Centre', short: 'Equine Ctr', ...VT_MAIN, full: true },
      { id: 'racing_grandstand', sign: 'Members Grandstand', short: 'Grandstand', ...r(80, 180, -56, -44), zone: true },
      { id: 'racing_tote', sign: 'Position Windows', short: 'Tote', ...r(54, 76, -59, -53), zone: true },
    ],
    props: 'racing',
  },
];

// ---------------------------------------------------------------- lift halls
// Every tower floor opens with one big lift hall: the full-depth strip next to the shafts, so the
// passenger, freight (and on OT-05 the private) lift landings all open into it. On OT-01 and
// VT-01 The Link also enters it, through a glass checkpoint vestibule. Its walls run
// floor to ceiling like the rest of the floor; one big themed portal leads into the main space.
// [theme, sign, portal width, portal height] — width 0 = no wall (the hall flows straight on).
const HALLS = {
  'OT-01': ['trading', "Trading Floor — Members' Lift Hall", 16, 8],
  'OT-02': ['quant', 'Probability Research Institute — Lift Hall', 14, 7],
  'OT-03': ['thai', 'Thai Markets Desk — Sala Hall', 12, 4.2],
  'OT-04': ['security', 'Asset Protection — Screening Hall', 12, 4.2],
  'OT-05': ['executive', 'Executive Reception', 10, 5.5],
  'VT-01': ['portal', 'Executive Leisure Suite — Grand Hall', 18, 12],
  'VT-02': ['concourse', 'Sports Analytics Arena', 14, 6, { rect: r(30, 50, -40, 30), open: ['w'] }],
  'VT-03': ['shrine', 'Combat Pavilion — Arrivals', 8, 7, { rect: r(30, 44, -40, 30), open: ['w'], extraDoors: [{ side: 'n', at: 40, width: 3 }], narrow: true }],
  'VT-04': ['paddock', 'Equine Centre — Paddock Hall', 30, 12],
};
for (const f of FLOORS) {
  const hl = HALLS[f.id];
  if (!hl) continue;
  const ot = f.tower === 'OT';
  const [theme, sign, width, top, opts = {}] = hl;
  const walled = width > 0;
  const rect = opts.rect || (ot ? OT_HALL : VT_HALL);
  f.rooms.push({
    id: `${f.id.toLowerCase().replace('-', '')}_lift_hall`, sign, short: 'Lift Hall', ...rect, hall: theme,
    h: f.height - 0.25, noSign: true, noDoorSigns: true, narrow: !!opts.narrow,
    open: opts.open || (walled ? [ot ? 'e' : 'w', 'n', 's'] : ['n', 's', 'e', 'w']),
    doors: walled ? [{ side: ot ? 'w' : 'e', at: 0, width, top }, ...(opts.extraDoors || [])] : [],
    portal: walled ? { x: ot ? rect.x0 : rect.x1, z: 0, width, top } : null,
    link: (f.openings || []).some((o) => o.y0 == null && o.side === (ot ? 'e' : 'w')), // The Link enters this hall
  });
}

export const FLOOR_BY_ID = Object.fromEntries(FLOORS.map((f) => [f.id, f]));

// Landing zones per floor (derived from the banks).
for (const f of FLOORS) {
  f.elevators = Object.keys(BANKS).map((b) => landingZone(b, f.id)).filter(Boolean);
}

// Walk clusters: floors at the same level that are physically joined.
export const CLUSTERS = [['OT-01', 'BRIDGE', 'VT-01'], ['L0', 'PLAZA']];
export const clusterOf = (floorId) => CLUSTERS.find((c) => c.includes(floorId)) || [floorId];

// Floors that must render together (you can see one from the other).
const SEE = { L0: ['BRIDGE'], PLAZA: ['BRIDGE'], BRIDGE: ['L0', 'PLAZA'], 'OT-01': ['L0'], 'VT-01': ['L0'] };
export function visibleWith(floorId) {
  const set = new Set(clusterOf(floorId));
  for (const id of [...set]) for (const s of SEE[id] || []) set.add(s);
  return [...set];
}

// Floors to keep loaded: visible set + vertical neighbours (preloaded hidden).
export function neighbourFloors(floorId) {
  const set = new Set(visibleWith(floorId));
  for (const id of [...set]) {
    const f = FLOOR_BY_ID[id];
    const same = FLOORS.filter((o) => o.tower === f.tower).sort((a, b) => a.elevation - b.elevation);
    const i = same.findIndex((o) => o.id === id);
    if (i > 0) set.add(same[i - 1].id);
    if (i >= 0 && i < same.length - 1) set.add(same[i + 1].id);
  }
  const extra = { L0: ['B1', 'OT-01', 'VT-01'], B1: ['L0'], 'OT-01': ['L0'], 'VT-01': ['L0'] }[floorId] || [];
  extra.forEach((id) => set.add(id));
  return [...set];
}

// Which floor contains a world point (feet position).
export function locateFloor(x, y, zz) {
  let best = null;
  for (const f of FLOORS) {
    const b = f.bounds;
    if (x < b.x0 || x > b.x1 || zz < b.z0 || zz > b.z1) continue;
    if (y < f.elevation - (f.below || 0) - 0.6 || y >= f.elevation + f.height - 0.6) continue;
    if (!best || f.tower === 'BRIDGE') best = f; // bridge wins inside the atrium
  }
  return best;
}

export function locateRoom(floor, x, zz) {
  let best = null;
  let bestArea = Infinity;
  for (const rm of floor.rooms) {
    if (x < rm.x0 || x > rm.x1 || zz < rm.z0 || zz > rm.z1) continue;
    const a = (rm.x1 - rm.x0) * (rm.z1 - rm.z0);
    if (a < bestArea) { best = rm; bestArea = a; }
  }
  return best;
}

export function findRoom(roomId) {
  for (const f of FLOORS) for (const rm of f.rooms) if (rm.id === roomId) return { floor: f, room: rm };
  return null;
}

export const FLOOR_LIST = {
  OT: ['OT-05', 'OT-04', 'OT-03', 'OT-02', 'OT-01'],
  VT: ['VT-04', 'VT-03', 'VT-02', 'VT-01'],
  shared: ['BRIDGE', 'L0', 'PLAZA', 'B1'],
};
