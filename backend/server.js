require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { pool, initDB } = require('./db');
const { generateOTP, sendOTP } = require('./otp');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8
});

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const otpLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: 'Too many OTP requests' } });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

function signToken(payload) { return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' }); }
function verifyToken(token) { return jwt.verify(token, process.env.JWT_SECRET); }
function authMiddleware(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = verifyToken(token); next(); } catch { res.status(401).json({ error: 'Invalid token' }); }
}

function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
function isPhone(s) { return /^\+?[\d\s\-()]{7,20}$/.test(s); }
function normalizePhone(s) { return s.replace(/[\s\-()]/g, ''); }

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

app.post('/api/auth/send-otp', otpLimiter, async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: 'Phone or email required' });
    const id = isEmail(identifier) ? identifier.toLowerCase().trim() : normalizePhone(identifier);
    const type = isEmail(id) ? 'email' : 'phone';
    if (!isEmail(id) && !isPhone(id)) return res.status(400).json({ error: 'Invalid phone or email' });

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(`DELETE FROM otps WHERE identifier=$1`, [id]);
    await pool.query(`INSERT INTO otps(identifier,code,expires_at) VALUES($1,$2,$3)`, [id, code, expiresAt]);

    await sendOTP(id, code, type);
    res.json({ success: true, type, message: `Code sent to ${id}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

app.post('/api/auth/verify-otp', authLimiter, async (req, res) => {
  try {
    const { identifier, code, displayName } = req.body;
    if (!identifier || !code) return res.status(400).json({ error: 'Identifier and code required' });
    const id = isEmail(identifier) ? identifier.toLowerCase().trim() : normalizePhone(identifier);

    const { rows } = await pool.query(
      `SELECT * FROM otps WHERE identifier=$1 AND code=$2 AND used=false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
      [id, code]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid or expired code' });

    await pool.query(`UPDATE otps SET used=true WHERE id=$1`, [rows[0].id]);

    const type = isEmail(id) ? 'email' : 'phone';
    let user;
    const existing = await pool.query(
      `SELECT * FROM users WHERE ${type}=$1`, [id]
    );

    if (existing.rows.length) {
      user = existing.rows[0];
      await pool.query(`UPDATE users SET status='online', last_seen=NOW() WHERE id=$1`, [user.id]);
    } else {
      if (!displayName) return res.json({ needsProfile: true, identifier: id });
      const name = displayName.trim();
      const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const colors = ['#0057FF','#00A86B','#D93025','#7B61FF','#FF6B00','#00899E'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const { rows: newRows } = await pool.query(
        `INSERT INTO users(${type},display_name,avatar_initials,avatar_color,status)
         VALUES($1,$2,$3,$4,'online') RETURNING *`,
        [id, name, initials, color]
      );
      user = newRows[0];
    }

    const token = signToken({ id: user.id });
    res.json({ token, user: sanitize(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

app.post('/api/auth/complete-profile', authLimiter, async (req, res) => {
  try {
    const { identifier, displayName } = req.body;
    if (!identifier || !displayName) return res.status(400).json({ error: 'Missing fields' });
    const id = isEmail(identifier) ? identifier.toLowerCase().trim() : normalizePhone(identifier);
    const type = isEmail(id) ? 'email' : 'phone';
    const name = displayName.trim();
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const colors = ['#0057FF','#00A86B','#D93025','#7B61FF','#FF6B00','#00899E'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const { rows } = await pool.query(
      `INSERT INTO users(${type},display_name,avatar_initials,avatar_color,status)
       VALUES($1,$2,$3,$4,'online') RETURNING *`,
      [id, name, initials, color]
    );
    const user = rows[0];
    const token = signToken({ id: user.id });
    res.json({ token, user: sanitize(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Profile creation failed' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(sanitize(rows[0]));
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.patch('/api/auth/profile', authMiddleware, async (req, res) => {
  try {
    const { displayName, bio } = req.body;
    const name = displayName?.trim();
    const initials = name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const { rows } = await pool.query(
      `UPDATE users SET display_name=COALESCE($1,display_name), bio=COALESCE($2,bio),
       avatar_initials=COALESCE($3,avatar_initials) WHERE id=$4 RETURNING *`,
      [name, bio, initials, req.user.id]
    );
    res.json(sanitize(rows[0]));
  } catch { res.status(500).json({ error: 'Update failed' }); }
});

// ─── USERS ────────────────────────────────────────────────────────────────────

app.get('/api/users/search', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE id!=$1 AND (
        display_name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2 OR username ILIKE $2
      ) LIMIT 20`,
      [req.user.id, `%${q}%`]
    );
    res.json(rows.map(sanitize));
  } catch { res.status(500).json({ error: 'Search failed' }); }
});

app.get('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(sanitize(rows[0]));
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ─── CONVERSATIONS ────────────────────────────────────────────────────────────

app.get('/api/conversations', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;
    const { rows } = await pool.query(`
      SELECT c.*,
        CASE WHEN c.participant_a=$1 THEN c.participant_b ELSE c.participant_a END as other_id,
        (SELECT row_to_json(m) FROM (
          SELECT * FROM messages WHERE conversation_id=c.id AND is_deleted=false ORDER BY created_at DESC LIMIT 1
        ) m) as last_message,
        (SELECT COUNT(*) FROM messages WHERE conversation_id=c.id AND sender_id!=$1 AND read_at IS NULL AND is_deleted=false) as unread_count
      FROM conversations c
      WHERE c.participant_a=$1 OR c.participant_b=$1
      ORDER BY c.updated_at DESC
    `, [uid]);

    const enriched = await Promise.all(rows.map(async c => {
      const { rows: uRows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [c.other_id]);
      return { ...c, other_user: uRows[0] ? sanitize(uRows[0]) : null };
    }));
    res.json(enriched);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/conversations', authMiddleware, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const uid = req.user.id;
    const a = uid < targetUserId ? uid : targetUserId;
    const b = uid < targetUserId ? targetUserId : uid;

    let { rows } = await pool.query(`SELECT * FROM conversations WHERE participant_a=$1 AND participant_b=$2`, [a, b]);
    if (!rows.length) {
      const ins = await pool.query(
        `INSERT INTO conversations(participant_a,participant_b) VALUES($1,$2) RETURNING *`, [a, b]
      );
      rows = ins.rows;
    }
    const { rows: uRows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [targetUserId]);
    res.json({ ...rows[0], other_user: uRows[0] ? sanitize(uRows[0]) : null });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

app.get('/api/messages/:convId', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;
    const { convId } = req.params;
    const { before, limit = 50 } = req.query;

    const access = await pool.query(
      `SELECT * FROM conversations WHERE id=$1 AND (participant_a=$2 OR participant_b=$2)`, [convId, uid]
    );
    if (!access.rows.length) return res.status(403).json({ error: 'Forbidden' });

    let q = `SELECT m.*, 
      (SELECT json_agg(json_build_object('emoji',r.emoji,'user_id',r.user_id)) FROM reactions r WHERE r.message_id=m.id) as reactions,
      (SELECT row_to_json(rm) FROM (SELECT id,content,type,sender_id FROM messages rm WHERE rm.id=m.reply_to_id) rm) as reply_to
      FROM messages m WHERE m.conversation_id=$1`;
    const params = [convId];
    if (before) { q += ` AND m.created_at < $${params.length + 1}`; params.push(before); }
    q += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query(q, params);
    await pool.query(
      `UPDATE messages SET read_at=NOW() WHERE conversation_id=$1 AND sender_id!=$2 AND read_at IS NULL`,
      [convId, uid]
    );
    res.json(rows.reverse());
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/messages/:msgId', authMiddleware, async (req, res) => {
  try {
    const { deleteFor } = req.body;
    const { rows } = await pool.query(`SELECT * FROM messages WHERE id=$1 AND sender_id=$2`, [req.params.msgId, req.user.id]);
    if (!rows.length) return res.status(403).json({ error: 'Not allowed' });
    if (deleteFor === 'everyone') {
      await pool.query(`UPDATE messages SET is_deleted=true, content='', media_url=NULL WHERE id=$1`, [req.params.msgId]);
    } else {
      await pool.query(`UPDATE messages SET is_deleted=true WHERE id=$1`, [req.params.msgId]);
    }
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.patch('/api/messages/:msgId', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    const { rows } = await pool.query(
      `UPDATE messages SET content=$1, is_edited=true, updated_at=NOW() WHERE id=$2 AND sender_id=$3 AND type='text' RETURNING *`,
      [content, req.params.msgId, req.user.id]
    );
    if (!rows.length) return res.status(403).json({ error: 'Not allowed' });
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/messages/:msgId/react', authMiddleware, async (req, res) => {
  try {
    const { emoji } = req.body;
    if (emoji) {
      await pool.query(
        `INSERT INTO reactions(message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT(message_id,user_id) DO UPDATE SET emoji=$3`,
        [req.params.msgId, req.user.id, emoji]
      );
    } else {
      await pool.query(`DELETE FROM reactions WHERE message_id=$1 AND user_id=$2`, [req.params.msgId, req.user.id]);
    }
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ─── UPLOAD ───────────────────────────────────────────────────────────────────

app.post('/api/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const url = `/uploads/${req.file.filename}`;
    const type = req.file.mimetype.startsWith('image/') ? 'image'
      : req.file.mimetype.startsWith('video/') ? 'video'
      : req.file.mimetype.startsWith('audio/') ? 'audio' : 'file';
    res.json({ url, type, originalName: req.file.originalname, size: req.file.size });
  } catch { res.status(500).json({ error: 'Upload failed' }); }
});

function sanitize(u) {
  if (!u) return null;
  const { ...safe } = u;
  return safe;
}

// ─── SOCKET.IO ────────────────────────────────────────────────────────────────

const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));
  try { socket.user = verifyToken(token); next(); } catch { next(new Error('Invalid token')); }
});

io.on('connection', async (socket) => {
  const uid = socket.user.id;
  onlineUsers.set(uid, socket.id);
  await pool.query(`UPDATE users SET status='online', last_seen=NOW() WHERE id=$1`, [uid]);
  io.emit('user:status', { userId: uid, status: 'online' });

  socket.on('join:conversation', (cid) => socket.join(cid));

  socket.on('message:send', async (data, ack) => {
    try {
      const { conversationId, content, type, mediaUrl, mediaName, mediaSize, duration, replyToId } = data;
      const access = await pool.query(
        `SELECT * FROM conversations WHERE id=$1 AND (participant_a=$2 OR participant_b=$2)`, [conversationId, uid]
      );
      if (!access.rows.length) return;

      const { rows } = await pool.query(
        `INSERT INTO messages(conversation_id,sender_id,content,type,media_url,media_name,media_size,duration,reply_to_id,delivered)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING *`,
        [conversationId, uid, content || '', type || 'text', mediaUrl || null, mediaName || null, mediaSize || null, duration || null, replyToId || null]
      );
      const msg = rows[0];

      if (replyToId) {
        const { rows: rRows } = await pool.query(`SELECT id,content,type,sender_id FROM messages WHERE id=$1`, [replyToId]);
        msg.reply_to = rRows[0] || null;
      }

      await pool.query(`UPDATE conversations SET updated_at=NOW() WHERE id=$1`, [conversationId]);
      io.to(conversationId).emit('message:new', msg);

      const conv = access.rows[0];
      const otherId = conv.participant_a === uid ? conv.participant_b : conv.participant_a;
      if (onlineUsers.has(otherId)) io.to(onlineUsers.get(otherId)).emit('conversation:updated');

      if (ack) ack({ success: true, message: msg });
    } catch (err) { console.error(err); if (ack) ack({ success: false }); }
  });

  socket.on('message:delete', async ({ messageId, conversationId, deleteFor }) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM messages WHERE id=$1 AND sender_id=$2`, [messageId, uid]);
      if (!rows.length) return;
      await pool.query(`UPDATE messages SET is_deleted=true, content='', media_url=NULL WHERE id=$1`, [messageId]);
      io.to(conversationId).emit('message:deleted', { messageId, conversationId });
    } catch {}
  });

  socket.on('message:edit', async ({ messageId, conversationId, content }) => {
    try {
      const { rows } = await pool.query(
        `UPDATE messages SET content=$1, is_edited=true, updated_at=NOW() WHERE id=$2 AND sender_id=$3 RETURNING *`,
        [content, messageId, uid]
      );
      if (rows.length) io.to(conversationId).emit('message:edited', rows[0]);
    } catch {}
  });

  socket.on('message:react', async ({ messageId, conversationId, emoji }) => {
    try {
      if (emoji) {
        await pool.query(
          `INSERT INTO reactions(message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT(message_id,user_id) DO UPDATE SET emoji=$3`,
          [messageId, uid, emoji]
        );
      } else {
        await pool.query(`DELETE FROM reactions WHERE message_id=$1 AND user_id=$2`, [messageId, uid]);
      }
      io.to(conversationId).emit('message:reaction', { messageId, userId: uid, emoji });
    } catch {}
  });

  socket.on('message:read', async ({ conversationId }) => {
    await pool.query(
      `UPDATE messages SET read_at=NOW() WHERE conversation_id=$1 AND sender_id!=$2 AND read_at IS NULL`,
      [conversationId, uid]
    );
    socket.to(conversationId).emit('message:read', { conversationId, readBy: uid });
  });

  socket.on('typing:start', ({ conversationId }) => socket.to(conversationId).emit('typing:start', { userId: uid }));
  socket.on('typing:stop', ({ conversationId }) => socket.to(conversationId).emit('typing:stop', { userId: uid }));

  socket.on('call:offer', ({ targetUserId, offer, type }) => {
    const ts = onlineUsers.get(targetUserId);
    if (ts) io.to(ts).emit('call:incoming', { fromUserId: uid, fromSocketId: socket.id, offer, type });
  });
  socket.on('call:answer', ({ targetSocketId, answer }) => io.to(targetSocketId).emit('call:answer', { answer, fromSocketId: socket.id }));
  socket.on('call:ice', ({ targetSocketId, candidate }) => io.to(targetSocketId).emit('call:ice', { candidate }));
  socket.on('call:end', ({ targetSocketId }) => io.to(targetSocketId).emit('call:ended'));
  socket.on('call:reject', ({ targetSocketId }) => io.to(targetSocketId).emit('call:rejected'));

  socket.on('disconnect', async () => {
    onlineUsers.delete(uid);
    const lastSeen = new Date().toISOString();
    await pool.query(`UPDATE users SET status='offline', last_seen=NOW() WHERE id=$1`, [uid]);
    io.emit('user:status', { userId: uid, status: 'offline', lastSeen });
  });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;

initDB().then(() => {
  server.listen(PORT, () => console.log(`🚀 ZapChat v2 running on http://localhost:${PORT}`));
}).catch(err => {
  console.error('❌ DB init failed:', err.message);
  console.error('Make sure DATABASE_URL is set in backend/.env');
  process.exit(1);
});
