# HyperLing

Web app học ngôn ngữ bằng cả câu. Người học chọn ngôn ngữ đích, trình độ hiện tại,
mục tiêu và khung thời gian; hệ thống tự tính số mục mỗi ngày và lịch ôn tập riêng.

Khóa khởi đầu: **tiếng Đức `de-a1-b2`** — đủ 1.800 câu A1–B2 kèm phiên âm IPA,
kèm 739 cặp từ–nghĩa có chú thích giống danh từ. Kèm khóa mẫu **tiếng Pháp
`fr-a1-b2`** (20 câu) tạo hoàn toàn bằng file nội dung, không sửa code lõi.

> **Trạng thái:** cả ba phase đã xong. Sẵn sàng deploy — xem
> [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Chạy thử trong 3 phút

Yêu cầu: **Node ≥ 20.9** (khuyến nghị 22) và **pnpm 9**.

```bash
pnpm install
pnpm dev
```

Mở http://localhost:3000. Landing page chạy được ngay **không cần Supabase** —
trang đăng nhập sẽ hiện thông báo chưa cấu hình thay vì lỗi.

Kiểm tra toàn bộ (lint + typecheck + 215 test, trong đó có test RLS và một phiên
học trọn vẹn chạy trên Postgres thật qua PGlite — không cần Docker, không cần
credential):

```bash
pnpm verify
```

---

## Cấu hình Supabase

Cần cho đăng nhập email và import nội dung.

### 1. Tạo project

1. Vào https://supabase.com/dashboard → **New project**.
2. Đặt tên, chọn region gần Việt Nam (Singapore), đặt database password và **lưu lại**.
3. Đợi project khởi tạo (~2 phút).

### 2. Chạy migration

Vào **SQL Editor** trong dashboard, chạy lần lượt **theo đúng thứ tự**:

1. `supabase/migrations/0001_content_schema.sql`
2. `supabase/migrations/0002_user_schema.sql`
3. `supabase/migrations/0003_rls_policies.sql`

Hoặc dùng Supabase CLI nếu đã cài:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

### 3. Bật đăng nhập bằng magic link

**Authentication → Providers → Email**: bật *Enable Email provider* và
*Enable email confirmations*. Tắt *Confirm password* (không dùng mật khẩu).

**Authentication → URL Configuration**:
- *Site URL*: `http://localhost:3000` (sau đổi thành domain Vercel)
- *Redirect URLs*: thêm `http://localhost:3000/auth/callback`

### 4. Điền biến môi trường

```bash
cp .env.example .env.local
```

Điền từ **Project Settings → API**:
- `NEXT_PUBLIC_SUPABASE_URL` — Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon/public key

Và từ **Project Settings → Database → Connection string → URI**:
- `DATABASE_URL` — dùng cho `content:import`, **không bao giờ** prefix `NEXT_PUBLIC_`

`.env.local` đã nằm trong `.gitignore`. Đừng commit nó.

### 5. Import nội dung

```bash
pnpm content:validate      # kiểm tra trước, không cần database
pnpm content:import        # upsert 1.800 mục + 2.206 liên kết từ vựng
```

Chạy lại bao nhiêu lần cũng được: upsert theo `(course_id, stable_key)` nên
`items.id` không đổi và tiến độ học không bị ảnh hưởng.

---

## Lệnh

| Lệnh | Việc |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm verify` | lint + typecheck + test — chạy trước mỗi commit |
| `pnpm test` | Vitest: unit, RLS, import |
| `pnpm test:e2e` | Playwright (xem *Giới hạn môi trường*) |
| `pnpm start` | Chạy production build, dùng để đo Lighthouse |
| `pnpm content:validate` | Kiểm tra file nội dung, exit 1 nếu có lỗi |
| `pnpm content:import` | Upsert nội dung vào Postgres |
| `pnpm content:ingest` | CSV/TSV → items JSON |
| `pnpm content:new` | Sinh khung khóa học mới |
| `pnpm content:schema` | Sinh lại JSON Schema từ Zod |
| `pnpm xlsx:convert` | Excel gốc → content JSON (chạy một lần) |

---

## Cấu trúc

```
content/              Nội dung khóa học — dữ liệu, không phải code
  de/de-a1-b2/        course.json (khai báo field) + items.json (600 mục)
  schema/             JSON Schema sinh từ Zod, cho editor
supabase/migrations/  Schema SQL + RLS — nguồn chân lý
scripts/              Pipeline nội dung
src/
  core/               Logic thuần: content, planner, scheduler (không React/Next/DB)
  lib/                Supabase, Drizzle, i18n, theme
  components/         UI
  config/app.config.ts  Mọi hằng số học tập, một nơi duy nhất
  messages/           vi.json, en.json
tests/unit/           Vitest, bao gồm RLS trên PGlite
data-source/          File Excel gốc, giữ để truy vết
docs/                 ARCHITECTURE, DECISIONS, ADDING_A_LANGUAGE
```

Chi tiết: [`CLAUDE.md`](CLAUDE.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
[`docs/DECISIONS.md`](docs/DECISIONS.md)

---

## Thêm ngôn ngữ mới

Thêm file nội dung, không sửa code lõi:

```bash
pnpm content:new -- --lang fr --level A1-B2
# sửa course.json, đổ dữ liệu vào
pnpm content:validate fr-a1-b2 && pnpm content:import fr-a1-b2
```

Hướng dẫn đầy đủ: [`docs/ADDING_A_LANGUAGE.md`](docs/ADDING_A_LANGUAGE.md)

---

## Chất lượng

Đo trên production build (`pnpm build && pnpm start`):

| Trang | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| `/` | 92 | 100 | 100 | 100 |
| `/dang-nhap` | 95 | 100 | 100 | 100 |

215 unit test, trong đó test RLS và một phiên học hoàn chỉnh chạy trên Postgres
thật. E2E Playwright chạy trên CI.

---

## Triển khai

Từng bước lên Vercel + Supabase, kèm checklist trước khi mở cho người dùng thật:
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

---

## Giới hạn môi trường

Máy dev hiện tại chạy macOS 12 / Node 21.5, dẫn tới ba ràng buộc đã xử lý:

- Ghim **Vitest 4 + Vite 7** (Vitest 5 cần Node ≥ 22)
- Bỏ `next-intl/plugin`, tự set alias (`@swc/core` native binary không load trên macOS 12)
- **Playwright chưa chạy được local** (`mac12-arm64` không được hỗ trợ) — e2e chạy trên CI

Nâng lên Node 22 (`.nvmrc` đã ghi sẵn) gỡ được ràng buộc đầu tiên.
