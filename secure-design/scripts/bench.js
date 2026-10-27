// Đo độ trễ: gọi thẳng service vs đi qua gateway.
// Chạy trong docker network (xem bench.sh) để cả 3 đường đo cùng điều kiện mạng.
// - CONCURRENCY=1 (mặc định): đo độ trễ thuần mỗi request, không bị hàng đợi che mất.
// - Chạy ROUNDS vòng xen kẽ, đổi thứ tự mỗi vòng để loại hiệu ứng "service nóng dần".
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');

const TOTAL = Number(process.env.TOTAL || 3000);
const CONCURRENCY = Number(process.env.CONCURRENCY || 1);
const ROUNDS = Number(process.env.ROUNDS || 3);
const TOKEN = process.env.TOKEN;
const agent = new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY });

// Đường A gọi thẳng service nên cần sẵn một token nội bộ hợp lệ (ký 1 lần, dùng cả bài đo)
function internalToken() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: 'api-gateway', aud: 'order-service', sub: '1', role: 'user', iat: now, exp: now + 3600 })}`;
  return `${data}.${crypto.sign('sha256', Buffer.from(data), fs.readFileSync('/keys/internal.key')).toString('base64url')}`;
}

const targets = [
  { name: 'A. Gọi thẳng order (service verify RS256)', url: 'http://order:3002/orders',
    headers: { Authorization: `Bearer   ${internalToken()}` } },
  { name: 'B. Gateway: verify JWT + ký RS256 + routing', url: 'http://gateway:8081/orders',
    headers: { Authorization: `Bearer ${TOKEN}` } },
];

function once(url, headers) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    http.get(url, { agent, headers }, (res) => {
      res.resume();
      res.on('end', () => resolve({ ms: Number(process.hrtime.bigint() - start) / 1e6, status: res.statusCode }));
    }).on('error', () => resolve({ ms: NaN, status: 0 }));
  });
}

async function run({ url, headers }, total, lat = []) {
  let errors = 0; let sent = 0;
  const t0 = Date.now();
  const worker = async () => {
    while (sent < total) {
      sent++;
      const r = await once(url, headers);
      if (r.status === 200) lat.push(r.ms); else errors++;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { secs: (Date.now() - t0) / 1000, errors };
}

function percentiles(lat) {
  lat.sort((a, b) => a - b);
  const p = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] ?? NaN;
  return { p50: p(0.5), p95: p(0.95), p99: p(0.99) };
}

(async () => {
  console.log(`${ROUNDS} vòng x ${TOTAL} request/đường, CONCURRENCY=${CONCURRENCY}\n`);
  for (const t of targets) await run(t, 1000); // warm-up tất cả trước khi đo
  const stats = targets.map(() => ({ lat: [], secs: 0, errors: 0 }));
  for (let r = 0; r < ROUNDS; r++) {
    for (let k = 0; k < targets.length; k++) {
      const i = (k + r) % targets.length; // xoay vòng thứ tự
      const res = await run(targets[i], TOTAL, stats[i].lat);
      stats[i].secs += res.secs; stats[i].errors += res.errors;
    }
  }
  const base = percentiles(stats[0].lat).p50;
  console.table(targets.map((t, i) => {
    const p = percentiles(stats[i].lat);
    return { 'Đường đi': t.name, 'p50 (ms)': p.p50.toFixed(3), 'p95 (ms)': p.p95.toFixed(3),
      'p99 (ms)': p.p99.toFixed(3), '+p50 so với A': (p.p50 - base).toFixed(3),
      'req/s': (TOTAL * ROUNDS / stats[i].secs).toFixed(0), 'lỗi': stats[i].errors };
  }));
})();
