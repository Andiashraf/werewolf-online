// ============================================================================
// Room management. Each room = one game session, identified by a short code
// players share (like "PLAY42"). Identity is a lightweight random token
// (not a real account) issued when you create a room (moderator) or join
// one (player) — the client stores it and presents it again on reconnect
// (e.g. after a refresh) to resume as the same identity. This is adequate
// for a trusted friend-group game; it is NOT meant to withstand a hostile
// participant with server access.
// ============================================================================

import crypto from 'node:crypto';
import { reducer, createInitialState } from './game-logic.js';
import { loadRoom, saveRoom } from './db.js';

const rooms = new Map(); // code -> { gameState, tokens: Map(token -> {playerId, isModerator}), sockets: Map(socket.id -> token) }

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity

export function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

function newToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export function roomInMemory(code) {
  return rooms.get(code);
}

export async function loadOrInitRoom(code) {
  if (rooms.has(code)) return rooms.get(code);
  const persisted = await loadRoom(code);
  const room = {
    gameState: persisted?.gameState || createInitialState(),
    tokens: new Map(Object.entries(persisted?.tokens || {})),
    sockets: new Map(),
  };
  rooms.set(code, room);
  return room;
}

export async function persistRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  await saveRoom(code, {
    gameState: room.gameState,
    tokens: Object.fromEntries(room.tokens),
  });
}

export function createModeratorIdentity(room) {
  const token = newToken();
  room.tokens.set(token, { playerId: null, isModerator: true });
  return token;
}

export function createPlayerIdentity(room, playerId) {
  const token = newToken();
  room.tokens.set(token, { playerId, isModerator: false });
  return token;
}

export function identityForToken(room, token) {
  return room.tokens.get(token) || null;
}

export function nameTaken(room, name) {
  const lower = name.trim().toLowerCase();
  return room.gameState.players.some((p) => p.name.trim().toLowerCase() === lower)
    || (room.gameState.game && room.gameState.game.players.some((p) => p.name.trim().toLowerCase() === lower));
}

export function applyAction(room, action) {
  room.gameState = reducer(room.gameState, action);
  return room.gameState;
}
