import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';

import { initSchema } from './db.js';
import {
  generateRoomCode, loadOrInitRoom, persistRoom, createModeratorIdentity,
  createPlayerIdentity, identityForToken, nameTaken, applyAction, roomInMemory,
} from './rooms.js';
import { redactForViewer } from './redact.js';
import { ROLE_DEFS, parseBulkNames } from './game-logic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');

const app = express();
app.use(cors());
app.use(express.static(CLIENT_DIST));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function broadcastRoom(code, room) {
  for (const [socketId, token] of room.sockets.entries()) {
    const identity = identityForToken(room, token);
    if (!identity) continue;
    const view = redactForViewer(room.gameState, identity.playerId, identity.isModerator);
    io.to(socketId).emit('state_update', view);
  }
}

async function dispatchAndBroadcast(code, room, action) {
  applyAction(room, action);
  broadcastRoom(code, room);
  await persistRoom(code); // awaited so state is durable before the next action relies on it
}

function currentActingRole(gameState) {
  if (!gameState.game || gameState.game.phase !== 'night') return null;
  return gameState.game.nightTurnOrder[gameState.game.nightTurnIndex] || null;
}

function isHolderOfNightRole(gameState, playerId, roleKey) {
  const p = gameState.game.players.find((pl) => pl.id === playerId);
  if (!p || !p.alive) return false;
  if (roleKey === 'werewolf') return ROLE_DEFS[p.role].team === 'werewolf';
  return p.role === roleKey;
}

function getSocketContext(socket) {
  return socket.data.roomCode ? { code: socket.data.roomCode, token: socket.data.token } : null;
}

