# Triển khai lên Vercel + Supabase

Hướng dẫn từng bước đưa HyperLing lên production. Làm theo đúng thứ tự: Supabase
trước, Vercel sau, vì Vercel cần khóa của Supabase.

---

## Phần 1 — Supabase

### 1.1 Tạo project

1. https://supabase.com/dashboard → **New project**
2. Tên bất kỳ, region **Singapore** (gần Việt Nam nhất)
3. Đặt **Database Password** và **lưu lại ngay** — Supabase không hiện lại lần hai
4. Đợi khoảng 2 phút

### 1.2 Chạy migration

Vào **SQL Editor**, chạy lần lượt **đúng thứ tự**, mỗi file một lần:

| Thứ tự | File | Tạo ra |
|---|---|---|
| 1 | `supabase/migrations/0001_content_schema.sql` | 6 bảng nội dung + seed ngôn ngữ, cấp độ |
| 2 | `supabase/migrations/0002_user_schema.sql` | 7 bảng người dùng + trigger tạo profile |
| 3 | `supabase/migrations/0003_rls_policies.sql` | RLS cho toàn bộ 13 bảng |
| 4 | `supabase/migrations/0004_add_french.sql` | Thêm tiếng Pháp vào bảng `languages` |
| 5 | `supabase/migrations/0005_backfill_profiles.sql` | Bù `profiles` cho tài khoản đăng ký trước khi 0002 chạy |
| 6 | `supabase/migrations/0006_personal_items.sql` | Sổ tay riêng: `items.owner_id`, partial unique index, RLS + grant ghi, khóa `de-personal` |

Hoặc dùng Supabase CLI nếu đã cài:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

### 1.3 Kiểm tra RLS đã bật

Vào **Table Editor**, mỗi bảng phải có nhãn **RLS enabled**. Hoặc chạy trong SQL Editor:

```sql
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and rowsecurity = false;
```

Kết quả phải **rỗng**. Nếu có bảng nào hiện ra, migration 0003 chưa chạy xong.

### 1.4 Bật đăng nhập email

**Authentication → Sign In / Providers → Email**
- Bật *Enable Email provider*
- Bật *Confirm email*
- **Tắt** *Enable password-based auth* — hệ thống này chỉ dùng magic link

**Authentication → URL Configuration**
- *Site URL*: `https://<tên-dự-án>.vercel.app`
- *Redirect URLs*: thêm cả hai dòng
  ```
  https://<tên-dự-án>.vercel.app/auth/callback
  http://localhost:3000/auth/callback
  ```

> Thiếu bước Redirect URLs là lỗi phổ biến nhất: đường dẫn trong email sẽ báo
> "requested path is invalid".

### 1.4b Mẫu email (khuyến nghị đổi)

**Authentication → Emails → Magic Link**. Mẫu mặc định dùng `{{ .ConfirmationURL }}`,
đi qua endpoint của Supabase rồi mới quay về app — tuỳ cấu hình, nó có thể trả về
`?code=` (cần đúng trình duyệt đã yêu cầu) hoặc `#access_token=` (nằm trong fragment).

Đổi phần link trong mẫu thành:

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink">
  Đăng nhập vào HyperLing
