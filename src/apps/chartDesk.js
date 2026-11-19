// OT-01 Chart Desk: "Upload Stock Graph". The image goes to the server, which asks a multimodal
// model for UP or DOWN plus brief reasoning (or answers in clearly labelled DEMO mode without a key).
// The browser also measures the trace's slope from the pixels (sent as a hint for the demo mode).
import { registerApp } from './shell.js';
import { api, esc } from '../net/api.js';

const MAX = 4 * 1024 * 1024, TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Find the plotted line: per column, the most saturated/dark non-background pixel; fit slopes. */
function measure(img) {
  const W = 240, H = Math.max(40, Math.round((img.naturalHeight / img.naturalWidth) * 240));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  // background = the most common corner colour
  const bg = [d[0], d[1], d[2]];
  const pts = [];
  for (let x = Math.floor(W * 0.06); x < W * 0.97; x++) {
    let best = -1, by = -1;
    for (let y = Math.floor(H * 0.05); y < H * 0.92; y++) {
      const i = (y * W + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2];
      const diff = Math.abs(r - bg[0]) + Math.abs(gg - bg[1]) + Math.abs(b - bg[2]);
      const sat = Math.max(r, gg, b) - Math.min(r, gg, b);
      const score = diff + sat * 1.5;
      if (score > best) { best = score; by = y; }
    }
    if (best > 90) pts.push([x / W, by / H]);
  }
  const fit = (p) => { if (p.length < 4) return 0; const n = p.length, mx = p.reduce((s, q) => s + q[0], 0) / n, my = p.reduce((s, q) => s + q[1], 0) / n; let num = 0, den = 0; for (const [x, y] of p) { num += (x - mx) * (y - my); den += (x - mx) ** 2; } return den ? num / den : 0; };
  return { slope: fit(pts), lateSlope: fit(pts.filter((q) => q[0] > 0.66)), coverage: pts.length / W };
}

/** Read an image file for the desk: checks type and size, returns { dataUrl, hint } (hint = the measured slope). */
export function readChart(file) {
  return new Promise((ok, fail) => {
    if (!file) return fail(new Error('No image.'));
    if (!TYPES.includes(file.type)) return fail(new Error('Please choose a PNG, JPG or WebP image.'));
    if (file.size > MAX) return fail(new Error('That image is over 4 MB.'));
    const r = new FileReader();
    r.onerror = () => fail(new Error('Could not read that image.'));
    r.onload = () => { const img = new Image(); img.onload = () => { let hint = null; try { hint = measure(img); } catch { hint = null; } ok({ dataUrl: r.result, hint }); }; img.onerror = () => fail(new Error('That file is not a readable image.')); img.src = r.result; };
    r.readAsDataURL(file);
  });
}
/** Ask the desk (server: AI model, or the labelled demo heuristic) for UP / DOWN. */
export const analyseChart = (image, hint) => api('/api/vision/chart', { method: 'POST', body: { image, hint } });

// The original full-screen version stays registered (the physical terminal by the portal, src/apps/chartKiosk.js, is the main way in).
registerApp('chartdesk', {
  title: 'Chart Desk · Upload Stock Graph',
  sub: 'OT-01 Trading Floor · AI chart reading · notional analysis, not advice',
  mount(body) {
    body.innerHTML = `<div class="grid g2">
      <div class="card"><h3>Upload a stock chart</h3>
        <p class="muted">PNG, JPG or WebP, up to 4 MB. A screenshot of any price chart works best (line or candles, with the axes visible).</p>
        <label class="cd-drop" style="display:block;border:2px dashed var(--line);border-radius:10px;padding:22px;text-align:center;cursor:pointer">
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden>
          <b>Choose an image</b> or drop it here
        </label>
        <img class="cd-prev" alt="" style="display:none;max-width:100%;max-height:260px;margin-top:10px;border-radius:8px;border:1px solid var(--line)">
        <div style="margin-top:10px"><button class="btn primary cd-go" disabled>Analyse chart</button> <span class="muted cd-st"></span></div>
      </div>
      <div class="card"><h3>Verdict</h3><div class="cd-out"><div class="empty">Upload a chart to receive the desk's call.</div></div></div>
    </div>`;
    const input = body.querySelector('input'), drop = body.querySelector('.cd-drop'), prev = body.querySelector('.cd-prev');
    const go = body.querySelector('.cd-go'), st = body.querySelector('.cd-st'), out = body.querySelector('.cd-out');
    let dataUrl = null, hint = null;
    const take = (file) => {
      if (!file) return;
      if (!TYPES.includes(file.type)) { st.textContent = 'Please choose a PNG, JPG or WebP image.'; return; }
      if (file.size > MAX) { st.textContent = 'That image is over 4 MB.'; return; }
      const r = new FileReader();
      r.onload = () => { dataUrl = r.result; prev.src = dataUrl; prev.style.display = 'block'; prev.onload = () => { try { hint = measure(prev); } catch { hint = null; } }; go.disabled = false; st.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`; };
      r.readAsDataURL(file);
    };
    input.onchange = () => take(input.files[0]);
    drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = 'var(--gold)'; };
    drop.ondragleave = () => { drop.style.borderColor = ''; };
    drop.ondrop = (e) => { e.preventDefault(); drop.style.borderColor = ''; take(e.dataTransfer.files[0]); };
    go.onclick = async () => {
      go.disabled = true; st.textContent = 'The desk is reading your chart…';
      try {
        const v = await api('/api/vision/chart', { method: 'POST', body: { image: dataUrl, hint } });
        const up = v.direction === 'UP';
        out.innerHTML = `<div style="font:900 54px/1 system-ui;color:${up ? 'var(--up)' : 'var(--down)'};letter-spacing:.04em">${up ? '▲ UP' : '▼ DOWN'}</div>
          <div class="muted" style="margin:4px 0 10px">${v.mode === 'ai' ? `AI reading (${esc(v.provider)})` : '<b style="color:var(--gold2)">DEMO MODE</b> · heuristic, no AI key configured'} · confidence ${(v.confidence * 100).toFixed(0)}%${v.ticker ? ` · ${esc(v.ticker)}` : ''}${v.isChart === false ? ' · <b>not recognised as a price chart</b>' : ''}</div>
          <div style="font-weight:700;margin-bottom:6px">${esc(v.headline || '')}</div>
          <ul style="margin:0 0 10px 18px;padding:0">${(v.reasons || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          <div class="muted" style="font-size:12px;border-top:1px solid var(--line);padding-top:8px">${esc(v.notice)}</div>`;
        st.textContent = '';
      } catch (e) { st.textContent = e.message; }
      go.disabled = false;
    };
  },
});
