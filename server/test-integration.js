import { io as ioClient } from 'socket.io-client';
import { appendFileSync, writeFileSync } from 'node:fs';

const URL = 'http://localhost:3901';
let pass = 0, fail = 0;
const LOG = 'integration-progress.log';
writeFileSync(LOG, '');
function log(msg) { appendFileSync(LOG, msg + '\n'); }
function check(label, cond) {
  if (cond) { pass++; log('PASS: ' + label); }
  else { fail++; log('FAIL: ' + label); }
}

setTimeout(() => { log('!!! GLOBAL TIMEOUT — forcing exit !!!'); process.exit(2); }, 25000);

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT (${ms}ms): ${label}`)), ms)),
  ]);
}
function connect(label) {
  return withTimeout(new Promise((resolve, reject) => {
    const s = ioClient(URL, { transports: ['websocket'], forceNew: true, reconnection: false, timeout: 3000 });
    s.__label = label;
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(e));
  }), 4000, `connect(${label})`);
}
function emitAck(socket, event, payload) {
  return withTimeout(new Promise((resolve) => socket.emit(event, payload, resolve)), 3000, `ack(${event})`);
}
function nextUpdate(socket, timeoutMs = 3000) {
  const label = socket.__label || socket.id;
  return withTimeout(new Promise((resolve) => socket.once('state_update', resolve)), timeoutMs, `state_update(${label})`);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

let allSockets = []; // populated once everyone has joined; every act() call drains ALL of these

// Emits `event` from `actor` and waits for the broadcast to land on EVERY connected
// socket (not just the ones the caller cares about) before returning. This is the
// key fix: without fully draining every socket after each action, a slow/late
// broadcast from action N can be mistaken for the response to action N+1.
async function act(actor, event, payload) {
  const waits = allSockets.map((s) => nextUpdate(s));
  actor.emit(event, payload);
  return Promise.all(waits);
}
function viewFor(results, socket) { return results[allSockets.indexOf(socket)]; }

async function main() {
  log('--- connecting moderator ---');
  const mod = await connect('MOD');
  const res = await emitAck(mod, 'create_room', {});
  check('Room created successfully', res.ok === true && !!res.code);
  const code = res.code;
  log('Room code: ' + code);

  const playerNames = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'];
  const players = {};
  for (const name of playerNames) {
    const s = await connect(name);
    const r = await emitAck(s, 'join_room', { code, name });
    check(`${name} joined successfully`, r.ok === true);
    players[name] = { socket: s, token: r.token, playerId: r.view.viewerPlayerId };
  }
  allSockets = [mod, ...playerNames.map((n) => players[n].socket)];
  log('--- all players joined ---');

  // --- Configure roles: 1 werewolf, 1 hunter, 2 villager = 4 ---
  const roleTargets = { werewolf_biasa: 1, alpha_wolf: 0, joker: 0, seer: 0, guard: 0, witch: 0, hunter: 1, cupid: 0, villager: 3 };
  const defaults = { werewolf_biasa: 2, alpha_wolf: 1, joker: 1, seer: 1, guard: 1, witch: 1, hunter: 1, cupid: 1, villager: 8 };
  for (const [role, target] of Object.entries(roleTargets)) {
    const delta = target - defaults[role];
    for (let i = 0; i < Math.abs(delta); i++) {
      await act(mod, 'set_role_count', { role, delta: Math.sign(delta) });
    }
  }
  log('--- roles configured ---');

  // --- Non-moderator attempts a moderator-only action: should be silently rejected ---
  {
    const alice = players.Alice.socket;
    let leaked = false;
    const guard = (v) => { leaked = true; };
    alice.once('state_update', guard);
    alice.emit('set_role_count', { role: 'villager', delta: -1 });
    await sleep(400);
    alice.off('state_update', guard);
    check('Non-moderator set_role_count is ignored', leaked === false);
  }
  log('--- authorization check (role count) done ---');

  // --- Assign roles ---
  const results1 = await act(mod, 'assign_roles', {});
  const modView1 = viewFor(results1, mod);
  check('Moderator view shows phase=reveal after assign', modView1.phase === 'reveal');
  playerNames.forEach((name) => {
    const v = viewFor(results1, players[name].socket);
    check(`${name}: phase is reveal`, v.phase === 'reveal');
    check(`${name}: sees their own role`, !!v.myRole && !!v.myRole.label);
    const others = v.players.filter((p) => p.id !== players[name].playerId);
    check(`${name}: cannot see any other player's role over the wire`, others.every((o) => o.role === null));
  });
  log('--- roles assigned + reveal redaction verified ---');

  // --- Each player marks ready ---
  const roleOf = {};
  for (const name of playerNames) {
    const p = players[name];
    const results = await act(p.socket, 'player_ready', {});
    roleOf[name] = viewFor(results, p.socket).myRole.role;
  }
  log('Role mapping: ' + JSON.stringify(roleOf));
  const wolfName = Object.keys(roleOf).find((n) => roleOf[n] === 'werewolf_biasa');
  const hunterName = Object.keys(roleOf).find((n) => roleOf[n] === 'hunter');
  const villagerNames = Object.keys(roleOf).filter((n) => roleOf[n] === 'villager');
  check('Exactly one werewolf and one hunter identified', !!wolfName && !!hunterName && villagerNames.length === 3);

  // --- Start night 1 ---
  const results2 = await act(mod, 'start_night_1', {});
  const modView2 = viewFor(results2, mod);
  check('Phase is night after start_night_1', modView2.phase === 'night');
  check('Turn order starts with werewolf', modView2.nightTurnOrder && modView2.nightTurnOrder[0] === 'werewolf');
  const wolfView = viewFor(results2, players[wolfName].socket);
  check('Werewolf player sees myTurn=true', wolfView.myTurn === true);
  playerNames.filter((n) => n !== wolfName).forEach((n) => {
    check(`${n} (not werewolf) sees myTurn=false`, viewFor(results2, players[n].socket).myTurn === false);
  });
  log('--- night 1 started ---');

  // --- SECURITY: a non-werewolf player tries to submit a werewolf night action ---
  {
    const villagerSocket = players[villagerNames[0]].socket;
    let receivedAnything = false;
    const guard = () => { receivedAnything = true; };
    villagerSocket.once('state_update', guard);
    villagerSocket.emit('submit_night_action', { role: 'werewolf', payload: { targetIds: [players[hunterName].playerId] } });
    await sleep(400);
    villagerSocket.off('state_update', guard);
    check('Unauthorized submit_night_action from a non-acting player is ignored', receivedAnything === false);
  }
  log('--- night-action authorization check done ---');

  // --- Real werewolf attacks the Hunter ---
  const results3 = await act(players[wolfName].socket, 'submit_night_action', { role: 'werewolf', payload: { targetIds: [players[hunterName].playerId] } });
  check('Phase moved to resolution (Hunter died -> revenge pending)', viewFor(results3, mod).phase === 'resolution');
  log('--- wolf attacked hunter, resolution pending ---');

  // --- Only the Hunter (or moderator) can act on revenge ---
  {
    const wolfSocket = players[wolfName].socket;
    let leaked = false;
    const guard = () => { leaked = true; };
    wolfSocket.once('state_update', guard);
    wolfSocket.emit('resolve_revenge', { targetId: players[villagerNames[0]].playerId });
    await sleep(400);
    wolfSocket.off('state_update', guard);
    check('A non-hunter attempting resolve_revenge is ignored', leaked === false);
  }
  const results4 = await act(players[hunterName].socket, 'resolve_revenge', { targetId: players[villagerNames[0]].playerId });
  const modView4 = viewFor(results4, mod);
  check('After the real Hunter resolves revenge, phase is morning', modView4.phase === 'morning');
  check('Two deaths recorded (hunter + revenge victim)', modView4.lastNightDeaths.length === 2);
  log('--- hunter revenge resolved ---');

  // --- Discussion -> Voting ---
  const results5 = await act(mod, 'advance_to_discussion', {});
  check('Phase is discussion', viewFor(results5, mod).phase === 'discussion');
  const results6 = await act(mod, 'start_voting', {});
  const modView6 = viewFor(results6, mod);
  check('Phase is voting', modView6.phase === 'voting');
  log('--- discussion -> voting ---');

  const aliveIds = new Set(modView6.players.filter((p) => p.alive).map((p) => p.id));
  const stillAliveNames = playerNames.filter((n) => aliveIds.has(players[n].playerId));
  check('3 players remain alive (5 - hunter - revenge victim)', stillAliveNames.length === 3);
  log('Still alive: ' + JSON.stringify(stillAliveNames));

  // Everyone still alive votes for the werewolf, one at a time, fully draining between each.
  let lastVoteResults;
  for (const n of stillAliveNames) {
    lastVoteResults = await act(players[n].socket, 'cast_vote', { voterId: players[n].playerId, targetId: players[wolfName].playerId });
  }
  const voteView = viewFor(lastVoteResults, mod);
  check('Open ballot shows all 3 votes (public voting)', Object.keys(voteView.votes || {}).length === 3);
  check('Werewolf has all 3 votes in the tally', voteView.tally[players[wolfName].playerId] === 3);
  log('--- voting complete ---');

  const results7 = await act(mod, 'finalize_vote', { eliminatedId: players[wolfName].playerId });
  const modView7 = viewFor(results7, mod);
  check('Game over reached (werewolf eliminated -> 0 wolves alive)', modView7.phase === 'game_over');
  check('Warga wins', modView7.winner && modView7.winner.team === 'warga');
  log('--- game over reached ---');

  // --- Reconnection test ---
  {
    const survivorName = stillAliveNames.find((n) => n !== wolfName);
    const survivor = players[survivorName];
    const oldToken = survivor.token;
    survivor.socket.disconnect();
    await sleep(200);
    const newSocket = await connect(survivorName + '-reconnect');
    const rejoin = await emitAck(newSocket, 'join_room', { code, token: oldToken });
    check('Reconnecting with the same token succeeds', rejoin.ok === true);
    check('Reconnected view still shows the finished game', rejoin.view.phase === 'game_over');
    check('Reconnected identity matches original playerId', rejoin.view.viewerPlayerId === survivor.playerId);
  }
  log('--- reconnection test done ---');

  log(`\n=== FULL SOCKET.IO INTEGRATION TEST: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { log('TEST CRASHED: ' + e.stack); process.exit(1); });
