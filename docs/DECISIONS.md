# Nhật ký quyết định

Mọi giả định và quyết định kiến trúc, kèm lý do. Ghi theo thứ tự thời gian.
Quyết định đã bị thay thế thì đánh dấu ~~gạch ngang~~ thay vì xoá.

---

## Phase 1 — 2026-10-04

### D-001 · Khóa tiếng Đức có 600 mục, không phải 1.800

**Bối cảnh.** File `Customized Learning Deustch.xlsx` có 1.800 dòng, nhưng chỉ
600 dòng (`S0001`–`S0600`, Ngày 1–30) có nội dung thật. 1.200 dòng còn lại
(`S0601`–`S1800`, Ngày 31–90) chỉ có ID, ngày dự kiến và công thức theo dõi.
Chính sheet `HUONG_DAN` ghi rõ điều này.

**Quyết định.** Import đúng 600 mục có nội dung. Không tự sinh 1.200 câu còn lại.
Người dùng sẽ bổ sung qua `pnpm content:ingest`.

**Lý do.** Yêu cầu ban đầu nói rõ "không bịa dữ liệu". Sinh 1.200 câu tiếng Đức
B1–B2 kèm phiên âm và điểm ngữ pháp mà không ai kiểm chứng được sẽ tạo ra nội
dung sai nhưng trông đáng tin — tệ hơn là không có gì.

**Hệ quả.** Tiêu chí kiểm thu Phase 1 đổi từ "1.800 mục vào DB" thành "600 mục
vào DB, và validate báo rõ 1.200 dòng rỗng đã bị loại". Benchmark 1.800/90 ngày
vẫn được test đầy đủ ở Phase 2 bằng unit test của planner, vì planner chỉ nhận
một con số `totalItems`.

---

### D-002 · Course id là `de-a1-b2`, không phải `de-a1-a2` hay `de-a0-b2`

**Quyết định.** `courses.id = "de-a1-b2"`, với `levelFrom: "A1"`, `levelTo: "B2"`,
`levels: [A1, A2, B1, B2]`. Nội dung hiện chỉ phủ A1–A2.

**Lý do.** Người dùng sẽ bổ sung B1–B2. Nếu đặt `de-a1-a2` rồi đổi tên sau, mọi
`enrollment` sẽ mồ côi — course id là khóa ngoại của tiến độ học. Không dùng
`de-a0-b2` vì dữ liệu không có cấp A0 nào.

**Hệ quả.** Onboarding chỉ cho chọn mục tiêu ở cấp độ **đã có đủ item trong DB**,
tính tại runtime. Hôm nay người học chỉ chọn được tới A2; khi 1.200 câu được
import, B1 và B2 tự mở mà không sửa một dòng code nào.

---

### D-003 · Ba phương pháp giữ nguyên tên trong file gốc

**Quyết định.** Landing page dùng đúng ba tên mà sheet `HUONG_DAN` tuyên bố:
Lexical Approach (Lewis) · 10.000 Sentences / AJATT (i+1) · Mass Sentences (Glossika SRS).

**Lý do.** Người dùng chọn phương án này thay vì đổi sang tên học thuật hơn.

**Hệ quả.** Thuật toán lặp lại ngắt quãng vẫn nâng cấp từ khoảng cố định
(1/3/7/16/35 trong Excel) lên FSRS ở Phase 2 — cơ chế tốt hơn dưới cùng một tên gọi.

---

### D-004 · Từ vựng là chú thích kèm câu, không có SRS riêng

**Quyết định.** Câu là đơn vị học duy nhất có thẻ FSRS. 739 cặp từ–nghĩa trong
sheet `VOCAB` lưu ở `glossary_terms` + `item_glossary`, hiển thị trong thẻ câu và
ở trang tra cứu, nhưng không sinh thẻ ôn riêng.

**Lý do.** Đúng nguyên tắc "Không học từ rời" mà file gốc nhấn mạnh. Nếu mỗi từ
là một thẻ, tải ôn tập tăng khoảng 2,4 lần và phép tính "20 mục/ngày" của
benchmark không còn đúng.

---

### D-005 · Nội dung không mang ngày tháng

**Quyết định.** Bỏ cột "Ngày thứ" và "Ngày dự kiến" của Excel khỏi bảng `items`.
Chỉ giữ `order_index` (1..n). Ngày học thuộc `daily_plans` theo từng enrollment.

