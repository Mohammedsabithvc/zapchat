const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { queryOne, queryAll } = require('../db');
const { generateOTP, saveOTP, verifyOTP, sendEmailOTP, sendPhoneOTP } = require('../db/otp');

const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Too many attempts. Try again in 15 minutes.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

const AVATAR_COLORS = ['#0057FF','#00A884','#D93025','#7B61FF','#FF6B00','#00899E','#C2185B','#E91E8C'];
function colorFor(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xFFFFFF;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function sanitize(u) {
  if (!u) return null;
  const { password_hash, ...safe } = u;
  return {
    ...safe,
    _id: safe.id,
    displayName: safe.display_name,
    avatarColor: safe.avatar_color,
    avatarUrl: safe.avatar_url,
    lastSeen: safe.last_seen,
    createdAt: safe.created_at,
  };
}

function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
function isPhone(s) { return /^\+?[\d\s\-()]{7,15}$/.test(s.replace(/\s/g, '')); }
function normalizePhone(s) { return '+' + s.replace(/[^\d]/g, ''); }

// POST /api/auth/send-otp
router.post('/send-otp', otpLimiter, async (req, res) => {
  try {
    const { contact } = req.body;
    if (!contact) return res.status(400).json({ error: 'Email or phone number required' });

    const emailContact = isEmail(contact);
    const phoneContact = isPhone(contact);
    if (!emailContact && !phoneContact) {
      return res.status(400).json({ error: 'Please enter a valid email or phone number' });
    }

    const normalized = emailContact ? contact.toLowerCase().trim() : normalizePhone(contact);
    const type = emailContact ? 'email' : 'phone';
    const otp = generateOTP();

    await saveOTP(normalized, otp, type);

    if (emailContact) {
      await sendEmailOTP(normalized, otp);
    } else {
      await sendPhoneOTP(normalized, otp);
    }

    res.json({ success: true, type, message: `Code sent to ${contact}` });
  } catch (err) {
    console.error('send-otp error:', err);
    res.status(500).json({ error: 'Failed to send code. Please try again.' });
  }
});

// POST /api/auth/verify-otp  (just verify, don't create account yet)
router.post('/verify-otp', authLimiter, async (req, res) => {
  try {
    const { contact, otp } = req.body;
    if (!contact || !otp) return res.status(400).json({ error: 'Contact and code required' });

    const emailContact = isEmail(contact);
    const normalized = emailContact ? contact.toLowerCase().trim() : normalizePhone(contact);

    const result = await verifyOTP(normalized, otp);
    if (!result.valid) return res.status(400).json({ error: result.reason });

    // Check if user already exists with this contact
    const field = emailContact ? 'email' : 'phone';
    const existing = await queryOne(`SELECT * FROM users WHERE ${field} = $1`, [normalized]);

    if (existing) {
      // Returning user — log them in directly
      const token = signToken({ id: existing.id, username: existing.username });
      return res.json({ success: true, token, user: sanitize(existing), isNew: false });
    }

    // New user — tell frontend to continue registration
    res.json({ success: true, isNew: true, contact: normalized, type: emailContact ? 'email' : 'phone' });
  } catch (err) {
    console.error('verify-otp error:', err);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// POST /api/auth/register  (final step - create account)
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { contact, contactType, displayName, username, password } = req.body;

    if (!contact || !displayName || !username || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username can only contain letters, numbers and underscores' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    // Check username taken
    const taken = await queryOne('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
    if (taken) return res.status(409).json({ error: 'Username already taken. Please choose another.' });

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    const avatarColor = colorFor(username);
    const avatar = displayName.trim().slice(0, 2).toUpperCase();

    const emailField = contactType === 'email' ? contact : null;
    const phoneField = contactType === 'phone' ? contact : null;

    const user = await queryOne(
      `INSERT INTO users (display_name, username, email, phone, password_hash, avatar, avatar_color)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [displayName.trim(), username.toLowerCase(), emailField, phoneField, passwordHash, avatar, avatarColor]
    );

    const token = signToken({ id: user.id, username: user.username });
    res.json({ success: true, token, user: sanitize(user) });
  } catch (err) {
    console.error('register error:', err);
    if (err.code === '23505') return res.status(409).json({ error: 'An account with this email or phone already exists.' });
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: 'Please enter your username/email and password' });

    const isEmailLogin = isEmail(identifier);
    const field = isEmailLogin ? 'email' : 'username';
    const value = isEmailLogin ? identifier.toLowerCase().trim() : identifier.toLowerCase().trim();

    const user = await queryOne(`SELECT * FROM users WHERE ${field} = $1`, [value]);
    if (!user) return res.status(401).json({ error: 'No account found with those details' });
    if (!user.password_hash) return res.status(401).json({ error: 'This account uses phone login. Please use OTP to sign in.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });

    await queryOne('UPDATE users SET status = $1, last_seen = NOW() WHERE id = $2 RETURNING id', ['online', user.id]);

    const token = signToken({ id: user.id, username: user.username });
    res.json({ success: true, token, user: sanitize(user) });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', otpLimiter, async (req, res) => {
  try {
    const { contact } = req.body;
    if (!contact) return res.status(400).json({ error: 'Email or phone required' });

    const emailContact = isEmail(contact);
    const normalized = emailContact ? contact.toLowerCase().trim() : normalizePhone(contact);
    const field = emailContact ? 'email' : 'phone';

    const user = await queryOne(`SELECT id FROM users WHERE ${field} = $1`, [normalized]);
    // Always return success (don't reveal if account exists)
    if (!user) return res.json({ success: true, message: 'If an account exists, a code has been sent.' });

    const otp = generateOTP();
    const type = emailContact ? 'email' : 'phone';
    await saveOTP('reset_' + normalized, otp, type);

    if (emailContact) await sendEmailOTP(normalized, otp);
    else await sendPhoneOTP(normalized, otp);

    res.json({ success: true, message: 'Code sent', type });
  } catch (err) {
    console.error('forgot-password error:', err);
    res.status(500).json({ error: 'Failed. Please try again.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { contact, otp, newPassword } = req.body;
    if (!contact || !otp || !newPassword) return res.status(400).json({ error: 'All fields required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const emailContact = isEmail(contact);
    const normalized = emailContact ? contact.toLowerCase().trim() : normalizePhone(contact);

    const result = await verifyOTP('reset_' + normalized, otp);
    if (!result.valid) return res.status(400).json({ error: result.reason });

    const hash = await bcrypt.hash(newPassword, 12);
    const field = emailContact ? 'email' : 'phone';
    await queryOne(`UPDATE users SET password_hash = $1 WHERE ${field} = $2 RETURNING id`, [hash, normalized]);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ error: 'Failed. Please try again.' });
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(sanitize(user));
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
