# Kiến trúc

## Bản đồ tầng

```
┌─────────────────────────────────────────────────────────────┐
│  src/app/          Route, server action, trang               │
│  src/components/   UI (React)                                │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
┌───────────────▼──────────────┐  ┌───────────▼───────────────┐
│  src/lib/                    │  │  src/core/                │
│  Supabase, Drizzle, i18n,    │  │  LOGIC THUẦN              │
│  theme, env                  │  │  content · planner ·      │
│  (biết về framework & DB)    │  │  scheduler · session      │
└───────────────┬──────────────┘  │  (không React/Next/DB)    │
                │                 └───────────────────────────┘
┌───────────────▼─────────────────────────────────────────────┐
│  Postgres (Supabase) — schema + RLS trong supabase/migrations│
└─────────────────────────────────────────────────────────────┘
```

`src/core/` không được import React, Next, Supabase hay driver database. ESLint
chặn bằng `no-restricted-imports`. Nhờ vậy planner và scheduler test được trong
mili-giây, không cần browser lẫn database.

---

## Vì sao nội dung tách khỏi engine

Yêu cầu dài hạn: thêm ngôn ngữ hoặc cấp độ mới chỉ bằng cách thêm file dữ liệu.
Điều đó chỉ đúng nếu engine **không thể** biết nó đang dạy ngôn ngữ nào.

Cơ chế là **field plugin**. Mỗi khóa khai báo các trường của nó:

```jsonc
// content/de/de-a1-b2/course.json
"fields": [
  { "key": "text",            "role": "prompt", "required": true },
  { "key": "transliteration", "role": "hint",   "display": "toggle" }
],
"glossaryFields": [
  { "key": "gender", "role": "badge", "colorCoded": true, "enum": ["der","die","das"] }
]
```

Engine chỉ hiểu `role`, không hiểu "giống danh từ tiếng Đức". Màu der/die/das bật
lên vì `colorCoded: true`, không vì một nhánh `if (lang === 'de')`.

Giá trị của các trường nằm trong `items.fields` (JSONB). Khi import, trường nào
không được khai báo trong `course.json` sẽ bị loại — `course.json` là hợp đồng,
nội dung không lén đưa thêm field vào được.

---

## Vì sao nội dung không mang ngày tháng

File Excel gốc gắn câu `S0001` vào "Ngày 1". Điều đó chỉ đúng cho một người với
một lịch học.

Trong database, `items` chỉ có `order_index` (1..n). Ngày học thuộc về
`daily_plans`, gắn với từng `enrollment`. Hệ quả:

- Hai người cùng khóa với khung thời gian khác nhau không xung đột
- Một người đổi mục tiêu giữa chừng chỉ cần tính lại `daily_plans`, nội dung không đụng tới
- Thêm 1.200 câu mới không làm xê dịch ngày của ai

---

## Vì sao ID ổn định quan trọng

`items.stable_key` (`S0001`) đến từ file Excel và **không bao giờ đổi**. Import
upsert theo `(course_id, stable_key)`, nên `items.id` (UUID) giữ nguyên qua mọi
lần import.

`card_states` và `review_logs` tham chiếu `items.id`. Nếu id đổi mỗi lần import,
mọi tiến độ học sẽ mất. Đây là lý do `courses.id` được đặt là `de-a1-b2` ngay từ
đầu dù nội dung hiện chỉ tới A2 — xem D-002 trong `docs/DECISIONS.md`.

---

## Mô hình dữ liệu

### Nội dung (đọc được khi đã đăng nhập, ghi chỉ qua service role)

| Bảng | Vai trò |
|---|---|
| `languages` | Ngôn ngữ hệ thống biết, kèm `tts_lang` |
| `levels` | CEFR A0–C2 với `ord` để so sánh |
| `courses` | Metadata + `field_schema` (hợp đồng với engine) |
| `items` | Đơn vị học. `stable_key`, `order_index`, `fields` JSONB |
| `glossary_terms` | Từ/cụm, định danh bằng cặp `(term, meaning)` |
| `item_glossary` | Liên kết item ↔ term |

`glossary_terms` dùng `(course_id, term, meaning)` làm khóa duy nhất chứ không
chỉ `term`, vì cùng một từ mang nghĩa khác nhau tùy ngữ cảnh — dữ liệu thật có
739 cặp trên 709 từ riêng biệt.

### Dữ liệu người học (RLS bảo vệ toàn bộ)

| Bảng | Vai trò |
|---|---|
| `profiles` | Tạo tự động bằng trigger khi user đăng ký |
| `enrollments` | Một khóa đang học: ngày bắt đầu/mục tiêu, mục/ngày, ngày nghỉ, múi giờ |
| `daily_plans` | Kế hoạch từng ngày của một enrollment |
| `card_states` | Trạng thái FSRS mỗi cặp (user, item) |
| `review_logs` | Nhật ký ôn tập, **append-only** |
| `study_sessions` | Một phiên học |
| `item_flags` | Người học đánh dấu "khó" |

