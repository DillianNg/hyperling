# Nhật ký quyết định

Mọi giả định và quyết định kiến trúc, kèm lý do. Ghi theo thứ tự thời gian.
Quyết định đã bị thay thế thì đánh dấu ~~gạch ngang~~ thay vì xoá.

---

## Phase 1 — 2026-10-04

### D-001 · Khóa tiếng Đức có 600 mục, không phải 1.800

> **Đã được thay thế bởi [D-041](#d-041--đủ-1800-câu-và-phiên-âm-chuyển-sang-ipa) (2026-10-06).** Giữ lại để ghi nhận bối cảnh lúc đó.

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

---

## Phase 3 — 2026-10-05

### D-029 · Một họ chữ duy nhất, không dùng font riêng cho tiêu đề

**Bối cảnh.** Bản đầu dùng Inter cho nội dung và Be Vietnam Pro cho tiêu đề. Đo
Lighthouse trên production build: **Performance 86**, với Largest Contentful Paint
3,8 giây mà 88% là *render delay* — trình duyệt phải tải 13 file woff2 trước khi
dòng tiêu đề lớn nhất ổn định.

**Quyết định.** Bỏ Be Vietnam Pro. Inter là variable font phủ cả Vietnamese lẫn
Latin Extended, nên `Nghĩa tiếng Việt` và `Grüße` vẫn cùng một face. Tiêu đề phân
cấp bằng độ đậm và letter-spacing.

**Kết quả.** 13 file font còn **7**. Performance **86 → 92**.

**Lý do.** Một font chữ thứ hai là thứ người học không bao giờ nhận ra thiếu,
nhưng ba giây chờ tiêu đề thì có.

---

### D-030 · Service worker cố ý bảo thủ

**Quyết định.** Service worker chỉ cache `/_next/static/` (đã băm nội dung nên
không bao giờ cũ) và trang ngoại tuyến. **Mọi trang và mọi lời gọi API đều
network-only**, không ghi vào cache.

**Lý do.** Đây là ứng dụng nhiều người dùng. Cache nhầm một trang đã render nghĩa
là có khả năng hiện dữ liệu của người này cho người khác. Lợi ích của việc cache
trang không đáng để đánh đổi rủi ro đó.

---

### D-031 · Cường độ heatmap tính theo chính người học

**Quyết định.** Mức đậm nhạt của ô trong heatmap so với **ngày bận nhất của chính
người đó**, không theo thang cố định.

**Lý do.** Người học 600 câu trong 90 ngày có nhịp 7 câu/ngày. Nếu thang đo cố
định lấy mốc 20 câu, lưới của họ sẽ luôn nhạt — trông như đang lười, trong khi
họ theo đúng kế hoạch của mình.

---

### D-032 · Ngày nghỉ đã khai báo không làm đứt chuỗi

**Quyết định.** `computeStreak` bỏ qua ngày nghỉ mà người học đã khai báo trong
`rest_weekdays`: không tính là ngày học, nhưng cũng không cắt chuỗi.

**Lý do.** Người học khai báo nghỉ Thứ Bảy và Chủ Nhật rồi bị mất chuỗi vào mỗi
cuối tuần thì tính năng ngày nghỉ trở thành vô nghĩa. Chuỗi nên đo sự đều đặn so
với kế hoạch của họ, không so với một tuần bảy ngày tưởng tượng.

---

### D-033 · Bộ lọc danh sách từ nằm trong URL

**Quyết định.** Tìm kiếm, lọc cấp độ và lọc "chỉ câu khó" lưu trong query string,
không trong state của component.

**Lý do.** Một danh sách đã lọc là thứ người học muốn quay lại. Đặt trong URL thì
nó bookmark được, chia sẻ được, và sống sót qua reload — miễn phí.

---

### D-034 · Mạo từ chỉ giống danh từ lấy từ `course.json`

**Bối cảnh.** Thêm khóa tiếng Pháp làm lộ ra `parseGlossary` hardcode
`der/die/das` — chính xác là loại vi phạm mà nguyên tắc "engine không biết ngôn
ngữ nào" nhằm ngăn chặn.

**Quyết định.** Danh sách mạo từ truyền vào từ `course.glossaryFields[].enum`.

**Lý do.** Đây là lý do nên thêm ngôn ngữ thứ hai sớm: nó biến một nguyên tắc
kiến trúc thành thứ kiểm chứng được, và chỉ ra chỗ nguyên tắc đó đang bị phá.

---

### D-035 · Connection string lắp từ ba biến, không dán nguyên URI

**Bối cảnh.** Lần kết nối thật đầu tiên thất bại ba lần liên tiếp vì ba nguyên
nhân khác nhau: `tsx` không tự đọc `.env.local`; host trực tiếp
`db.<ref>.supabase.co` **chỉ có IPv6** nên trả `ENOTFOUND` trên mạng IPv4; và mật
khẩu dán vào vẫn còn nguyên dấu `[...]` placeholder của Supabase.

**Quyết định.** `scripts/lib/database-url.ts` lắp connection string từ
`SUPABASE_PROJECT_REF` + `SUPABASE_DB_PASSWORD` + `SUPABASE_REGION`, tự
URL-encode mật khẩu, từ chối mật khẩu còn hình dạng placeholder, và từ chối host
IPv6-only kèm lời giải thích. `DATABASE_URL` dán sẵn vẫn được ưu tiên nếu hợp lệ.

**Lý do.** Mật khẩu database thường chứa `@ : / ?` — những ký tự mang nghĩa trong
URI. Bắt người dùng tự ghép và tự encode là đặt một cái bẫy im lặng ngay ở bước
đầu tiên. Dán mật khẩu thô thì không có gì để làm sai.

---

### D-036 · Câu lệnh import chạy trên handle của transaction

**Bối cảnh.** `pnpm content:import` treo vô hạn sau dòng "Đang import ..." mà
không báo lỗi. Nguyên nhân: script bọc import trong `sql.begin` trên pool chỉ có
**một** connection (`max: 1`), nhưng `SqlExecutor` lại gọi `sql.unsafe()` trên
pool bên ngoài — nó xếp hàng đợi một connection đang bị chính transaction giữ.
Deadlock.

**Quyết định.** `executorFor(tx)` nhận handle của transaction; không câu lệnh nào
trong `sql.begin` được chạm vào pool bên ngoài. Thêm `connect_timeout` và
`statement_timeout`.

**Lý do.** Ngoài việc gỡ deadlock, đây còn là lỗi đúng đắn: chạy trên pool bên
ngoài nghĩa là các INSERT nằm **ngoài** transaction, nên lời hứa "thất bại thì
rollback" trong tài liệu là không thật.

**Vì sao test không bắt được.** Mọi test gọi `importCourse` trực tiếp với PGlite,
không đi qua lớp transaction của script — `postgres.js` cần socket thật nên không
chạy được trên PGlite. Đã thêm guard tĩnh trong `tests/unit/content-import.test.ts`
đọc mã nguồn script và fail nếu `sql.begin` không dùng `tx`. Guard đã được xác
nhận fail trên dạng code cũ.

---

### D-037 · Backfill profile bằng migration mới, không sửa 0002

**Bối cảnh.** Trigger `on_auth_user_created` chỉ chạy khi INSERT vào
`auth.users`. Tài khoản đăng ký **trước khi** 0002 được chạy nên không có dòng
`profiles` — và app coi thiếu profile là thiếu tài khoản.

**Quyết định.** `0005_backfill_profiles.sql` đối chiếu hai bảng và chèn phần
thiếu. Idempotent nhờ anti-join + `on conflict do nothing`.

**Lý do.** Nguyên tắc #6: không sửa migration đã chạy trên database thật. Sửa
0002 sẽ khiến nó khác với thứ đã thực sự áp dụng, và vẫn không chữa được những
hàng đã mồ côi.

---

### D-038 · Cột `jsonb` nhận object thô, không nhận chuỗi đã `JSON.stringify`

**Bối cảnh.** Sau khi import thành công, mọi thẻ học hiện ra **trống chữ**: có chủ
đề, có nút, nhưng không có câu tiếng Đức. Nguyên nhân: `importCourse` truyền
`JSON.stringify(fields)` vào cột `jsonb`. PGlite parse chuỗi đó thành object;
postgres.js **mã hoá JSON thêm lần nữa** và lưu một jsonb *string*, khiến mọi
`fields->>'text'` trả `null`. Thêm `::jsonb` cũng không gỡ được — đã thử nghiệm
trực tiếp trên database thật.

**Quyết định.** `src/core/content/import.ts` truyền object thô cho mọi cột
`jsonb`. Cả hai driver đều đồng ý về object.

**Vì sao 217 test không bắt được.** Đây không phải lỗ hổng độ phủ mà là **giới
hạn cấu trúc**: PGlite chấp nhận *cả hai* dạng và cho ra object, nên không
assertion nào chạy trên PGlite có thể tái hiện hành vi của postgres.js. Guard mới
vì vậy kiểm tra **nguyên nhân** thay vì hậu quả — bắt tham số `importCourse` gửi
đi và fail nếu có chuỗi JSON mã hoá sẵn. Đã xác nhận guard fail trên code cũ.

**Bài học.** Hai lỗi liên tiếp (D-036, D-038) đều lọt qua test vì PGlite dễ tính
hơn driver thật. PGlite chứng minh được logic SQL và RLS, nhưng **không** chứng
minh được tầng tuần tự hoá tham số. Những gì thuộc về tầng đó phải kiểm ở chỗ
code tạo ra tham số, hoặc chạy trên Postgres thật.

---

### D-039 · Xoá lộ trình học giữ lại ghi chú của người học

**Bối cảnh.** Cần một cách bắt đầu lại từ đầu mà không phải đăng nhập lại — bản
Supabase miễn phí chỉ cho 4 email magic link mỗi giờ, nên xoá cả tài khoản sẽ
chặn chính việc thử nghiệm.

**Quyết định.** Nút trong trang Cài đặt xoá **một** enrollment. Khoá ngoại
`on delete cascade` cuốn theo `daily_plans`, `card_states`, `review_logs` và
`study_sessions`. Hai thứ cố ý ở lại:

- **`item_flags`** — khoá chính là `(user_id, item_id)`, gắn với *nội dung* chứ
  không gắn với lộ trình, và cột `note` chứa chữ người học tự viết. Xoá văn bản
  do người dùng soạn dưới một nút mang nhãn "Xoá lộ trình học" là mặc định sai.
  Hộp xác nhận vì vậy **nói rõ chúng được giữ**, kèm số lượng.
- **`profiles`** và tài khoản — người học vẫn đăng nhập, quay thẳng về onboarding.

**Lý do.** Reset một nửa mà không nói gì là tệ hơn cả hai thái cực. Nguyên tắc
phân định: xoá *trạng thái kế hoạch* do hệ thống sinh ra, giữ *thứ người học tự
tạo ra*.

**Ngoại lệ đối với nguyên tắc RLS (#10 trong `CLAUDE.md`).** `review_logs` cố ý không có policy DELETE, nên
chính chủ cũng không xoá được từng dòng. Nhưng cascade từ khoá ngoại chạy dưới
quyền chủ bảng và **đi vòng qua RLS** — nên xoá cả khoá học vẫn xoá sạch nhật ký
của khoá đó. Đây là con đường duy nhất những dòng ấy biến mất được, và nó đúng:
bất biến ở đây nghĩa là "không viết lại lịch sử của khoá đang học", không phải
"không bao giờ xoá được". Đã ghi thành test trong `tests/unit/rls.test.ts`.

---

### D-040 · Test đối chiếu khoá giữa `vi.json` và `en.json`

**Bối cảnh.** Thêm 13 chuỗi cho tính năng xoá lộ trình làm lộ ra: 346 khoá i18n
chưa từng có test nào canh.

**Quyết định.** `tests/unit/messages.test.ts` kiểm ba điều giữa mọi locale: cùng
bộ khoá, cùng biến nội suy (`{count}`), và không chuỗi rỗng.

**Lý do.** next-intl **ném lỗi** khi thiếu khoá chứ không fallback, nên một khoá
chỉ có trong `vi.json` là màn hình lỗi cho người đọc tiếng Anh — trên trang mà
không ai trong dự án này mở theo mặc định. Đúng loại sai sót nên để test bắt thay
vì người dùng. Bản dịch đánh rơi `{count}` cũng vậy: câu vẫn hiện, chỉ mất mất con số.

---

### D-041 · Đủ 1.800 câu, và phiên âm chuyển sang IPA

**Bối cảnh.** Người dùng cung cấp `1800 Completed.xlsx`: 1.200 câu B1–B2 còn
thiếu đã được điền, và **toàn bộ 1.800 phiên âm đổi từ kiểu đọc-theo-tiếng-Việt
sang IPA chuẩn Duden**. Thay thế [D-001](#d-001--khóa-tiếng-đức-có-600-mục-không-phải-1800),
vốn chỉ import 600 câu vì không được phép bịa phần còn lại.

**Quyết định.**

- `items.json` sinh lại từ file mới: 1.800 mục, 2.203 liên kết từ vựng, 1.909 từ
  riêng biệt, 90 chủ đề. `version` của khóa lên `2.0.0`.
- Giữ nguyên dạng ngoặc vuông của IPA (`[ˈɡuːtən ˈmɔʁɡən]`) đúng như file nguồn —
  đó là ký hiệu phiên âm ngữ âm chuẩn, không phải thứ cần gọt.
- Nhãn field `transliteration` đổi thành "Phiên âm IPA". Khóa tiếng Pháp **giữ**
  nhãn "Phiên âm (đọc theo tiếng Việt)" vì dữ liệu của nó vẫn là kiểu đọc Việt —
  đúng như kiến trúc dự định: nhãn thuộc về từng khóa, không thuộc về engine.
- Thêm 8 giá trị `sentenceType`. `Câu phụ` và `Mệnh đề phụ` **không** gộp làm một
  dù nghĩa gần nhau, vì file nguồn phân biệt chúng; gộp là sửa dữ liệu, không
  phải import dữ liệu.

**Giữ nguyên tiến độ.** 600 mục cũ được cập nhật tại chỗ nhờ khóa
`(course_id, stable_key)`, nên `items.id` không đổi và mọi `card_states` trỏ vào
chúng vẫn còn — import báo đúng "1.200 thêm mới, 600 cập nhật".

**Ba chỗ thiếu trong file nguồn.** `S0935`, `S1761`, `S1771` có cụm từ ở cột
"Từ mới" nhưng không có dòng VOCAB tương ứng. Script báo ra và bỏ trống, không
bịa thêm. Người dùng sau đó yêu cầu điền; xem [D-043](#d-043--thêm-dòng-vocab-bằng-cách-sửa-xml-không-dùng-openpyxl).

**Chốt vị trí cột.** Lần chuyển đổi này tiêu đề cột đã đổi tên ("Phiên âm" →
"Phiên âm IPA (chuẩn Duden)") trong khi script đọc theo **chỉ số cột**. Lần sau
nếu cột bị xê dịch, dữ liệu sai sẽ vào đúng ô mà không ai hay. `xlsx-to-content.py`
nay kiểm tiêu đề trước khi đọc một dòng nào và dừng hẳn nếu lệch.

---

### D-042 · Trần 1000 dòng của PostgREST — đếm ở database, phân trang khi cần mọi dòng

**Bối cảnh.** Sau khi khóa tiếng Đức lên 1.800 câu, onboarding báo "Cấp B2 đang
được bổ sung nội dung" dù B2 đã có đủ 600 câu. Con số B1 hiển thị `1000` chính là
dấu vết: `getItemCountByLevel` tải **mọi dòng** về rồi đếm bằng JavaScript, mà
Supabase chỉ trả tối đa **1000 dòng** mỗi request và **không báo là đã cắt**. Nó
thấy A1 300, A2 300, B1 400, B2 **0**.

Đây không phải lỗi hiếm gặp mà là **một lớp lỗi**. Soát lại toàn bộ `src/lib/data`
tìm thấy sáu truy vấn nữa có kết quả lớn dần theo nội dung hoặc theo thời gian:

| Nơi | Hỏng khi | Hậu quả |
|---|---|---|
| `getItemCountByLevel` | >1000 câu | **đang hỏng** — ẩn mất cấp độ đã có nội dung |
| `getUnseenItems` (tập "đã gặp") | >1000 câu đã học | **dạy lại câu cũ như câu mới** |
| `getEnrollmentStats` (thẻ) | >1000 thẻ | "đã thuộc vững" đếm thiếu |
| `getEnrollmentStats` (nhật ký) | >1000 lượt ôn | độ chính xác tính trên 1000 lượt đầu |
| `listLearnedItems` | >1000 câu đã học | danh sách từ mất phần đuôi |
| `getStudiedLevels` | >1000 câu đã học | bộ lọc cấp độ thiếu |
| `getTodaySession` (thẻ đến hạn) | >1000 thẻ đến hạn | truy vấn hỏng, URL quá dài |

**Quyết định.** Hai cách, chọn theo mục đích:

1. **Chỉ cần con số** → `select(col, { count: 'exact', head: true })`. Postgres
   đếm, không dòng nào truyền về. Dùng cho đếm theo cấp độ và tổng thẻ đến hạn.
2. **Thật sự cần mọi dòng** → `fetchAllRows()` trong `src/lib/data/paginate.ts`,
   lặp `range()` cho tới khi gặp trang không đầy.

Phiên học đổi sang cách 1 + `limit`: chỉ lấy 120 thẻ nó dùng được, còn số tồn
đọng lấy từ `count`. `buildSession` vì vậy nhận thêm `totalDueCards`.

**Vì sao không ai phát hiện sớm hơn.** Trần 1000 không sinh lỗi — nó trả về một
câu trả lời **trông hoàn toàn hợp lệ**. Suốt thời gian khóa học có 600 câu, mọi
truy vấn này đều đúng; dữ liệu vượt ngưỡng mới làm chúng sai, mà lúc sai thì
không có dấu hiệu nào ngoài những con số hơi thấp. PGlite trong test không có
trần này, nên không test nào chạy trên PGlite có thể lộ ra.

**Nguyên tắc rút ra.** Mọi truy vấn Supabase có kết quả **lớn dần** — theo nội
dung, theo tiến độ người học, hay theo thời gian — phải đi qua `count` hoặc
`fetchAllRows`. `.select()` trần chỉ dùng cho tập có chặn trên rõ ràng (kế hoạch
ngày ≤ 105 dòng, `.in()` đã chia khối, `.limit()` tường minh).

---

### D-043 · Thêm dòng VOCAB bằng cách sửa XML, không dùng openpyxl

**Bối cảnh.** Người dùng yêu cầu điền chú thích từ vựng cho `S0935`, `S1761`,
`S1771`. Cách hiển nhiên là mở file bằng openpyxl, thêm dòng, lưu lại.

**Vì sao không làm vậy.** Kiểm tra trước khi ghi cho thấy workbook chứa **14.593
công thức, 2 biểu đồ và 4 drawing**. openpyxl **không giữ được biểu đồ** khi lưu:
thao tác "thêm ba dòng" sẽ âm thầm xoá mất phần DASHBOARD trực quan của người
dùng. Với file do người dùng tạo ra và vẫn đang dùng, đó là cái giá không được
phép trả.

**Quyết định.** Sửa trực tiếp XML bên trong file zip `.xlsx`: chèn ba `<row>` vào
`sheet5.xml`, thêm đúng **một** chuỗi mới vào `sharedStrings.xml`, nới
`dimension`, `autoFilter` và dải `COUNTIF`. Mọi phần khác của zip được ghi lại
nguyên vẹn.

**Kiểm chứng.** So sánh với bản sao lưu: **0 ô cũ thay đổi**, không thành phần
nào trong zip bị mất hay thêm, số công thức tăng đúng +6 (2 công thức × 3 dòng).

**Nghĩa từ đâu ra.** Không có chữ nào do tự nghĩ: `mong chờ` lấy từ chính dòng
VOCAB sẵn có của người dùng tại `S0596`; `quan tâm đến` lấy từ chính bản dịch của
họ cho câu `S0935` — "Bạn **quan tâm đến** cái gì?".

**Hệ quả.** 2.206 liên kết từ vựng, 1.910 từ riêng biệt, và `xlsx:convert` lần
đầu báo "✓ Không phát hiện vấn đề nào trong dữ liệu nguồn."

---

### D-044 · Câu người học tự thêm là dòng `items` có chủ sở hữu, không phải bảng riêng

**Bối cảnh.** Người học muốn thêm câu tiếng Đức gặp bên ngoài vào lộ trình riêng,
và muốn thống kê tính cả những câu đó.

**Lựa chọn đã cân nhắc.** Một bảng `user_items` riêng là cách tách bạch nhất,
nhưng `card_states.item_id` có khoá ngoại tới `items.id`, nên sẽ cần bảng thẻ thứ
hai, rồi FSRS thứ hai, rồi mọi truy vấn thống kê nhân đôi.

**Quyết định.** Câu của người học là **dòng `items` bình thường**, phân biệt bằng
cột `owner_id` mới (`null` = nội dung đã import). Nhờ vậy FSRS, `buildSession`,
danh sách từ và dashboard dùng lại nguyên vẹn, không chỗ nào cần biết khái niệm
"câu riêng".

**Hệ quả kéo theo, cả ba đều bắt buộc (migration 0006).**

1. **Quyền riêng tư.** Policy cũ của `items` là `using (true)` — mọi người đăng
   nhập đọc mọi dòng, vì trước đó mọi dòng đều là nội dung công khai. Giữ nguyên
   thì câu riêng của người này sẽ hiện ra với người khác. Đổi thành
   `owner_id is null or owner_id = auth.uid()`, kèm policy ghi ghim
   `owner_id = auth.uid()` ở cả `using` và `with check` — thiếu `with check` thì
   người học có thể chuyển câu của mình sang chủ khác.
2. **Tính duy nhất theo chủ sở hữu.** `unique (course_id, order_index)` đúng cho
   nội dung đã import nhưng sai cho sổ tay: người thứ hai cũng bắt đầu từ 1. Tách
   thành **4 partial unique index** — nội dung import giữ y nguyên đảm bảo cũ,
   mỗi người có dãy số riêng. Dùng `unique (course_id, owner_id, order_index)`
   thì **không** được: Postgres coi `null` là khác nhau, nên hai dòng import có
   thể trùng `order_index`.
3. **Grant.** Migration 0003 cố ý chỉ cho `select` trên bảng nội dung. Policy ghi
   mà không có grant thì Postgres từ chối trước khi xét policy
   ("permission denied for table items") — test RLS đã bắt được đúng lỗi này.

**Giá phải trả, phát hiện nhờ test.** Postgres **không thể** dùng partial index
làm đích `on conflict`. `content:import` upsert theo `(course_id, stable_key)`,
nên sau migration nó sẽ chết. Khắc phục: nêu rõ vị từ —
`on conflict (course_id, stable_key) where owner_id is null` — đó là cú pháp
suy luận partial index. Nếu chạy migration trước khi chạy test thì import đã
hỏng trên database thật.

---

### D-045 · Sổ tay là enrollment không có kế hoạch, thống kê thì gộp

**Bối cảnh.** Hai yêu cầu của người học kéo về hai phía: sổ tay **học song song**
(không xê dịch mốc 90 ngày), nhưng thống kê **gộp chung** với khóa chính.

**Quyết định.** Tách ở chỗ xếp lịch, gộp ở chỗ báo cáo.

- Sổ tay là một enrollment riêng trên course `de-personal`, nên hàng đợi và lịch
  FSRS của nó độc lập, và `totalItems` của khóa chính không đổi khi thêm câu —
  nguyên tắc #7 (planner không tự quyết) được giữ nguyên.
- Sổ tay **không chạy planner**. Câu đến khi người học gặp, nên không có tổng số
  để chia và không có ngày đích để trượt; hỏi planner là bịa ra cả hai.
  `getTodaySession` rẽ nhánh theo `enrollment.kind`. Các cột ngày và `new_per_day`
  của dòng enrollment đó chỉ để thoả check constraint, không ai đọc.
- Trần `MAX_NEW_PER_DAY` vẫn áp dụng, **dùng lại hằng số cũ** chứ không thêm số
  mới (nguyên tắc #3).
- `getEnrollmentStats` nhận **danh sách** enrollment thay vì một id. `daily_plans`
  có một dòng mỗi enrollment mỗi ngày, nên một ngày học cả hai sẽ xuất hiện hai
  lần; gộp theo ngày bằng `mergeActivityByDate()` đặt trong `src/core/stats/` để
  test được mà không cần database.

**`enrollment.kind` đọc từ `courses.kind`, không lưu lại.** Hai nơi lưu cùng một
sự thật thì sẽ có ngày lệch nhau.

**Trình độ.** Sổ tay dùng framework riêng `PERSONAL`, không phải một bậc CEFR.
Câu gặp ngoài đời chưa ai xếp loại; gán A1 hay B1 thay người học là bịa dữ liệu,
và còn đưa câu đó vào tầm với của planner.

**Reset lộ trình không xoá sổ tay.** `item_flags` đã được giữ lại vì "đó là chữ
người học tự viết" (D-039); câu họ tự soạn càng đúng lý đó hơn. Sổ tay là
enrollment khác nên cascade không với tới, và hộp thoại xác nhận nói rõ điều đó.

---

### D-046 · Khóa sổ tay do `content:import` tạo, không chỉ do migration

**Bối cảnh.** Migration 0006 tạo course `de-personal` bằng cách copy
`field_schema` từ `de-a1-b2`, để câu người học tự thêm hiện đúng như câu hệ thống
và không bao giờ lệch khỏi nó.

**Vấn đề.** Trên môi trường mới, migration chạy **trước** khi có nội dung nào, nên
không có gì để copy: `de-personal` sẽ không được tạo và sổ tay không dùng được.
Trên database hiện tại thì không thấy, vì `de-a1-b2` đã có sẵn.

**Quyết định.** `importCourse()` cũng upsert khóa sổ tay cho cùng ngôn ngữ. Import
chạy bằng service role nên qua được RLS, và nó vốn đã giữ `field_schema` trong
tay. Thứ tự triển khai không còn quan trọng, và chạy lại import sẽ tự chữa.

Migration vẫn giữ phần insert của nó: nó vô hại ở nơi khác và giúp database đang
chạy có ngay khóa sổ tay mà không phải import lại.

**Chỉ yêu cầu câu + nghĩa.** Bắt nhập IPA ngay sẽ chặn đúng khoảnh khắc duy nhất
người học thực sự chịu ghi câu lại. `study-card.tsx` vốn đã kiểm tra sự tồn tại
của từng trường tuỳ chọn, nên câu chỉ có text + nghĩa hiển thị gọn gàng chứ không
để lại tiêu đề trống. Trường rỗng **không** được lưu thành chuỗi rỗng.

**Lỗi thứ tự `.min(1).trim()`.** Zod chạy check theo thứ tự khai báo, nên
`.min(1)` trước `.trim()` cho một chuỗi toàn khoảng trắng đi qua rồi mới cắt thành
rỗng. Đã đảo lại thành `.trim().min(1)` ở cả `notebook.ts` và
`glossaryEntrySchema`/`topic` trong `schema.ts` — chỗ sau là lỗi có sẵn, giờ người
học chạm tới được vì form sổ tay dùng chung schema đó.
