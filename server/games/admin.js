const VALID_ROLES = ['visitor', 'cleared', 'tour', 'admin', 'ceo'];

export class AdminManager {
  constructor(roulette, auditLogLimit = 200) {
    this.roulette = roulette;
    this.auditLog = [];
    this.auditLogLimit = auditLogLimit;
  }

  recordAudit(admin, target, field, before, after) {
    const entry = {
      time: Date.now(),
      admin: String(admin || 'unknown'),
      target: String(target || 'unknown'),
      field: String(field || 'unknown'),
      before: typeof before === 'object' ? JSON.stringify(before) : String(before ?? ''),
      after: typeof after === 'object' ? JSON.stringify(after) : String(after ?? '')
    };
    this.auditLog.unshift(entry);
    if (this.auditLog.length > this.auditLogLimit) {
      this.auditLog.pop();
    }
    console.log(
      `[AUDIT] ${entry.admin} modified ${entry.target}.${entry.field}: ${entry.before} -> ${entry.after}`
    );
    return entry;
  }

  getPlayersPayload(playersMap) {
    const list = [];
    for (const pl of playersMap.values()) {
      list.push({
        id: pl.id,
        name: pl.name,
        role: pl.role,
        floor: pl.floor,
        balance: this.roulette.getBalance(pl.name),
        openPositions: (this.roulette.getPositions(pl.id) || []).length,
        since: pl.since || Date.now()
      });
    }
    return {
      t: 'adm_players',
      players: list,
      treasury: this.roulette.treasury,
      config: this.roulette.config
    };
  }

