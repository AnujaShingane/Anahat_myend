import { Server } from 'socket.io';
import { Message } from '../models/mongo/Message.js';
import { User } from '../models/postgres/index.js';
import { roomIdFor } from '../utils/chatRoom.js';
import { canChat } from '../controllers/chatController.js';

export function attachChatSocket(httpServer, sessionMiddleware, clientUrl) {
  const io = new Server(httpServer, { cors: { origin: clientUrl, credentials: true } });

  // Reuse the express session so sockets are authenticated by the same cookie.
  io.engine.use(sessionMiddleware);

  io.use(async (socket, next) => {
    const userId = socket.request.session?.userId;
    if (!userId) return next(new Error('unauthorized'));
    const user = await User.findByPk(userId);
    if (!user) return next(new Error('unauthorized'));
    socket.user = user;
    next();
  });

  io.on('connection', (socket) => {
    socket.on('chat:join', async (otherId, ack) => {
      const [p, t] = socket.user.role === 'patient' ? [socket.user.id, otherId] : [otherId, socket.user.id];
      if (!(await canChat(p, t))) return ack?.({ error: 'No active booking between you.' });
      socket.join(roomIdFor(p, t));
      ack?.({ roomId: roomIdFor(p, t) });
    });

    socket.on('chat:send', async ({ toUserId, text }, ack) => {
      if (!text?.trim()) return;
      const [p, t] = socket.user.role === 'patient' ? [socket.user.id, toUserId] : [toUserId, socket.user.id];
      if (!(await canChat(p, t))) return ack?.({ error: 'Not allowed' });
      const roomId = roomIdFor(p, t);
      const msg = await Message.create({ roomId, senderId: socket.user.id, receiverId: toUserId, text: text.trim() });
      io.to(roomId).emit('chat:message', msg);
      ack?.({ ok: true });
    });
  });

  return io;
}
