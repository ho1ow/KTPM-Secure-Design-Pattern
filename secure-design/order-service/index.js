// Order service: nghiệp vụ đơn hàng. JWT của client đã được verify ở gateway (offloading);
// service chỉ tin TOKEN NỘI BỘ do gateway ký, đúng aud của mình. Không tin header X-User-Id.
const fs = require('node:fs');
const express = require('express');
const jwt = require('jsonwebtoken');

const INTERNAL_PUBLIC_KEY = fs.readFileSync('/keys/internal.pub');
const INTERNAL_AUD = process.env.INTERNAL_AUD || 'order-service';

const app = express();
app.use(express.json());

let nextId = 4;
const orders = [
  { id: 1, userId: '1', item: 'Bàn phím cơ', total: 1200000 },
  { id: 2, userId: '1', item: 'Chuột không dây', total: 350000 },
  { id: 3, userId: '2', item: 'Màn hình 27"', total: 5400000 },
];

app.use((req, res, next) => {
  const token = (req.get('Authorization') || '').replace(/^Bearer /, '');
  try {
    const claims = jwt.verify(token, INTERNAL_PUBLIC_KEY, {
      algorithms: ['RS256'], issuer: 'api-gateway', audience: INTERNAL_AUD,
    });
    req.userId = claims.sub;
    req.role = claims.role || 'user';
    next();
  } catch (err) {
    res.status(401).json({ error: 'invalid internal token', reason: err.message });
  }
});

app.get('/orders', (req, res) => {
  res.json(orders.filter((o) => o.userId === req.userId));
});

app.get('/orders/:id', (req, res) => {
  const order = orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'not found' });
  if (order.userId !== req.userId && req.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  res.json(order);
});

app.post('/orders', (req, res) => {
  const { item, total } = req.body || {};
  if (!item || typeof total !== 'number') {
    return res.status(400).json({ error: 'item and numeric total required' });
  }
  const order = { id: nextId++, userId: req.userId, item, total };
  orders.push(order);
  res.status(201).json(order);
});

const port = process.env.PORT || 3002;
app.listen(port, () => console.log(`order-service listening on ${port}`));
