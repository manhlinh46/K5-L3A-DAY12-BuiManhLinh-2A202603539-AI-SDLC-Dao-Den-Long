# Phase 1 — PRD-0 · Đêm 1 Đảo Bến

## 1. Giả định (chỗ PRD-0 mơ hồ)

| # | Chỗ mơ hồ | Giả định của tôi | Lý do |
|---|---|---|---|
| A1 | Nhặt đom đóm thế nào | Tự động khi chân Mây trong `pickup_radius` (≤ 1.5 m), nếu `carried < carry_capacity` (10). Đầy thì đom đóm nằm lại | Nhịp chơi nhanh, test dễ tái lập |
| A2 | Nạp đèn | Nhấn `interact` (cạnh lên) trong `interact_radius` (3 m) của đèn **chưa sáng** gần nhất → nạp `min(carried, lantern_cost − deposited)`. Đủ `lantern_cost` (5) thì `lantern_lit` | Cho phép nạp từng phần |
| A3 | "Tỏa sáng tốn ánh sáng" | Tốn `pulse_cost` = 2 đom đóm đang mang; không đủ thì không có tác dụng (không event). Hồi chiêu `pulse_cooldown_s` = 2 s. Vẫn phát `pulse` với `stunned_ids: []` nếu không trúng ai | "Ánh sáng" = đom đóm, tạo đánh đổi với việc thắp đèn |
| A4 | Tác dụng tỏa sáng | Bóng Mực trong `pulse_radius` (8 m): choáng `pulse_stun_s` = 3 s (đứng yên, không gây sát thương) và bị đẩy ra xa `pulse_push_m` = 4 m. +`per_stun` mỗi con | |
| A5 | Bị chạm | Khoảng cách ≤ `shade_hit_radius` (1 m) → −1 lửa, rơi `floor(carried × hit_drop_ratio)` (0.5) đom đóm (**mất hẳn**, không rơi ra đất), bất tử `invuln_s` = 1.5 s. Mỗi tick tối đa 1 cú chạm | Đơn giản, tất định |
| A6 | Hết giờ | Đêm dài `night1_duration_s` = 300 s; về 0 mà chưa thắp hết → **thua** (`dawn`) | Có áp lực thời gian |
| A7 | "Bóng Mực sợ đèn" | **Mọi** đèn (sáng hay chưa) có vùng an toàn `safe_radius` = 6 m; Bóng Mực bị đẩy ra ngoài (> 6 m) | Đọc đúng nguyên văn contract: "bán kính quanh đèn mà Bóng Mực không vào được" |
| A8 | Rơi khỏi đảo | Không có: đảo tròn bán kính 40 m, Mây bị chặn ở mép (`fall_enabled: false`, không có event `fall`) | Phase 1 tối giản |
| A9 | Bố trí màn | 5 đèn L1–L5 trên vòng tròn bán kính 25 m, L1 tại (0,0,25), cách nhau 72°. 30 đom đóm ngẫu nhiên theo seed, hồi 1 con / 4 s (tối đa 30). 2 Bóng Mực ban đầu ở mép đảo, thêm 1 con / 20 s (tối đa 6), mỗi con mới phát `shade_spawned` | Tổng đom đóm cần = 25 |
| A10 | Bóng Mực | Luôn đuổi Mây với `shade_speed` = 3.5 m/s (chậm hơn Mây 6 m/s). Trạng thái: `chase`, `stunned` | |
| A11 | Điểm | +10/đom đóm nhặt, +100/đèn thắp, +20/Bóng Mực bị choáng. Khi **thắng** cộng thêm 2 × số giây còn lại (làm tròn xuống) + 50 × lửa còn lại. Thua không có thưởng | |
| A12 | Thứ tự trong 1 tick | input → di chuyển → nhảy/trọng lực → nhặt → nạp → tỏa sáng → Bóng Mực di chuyển → va chạm → sinh mới → đồng hồ → kiểm tra thắng (ưu tiên) / hết lửa / bình minh | Để mọi kết quả tái lập được |
| A13 | Nhảy | Vận tốc 7 m/s, trọng lực 20 m/s² (đỉnh ≈ 1.2 m). Chỉ ảnh hưởng Y, khoảng cách tính theo XZ nên nhảy không né được Bóng Mực | |

Các hằng số ngoài contract nằm ở `WORLD` trong [src/sim/game.js](../../src/sim/game.js); các số trong contract **được đọc trực tiếp** từ `game.contract.json`, nên số khai báo luôn khớp với số game dùng.

## 2. Tiêu chí nghiệm thu → bằng chứng

