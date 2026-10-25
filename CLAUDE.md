# CLAUDE.md — HyperLing

Hướng dẫn làm việc trên repo này. Đọc file này trước khi sửa code.

## Dự án là gì

Web app học ngôn ngữ đa ngôn ngữ. Người học chọn ngôn ngữ đích, ngôn ngữ nghĩa,
trình độ hiện tại, mục tiêu và khung thời gian; hệ thống tự tính số mục mỗi ngày
và lịch ôn tập.

Dữ liệu: khóa tiếng Đức `de-a1-b2` đã đủ **1.800 câu** (A1 300, A2 300, B1 600,
B2 600), mỗi câu kèm **phiên âm IPA**, chuyển từ `data-source/1800 Completed.xlsx`
bằng `pnpm xlsx:convert`.

Benchmark của hệ thống: **1.800 mục ÷ 20 mục/ngày = 90 ngày**, cộng 10–15 ngày đệm.

Ngoài nội dung đã import, người học tự thêm được câu của riêng mình ở `/so-tay`.
Những câu đó học và ôn bằng cùng engine, tính vào cùng thống kê, nhưng **không**
làm xê dịch mốc 90 ngày của khóa chính — xem nguyên tắc #10.

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

### 7. Planner đề xuất, không bao giờ tự quyết
Khi người học bỏ lỡ ngày, planner trả về **ba lựa chọn** kèm hệ quả cụ thể và để
người học chọn. Không bao giờ âm thầm tăng số mục/ngày hay dời ngày mục tiêu.

Trần `MAX_NEW_PER_DAY` là **cứng**. Hệ quả đáng chú ý: khi kế hoạch đã chạy đúng
trần (20/ngày), phương án "dồn nhẹ" không bao giờ khả dụng — không còn chỗ để dồn.

### 8. Ngày tháng là `CalendarDate`, không phải `Date`
`src/core/planner/calendar.ts` định nghĩa `CalendarDate` = chuỗi `YYYY-MM-DD` có
brand. Mọi phép tính ngày chạy trên số ngày, không trên mili giây, nên DST và múi
giờ không làm lệch kết quả. `Date` chỉ dùng cho thời điểm thật (FSRS due time).

### 9. Truy vấn Supabase lớn dần phải đếm hoặc phân trang

Supabase trả tối đa **1000 dòng** mỗi request và **không báo là đã cắt**. Truy vấn
nào có kết quả lớn dần theo nội dung, theo tiến độ hay theo thời gian đều phải
dùng `count: 'exact', head: true` (khi chỉ cần con số) hoặc `fetchAllRows()`
trong `src/lib/data/paginate.ts` (khi thật sự cần mọi dòng).

`.select()` trần chỉ dành cho tập có chặn trên rõ ràng. PGlite trong test không
có trần này nên sẽ không bao giờ phát hiện giúp bạn (D-042).

### 10. Nội dung của người học có chủ sở hữu

Câu do người học tự thêm là dòng `items` bình thường, phân biệt bằng `owner_id`
(`null` = nội dung đã import từ `content/`). Nhờ vậy FSRS, `buildSession`, danh
sách từ và dashboard dùng lại nguyên vẹn — không chỗ nào trong engine cần biết
khái niệm "câu riêng".

Ba điều đi kèm, đừng tách rời (migration 0006):
- Tính duy nhất của `(course_id, stable_key)` và `(course_id, order_index)` là
  **partial unique index**, không còn là constraint. Hệ quả: `on conflict` phải
  nêu vị từ — `on conflict (course_id, stable_key) where owner_id is null` —
  vì Postgres không suy luận được partial index nếu thiếu nó.
- Policy ghi ghim `owner_id = auth.uid()` ở **cả** `using` và `with check`.
  Thiếu `with check` thì người học chuyển được câu của mình sang chủ khác.
- Policy không có grant thì vô dụng: Postgres từ chối statement trước khi xét
  policy. Bảng nội dung mặc định chỉ có `select` (migration 0003).

Sổ tay là enrollment riêng và **không chạy planner**: câu đến khi người học gặp,
không có tổng số để chia cũng không có ngày đích. Thống kê thì gộp —
`getEnrollmentStats` nhận danh sách enrollment (D-044, D-045, D-046).

### 11. RLS không có ngoại lệ
Mọi bảng dữ liệu người dùng đều bật RLS, quyền sở hữu luôn lấy từ `auth.uid()`
trực tiếp trên dòng dữ liệu, không bao giờ từ giá trị client gửi lên.
`review_logs` cố ý **không có** policy UPDATE/DELETE — nhật ký ôn tập là bất biến.

Một ngoại lệ có chủ đích: xoá cả enrollment thì cascade từ khoá ngoại cuốn theo
`review_logs` của nó, vì cascade chạy dưới quyền chủ bảng và đi vòng qua RLS. Bất
biến ở đây nghĩa là "không viết lại lịch sử của khoá đang học", không phải "không
bao giờ xoá được" (D-039).

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
| Lighthouse 13 cần Node ≥ 22.19 | Dùng `npx lighthouse@12` khi đo trên máy này |

Nâng lên Node 22 (`.nvmrc` đã ghi sẵn) sẽ gỡ ràng buộc thứ nhất.

## Trạng thái

- ✅ **Phase 1** — nền tảng, schema + RLS, auth email, pipeline nội dung, landing page.
- ✅ **Phase 2** — planner, FSRS, onboarding, trang kế hoạch, phiên học đầy đủ.
- ✅ **Phase 3** — dashboard, heatmap, streak, danh sách từ, PWA, i18n, e2e, deploy.
- ✅ **Sổ tay riêng** — người học tự thêm câu (`/so-tay`), ôn bằng cùng engine,
  gộp vào cùng thống kê. Cần migration **0006**.

Triển khai: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