Một người có thể học nhiều khóa song song, nhưng chỉ một `enrollment` `active`
mỗi khóa — đảm bảo bởi partial unique index.

---

## Bảo mật

### RLS là lớp phòng thủ chính

Quyền sở hữu luôn lấy từ `auth.uid()` **trực tiếp trên dòng dữ liệu**, không bao
giờ từ giá trị client gửi lên. `user_id` giả mạo trong request không mở rộng
được quyền truy cập.

`daily_plans` không có `user_id` riêng; quyền sở hữu suy ra từ `enrollments` bằng
`EXISTS`. Nhờ đó không thể gắn một kế hoạch vào enrollment của người khác.

`review_logs` cố ý **không có** policy UPDATE/DELETE, kể cả cho chủ sở hữu.

### Server không phải bên có đặc quyền

`src/lib/supabase/server.ts` dùng anon key như client, nên mọi truy vấn của app
vẫn chịu RLS. Service role chỉ xuất hiện trong `scripts/content-import.ts`. Một
lỗi logic trong server component cũng không thể làm rò dữ liệu giữa hai người học.

### Bảng nội dung chỉ được `GRANT SELECT`

Ghi bị chặn hai lớp: không có policy, và không có privilege.

### Test chứng minh điều đó

`tests/unit/rls.test.ts` chạy chính các file migration thật trên PGlite (Postgres
biên dịch sang WASM) và kiểm chứng rằng user A không đọc/sửa/xoá được dữ liệu
user B trên cả 7 bảng — không cần Docker, không cần credential.

---

## Hiệu năng

Truy vấn nóng nhất là "thẻ nào đến hạn ôn hôm nay":

```sql
create index card_states_due_idx
  on card_states (user_id, enrollment_id, due)
  where state <> 0;
```

Partial index bỏ qua thẻ `New` (state = 0) vì chúng do kế hoạch điều khiển chứ
không theo ngày đến hạn. `tests/unit/schema-parity.test.ts` dùng `EXPLAIN` để
xác nhận index thực sự được dùng, không phải quét toàn bảng.

---

## Múi giờ

Mọi timestamp lưu UTC (`timestamptz`). "Hôm nay" tính theo `enrollments.timezone`
của từng người. `daily_plans.plan_date` là `date` — một ngày theo lịch của người
học, không phải một khoảnh khắc UTC.

---

## Hai nguồn chân lý của schema, và cách giữ chúng khớp nhau

`supabase/migrations/*.sql` là nguồn chân lý: nó chứa RLS, trigger, partial index
và grant. `src/lib/db/schema.ts` phản chiếu lại để app có type.

Hai nguồn chân lý sẽ lệch nhau trong im lặng, nên `tests/unit/schema-parity.test.ts`
so sánh định nghĩa Drizzle với cột thật mà migration tạo ra (tên bảng, tên cột,
NOT NULL) và fail nếu lệch.

Sửa schema: sửa SQL trước, cập nhật Drizzle sau. Không dùng `drizzle-kit push`.

---

## Pipeline nội dung

```
Excel gốc ──xlsx:convert──┐
                          ├──> content/<lang>/<course>/items*.json
CSV/TSV ────content:ingest┘            │
                                       ├── content:validate ──> exit 1 nếu lỗi
                                       └── content:import ────> Postgres (upsert)
```

`content:validate` chạy được **không cần database**, nên CI gate được trên nó.

`content:import` dùng `SqlExecutor` — một interface tối giản — nên cùng một đoạn
code chạy trên Supabase ở production và trên PGlite trong test. Đó là lý do
"import lại không sinh thêm bản ghi" là một mệnh đề được kiểm chứng chứ không
phải một lời hứa.

---

## Giao diện

Design token trong `src/app/globals.css` (`:root` và `.dark` định nghĩa cùng một
bộ biến), xuất ra Tailwind qua `@theme inline`. Không component nào cần biết
theme nào đang bật.

Theme lưu trong `localStorage` + `matchMedia` — cả hai đều ngoài React — nên đọc
qua `useSyncExternalStore` thay vì Context + effect. Một script nhỏ chạy trong
`<head>` áp theme trước lần vẽ đầu tiên để dark-mode không bị nháy trắng.

Font Inter + Be Vietnam Pro, cả hai nạp subset `vietnamese` và `latin-ext`, nên
`Nghĩa tiếng Việt` và `Grüße` render cùng một họ chữ, không rơi sang font dự phòng.

Chuyển động tôn trọng `prefers-reduced-motion` ở hai nơi: CSS vô hiệu hoá
transition/animation toàn cục, và `useReducedMotion()` tắt animation của Framer
Motion trong các sơ đồ.

---

## Lộ trình

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 1 | Nền tảng, schema + RLS, auth, pipeline nội dung, landing | ✅ xong |
| 2 | Planner (pure, test đầy đủ), FSRS wrapper, onboarding, phiên học | ⬜ |
| 3 | Dashboard, rebalance, PWA, i18n tiếng Anh, e2e, deploy | ⬜ |
