import assert from 'node:assert/strict';
import { reducer, createInitialState, ROLE_DEFS } from './game-logic.js';
import { redactForViewer } from './redact.js';

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.error('FAIL:', label); }
}

function buildFiveRoleGame() {
  let state = createInitialState();
  state = { ...state, roleConfig: { werewolf_biasa: 1, alpha_wolf: 0, joker: 0, seer: 1, guard: 1, witch: 1, hunter: 0, cupid: 1, villager: 0 } };
  ['A', 'B', 'C', 'D', 'E'].forEach((name) => { state = reducer(state, { type: 'ADD_PLAYER', name }); });
  state = reducer(state, { type: 'ASSIGN_ROLES' });
  return state;
}

// ---------------------------------------------------------------------------
console.log('== 1. Reveal phase: each player sees ONLY their own role ==');
{
  const state = buildFiveRoleGame();
  const players = state.game.players;
  players.forEach((viewer) => {
    const view = redactForViewer(state, viewer.id, false);
    check(`${viewer.name} sees their own role`, view.myRole && view.myRole.role === viewer.role);
    // Every OTHER player in the roster must have role:null in this view.
    const others = view.players.filter((p) => p.id !== viewer.id);
    check(`${viewer.name} cannot see any other alive player's role`, others.every((o) => o.role === null && o.roleLabel === null && o.team === null));
  });
  const modView = redactForViewer(state, null, true);
  check('Moderator sees every role', modView.players.every((p) => p.role !== null));
  check('Moderator gets moderatorLog', Array.isArray(modView.moderatorLog) && modView.moderatorLog.length > 0);
  const spectatorView = redactForViewer(state, null, false);
  check('An unclaimed/spectator viewer sees no roles at all', spectatorView.players.every((p) => p.role === null) && !spectatorView.myRole);
}

// ---------------------------------------------------------------------------
console.log('== 2. Night phase: nightActions/witchPotions only visible to the acting role holder ==');
{
  let state = buildFiveRoleGame();
  const players = state.game.players;
  players.forEach((p) => { state = reducer(state, { type: 'PLAYER_READY', playerId: p.id }); });
  state = reducer(state, { type: 'START_NIGHT_1' });
  check('Night 1 turn order starts with cupid', state.game.nightTurnOrder[0] === 'cupid');

  const cupidPlayer = players.find((p) => p.role === 'cupid');
  const nonCupid = players.filter((p) => p.role !== 'cupid');

  const cupidView = redactForViewer(state, cupidPlayer.id, false);
  check('Cupid sees myTurn=true', cupidView.myTurn === true);
  check('Cupid sees currentTurnRoleLabel = Cupid', cupidView.currentTurnRoleLabel === 'Cupid');

  nonCupid.forEach((p) => {
    const v = redactForViewer(state, p.id, false);
    check(`${p.name} (not cupid) sees myTurn=false`, v.myTurn === false);
    check(`${p.name} does NOT receive nightActions field`, v.nightActions === undefined);
    check(`${p.name} still knows it's Cupid's turn (public info)`, v.currentTurnRoleLabel === 'Cupid');
    check(`${p.name} cannot see who the acting Cupid actually is (roles stay hidden)`, v.players.every((pl) => pl.id === p.id || pl.role === null));
  });

  // Advance: cupid pairs A random 2 alive players, then it's Seer's turn -> Witch turn later should show wolfTargets only to witch.
  const ids = players.map((p) => p.id);
  state = reducer(state, { type: 'SUBMIT_NIGHT_ACTION', role: 'cupid', payload: { aId: ids[0], bId: ids[1] } });
  check('Turn advanced to seer', state.game.nightTurnOrder[state.game.nightTurnIndex] === 'seer');
  const seerPlayer = players.find((p) => p.role === 'seer');
  state = reducer(state, { type: 'SUBMIT_NIGHT_ACTION', role: 'seer', payload: { targetId: ids[2] } });
  check('Turn advanced to guard', state.game.nightTurnOrder[state.game.nightTurnIndex] === 'guard');
  const guardPlayer = players.find((p) => p.role === 'guard');
  state = reducer(state, { type: 'SUBMIT_NIGHT_ACTION', role: 'guard', payload: { targetId: null } });
  check('Turn advanced to werewolf', state.game.nightTurnOrder[state.game.nightTurnIndex] === 'werewolf');

  const wolfPlayer = players.find((p) => ROLE_DEFS[p.role].team === 'werewolf');
  const nonWolfTargetableIds = players.filter((p) => ROLE_DEFS[p.role].team !== 'werewolf').map((p) => p.id);
  state = reducer(state, { type: 'SUBMIT_NIGHT_ACTION', role: 'werewolf', payload: { targetIds: [nonWolfTargetableIds[0]] } });
  check('Turn advanced to witch', state.game.nightTurnOrder[state.game.nightTurnIndex] === 'witch');

  const witchPlayer = players.find((p) => p.role === 'witch');
  const witchView = redactForViewer(state, witchPlayer.id, false);
  check('Witch (acting) CAN see nightActions.wolfTargets', Array.isArray(witchView.nightActions?.wolfTargets) && witchView.nightActions.wolfTargets.length === 1);

  const seerView2 = redactForViewer(state, seerPlayer.id, false);
  check('Seer (not currently acting) CANNOT see nightActions at all', seerView2.nightActions === undefined);
  const guardView2 = redactForViewer(state, guardPlayer.id, false);
  check('Guard (not currently acting) CANNOT see nightActions at all', guardView2.nightActions === undefined);
}

