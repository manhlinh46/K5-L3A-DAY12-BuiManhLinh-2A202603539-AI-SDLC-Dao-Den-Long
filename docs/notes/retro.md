# Retro — Đảo Đèn Lồng (4 phase, 4 giờ)

## 1. Tổng hợp Evaluation từng phase

| Phase | Yêu cầu chính | Kết quả | Số liệu | Hồi quy |
|---|---|---|---|---|
| 1 · PRD-0 | Đêm 1 chơi được + Test Contract v1.0 | Đạt toàn bộ | 31 test, 7 scenario, tất định (SHA-256 trùng) | — |
| 2 · Ticket-02 | Số chuẩn, 3 Đêm, lướt / rơi / pause / Gió Lạc / bùa / gió, HUD, âm thanh, v1.1 | Đạt; âm thanh và màu chỉ kiểm tra bằng mã + nghe | 64 test, 20 scenario, FPS 240 | Test Phase 1 bị luật mới làm sai được viết lại có lý do (bảng trong phase-2.md) |
| 3 · Ticket-03 | Dầu đèn, drain, luật thắng bình minh, sức chứa, điểm mới, mù màu, v1.2 | Đạt; ADR + CHANGELOG | 82 test, 27 scenario | 2 test xóa, 3 test sửa, 5 scenario sửa, đều có lý do; không skip |
| 4 · Ticket-04 | Bench, soak, bảng xếp hạng, accessibility, đóng gói, v1.3 | Đạt trên máy dev; video do tác giả quay | 90 test; bench avg 632.7 / p1 378.3 FPS / load 3.0 s; soak 0 crash, 1.07× RAM | Toàn bộ 27 scenario cũ vẫn PASS |

## 2. Điều hiệu quả khi làm với AI

- **Tách sim thuần khỏi renderer ngay từ Phase 1.** Mọi phase sau chỉ cần sửa `src/sim` và kiểm chứng bằng headless trong mili giây; trình duyệt chỉ dùng cho phần nhìn. Đây là quyết định đáng giá nhất.
- **`game.contract.json` là nguồn duy nhất của tuning:** sim đọc trực tiếp nên số khai báo không bao giờ lệch với số game dùng. Test cũng suy kỳ vọng từ tuning nên khi Ticket-02/03 đổi số, phần lớn test tự đúng.
- **Đọc thứ tự tick bắt buộc trước khi code.** Viết `step()` đúng 12 bước theo ticket và ghi chú ngay đầu file giúp bắt các lỗi lệch một tick (recoil, cooldown, dầu bị trừ trước bước tương tác).
- **Đo thật trước khi tin.** Bench thật cho thấy 75 FPS chứ không phải "mượt"; soak thật cho thấy vượt ngưỡng 2%. Cả hai được sửa có số liệu trước/sau.

## 3. Điều chưa hiệu quả

- Agent hay **viết test sai** hơn viết game sai (khoảng 12 lần qua 4 phase: quên Bóng Mực phụ đang đuổi, quên thứ tự nhặt/thắp, kiểm tra lúc nhân vật còn đang bay…). Mỗi lần đều được phát hiện vì test đỏ rồi đọc trace thật, nhưng tốn token.
- Kiểm tra trình duyệt bằng Playwright chậm: thời gian thật trôi giữa các lệnh nên hai lần ảnh chụp rơi vào màn "Thua". Quy tắc "kết thúc mỗi lệnh bằng Esc" chỉ có từ Phase 2.
- Ước tính token chỉ là ước lượng, vì agent không đọc được bộ đếm chính xác. Số thật cần lấy từ `/cost`.

## 4. Những lần AI sai và cách phát hiện

| Phase | Sai | Phát hiện bằng | Sửa ở harness |
|---|---|---|---|
| 1 | Test spawn giả định người chơi sống tới giây 20 | Test đỏ | AGENTS.md: "kiểm tra người chơi còn sống trước khi assert" |
| 1 | Gán phím trùng (E vừa xoay camera vừa nạp đèn) | Tự review HTML | — |
| 2 | Recoil lệch 1 tick | Rà thứ tự tick | AGENTS.md: quy tắc off-by-one với bộ đếm bước 2 |
| 2 | CI đỏ: glob `node --test` cần Node ≥ 21 | Tab Actions của GitHub (người dùng báo) | `scripts/run-tests.js`; ma trận CI Node 20/22; AGENTS.md "target Node ≥ 20" |
| 3 | Bỏ sót câu "đi về đèn tắt gần nhất như trước" | Scenario đứng yên mặc định đổi kết quả → đọc trace | — |
| 3 | Trường `target` dùng trùng cho hai việc | Rà code trước khi chạy | — |
| 4 | Vẽ 1.200 draw call | Bench thật | Skill verify-game: đo FPS bằng bench |
| 4 | Font 16 px còn sót | Script đo font thật | — |
| 4 | Soak đạt trên Windows nhưng vượt 1.2× RAM trên Linux/macOS (TurboFan + glibc) | CI đỏ → tái hiện bằng Docker node:20/22 | `soak_cmd` thêm `--no-opt`; kiểm tra trên Linux trước khi tag |

## 5. Harness nào giúp nhiều nhất

1. **Stop hook `scripts/stop-gate.js`** (chặn kết thúc khi `npm test` đỏ): bảo đảm mỗi lượt kết thúc với test xanh, không phụ thuộc agent có nhớ hay không.
2. **`npm run proof`:** một lệnh sinh toàn bộ bằng chứng (scenario, tất định, hiệu năng, log test) khớp commit, không sửa tay.
3. **AGENTS.md:** ngắn, cập nhật qua từng phase (lịch sử git có ghi lại). Quy tắc "test suy kỳ vọng từ tuning, không dán output" ngăn test giả.
4. **Scenario JSON + checker:** thêm ca kiểm tra không cần viết code; checker đã được thử với kỳ vọng sai để chắc nó không "luôn đạt".
5. Skill `verify-game`: hữu ích như checklist, nhưng ít quan trọng hơn hook vì agent vẫn phải tự gọi.

## 6. Token và chi phí (ước tính)

| Phase | Input (ước tính) | Output (ước tính) |
|---|---|---|
| 1 | 250–350k | 45k |
| 2 | 400–550k | 70k |
| 3 | 250–350k | 40k |
| 4 | 450–600k | 70k |
| **Tổng** | **khoảng 1.4–1.9M** | **khoảng 225k** |

Phần lớn input là đọc lại ngữ cảnh hội thoại dài. Những cách đã tiết kiệm:
- Trích text PRD từ 180 KB HTML bằng script thay vì đọc thô.
- Sửa bằng các Edit nhỏ thay vì viết lại file lớn.
- Headless trước, trình duyệt sau.
- Gộp nhiều thao tác Playwright vào một lệnh.
- Dừng và đo (soak 3/10/30/90 Đêm) trước khi "tối ưu".

## 7. Nếu làm lại

- Vẽ thực thể bằng instancing ngay từ đầu, vì số lượng Bóng Mực chắc chắn sẽ tăng.
- Lưu Ticket vào repo (`docs/tickets/`) ngay khi nhận, để agent đọc lại bằng file thay vì cuộn hội thoại.
- Thêm CI bench headless (chỉ để bắt hồi quy hiệu năng lớn) và thêm phiên bản Node của CI vào máy dev ngay từ Phase 1.
- Viết test trạng thái (state machine) bằng bảng chuyển trạng thái thay vì nhiều test rời, giảm lỗi test viết sai.
