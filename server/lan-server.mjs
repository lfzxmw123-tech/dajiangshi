import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 8098);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
    if (!name) { res.writeHead(302, { Location: '/LCC-Web-0.6.2/game/?lan=1&mode=cs' }).end(); return; }
    if (name.includes('\\') || name.split('/').some(p => p.startsWith('.')) || !['LCC-Web-0.6.2', 'religious_center_L2_P'].includes(name.split('/')[0])) { res.writeHead(403).end(); return; }
    let file = path.resolve(root, name);
    if (!file.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const { size } = await stat(file);
    let start = 0, end = size - 1, status = 200;
    if (req.headers.range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if (!m) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
      start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), end) : end;
      if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
      status = 206;
    }
    res.writeHead(status, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': Math.max(0, end - start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
    if (req.method === 'HEAD' || !size) { res.end(); return; }
    const stream = createReadStream(file, { start, end }); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
const wss = new WebSocketServer({ server, maxPayload: 4096 });
const players = new Map(); let nextId = 1;
const actions = new Set(['Idle', 'Walk', 'Run', 'Reload', 'Death']);
function broadcast() {
  const message = JSON.stringify({ type: 'state', players: [...players.values()].filter(p => p.state).map(p => p.state) });
  for (const { ws } of players.values()) if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536) ws.send(message);
}
wss.on('connection', ws => {
  const id = String(nextId++); const player = { ws, state: null }; players.set(id, player);
  ws.send(JSON.stringify({ type: 'welcome', id }));
  ws.on('message', raw => {
    try {
      const m = JSON.parse(raw);
      if (m.type !== 'state' || !['x', 'y', 'z', 'yaw'].every(k => Number.isFinite(m[k]) && Math.abs(m[k]) < 10000)) return;
      player.state = { id, x: m.x, y: m.y, z: m.z, yaw: m.yaw, action: actions.has(m.action) ? m.action : 'Idle', shot: Number.isSafeInteger(m.shot) && m.shot >= 0 ? m.shot : 0, driving: m.driving === true };
    } catch {}
  });
  ws.on('error', () => {});
  ws.on('close', () => { players.delete(id); broadcast(); });
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
});
setInterval(broadcast, 80).unref();
setInterval(() => { for (const { ws } of players.values()) { if (!ws.isAlive) ws.terminate(); else { ws.isAlive = false; ws.ping(); } } }, 15000).unref();
server.listen(port, '0.0.0.0', () => {
  console.log(`Local: http://localhost:${port}/`);
  for (const net of Object.values(os.networkInterfaces()).flat()) if (net?.family === 'IPv4' && !net.internal) console.log(`LAN: http://${net.address}:${port}/`);
});
