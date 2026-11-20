# Phase 2 — Ticket-02 "Ba hòn đảo" · Contract v1.1

Nguồn: Ticket-02 trên lab board (dán vào phiên làm việc). Hai việc: (1) thay mọi số tự chọn bằng **số chuẩn**, (2) mở rộng thành **3 Đêm** + tính năng mới.

## 1. Thay đổi so với Phase 1 (và test cũ bị ảnh hưởng)

| Luật Phase 1 (giả định cũ) | Ticket-02 | Xử lý trong code / test |
|---|---|---|
| A1 nhặt ≤ 1.5 m | ≤ 1.0 m XZ **và** chênh cao ≤ 1.5 m | `pickup_radius` 1.0; test `pickup` thêm ca mote cao 2 m |
| A2 đèn tốn 5, tương tác 3 m | 10 đom đóm, 2 m, hòa khoảng cách → id nhỏ | test `deposit`, `interact` viết lại theo số mới + ca hòa |
| A3/A4 tỏa sáng 2 đom đóm, 8 m, choáng 3 s, đẩy tức thời | 3 đom đóm, **3D** 5 m từ chân + 0.8 m, choáng 120 tick, đẩy 4 m trong 15 tick, hồi 3 s, +5/con | test `pulse` sửa (shade B đặt ngoài vùng phát hiện), thêm test pulse lại làm mới choáng |
| A5 đom đóm rơi **mất hẳn**, bất tử 1.5 s | rơi `floor(mang/2)` ra vành 1.5–2.5 m, TTL 480 tick, nhặt lại được | test `hit` viết lại (kiểm tra vành + TTL + recoil) |
| A7 **mọi** đèn có vùng an toàn | chỉ **đèn đã sáng**; Bóng Mực bên trong lúc vừa thắp bị đẩy ra trong ≤ 30 tick | test `safe_radius` thay bằng 2 ca: đèn sáng chặn / đèn tắt không chặn; scenario `lantern_safe_zone` đổi sang đèn `lit: true` |
| A8 không rơi khỏi đảo (`fall_enabled: false`) | rơi khi Y < −10: −1 lửa, mất hết, chờ 60 tick, hồi sinh | test "island edge" **bỏ**, thay bằng test fall/respawn |
| A9 30 đom đóm ngẫu nhiên, 2 Bóng Mực từ đầu, +1/20 s | 20 tại 24 điểm chuẩn, +1 mỗi 240 tick (trần 30); 2 Bóng Mực tại tick 300, rồi mỗi 480 tick, tối đa 6 | test spawn viết lại theo lịch chuẩn |
| A10 Bóng Mực luôn đuổi 3.5 m/s | 4.0 m/s (Đêm 3: 4.5), phát hiện 12 m, bỏ đuổi 18 m, 5 trạng thái chuẩn | thêm test chase/wander/give-up |
| A11 +10 khi **nhặt** | +10 mỗi đom đóm **nạp** | mọi kỳ vọng điểm tính lại (ví dụ thắng: 548 thay vì 448) |
| A12 thứ tự tick tự đặt | thứ tự 12 bước bắt buộc | `step()` viết lại đúng thứ tự, ghi chú ở đầu `game.js` |
| Đèn L2…L5 tính bằng sin/cos (23.776…) | tọa độ chuẩn (23.8, 0, 7.7)… | `maps.js` |

Không còn test nào bị tắt; các test bị luật mới làm sai đều đã **sửa hoặc thay**, lý do ở bảng trên.

