// ============================================================================
// Per-viewer redaction. This is what makes the online version actually safe
// for hidden roles: the server holds ONE full authoritative state, and this
// function produces a filtered view for each specific socket before it's
// ever sent. A socket only ever receives the object this function returns —
// it never has access to the full state.
// ============================================================================

import { ROLE_DEFS, tallyVotes } from './game-logic.js';

const NIGHT_ROLE_LABEL = { cupid: 'Cupid', seer: 'Seer', guard: 'Guard', werewolf: 'Werewolf', witch: 'Witch' };

export function redactForViewer(state, viewerPlayerId, isModerator) {
  const { roleConfig, players, game } = state;

  if (!game) {
    return { phase: 'setup', roleConfig, players, isModerator, viewerPlayerId: viewerPlayerId || null, messages: state.messages || [] };
  }

  const viewerPlayer = viewerPlayerId ? game.players.find((p) => p.id === viewerPlayerId) : null;
  const viewerTeam = viewerPlayer ? ROLE_DEFS[viewerPlayer.role].team : null;

  const base = {
    phase: game.phase,
    round: game.round,
    players: game.players.map((p) => publicPlayerView(p, viewerPlayerId, isModerator, viewerTeam)),
    publicLog: game.publicLog,
    winner: game.winner || null,
    isModerator,
    viewerPlayerId: viewerPlayerId || null,
    messages: state.messages || [],
  };

  if (isModerator) {
    base.moderatorLog = game.moderatorLog;
    base.roleConfig = roleConfig;
  }

  if (game.phase === 'reveal') {
    base.readyCount = game.readyPlayers.length;
    base.totalCount = game.players.length;
    base.youAreReady = viewerPlayerId ? game.readyPlayers.includes(viewerPlayerId) : false;
    if (viewerPlayerId) {
      const me = game.players.find((p) => p.id === viewerPlayerId);
      if (me) {
        const def = ROLE_DEFS[me.role];
        base.myRole = { role: me.role, label: def.label, team: def.team, desc: def.desc };
      }
    }
    return base;
  }

  if (game.phase === 'night') {
    const currentRole = game.nightTurnOrder[game.nightTurnIndex] || null;
    base.nightTurnOrder = game.nightTurnOrder;
    base.nightTurnIndex = game.nightTurnIndex;
    base.currentTurnRoleLabel = currentRole ? NIGHT_ROLE_LABEL[currentRole] : null;
    base.doubleBiteNextNight = game.doubleBiteNextNight;

    const iAmActing = !!currentRole && (isModerator || (viewerPlayerId && isHolderOfNightRole(game, viewerPlayerId, currentRole)));
    base.myTurn = iAmActing;
    if (iAmActing) {
      base.actingRole = currentRole;
      base.nightActions = game.nightActions;
      base.witchPotions = game.witchPotions;
    }
    return base;
  }

  if (game.phase === 'resolution') {
    const rev = game.resolution ? game.resolution.pendingRevenge : null;
    base.pendingRevenge = rev;
    base.canActOnRevenge = !!rev && (isModerator || viewerPlayerId === rev.hunterId);
    return base;
  }

  if (game.phase === 'morning') {
    base.lastNightDeaths = game.lastNightDeaths;
    return base;
  }

  if (game.phase === 'discussion') {
    base.discussionSeconds = game.discussionSeconds;
    base.discussionRunning = game.discussionRunning;
    return base;
  }

  if (game.phase === 'voting') {
    // Day voting is public by convention (players call out or raise hands for
    // who they're accusing) — unlike night actions, there's no reason to hide
    // who voted for whom.
    base.votes = game.votes;
    base.tally = tallyVotes(game.votes);
    base.aliveCount = game.players.filter((p) => p.alive).length;
    return base;
  }

  // game_over
  return base;
}

function isHolderOfNightRole(game, playerId, roleKey) {
  const p = game.players.find((pl) => pl.id === playerId);
  if (!p || !p.alive) return false;
  if (roleKey === 'werewolf') return ROLE_DEFS[p.role].team === 'werewolf';
  return p.role === roleKey;
}

// A player's role/team is visible to: themself, the moderator, anyone once
// that player has died (standard "role revealed on death"), or a fellow
// werewolf (wolves know their own pack — that's how they coordinate a
// target without needing the moderator to tell them). Otherwise it stays
// null — this is the single most important function in this file.
function publicPlayerView(p, viewerPlayerId, isModerator, viewerTeam) {
  const packmates = viewerTeam === 'werewolf' && ROLE_DEFS[p.role].team === 'werewolf';
  const revealRole = !p.alive || isModerator || p.id === viewerPlayerId || packmates;
  return {
    id: p.id,
    name: p.name,
    alive: p.alive,
    role: revealRole ? p.role : null,
    roleLabel: revealRole ? ROLE_DEFS[p.role].label : null,
    team: revealRole ? ROLE_DEFS[p.role].team : null,
  };
}