**Lý do.** Excel gắn chặt câu `S0001` vào "Ngày 1" — chỉ đúng cho một người với
một lịch. Tách ra thì hai người cùng khóa với khung thời gian khác nhau không
xung đột, và đổi mục tiêu giữa chừng không làm hỏng nội dung.

---

### D-006 · Migration SQL là nguồn chân lý, Drizzle chỉ phản chiếu

**Quyết định.** Schema viết tay trong `supabase/migrations/*.sql`.
`src/lib/db/schema.ts` mirror lại để có type. Không dùng `drizzle-kit push`.

**Lý do.** RLS policy, trigger `on_auth_user_created`, partial index và grant đều
không diễn đạt được bằng Drizzle schema. Có hai nguồn chân lý thì chúng sẽ lệch
nhau trong im lặng — nên `tests/unit/schema-parity.test.ts` so sánh Drizzle với
cột thật mà migration tạo ra và fail nếu lệch.

---

### D-007 · Test RLS bằng PGlite thay vì Supabase local

**Quyết định.** `tests/unit/helpers/test-db.ts` chạy chính các file migration thật
trên PGlite (Postgres 18 biên dịch sang WASM), với một shim tối thiểu cho
`auth.users`, `auth.uid()` và hai role `anon`/`authenticated`.

**Lý do.** Máy dev không có Docker nên không chạy được Supabase local. PGlite là
Postgres thật, hỗ trợ RLS và `SET ROLE` đầy đủ, nên test kiểm chứng đúng những
policy sẽ được deploy — không phải một bản mô phỏng. Chạy offline, không cần
credential của ai.

**Hệ quả.** Toàn bộ tiêu chí "user A không đọc/ghi được dữ liệu user B" kiểm
chứng được trước khi có bất kỳ project Supabase nào.

---

### D-008 · `review_logs` là append-only, kể cả với chủ sở hữu

**Quyết định.** Bảng `review_logs` chỉ có policy SELECT và INSERT. Không UPDATE,
không DELETE, kể cả cho người tạo ra dòng đó.

**Lý do.** Nhật ký ôn tập là bằng chứng về điều đã xảy ra; mọi thống kê, heatmap
và khả năng tinh chỉnh lại thuật toán sau này đều dựa vào nó. Cho sửa thì mất
tính toàn vẹn.

---

### D-009 · Import không bao giờ tự xoá mục

**Quyết định.** `content:import` báo cáo các mục còn trong DB nhưng không còn
trong file nội dung (`orphanStableKeys`), và **không xoá** chúng.

**Lý do.** Một mục bị xoá nhầm khỏi file nội dung sẽ kéo theo `card_states` và
`review_logs` của mọi người học (ON DELETE CASCADE). Mất tiến độ là không hồi phục được.

---

### D-010 · Phiên âm tiếng Việt là field tùy chọn, mặc định bật

**Quyết định.** `transliteration` khai báo `display: "toggle"` trong `course.json`.
Mặc định hiện, người học tắt được.

**Lý do.** File gốc khuyên bỏ dần sau tuần 3 để tránh nhiễm âm Việt, nhưng đó là
lời khuyên chứ không phải luật — người học tự quyết.

---

### D-011 · Công thức ngày đệm

**Quyết định.** `bufferDays = clamp(ceil(totalPlanDays / 6), 10, 15)`.

**Lý do.** Khớp đúng file gốc ở mốc chuẩn: 90 ngày → 15 ngày đệm. Kế hoạch ngắn
hơn nhận đệm nhỏ hơn nhưng không dưới 10 ngày.

---

### D-012 · TypeScript 5.9 thay vì 7.0

**Quyết định.** Ghim `typescript@5.9.3` dù 7.0.2 đã là bản `latest`.

**Lý do.** `typescript-eslint@8` khai báo peer `typescript >=4.8.4 <6.1.0`, nên TS 7
sẽ làm lint không chạy được. Nâng lên khi typescript-eslint hỗ trợ.

---

### D-013 · ESLint 9 thay vì 10

**Quyết định.** Ghim `eslint@9.39.5`.

**Lý do.** `eslint-config-next@16` phụ thuộc `eslint-plugin-import`,
`eslint-plugin-react` và `eslint-plugin-jsx-a11y`, cả ba đều khai báo peer tối đa
`eslint ^9`.

---

