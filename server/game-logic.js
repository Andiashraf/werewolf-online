// ============================================================================
// Werewolf game engine — server-authoritative. This is the SAME logic that
// was unit-tested exhaustively in the offline artifact version, with one
// change: the single-device "pass the phone" sequential reveal is replaced
// by an independent per-player ready-check, since every player now has their
// own device and can view their own role whenever they like.
// ============================================================================

export const ROLE_DEFS = {
  werewolf_biasa: { label: 'Werewolf Biasa', team: 'werewolf', desc: 'Ikut memilih korban bersama Werewolf lain setiap malam.' },
  alpha_wolf: { label: 'Alpha Wolf', team: 'werewolf', desc: 'Werewolf utama. Jika mati, malam berikutnya Werewolf boleh menggigit 2 orang.' },
  joker: { label: 'Joker / Fool', team: 'netral', desc: 'Tidak membela siapa pun. Menang sendirian jika berhasil digantung warga di siang hari.' },
  seer: { label: 'Seer', team: 'warga', desc: 'Peramal — memeriksa role asli satu pemain setiap malam.' },
  guard: { label: 'Guard', team: 'warga', desc: 'Melindungi satu pemain dari serangan Werewolf setiap malam.' },
  witch: { label: 'Witch', team: 'warga', desc: 'Punya 1 ramuan penolong & 1 ramuan racun, masing-masing sekali pakai seumur game.' },
  hunter: { label: 'Hunter', team: 'warga', desc: 'Jika mati (kapan pun & apa pun sebabnya), boleh langsung menembak mati 1 pemain lain.' },
  cupid: { label: 'Cupid', team: 'warga', desc: 'Malam pertama, menjodohkan 2 pemain — sehidup semati (jika satu mati, pasangannya ikut mati).' },
  villager: { label: 'Villager', team: 'warga', desc: 'Warga biasa tanpa kekuatan khusus.' },
};

export const DEFAULT_ROLE_CONFIG = {
  werewolf_biasa: 2, alpha_wolf: 1, joker: 1, seer: 1, guard: 1, witch: 1, hunter: 1, cupid: 1, villager: 8,
};

export const TEAM_LABEL = { werewolf: 'Werewolf', netral: 'Netral', warga: 'Warga' };
const DEFAULT_DISCUSSION_SECONDS = 180;

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function parseBulkNames(text) {
  return text
    .split('\n')
    .map((line) => {
      let s = line.trim();
      if (!s) return null;
      s = s.replace(/^\d+[.)]\s*/, '');
      const m = s.match(/^(.*?)\s*-\s*\d{6,}$/);
      if (m) s = m[1].trim();
      s = s.replace(/,\s*$/, '').trim();
      return s || null;
    })
    .filter(Boolean);
}

