export class AdminPanel {
  constructor(net) {
    this.net = net;
    this.panel = null;
    this.btn = null;
    this.isOpen = false;
    this.activeTab = 'players';

    this.players = [];
    this.treasury = 0;
    this.config = {
      startBalance: 10000,
      min: 10,
      maxPerPosition: 5000,
      maxPerRound: 20000,
      phases: { open: 35, closed: 3, spinning: 12, result: 8 }
    };
    this.auditEntries = [];

    this.buildButton();
    this.buildPanel();

    this.net.onAdminMessage = (m) => this.onMessage(m);
  }

  buildButton() {
    const btn = document.createElement('button');
    btn.id = 'admin-panel-btn';
    btn.textContent = 'Admin panel';
    btn.style.cssText =
      'position:fixed;left:390px;top:104px;z-index:30;display:none;font:600 12px system-ui;padding:5px 10px;border-radius:6px;border:1px solid #c9a23a;background:#14110de6;color:#e3c27a;cursor:pointer;touch-action:manipulation;';
    btn.onclick = (e) => {
      e.stopPropagation();
      this.toggle();
    };
    document.body.appendChild(btn);
    this.btn = btn;
  }

  showButton() {
    if (this.btn) this.btn.style.display = 'block';
  }

  buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'admin-panel';
    panel.style.cssText =
      'position:fixed;top:60px;right:16px;width:min(680px,94vw);max-height:82vh;z-index:90;background:rgba(12,14,20,0.96);border:1px solid #c9a23a;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.8);display:none;flex-direction:column;font-family:system-ui;color:#eee;box-sizing:border-box;overflow:hidden;';

    panel.innerHTML = `
      <div style="padding:10px 14px;background:#18130e;border-bottom:1px solid #6b5220;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:700;font-size:15px;color:#f2c14a;">Firm Executive Administration</div>
          <div id="adm-treasury" style="font-size:12px;font-weight:600;color:#7be3a0;">Treasury Reserve: NU 0</div>
        </div>
        <button id="adm-close" style="background:transparent;border:0;color:#aaa;font-size:18px;cursor:pointer;padding:2px 8px;">✕</button>
      </div>

      <div style="display:flex;border-bottom:1px solid #333a4a;background:#111520;">
        <button data-tab="players" class="adm-tab-btn active" style="flex:1;padding:8px 12px;border:0;background:transparent;color:#f2c14a;font-weight:700;border-bottom:2px solid #f2c14a;cursor:pointer;">Players</button>
        <button data-tab="settings" class="adm-tab-btn" style="flex:1;padding:8px 12px;border:0;background:transparent;color:#888;cursor:pointer;">Settings</button>
        <button data-tab="audit" class="adm-tab-btn" style="flex:1;padding:8px 12px;border:0;background:transparent;color:#888;cursor:pointer;">Audit Log</button>
      </div>

      <div id="adm-body" style="padding:12px;overflow-y:auto;flex:1;font-size:12px;"></div>
    `;

    document.body.appendChild(panel);
    this.panel = panel;

    panel.querySelector('#adm-close').onclick = () => this.close();

