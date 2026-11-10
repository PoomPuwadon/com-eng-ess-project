// PROTOTYPE device detection + quality tier.
//   ?touch=1 / ?touch=0  force touch controls on/off
//   ?q=low / ?q=high     force the quality tier (default: low on touch devices, high elsewhere)
const q = new URLSearchParams(location.search);
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const IS_TOUCH = q.has('touch') ? q.get('touch') !== '0' : coarse && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
export const QUALITY = q.get('q') === 'low' || q.get('q') === 'high' ? q.get('q') : IS_TOUCH ? 'low' : 'high';
export const LOW = QUALITY === 'low';