// ---------------------------------------------------------------------------
// Socket handlers
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  socket.on('create_room', async (_payload, ack) => {
    try {
      let code = generateRoomCode();
      const room = await loadOrInitRoom(code);
      const token = createModeratorIdentity(room);
      socket.join(code);
      socket.data.roomCode = code;
      socket.data.token = token;
      room.sockets.set(socket.id, token);
      await persistRoom(code);
      const view = redactForViewer(room.gameState, null, true);
      ack?.({ ok: true, code, token, view });
    } catch (e) {
      console.error('create_room failed:', e);
      ack?.({ ok: false, error: 'Gagal membuat room.' });
    }
  });

  socket.on('join_room', async ({ code, token, name } = {}, ack) => {
    try {
      code = (code || '').trim().toUpperCase();
      if (!code) return ack?.({ ok: false, error: 'Kode room kosong.' });
      const room = await loadOrInitRoom(code);
      const isFresh = room.gameState.players.length === 0 && !room.gameState.game && room.tokens.size === 0;
      if (isFresh) {
        // Nothing was ever created at this code (not in memory, not in Turso).
        return ack?.({ ok: false, error: 'Room tidak ditemukan.' });
      }

      let identity;
      let activeToken = token;

      if (token && identityForToken(room, token)) {
        identity = identityForToken(room, token);
      } else {
        if (room.gameState.game) {
          return ack?.({ ok: false, error: 'Game sudah dimulai, tidak bisa join pemain baru.' });
        }
        const cleanName = (name || '').trim();
        if (!cleanName) return ack?.({ ok: false, error: 'Nama tidak boleh kosong.' });
        if (nameTaken(room, cleanName)) return ack?.({ ok: false, error: 'Nama itu sudah dipakai di room ini.' });
        const playerId = 'p_' + Math.random().toString(36).slice(2, 10);
        applyAction(room, { type: 'ADD_PLAYER', name: cleanName, id: playerId });
        activeToken = createPlayerIdentity(room, playerId);
        identity = identityForToken(room, activeToken);
      }

      socket.join(code);
      socket.data.roomCode = code;
      socket.data.token = activeToken;
      room.sockets.set(socket.id, activeToken);
      await persistRoom(code);
      broadcastRoom(code, room);
      const view = redactForViewer(room.gameState, identity.playerId, identity.isModerator);
      ack?.({ ok: true, code, token: activeToken, view });
    } catch (e) {
      console.error('join_room failed:', e);
      ack?.({ ok: false, error: 'Gagal join room.' });
    }
  });

  // --- Moderator-only setup actions ---
  socket.on('set_role_count', async ({ role, delta } = {}) => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity?.isModerator) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'SET_ROLE_COUNT', role, delta });
  });

  socket.on('add_bulk_players', async ({ text } = {}) => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity?.isModerator) return;
    const names = parseBulkNames(text || '').filter((n) => !nameTaken(room, n));
    if (names.length === 0) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'ADD_BULK_PLAYERS', names });
  });

  socket.on('remove_player', async ({ id } = {}) => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity) return;
    if (!identity.isModerator && identity.playerId !== id) return; // can only remove self, unless moderator
    await dispatchAndBroadcast(ctx.code, room, { type: 'REMOVE_PLAYER', id });
  });

  socket.on('assign_roles', async () => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity?.isModerator) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'ASSIGN_ROLES' });
  });

  // --- Reveal phase ---
  socket.on('player_ready', async () => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity?.playerId) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'PLAYER_READY', playerId: identity.playerId });
  });

  socket.on('start_night_1', async () => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity?.isModerator) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'START_NIGHT_1' });
  });

  // --- Night actions ---
  socket.on('submit_night_action', async ({ role, payload } = {}) => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity) return;
    const acting = currentActingRole(room.gameState);
    if (!acting || acting !== role) return;
    const authorized = identity.isModerator || (identity.playerId && isHolderOfNightRole(room.gameState, identity.playerId, role));
    if (!authorized) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'SUBMIT_NIGHT_ACTION', role, payload });
  });

  socket.on('resolve_revenge', async ({ targetId } = {}) => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity) return;
    const pending = room.gameState.game?.resolution?.pendingRevenge;
    if (!pending) return;
    const authorized = identity.isModerator || identity.playerId === pending.hunterId;
    if (!authorized) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'RESOLVE_REVENGE', targetId: targetId || null });
  });

  // --- Morning / discussion / voting (moderator drives phase transitions; any alive player votes) ---
  socket.on('advance_to_discussion', async () => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity?.isModerator) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'ADVANCE_TO_DISCUSSION' });
  });

  socket.on('toggle_discussion_timer', async () => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity?.isModerator) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'TOGGLE_DISCUSSION_TIMER' });
  });

  socket.on('adjust_discussion_time', async ({ delta } = {}) => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity?.isModerator) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'ADJUST_DISCUSSION_TIME', delta });
  });

  socket.on('start_voting', async () => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity?.isModerator) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'START_VOTING' });
  });

  socket.on('cast_vote', async ({ voterId, targetId } = {}) => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity) return;
    const effectiveVoterId = identity.isModerator ? voterId : identity.playerId;
    if (!effectiveVoterId) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'CAST_VOTE', voterId: effectiveVoterId, targetId });
  });

  socket.on('retract_vote', async ({ voterId } = {}) => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity) return;
    const effectiveVoterId = identity.isModerator ? voterId : identity.playerId;
    if (!effectiveVoterId) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'RETRACT_VOTE', voterId: effectiveVoterId });
  });

  socket.on('finalize_vote', async ({ eliminatedId } = {}) => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity?.isModerator) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'FINALIZE_VOTE', eliminatedId: eliminatedId || null });
  });

  socket.on('reshuffle_same_players', async () => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity?.isModerator) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'RESHUFFLE_SAME_PLAYERS' });
  });

  socket.on('reset_game', async () => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = await loadOrInitRoom(ctx.code);
    const identity = identityForToken(room, ctx.token);
    if (!identity?.isModerator) return;
    await dispatchAndBroadcast(ctx.code, room, { type: 'RESET_GAME' });
  });

  // --- WebRTC & Chat ---
  socket.on('chat_message', async ({ message }) => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = roomInMemory(ctx.code);
    if (!room) return;
    const identity = identityForToken(room, ctx.token);
    if (!identity) return;
    
    const isModerator = identity.isModerator;
    const player = room.gameState.game?.players?.find(p => p.id === identity.playerId);
    
    // Check if player is dead. If game is running (not game_over), dead players cannot chat.
    if (player && !player.alive && room.gameState.game && room.gameState.game.phase !== 'game_over') {
      return; // Ignore chat from dead players during the game
    }

    const payload = {
      senderId: identity.playerId,
      senderName: isModerator ? 'Pemandu' : (player?.name || 'Unknown'),
      isModerator,
      isDead: player ? !player.alive : false,
      message,
      timestamp: Date.now()
    };
    
    // Dispatch to state (this saves it to DB via saveRoom inside dispatchAndBroadcast)
    await dispatchAndBroadcast(ctx.code, room, { type: 'ADD_CHAT_MESSAGE', payload });
  });

  socket.on('webrtc_signal', ({ targetPlayerId, signal }) => {
    const ctx = getSocketContext(socket); if (!ctx) return;
    const room = roomInMemory(ctx.code);
    if (!room) return;
    const senderIdentity = identityForToken(room, ctx.token);
    
    // find target's socket
    let targetSocketId = null;
    for (const [sId, sToken] of room.sockets.entries()) {
      const id = identityForToken(room, sToken);
      if (id && id.playerId === targetPlayerId) {
        targetSocketId = sId;
        break;
      }
    }
    if (targetSocketId) {
      io.to(targetSocketId).emit('webrtc_signal', { 
        senderPlayerId: senderIdentity?.playerId, 
        signal 
      });
    }
  });

  socket.on('disconnect', () => {
    const ctx = getSocketContext(socket);
    if (!ctx) return;
    const room = roomInMemory(ctx.code);
    if (room) room.sockets.delete(socket.id);
  });
});

initSchema()
  .then(() => {
    httpServer.listen(PORT, () => console.log(`Werewolf online server listening on :${PORT}`));
  })
  .catch((e) => {
    console.error('Failed to init database schema:', e);
    process.exit(1);
  });