    panel.querySelectorAll('.adm-tab-btn').forEach((btn) => {
      btn.onclick = () => {
        panel.querySelectorAll('.adm-tab-btn').forEach((b) => {
          b.classList.remove('active');
          b.style.color = '#888';
          b.style.borderBottom = 'none';
        });
        btn.classList.add('active');
        btn.style.color = '#f2c14a';
        btn.style.borderBottom = '2px solid #f2c14a';
        this.activeTab = btn.dataset.tab;
        this.renderTab();
        if (this.activeTab === 'audit') {
          this.net.send({ t: 'adm_audit' });
        }
      };
    });
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    this.isOpen = true;
    this.panel.style.display = 'flex';
    this.net.send({ t: 'adm_list' });
    this.renderTab();
  }

  close() {
    this.isOpen = false;
    this.panel.style.display = 'none';
  }

  onMessage(m) {
    if (m.t === 'adm_players') {
      this.players = m.players || [];
      this.treasury = m.treasury ?? this.treasury;
      this.config = m.config || this.config;
      const tEl = this.panel.querySelector('#adm-treasury');
      if (tEl) {
        tEl.textContent = `Treasury Reserve: NU ${this.treasury.toLocaleString()}`;
        tEl.style.color = this.treasury < 0 ? '#f2a08a' : '#7be3a0';
      }
      if (this.isOpen && this.activeTab === 'players') {
        this.renderPlayersTab();
      }
      return;
    }

    if (m.t === 'adm_audit') {
      this.auditEntries = m.entries || [];
      if (this.isOpen && this.activeTab === 'audit') {
        this.renderAuditTab();
      }
      return;
    }

    if (m.t === 'adm_err') {
      if (this.net.hud?.toast) {
        this.net.hud.toast(`Admin error: ${m.reason}`, 3);
      }
    }
  }

  renderTab() {
    if (this.activeTab === 'players') this.renderPlayersTab();
    else if (this.activeTab === 'settings') this.renderSettingsTab();
    else if (this.activeTab === 'audit') this.renderAuditTab();
  }

  renderPlayersTab() {
    const body = this.panel.querySelector('#adm-body');
    if (!this.players.length) {
      body.innerHTML = '<div style="color:#aaa;text-align:center;padding:20px;">No connected players found.</div>';
      return;
    }

    let html = `
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="border-bottom:1px solid #4a3c20;color:#c9a23a;text-align:left;">
            <th style="padding:4px;">ID</th>
            <th style="padding:4px;">Name</th>
            <th style="padding:4px;">Role</th>
            <th style="padding:4px;">Floor</th>
            <th style="padding:4px;">Balance</th>
            <th style="padding:4px;">Open</th>
            <th style="padding:4px;">Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const p of this.players) {
      const roles = ['visitor', 'cleared', 'tour', 'admin', 'ceo'];
      const roleOpts = roles
        .map((r) => `<option value="${r}"${r === p.role ? ' selected' : ''}>${r}</option>`)
        .join('');

      html += `
        <tr style="border-bottom:1px solid #222633;">
          <td style="padding:6px 4px;color:#aaa;">${p.id}</td>
          <td style="padding:6px 4px;">
            <input id="p-name-${p.id}" value="${p.name}" style="width:75px;padding:2px 4px;background:#181e2b;border:1px solid #444;color:#fff;border-radius:3px;">
            <button data-action="name" data-id="${p.id}" style="padding:2px 5px;font-size:10px;cursor:pointer;">Set</button>
          </td>
          <td style="padding:6px 4px;">
            <select id="p-role-${p.id}" style="background:#181e2b;border:1px solid #444;color:#fff;border-radius:3px;font-size:10px;">${roleOpts}</select>
            <button data-action="role" data-id="${p.id}" style="padding:2px 5px;font-size:10px;cursor:pointer;">Set</button>
          </td>
          <td style="padding:6px 4px;color:#8fa8c8;">${p.floor || '—'}</td>
          <td style="padding:6px 4px;font-weight:700;color:#7be3a0;">
            <input id="p-bal-${p.id}" type="number" value="${p.balance}" style="width:65px;padding:2px 4px;background:#181e2b;border:1px solid #444;color:#7be3a0;border-radius:3px;">
            <button data-action="balance" data-id="${p.id}" style="padding:2px 5px;font-size:10px;cursor:pointer;">Set</button>
            <input id="p-add-${p.id}" type="number" placeholder="+/-" style="width:45px;padding:2px 4px;background:#181e2b;border:1px solid #444;color:#fff;border-radius:3px;margin-left:2px;">
            <button data-action="add" data-id="${p.id}" style="padding:2px 5px;font-size:10px;cursor:pointer;">Add</button>
          </td>
          <td style="padding:6px 4px;color:#ffd877;">${p.openPositions || 0}</td>
          <td style="padding:6px 4px;white-space:nowrap;">
            <button data-action="reset" data-id="${p.id}" title="Reset to start balance" style="padding:2px 5px;font-size:10px;background:#2a251a;color:#ffd877;border:1px solid #6b5220;border-radius:3px;cursor:pointer;">Reset</button>
            <button data-action="cancel" data-id="${p.id}" title="Refund open allocations" style="padding:2px 5px;font-size:10px;background:#241212;color:#f0a0a0;border:1px solid #8a2a2a;border-radius:3px;cursor:pointer;">Refund</button>
            <button data-action="teleport" data-id="${p.id}" title="Teleport player to me" style="padding:2px 5px;font-size:10px;background:#1a2530;color:#8fa8c8;border:1px solid #334e68;border-radius:3px;cursor:pointer;">TP</button>
            <button data-action="kick" data-id="${p.id}" title="Kick player" style="padding:2px 5px;font-size:10px;background:#351414;color:#ff8a8a;border:1px solid #772222;border-radius:3px;cursor:pointer;">Kick</button>
          </td>
        </tr>
      `;
    }

    html += '</tbody></table>';
    body.innerHTML = html;

    body.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.onclick = () => {
        const id = Number(btn.dataset.id);
        const act = btn.dataset.action;
        if (act === 'balance') {
          const val = body.querySelector(`#p-bal-${id}`).value;
          this.net.send({ t: 'adm_set', id, field: 'balance', value: val });
        } else if (act === 'add') {
          const val = body.querySelector(`#p-add-${id}`).value;
          if (val) this.net.send({ t: 'adm_set', id, field: 'add', value: val });
        } else if (act === 'name') {
          const val = body.querySelector(`#p-name-${id}`).value;
          this.net.send({ t: 'adm_set', id, field: 'name', value: val });
        } else if (act === 'role') {
          const val = body.querySelector(`#p-role-${id}`).value;
          this.net.send({ t: 'adm_set', id, field: 'role', value: val });
        } else if (act === 'reset') {
          this.net.send({ t: 'adm_set', id, field: 'reset' });
        } else if (act === 'cancel') {
          this.net.send({ t: 'adm_set', id, field: 'cancel' });
        } else if (act === 'teleport') {
          this.net.send({ t: 'adm_set', id, field: 'teleport' });
        } else if (act === 'kick') {
          this.net.send({ t: 'adm_set', id, field: 'kick', value: 'Kicked by administrator' });
        }
      };
    });
  }

  renderSettingsTab() {
    const body = this.panel.querySelector('#adm-body');
    const c = this.config;
    const p = c.phases || { open: 35, closed: 3, spinning: 12, result: 8 };

    body.innerHTML = `
      <div style="max-width:440px;display:flex;flex-direction:column;gap:10px;">
        <div style="font-weight:700;color:#c9a23a;margin-bottom:2px;">GLOBAL SYSTEM CONFIGURATION</div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span>Starting Balance (NU):</span>
          <input id="cfg-start" type="number" value="${c.startBalance}" style="width:100px;padding:4px;background:#181e2b;border:1px solid #444;color:#fff;border-radius:4px;">
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span>Min Allocation (NU):</span>
          <input id="cfg-min" type="number" value="${c.min}" style="width:100px;padding:4px;background:#181e2b;border:1px solid #444;color:#fff;border-radius:4px;">
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span>Max Per Position (NU):</span>
          <input id="cfg-max-pos" type="number" value="${c.maxPerPosition}" style="width:100px;padding:4px;background:#181e2b;border:1px solid #444;color:#fff;border-radius:4px;">
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span>Max Per Round (NU):</span>
          <input id="cfg-max-rnd" type="number" value="${c.maxPerRound}" style="width:100px;padding:4px;background:#181e2b;border:1px solid #444;color:#fff;border-radius:4px;">
        </div>

        <div style="font-weight:700;color:#c9a23a;margin-top:6px;">CYCLE PHASES (SUM <= 60s, EACH >= 2s)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span>Open (s):</span>
            <input id="cfg-open" type="number" value="${p.open}" style="width:60px;padding:4px;background:#181e2b;border:1px solid #444;color:#fff;border-radius:4px;">
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span>Closed (s):</span>
            <input id="cfg-closed" type="number" value="${p.closed}" style="width:60px;padding:4px;background:#181e2b;border:1px solid #444;color:#fff;border-radius:4px;">
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span>Spinning (s):</span>
            <input id="cfg-spinning" type="number" value="${p.spinning}" style="width:60px;padding:4px;background:#181e2b;border:1px solid #444;color:#fff;border-radius:4px;">
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span>Result (s):</span>
            <input id="cfg-result" type="number" value="${p.result}" style="width:60px;padding:4px;background:#181e2b;border:1px solid #444;color:#fff;border-radius:4px;">
          </div>
        </div>

        <div id="cfg-err" style="color:#ff8a8a;font-size:11px;min-height:16px;"></div>

        <button id="cfg-save" style="margin-top:4px;padding:8px;background:#c9a23a;color:#14110d;border:0;border-radius:6px;font-weight:700;cursor:pointer;">Save Configuration</button>
      </div>
    `;

    body.querySelector('#cfg-save').onclick = () => {
      const errEl = body.querySelector('#cfg-err');
      errEl.textContent = '';
      const startBalance = Number(body.querySelector('#cfg-start').value);
      const min = Number(body.querySelector('#cfg-min').value);
      const maxPerPosition = Number(body.querySelector('#cfg-max-pos').value);
      const maxPerRound = Number(body.querySelector('#cfg-max-rnd').value);
      const open = Number(body.querySelector('#cfg-open').value);
      const closed = Number(body.querySelector('#cfg-closed').value);
      const spinning = Number(body.querySelector('#cfg-spinning').value);
      const result = Number(body.querySelector('#cfg-result').value);

      const sum = open + closed + spinning + result;
      if (sum > 60) {
        errEl.textContent = `Phases sum to ${sum} s (maximum allowed: 60 s)`;
        return;
      }
      if (open < 2 || closed < 2 || spinning < 2 || result < 2) {
        errEl.textContent = 'Each phase must be at least 2 s';
        return;
      }

      this.net.send({
        t: 'adm_config',
        config: {
          startBalance,
          min,
          maxPerPosition,
          maxPerRound,
          phases: { open, closed, spinning, result }
        }
      });
    };
  }

  renderAuditTab() {
    const body = this.panel.querySelector('#adm-body');
    if (!this.auditEntries.length) {
      body.innerHTML = '<div style="color:#aaa;text-align:center;padding:20px;">No audit entries recorded yet.</div>';
      return;
    }

    let html = `
      <table style="width:100%;border-collapse:collapse;font-size:10px;">
        <thead>
          <tr style="border-bottom:1px solid #4a3c20;color:#c9a23a;text-align:left;">
            <th style="padding:4px;">Time</th>
            <th style="padding:4px;">Admin</th>
            <th style="padding:4px;">Target</th>
            <th style="padding:4px;">Field</th>
            <th style="padding:4px;">Before</th>
            <th style="padding:4px;">After</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const e of this.auditEntries) {
      const t = new Date(e.time).toLocaleTimeString();
      html += `
        <tr style="border-bottom:1px solid #1a202c;">
          <td style="padding:4px;color:#888;">${t}</td>
          <td style="padding:4px;color:#f2c14a;font-weight:600;">${e.admin}</td>
          <td style="padding:4px;color:#ddd;">${e.target}</td>
          <td style="padding:4px;color:#7be3a0;">${e.field}</td>
          <td style="padding:4px;color:#aaa;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.before}</td>
          <td style="padding:4px;color:#fff;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.after}</td>
        </tr>
      `;
    }

    html += '</tbody></table>';
    body.innerHTML = html;
  }
}
