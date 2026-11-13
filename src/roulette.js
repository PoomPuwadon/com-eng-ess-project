import { RED, BLACK } from '../server/games/roulette.js';
import { spinTo } from './floors/leisureSuite.js';

export class RouletteController {
  constructor(net) {
    this.net = net;
    this.overlay = null;
    this.joinBtn = null;
    this.hudBalance = null;

    this.isOpen = false;
    this.balance = 10000;
    this.phase = 'OPEN';
    this.endsAt = Date.now();
    this.roundId = 0;
    this.history = [];
    this.positions = []; // [{ cid, type, numbers, stake, status }]
    this.lastRoundPositions = []; // for Repeat Last

    this.selectedToken = 100;
    this.selectedType = 'straight';
    this.stagedNumbers = [];

    this.cidCounter = 1;
    this.resultBannerTimeout = null;

    this.buildHudBalance();
    this.buildJoinButton();
    this.buildOverlay();

    // Hook net messages
    this.net.onRoulette = (m) => this.onMessage(m);

    // Initial join to get state if already online
    if (this.net.ws && this.net.ws.readyState === 1) {
      this.net.send({ t: 'rl_join' });
    }

    // Phase tick loop
    setInterval(() => this.updateTimer(), 100);
  }

  nextCid() {
    return `c_${Date.now()}_${this.cidCounter++}`;
  }

  serverNow() {
    return Date.now() + (this.net.serverTimeOffset || 0);
  }

  buildHudBalance() {
    const el = document.createElement('div');
    el.id = 'hud-nu-balance';
    el.style.cssText =
      'position:fixed;top:12px;left:290px;z-index:28;padding:5px 10px;background:rgba(10,12,18,0.85);border:1px solid rgba(201,162,58,0.6);border-radius:6px;font-family:system-ui;pointer-events:none;';
    el.innerHTML = `
      <div id="hud-nu-amount" style="font-weight:700;font-size:14px;color:#f2c14a;">NU 10,000</div>
      <div style="font-size:9px;color:#aaa;letter-spacing:0.02em;">All balances are notional. No real currency is accepted, held or paid out.</div>
    `;
    document.body.appendChild(el);
    this.hudBalance = el.querySelector('#hud-nu-amount');
  }

  buildJoinButton() {
    const btn = document.createElement('button');
    btn.id = 'rv-join-btn';
    btn.textContent = 'Join Rotational Variance Instrument';
    btn.style.cssText =
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:35;display:none;padding:10px 18px;font:700 14px system-ui;color:#14110d;background:#f2c14a;border:2px solid #b8924a;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.6);cursor:pointer;touch-action:manipulation;';
    btn.onclick = (e) => {
      e.stopPropagation();
      this.open();
    };
    document.body.appendChild(btn);
    this.joinBtn = btn;
  }

