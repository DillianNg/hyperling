# CLAUDE.md — HyperLing

Hướng dẫn làm việc trên repo này. Đọc file này trước khi sửa code.

## Dự án là gì

Web app học ngôn ngữ đa ngôn ngữ. Người học chọn ngôn ngữ đích, ngôn ngữ nghĩa,
trình độ hiện tại, mục tiêu và khung thời gian; hệ thống tự tính số mục mỗi ngày
và lịch ôn tập.

Dữ liệu khởi đầu: khóa tiếng Đức `de-a1-b2`, hiện có **600 câu** (A1–A2) chuyển từ
file Excel gốc. 1.200 câu B1–B2 sẽ được bổ sung bằng `pnpm content:ingest`.

Benchmark của hệ thống: **1.800 mục ÷ 20 mục/ngày = 90 ngày**, cộng 10–15 ngày đệm.

## Nguyên tắc kiến trúc bất di bất dịch

### 1. Nội dung là dữ liệu, code là engine
Engine **không được biết** nó đang dạy tiếng Đức. Mọi đặc thù ngôn ngữ (giống
danh từ, phiên âm, chữ Hán, thanh điệu) khai báo trong `content/<lang>/<course-id>/course.json`
qua `fields` và `glossaryFields`. Thêm ngôn ngữ mới = thêm file nội dung, không
sửa code lõi. Xem `docs/ADDING_A_LANGUAGE.md`.

Nếu bạn định viết `if (language === 'de')` ở bất cứ đâu trong `src/core/` hoặc
`src/components/` — dừng lại, đó là dấu hiệu field schema còn thiếu.

### 2. `src/core/` phải thuần
Không import React, Next, Supabase hay driver database. Chỉ logic thuần, test
được không cần browser lẫn database. ESLint chặn việc này (`no-restricted-imports`).

### 3. Hằng số học tập chỉ ở một nơi
`src/config/app.config.ts`. Không viết lại số 20 hay 90 ở bất cứ đâu khác, kể cả
trong văn bản marketing — landing page import từ config.

### 4. Nội dung không mang ngày tháng
`items.orderIndex` là thứ tự dạy (1..n). Ngày học thuộc về `daily_plans` của từng
enrollment. Nhờ vậy hai người cùng khóa với khung thời gian khác nhau không xung đột.

### 5. ID ổn định là thiêng liêng
`items.stable_key` (`S0001`) và `courses.id` (`de-a1-b2`) **không bao giờ đổi**.
Tiến độ học tham chiếu `items.id`, mà id này giữ nguyên qua mọi lần import. Đổi
`courses.id` sẽ mồ côi toàn bộ enrollment.

### 6. SQL migration là nguồn chân lý của schema
`supabase/migrations/*.sql` chứa RLS, trigger và grant — những thứ Drizzle không
diễn đạt được. `src/lib/db/schema.ts` chỉ phản chiếu để có type.
`tests/unit/schema-parity.test.ts` sẽ fail nếu hai bên lệch nhau.

Sửa schema = sửa file SQL trước, rồi cập nhật Drizzle cho khớp. Đừng dùng
`drizzle-kit push`.

### 7. RLS không có ngoại lệ
Mọi bảng dữ liệu người dùng đều bật RLS, quyền sở hữu luôn lấy từ `auth.uid()`
trực tiếp trên dòng dữ liệu, không bao giờ từ giá trị client gửi lên.
`review_logs` cố ý **không có** policy UPDATE/DELETE — nhật ký ôn tập là bất biến.

## Lệnh

```bash
pnpm dev                 # dev server (Turbopack)
pnpm build               # production build
pnpm verify              # lint + typecheck + test — chạy trước mỗi commit
pnpm lint                # ESLint
pnpm typecheck           # tsc --noEmit
pnpm test                # Vitest (unit + RLS + import, dùng PGlite)
pnpm test:e2e            # Playwright — xem "Giới hạn môi trường" bên dưới
```

Pipeline nội dung:

```bash
pnpm xlsx:convert        # Excel gốc -> content/de/de-a1-b2/items.json (chạy một lần)
pnpm content:ingest -- <file.csv|tsv|json> --course <id>   # bảng -> items JSON
pnpm content:validate [course-id]                          # kiểm tra, exit 1 nếu có lỗi
pnpm content:import   [course-id] [--dry-run]              # upsert vào Postgres
pnpm content:new -- --lang fr --level A1-B2                # sinh khung khóa mới
pnpm content:schema      # sinh lại JSON Schema từ Zod
```

## Quy ước code

- TypeScript strict, `noUncheckedIndexedAccess` bật. Không `any` tùy tiện.
- Code, tên biến, commit message: **tiếng Anh**.
- Văn bản hiển thị cho người dùng, thông báo lỗi của script, tài liệu: **tiếng Việt**.
- Mọi chuỗi UI đi qua `src/messages/vi.json` + `en.json`, không hardcode trong JSX.
- Commit nhỏ theo Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- Mọi giả định ghi vào `docs/DECISIONS.md`.

## Giới hạn môi trường (máy dev hiện tại)

Máy đang chạy **macOS 12 / Node 21.5.0**, dẫn tới ba ràng buộc:

| Vấn đề | Cách xử lý |
|---|---|
| Vitest 5 + Vite 8 cần `node:util.styleText` (Node ≥ 22) | Ghim Vitest 4 + Vite 7 |
| `next-intl/plugin` kéo `@swc/core`, native binary không load trên macOS 12 | Bỏ plugin, tự set alias `next-intl/config` trong `next.config.ts` |
| Playwright không hỗ trợ `mac12-arm64` | E2E chạy trên CI (Ubuntu). Local chưa chạy được. |

Nâng lên Node 22 (`.nvmrc` đã ghi sẵn) sẽ gỡ ràng buộc thứ nhất.

## Trạng thái

- ✅ **Phase 1** — nền tảng, schema + RLS, auth email, pipeline nội dung, landing page.
- ⬜ **Phase 2** — planner, onboarding, phiên học.
- ⬜ **Phase 3** — dashboard, PWA, i18n tiếng Anh, e2e, deploy.