export function buildShuffledRoles(roleConfig) {
  const pool = [];
  Object.entries(roleConfig).forEach(([key, count]) => {
    for (let i = 0; i < count; i++) pool.push(key);
  });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function emptyNightActions() {
  return { wolfTargets: [], guardTarget: null, witchSaveTarget: null, witchPoisonTarget: null };
}

export function buildNightTurnOrder(players, round, witchPotions) {
  const order = [];
  const hasAlive = (role) => players.some((p) => p.role === role && p.alive);
  if (round === 1 && hasAlive('cupid')) order.push('cupid');
  if (hasAlive('seer')) order.push('seer');
  if (hasAlive('guard')) order.push('guard');
  const wolfAlive = players.some((p) => ROLE_DEFS[p.role].team === 'werewolf' && p.alive);
  if (wolfAlive) order.push('werewolf');
  if (hasAlive('witch') && witchPotions && (!witchPotions.saveUsed || !witchPotions.poisonUsed)) order.push('witch');
  return order;
}

export function computeNightDeaths(nightActions) {
  const deaths = [];
  nightActions.wolfTargets.forEach((targetId) => {
    const blocked = nightActions.guardTarget === targetId || nightActions.witchSaveTarget === targetId;
    if (!blocked) deaths.push({ playerId: targetId, cause: 'wolf' });
  });
  if (nightActions.witchPoisonTarget) {
    deaths.push({ playerId: nightActions.witchPoisonTarget, cause: 'poison' });
  }
  return deaths;
}

function deathLogText(p, cause) {
  const roleLabel = ROLE_DEFS[p.role].label;
  switch (cause) {
    case 'wolf': return `${p.name} tewas diserang Werewolf. (${roleLabel})`;
    case 'poison': return `${p.name} tewas diracun Witch. (${roleLabel})`;
    case 'lover': return `${p.name} ikut gugur karena ikatan Cupid. (${roleLabel})`;
    case 'hunter_revenge': return `${p.name} tertembak Hunter. (${roleLabel})`;
    case 'vote': return `${p.name} dieliminasi vote. (${roleLabel})`;
    default: return `${p.name} tewas. (${roleLabel})`;
  }
}

export function resolveDeaths(playersIn, queueIn, moderatorLogIn, round, deathsThisBatchIn = []) {
  const players = playersIn.map((p) => ({ ...p }));
  const queue = [...queueIn];
  const log = [...moderatorLogIn];
  const deathsThisBatch = [...deathsThisBatchIn];

  while (queue.length > 0) {
    const { playerId, cause } = queue.shift();
    const p = players.find((pl) => pl.id === playerId);
    if (!p || !p.alive) continue;
    p.alive = false;
    p.deathCause = cause;
    p.deathRound = round;
    deathsThisBatch.push({ playerId, cause });
    log.push({ id: newId(), text: deathLogText(p, cause) });

    if (p.loverId) {
      const lover = players.find((pl) => pl.id === p.loverId);
      if (lover && lover.alive) queue.push({ playerId: lover.id, cause: 'lover' });
    }
    if (p.role === 'hunter') {
      return { players, queue, log, pendingRevenge: { hunterId: p.id, hunterName: p.name }, deathsThisBatch };
    }
  }
  return { players, queue, log, pendingRevenge: null, deathsThisBatch };
}

// votes: { voterId: targetId }. Returns { targetId: count } tallies.
export function tallyVotes(votes) {
  const tally = {};
  Object.values(votes).forEach((targetId) => {
    tally[targetId] = (tally[targetId] || 0) + 1;
  });
  return tally;
}

export function checkWinCondition(players) {
  const joker = players.find((p) => p.role === 'joker');
  if (joker && !joker.alive && joker.deathCause === 'vote') return { team: 'joker', name: joker.name };
  const aliveWerewolves = players.filter((p) => p.alive && ROLE_DEFS[p.role].team === 'werewolf');
  const aliveWarga = players.filter((p) => p.alive && ROLE_DEFS[p.role].team === 'warga');
  if (aliveWerewolves.length === 0) return { team: 'warga' };
  if (aliveWerewolves.length >= aliveWarga.length) return { team: 'werewolf' };
  return null;
}

function buildPublicMorningLog(deathsThisBatch, players) {
  if (deathsThisBatch.length === 0) {
    return [{ id: newId(), text: 'Malam berlalu dengan damai — tidak ada yang tewas.' }];
  }
  const entries = [];
  const hidden = deathsThisBatch.filter((d) => d.cause === 'wolf' || d.cause === 'poison');
  const revealed = deathsThisBatch.filter((d) => d.cause !== 'wolf' && d.cause !== 'poison');
  if (hidden.length > 0) {
    const names = hidden.map((d) => {
      const p = players.find((pl) => pl.id === d.playerId);
      return `${p.name} (${ROLE_DEFS[p.role].label})`;
    }).join(', ');
    entries.push({ id: newId(), text: `Warga menemukan ${hidden.length} orang tewas semalam: ${names}.` });
  }
  revealed.forEach((d) => {
    const p = players.find((pl) => pl.id === d.playerId);
    const roleLabel = ROLE_DEFS[p.role].label;
    if (d.cause === 'lover') entries.push({ id: newId(), text: `${p.name} (${roleLabel}) ikut gugur — ternyata dijodohkan Cupid dengan pasangannya yang baru tewas.` });
    else if (d.cause === 'hunter_revenge') entries.push({ id: newId(), text: `${p.name} (${roleLabel}) tertembak oleh Hunter yang gugur.` });
    else if (d.cause === 'vote') entries.push({ id: newId(), text: `${p.name} (${roleLabel}) dieliminasi lewat voting warga.` });
  });
  return entries;
}

function beginNight(game, order) {
  if (order.length === 0) {
    const result = resolveDeaths(game.players, [], game.moderatorLog, game.round, []);
    return finishResolution({ ...game, players: result.players, moderatorLog: result.log }, result, 'night');
  }
  return { ...game, phase: 'night', nightTurnOrder: order, nightTurnIndex: 0, nightActions: emptyNightActions() };
}

function prepareNextNight(game, alphaJustDied) {
  const nextRound = game.round + 1;
  const nextDoubleBite = alphaJustDied || game.doubleBiteNextNight;
  const order = buildNightTurnOrder(game.players, nextRound, game.witchPotions);
  const advanced = { ...game, round: nextRound, doubleBiteNextNight: nextDoubleBite };
  return beginNight(advanced, order);
}

function finishResolution(game, result, origin) {
  const winner = checkWinCondition(result.players);
  const publicEntries = buildPublicMorningLog(result.deathsThisBatch, result.players);
  const alphaJustDied = result.deathsThisBatch.some((d) => {
    const p = result.players.find((pl) => pl.id === d.playerId);
    return p && p.role === 'alpha_wolf';
  });
  let next = {
    ...game, players: result.players, moderatorLog: result.log,
    publicLog: [...game.publicLog, ...publicEntries], resolution: null,
  };
  if (winner) { next.phase = 'game_over'; next.winner = winner; return next; }
  if (origin === 'night') {
    next.phase = 'morning';
    next.lastNightDeaths = result.deathsThisBatch;
    next.doubleBiteNextNight = alphaJustDied;
    return next;
  }
  return prepareNextNight(next, alphaJustDied);
}

function advanceNightTurn(state) {
  const nextIndex = state.game.nightTurnIndex + 1;
  if (nextIndex < state.game.nightTurnOrder.length) {
    return { ...state, game: { ...state.game, nightTurnIndex: nextIndex } };
  }
  const initialQueue = computeNightDeaths(state.game.nightActions);
  const result = resolveDeaths(state.game.players, initialQueue, state.game.moderatorLog, state.game.round, []);
  if (result.pendingRevenge) {
    return {
      ...state,
      game: {
        ...state.game, players: result.players, moderatorLog: result.log, phase: 'resolution',
        resolution: { queue: result.queue, pendingRevenge: result.pendingRevenge, origin: 'night', deathsThisBatch: result.deathsThisBatch },
      },
    };
  }
  const game = finishResolution({ ...state.game, players: result.players, moderatorLog: result.log }, result, 'night');
  return { ...state, game };
}

export function createInitialState() {
  return { roleConfig: { ...DEFAULT_ROLE_CONFIG }, players: [], game: null, messages: [] };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'SET_ROLE_COUNT': {
      const count = Math.max(0, state.roleConfig[action.role] + action.delta);
      return { ...state, roleConfig: { ...state.roleConfig, [action.role]: count } };
    }
    case 'ADD_PLAYER': {
      const name = action.name.trim();
      if (!name) return state;
      return { ...state, players: [...state.players, { id: action.id || newId(), name }] };
    }
    case 'ADD_BULK_PLAYERS': {
      if (!action.names || action.names.length === 0) return state;
      return { ...state, players: [...state.players, ...action.names.map((name) => ({ id: newId(), name }))] };
    }
    case 'REMOVE_PLAYER':
      return { ...state, players: state.players.filter((p) => p.id !== action.id) };
    case 'ADD_CHAT_MESSAGE':
      // Limit to last 200 messages to prevent infinite DB growth
      return { ...state, messages: [...(state.messages || []), action.payload].slice(-200) };
    case 'RESET_ALL':
      return createInitialState();
    case 'ASSIGN_ROLES': {
      const total = Object.values(state.roleConfig).reduce((a, b) => a + b, 0);
      if (state.players.length === 0 || total !== state.players.length) return state;
      const pool = buildShuffledRoles(state.roleConfig);
      const gPlayers = state.players.map((p, i) => ({
        id: p.id, name: p.name, role: pool[i], alive: true, deathCause: null, deathRound: null, loverId: null,
      }));
      return {
        ...state,
        game: {
          phase: 'reveal', players: gPlayers, round: 1, readyPlayers: [],
          nightTurnOrder: [], nightTurnIndex: 0, nightActions: emptyNightActions(),
          witchPotions: { saveUsed: false, poisonUsed: false }, doubleBiteNextNight: false,
          resolution: null, lastNightDeaths: [], votes: {},
          discussionSeconds: DEFAULT_DISCUSSION_SECONDS, discussionRunning: false, winner: null,
          publicLog: [{ id: newId(), text: `Peran telah dibagikan ke ${gPlayers.length} pemain secara acak.` }],
          moderatorLog: [{ id: newId(), text: `Peran: ${gPlayers.map((p) => `${p.name}=${ROLE_DEFS[p.role].label}`).join(', ')}` }],
        },
      };
    }
    case 'PLAYER_READY': {
      if (!state.game || state.game.phase !== 'reveal') return state;
      if (state.game.readyPlayers.includes(action.playerId)) return state;
      return { ...state, game: { ...state.game, readyPlayers: [...state.game.readyPlayers, action.playerId] } };
    }
    case 'START_NIGHT_1': {
      if (!state.game || state.game.phase !== 'reveal') return state;
      const order = buildNightTurnOrder(state.game.players, 1, state.game.witchPotions);
      const withLog = {
        ...state.game,
        publicLog: [...state.game.publicLog, { id: newId(), text: 'Malam pertama dimulai.' }],
      };
      return { ...state, game: beginNight(withLog, order) };
    }
    case 'SUBMIT_NIGHT_ACTION': {
      if (!state.game || state.game.phase !== 'night') return state;
      const currentRole = state.game.nightTurnOrder[state.game.nightTurnIndex];
      if (currentRole !== action.role) return state;
      const { role, payload } = action;
      const nightActions = { ...state.game.nightActions };
      const witchPotions = { ...state.game.witchPotions };
      const moderatorLog = [...state.game.moderatorLog];

      if (role === 'cupid') {
        const { aId, bId } = payload;
        const gPlayers = state.game.players.map((p) => {
          if (p.id === aId) return { ...p, loverId: bId };
          if (p.id === bId) return { ...p, loverId: aId };
          return p;
        });
        const aName = gPlayers.find((p) => p.id === aId).name;
        const bName = gPlayers.find((p) => p.id === bId).name;
        moderatorLog.push({ id: newId(), text: `Cupid menjodohkan ${aName} & ${bName}.` });
        return advanceNightTurn({ ...state, game: { ...state.game, players: gPlayers, moderatorLog } });
      }
      if (role === 'seer') {
        const target = state.game.players.find((p) => p.id === payload.targetId);
        moderatorLog.push({ id: newId(), text: `Seer memeriksa ${target.name} -> ${ROLE_DEFS[target.role].label}.` });
        return advanceNightTurn({ ...state, game: { ...state.game, moderatorLog } });
      }
      if (role === 'guard') {
        if (payload.targetId) {
          nightActions.guardTarget = payload.targetId;
          const target = state.game.players.find((p) => p.id === payload.targetId);
          moderatorLog.push({ id: newId(), text: `Guard melindungi ${target.name}.` });
        } else {
          moderatorLog.push({ id: newId(), text: 'Guard memilih untuk tidak melindungi siapa pun.' });
        }
        return advanceNightTurn({ ...state, game: { ...state.game, nightActions, moderatorLog } });
      }
      if (role === 'werewolf') {
        nightActions.wolfTargets = payload.targetIds;
        const names = payload.targetIds.map((id) => state.game.players.find((p) => p.id === id).name).join(' & ');
        moderatorLog.push({ id: newId(), text: `Werewolf menyerang ${names}.` });
        return advanceNightTurn({ ...state, game: { ...state.game, nightActions, moderatorLog, doubleBiteNextNight: false } });
      }
      if (role === 'witch') {
        const { saveTargetId, poisonTargetId } = payload;
        if (saveTargetId) {
          nightActions.witchSaveTarget = saveTargetId;
          witchPotions.saveUsed = true;
          moderatorLog.push({ id: newId(), text: `Witch memakai ramuan penolong untuk ${state.game.players.find((p) => p.id === saveTargetId).name}.` });
        }
        if (poisonTargetId) {
          nightActions.witchPoisonTarget = poisonTargetId;
          witchPotions.poisonUsed = true;
          moderatorLog.push({ id: newId(), text: `Witch meracuni ${state.game.players.find((p) => p.id === poisonTargetId).name}.` });
        }
        if (!saveTargetId && !poisonTargetId) {
          moderatorLog.push({ id: newId(), text: 'Witch tidak memakai ramuan malam ini.' });
        }
        return advanceNightTurn({ ...state, game: { ...state.game, nightActions, witchPotions, moderatorLog } });
      }
      return state;
    }
    case 'RESOLVE_REVENGE': {
      if (!state.game || state.game.phase !== 'resolution' || !state.game.resolution?.pendingRevenge) return state;
      const { hunterId, hunterName } = state.game.resolution.pendingRevenge;
      const queue = [...state.game.resolution.queue];
      const moderatorLog = [...state.game.moderatorLog];
      if (action.targetId) {
        const targetName = state.game.players.find((p) => p.id === action.targetId)?.name || '???';
        queue.push({ playerId: action.targetId, cause: 'hunter_revenge' });
        moderatorLog.push({ id: newId(), text: `${hunterName} (Hunter) menembak ${targetName} sebelum tewas.` });
      } else {
        moderatorLog.push({ id: newId(), text: `${hunterName} (Hunter) memilih tidak menembak siapa pun.` });
      }
      const result = resolveDeaths(state.game.players, queue, moderatorLog, state.game.round, state.game.resolution.deathsThisBatch);
      const origin = state.game.resolution.origin;
      if (result.pendingRevenge) {
        return {
          ...state,
          game: {
            ...state.game, players: result.players, moderatorLog: result.log,
            resolution: { queue: result.queue, pendingRevenge: result.pendingRevenge, origin, deathsThisBatch: result.deathsThisBatch },
          },
        };
      }
      const game = finishResolution({ ...state.game, players: result.players, moderatorLog: result.log }, result, origin);
      return { ...state, game };
    }
    case 'ADVANCE_TO_DISCUSSION': {
      if (!state.game || state.game.phase !== 'morning') return state;
      return {
        ...state,
        game: {
          ...state.game, phase: 'discussion', discussionSeconds: DEFAULT_DISCUSSION_SECONDS, discussionRunning: false,
          publicLog: [...state.game.publicLog, { id: newId(), text: 'Waktunya diskusi. Siapa yang mencurigakan?' }],
        },
      };
    }
    case 'TOGGLE_DISCUSSION_TIMER': {
      if (!state.game || state.game.phase !== 'discussion') return state;
      return { ...state, game: { ...state.game, discussionRunning: !state.game.discussionRunning } };
    }
    case 'TICK_DISCUSSION': {
      if (!state.game || state.game.phase !== 'discussion' || !state.game.discussionRunning) return state;
      const secs = Math.max(0, state.game.discussionSeconds - 1);
      return { ...state, game: { ...state.game, discussionSeconds: secs, discussionRunning: secs > 0 } };
    }
    case 'ADJUST_DISCUSSION_TIME': {
      if (!state.game || state.game.phase !== 'discussion') return state;
      return { ...state, game: { ...state.game, discussionSeconds: Math.max(0, state.game.discussionSeconds + action.delta) } };
    }
    case 'START_VOTING': {
      if (!state.game || state.game.phase !== 'discussion') return state;
      return {
        ...state,
        game: { ...state.game, phase: 'voting', votes: {}, discussionRunning: false, publicLog: [...state.game.publicLog, { id: newId(), text: 'Voting dimulai.' }] },
      };
    }
    case 'CAST_VOTE': {
      // action.voterId casts (or changes) their single vote for action.targetId.
      if (!state.game || state.game.phase !== 'voting') return state;
      const voter = state.game.players.find((p) => p.id === action.voterId);
      const target = state.game.players.find((p) => p.id === action.targetId);
      if (!voter || !voter.alive || !target || !target.alive) return state;
      return { ...state, game: { ...state.game, votes: { ...state.game.votes, [action.voterId]: action.targetId } } };
    }
    case 'RETRACT_VOTE': {
      if (!state.game || state.game.phase !== 'voting') return state;
      const votes = { ...state.game.votes };
      delete votes[action.voterId];
      return { ...state, game: { ...state.game, votes } };
    }
    case 'FINALIZE_VOTE': {
      if (!state.game || state.game.phase !== 'voting') return state;
      if (!action.eliminatedId) {
        let game = { ...state.game, publicLog: [...state.game.publicLog, { id: newId(), text: 'Hasil voting seri / tidak ada mayoritas — tidak ada yang dieliminasi hari ini.' }] };
        game = prepareNextNight(game, false);
        return { ...state, game };
      }
      const result = resolveDeaths(state.game.players, [{ playerId: action.eliminatedId, cause: 'vote' }], state.game.moderatorLog, state.game.round, []);
      if (result.pendingRevenge) {
        return {
          ...state,
          game: {
            ...state.game, players: result.players, moderatorLog: result.log, phase: 'resolution',
            resolution: { queue: result.queue, pendingRevenge: result.pendingRevenge, origin: 'vote', deathsThisBatch: result.deathsThisBatch },
          },
        };
      }
      const game = finishResolution({ ...state.game, players: result.players, moderatorLog: result.log }, result, 'vote');
      return { ...state, game };
    }
    case 'RESHUFFLE_SAME_PLAYERS':
      return reducer(state, { type: 'ASSIGN_ROLES' });
    case 'RESET_GAME':
      return createInitialState();
    default:
      return state;
  }
}