### D-014 · Bỏ `next-intl/plugin`, tự set alias

**Quyết định.** `next.config.ts` tự khai báo alias `next-intl/config` qua
`turbopack.resolveAlias` và `webpack()`, không dùng `createNextIntlPlugin`.

**Lý do.** Plugin `require('@swc/core')`, mà native binary của nó không load được
trên macOS 12 (`Symbol not found: ___unw_add_dynamic_eh_frame_section`) và làm
`pnpm build` chết. Việc thiết yếu của plugin chỉ là một alias; tính năng còn lại
(trích xuất message lúc build) là tối ưu hóa không bắt buộc.

---

### D-015 · i18n bằng cookie, không prefix URL

**Quyết định.** Locale lưu trong cookie `hyperling-locale`, không có `/vi/`, `/en/`
trong đường dẫn.

**Lý do.** Tiếng Việt là mặc định và tiếng Anh là tùy chọn, không phải hai thị
trường ngang nhau. URL sạch hơn và thêm locale không cần đổi route nào.

---

### D-016 · Theme dùng `useSyncExternalStore`, không dùng Context + effect

**Quyết định.** `src/lib/theme-store.ts` là external store;
`src/components/use-theme.ts` đọc qua `useSyncExternalStore`.

**Lý do.** Theme sống trong `localStorage` và `matchMedia` — cả hai đều ngoài
React. Bản đầu dùng Context + `useEffect` bị quy tắc `react-hooks/set-state-in-effect`
của ESLint bắt đúng: setState trong effect gây cascading render.

---

### D-017 · Chuyển Excel bằng Python, không thêm `xlsx` vào dependencies

**Quyết định.** `scripts/xlsx-to-content.py` dùng openpyxl. Gói npm `xlsx` không
có trong `package.json`.

**Lý do.** Bản `xlsx@0.18.5` trên npm registry đã cũ và có lỗ hổng prototype
pollution; SheetJS đã rời npm. Việc chuyển đổi chỉ chạy **một lần**, nên Excel
không cần trở thành dependency của app.

---

### D-018 · Playwright chưa chạy được trên máy dev

**Bối cảnh.** `playwright install chromium` báo
`Playwright does not support chromium on mac12-arm64`.

**Quyết định.** Giữ nguyên Playwright, chạy e2e trên CI (Ubuntu). Local chưa chạy được.

**Hệ quả.** Phase 3 phải xác minh e2e qua CI chứ không qua máy dev, cho tới khi
máy nâng macOS.

---

### D-019 · Server dùng anon key, không dùng service role

**Quyết định.** `src/lib/supabase/server.ts` dùng anon key như client. Service role
chỉ xuất hiện trong `scripts/content-import.ts` qua `DATABASE_URL`.

**Lý do.** Server component không phải là bên gọi có đặc quyền. Giữ mọi truy vấn
của app dưới RLS nghĩa là một lỗi logic trong code server cũng không thể làm rò
dữ liệu giữa hai người học.

---

### D-020 · Validate chỉ cảnh báo khi orderIndex ngắt quãng

**Quyết định.** `orderIndex` ngắt quãng là **cảnh báo**, không phải lỗi.

**Lý do.** Khi người dùng bổ sung `S0601`–`S1800` vào file riêng, trạng thái trung
gian có thể khuyết số. Chặn cứng sẽ cản trở việc nhập liệu từng phần, trong khi
cảnh báo vẫn giúp phát hiện mục bị sót.

---

## Phase 2 — 2026-10-05

### D-021 · Ngày tháng là `CalendarDate`, tách khỏi thời điểm

**Quyết định.** `src/core/planner/calendar.ts` định nghĩa `CalendarDate` = chuỗi
`YYYY-MM-DD` có brand. Mọi phép tính ngày chạy trên số ngày kể từ epoch.

**Lý do.** Một kế hoạch học gồm những **ngày trên lịch**, không phải những khoảnh
khắc. Nếu dùng `Date`, cộng 24 giờ qua mốc đổi giờ sẽ rơi sang ngày khác, và kết
quả phụ thuộc múi giờ của máy chạy. `Date` vẫn dùng cho thời điểm thật — hạn ôn
của FSRS — và chỉ chuyển thành ngày lịch đúng một nơi: `calendarDateInTimezone`.

---

### D-022 · Kế hoạch không lưu sẵn 90 dòng `daily_plans`

