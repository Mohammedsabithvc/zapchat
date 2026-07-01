require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { v4: uuidv4 } = require('uuid');
const auth = require('./middleware/auth');
const { initSchema } = require('./db');

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8
});

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/messages'));

// Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isVideo = file.mimetype.startsWith('video/');
    const isAudio = file.mimetype.startsWith('audio/');
    return {
      folder: 'zapchat',
      resource_type: isVideo || isAudio ? 'video' : 'image',
      public_id: uuidv4(),
    };
  },
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const type = req.file.mimetype.startsWith('image/') ? 'image'
    : req.file.mimetype.startsWith('video/') ? 'video'
    : req.file.mimetype.startsWith('audio/') ? 'audio' : 'file';
  res.json({ url: req.file.path, type, originalName: req.file.originalname, size: req.file.size });
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
