const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, queryOne } = require('../db');

const onlineUsers = new Map();

module.exports = function initSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token'));
    try { socket.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
    catch { next(new Error('Invalid token')); }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    onlineUsers.set(userId, socket.id);
    await query('UPDATE users SET status = $1, last_seen = NOW() WHERE id = $2', ['online', userId]);
    io.emit('user:status', { userId, status: 'online' });

    socket.on('join:conversation', cid => socket.join(cid));

    socket.on('message:send', async (data, ack) => {
      try {
        const { conversationId, content, type, mediaUrl, mediaName, duration, replyTo } = data;

        const conv = await queryOne(
          'SELECT * FROM conversations WHERE id = $1 AND (participant_1 = $2 OR participant_2 = $2)',
          [conversationId, userId]
        );
        if (!conv) return ack && ack({ success: false, error: 'Forbidden' });

        const msg = await queryOne(
          `INSERT INTO messages (conversation_id, sender_id, type, content, media_url, media_name, duration, reply_to)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [conversationId, userId, type || 'text', content || '', mediaUrl || null, mediaName || null, duration || null, replyTo?._id || null]
        );

        // Normalize to camelCase for frontend
        const fullMsg = {
          ...msg,
          _id: msg.id,
          conversationId: msg.conversation_id,
          senderId: msg.sender_id,
          mediaUrl: msg.media_url,
          mediaName: msg.media_name,
          createdAt: msg.created_at,
          readBy: [userId],
          reactions: {},
          replyTo: replyTo || null
        };

        await query('INSERT INTO message_reads (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [msg.id, userId]);
        await query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);

        io.to(conversationId).emit('message:new', fullMsg);

        const otherId = conv.participant_1 === userId ? conv.participant_2 : conv.participant_1;
        if (onlineUsers.has(otherId)) {
          io.to(onlineUsers.get(otherId)).emit('conversation:updated', { conversationId });
        }

        if (ack) ack({ success: true, message: fullMsg });
      } catch (err) {
        console.error('message:send error:', err);
        if (ack) ack({ success: false, error: 'Send failed' });
      }
    });

    socket.on('message:read', async ({ conversationId }) => {
      const msgs = await query(
        `SELECT id FROM messages WHERE conversation_id = $1 AND sender_id != $2`,
        [conversationId, userId]
      );
      await Promise.all(msgs.rows.map(m =>
        query('INSERT INTO message_reads (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [m.id, userId])
      ));
      socket.to(conversationId).emit('message:read', { conversationId, readBy: userId });
    });

    socket.on('message:delete', async ({ messageId, conversationId, forEveryone }) => {
      const msg = await queryOne('SELECT * FROM messages WHERE id = $1', [messageId]);
      if (!msg) return;
      if (forEveryone && msg.sender_id === userId) {
        await query('UPDATE messages SET deleted = TRUE, content = $1, media_url = NULL WHERE id = $2', ['This message was deleted', messageId]);
        io.to(conversationId).emit('message:deleted', { messageId, forEveryone: true });
      } else {
        await query('INSERT INTO message_deletes (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [messageId, userId]);
        socket.emit('message:deleted', { messageId, forEveryone: false });
      }
    });

    socket.on('message:edit', async ({ messageId, conversationId, content }) => {
      const msg = await queryOne('SELECT * FROM messages WHERE id = $1', [messageId]);
      if (!msg || msg.sender_id !== userId || msg.type !== 'text') return;
      const updated = await queryOne('UPDATE messages SET content = $1, edited = TRUE WHERE id = $2 RETURNING *', [content, messageId]);
      io.to(conversationId).emit('message:edited', { ...updated, read_by: [], reactions: {} });
    });

    socket.on('message:react', async ({ messageId, conversationId, emoji }) => {
      const existing = await queryOne('SELECT * FROM message_reactions WHERE message_id = $1 AND user_id = $2', [messageId, userId]);
      if (existing) {
        if (existing.emoji === emoji) {
          await query('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2', [messageId, userId]);
        } else {
          await query('UPDATE message_reactions SET emoji = $1 WHERE message_id = $2 AND user_id = $3', [emoji, messageId, userId]);
        }
      } else {
        await query('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)', [messageId, userId, emoji]);
      }
      const reactions = await query(
        'SELECT emoji, array_agg(user_id) as user_ids FROM message_reactions WHERE message_id = $1 GROUP BY emoji',
        [messageId]
      );
      const reactMap = {};
      reactions.rows.forEach(r => reactMap[r.emoji] = r.user_ids);
      io.to(conversationId).emit('message:reacted', { messageId, reactions: reactMap });
    });

    socket.on('typing:start', ({ conversationId }) => socket.to(conversationId).emit('typing:start', { userId, conversationId }));
    socket.on('typing:stop', ({ conversationId }) => socket.to(conversationId).emit('typing:stop', { userId, conversationId }));

    socket.on('call:offer', ({ targetUserId, offer, type }) => {
      const ts = onlineUsers.get(targetUserId);
      if (ts) io.to(ts).emit('call:incoming', { fromUserId: userId, fromSocketId: socket.id, offer, type });
    });
    socket.on('call:answer', ({ targetSocketId, answer }) => io.to(targetSocketId).emit('call:answer', { answer, fromSocketId: socket.id }));
    socket.on('call:ice', ({ targetSocketId, candidate }) => io.to(targetSocketId).emit('call:ice', { candidate }));
    socket.on('call:end', ({ targetSocketId }) => io.to(targetSocketId).emit('call:ended'));
    socket.on('call:reject', ({ targetSocketId }) => io.to(targetSocketId).emit('call:rejected'));

    socket.on('disconnect', async () => {
      onlineUsers.delete(userId);
      await query('UPDATE users SET status = $1, last_seen = NOW() WHERE id = $2', ['offline', userId]);
      io.emit('user:status', { userId, status: 'offline', lastSeen: new Date().toISOString() });
    });
  });
};