| Yêu cầu | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| Đi lại theo camera, tốc độ đúng | unit test `movement` (tốc độ, yaw 90°, chuẩn hóa vector chéo) | [test-output.txt](../proof/phase-1/test-output.txt) | Đạt |
| Nhảy | unit test `jump` | test-output | Đạt |
| Camera 3D góc nhìn thứ ba | Chạy game, ảnh chụp | [02-playing.png](../proof/phase-1/screenshots/02-playing.png) | Đạt |
| Nhặt đom đóm, giới hạn mang | unit `pickup` + scenario `core_loop_pickup_deposit_light` | [SUMMARY.md](../proof/phase-1/SUMMARY.md) | Đạt |
| Nạp → thắp đèn | unit `deposit`, scenario core_loop | SUMMARY | Đạt |
| Bóng Mực đuổi theo | unit `shade chases at shade_speed` | test-output | Đạt |
| Bị chạm mất máu, rơi đom đóm, bất tử | unit `hit`, scenario `shade_hits_until_lost` | SUMMARY | Đạt |
| Tỏa sáng xua Bóng Mực (tốn, hồi chiêu, choáng, đẩy) | unit `pulse`, `stun lasts`, scenario `pulse_stuns_shade` | SUMMARY | Đạt |
| Bóng Mực sợ đèn | unit `safe_radius`, scenario `lantern_safe_zone` | SUMMARY | Đạt |
| Thắng / thua (hết lửa, bình minh) / điểm | unit `win`, `lose`; scenario `light_last_lantern_wins`, `dawn_ends_night` | SUMMARY | Đạt |
| HUD, chơi lại | Chạy game: HUD lửa/đom đóm/đèn/thời gian/điểm; R hoặc nút "Chơi lại" | [01-start](../proof/phase-1/screenshots/01-start.png), [03-won](../proof/phase-1/screenshots/03-won.png), [04-lost](../proof/phase-1/screenshots/04-lost.png) | Đạt |
| Đảo sáng dần khi thắp đèn | Ảnh màn thắng (5/5 đèn) so với lúc đầu | 03-won vs 02-playing | Đạt (kiểm bằng mắt) |
| Contract: tham số, mô hình tick, JSONL, end line | `tests/cli.test.js` gọi đúng `headless_cmd` | test-output | Đạt |
| Contract: tất định | 2 lần chạy cùng seed → SHA-256 giống nhau; unit + CI `cmp` | SUMMARY mục Determinism | Đạt |
| Contract: file sai → mã 2, lỗi khác → ≠0 | `cli.test.js` (8 file hỏng + 3 lỗi khác) | test-output | Đạt |
| Chạy trên macOS/Linux | Node thuần + web; CI chạy ubuntu + macos | `.github/workflows/ci.yml` (xem tab Actions sau khi push) | Chưa xác nhận tại thời điểm tag cho tới khi CI chạy xong |

Ghi chú: ảnh `03-won.png` chụp từ một ván chơi tay thật trong cửa sổ trình duyệt kiểm thử (điểm 1254 = 29 đom đóm×10 + 5 đèn×100 + 182 s×2 + 2 lửa×50, khớp công thức).

## 3. Nhật ký dùng AI

- Công cụ: Claude Code (model Claude Opus 5.5) trong VS Code.
- Quy trình: (1) agent đọc toàn bộ file luật và PRD-0 trên lab board; (2) chốt giả định + tuning trong `game.contract.json` **trước** khi code; (3) viết sim thuần + headless, chạy thử bằng scenario mẫu trong đề; (4) viết test suy ra kỳ vọng từ tuning; (5) renderer Three.js, kiểm tra bằng Playwright (ảnh chụp + console); (6) sinh bằng chứng bằng `npm run proof`.
- Lời nhắc chính: "đọc toàn bộ file markdown để hiểu luật trước và hoàn thành phase 1, sau đó hướng dẫn chạy và nộp".
- Lỗi AI và cách phát hiện:
  1. Test `random spawning` ban đầu sai: agent giả định người chơi đứng yên sẽ sống tới giây 20, thực tế bị chạm 3 lần và thua trước đó. Phát hiện nhờ test đỏ; sửa **test** (đặt người chơi trong vùng an toàn), không sửa game.
  2. Gán phím trùng (E vừa xoay camera vừa nạp đèn): phát hiện khi review HTML trước lúc chạy; đổi sang chuột/←→ cho camera.
  3. `node --test tests/` không chạy trên Node 24 (cần glob): phát hiện khi chạy lệnh test đầu tiên.
  4. Kiểm tra bộ checker scenario không "luôn đạt": cố ý đưa kỳ vọng sai vào → checker báo FAIL đúng chỗ.
- Harness: `AGENTS.md` (lệnh, quy tắc tất định, cấm sửa tay proof), skill `.claude/skills/verify-game`, Stop hook `scripts/stop-gate.js` (chặn kết thúc khi `npm test` đỏ), CI GitHub Actions.
- Token/chi phí (ước tính): khoảng 250–350k token input (phần lớn là đọc lại ngữ cảnh) và khoảng 45k token output cho cả Phase 1. Cách tiết kiệm: đọc PRD một lần rồi trích text từ HTML thay vì đọc 180 KB HTML thô; viết từng file một lần, sửa bằng Edit nhỏ; kiểm tra bằng headless (rẻ) trước, chỉ dùng trình duyệt cho phần hình ảnh.

## 4. Đánh giá Phase 1

- Đạt: toàn bộ phạm vi PRD-0 và Test Contract v1.0 (31/31 test, 7/7 scenario, tất định).
- Rủi ro: các giả định A3 (tỏa sáng tốn đom đóm), A5 (đom đóm rơi mất hẳn), A6 (bình minh = thua), A7 (mọi đèn đều có vùng an toàn) có thể khác ý giảng viên; nếu ticket sau làm rõ thì sửa ở một chỗ trong `src/sim/game.js` kèm test.
- Chỉnh harness cho phase sau: thêm vào AGENTS.md ghi chú "kiểm tra người chơi còn sống tới thời điểm cần test" nếu agent lặp lại lỗi 1.