</a>
```

Cách này **mở được ở bất kỳ thiết bị nào** — yêu cầu trên máy tính, mở mail trên
điện thoại vẫn vào được — vì nó không cần cookie từ trình duyệt đã gửi yêu cầu.

Callback của app xử lý được cả ba dạng, nên nếu bạn không đổi mẫu thì vẫn chạy;
chỉ là dạng `?code=` buộc phải mở link đúng trình duyệt đã yêu cầu.

### 1.5 Giới hạn gửi email

Supabase miễn phí giới hạn **4 email/giờ**. Đủ để thử nghiệm, không đủ cho người
dùng thật. Trước khi mở cho nhiều người, vào **Project Settings → Authentication
→ SMTP Settings** và nối một dịch vụ SMTP riêng (Resend, SendGrid, Amazon SES).

### 1.6 Import nội dung

Đặt **ba dòng** này vào `.env.local` — không cần tự ghép URI, không lo mã hoá ký
tự đặc biệt:

```
SUPABASE_PROJECT_REF=<phần trước .supabase.co trong Project URL>
SUPABASE_DB_PASSWORD=<mật khẩu database, dán thô>
SUPABASE_REGION=ap-southeast-1
```

> Mật khẩu database thường chứa `@ : / ?` — những ký tự mang nghĩa trong URI. Dán
> thô vào đây thì script tự encode. Nếu không nhớ mật khẩu, **Project Settings →
> Database → Reset database password**; việc này không ảnh hưởng đăng nhập, vì app
> dùng anon key chứ không dùng mật khẩu này.

Rồi chạy:

```bash
pnpm content:validate
pnpm content:import
```

Kiểm tra trong Table Editor: bảng `items` phải có **620 dòng** (600 tiếng Đức +
20 tiếng Pháp), `courses` có **2 dòng**.

Chạy `pnpm content:import` lần hai phải báo `Mục thêm mới : 0` — đó là bằng chứng
import idempotent, tiến độ người học không bị ảnh hưởng.

#### Nếu import báo lỗi

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `relation "courses" does not exist` | Migration ở mục 1.2 chưa chạy | Chạy 0001→0006 trong SQL Editor |
| `getaddrinfo ENOTFOUND db.<ref>.supabase.co` | Host trực tiếp **chỉ có IPv6** | Dùng ba biến ở trên — script tự chọn Session pooler |
| `password authentication failed` | Mật khẩu còn nguyên dấu `[...]` placeholder | Dán mật khẩu thật, hoặc reset như trên |
| `SASL_SIGNATURE_MISMATCH` | Mật khẩu có ký tự đặc biệt chưa encode trong `DATABASE_URL` tự dán | Bỏ `DATABASE_URL`, dùng ba biến ở trên |
| Treo ở `Đang import ...` không báo gì | Đã sửa (D-036). Nếu còn gặp, `statement_timeout` sẽ bắt sau 60s | Cập nhật lên commit mới nhất |

---

## Phần 2 — Vercel

> **Đã nối rồi.** Dự án này hiện đã gắn với Vercel: production chạy ở
> https://hyperling.vercel.app và mỗi PR tự sinh một preview deployment.
> Nếu vậy, bỏ qua 2.1 và 2.3, chỉ cần làm **2.2 (biến môi trường)**.

### 2.1 Nối repository

1. https://vercel.com/new → chọn repo `hyperling`
2. Framework Preset: **Next.js** (tự nhận)
3. Root Directory: để trống
4. Build Command và Output: **để mặc định** — Vercel tự nhận Next.js 16

### 2.2 Biến môi trường

Thêm ở bước import, hoặc **Settings → Environment Variables**:

| Tên | Giá trị | Môi trường |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL từ Supabase → Settings → API | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/public key | Production, Preview, Development |

**Không thêm `DATABASE_URL` vào Vercel.** Nó chỉ dùng để import nội dung từ máy
bạn, và nó mang quyền service role — ứng dụng chạy không cần nó, và không nên có nó.

`NEXT_PUBLIC_SITE_URL` cũng không cần: Vercel tự cấp `VERCEL_PROJECT_PRODUCTION_URL`
và code đã đọc biến đó.

### 2.3 Deploy

Bấm **Deploy**. Build khoảng 1–2 phút.

### 2.4 Cập nhật lại URL trong Supabase

Sau khi có domain thật, quay lại **Supabase → Authentication → URL Configuration**
và thay `<tên-dự-án>.vercel.app` bằng domain thật — với dự án này là
`https://hyperling.vercel.app`.

### 2.5 Kiểm tra đã cấu hình xong chưa

```bash
curl -s https://hyperling.vercel.app/dang-nhap | grep -c "Chưa cấu hình Supabase"
```

Kết quả `0` nghĩa là xong. Kết quả `1` nghĩa là Vercel chưa thấy biến môi trường —
nhớ **redeploy** sau khi thêm biến, vì `NEXT_PUBLIC_*` được nhúng lúc build chứ
không đọc lúc chạy.

---

## Khi đăng nhập không vào được

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `localhost refused to connect` | Link trỏ về `localhost:3000` nhưng dev server không chạy | Chạy `pnpm dev`, hoặc đổi *Site URL* trong Supabase sang domain thật |
| Trang đăng nhập báo *"Chưa cấu hình Supabase"* | Thiếu `.env.local` (local) hoặc thiếu biến môi trường trên Vercel | Mục 2.2. Trên Vercel nhớ **redeploy** sau khi thêm |
| Quay về trang đăng nhập, báo *"đã hết hạn hoặc đã được dùng"* | Link dùng quá 1 lần, hoặc quá 1 giờ | Yêu cầu đường dẫn mới |
| Báo *"cần mở trong CÙNG trình duyệt"* | Dạng `?code=` (PKCE) cần cookie từ trình duyệt đã yêu cầu | Mở mail đúng máy đã yêu cầu, hoặc đổi mẫu email theo 1.4b |
| `requested path is invalid` | Thiếu Redirect URLs | Mục 1.4 |
| Không nhận được email nào | Vượt hạn mức 4 email/giờ của bản miễn phí | Đợi, hoặc cấu hình SMTP riêng (mục 1.5) |
| Đăng nhập được nhưng onboarding bước 1 không có ngôn ngữ nào | Database chưa có nội dung | Mục 1.6 |
| Đăng nhập được nhưng app báo thiếu tài khoản | Đăng ký trước khi migration 0002 chạy, nên không có `profiles` | Chạy migration 0005 |

---

## Checklist trước khi mở cho người dùng thật

### Bảo mật

- [ ] Không bảng nào trong `public` còn `rowsecurity = false` (truy vấn ở mục 1.3)
- [ ] `.env.local` **không** có trong git — kiểm tra bằng `git ls-files | grep env`
      (chỉ được thấy `.env.example`)