  buildOverlay() {
    const wrap = document.createElement('div');
    wrap.id = 'roulette-overlay';
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:120;background:rgba(8,10,15,0.95);display:none;flex-direction:column;align-items:center;padding:12px;box-sizing:border-box;font-family:system-ui;color:#eee;overflow-y:auto;';

    wrap.innerHTML = `
      <div style="width:100%;max-width:880px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #b8924a;padding-bottom:8px;margin-bottom:10px;">
        <div>
          <div style="font-size:18px;font-weight:700;color:#f2c14a;">Rotational Variance Instrument</div>
          <div style="font-size:11px;color:#aaa;">Executive Leisure Suite · VT-01 · European Standard Layout</div>
        </div>
        <div style="text-align:right;">
          <div id="rv-balance" style="font-size:18px;font-weight:700;color:#7be3a0;">NU 10,000</div>
          <div style="font-size:10px;color:#aaa;">Portfolio Liquidity</div>
        </div>
        <button id="rv-close" style="background:#221c14;border:1px solid #b8924a;color:#eee;font-size:16px;width:32px;height:32px;border-radius:6px;cursor:pointer;">✕</button>
      </div>

      <div style="width:100%;max-width:880px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding:6px 12px;background:#14110d;border:1px solid #4a3c20;border-radius:6px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:12px;color:#aaa;">CYCLE PHASE:</span>
          <span id="rv-phase-name" style="font-weight:700;font-size:14px;color:#ffd877;">OPEN</span>
          <span id="rv-countdown" style="font-weight:700;font-size:14px;color:#7be3a0;">35s</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:11px;color:#aaa;">RECENT:</span>
          <div id="rv-history" style="display:flex;gap:4px;"></div>
        </div>
      </div>

      <div id="rv-result-banner" style="display:none;width:100%;max-width:880px;padding:10px;text-align:center;font-weight:700;font-size:16px;border-radius:6px;margin-bottom:8px;"></div>

      <div style="width:100%;max-width:880px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:12px;color:#aaa;">POSITION TYPE:</span>
        <div id="rv-type-selector" style="display:flex;gap:4px;">
          <button data-type="straight" class="rv-type-btn on">Straight (1)</button>
          <button data-type="split" class="rv-type-btn">Split (2)</button>
          <button data-type="street" class="rv-type-btn">Street (3)</button>
          <button data-type="corner" class="rv-type-btn">Corner (4)</button>
          <button data-type="sixline" class="rv-type-btn">Six line (6)</button>
        </div>
        <span id="rv-stage-hint" style="font-size:11px;color:#f2c14a;"></span>
      </div>

      <div id="rv-grid-container" style="width:100%;max-width:880px;background:#0d1117;padding:8px;border:1px solid #333a4a;border-radius:8px;margin-bottom:10px;">
        <!-- Board table built in JS -->
      </div>

      <div style="width:100%;max-width:880px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:12px;color:#aaa;">ALLOCATION:</span>
          <div id="rv-tokens" style="display:flex;gap:6px;">
            <button data-val="10" class="rv-token-btn">10</button>
            <button data-val="50" class="rv-token-btn">50</button>
            <button data-val="100" class="rv-token-btn on">100</button>
            <button data-val="500" class="rv-token-btn">500</button>
            <button data-val="1000" class="rv-token-btn">1,000</button>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="rv-repeat" style="padding:6px 12px;border:1px solid #b8924a;background:#221c14;color:#f2c14a;border-radius:5px;cursor:pointer;">Repeat last</button>
          <button id="rv-clear" style="padding:6px 12px;border:1px solid #8a2a2a;background:#241212;color:#f0a0a0;border-radius:5px;cursor:pointer;">Clear allocations</button>
        </div>
      </div>

      <div style="width:100%;max-width:880px;border-top:1px solid #333a4a;padding-top:8px;">
        <div style="font-size:12px;font-weight:700;color:#c9a23a;margin-bottom:4px;">YOUR OPEN POSITIONS THIS ROUND</div>
        <div id="rv-positions-list" style="display:flex;flex-wrap:wrap;gap:6px;min-height:36px;">
          <div style="font-size:11px;color:#777;padding:6px 0;">No allocations placed yet.</div>
        </div>
      </div>

      <div style="font-size:10px;color:#666;margin-top:12px;text-align:center;">
        All balances are notional. No real currency is accepted, held or paid out. · Press Esc or click ✕ to close
      </div>
    `;

    document.body.appendChild(wrap);
    this.overlay = wrap;

    wrap.querySelector('#rv-close').onclick = () => this.close();
    wrap.querySelector('#rv-clear').onclick = () => this.clear();
    wrap.querySelector('#rv-repeat').onclick = () => this.repeatLast();

    // Type selector clicks
    wrap.querySelectorAll('.rv-type-btn').forEach((b) => {
      b.onclick = () => {
        wrap.querySelectorAll('.rv-type-btn').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        this.selectedType = b.dataset.type;
        this.stagedNumbers = [];
        this.updateStageHint();
      };
    });

    // Token clicks
    wrap.querySelectorAll('.rv-token-btn').forEach((b) => {
      b.onclick = () => {
        wrap.querySelectorAll('.rv-token-btn').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        this.selectedToken = Number(b.dataset.val);
      };
    });

    this.renderBoard();
  }

