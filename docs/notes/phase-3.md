# Phase 3 — Ticket-03 "Đèn cạn dầu" (Change Request) · Contract v1.2

Quyết định thiết kế: [ADR 0001](../adr/0001-lantern-fuel-and-dawn-win.md) · Breaking changes: [CHANGELOG.md](../../CHANGELOG.md) · Bằng chứng: [proof/phase-3/SUMMARY.md](../proof/phase-3/SUMMARY.md)

## 1. Test cũ bị luật mới làm sai (đã sửa hoặc xóa, kèm lý do; không skip)

| Test / scenario | Luật bị thay | Xử lý |
|---|---|---|
| `sim.test.js` › `win: last lantern lit -> won all_lit…` | thắng sớm khi đủ đèn | **Xóa**, thay bằng test "thắp đủ không kết thúc Đêm; bình minh ≥ 3/5 → dawn_survived + thưởng bình minh" |
| `sim.test.js` › `win priority: all lit on the very last tick…` | như trên | **Xóa**, thay bằng test "bình minh 2/5 → dawn; hết lửa ở tick bình minh → no_flames" |
| `sim.test.js` › `interact … lit lanterns skipped` | đèn sáng không nhận đom đóm | **Sửa**: đèn sáng chưa đầy → `refuel` |
| `sim.test.js` › `stun lasts … then chase` | hết choáng → chase | **Sửa**: hết choáng → wander 1 tick, rồi chase |
| `sim.test.js` › `deposit` | `lantern_lit` không có `relight` | **Sửa** kỳ vọng thêm `relight: false`; điểm suy ra từ tuning (+5/đom đóm) |
| `cli.test.js` › số chuẩn | thời lượng 300/330/360, điểm cũ | **Sửa** theo v1.2 |
| scenario `core_loop_pickup_deposit_light` | +10/đom đóm | **Sửa** điểm 200 → 150 |
| scenario `light_last_lantern_wins` | thắng sớm | **Thay** bằng `dawn_survived_wins` (điểm 892 = 50 + 100 + 4×(50+98) + 150) |
| scenario `default_night_standing_still` | Đêm 300 s, Bóng Mực lang thang ngẫu nhiên | **Sửa**: đứng yên không thắp → `lost/dawn` ở tick 14400 |
| scenario `p2_night3_default`, `p2_safe_zone_eviction` | thời lượng / điểm cũ | **Sửa** 360 → 300 s, điểm 200 → 150 |

## 2. Giả định cho chỗ ticket chưa rõ

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| C1 | Tốc độ Bóng Mực đi tới đèn yếu | 4 m/s (tốc độ đuổi của Đêm), dừng ở 2 m rồi chuyển `drain` ngay trong tick đó |
| C2 | "đi về đèn tắt gần nhất như trước" | Không có đèn yếu → trôi về đèn tắt gần nhất 2 m/s, tới trong 4 m thì lượn ngẫu nhiên; không còn đèn tắt → lượn ngẫu nhiên |
| C3 | Đèn đặt sẵn `lit: true` | `ever_lit` mặc định = `lit`; không tính vào `successful_lights` |
| C4 | Đèn "đầy dầu" khi bấm E | Dầu bị trừ ở bước 2 trước bước 5, nên đèn sáng gần như không bao giờ đầy đúng lúc E được xử lý; châm 1 đom đóm (`ceil`) là hợp lệ theo công thức |
| C5 | `fuel_drain` "mỗi 60 tick" | Đếm riêng từng Bóng Mực từ lúc vào `drain`; phát ở tick thứ 60, 120… của nó, `fuel` sau khi đã trừ |
| C6 | Bóng `drain` có gây sát thương không | Không (chỉ `wander`/`chase` gây hit); nó chuyển `chase` khi Mây vào trong 6 m |
| C7 | `fuel` đèn tắt | `0` |
| C8 | Mù màu: đèn xẹp + rách | Áp dụng luôn (không chỉ khi bật chế độ mù màu) vì không ảnh hưởng gì khác |

## 3. Tiêu chí nghiệm thu → bằng chứng

