// OT-01 Chart Desk: a visitor uploads a stock chart image; a multimodal model (Claude or Gemini,
// whichever llm.js has) reads it and calls UP or DOWN with brief reasoning. Without a key the desk
// answers in DEMO mode from a pixel heuristic the client measured (the trace's slope), clearly labelled.
// Everything is notional analysis, not advice.

export const MAX_BYTES = 4 * 1024 * 1024; // 4 MB decoded
const TYPES = { 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff], 'image/webp': [0x52, 0x49, 0x46, 0x46] };
const err = (status, message) => Object.assign(new Error(message), { status });

/** data URL -> { mediaType, data(base64), bytes } after checking type, magic bytes and size */
export function parseImage(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw err(415, 'Upload a PNG, JPG or WebP image.');
  const mediaType = m[1] === 'image/jpg' ? 'image/jpeg' : m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_BYTES) throw err(413, 'Image too large (4 MB maximum).');
  if (buf.length < 64) throw err(400, 'That image is empty.');
  const magic = TYPES[mediaType];
  if (!magic.every((b, i) => buf[i] === b) || (mediaType === 'image/webp' && buf.toString('ascii', 8, 12) !== 'WEBP')) throw err(415, 'The file is not a valid PNG, JPG or WebP image.');
  return { mediaType, data: m[2], bytes: buf.length };
}

const SYSTEM = `You are the Chart Desk analyst at a satirical luxury financial firm in a game. A visitor uploads an image of a stock price chart. Read the chart (price line or candles, axes, any visible ticker, timeframe, indicators) and call the most likely NEXT move: UP or DOWN. Always choose one. Give 2-4 short, concrete reasons that refer to what is visible (trend, recent highs/lows, momentum, volume, support/resistance). confidence is 0..1 and should rarely exceed 0.75. If the image is not a price chart, set isChart false, still pick a direction, and say so in the reasons. Use corporate finance language. This is notional analysis for a game, not investment advice; never tell anyone to buy or sell. Never use the words casino, gambling, gamble, jackpot.`;
const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    direction: { type: 'string', enum: ['UP', 'DOWN'] },
    confidence: { type: 'number' },
    isChart: { type: 'boolean' },
    ticker: { type: 'string' },
    headline: { type: 'string' },
    reasons: { type: 'array', items: { type: 'string' } },
  },
  required: ['direction', 'confidence', 'isChart', 'ticker', 'headline', 'reasons'],
};

/** demo verdict from the client's pixel measurement: slope of the trace (screen y grows downward) */
export function heuristicVerdict(hint = {}) {
  const slope = Number(hint.slope), late = Number(hint.lateSlope);
  const s = Number.isFinite(late) ? late : Number.isFinite(slope) ? slope : 0;
  const direction = s <= 0 ? 'UP' : 'DOWN'; // negative screen slope = the line rises
  const strength = Math.min(1, Math.abs(s) * 4);
  return {
    direction, confidence: +(0.5 + strength * 0.2).toFixed(2), isChart: hint.coverage > 0.02, ticker: '', headline: `${direction === 'UP' ? 'Constructive' : 'Defensive'} posture (demo heuristic)`,
    reasons: [
      `The traced line ${s <= 0 ? 'rises' : 'falls'} across the most recent third of the image (pixel slope ${s.toFixed(3)}).`,
      'Demo mode: no AI key is configured, so this reads the shape of the line only, not the axes or the ticker.',
    ],
  };
}

export function createChartAnalyst({ llm, log = console }) {
  async function analyse({ image, hint }) {
    const img = parseImage(image);
    const out = await llm.json({
      job: 'chart_vision', agent: 'chart_desk', system: SYSTEM, schema: SCHEMA, maxTokens: 1200, minBreaker: 2,
      user: 'Analyse this chart. Return the JSON verdict.', images: [{ mediaType: img.mediaType, data: img.data }],
    });
    if (out && (out.direction === 'UP' || out.direction === 'DOWN')) {
      return { ...out, confidence: Math.max(0, Math.min(1, Number(out.confidence) || 0.5)), reasons: (out.reasons || []).slice(0, 4).map(String), mode: 'ai', provider: llm.provider(), notice: 'Notional analysis for entertainment. Not investment advice.' };
    }
    if (llm.enabled()) log.warn('[chart] model gave no verdict, using the demo heuristic');
    return { ...heuristicVerdict(hint), mode: 'demo', provider: null, notice: 'DEMO answer (no AI key configured). Notional analysis for entertainment. Not investment advice.' };
  }
  return { analyse };
}