  renderBoard() {
    const container = this.overlay.querySelector('#rv-grid-container');
    let html = '<table style="width:100%;border-collapse:collapse;user-select:none;text-align:center;font-size:13px;">';

    // 0 on top spanning across
    html += `<tr><td data-num="0" class="rv-cell green" colspan="12" style="padding:10px 0;font-size:16px;font-weight:700;cursor:pointer;border:1px solid #4a5468;">0</td></tr>`;

    // 3 rows x 12 cols
    // Row 3 (top row of 3x12): 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36
    // Row 2 (mid): 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35
    // Row 1 (bot): 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34
    for (let rowIdx = 3; rowIdx >= 1; rowIdx--) {
      html += '<tr>';
      for (let colIdx = 0; colIdx < 12; colIdx++) {
        const num = colIdx * 3 + rowIdx;
        const isRed = RED.has(num);
        const colClass = isRed ? 'red' : 'black';
        html += `<td data-num="${num}" class="rv-cell ${colClass}" style="padding:12px 2px;font-weight:700;cursor:pointer;border:1px solid #4a5468;">${num}</td>`;
      }
      html += `<td data-outside="col" data-col="${rowIdx}" class="rv-cell outside" style="padding:6px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid #b8924a;background:#182030;color:#ffd877;">Col ${rowIdx}</td>`;
      html += '</tr>';
    }

    // Dozens row
    html += `<tr>
      <td data-outside="dozen" data-dozen="1" colspan="4" class="rv-cell outside" style="padding:8px 0;font-weight:700;cursor:pointer;border:1px solid #b8924a;background:#182030;color:#ffd877;">1st 12</td>
      <td data-outside="dozen" data-dozen="2" colspan="4" class="rv-cell outside" style="padding:8px 0;font-weight:700;cursor:pointer;border:1px solid #b8924a;background:#182030;color:#ffd877;">2nd 12</td>
      <td data-outside="dozen" data-dozen="3" colspan="4" class="rv-cell outside" style="padding:8px 0;font-weight:700;cursor:pointer;border:1px solid #b8924a;background:#182030;color:#ffd877;">3rd 12</td>
      <td></td>
    </tr>`;

    // Outside even-money row
    html += `<tr>
      <td data-outside="low" colspan="2" class="rv-cell outside" style="padding:8px 0;font-weight:700;cursor:pointer;border:1px solid #b8924a;background:#182030;color:#ffd877;">1–18</td>
      <td data-outside="even" colspan="2" class="rv-cell outside" style="padding:8px 0;font-weight:700;cursor:pointer;border:1px solid #b8924a;background:#182030;color:#ffd877;">EVEN</td>
      <td data-outside="red" colspan="2" class="rv-cell outside red" style="padding:8px 0;font-weight:700;cursor:pointer;border:1px solid #b8924a;color:#fff;">RED</td>
      <td data-outside="black" colspan="2" class="rv-cell outside black" style="padding:8px 0;font-weight:700;cursor:pointer;border:1px solid #b8924a;color:#fff;">BLACK</td>
      <td data-outside="odd" colspan="2" class="rv-cell outside" style="padding:8px 0;font-weight:700;cursor:pointer;border:1px solid #b8924a;background:#182030;color:#ffd877;">ODD</td>
      <td data-outside="high" colspan="2" class="rv-cell outside" style="padding:8px 0;font-weight:700;cursor:pointer;border:1px solid #b8924a;background:#182030;color:#ffd877;">19–36</td>
      <td></td>
    </tr>`;

    html += '</table>';
    container.innerHTML = html;

    // Attach click listeners to cells
    container.querySelectorAll('td[data-num]').forEach((td) => {
      td.onclick = () => this.onNumberClick(Number(td.dataset.num));
    });

    container.querySelectorAll('td[data-outside]').forEach((td) => {
      td.onclick = () => this.onOutsideClick(td.dataset.outside, td.dataset);
    });
  }

