import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { planTask } from './planner.js';
import { runApprovedDemoTool } from './tools.js';

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT || 8787);
const origin = process.env.WEB_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin }));
app.use(express.json({ limit: '32kb' }));

const clients = new Set();
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  clients.add(socket);
  socket.send(JSON.stringify({ type: 'connected', message: 'JARVIS live channel connected' }));
  socket.on('close', () => clients.delete(socket));
});

function broadcast(event) {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'JARVIS', version: '0.1.0' });
});

app.post('/api/command', async (req, res) => {
  const command = String(req.body?.command || '').trim();
  if (!command) return res.status(400).json({ error: 'কমান্ড লিখুন।' });
  if (command.length > 1000) return res.status(400).json({ error: 'কমান্ড সর্বোচ্চ ১০০০ অক্ষরের হতে পারে।' });

  const taskId = randomUUID();
  const plan = planTask(command);
  broadcast({ type: 'task', taskId, status: 'planned', plan });

  // Safe demo only: no arbitrary OS or browser control.
  const result = await runApprovedDemoTool(plan);
  broadcast({ type: 'task', taskId, status: 'completed', result });

  res.json({ taskId, plan, result });
});

server.listen(port, () => {
  console.log(`JARVIS server running at http://localhost:${port}`);
});
