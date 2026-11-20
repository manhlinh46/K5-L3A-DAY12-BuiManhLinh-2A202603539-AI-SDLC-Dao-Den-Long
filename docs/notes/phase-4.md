# Phase 4 — Ticket-04 "Bình minh: phát hành v1.0.0" · Contract v1.3

## 1. Acceptance criteria → bằng chứng

| Yêu cầu | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| Bench: lệnh, cửa sổ 1280×720, vsync off, Đêm 1 đầy đủ hiệu ứng | `node scripts/bench.js --seed 42 --duration 30 --out …` | [bench.json](../proof/phase-4/bench.json) (`notes.window` = 1280x720, DPR 1, headed) | Đạt |
| Cảnh bench: 200 Bóng Mực wander, 100 đom đóm, L1–L3 sáng fuel 100, tắt sinh/sát thương/nhặt/hao dầu/kết thúc | `tests/release.test.js` (2 test, 40 s mô phỏng: không event, fuel giữ 100, 200 con vẫn wander); ảnh | [03-bench-scene.png](../proof/phase-4/screenshots/03-bench-scene.png) | Đạt |
| Camera bay tròn r = 30, y = 15, nhìn (0,0,0), bắt đầu ở (30,15,0), ngược chiều kim đồng hồ, 15 s/vòng | Mã `draw()`: `(30·cos a, 15, 30·sin a)`, `a = 2π t / 15`, quy ước góc của Ticket-02 | `web/main.js` | Đạt (kiểm tra mã) |
| 3 s khởi động, đo đúng `--duration` rồi thoát mã 0 | `benchTick` + `bench.js` (exit 0) | frames = 18983 trong 30 s | Đạt |
| avg_fps, p1_low_fps, frame_ms_p95, load_ms, peak_mem_mb theo định nghĩa | Tính trong `scripts/bench.js` từ mảng dt từng khung | bench.json: avg **632.7**, p1 low **378.3**, p95 **2.1 ms**, load **3044 ms**, peak **531 MB** (tổng RSS cây tiến trình Chromium) | Đạt trên máy dev (máy chấm sẽ đo lại) |
| Soak: 10 Đêm, cùng tiến trình, xoay vòng 1→2→3, seed 7 + i, input ngẫu nhiên theo seed | `tests/release.test.js` chạy đúng `soak_cmd` | [soak.json](../proof/phase-4/soak.json): crashes **0**, RSS **48.5 → 52.1 MB** (1.07×, ngưỡng 1.2×) | Đạt |
| Bảng xếp hạng: tên 3–12 `[A-Za-z0-9_]` (+ tiếng Việt), lưu name/score/nights_won/achieved_at ISO+offset/seed, top 10, sắp xếp, lưu đĩa, màn hình từ menu, `--export-leaderboard` | `tests/leaderboard.test.js` (5 test: validate, thứ tự + bằng điểm, ISO offset, lưu đĩa + lệnh export, HTTP API); Playwright: thua → nhập "Mây_01" → "Hạng 1"; menu → bảng | test-output; ảnh | Đạt |
| Đổi phím mọi hành động, phát hiện trùng, khôi phục mặc định, được lưu | Playwright: gán E cho Nhảy → "⚠ Phím E đang dùng cho Tương tác"; gán J → lưu `keys.jump = KeyJ`; Khôi phục → Space | [01-settings-rebind.png](../proof/phase-4/screenshots/01-settings-rebind.png) | Đạt |
| Phụ đề / chỉ báo: Bóng Mực xuất hiện + mũi tên ở mép, gió sắp thổi, 10 s cuối, đèn fuel < 30 | Playwright: tới tick 300 → 2 phụ đề "⚠ Bóng Mực xuất hiện"; mũi tên chỉ hiện khi Bóng Mực ngoài màn hình (trong ảnh nó ở trong màn hình) | [02-caption-shade-arrow.png](../proof/phase-4/screenshots/02-caption-shade-arrow.png) | Đạt (gió / 10 s / dầu yếu: kiểm tra mã `caption(...)`) |
| Giảm chuyển động: tắt rung camera + chớp màn hình | Mã: `shake`, `flash` chỉ khi `!settings.reducedMotion` | `web/main.js` | Đạt (kiểm tra mã) |
| Cỡ chữ ≥ 18 px ở 1280×720; chữ lớn ×1.25 | Playwright đo font-size nhỏ nhất của mọi phần tử chữ đang hiện: menu 18, cài đặt 18, HUD 18 (lần đo đầu là 16 px → đã sửa) | log ở mục 3 | Đạt |
| Clone sạch, 3 lệnh, chơi được | clone sang thư mục tạm → `npm install` → `npm test` + headless + server | mục 3 | Đạt |
| README, CHANGELOG 4 phase, CREDITS, LICENSE | Tài liệu ở gốc repo | README.md, CHANGELOG.md, CREDITS.md, LICENSE | Đạt |
| Release v1.0.0 có bản chạy được | `npm run build:web` → `dao-den-long-v1.0.0-web.zip`; thử phục vụ bằng `python -m http.server`: menu + chơi + bảng xếp hạng (localStorage) chạy, không lỗi ngoài 404 `/api` dự kiến | — | Đạt ở máy dev; người dùng tự tạo Release trên GitHub |
| Contract v1.3: `bench_cmd`, `soak_cmd`, v1.0–1.2 giữ nguyên | `cli.test.js`; 27 scenario cũ vẫn PASS | proof SUMMARY | Đạt |
| Video demo < 5 phút | — | — | **Chưa làm khi gắn tag** (tác giả tự quay, đính kèm Release) |