## 2. Giả định cho chỗ Ticket-02 chưa nói rõ

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| B1 | "tăng tốc/dừng trong ≤ 0.1 s" | Tức thời (0 s ≤ 0.1 s): vận tốc ngang = hướng × tốc độ ngay tick đó |
| B2 | Điểm xuất phát Đêm 2, Đêm 3 | Đêm 2: (0,0,0) giữa đảo A. Đêm 3: **(0,0,−30)** vì (0,0,0) nằm trong tháp chuông. Quay mặt +Z |
| B3 | Độ cao Bóng Mực / Gió Lạc | Bay lơ lửng: tâm = mặt đất bên dưới + 1.0 m (Gió Lạc + 1.2 m), bay qua vách và biển mây; độ cao mặt đất lấy tối đa 6 m (không leo lên đỉnh tháp) |
| B4 | Trạng thái `spawning` kéo dài bao lâu | Đúng 1 tick (tick sinh); tick sau chuyển wander/chase — "chỉ tương tác được từ tick sau" |
| B5 | `wander` | Bay tới điểm ngẫu nhiên (seed) cách 2–8 m với 2 m/s, chọn điểm khác khi tới nơi; điểm phải có mặt đất |
| B6 | "Chạm" của Bóng Mực: chênh cao giữa gì | Chân Mây so với đáy Bóng Mực (tâm − 1 m) |
| B7 | Trần 30 đom đóm | Đếm **tất cả** đom đóm đang có (ngẫu nhiên + rơi). "Điểm trống" = điểm sinh chưa có đom đóm ngẫu nhiên |
| B8 | Bước leo | Đi lên được chênh cao ≤ 0.35 m mỗi bước (dốc), vách 3 m chặn; bước ra khỏi mép thì rơi xuống tầng dưới |
| B9 | Kích hoạt bục nhảy | Chân Mây đang đứng trên mặt đất, XZ ≤ 1 m tâm bục, cùng độ cao bục |
| B10 | Nhảy khi đang lướt | Không cho nhảy trong 12 tick lướt (lướt trên không giữ độ cao, lướt mặt đất giữ trên đất) |
| B11 | Gió | Cơn gió bắt đầu ở sim_tick 1800, 3600, … kéo dài 300 tick; hướng chọn bằng seed lúc bắt đầu; đẩy 2 m/s cộng vào chuyển động (cả khi bay/lướt). `dir_deg` theo quy ước góc của Phần 2 |
| B12 | Gió Lạc sau khi cướp / bị pulse | Không đuổi lại (mỗi con cướp 1 lần); `removed` thì bị xóa khỏi mảng `drifters` |
| B13 | Điểm sương sinh Gió Lạc | Dùng các điểm sinh Bóng Mực của Đêm đó |
| B14 | `night_start` | Ghi ở tick 0, trước snapshot 0 (dòng đầu tiên của JSONL) |
| B15 | `player.invuln` | Boolean (đang bất tử); thêm `invuln_s` (số giây còn lại) để dễ kiểm tra |
| B16 | Scenario mới | `motes[]` nhận `[x,y,z]` hoặc `{pos, kind, ttl_ticks|ttl_s}`; `charms[]` nhận `{id, pos, available, respawn_ticks|respawn_s}`; `drifters[]` nhận `{id, pos, state, stolen, state_ticks_left}`. Khóa lạ bị bỏ qua |
| B17 | Rơi khi đang hồi sinh | Trong 60 tick chờ: không di chuyển, không nhặt, không tương tác, không tỏa sáng, không bị chạm/cướp |
| B18 | `end.state` khi đang tạm dừng | `"paused"`; `end.ticks` = số tick đã chạy (kể cả tick tạm dừng) |
| B19 | Bùa đang hiệu lực + hồi chiêu lướt | Lướt khi có bùa không đặt hồi chiêu; hết bùa thì lướt hồi chiêu bình thường từ lần lướt sau |

## 3. Spec + acceptance criteria cho từng mục Phần 3

