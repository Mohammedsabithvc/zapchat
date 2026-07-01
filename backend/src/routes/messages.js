const router = require('express').Router();
const auth = require('../middleware/auth');
const { queryOne, queryAll, query } = require('../db');

function sanitize(u) {
  if (!u) return null;
  const { password_hash, ...s } = u;
  // Map PostgreSQL snake_case to camelCase so frontend works correctly
  return {
    ...s,
    _id: s.id,
    displayName: s.display_name,
    avatarColor: s.avatar_color,
    avatarUrl: s.avatar_url,
    lastSeen: s.last_seen,
    createdAt: s.created_at,
  };
}

// GET /api/users/search
router.get('/users/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) return res.json([]);
    const users = await queryAll(
      `SELECT * FROM users WHERE id != $1 AND (
        username ILIKE $2 OR display_name ILIKE $2 OR phone ILIKE $2
      ) LIMIT 20`,
      [req.user.id, `%${q}%`]
    );
    res.json(users.map(sanitize));
  } catch (err) { res.status(500).json({ error: 'Search failed' }); }
});

// GET /api/users/:id
router.get('/users/:id', auth, async (req, res) => {
  try {
    const u = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!u) return res.status(404).json({ error: 'Not found' });
    res.json(sanitize(u));
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// PUT /api/users/me
router.put('/users/me', auth, async (req, res) => {
  try {
    const { display_name, about, avatar_url } = req.body;
    const user = await queryOne(
      `UPDATE users SET
        display_name = COALESCE($1, display_name),
        about = COALESCE($2, about),
        avatar_url = COALESCE($3, avatar_url)
       WHERE id = $4 RETURNING *`,
      [display_name || null, about !== undefined ? about : null, avatar_url || null, req.user.id]
    );
    res.json(sanitize(user));
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// DELETE /api/users/me
router.delete('/users/me', auth, async (req, res) => {
  try {
    await query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to delete account' }); }
});

// GET /api/conversations
router.get('/conversations/list', auth, async (req, res) => {
  try {
    const convos = await queryAll(
      `SELECT c.*,
        CASE WHEN c.participant_1 = $1 THEN c.participant_2 ELSE c.participant_1 END as other_user_id
       FROM conversations c
       WHERE c.participant_1 = $1 OR c.participant_2 = $1
       ORDER BY c.updated_at DESC`,
      [req.user.id]
    );

    const enriched = await Promise.all(convos.map(async c => {
      const other = await queryOne('SELECT * FROM users WHERE id = $1', [c.other_user_id]);
      const lastMsg = await queryOne(
        `SELECT m.* FROM messages m
         LEFT JOIN message_deletes md ON md.message_id = m.id AND md.user_id = $2
         WHERE m.conversation_id = $1 AND md.message_id IS NULL
         ORDER BY m.created_at DESC LIMIT 1`,
        [c.id, req.user.id]
      );
      const unread = await queryOne(
        `SELECT COUNT(*) as count FROM messages m
         LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.user_id = $2
         LEFT JOIN message_deletes md ON md.message_id = m.id AND md.user_id = $2
         WHERE m.conversation_id = $1 AND m.sender_id != $2
         AND mr.message_id IS NULL AND md.message_id IS NULL AND m.deleted = FALSE`,
        [c.id, req.user.id]
      );
      return {
        ...c,
        otherUser: other ? sanitize(other) : null,
        lastMessage: lastMsg ? { ...lastMsg, createdAt: lastMsg.created_at, senderId: lastMsg.sender_id, mediaUrl: lastMsg.media_url, mediaName: lastMsg.media_name } : null,
        unreadCount: parseInt(unread?.count || 0)
      };
    }));

    res.json(enriched);
  } catch (err) {
    console.error('conversations error:', err);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

// POST /api/conversations
router.post('/conversations', auth, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const p1 = req.user.id < targetUserId ? req.user.id : targetUserId;
    const p2 = req.user.id < targetUserId ? targetUserId : req.user.id;

    let c = await queryOne(
      'SELECT * FROM conversations WHERE participant_1 = $1 AND participant_2 = $2',
      [p1, p2]
    );
    if (!c) {
      c = await queryOne(
        'INSERT INTO conversations (participant_1, participant_2) VALUES ($1, $2) RETURNING *',
        [p1, p2]
      );
    }
    const other = await queryOne('SELECT * FROM users WHERE id = $1', [targetUserId]);
    res.json({ ...c, _id: c.id, otherUser: other ? sanitize(other) : null });
  } catch (err) {
    console.error('create conversation error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/conversations/:id/messages
router.get('/conversations/:id/messages', auth, async (req, res) => {
  try {
    const c = await queryOne(
      'SELECT * FROM conversations WHERE id = $1 AND (participant_1 = $2 OR participant_2 = $2)',
      [req.params.id, req.user.id]
    );
    if (!c) return res.status(403).json({ error: 'Forbidden' });

    const msgs = await queryAll(
      `SELECT m.*,
        array_agg(DISTINCT mr.user_id) FILTER (WHERE mr.user_id IS NOT NULL) as read_by,
        json_object_agg(mreact.emoji, mreact.user_ids) FILTER (WHERE mreact.emoji IS NOT NULL) as reactions
       FROM messages m
       LEFT JOIN message_reads mr ON mr.message_id = m.id
       LEFT JOIN message_deletes md ON md.message_id = m.id AND md.user_id = $2
       LEFT JOIN (
         SELECT message_id, emoji, array_agg(user_id) as user_ids
         FROM message_reactions GROUP BY message_id, emoji
       ) mreact ON mreact.message_id = m.id
       WHERE m.conversation_id = $1 AND md.message_id IS NULL
       GROUP BY m.id
       ORDER BY m.created_at ASC`,
      [req.params.id, req.user.id]
    );

    // Mark all as read
    const unreadIds = msgs
      .filter(m => m.sender_id !== req.user.id && !(m.read_by || []).includes(req.user.id))
      .map(m => m.id);

    if (unreadIds.length) {
      await Promise.all(unreadIds.map(id =>
        query('INSERT INTO message_reads (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, req.user.id])
      ));
    }

    // Normalize to camelCase for frontend
    const normalized = msgs.map(m => ({
      ...m,
      _id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      mediaUrl: m.media_url,
      mediaName: m.media_name,
      createdAt: m.created_at,
      readBy: m.read_by || [],
      reactions: m.reactions || {},
      replyTo: m.reply_to ? { _id: m.reply_to } : null,
    }));
    res.json(normalized);
  } catch (err) {
    console.error('messages error:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// DELETE /api/conversations/:id (delete all messages for this user only)
router.delete('/conversations/:id', auth, async (req, res) => {
  try {
    const conv = await queryOne(
      'SELECT * FROM conversations WHERE id = $1 AND (participant_1 = $2 OR participant_2 = $2)',
      [req.params.id, req.user.id]
    );
    if (!conv) return res.status(404).json({ error: 'Not found' });
    // Delete all messages for this user only (insert into message_deletes)
    const msgs = await queryAll('SELECT id FROM messages WHERE conversation_id = $1', [req.params.id]);
    for (const m of msgs) {
      await query('INSERT INTO message_deletes (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [m.id, req.user.id]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete conversation' }); }
});

// DELETE /api/messages/:id
router.delete('/messages/:id', auth, async (req, res) => {
  try {
    const { forEveryone } = req.body;
    const msg = await queryOne('SELECT * FROM messages WHERE id = $1', [req.params.id]);
    if (!msg) return res.status(404).json({ error: 'Not found' });

    if (forEveryone && msg.sender_id === req.user.id) {
      await query('UPDATE messages SET deleted = TRUE, content = $1, media_url = NULL WHERE id = $2', ['This message was deleted', req.params.id]);
    } else {
      await query('INSERT INTO message_deletes (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, req.user.id]);
    }
    res.json({ success: true, forEveryone: !!forEveryone });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// PUT /api/messages/:id
router.put('/messages/:id', auth, async (req, res) => {
  try {
    const { content } = req.body;
    const msg = await queryOne('SELECT * FROM messages WHERE id = $1', [req.params.id]);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'Cannot edit others messages' });
    const updated = await queryOne(
      'UPDATE messages SET content = $1, edited = TRUE WHERE id = $2 RETURNING *',
      [content, req.params.id]
    );
    res.json(updated);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// POST /api/messages/:id/react
router.post('/messages/:id/react', auth, async (req, res) => {
  try {
    const { emoji } = req.body;
    const existing = await queryOne(
      'SELECT * FROM message_reactions WHERE message_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing) {
      if (existing.emoji === emoji) {
        await query('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
      } else {
        await query('UPDATE message_reactions SET emoji = $1 WHERE message_id = $2 AND user_id = $3', [emoji, req.params.id, req.user.id]);
      }
    } else {
      await query('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)', [req.params.id, req.user.id, emoji]);
    }
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;
