// The CEO's tour basket: gathered players ride in a basket floating above the host's head.
// Pure geometry shared by the server (authoritative member poses) and the client (renders the basket).
// Members are packed on concentric rings in the basket; the basket floor sits BASKET_Y above the host.

export const BASKET_Y = 2.9; // basket floor above the host's feet (the CEO is 1.25x scale, ~2.4 m to the tag)

/** basket radius for n members */
export const basketRadius = (n) => Math.max(0.9, 0.55 + Math.sqrt(Math.max(1, n)) * 0.42);

/** member i of n: offset from the host's feet {dx, dy, dz} */
export function slotOffset(i, n) {
  if (n <= 1) return { dx: 0, dy: BASKET_Y, dz: 0 };
  // ring k holds 6k members (1 in the centre when n is odd and > 6)
  let ring = 0, idx = i, cap = 1;
  const centre = n > 6 && n % 2 === 1;
  if (!centre) { ring = 1; cap = 6; }
  while (idx >= cap) { idx -= cap; ring += 1; cap = 6 * ring; }
  if (ring === 0) return { dx: 0, dy: BASKET_Y, dz: 0 };
  const rings = Math.max(1, ring);
  const R = basketRadius(n) - 0.35, step = R / Math.max(1, Math.ceil(Math.sqrt(n / 6)));
  const r = Math.min(R, step * rings);
  const a = (idx / cap) * Math.PI * 2 + ring * 0.4;
  return { dx: Math.cos(a) * r, dy: BASKET_Y, dz: Math.sin(a) * r };
}

/** world pose of member i of n riding with the host */
export function memberPose(host, i, n) {
  const o = slotOffset(i, n);
  return { x: host.x + o.dx, y: host.y + o.dy, z: host.z + o.dz };
}

/** where member i of n lands when the basket is put down: a ring round the host on the host's floor */
export function dropPoint(host, i, n) {
  const per = 8, ring = Math.floor(i / per), k = i % per;
  const r = 1.8 + ring * 1.2, a = (k / per) * Math.PI * 2 + ring * 0.35;
  return { floor: host.floor, x: host.x + Math.cos(a) * r, y: host.y, z: host.z + Math.sin(a) * r };
}