  handleMessage(sender, msg, { players, broadcastToAdmins, clean }) {
    if (!sender.admin) {
      if (sender.ws && sender.ws.readyState === 1) {
        sender.ws.send(JSON.stringify({ t: 'denied' }));
      }
      return { ok: false, reason: 'denied' };
    }

    const { t } = msg;

    if (t === 'adm_list') {
      if (sender.ws && sender.ws.readyState === 1) {
        sender.ws.send(JSON.stringify(this.getPlayersPayload(players)));
      }
      return { ok: true };
    }

    if (t === 'adm_audit') {
      if (sender.ws && sender.ws.readyState === 1) {
        sender.ws.send(JSON.stringify({ t: 'adm_audit', entries: this.auditLog }));
      }
      return { ok: true };
    }

    if (t === 'adm_config') {
      try {
        const prev = JSON.stringify(this.roulette.config);
        const updated = this.roulette.setConfig(msg.config);
        this.recordAudit(sender.name, 'SYSTEM', 'config', prev, JSON.stringify(updated));
        broadcastToAdmins(this.getPlayersPayload(players));
        return { ok: true, config: updated };
      } catch (err) {
        if (sender.ws && sender.ws.readyState === 1) {
          sender.ws.send(JSON.stringify({ t: 'adm_err', reason: err.message }));
        }
        return { ok: false, reason: err.message };
      }
    }

    if (t === 'adm_set') {
      const targetId = Number(msg.id);
      const target = players.get(targetId);
      if (!target) {
        if (sender.ws && sender.ws.readyState === 1) {
          sender.ws.send(JSON.stringify({ t: 'adm_err', reason: `Player ${msg.id} not found` }));
        }
        return { ok: false, reason: 'Player not found' };
      }

      const { field, value } = msg;
      const targetName = target.name;

      switch (field) {
        case 'balance': {
          const val = Math.floor(Number(value));
          if (!Number.isInteger(val) || val < 0) {
            return { ok: false, reason: 'Invalid balance amount' };
          }
          const before = this.roulette.getBalance(targetName);
          this.roulette.setBalance(targetName, val);
          this.recordAudit(sender.name, targetName, 'balance', before, val);
          if (target.ws && target.ws.readyState === 1) {
            target.ws.send(JSON.stringify({ t: 'bal', balance: val }));
          }
          break;
        }

        case 'add': {
          const delta = Math.floor(Number(value));
          if (!Number.isInteger(delta)) {
            return { ok: false, reason: 'Invalid delta amount' };
          }
          const before = this.roulette.getBalance(targetName);
          if (before + delta < 0) {
            return { ok: false, reason: 'Balance cannot go negative' };
          }
          const updated = this.roulette.adjustBalance(targetName, delta);
          this.recordAudit(sender.name, targetName, 'add', before, updated);
          if (target.ws && target.ws.readyState === 1) {
            target.ws.send(JSON.stringify({ t: 'bal', balance: updated }));
          }
          break;
        }

        case 'name': {
          const newName = clean ? clean(value, 20) : String(value ?? '').trim().slice(0, 20);
          if (!newName || newName === targetName) {
            return { ok: false, reason: 'Invalid or unchanged name' };
          }
          // Migrate balance key
          const curBal = this.roulette.balances.get(targetName);
          if (curBal !== undefined) {
            this.roulette.balances.delete(targetName);
            this.roulette.balances.set(newName, curBal);
          }
          // Update player positions owner
          for (const pos of this.roulette.getPositions(target.id)) {
            pos.playerName = newName;
          }
          const before = targetName;
          target.name = newName;
          this.recordAudit(sender.name, before, 'name', before, newName);
          if (target.ws && target.ws.readyState === 1) {
            target.ws.send(JSON.stringify({ t: 'you', name: target.name, role: target.role }));
          }
          break;
        }

        case 'role': {
          const role = String(value);
          if (!VALID_ROLES.includes(role)) {
            return { ok: false, reason: `Invalid role: ${role}` };
          }
          const before = target.role;
          target.role = role;
          this.recordAudit(sender.name, targetName, 'role', before, role);
          if (target.ws && target.ws.readyState === 1) {
            target.ws.send(JSON.stringify({ t: 'you', name: target.name, role: target.role }));
          }
          break;
        }

        case 'reset': {
          const before = this.roulette.getBalance(targetName);
          const newBal = this.roulette.resetBalance(targetName);
          this.recordAudit(sender.name, targetName, 'reset', before, newBal);
          if (target.ws && target.ws.readyState === 1) {
            target.ws.send(JSON.stringify({ t: 'bal', balance: newBal }));
          }
          break;
        }

        case 'cancel': {
          const before = this.roulette.getBalance(targetName);
          const refunded = this.roulette.cancelPlayerPositions(target.id, targetName);
          const newBal = this.roulette.getBalance(targetName);
          this.recordAudit(sender.name, targetName, 'cancel', `${refunded} NU`, 'refunded');
          if (target.ws && target.ws.readyState === 1) {
            target.ws.send(JSON.stringify({ t: 'bal', balance: newBal }));
            target.ws.send(JSON.stringify({ t: 'rl_cleared', balance: newBal, positions: [] }));
          }
          break;
        }

        case 'teleport': {
          target.ready = false;
          if (target.ws && target.ws.readyState === 1) {
            target.ws.send(
              JSON.stringify({
                t: 'tp',
                by: sender.name,
                floor: sender.floor,
                x: sender.x,
                y: sender.y,
                z: sender.z
              })
            );
          }
          this.recordAudit(sender.name, targetName, 'teleport', target.floor, sender.floor);
          break;
        }

        case 'kick': {
          const reason = clean ? clean(value, 100) : String(value ?? '').slice(0, 100);
          this.recordAudit(sender.name, targetName, 'kick', 'connected', reason || 'Kicked by admin');
          if (target.ws && target.ws.readyState === 1) {
            target.ws.close(4001, reason || 'Kicked by administrator');
          }
          break;
        }

        default:
          return { ok: false, reason: `Unknown field: ${field}` };
      }

      broadcastToAdmins(this.getPlayersPayload(players));
      return { ok: true };
    }

    return { ok: false, reason: 'Unknown message' };
  }
}
