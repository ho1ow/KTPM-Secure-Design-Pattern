const fs = require('node:fs');
const express = require('express');
const jwt = require('jsonwebtoken');
const Minio = require('minio');

const {
  PORT = 3001,
  JWT_SECRET,
  MINIO_INTERNAL_HOST = 'minio',
  MINIO_PUBLIC_HOST = 'localhost',
  MINIO_PORT = 9000,
  MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY,
  MINIO_BUCKET = 'avatars',
  PRESIGN_EXPIRY_SECONDS = 300,
  INTERNAL_AUD = 'user-service',
} = process.env;

const INTERNAL_PUBLIC_KEY = fs.readFileSync('/keys/internal.pub');

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const users = [
  { id: '1', username: 'alice', password: 'alice123', role: 'user', avatarKey: null },
  { id: '2', username: 'bob', password: 'bob123', role: 'user', avatarKey: null },
  { id: '3', username: 'admin', password: 'admin123', role: 'admin', avatarKey: null },
];

const minioOpts = {
  port: Number(MINIO_PORT),
  useSSL: false,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
  region: 'us-east-1', 
};
const minioInternal = new Minio.Client({ ...minioOpts, endPoint: MINIO_INTERNAL_HOST });
const minioPublic = new Minio.Client({ ...minioOpts, endPoint: MINIO_PUBLIC_HOST });

const app = express();
app.use(express.json());

const publicUser = ({ password, ...u }) => u;

app.post('/users/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = users.find((u) => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });

  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '15m',
  });
  res.json({ token, expiresIn: 900 });
});

app.use((req, res, next) => {
  const token = (req.get('Authorization') || '').replace(/^Bearer /, '');
  try {
    const claims = jwt.verify(token, INTERNAL_PUBLIC_KEY, {
      algorithms: ['RS256'], issuer: 'api-gateway', audience: INTERNAL_AUD,
    });
    req.user = users.find((u) => u.id === claims.sub);
    if (!req.user) return res.status(401).json({ error: 'unknown user' });
    next();
  } catch (err) {
    res.status(401).json({ error: 'invalid internal token', reason: err.message });
  }
});

app.get('/users/me', (req, res) => res.json(publicUser(req.user)));

app.post('/users/me/avatar-url', async (req, res) => {
  const key = `${req.user.id}.jpg`; 
  try {
    const uploadUrl = await minioPublic.presignedPutObject(
      MINIO_BUCKET, key, Number(PRESIGN_EXPIRY_SECONDS),
    );
    res.json({ uploadUrl, key, expiresIn: Number(PRESIGN_EXPIRY_SECONDS) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'cannot create upload url' });
  }
});

app.post('/users/me/avatar', async (req, res) => {
  const key = `${req.user.id}.jpg`;
  try {
    const stat = await minioInternal.statObject(MINIO_BUCKET, key);
    const type = stat.metaData['content-type'] || '';
    if (stat.size > MAX_AVATAR_BYTES || !type.startsWith('image/')) {
      await minioInternal.removeObject(MINIO_BUCKET, key);
      return res.status(400).json({ error: 'invalid avatar (must be image, <= 2MB)' });
    }
    req.user.avatarKey = key;
    res.json(publicUser(req.user));
  } catch (err) {
    if (err.code === 'NotFound') return res.status(404).json({ error: 'avatar not uploaded' });
    console.error(err);
    res.status(500).json({ error: 'cannot verify avatar' });
  }
});

async function ensureBucket(retries = 20) {
  for (let i = 1; i <= retries; i++) {
    try {
      if (!(await minioInternal.bucketExists(MINIO_BUCKET))) {
        await minioInternal.makeBucket(MINIO_BUCKET);
      }
      console.log(`bucket "${MINIO_BUCKET}" ready`);
      return;
    } catch {
      console.log(`waiting for minio (${i}/${retries})...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('minio not reachable');
}

ensureBucket()
  .then(() => app.listen(PORT, () => console.log(`user-service listening on ${PORT}`)))
  .catch((err) => { console.error(err); process.exit(1); });
