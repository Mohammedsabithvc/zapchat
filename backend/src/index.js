require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const auth = require('./middleware/auth');
const { initSchema } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8
});

const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/messages'));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => { const ext = path.extname(file.originalname)||(file.mimetype==="image/png"?".png":file.mimetype==="image/jpeg"?".jpg":file.mimetype==="video/webm"?".webm":file.mimetype==="video/mp4"?".mp4":file.mimetype==="audio/webm"?".webm":""); cb(null, uuidv4()+ext); }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const type = req.file.mimetype.startsWith('image/') ? 'image'
    : req.file.mimetype.startsWith('video/') ? 'video'
    : req.file.mimetype.startsWith('audio/') ? 'audio' : 'file';
  res.json({ url: `/uploads/${req.file.filename}`, type, originalName: req.file.originalname, size: req.file.size });
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

require('./socket')(io);

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await initSchema();
    server.listen(PORT, () => {
      console.log(`\n🚀 ZapChat backend running on http://localhost:${PORT}`);
      console.log(`📦 Database: Neon PostgreSQL`);
      console.log(`📧 Email: Resend`);
      console.log(`📱 SMS: Twilio\n`);
    });
  } catch (err) {
    console.error('Failed to start:', err.message);
    process.exit(1);
  }
}

start();
