import {
  reducer, createInitialState, buildNightTurnOrder, computeNightDeaths,
  resolveDeaths, checkWinCondition, tallyVotes, ROLE_DEFS,
} from './game-logic.js';

let pass = 0, fail = 0;
function check(label, cond) { if (cond) { pass++; } else { fail++; console.error('FAIL:', label); } }

function mkPlayer(id, name, role, overrides = {}) {
  return { id, name, role, alive: true, deathCause: null, deathRound: null, loverId: null, ...overrides };
}
function baseGame(players, overrides = {}) {
  return {
    phase: 'night', players, round: 1, readyPlayers: [],
    nightTurnOrder: [], nightTurnIndex: 0,
    nightActions: { wolfTargets: [], guardTarget: null, witchSaveTarget: null, witchPoisonTarget: null },
    witchPotions: { saveUsed: false, poisonUsed: false }, doubleBiteNextNight: false,
    resolution: null, lastNightDeaths: [], votes: {},
    discussionSeconds: 180, discussionRunning: false, winner: null,
    publicLog: [], moderatorLog: [], ...overrides,
  };
}
function stateWith(game) { return { roleConfig: {}, players: [], game }; }

// ---------------------------------------------------------------------------
console.log('== 1. Core resolution engine (guard/witch/hunter/cupid/win) — unchanged from offline, re-verified ==');
{
  const d1 = computeNightDeaths({ wolfTargets: ['x'], guardTarget: 'x', witchSaveTarget: null, witchPoisonTarget: null });
  check('guard protecting wolf target -> no wolf death', d1.length === 0);
  const d2 = computeNightDeaths({ wolfTargets: ['x'], guardTarget: 'x', witchSaveTarget: null, witchPoisonTarget: 'x' });
  check('guard protects from wolf but poison still kills', d2.length === 1 && d2[0].cause === 'poison');

  const lovers = [mkPlayer('a', 'A', 'villager', { loverId: 'b' }), mkPlayer('b', 'B', 'villager', { loverId: 'a' }), mkPlayer('c', 'C', 'villager')];
  const loverResult = resolveDeaths(lovers, [{ playerId: 'a', cause: 'wolf' }], [], 1, []);
  check('lover chain kills both', !loverResult.players.find((p) => p.id === 'a').alive && !loverResult.players.find((p) => p.id === 'b').alive);

  const hunters = [mkPlayer('h', 'H', 'hunter'), mkPlayer('x', 'X', 'villager')];
  const hResult = resolveDeaths(hunters, [{ playerId: 'h', cause: 'wolf' }], [], 1, []);
  check('hunter death pauses for revenge', hResult.pendingRevenge?.hunterId === 'h');

  const w1 = checkWinCondition([mkPlayer('j', 'J', 'joker', { alive: false, deathCause: 'vote' }), mkPlayer('w', 'W', 'werewolf_biasa')]);
  check('joker-hanged win still works', w1?.team === 'joker');
}

// ---------------------------------------------------------------------------
console.log('== 2. Online reveal flow: independent ready-check instead of sequential pass-the-phone ==');
{
  let state = createInitialState();
  state = { ...state, roleConfig: { werewolf_biasa: 1, alpha_wolf: 0, joker: 0, seer: 0, guard: 0, witch: 0, hunter: 0, cupid: 0, villager: 3 } };
  ['P1', 'P2', 'P3', 'P4'].forEach((name) => { state = reducer(state, { type: 'ADD_PLAYER', name }); });
  state = reducer(state, { type: 'ASSIGN_ROLES' });
  check('phase is reveal, no revealIndex field exists', state.game.phase === 'reveal' && state.game.revealIndex === undefined);
  check('readyPlayers starts empty', state.game.readyPlayers.length === 0);

  const ids = state.game.players.map((p) => p.id);
  state = reducer(state, { type: 'PLAYER_READY', playerId: ids[0] });
  check('one ready player recorded', state.game.readyPlayers.length === 1);
  state = reducer(state, { type: 'PLAYER_READY', playerId: ids[0] }); // duplicate, should be idempotent
  check('duplicate ready call does not double-count', state.game.readyPlayers.length === 1);

  // Moderator can start the night even before everyone is ready (their call).
  state = reducer(state, { type: 'START_NIGHT_1' });
  check('phase moves to night regardless of partial ready count', state.game.phase === 'night');
  check('turn order is just werewolf for this config', JSON.stringify(state.game.nightTurnOrder) === JSON.stringify(['werewolf']));
}

