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

### 1.5 Giới hạn gửi email

Supabase miễn phí giới hạn **4 email/giờ**. Đủ để thử nghiệm, không đủ cho người
dùng thật. Trước khi mở cho nhiều người, vào **Project Settings → Authentication
→ SMTP Settings** và nối một dịch vụ SMTP riêng (Resend, SendGrid, Amazon SES).

### 1.6 Import nội dung

Trên máy bạn, với `DATABASE_URL` trỏ vào project vừa tạo:

```bash
pnpm content:validate
pnpm content:import
```

Kiểm tra trong Table Editor: bảng `items` phải có **620 dòng** (600 tiếng Đức +
20 tiếng Pháp), `courses` có **2 dòng**.

---

## Phần 2 — Vercel

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
và thay `<tên-dự-án>.vercel.app` bằng domain thật.

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