## 2. Quyết định và giả định

| # | Chủ đề | Quyết định |
|---|---|---|
| D1 | Bench cho bản web | Puppeteer mở Chromium có cửa sổ (không headless) 1280×720, DPR 1. Vsync tắt bằng `--disable-gpu-vsync --disable-frame-rate-limit`. `load_ms` = từ `performance.timeOrigin` của tiến trình Node tới khung hình bench đầu tiên (đã gồm thời gian khởi động Chromium) |
| D2 | `peak_mem_mb` | Tổng RSS (WorkingSet trên Windows) của mọi tiến trình con Chromium + tiến trình browser, lấy mẫu mỗi 1 s trong lúc đo. Không tính tiến trình Node |
| D3 | Bóng Mực trong bench | Đúng luật wander (đi về đèn tắt gần nhất / lượn), **không chuyển chase** vì đề yêu cầu "200 Bóng Mực ở trạng thái wander" và tắt sát thương |
| D4 | Soak: cờ V8 | `--max-semi-space-size=1 --single-threaded --expose-gc`. Đo cho thấy RSS tăng một lần do JIT, vùng nhớ trẻ và các luồng nền rồi đi ngang (3 Đêm 56 MB ≈ 90 Đêm 61 MB). Đây là ổn định chứ không phải rò rỉ. Các cờ giữ RSS sát mức thật; không chạy "khởi động" trước khi đo `mem_start` (sẽ là gian lận số đo) |
| D5 | Soak: Đêm thứ i | i = 1…10, seed = 7 + i, Đêm = ((i − 1) mod 3) + 1. Mỗi 30 tick chọn hướng mới theo góc đều. Mỗi tick các nút được tung xác suất độc lập |
| D6 | Bảng xếp hạng | Lưu qua API của `server.js` vào `data/leaderboard.json` (ghi file tạm rồi đổi tên). Bằng điểm thì `achieved_at` sớm hơn đứng trên. Bản tĩnh dùng localStorage cùng luật (module chung `src/leaderboard-core.js`) |
| D7 | Phím tạm dừng | Có thể đổi (mặc định P). Esc luôn tạm dừng / thoát menu để người chơi không bị "khóa" nếu gán phím lạ |
| D8 | Phím trùng | Từ chối gán và báo "⚠ Phím X đang dùng cho Y" |

## 3. Kiểm chứng thêm

- Clone sạch: `git clone` → `npm install` → `npm test` (90/90) → headless 3 Đêm → server trả 200 cho trang, three, sim (xem log commit).
- Font: lần đo đầu là 16 px (chữ mặc định của `p`/`label`) → thêm cỡ gốc 18 px → đo lại 18 px.
- Hiệu năng trước/sau instancing (cùng máy, bench 8 s): avg 75.4 → 568.7 FPS, p1 low 3.3 → 310.2, p95 13.3 → 2.3 ms.

## 4. Nhật ký dùng AI (Phase 4)

- Lỗi / sai lầm và cách phát hiện:
  1. **Bench lần đầu chỉ 75 FPS, p1 low 3.3** dù GPU mạnh: agent đã vẽ mỗi Bóng Mực bằng 5 mesh có vật liệu riêng (khoảng 1.200 draw call). Phát hiện nhờ chạy bench thật thay vì tin cảm giác "game chạy mượt" ở Phase 2 (khi đó chỉ có tối đa 10 Bóng Mực). Sửa bằng instancing.
  2. **Soak lần đầu vượt ngưỡng** (59.9 > 58.8 MB). Agent không vội "tối ưu" mà đo thêm 3/10/30/90 Đêm để phân biệt rò rỉ với khởi động, rồi chọn cờ V8. Chạy lại 5 lần đều ở mức 1.074–1.076×.
  3. **Cỡ chữ 16 px** còn sót: phát hiện bằng script Playwright đo font-size thực tế, không phải bằng đọc CSS.
  4. Heredoc bash quá dài làm hỏng lệnh: chuyển sang ghi script ra file rồi chạy.
- Token (ước tính): khoảng 450–600k input + 70k output cho Phase 4.