  updateStageHint() {
    const el = this.overlay.querySelector('#rv-stage-hint');
    if (!el) return;
    const count = this.stagedNumbers.length;
    if (this.selectedType === 'straight') {
      el.textContent = 'Click any number to allocate';
    } else if (this.selectedType === 'split') {
      el.textContent = count === 0 ? 'Click 1st number for split' : `1st: ${this.stagedNumbers[0]} · Click 2nd adjacent number`;
    } else if (this.selectedType === 'street') {
      el.textContent = count === 0 ? 'Click any number in row (or 0 for 0-1-2 / 0-2-3)' : `Selected: [${this.stagedNumbers.join(',')}]`;
    } else if (this.selectedType === 'corner') {
      el.textContent = count === 0 ? 'Click corner numbers (4)' : `Selected ${count}/4: [${this.stagedNumbers.join(',')}]`;
    } else if (this.selectedType === 'sixline') {
      el.textContent = count === 0 ? 'Click 1st row for six line' : `Selected: [${this.stagedNumbers.join(',')}]`;
    }
  }

  onNumberClick(num) {
    if (this.phase !== 'OPEN') return;

    if (this.selectedType === 'straight') {
      this.placePosition('straight', [num], this.selectedToken);
      return;
    }

    if (this.selectedType === 'split') {
      if (this.stagedNumbers.length === 0) {
        this.stagedNumbers.push(num);
        this.updateStageHint();
      } else {
        const [first] = this.stagedNumbers;
        this.stagedNumbers = [];
        this.updateStageHint();
        if (first !== num) {
          this.placePosition('split', [first, num], this.selectedToken);
        }
      }
      return;
    }

    if (this.selectedType === 'street') {
      if (num === 0) {
        this.stagedNumbers = [0];
        this.updateStageHint();
        return;
      }
      if (this.stagedNumbers.length === 1 && this.stagedNumbers[0] === 0) {
        // 0 with 1 -> [0, 1, 2], with 2 -> [0, 1, 2] or [0, 2, 3], with 3 -> [0, 2, 3]
        const street = num === 3 ? [0, 2, 3] : [0, 1, 2];
        this.stagedNumbers = [];
        this.updateStageHint();
        this.placePosition('street', street, this.selectedToken);
        return;
      }
      // Click any number in row automatically forms that 3-number row street!
      const row = Math.ceil(num / 3);
      const street = [3 * row - 2, 3 * row - 1, 3 * row];
      this.placePosition('street', street, this.selectedToken);
      return;
    }

    if (this.selectedType === 'corner') {
      if (!this.stagedNumbers.includes(num)) {
        this.stagedNumbers.push(num);
      }
      this.updateStageHint();
      if (this.stagedNumbers.length === 4) {
        const corner = [...this.stagedNumbers];
        this.stagedNumbers = [];
        this.updateStageHint();
        this.placePosition('corner', corner, this.selectedToken);
      }
      return;
    }

    if (this.selectedType === 'sixline') {
      if (num === 0) return;
      const row = Math.ceil(num / 3);
      const adjRow = row < 12 ? row + 1 : row - 1;
      const r1 = Math.min(row, adjRow);
      const sixline = [3 * r1 - 2, 3 * r1 - 1, 3 * r1, 3 * r1 + 1, 3 * r1 + 2, 3 * r1 + 3];
      this.placePosition('sixline', sixline, this.selectedToken);
    }
  }

  onOutsideClick(type, data) {
    if (this.phase !== 'OPEN') return;

    if (type === 'dozen') {
      this.placePosition('dozen', [Number(data.dozen)], this.selectedToken);
      return;
    }
    if (type === 'col') {
      this.placePosition('column', [Number(data.col)], this.selectedToken);
      return;
    }
    this.placePosition(type, [], this.selectedToken);
  }

  placePosition(type, numbers, stake) {
    if (this.balance < stake) {
      this.showToast('Insufficient balance for allocation');
      return;
    }

    const cid = this.nextCid();
    const pendingPos = {
      cid,
      type,
      numbers,
      stake,
      status: 'pending'
    };
    this.positions.push(pendingPos);
    this.renderPositionsList();

    this.net.send({
      t: 'rl_place',
      type,
      numbers,
      stake,
      cid
    });
  }