- [ ] `DATABASE_URL` **không** có trong biến môi trường của Vercel
- [ ] Đăng nhập bằng hai tài khoản khác nhau, xác nhận không ai thấy dữ liệu của ai
- [ ] Service role key chưa từng bị dán vào đâu ngoài `.env.local` trên máy bạn

### Chức năng

- [ ] Đăng nhập bằng email thật, nhận được đường dẫn và vào được
- [ ] Tạo được lộ trình qua 7 bước onboarding
- [ ] Khung thời gian quá ngắn bị chặn kèm gợi ý ngày khả thi
- [ ] Hoàn thành trọn một phiên học, tiến độ được lưu sau khi tải lại trang
- [ ] Phát âm hoạt động, hoặc nút bị ẩn gọn gàng nếu trình duyệt không có giọng
- [ ] Đổi ngôn ngữ giao diện sang English và quay lại

### Nội dung

- [ ] `pnpm content:validate` báo 0 lỗi
- [ ] `items` có đúng số dòng mong đợi
- [ ] Chạy `pnpm content:import` lần hai không sinh thêm dòng nào

### Hiệu năng và tiếp cận

- [ ] Lighthouse cả bốn hạng mục ≥ 90 (xem mục dưới)
- [ ] Trang hiển thị tốt ở 375px không tràn ngang
- [ ] Đi hết trang bằng phím Tab, luôn nhìn thấy viền focus

### Vận hành

- [ ] CI xanh trên nhánh `main`
- [ ] SMTP riêng đã cấu hình nếu có nhiều hơn vài người dùng
- [ ] Đã bật sao lưu database (Supabase Pro) nếu dữ liệu học tập là quan trọng

---

## Đo Lighthouse

Lighthouse phải chạy trên **production build**, không phải `pnpm dev`:

```bash
pnpm build && pnpm start
```

Rồi ở cửa sổ khác:

```bash
npx lighthouse@12 http://localhost:3000/ --view --only-categories=performance,accessibility,best-practices,seo
```

> Lighthouse 13 cần Node ≥ 22.19. Trên Node 21 hãy ghim `lighthouse@12` như trên.

Kết quả đo được của bản hiện tại (production build, localhost, throttling mặc định):

| Trang | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| `/` | 92 | 100 | 100 | 100 |
| `/dang-nhap` | 95 | 100 | 100 | 100 |

Trên Vercel, điểm Performance thường **cao hơn** nhờ CDN và nén Brotli.

---

## Sau khi deploy

### Thêm nội dung mới

Sửa file trong `content/`, rồi từ máy bạn:

```bash
pnpm content:validate && pnpm content:import
```

Không cần deploy lại: nội dung nằm trong database, không nằm trong bundle.

### Thêm ngôn ngữ mới

Xem [`ADDING_A_LANGUAGE.md`](ADDING_A_LANGUAGE.md). Cần một migration nhỏ thêm
dòng vào bảng `languages`, chạy trong SQL Editor của Supabase.

### Khi nâng cấp schema

Viết file migration mới trong `supabase/migrations/`, đánh số tiếp theo, chạy
trong SQL Editor. Không sửa file migration cũ đã chạy trên production.

---

## Sổ tay riêng của người học (migration 0006)

Sau khi chạy `0006_personal_items.sql`, **chạy lại `pnpm content:import de-a1-b2`**
một lần. Migration tạo khóa `de-personal` bằng cách copy `field_schema` của
`de-a1-b2`, nhưng trên môi trường mới migration chạy trước khi có nội dung, nên
không có gì để copy; import sẽ tự tạo và tự chữa (D-046).

Kiểm tra bằng SQL Editor:

```sql
-- Phải có đúng một dòng, kind = 'notebook', field_schema giống de-a1-b2.
select id, kind, level_framework, levels from public.courses where id = 'de-personal';

-- Phải có 4 index (2 cho nội dung import, 2 cho sổ tay theo chủ sở hữu).
select indexname from pg_indexes
where tablename = 'items' and indexname like '%unique%';

-- Phải thấy insert/update/delete cho authenticated.
select grantee, privilege_type from information_schema.role_table_grants
where table_name = 'items' and grantee = 'authenticated';
```

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `permission denied for table items` khi thêm câu | Phần grant ở mục 5 của 0006 chưa chạy | Chạy lại đoạn `grant` cuối file 0006 |
| `no unique or exclusion constraint matching the ON CONFLICT specification` khi import | Đang chạy bản `import.ts` cũ với schema mới | Deploy lại code: upsert phải có `where owner_id is null` |
| Trang `/so-tay` báo cần bắt đầu khóa học | Chưa có enrollment `kind = 'curriculum'` | Hoàn tất `/bat-dau` trước |
| Thêm câu được nhưng không thấy trong phiên học | Chưa chạy lại import nên thiếu khóa `de-personal` | `pnpm content:import de-a1-b2` |