// ---------------------------------------------------------------------------
console.log('== 3. Online voting: open ballot (voterId -> targetId) with live tally ==');
{
  const players = [mkPlayer('w', 'W', 'werewolf_biasa'), mkPlayer('v1', 'V1', 'villager'), mkPlayer('v2', 'V2', 'villager'), mkPlayer('v3', 'V3', 'villager')];
  let state = stateWith(baseGame(players, { phase: 'voting', votes: {} }));

  state = reducer(state, { type: 'CAST_VOTE', voterId: 'v1', targetId: 'w' });
  state = reducer(state, { type: 'CAST_VOTE', voterId: 'v2', targetId: 'w' });
  state = reducer(state, { type: 'CAST_VOTE', voterId: 'v3', targetId: 'v1' });
  check('votes map records each voter exactly once', Object.keys(state.game.votes).length === 3);
  check('tally aggregates correctly', tallyVotes(state.game.votes)['w'] === 2 && tallyVotes(state.game.votes)['v1'] === 1);

  // Changing a vote overwrites, doesn't add a second entry.
  state = reducer(state, { type: 'CAST_VOTE', voterId: 'v1', targetId: 'v1' });
  check('changing a vote overwrites rather than duplicating', Object.keys(state.game.votes).length === 3);
  check('tally reflects the change', tallyVotes(state.game.votes)['w'] === 1 && tallyVotes(state.game.votes)['v1'] === 2);

  // A dead voter or dead target should be rejected.
  const withDead = { ...state, game: { ...state.game, players: state.game.players.map((p) => (p.id === 'v2' ? { ...p, alive: false } : p)) } };
  const rejected = reducer(withDead, { type: 'CAST_VOTE', voterId: 'v2', targetId: 'w' });
  check('a dead player cannot cast a vote', JSON.stringify(rejected.game.votes) === JSON.stringify(withDead.game.votes));

  state = reducer(state, { type: 'RETRACT_VOTE', voterId: 'v3' });
  check('retracting a vote removes it from the open ballot', !('v3' in state.game.votes) && Object.keys(state.game.votes).length === 2);

  // Finalize with the werewolf eliminated -> warga should win (0 wolves left).
  state = reducer(state, { type: 'FINALIZE_VOTE', eliminatedId: 'w' });
  check('finalize eliminates correctly and detects the win', state.game.phase === 'game_over' && state.game.winner.team === 'warga');
}

// ---------------------------------------------------------------------------
console.log('== 4. Full online flow end-to-end through the reducer directly ==');
{
  let state = createInitialState();
  state = { ...state, roleConfig: { werewolf_biasa: 1, alpha_wolf: 0, joker: 1, seer: 0, guard: 0, witch: 0, hunter: 0, cupid: 0, villager: 3 } };
  ['A', 'B', 'C', 'D', 'E'].forEach((name) => { state = reducer(state, { type: 'ADD_PLAYER', name }); });
  state = reducer(state, { type: 'ASSIGN_ROLES' });
  const ids = state.game.players.map((p) => p.id);
  ids.forEach((id) => { state = reducer(state, { type: 'PLAYER_READY', playerId: id }); });
  check('all 5 marked ready', state.game.readyPlayers.length === 5);
  state = reducer(state, { type: 'START_NIGHT_1' });
  check('night 1 started', state.game.phase === 'night');

  const wolf = state.game.players.find((p) => p.role === 'werewolf_biasa');
  const joker = state.game.players.find((p) => p.role === 'joker');
  const villagers = state.game.players.filter((p) => p.role === 'villager');
  state = reducer(state, { type: 'SUBMIT_NIGHT_ACTION', role: 'werewolf', payload: { targetIds: [villagers[0].id] } });
  check('after the only night role acts, phase is morning', state.game.phase === 'morning');

  state = reducer(state, { type: 'ADVANCE_TO_DISCUSSION' });
  state = reducer(state, { type: 'START_VOTING' });
  const alive = state.game.players.filter((p) => p.alive);
  alive.forEach((p) => { state = reducer(state, { type: 'CAST_VOTE', voterId: p.id, targetId: joker.id }); });
  state = reducer(state, { type: 'FINALIZE_VOTE', eliminatedId: joker.id });
  check('joker voted out -> joker wins the whole game', state.game.phase === 'game_over' && state.game.winner.team === 'joker');
}

console.log(`\n=== ONLINE SERVER LOGIC TESTS: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