  clear() {
    if (this.phase !== 'OPEN') return;
    this.net.send({ t: 'rl_clear' });
  }

  repeatLast() {
    if (this.phase !== 'OPEN') return;
    if (!this.lastRoundPositions.length) {
      this.showToast('No previous allocations to repeat');
      return;
    }
    for (const pos of this.lastRoundPositions) {
      this.placePosition(pos.type, pos.numbers, pos.stake);
    }
  }

  open() {
    document.exitPointerLock?.();
    this.isOpen = true;
    this.overlay.style.display = 'flex';
    this.net.send({ t: 'rl_join' });
  }

  close() {
    this.isOpen = false;
    this.overlay.style.display = 'none';
  }

  showToast(msg) {
    if (this.net.hud && this.net.hud.toast) {
      this.net.hud.toast(msg, 2.5);
    }
  }

  updateTimer() {
    if (!this.overlay) return;
    const now = this.serverNow();
    const leftSec = Math.max(0, Math.ceil((this.endsAt - now) / 1000));

    const nameEl = this.overlay.querySelector('#rv-phase-name');
    const cdEl = this.overlay.querySelector('#rv-countdown');
    if (nameEl) nameEl.textContent = this.phase;
    if (cdEl) cdEl.textContent = `${leftSec}s`;

    // Phase color indication
    if (this.phase === 'OPEN') {
      if (nameEl) nameEl.style.color = '#7be3a0';
    } else if (this.phase === 'CLOSED') {
      if (nameEl) nameEl.style.color = '#e3c27a';
    } else if (this.phase === 'SPINNING') {
      if (nameEl) nameEl.style.color = '#ff9f1c';
    } else if (this.phase === 'RESULT') {
      if (nameEl) nameEl.style.color = '#3db7ff';
    }
  }

  renderPositionsList() {
    const listEl = this.overlay.querySelector('#rv-positions-list');
    if (!listEl) return;

    if (!this.positions.length) {
      listEl.innerHTML = '<div style="font-size:11px;color:#777;padding:6px 0;">No allocations placed yet.</div>';
      return;
    }

    listEl.innerHTML = this.positions
      .map((p) => {
        const numStr = p.numbers && p.numbers.length ? `[${p.numbers.join(',')}]` : '';
        const statusColor = p.status === 'confirmed' ? '#7be3a0' : '#ffd877';
        return `
          <div style="background:#141720;border:1px solid #333a4a;border-radius:4px;padding:4px 8px;font-size:11px;display:flex;align-items:center;gap:6px;">
            <b style="color:#f2c14a;text-transform:capitalize;">${p.type}</b>
            <span>${numStr}</span>
            <span style="color:#eee;">${p.stake} NU</span>
            <span style="color:${statusColor};font-size:9px;">[${p.status}]</span>
          </div>
        `;
      })
      .join('');
  }

  renderHistory() {
    const el = this.overlay.querySelector('#rv-history');
    if (!el) return;
    el.innerHTML = this.history
      .map((n) => {
        const isRed = RED.has(n);
        const bg = n === 0 ? '#1f8a4c' : isRed ? '#c0141f' : '#121212';
        return `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:${bg};border:1px solid #777;font-size:10px;font-weight:700;color:#fff;">${n}</span>`;
      })
      .join('');
  }

  showResultBanner(net, result) {
    const b = this.overlay.querySelector('#rv-result-banner');
    if (!b) return;
    clearTimeout(this.resultBannerTimeout);

    const isRed = RED.has(result);
    const colName = result === 0 ? 'GREEN 0' : isRed ? `RED ${result}` : `BLACK ${result}`;

    if (net > 0) {
      b.style.display = 'block';
      b.style.background = 'rgba(23,99,58,0.85)';
      b.style.color = '#7be3a0';
      b.style.border = '1px solid #5cc98a';
      b.textContent = `Result: ${colName} · Realised gain: +NU ${net.toLocaleString()}`;
    } else if (net < 0) {
      b.style.display = 'block';
      b.style.background = 'rgba(120,40,20,0.85)';
      b.style.color = '#f2a08a';
      b.style.border = '1px solid #c0503a';
      b.textContent = `Result: ${colName} · Strategic contribution: NU ${Math.abs(net).toLocaleString()}`;
    } else {
      b.style.display = 'block';
      b.style.background = 'rgba(30,35,45,0.85)';
      b.style.color = '#ffd877';
      b.style.border = '1px solid #b8924a';
      b.textContent = `Result: ${colName} · Allocation returned`;
    }

    this.resultBannerTimeout = setTimeout(() => {
      b.style.display = 'none';
    }, 9000);
  }

