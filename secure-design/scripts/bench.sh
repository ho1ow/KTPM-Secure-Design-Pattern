#!/usr/bin/env bash
# Đo độ trễ khi đi qua gateway so với gọi thẳng service.
# Benchmark chạy TRONG docker network: service không cần publish port,
# và gateway dùng server :8081 (không rate limit) để kết quả không bị 429.
# Dùng: ./scripts/bench.sh   (tùy chỉnh: TOTAL=5000 CONCURRENCY=20 ROUNDS=3 ./scripts/bench.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

TOKEN=$(curl -s -X POST http://localhost:8080/users/login -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"alice123"}' | jq -r .token)

docker run --rm --network secure-design_default \
  -e TOKEN="$TOKEN" -e TOTAL="${TOTAL:-3000}" -e CONCURRENCY="${CONCURRENCY:-1}" -e ROUNDS="${ROUNDS:-3}" \
  -v "$PWD/scripts/bench.js:/bench.js:ro" -v "$PWD/keys:/keys:ro" \
  node:20-alpine node /bench.js