| Mục | Acceptance criteria (kiểm chứng được) | Kiểm chứng |
|---|---|---|
| **Gió Lạc** | AC1 sinh ở tick 1200, 2400 (Đêm 2, 3), id D1, D2, tối đa 2, không sinh ở Đêm 1 · AC2 idle → chase khi mang ≥ 5 và ≤ 15 m, mất điều kiện về idle · AC3 chạm XZ ≤ 1.2 m cướp min(3, mang), phát `drifter_steal`, chuyển flee 240 tick rồi biến mất · AC4 không mất lửa, xuyên bất tử và vùng an toàn · AC5 pulse lúc chase → flee không cướp; lúc flee có đồ → `drifter_drop`, đồ thành đom đóm `dropped`, biến mất sau 120 tick | `features.test.js` (4 test), scenario `p2_drifter_steal`, `p2_drifter_pulse_drop`, `p2_night2_default` |
| **Bùa Gió** | AC1 vị trí C1 (35,0,0) Đêm 2; C1, C2 (±30,0,25) Đêm 3 · AC2 nhặt như đom đóm → `charm_picked {charm_id, charm_ticks: 600}` · AC3 tốc độ 7.2 m/s; lướt không hồi chiêu, nhấn khi đang lướt bị bỏ qua · AC4 xuất hiện lại sau 2700 tick | test `charm`, scenario `p2_charm` |
| **Lướt** | AC1 14 m/s × 12 tick = 2.8 m theo hướng di chuyển, đứng yên thì theo hướng mặt · AC2 hồi chiêu 90 tick tính từ lúc lướt · AC3 trên không giữ độ cao · AC4 không bất tử · AC5 event `dash {}` | 2 test, scenario `p2_dash` |
| **Rơi khỏi đảo** | AC1 Y < −10 một lần, bỏ qua bất tử, `player_hit {by: fall, flames, dropped: 0, lost}` · AC2 chờ 60 tick không nhặt/không bị chạm · AC3 hồi sinh ở điểm xuất phát, vận tốc 0, bất tử 90 tick · AC4 hết lửa thì thua ngay | 2 test, scenario `p2_fall_respawn` |
| **Bản đồ 3 Đêm** | AC1 Đêm 2: hai đảo + cầu, bục bay ≈ 1.4 s sang đảo kia, phím di chuyển không ghi đè · AC2 Đêm 3: vách chặn, dốc lên tầng 1, bục (0,3,13) đáp tầng 2, tháp chặn · AC3 điểm sinh/đèn đúng tọa độ chuẩn | test map Đêm 2, Đêm 3; scenario `p2_launch_pad_night2`, `p2_night3_pad_to_tier2`, `p2_night3_default` |
| **Gió mạnh (Đêm 3)** | AC1 mỗi 30 s, 5 s, 2 m/s, hướng theo seed · AC2 snapshot `wind {active, dir_deg}` · AC3 báo trước 2 s (lá bay + âm thanh) | test wind, scenario `p2_night3_wind`; báo trước: chữ "Gió sắp nổi..." + lá + tiếng gió trong `web/` |
| **Vùng an toàn mới** | AC1 chỉ đèn sáng · AC2 chặn ở mép 6 m · AC3 Bóng Mực ở trong lúc vừa thắp bị đẩy ra trong ≤ 30 tick, không gây sát thương | test, scenario `p2_safe_zone_eviction` |
| **Trạng thái Bóng Mực** | AC1 đúng tên `spawning, wander, chase, recoil, stunned` · AC2 recoil 2 m / 60 tick sau khi gây hit · AC3 bóng chạm khi Mây bất tử không làm gì | test `hit`, `invulnerable`, scenario `p2_shade_states` |
| **Chuỗi 3 Đêm** | AC1 Menu → giới thiệu (tên đảo + lời Ông Đăng) → chơi → kết quả → Đêm kế · AC2 thắng Đêm 3 → màn Bình Minh + tổng điểm (tổng các Đêm đã thắng) · AC3 thua → chơi lại Đêm đó | ảnh `01-menu`, `02-intro`, `08-lost-retry`; mã `showIntro/showResult` trong `web/main.js` |
| **Tạm dừng** | AC1 Esc/P: logic dừng hẳn, đồng hồ đứng yên · AC2 menu Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu · AC3 headless: tick tăng, sim_tick/thời gian/hồi chiêu/spawn đứng yên, `state: "paused"`, event `paused`/`resumed` | test `pause`, scenario `p2_pause`, ảnh `06-pause` (đồng hồ 05:58 đứng yên 2.5 s) |
| **Cài đặt** | AC1 âm lượng + độ nhạy chuột · AC2 lưu giữa các lần mở game | Playwright: đặt 0.3 / 1.8, tải lại trang → thanh trượt vẫn 0.3 / 1.8 (`localStorage`), ảnh `09-settings-persisted` |
| **Âm thanh** | AC1 nhạc nền đêm · AC2 SFX: nhặt, thắp đèn, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s cuối | `SFX` + `musicTick` trong `web/main.js` (WebAudio tổng hợp). Kiểm chứng bằng nghe khi chơi; không có kiểm tra tự động |
| **HUD** | AC1 Ngọn Lửa trên trái · AC2 mm:ss trên giữa, đỏ #FF5A5F nhấp nháy khi ≤ 30 s · AC3 đèn k/n + điểm trên phải · AC4 thanh 10 ô dưới giữa · AC5 hồi chiêu Lướt + Tỏa Sáng dưới phải · AC6 "E — Nạp ánh sáng (x/10)" gần đèn · AC7 mũi tên chỉ đèn chưa sáng gần nhất khi ngoài màn hình | ảnh `03-night1-hud`, `05-night3-arrow` (mũi tên ở mép phải) |
| **Bảng màu** | Hex của bảng chuẩn dùng trực tiếp (`C` trong `web/main.js`, `:root` trong `index.html`) · ánh sáng môi trường = 0.15 + 0.55 × đèn sáng / tổng | đối chiếu mã |
| **Contract v1.1** | khóa tuning mới, `--night 1..3`, snapshot/scenario/input/event mới, chạy cả Đêm ≤ 30 s | `cli.test.js` (số chuẩn so khớp từng khóa), `features.test.js` contract + performance, SUMMARY mục performance |
| **FPS ≥ 30 @ 1280×720** | trung bình ≥ 30 FPS | Playwright Chromium 1280×720, DPR 1, mỗi Đêm chạy + xoay camera 6 s: [fps-night1.json](../proof/phase-2/fps-night1.json), [2](../proof/phase-2/fps-night2.json), [3](../proof/phase-2/fps-night3.json) = 240 FPS (chạm trần tần số màn hình). Máy: AMD Ryzen 9 8940HX, Windows 11. Máy chấm yếu hơn sẽ thấp hơn — `?fps` để tự đo |

