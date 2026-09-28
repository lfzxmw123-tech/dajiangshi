import { WebSocketServer } from 'ws';
import os from 'node:os';
const port = Number(process.env.PORT || 8098);
const wss = new WebSocketServer({ host: '0.0.0.0', port });
const players = new Map(); let nextId = 1;
const snapshot = () => JSON.stringify({ type: 'state', players: [...players.values()] });
function broadcast() { const msg = snapshot(); for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(msg); }
wss.on('connection', ws => {
  const id = String(nextId++); const p = { id, name: `Player-${id}`, x: 0, y: 1.55, z: 0, yaw: 0, mode: 'zombie', ws }; players.set(id, p);
  ws.send(JSON.stringify({ type: 'welcome', id })); broadcast();
  ws.on('message', raw => { try { const m = JSON.parse(raw); if (m.type !== 'state') return; for (const k of ['x','y','z','yaw']) if (Number.isFinite(m[k])) p[k] = Math.max(-10000, Math.min(10000, m[k])); if (typeof m.mode === 'string') p.mode = m.mode.slice(0, 20); broadcast(); } catch {} });
  ws.on('close', () => { players.delete(id); broadcast(); });
});
const nets = Object.values(os.networkInterfaces()).flat().filter(x => x && x.family === 'IPv4' && !x.internal).map(x => x.address);
console.log(`LAN server listening on ws://0.0.0.0:${port}`); for (const ip of nets) console.log(`Connect from: ws://${ip}:${port}`);
