# Đảo Đèn Lồng

> Video demo: *(sẽ bổ sung ở Phase 4, đính kèm Release `v1.0.0`)*
> Bài lab Day 12 AI SDLC, cá nhân, Bùi Mạnh Linh, 2A202603539. Luật lab: [LAB.md](LAB.md).

Game 3D góc nhìn thứ ba chạy trên trình duyệt (Three.js). Bạn điều khiển Mây, cô bé giữ đèn đội nón lá: gom đom đóm, thắp lại các Đèn Lồng Lớn trên **3 hòn đảo** (Đảo Bến, Đảo Cau, Đảo Chuông) trước bình minh, né Bóng Mực và đề phòng Gió Lạc.

## Cài đặt và chạy (macOS / Linux / Windows, cần Node.js ≥ 18)

```bash
npm install
npm start          # mở http://localhost:5173
```

Tham số URL tùy chọn: `?night=2` bắt đầu từ Đêm 2 (luyện tập hoặc kiểm thử), `?fps` hiện đồng hồ FPS (hoặc bấm F3).

## Điều khiển

| Phím | Tác dụng |
|---|---|
| W A S D | Di chuyển (theo hướng camera) |
| Kéo chuột / ← → | Xoay camera (độ nhạy chỉnh trong Cài đặt) |
| Space | Nhảy |
| Shift | Lướt: 14 m/s trong 0.2 s, hồi chiêu 1.5 s |
| E | Nạp ánh sáng / châm dầu (đứng trong 2 m quanh đèn) |
| Q | Tỏa Sáng: tốn 3 đom đóm, làm choáng và đẩy lùi Bóng Mực trong 5 m, hồi chiêu 3 s |
| Esc / P | Tạm dừng: Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu |

## Luật và cách tính điểm (Ticket-03, Contract v1.2)

- **Mục tiêu:** giữ đảo sáng tới bình minh. Đêm 1/2/3 dài 240/270/300 s. Thắng khi tới bình minh Mây còn sống và số đèn đang sáng ≥ 3/5, 4/6, 5/7. Thắp đủ đèn **không** kết thúc Đêm sớm. Hết Ngọn Lửa thì thua ngay.
- **Dầu đèn:** đèn vừa thắp có 100 dầu, hao 1/giây và tắt khi cạn. Đứng cạnh đèn đang sáng bấm E để **châm dầu** (mỗi đom đóm +10 dầu). Đèn từng sáng chỉ cần 5 đom đóm để **thắp lại** (lần đầu cần 10). Đèn có dầu < 30 nhấp nháy và **mất vùng an toàn**.
- **Bóng Mực hút dầu:** Bóng Mực đang lang thang sẽ tìm tới đèn yếu (< 30 dầu) để hút 5 dầu/giây. Tỏa Sáng trúng con đang hút được +15. Châm dầu lên ≥ 30 sẽ đẩy chúng ra ngoài.
- **Sức chứa** tăng theo số lần thắp thành công: 10 + 2 × lần thắp, tối đa 20.
- Mây có **3 Ngọn Lửa**. Bị Bóng Mực chạm: −1 lửa, rơi một nửa số đom đóm ra quanh mình (nhặt lại được trong 8 s). Rơi xuống biển mây: −1 lửa, mất hết đom đóm, hồi sinh ở điểm xuất phát.
- **Gió Lạc** (Đêm 2, 3) cướp đom đóm. **Bùa Gió** cho chạy nhanh và lướt liên tục trong 10 s. Đêm 3 có gió mạnh.

| Sự kiện | Điểm |
|---|---|
| Mỗi đom đóm nạp vào đèn (thắp mới, thắp lại, châm dầu) | +5 |
| Thắp lần đầu / thắp lại | +100 / +40 |
| Bóng Mực trúng Tỏa Sáng | +5 (+15 nếu nó đang hút dầu) |
| Bình minh (khi thắng): mỗi đèn đang sáng | +50 + phần nguyên số dầu còn lại |
| Bình minh (khi thắng): mỗi Ngọn Lửa còn lại | +50 |

Tổng điểm game là tổng điểm các Đêm đã thắng. Cài đặt có tùy chọn **Bảng màu dễ phân biệt** cho người mù màu.

## Kiểm thử và chế độ headless (Test Contract v1.2)

```bash
npm test                         # unit + CLI + 27 scenario headless + tất định + hiệu năng
npm run proof -- 3               # sinh bằng chứng vào docs/proof/phase-3/
node src/headless.js --seed 1 --night 1|2|3 --ticks 600 --out out.jsonl \
     [--scenario s.json] [--inputs i.json] [--snapshot-every 10]
```

- Khai báo contract và tuning: [game.contract.json](game.contract.json), dùng đúng số chuẩn của Ticket-02. Game **đọc trực tiếp** các số này.
- Mã thoát: 0 = ổn, 1 = lỗi tham số hoặc lỗi khác, 2 = file inputs/scenario sai định dạng.
- Một Đêm đầy đủ (21.600 tick) chạy khoảng 0.3 s (giới hạn 30 s).

## Cấu trúc

```
src/sim/        logic thuần, tất định: game.js (thứ tự 12 bước/tick), maps.js (3 bản đồ chuẩn)
src/headless.js CLI theo Test Contract v1.1
web/            hiển thị Three.js, HUD, chuỗi màn chơi, âm thanh WebAudio (không chứa luật chơi)
tests/          node:test + tests/scenarios/phase1.json, phase2.json
docs/notes/     spec, giả định, acceptance criteria, nhật ký AI, đánh giá từng phase
docs/proof/     bằng chứng (sinh bằng script, không sửa tay)
AGENTS.md, .claude/  harness AI (skill verify-game, Stop hook chặn kết thúc khi test đỏ)
```

## Bằng chứng và ghi chép

- Phase 1: [notes](docs/notes/phase-1.md) · [proof](docs/proof/phase-1/SUMMARY.md)
- Phase 3: [notes + test đã thay](docs/notes/phase-3.md) · [ADR 0001](docs/adr/0001-lantern-fuel-and-dawn-win.md) · [CHANGELOG](CHANGELOG.md) · [proof](docs/proof/phase-3/SUMMARY.md)
- Phase 2: [spec + acceptance criteria + nhật ký AI](docs/notes/phase-2.md) · [proof](docs/proof/phase-2/SUMMARY.md) · [ảnh chụp](docs/proof/phase-2/screenshots/) · FPS: [Đêm 1](docs/proof/phase-2/fps-night1.json), [Đêm 2](docs/proof/phase-2/fps-night2.json), [Đêm 3](docs/proof/phase-2/fps-night3.json)

## Sáng tạo của tôi

Chỉ nằm trong phần hiển thị (`web/`), **không** đổi luật hay đầu ra headless (scenario và hash tất định vẫn PASS):

- Chiếc đèn trên nón lá của Mây sáng to dần theo số đom đóm đang mang.
- Âm thanh tự tổng hợp bằng WebAudio, không dùng file: nhạc nền đêm (drone + giai điệu ngũ cung), chuông nhặt, hợp âm thắp đèn, tiếng gió báo trước cơn gió.
- Đom đóm rơi nhấp nháy trong 2 s cuối trước khi tắt. Gió Lạc là ba dải lụa uốn lượn.
- Lời dẫn của Ông Đăng mở đầu mỗi Đêm.

## Giấy phép

Mã nguồn: [MIT](LICENSE). Nguồn thư viện và công cụ: [CREDITS.md](CREDITS.md).
