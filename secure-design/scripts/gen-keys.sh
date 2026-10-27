#!/usr/bin/env bash
# Sinh cặp khóa RSA cho token nội bộ (gateway -> service).
#   keys/internal.key : private key, CHỈ mount vào gateway (dùng để ký)
#   keys/internal.pub : public key, mount vào các service (chỉ verify được, không ký được)
# Dùng: ./scripts/gen-keys.sh          (bỏ qua nếu đã có)
#       ./scripts/gen-keys.sh --force  (tạo lại = xoay vòng khóa)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p keys

if [[ -f keys/internal.key && "${1:-}" != "--force" ]]; then
  echo "keys/internal.key đã tồn tại (dùng --force để tạo lại)"; exit 0
fi

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out keys/internal.key 2>/dev/null
openssl pkey -in keys/internal.key -pubout -out keys/internal.pub
chmod 644 keys/internal.key keys/internal.pub   # container chạy user khác root cần đọc được
echo "Đã tạo keys/internal.key (gateway) và keys/internal.pub (services)"