// ---------------------------------------------------------------------------
console.log('== 3. Dead players\' roles ARE revealed to everyone (standard death-reveal) ==');
{
  let state = buildFiveRoleGame();
  const players = state.game.players;
  const victim = players.find((p) => p.role === 'seer');
  // Force a vote-elimination path directly via reducer to get to a dead player quickly
  state = { ...state, game: { ...state.game, phase: 'voting', votes: {} } };
  state = reducer(state, { type: 'FINALIZE_VOTE', eliminatedId: victim.id });
  const anotherPlayer = players.find((p) => p.id !== victim.id);
  const view = redactForViewer(state, anotherPlayer.id, false);
  const victimInView = view.players.find((p) => p.id === victim.id);
  check('Dead player\'s role is visible to a regular (non-moderator, non-self) viewer', victimInView.role === 'seer' && victimInView.roleLabel === 'Seer');
  const stillAlivePlayer = view.players.find((p) => p.id === anotherPlayer.id);
  check("Viewer's own role still visible to themself", stillAlivePlayer.role !== null);
  const thirdPlayer = players.find((p) => p.id !== victim.id && p.id !== anotherPlayer.id);
  const thirdInView = view.players.find((p) => p.id === thirdPlayer.id);
  check('A different still-alive third player\'s role stays hidden from this viewer', thirdInView.role === null);
}

// ---------------------------------------------------------------------------
console.log('== 4. Voting phase: votes are public (open ballot), tally is correct ==');
{
  let state = buildFiveRoleGame();
  const players = state.game.players;
  state = { ...state, game: { ...state.game, phase: 'voting', votes: {} } };
  state = reducer(state, { type: 'CAST_VOTE', voterId: players[0].id, targetId: players[2].id });
  state = reducer(state, { type: 'CAST_VOTE', voterId: players[1].id, targetId: players[2].id });
  state = reducer(state, { type: 'CAST_VOTE', voterId: players[3].id, targetId: players[4].id });
  const view = redactForViewer(state, players[4].id, false);
  check('A regular voter can see the full open ballot', Object.keys(view.votes).length === 3);
  check('Tally correctly aggregates votes', view.tally[players[2].id] === 2 && view.tally[players[4].id] === 1);
}

// ---------------------------------------------------------------------------
console.log('== 5. Resolution phase: only the dying Hunter (or moderator) can act on revenge ==');
{
  let state = buildFiveRoleGame();
  const players = state.game.players;
  // Manually construct a resolution-phase state with a pending hunter revenge for player[0]
  state = {
    ...state,
    game: {
      ...state.game,
      phase: 'resolution',
      resolution: { queue: [], pendingRevenge: { hunterId: players[0].id, hunterName: players[0].name }, origin: 'night', deathsThisBatch: [] },
    },
  };
  const hunterView = redactForViewer(state, players[0].id, false);
  check('The dying hunter can act on their own revenge', hunterView.canActOnRevenge === true);
  const otherView = redactForViewer(state, players[1].id, false);
  check('A different player cannot act on someone else\'s revenge', otherView.canActOnRevenge === false);
  const modView = redactForViewer(state, null, true);
  check('Moderator can always act as a fallback', modView.canActOnRevenge === true);
}

console.log('\n=== REDACTION SECURITY TESTS:', pass, 'passed,', fail, 'failed ===');
if (fail > 0) process.exit(1);

// ---------------------------------------------------------------------------
console.log('== 6. Werewolf packmates recognize each other, but not other players ==');
{
  let state = createInitialState();
  state = { ...state, roleConfig: { werewolf_biasa: 2, alpha_wolf: 0, joker: 0, seer: 1, guard: 0, witch: 0, hunter: 0, cupid: 0, villager: 2 } };
  ['A', 'B', 'C', 'D', 'E'].forEach((name) => { state = reducer(state, { type: 'ADD_PLAYER', name }); });
  state = reducer(state, { type: 'ASSIGN_ROLES' });
  const wolves = state.game.players.filter((p) => p.role === 'werewolf_biasa');
  const nonWolves = state.game.players.filter((p) => p.role !== 'werewolf_biasa');
  check('Setup produced exactly 2 werewolves', wolves.length === 2);

  const wolfAView = redactForViewer(state, wolves[0].id, false);
  const teammateInView = wolfAView.players.find((p) => p.id === wolves[1].id);
  check('A werewolf CAN see their packmate\'s role', teammateInView.role === 'werewolf_biasa' && teammateInView.team === 'werewolf');

  const nonWolfInWolfView = wolfAView.players.find((p) => p.id === nonWolves[0].id);
  check('A werewolf still CANNOT see a non-werewolf player\'s role', nonWolfInWolfView.role === null);

  const seerPlayer = nonWolves.find((p) => p.role === 'seer');
  const seerView = redactForViewer(state, seerPlayer.id, false);
  const wolfInSeerView = seerView.players.find((p) => p.id === wolves[0].id);
  check('A non-werewolf (Seer) canNOT see a werewolf\'s role just by being alive', wolfInSeerView.role === null);
}

console.log('\n=== FINAL REDACTION TOTALS:', pass, 'passed,', fail, 'failed ===');
if (fail > 0) process.exit(1);
