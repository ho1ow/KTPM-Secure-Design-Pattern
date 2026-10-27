# Secure Design: API Gateway + Valet Key

2 service (User, Order) sau 1 API Gateway (OpenResty = nginx + Lua), ảnh lưu trên MinIO.

## Kiến trúc

```
                    ┌──────────────── mạng nội bộ (không publish port) ────────────────┐
Client ──JWT──▶ Gateway :8080 ──token nội bộ──▶ User  :3001 ── ký pre-signed URL ──┐   │
  │             • Routing                       Order :3002                         │   │
  │             • Offloading: verify JWT,                                           ▼   │
  │               rate limit, ký token nội bộ                                    MinIO  │
  │             • Aggregation: /dashboard                                               │
  └──────────────────────── PUT ảnh trực tiếp (Valet Key) ──:9000──────────────▶        │
                    └──────────────────────────────────────────────────────────────────┘
```

| Mẫu | Làm ở đâu | Cách làm |
|---|---|---|
| **Routing** | `gateway/nginx.conf` | `/users/*` → User, `/orders*` → Order. Service không mở port ra ngoài |
| **Offloading** | `gateway/lua/auth.lua` | Verify JWT của client, rate limit 10 req/s/IP (429) |
| **Aggregation** | `gateway/lua/dashboard.lua` | `/dashboard` gọi song song User + Order, gộp kết quả; Order lỗi vẫn trả user |
| **Valet Key** | `user-service` | Cấp pre-signed URL (chỉ ghi, 1 file, hết hạn 5 phút); client upload thẳng MinIO |

## Tin cậy bên trong: token nội bộ

Gateway không truyền `X-User-Id` (giả mạo được từ mạng nội bộ) mà ký **token nội bộ** cho từng request:

- RS256, `iss=api-gateway`, `aud=<service đích>`, sống 60s.
- Private key chỉ ở gateway; service chỉ có public key → verify được, không ký được.
- Service chỉ nhận token đúng chữ ký, đúng `aud` của mình. Token của client không đi vào trong.

Gọi thẳng service từ trong mạng với header giả, token tự ký, token sai `aud` hay hết hạn → đều 401.

## Chạy

```bash
./scripts/gen-keys.sh          # sinh cặp khóa (1 lần)
docker compose up -d --build
./scripts/test.sh              # 32 test
./scripts/bench.sh             # đo độ trễ: qua gateway thêm ~0.3 ms
```

Tài khoản demo: `alice/alice123`, `bob/bob123`, `admin/admin123`.
