# Đặc tả Planner

> **Trạng thái:** đã triển khai ở Phase 2.
> Code: `src/core/planner/`. Test: `tests/unit/planner.test.ts` (49 ca) và
> `tests/unit/rebalance.test.ts` (21 ca), bám sát bảng edge case ở mục 5.

Planner là hàm thuần trong `src/core/planner/`. Không I/O, không ngày giờ ngầm
định — thời điểm "hôm nay" luôn được truyền vào, để test tái lập được.

---

## 1. Đầu vào

```ts
interface PlanInput {
  totalItems: number;        // số mục trong khoảng [trình độ hiện tại → mục tiêu]
  startDate: CalendarDate;   // ngày theo lịch của người học, không phải khoảnh khắc UTC
  targetDate: CalendarDate;
  restWeekdays: number[];    // ISO: 1 = Thứ Hai ... 7 = Chủ Nhật. [] = học mọi ngày
  maxNewPerDay?: number;     // người học tự hạ xuống, không bao giờ vượt MAX_NEW_PER_DAY
  timezone: string;          // IANA, ví dụ 'Asia/Ho_Chi_Minh'
}
```

Hằng số lấy từ `src/config/app.config.ts`, không viết lại ở đâu khác:
`BENCHMARK_NEW_PER_DAY = 20` · `MAX_NEW_PER_DAY = 20` · `MIN_NEW_PER_DAY = 1` ·
`BUFFER_DAYS_RANGE = [10, 15]` · `BUFFER_DAYS_DIVISOR = 6`.

---

## 2. Thuật toán

### Bước 1 — Số ngày học thực tế

```
studyDays = số ngày trong [startDate, targetDate] mà weekday ∉ restWeekdays
```

Tính bao gồm cả hai đầu. `startDate === targetDate` → `studyDays` là 0 hoặc 1.

### Bước 2 — Số ngày tối thiểu cần có

```
ceiling   = min(maxNewPerDay ?? MAX_NEW_PER_DAY, MAX_NEW_PER_DAY)
minDays   = ceil(totalItems / ceiling)
```

Với benchmark: `ceil(1800 / 20) = 90` ✅ · với dữ liệu hiện có: `ceil(600 / 20) = 30`.

### Bước 3 — Chặn nếu không khả thi

```
nếu studyDays < minDays  →  PlanBlocked
```

**Không nén thời gian, không vượt trần.** Trả về `earliestFeasibleTarget`: ngày
học thứ `minDays` tính từ `startDate` (bỏ qua ngày nghỉ), kèm lời giải thích
tiếng Việt nêu rõ số ngày học hiện có, số ngày tối thiểu và trần mỗi ngày.

### Bước 4 — Số mục mỗi ngày

```
newPerDay = clamp(ceil(totalItems / studyDays), MIN_NEW_PER_DAY, ceiling)
```

Dùng `ceil` để tổng số mục luôn được phủ hết trong `studyDays`; ngày cuối thường
nhẹ hơn các ngày khác.

### Bước 5 — Ngày đệm

```
totalPlanDays = số ngày theo lịch giữa startDate và targetDate (kể cả ngày nghỉ)
bufferDays    = clamp(ceil(totalPlanDays / BUFFER_DAYS_DIVISOR), 10, 15)
```

90 ngày → 15 (khớp file Excel gốc) · 60 ngày → 10 · 30 ngày → 10.

### Bước 6 — Lịch từng ngày

Sinh `DailyPlan[]`: với mỗi ngày học, phân `newPerDay` mục, ngày cuối nhận phần
còn lại. Ngày nghỉ có `isRestDay: true` và `plannedNew: 0`.

### Bước 7 — Dự báo

```
forecastDate = ngày học mà tổng lũy kế đạt totalItems
```

Hiển thị: *"Với tốc độ hiện tại bạn sẽ đạt B2 vào ngày X."*

---

## 3. Đầu ra