## 4. Nhật ký dùng AI (Phase 2)

- Công cụ: Claude Code (Claude Opus 5.5). Ticket-02 được dán vào chat vì agent không truy cập được database của lab board (nội dung tab tải động).
- Quy trình: liệt kê thay đổi so với giả định Phase 1 → viết `maps.js` + `game.js` theo đúng thứ tự 12 bước → test cho từng tính năng → scenario headless → web → kiểm tra trình duyệt → proof.
- Lỗi AI và cách phát hiện:
  1. **Recoil lệch 1 tick** (bộ đếm giảm ở bước 2 khiến Bóng Mực lùi 59/60 quãng): phát hiện khi tự rà thứ tự tick trước khi chạy; chuyển đếm recoil sang bước 8.
  2. **5 test tự viết sai** (lần lượt: shade phụ trong vùng phát hiện làm hỏng test pulse; quên shade tiến thêm 1 tick trước khi recoil; Gió Lạc còn `idle` ở tick pulse; kiểm tra bục nhảy ở tick 60 khi vẫn đang bay; người chơi đi mãi ra biển trong test bùa). Mỗi lần đọc trace thật (`node -e` in snapshot) rồi sửa **test**, không sửa game. Đã thêm quy tắc vào AGENTS.md.
  3. Kiểm tra trình duyệt: hai ảnh chụp bị "thua" vì thời gian thật trôi giữa các lệnh công cụ. Sửa quy trình: mỗi lệnh Playwright kết thúc bằng Esc (tạm dừng) — ghi vào skill `verify-game`.
  4. Cây trang trí che camera (thấy trong ảnh) → dời cây ra vành đảo.
  5. **CI đỏ sau khi push tag phase-2** (phát hiện qua tab Actions trên GitHub, không phải ở máy): script `npm test` dùng glob `node --test "tests/*.test.js"`, chỉ chạy trên Node ≥ 21; máy dev là Node 24 nên không thấy lỗi, CI dùng Node 20. Sửa: `scripts/run-tests.js` tự liệt kê file test; CI chạy ma trận Node 20/22 × ubuntu/macos, `fail-fast: false`; thêm quy tắc "target Node ≥ 20" vào AGENTS.md. Mã game và đầu ra headless không đổi.
- Harness đã cập nhật: AGENTS.md (contract v1.1, maps, quy tắc off-by-one, Playwright), skill `verify-game` (scenario mỗi tính năng, đo FPS, tạm dừng trước khi chụp), proof script thêm đo hiệu năng cả Đêm.
- Token/chi phí (ước tính): khoảng 400–550k token input (đọc lại ngữ cảnh lớn) + khoảng 70k token output. Tiết kiệm: viết lại sim một lần theo spec thay vì vá dần; dùng headless (rẻ) cho mọi luật, trình duyệt chỉ cho phần nhìn; gộp thao tác Playwright vào một lệnh.

## 5. Đánh giá Phase 2

- Đạt: số chuẩn, 3 bản đồ, mọi tính năng Phần 3 có test/scenario, contract v1.1, hiệu năng headless (~0.3 s/Đêm), FPS.
- Hồi quy: toàn bộ scenario Phase 1 vẫn chạy (cập nhật theo số chuẩn — xem mục 1). Test ẩn Phase 1 dựa trên tuning sẽ dùng số chuẩn mới.
- Chưa kiểm chứng tự động: âm thanh (chỉ nghe), mũi tên/HUD (ảnh chụp), màu (đối chiếu mã).
- Rủi ro: các giả định B2 (xuất phát Đêm 3), B3 (độ cao Bóng Mực), B4 (spawning 1 tick), B7 (trần đếm cả đom đóm rơi) có thể khác bản tham chiếu của giảng viên.
