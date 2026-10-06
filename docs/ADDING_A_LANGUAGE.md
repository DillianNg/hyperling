# Thêm ngôn ngữ hoặc cấp độ mới

Tài liệu này mô tả cách thêm một khóa học mới (tiếng Pháp, tiếng Nhật, hoặc C1/C2
cho tiếng Đức) **mà không sửa một dòng code lõi nào**.

Nguyên tắc: *nội dung là dữ liệu, code là engine*. Engine không biết nó đang dạy
ngôn ngữ nào; mọi đặc thù khai báo trong `course.json`.

---

## Tình huống 1 — Thêm cấp độ vào khóa đã có

Ví dụ: bổ sung thêm câu vào một khóa đã có, như khóa tiếng Đức `de-a1-b2`.

Khóa đã khai báo sẵn `levels: ["A1","A2","B1","B2"]`, nên **không cần sửa `course.json`**.
Chỉ cần đổ nội dung vào.

### Bước 1 — Chuẩn bị dữ liệu dạng bảng

Dán các dòng từ Excel ra một file `.tsv` (hoặc `.csv`). Tên cột nhận cả tiếng Việt
lẫn key canonical:

| Cột trong Excel | Key canonical | Bắt buộc |
|---|---|---|
| `ID` | `stableKey` | ✅ |
| `Câu tiếng Đức` | `text` | ✅ |
| `Nghĩa tiếng Việt` | `meaning` | ✅ |
| `Cấp độ` | `level` | nên có |
| `Chủ đề` | `topic` | nên có |
| `Loại câu` | `sentenceType` | không |
| `Điểm ngữ pháp` | `grammarNote` | không |
| `Phiên âm IPA (chuẩn Duden)`, `Phiên âm (đọc theo tiếng Việt)`, `IPA` | `transliteration` | không |
| `Từ mới trong câu` | `newWords` | không |

Cột `Từ mới trong câu` theo đúng định dạng file gốc:

```
der Morgen = buổi sáng; gut = tốt
```

Giống danh từ được suy ra từ mạo từ đứng đầu — nhưng **danh sách mạo từ lấy từ
`course.json`**, không hardcode trong code. Khóa tiếng Đức khai báo `der/die/das`,
khóa tiếng Pháp khai báo `le/la/l'/les`, và cùng một parser xử lý cả hai. Mục
thiếu dấu `=` sẽ bị báo lỗi kèm số dòng, **không bị đoán bừa**.

Dòng không có câu sẽ bị bỏ qua và đếm lại — không bao giờ bị điền nội dung tự sinh.

### Bước 2 — Chuyển sang JSON

```bash
pnpm content:ingest -- duong-dan/den/file.tsv --course de-a1-b2 --out items.b1-b2.json
```

Kết quả ghi vào `content/de/de-a1-b2/items.b1-b2.json`. File `items.json` cũ
giữ nguyên — một khóa có thể có nhiều file `items*.json`.

### Bước 3 — Kiểm tra

```bash
pnpm content:validate de-a1-b2
```

Script báo lỗi bằng tiếng Việt kèm `stableKey` của mục sai: thiếu trường bắt buộc,
trùng ID (kể cả giữa các file khác nhau), giá trị ngoài danh sách cho phép, thứ tự
cấp độ bị đảo, nội dung trùng lặp. **Exit code 1 nếu có lỗi**, nên CI chặn được.

### Bước 4 — Import

```bash
pnpm content:import de-a1-b2
```

Cần `DATABASE_URL` trong `.env.local` (xem `.env.example`). Chạy lại nhiều lần an
toàn: upsert theo `(course_id, stable_key)` nên `items.id` không đổi và tiến độ
học của mọi người giữ nguyên.

Sau bước này, B1 và B2 **tự động mở** trong onboarding, vì onboarding chỉ hiển thị
cấp độ đã có đủ item trong database.

---

## Tình huống 2 — Thêm ngôn ngữ hoàn toàn mới

Ví dụ: tiếng Pháp, A1–B2, nghĩa bằng tiếng Việt.

> **Đã làm thật.** Khóa `fr-a1-b2` trong repo này (20 câu A1) được tạo đúng theo
> bốn bước dưới đây, không sửa một dòng code lõi nào. Quá trình đó lộ ra một chỗ
> engine còn hardcode tiếng Đức — mạo từ `der/die/das` nằm trong parser — và đã
> được sửa thành đọc từ `course.json`. Đây chính là giá trị của việc thêm ngôn
> ngữ thứ hai: nó chứng minh nguyên tắc, hoặc phát hiện chỗ nguyên tắc bị vi phạm.

### Bước 1 — Sinh khung khóa

