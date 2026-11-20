# Đảo Đèn Lồng

> Video demo: *(sẽ bổ sung ở Phase 4, đính kèm Release `v1.0.0`)*
> Bài lab Day 12 AI SDLC, cá nhân, Bùi Mạnh Linh, 2A202603539. Luật lab: [LAB.md](LAB.md).

Game 3D góc nhìn thứ ba chạy trên trình duyệt (Three.js). Bạn điều khiển Mây, cô bé giữ đèn đội nón lá: gom đom đóm khắp Đảo Bến, mang về thắp 5 Đèn Lồng Lớn trước bình minh, và né những Bóng Mực trong sương đen.

## Cài đặt và chạy (macOS / Linux / Windows, cần Node.js ≥ 18)

```bash
npm install
npm start          # mở http://localhost:5173
```

## Điều khiển

| Phím | Tác dụng |
|---|---|
| W A S D | Di chuyển (theo hướng camera) |
| Kéo chuột / ← → | Xoay camera |
| Space | Nhảy |
| E | Nạp đom đóm vào đèn (đứng trong 3 m quanh đèn chưa sáng) |
| Q | Tỏa sáng: tốn 2 đom đóm, làm choáng và đẩy Bóng Mực trong 8 m, hồi chiêu 2 s |
| R / Enter | Chơi lại / bắt đầu |

## Luật và cách tính điểm

- Mây có **3 lửa**. Bóng Mực chạm vào: mất 1 lửa, rơi mất một nửa số đom đóm đang mang, bất tử 1.5 s. Hết lửa thì **thua**.
- Mang tối đa 10 đom đóm. Mỗi đèn cần 5 đom đóm. Thắp đủ **5 đèn** thì **thắng**. Hết **5 phút** (bình minh) mà chưa thắp xong thì **thua**.
- Bóng Mực sợ đèn: chúng không vào được vòng 6 m quanh mỗi đèn (vòng sáng vàng trên mặt đất).

| Sự kiện | Điểm |
|---|---|
| Nhặt 1 đom đóm | +10 |
| Thắp 1 đèn | +100 |
| Làm choáng 1 Bóng Mực | +20 |
| Khi thắng: mỗi giây còn lại | +2 |
| Khi thắng: mỗi lửa còn lại | +50 |

## Kiểm thử và chế độ headless (Test Contract v1.0)

```bash
npm test                         # 31 test: unit + CLI + scenario headless + tất định
npm run proof -- 1               # sinh bằng chứng vào docs/proof/phase-1/
node src/headless.js --seed 1 --night 1 --ticks 600 --out out.jsonl \
     [--scenario s.json] [--inputs i.json] [--snapshot-every 10]
```

- Khai báo contract và tuning: [game.contract.json](game.contract.json). Game **đọc trực tiếp** các số tuning từ file này.
- `fall_enabled: false`: đảo có tường vô hình ở mép nên không rơi được, và không bao giờ phát `player_hit` với `by: "fall"`.
- Mã thoát: 0 = ổn, 1 = lỗi tham số hoặc lỗi khác, 2 = file inputs/scenario sai định dạng.

## Cấu trúc

```
src/sim/        logic game thuần, tất định (dùng chung cho web và headless)
src/headless.js CLI theo Test Contract
web/            hiển thị Three.js + input (không chứa luật chơi)
tests/          node:test + tests/scenarios/*.json
docs/notes/     giả định, nhật ký AI, đánh giá từng phase
docs/proof/     bằng chứng (sinh bằng script, không sửa tay)
AGENTS.md, .claude/  harness AI (skill verify-game, Stop hook chặn kết thúc khi test đỏ)
```

## Bằng chứng và ghi chép

- Phase 1: [giả định + truy vết yêu cầu + nhật ký AI](docs/notes/phase-1.md) · [kết quả kiểm chứng](docs/proof/phase-1/SUMMARY.md) · [ảnh chụp](docs/proof/phase-1/screenshots/)

## Sáng tạo của tôi

Chỉ nằm trong phần hiển thị (`web/`), **không** đổi luật hay đầu ra headless (các scenario và hash tất định trong `docs/proof` vẫn PASS):

- Chiếc đèn nhỏ trên nón lá của Mây sáng to dần theo số đom đóm đang mang, nhìn là biết đang mang bao nhiêu ánh sáng.
- Âm thanh tự tổng hợp bằng WebAudio (không dùng file): tiếng chuông khi nhặt, hợp âm khi thắp đèn, tiếng trầm khi bị chạm.
- Đèn sáng dần theo số đom đóm đã nạp; đảo bớt sương và sáng hơn mỗi khi thêm một đèn được thắp.

## Giấy phép

Mã nguồn: [MIT](LICENSE). Nguồn thư viện và công cụ: [CREDITS.md](CREDITS.md).
