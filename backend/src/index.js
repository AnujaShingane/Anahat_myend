import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { connectMongo } from './config/mongo.js';
import { connectPostgres } from './config/postgres.js';
import { sessionMiddleware } from './config/session.js';
import { attachChatSocket } from './services/chatSocket.js';

const server = http.createServer(app);
attachChatSocket(server, sessionMiddleware, env.clientUrls);

async function start() {
  try {
    await connectPostgres();
    await connectMongo();

    server.listen(env.port, () => {
      console.log(`✔ Harmony backend listening on port ${env.port}`);
    });
  } catch (error) {
    console.error('Failed to start Harmony backend:', error);
    process.exitCode = 1;
  }
}

start();