```bash
pnpm content:new -- --lang fr --level A1-B2
```

Tạo ra `content/fr/fr-a1-b2/` với `course.json` và `items.json` mẫu.

### Bước 2 — Khai báo đặc thù ngôn ngữ trong `course.json`

Đây là bước quan trọng nhất, và là **toàn bộ** nơi ngôn ngữ mới được "dạy" cho engine.

```jsonc
{
  "fields": [
    { "key": "text",            "role": "prompt", "required": true },
    { "key": "meaning",         "role": "answer", "required": true },
    { "key": "transliteration", "role": "hint",   "display": "toggle" },
    { "key": "grammarNote",     "role": "note" }
  ],
  "glossaryFields": [
    {
      "key": "gender",
      "role": "badge",
      "colorCoded": true,       // mỗi giá trị một màu, như der/die/das
      "enum": ["le", "la"]
    }
  ],
  "tts": { "lang": "fr-FR", "rate": 0.9 }
}
```

Các `role` dùng được:

| role | Ý nghĩa | Ví dụ |
|---|---|---|
| `prompt` | Thứ người học phải nhớ/nhận ra | câu tiếng Pháp |
| `answer` | Nghĩa ở ngôn ngữ nguồn | nghĩa tiếng Việt |
| `hint` | Hỗ trợ tùy chọn | phiên âm, romaji |
| `note` | Giải thích | điểm ngữ pháp |
| `tag` | Phân loại ngắn | loại câu |
| `badge` | Nhãn nhỏ có màu | giống danh từ, thanh điệu |
| `audio` | Khóa/URL file âm thanh | — |

`display: "toggle"` cho phép người học ẩn trường đó. `enum` khóa tập giá trị và
validate sẽ từ chối giá trị lạ.

Ví dụ ngôn ngữ khác:

- **Tiếng Nhật**: thêm `glossaryFields` `kanji` (role `note`) và `romaji` (role `hint`).
- **Tiếng Trung**: thêm `pinyin` (role `hint`) và `tone` (role `badge`, `colorCoded`).
- **Tiếng Tây Ban Nha**: `gender` với `enum: ["el", "la"]`.

### Bước 3 — Thêm ngôn ngữ vào bảng `languages`

Ngôn ngữ mới cần một dòng trong bảng `languages`. Thêm một migration:

```sql
-- supabase/migrations/00NN_add_french.sql
insert into public.languages (code, name_native, name_vi, name_en, tts_lang)
values ('fr', 'Français', 'Tiếng Pháp', 'French', 'fr-FR')
on conflict (code) do nothing;
```

Đây là thay đổi **dữ liệu**, không phải logic — không có `if` nào trong code lõi
cần biết về tiếng Pháp.

### Bước 4 — Đổ nội dung, kiểm tra, import

Giống Tình huống 1:

```bash
pnpm content:ingest -- fr-sentences.tsv --course fr-a1-b2 --out items.json
pnpm content:validate fr-a1-b2
pnpm content:import   fr-a1-b2
```

---

## Những gì **không** cần đụng tới

- `src/core/` — planner, scheduler, logic phiên học
- `src/components/study/` — giao diện thẻ học
- Bất kỳ migration schema nào (ngoài dòng `insert into languages`)
- `src/config/app.config.ts`

Nếu bạn thấy mình phải sửa một trong số này để thêm ngôn ngữ, nghĩa là field
schema còn thiếu một khả năng. Hãy mở rộng `fieldSpecSchema` trong
`src/core/content/schema.ts` cho **mọi** ngôn ngữ, đừng thêm nhánh riêng cho một
ngôn ngữ cụ thể.

---

## Khi nào tăng `version` của khóa

`course.json` có `version` theo semver:

- **patch** (`1.0.1`) — sửa lỗi chính tả, sửa nghĩa
- **minor** (`1.1.0`) — thêm mục mới (ví dụ: bổ sung B1–B2)
- **major** (`2.0.0`) — đổi cấu trúc field, hoặc bỏ mục

Khi `version` tăng minor và tổng số mục thay đổi, các enrollment đang `active` sẽ
nhận gợi ý tính lại kế hoạch — dùng chung cơ chế rebalance với trường hợp bỏ lỡ ngày.

---

## Sinh lại JSON Schema cho editor

```bash
pnpm content:schema
```

Ghi `content/schema/course.schema.json` và `items.schema.json` từ định nghĩa Zod.
Thêm dòng này vào đầu file nội dung để VS Code gợi ý và báo lỗi trực tiếp:

```json
{ "$schema": "../../schema/items.schema.json", "courseId": "fr-a1-b2", ... }
```
