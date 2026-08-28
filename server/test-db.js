import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { initSchema, saveRoom, loadRoom, deleteRoom, listRoomCodes } from './db.js';

const TEST_DB = 'test-local.db';
if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
process.env.TURSO_DATABASE_URL = `file:${TEST_DB}`;
delete process.env.TURSO_AUTH_TOKEN;

let pass = 0, fail = 0;
function check(label, cond) { if (cond) { pass++; } else { fail++; console.error('FAIL:', label); } }

async function main() {
  await initSchema();
  console.log('== Schema initialized ==');

  const missing = await loadRoom('NOPE99');
  check('Loading a nonexistent room returns null', missing === null);

  const sampleState = { roleConfig: { villager: 4 }, players: [{ id: 'p1', name: 'Alice' }], game: null };
  await saveRoom('ROOM1', sampleState);
  const loaded = await loadRoom('ROOM1');
  check('Saved state round-trips correctly', JSON.stringify(loaded) === JSON.stringify(sampleState));

  const updated = { ...sampleState, players: [...sampleState.players, { id: 'p2', name: 'Bob' }] };
  await saveRoom('ROOM1', updated);
  const reloaded = await loadRoom('ROOM1');
  check('Re-saving the same room code updates (upsert) rather than duplicating', reloaded.players.length === 2);

  await saveRoom('ROOM2', { roleConfig: {}, players: [], game: null });
  const codes = await listRoomCodes();
  check('listRoomCodes sees both rooms', codes.some((r) => r.code === 'ROOM1') && codes.some((r) => r.code === 'ROOM2'));

  await deleteRoom('ROOM2');
  const afterDelete = await loadRoom('ROOM2');
  check('Deleted room is gone', afterDelete === null);
  const afterDeleteList = await listRoomCodes();
  check('Deleted room no longer appears in listing', !afterDeleteList.some((r) => r.code === 'ROOM2'));

  // Simulate a full mid-game state (with nested objects, arrays, nulls) to make sure
  // JSON round-tripping handles the real shape correctly, not just a toy object.
  const complexState = {
    roleConfig: { werewolf_biasa: 2, alpha_wolf: 1, joker: 1, seer: 1, guard: 1, witch: 1, hunter: 1, cupid: 1, villager: 8 },
    players: [{ id: 'p1', name: 'Alice' }],
    game: {
      phase: 'night', round: 2, readyPlayers: ['p1'],
      players: [{ id: 'p1', name: 'Alice', role: 'seer', alive: true, deathCause: null, deathRound: null, loverId: 'p2' }],
      nightTurnOrder: ['seer', 'guard', 'werewolf', 'witch'], nightTurnIndex: 1,
      nightActions: { wolfTargets: [], guardTarget: null, witchSaveTarget: null, witchPoisonTarget: null },
      witchPotions: { saveUsed: false, poisonUsed: true },
      doubleBiteNextNight: true, resolution: null, lastNightDeaths: [{ playerId: 'x', cause: 'wolf' }],
      votes: {}, discussionSeconds: 180, discussionRunning: false, winner: null,
      publicLog: [{ id: 'l1', text: 'test' }], moderatorLog: [{ id: 'l2', text: 'secret' }],
    },
  };
  await saveRoom('COMPLEX', complexState);
  const complexLoaded = await loadRoom('COMPLEX');
  check('Complex nested mid-game state round-trips exactly', JSON.stringify(complexLoaded) === JSON.stringify(complexState));
  check('Boolean true survives round-trip (doubleBiteNextNight)', complexLoaded.game.doubleBiteNextNight === true);
  check('Null survives round-trip (deathCause)', complexLoaded.game.players[0].deathCause === null);

  console.log('\n=== DB (libSQL/Turso-compatible) TESTS:', pass, 'passed,', fail, 'failed ===');
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('TEST CRASHED:', e); process.exit(1); });