```ts
type PlanResult =
  | { ok: true;  plan: Plan }
  | { ok: false; blocked: PlanBlocked };

interface Plan {
  newPerDay: number;
  studyDays: number;
  minDays: number;
  bufferDays: number;
  forecastDate: CalendarDate;
  /** Hạn chót có đệm = targetDate + bufferDays */
  hardDeadline: CalendarDate;
  days: DailyPlan[];
}

interface PlanBlocked {
  reason: 'timeframe-too-short' | 'no-items' | 'no-study-days';
  studyDays: number;
  minDays: number;
  earliestFeasibleTarget: CalendarDate;
  /** Thông điệp tiếng Việt đã sẵn sàng hiển thị */
  message: string;
}
```

---

## 4. Rebalance khi bỏ lỡ ngày

Khi lũy kế thực tế tụt sau kế hoạch, planner đề xuất **ba lựa chọn** và
**không bao giờ tự đổi**:

| Lựa chọn | Cơ chế | Khi nào khả dụng |
|---|---|---|
| **Dồn nhẹ** | Tăng `newPerDay` cho các ngày còn lại, vẫn ≤ `MAX_NEW_PER_DAY` | Khi phần dồn không vượt trần |
| **Dùng ngày đệm** | Giữ `newPerDay`, lấn vào `bufferDays` | Khi số ngày nợ ≤ `bufferDays` còn lại |
| **Dời mục tiêu** | Giữ `newPerDay`, đẩy `targetDate` ra | Luôn khả dụng |

Mỗi lựa chọn kèm hệ quả cụ thể: *"20 → 23 mục/ngày"* (bị chặn vì vượt trần),
*"dùng 4 trong 15 ngày đệm, còn lại 11"*, *"mục tiêu dời từ 02/01 sang 06/01"*.

---

## 5. Edge case bắt buộc có test

| Tình huống | Hành vi mong đợi |
|---|---|
| `totalItems = 0` | `PlanBlocked` với `reason: 'no-items'` |
| `totalItems` chia không hết cho `studyDays` | Ngày cuối nhẹ hơn; tổng khớp chính xác |
| `startDate === targetDate` | 1 ngày học; chặn nếu `totalItems > ceiling` |
| `targetDate < startDate` | `PlanBlocked` |
| `startDate` trong quá khứ | Vẫn tính được; `daysElapsed` âm bị kẹp về 0 |
| `restWeekdays` = cả 7 ngày | `PlanBlocked` với `reason: 'no-study-days'` |
| `restWeekdays = [6, 7]` trên khung 90 ngày | `studyDays ≈ 64`; `newPerDay` tăng tương ứng |
| Qua mốc DST | Số ngày không đổi — dùng ngày theo lịch, không dùng chênh lệch mili giây |
| Múi giờ lệch ngày | "Hôm nay" theo `timezone` của người học, không theo server |
| Đổi mục tiêu giữa chừng | Tính lại từ số mục **còn lại**, không phải từ `totalItems` |
| `totalItems = 1800`, 90 ngày, không nghỉ | **`newPerDay = 20`** — xác nhận benchmark ✅ |
| `totalItems = 1800`, 60 ngày | `PlanBlocked`, `earliestFeasibleTarget` = ngày thứ 90 |
| `totalItems = 600`, 90 ngày | `newPerDay = 7` (dữ liệu thật hiện có) |

---

## 6. Vì sao trần 20 là cứng

Trần tồn tại để hệ thống **không nhận một lời hứa mà người học không giữ được**.
Nhận khung thời gian quá ngắn rồi để họ bỏ cuộc giữa chừng là kết quả tệ hơn
việc nói trước ngày sớm nhất khả thi.

Con số 20 đến từ dữ liệu gốc (1.800 câu / 90 ngày) và từ khối lượng ôn tập mà
FSRS sinh ra: ở nhịp 20 mục mới/ngày, hàng đợi ôn ổn định quanh 40–60 thẻ/ngày
sau tuần thứ ba. Nâng trần sẽ khiến phần ôn tập phình ra trước phần học mới.
