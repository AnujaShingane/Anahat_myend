import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { connectPostgres } from './config/postgres.js';
import { connectMongo } from './config/mongo.js';
import { sessionMiddleware } from './config/session.js';
import { attachChatSocket } from './services/chatSocket.js';
import { ensureAdmin } from './seed/adminSeed.js';

async function start() {
  await connectPostgres();
  await connectMongo();
  await ensureAdmin();

  const server = http.createServer(app);
  attachChatSocket(server, sessionMiddleware, env.clientUrl);
  server.listen(env.port, () => console.log(`✔ Harmony API running on http://localhost:${env.port}`));
}

start().catch((e) => { console.error(e); process.exit(1); });
