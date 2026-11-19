// HUD scale for small screens: the panels, wallet bar, dialogs and terminals were laid out for a
// ~1600×900 desktop. On smaller monitors (1366×768, 1280×720 laptops) they shrink with the window
// through the --ui CSS variable (applied with `zoom` in index.html). Touch devices keep 1: their
// layout has its own media rules and buttons must stay finger-sized.
//
// It also stops the browser zooming the whole page: a trackpad pinch arrives as ctrl+wheel (Safari:
// gesture events), and over a HUD panel that would zoom the website instead of the camera.

const REF_W = 1600, REF_H = 920, MIN = 0.62;

export function uiScale() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  return coarse ? 1 : Math.max(MIN, Math.min(1, innerWidth / REF_W, innerHeight / REF_H));
}

export function installUiScale() {
  const apply = () => document.documentElement.style.setProperty('--ui', uiScale().toFixed(3));
  apply();
  addEventListener('resize', apply);
  // never zoom the page itself (the 3D canvas turns pinch into camera zoom in player.js)
  addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  for (const t of ['gesturestart', 'gesturechange']) addEventListener(t, (e) => e.preventDefault(), { passive: false });
}

/** the zoom actually applied to an element (1 where the browser has no `zoom`) */
export const zoomOf = (el) => parseFloat(getComputedStyle(el).zoom) || 1;