  setBalance(bal) {
    this.balance = bal;
    const formatted = `NU ${bal.toLocaleString()}`;
    if (this.hudBalance) this.hudBalance.textContent = formatted;
    const ovBal = this.overlay.querySelector('#rv-balance');
    if (ovBal) ovBal.textContent = formatted;
  }

  onMessage(m) {
    if (m.t === 'bal') {
      this.setBalance(m.balance);
      return;
    }

    if (m.t === 'rl_state') {
      this.phase = m.phase;
      this.endsAt = m.endsAt;
      this.roundId = m.roundId;
      this.history = m.history || [];
      this.setBalance(m.balance);
      this.positions = (m.positions || []).map((p) => ({ ...p, status: 'confirmed' }));
      this.renderPositionsList();
      this.renderHistory();
      return;
    }

    if (m.t === 'rl_phase') {
      this.phase = m.phase;
      this.endsAt = m.endsAt;
      this.roundId = m.roundId;
      if (m.phase === 'SPINNING' && m.result !== undefined) {
        const dur = Math.max(2, (m.endsAt - this.serverNow()) / 1000);
        spinTo(m.result, dur);
      }
      if (m.phase === 'RESULT' && m.result !== undefined) {
        this.history.push(m.result);
        if (this.history.length > 12) this.history.shift();
        this.renderHistory();
      }
      if (m.phase === 'OPEN') {
        // Save previous round positions for Repeat Last, then clear
        if (this.positions.length) {
          this.lastRoundPositions = this.positions.map((p) => ({
            type: p.type,
            numbers: p.numbers,
            stake: p.stake
          }));
        }
        this.positions = [];
        this.renderPositionsList();
      }
      return;
    }

    if (m.t === 'rl_ok') {
      const idx = this.positions.findIndex((p) => p.cid === m.cid);
      if (idx !== -1) {
        this.positions[idx] = { ...this.positions[idx], ...m.position, status: 'confirmed' };
      }
      this.renderPositionsList();
      if (m.balance !== undefined) this.setBalance(m.balance);
      return;
    }

    if (m.t === 'rl_err') {
      this.positions = this.positions.filter((p) => p.cid !== m.cid);
      this.renderPositionsList();
      this.showToast(`Allocation rejected: ${m.reason}`);
      return;
    }

    if (m.t === 'rl_cleared') {
      this.positions = [];
      this.renderPositionsList();
      if (m.balance !== undefined) this.setBalance(m.balance);
      this.showToast('Allocations cleared');
      return;
    }

    if (m.t === 'rl_result') {
      this.setBalance(m.balance);
      this.showResultBanner(m.net, m.result);
      return;
    }
  }

  updateProximity(player) {
    if (!player || !player.floor || player.floor.id !== 'VT-01') {
      if (this.joinBtn) this.joinBtn.style.display = 'none';
      return;
    }

    // Roulette tables on VT-01 are at X 58..202 step 9, Z in [-14.6, -21.5, -28.4]
    const px = player.pos.x;
    const pz = player.pos.z;
    let near = false;

    for (let x = 58; x <= 202; x += 9) {
      for (const z of [-14.6, -21.5, -28.4]) {
        const dx = px - x;
        const dz = pz - z;
        if (dx * dx + dz * dz <= 2.5 * 2.5) {
          near = true;
          break;
        }
      }
      if (near) break;
    }

    if (this.joinBtn) {
      this.joinBtn.style.display = near && !this.isOpen ? 'block' : 'none';
    }
  }
}
