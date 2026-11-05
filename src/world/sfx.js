// Room-wide sound effects, synthesised with Web Audio (no audio files).
// Browsers only allow audio after a user gesture, so the context is created/resumed on the
// first click or key press. Counters let tests confirm sounds were triggered.

let ac = null;
let master = null;
function unlock() {
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0.55;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
  } catch { /* audio unavailable */ }
}
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

export const sfxStats = { gain: 0, loss: 0, silent: 0 };
const ready = () => ac && ac.state === 'running';

function noiseBuffer(sec) {
  const b = ac.createBuffer(1, Math.floor(ac.sampleRate * sec), ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function tone(type, f0, f1, t0, dur, vol) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function crowd(t0, dur, freq, vol, swell) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuffer(dur);
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.6;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + swell);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t0);
}

// Realised gain: bright two-note chime + crowd cheer.
export function playGain() {
  sfxStats.gain++;
  if (!ready()) { sfxStats.silent++; return; }
  const t = ac.currentTime;
  tone('sine', 988, 988, t, 0.35, 0.35);
  tone('sine', 1319, 1319, t + 0.11, 0.5, 0.3);
  crowd(t + 0.05, 1.6, 1500, 0.22, 0.25);
}
// Strategic contribution (loss): descending "womp" + crowd groan.
export function playLoss() {
  sfxStats.loss++;
  if (!ready()) { sfxStats.silent++; return; }
  const t = ac.currentTime;
  tone('triangle', 330, 110, t, 0.8, 0.35);
  crowd(t + 0.05, 1.2, 420, 0.18, 0.2);
}

// New position opened in a box: short bright "ka-ching" tick (quieter than a settlement).
export function playPosition() {
  sfxStats.position = (sfxStats.position || 0) + 1;
  if (!ready()) { sfxStats.silent++; return; }
  const t = ac.currentTime;
  tone('triangle', 1568, 1568, t, 0.12, 0.16);
  tone('triangle', 2093, 2093, t + 0.07, 0.22, 0.14);
}
