import { io } from 'socket.io-client';

// When deployed on Vercel, import.meta.env.PROD is true. 
// We use a custom VITE_BACKEND_URL env var on Vercel to point to the Render backend.
// In local dev, it falls back to port 3001.
const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export const socket = io(backendUrl, {
  autoConnect: true,
  reconnection: true
});

const SESSION_KEY = 'werewolf_session_v1';

export function saveSession(code, token) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ code, token }));
}
export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function emitAck(event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res) => resolve(res));
  });
}