**Quyết định.** Lịch học tính bằng `computePlan()` lúc cần. Bảng `daily_plans` chỉ
có dòng cho những ngày **đã có hoạt động**, tạo khi người học học câu đầu tiên
trong ngày.

**Lý do.** Lịch là hàm thuần của (ngày bắt đầu, ngày mục tiêu, mục/ngày, ngày nghỉ).
Lưu sẵn 90 dòng tạo ra thứ phải đồng bộ mỗi lần rebalance, mà không thêm thông tin
gì. Dòng chỉ cần tồn tại khi có số liệu thật để ghi.

---

### D-023 · Khi kế hoạch chạy đúng trần, "dồn nhẹ" không khả dụng

**Phát hiện.** Test cho thấy: ở nhịp 20 mục/ngày (đúng trần), chỉ cần trễ một ngày
là phương án "dồn nhẹ" đã bất khả thi — không còn chỗ nào để dồn.

**Quyết định.** Giữ nguyên hành vi, và **hiển thị phương án đó cùng lý do bị chặn**
thay vì ẩn đi.

**Lý do.** Đây là hệ quả trực tiếp của trần cứng, không phải lỗi. Ẩn phương án sẽ
khiến người học thắc mắc vì sao cách hiển nhiên nhất không có; nêu rõ "cần 21
mục/ngày, vượt trần 20" giải thích được chính sách. Người học luôn còn hai lối
thoát: dùng ngày đệm, hoặc dời mục tiêu.

---

### D-024 · Bài kiểm tra sinh ra tất định, không ngẫu nhiên

**Quyết định.** Mọi lựa chọn "ngẫu nhiên" (thứ tự đáp án trắc nghiệm, từ bị khoét
trong bài điền chỗ trống, dạng bài) đều suy ra từ một hạt giống tính từ `itemId`.

**Lý do.** Không chỉ để test. Người học tải lại trang giữa câu hỏi phải nhận lại
**đúng câu hỏi đó**, không phải một câu khác — ngẫu nhiên thật sẽ biến việc reload
thành một cách đổi đề.

---

### D-025 · Chấm bài gõ tay bỏ qua dấu câu, nhưng KHÔNG bỏ qua dấu tiếng Đức

**Quyết định.** `checkTypedAnswer` chuẩn hoá chữ hoa/thường, khoảng trắng và dấu
câu; nhưng `schon` ≠ `schön`, `Strasse` ≠ `Straße`.

**Lý do.** Chấp nhận `schon` cho `schön` là dạy sai: đó là hai từ khác nhau. Trong
khi viết hoa hay thiếu dấu chấm than thì không ảnh hưởng tới việc đã nhớ câu hay chưa.

---

### D-026 · "Chưa nhớ" đưa câu về cuối giai đoạn hiện tại

**Quyết định.** Khi người học bấm "Chưa nhớ", câu được chèn lại vào cuối giai đoạn
đang chạy của phiên, chứ không đợi tới ngày mai.

**Lý do.** FSRS đã đặt hạn ôn vài phút sau, nên câu đó thuộc về chính phiên này.
Gặp lại trong phiên biến một lần quên thành một lần thử lại, thay vì một lỗi bị
ghi sổ.

---

### D-027 · Trạng thái thẻ học reset bằng remount, không bằng effect

**Quyết định.** `SessionRunner` truyền `key={itemId-attempt}` cho `StudyCard`;
`StudyCard` không có effect nào để dọn state.

**Lý do.** Quy tắc `react-hooks/set-state-in-effect` bắt đúng bản đầu tiên: gọi
`setState` trong effect gây cascading render. Remount là cách React làm việc này.
Cùng lý do, trạng thái TTS đọc qua `useSyncExternalStore` thay vì effect — danh
sách giọng đọc là trạng thái của trình duyệt, không phải của React.

---

### D-028 · Server tính lại kế hoạch, không tin số liệu client gửi lên

**Quyết định.** Onboarding xem trước kế hoạch ngay trên trình duyệt bằng đúng hàm
`computePlan` thuần, nhưng `createPlan` trên server tính lại từ đầu trước khi ghi.

**Lý do.** Lõi thuần chạy được ở cả hai phía — đó là lợi ích của việc giữ
`src/core` không phụ thuộc framework. Nhưng trần mỗi ngày phải đứng vững cả khi
request bị chế tác, nên con số lưu vào database luôn là con số server tự tính.