| Yêu cầu | Kiểm chứng | Kết quả |
|---|---|---|
| Dầu 100, −1/s, hết → `lantern_out`, deposited 0, ever_lit giữ | `phase3.test.js` fuel; scenario `p3_fuel_runs_out` | Đạt |
| Châm dầu: `used = min(mang, ceil((100−fuel)/10))` | test refuel; scenario `p3_refuel` | Đạt |
| Thắp lại 5 đom đóm, +40, `relight: true`, `relit_count` | test relight + vòng đời; scenario `p3_relight` | Đạt |
| Chọn đèn: chưa sáng hoặc sáng chưa đầy, gần nhất, hòa → id nhỏ | test interact (sửa) | Đạt |
| fuel < 30 mất vùng an toàn, đúng 30 còn | test weak lantern (29 / 31) | Đạt |
| Bóng wander → đèn yếu → drain 5/s cộng dồn, `fuel_drain` mỗi 60 tick, chuyển trạng thái | 2 test drain; scenario `p3_shade_drains_weak_lantern` | Đạt |
| Pulse trúng drain = 15 | test + scenario `p3_pulse_drainer` | Đạt |
| Châm lên ≥ 30 đẩy Bóng Mực ra trong ≤ 30 tick, không sát thương | test eviction-on-refuel | Đạt |
| Luật thắng mới, thời lượng 240/270/300, ngưỡng 3/5 4/6 5/7 | test night durations; scenario `p3_no_early_win_then_dawn`, `p3_dawn_below_threshold`, `dawn_survived_wins` | Đạt |
| Sức chứa 10 + 2 × thắp, tối đa 20 | test capacity | Đạt |
| Điểm mới | kỳ vọng điểm trong test/scenario tính từ tuning | Đạt |
| Contract v1.2 (tuning, snapshot, scenario, event) | `cli.test.js`, test contract v1.2 | Đạt |
| Thanh dầu, nhấp nháy 1 Hz khi < 30 | ảnh [01](../proof/phase-3/screenshots/01-fuel-bar-refuel-hint.png) (thanh dầu 70 %) | Đạt (ảnh); nhịp nhấp nháy kiểm bằng mã `Math.floor(clock*2)%2` |
| Mù màu: viền/mắt `#00B3FF`, cảnh báo trắng + ⚠, đèn tắt xẹp + rách, cài đặt được lưu | ảnh [02](../proof/phase-3/screenshots/02-colorblind-lowfuel-drain.png) (Bóng Mực viền xanh); Playwright đọc `#timer` = "⚠ 00:25", màu `rgb(255,255,255)`, localStorage `colorblind: true` | Đạt; ảnh 02 chụp đúng pha tắt của đồng hồ nhấp nháy nên không thấy đồng hồ |
| HUD đang mang / sức chứa | ảnh 01 ("6/14", 14 ô) | Đạt |

Ghi chú về ảnh Phase 3: trạng thái đèn trong ảnh được đặt qua hook `?debug` (chỉ có ở bản web khi thêm tham số này, không ảnh hưởng headless) để chụp nhanh các trạng thái hiếm (dầu yếu, Bóng Mực drain). Luật được kiểm chứng bằng test headless, không bằng ảnh.

## 4. Nhật ký dùng AI (Phase 3)

- Claude Code (Claude Opus 5.5). Ticket dán vào chat.
- Lỗi AI và cách phát hiện:
  1. **Xung đột tên trường:** hàm `wander()` cũ lưu điểm lang thang vào `e.target`, trùng với id đèn mục tiêu mới của Bóng Mực. Agent tự phát hiện khi rà code trước khi chạy test; đổi thành `e.roam`.
  2. **Thiếu một luật:** lần đầu agent bỏ sót câu "không có đèn yếu thì đi về đèn tắt gần nhất như trước". Phát hiện khi scenario đứng yên mặc định không còn cú chạm nào; đọc trace thấy Bóng Mực chỉ lang thang ở mép đảo. Đã bổ sung hành vi (giả định C2).
  3. **4 test tự viết sai** (đèn đặt sẵn 100 dầu không sống tới bình minh 240 s; quên thứ tự nhặt trước thắp; người chơi chưa vào 6 m; đèn "đầy" đã bị trừ dầu trước khi bấm E). Mỗi lần in trace bằng `node -e` rồi sửa **test** và ghi lý do.
- Harness: AGENTS.md thêm quy tắc về đơn vị dầu nguyên và thứ tự bước 2; skill `verify-game` dùng nguyên cho Phase 3.
- Token (ước tính): khoảng 250–350k input + 40k output. Tiết kiệm: sửa `game.js` bằng các Edit nhỏ theo từng mục của ticket thay vì viết lại; kiểm chứng trước hết bằng headless.

## 5. Đánh giá Phase 3

- Đạt: toàn bộ luật mới có test và scenario (82 test). Không còn test nào bị tắt.
- Hồi quy: các test Phase 1–2 **không bị thay thế** vẫn đạt nguyên (di chuyển, nhảy, lướt, rơi, pause, Gió Lạc, bùa, bản đồ, gió, tất định, hiệu năng).
- Rủi ro: giả định C1/C2 (cách Bóng Mực tìm đèn) và C4 (đèn không bao giờ "đầy" lúc bấm E) có thể khác bản tham chiếu.
