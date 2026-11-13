import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminManager } from '../admin.js';
import { RouletteRoom } from '../rouletteRoom.js';

test('non-admin sending adm_set gets denied and nothing changes', () => {
  const room = new RouletteRoom();
  const adminMgr = new AdminManager(room);

  const sentBob = [];
  const bob = {
    id: 1,
    name: 'Bob',
    role: 'visitor',
    admin: false,
    ws: { readyState: 1, send: (m) => sentBob.push(JSON.parse(m)) }
  };

  const sentTarget = [];
  const target = {
    id: 2,
    name: 'Alice',
    role: 'visitor',
    admin: false,
    ws: { readyState: 1, send: (m) => sentTarget.push(JSON.parse(m)) }
  };

  const players = new Map([
    [1, bob],
    [2, target]
  ]);

  const initialBalance = room.getBalance('Alice');
  assert.equal(initialBalance, 10000);

  // Bob (not admin) attempts to change Alice's balance
  const res = adminMgr.handleMessage(
    bob,
    { t: 'adm_set', id: 2, field: 'balance', value: 99999 },
    { players, broadcastToAdmins: () => {}, clean: (s) => s }
  );

  assert.equal(res.ok, false);
  assert.equal(res.reason, 'denied');
  assert.equal(room.getBalance('Alice'), 10000); // nothing changed
  assert.equal(sentTarget.length, 0); // target received nothing
  assert.equal(sentBob.length, 1);
  assert.equal(sentBob[0].t, 'denied');
});

test('admin can set balance, adjust balance, change role, and it updates and audits', () => {
  const room = new RouletteRoom();
  const adminMgr = new AdminManager(room);

  const adminWs = [];
  const admin = {
    id: 99,
    name: 'Boss',
    role: 'admin',
    admin: true,
    ws: { readyState: 1, send: (m) => adminWs.push(JSON.parse(m)) }
  };

  const targetWs = [];
  const target = {
    id: 2,
    name: 'Charlie',
    role: 'visitor',
    admin: false,
    ws: { readyState: 1, send: (m) => targetWs.push(JSON.parse(m)) }
  };

  const players = new Map([
    [99, admin],
    [2, target]
  ]);

  let broadcastCalls = 0;
  const broadcastToAdmins = () => {
    broadcastCalls++;
  };

  // 1. Set exact balance
  const r1 = adminMgr.handleMessage(
    admin,
    { t: 'adm_set', id: 2, field: 'balance', value: 500 },
    { players, broadcastToAdmins, clean: (s) => s }
  );
  assert.equal(r1.ok, true);
  assert.equal(room.getBalance('Charlie'), 500);
  assert.equal(targetWs.pop().balance, 500);

  // 2. Add amount (+200)
  const r2 = adminMgr.handleMessage(
    admin,
    { t: 'adm_set', id: 2, field: 'add', value: 200 },
    { players, broadcastToAdmins, clean: (s) => s }
  );
  assert.equal(r2.ok, true);
  assert.equal(room.getBalance('Charlie'), 700);
  assert.equal(targetWs.pop().balance, 700);

  // 3. Change role to 'cleared'
  const r3 = adminMgr.handleMessage(
    admin,
    { t: 'adm_set', id: 2, field: 'role', value: 'cleared' },
    { players, broadcastToAdmins, clean: (s) => s }
  );
  assert.equal(r3.ok, true);
  assert.equal(target.role, 'cleared');
  const roleMsg = targetWs.pop();
  assert.equal(roleMsg.t, 'you');
  assert.equal(roleMsg.role, 'cleared');

  // 4. Audit entries recorded
  assert.equal(adminMgr.auditLog.length, 3);
  assert.equal(adminMgr.auditLog[0].field, 'role');
  assert.equal(adminMgr.auditLog[1].field, 'add');
  assert.equal(adminMgr.auditLog[2].field, 'balance');
});
