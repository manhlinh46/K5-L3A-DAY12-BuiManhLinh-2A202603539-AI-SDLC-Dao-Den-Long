# Credits

## Thư viện và công cụ
- **Three.js** r170 (MIT), https://threejs.org: renderer 3D, cài qua npm. Bản web tĩnh kèm `three.module.js` và LICENSE của Three.js.
- **Puppeteer** 23.11.1 (Apache-2.0), https://pptr.dev: chỉ dùng cho lệnh benchmark. Khi `npm install`, puppeteer tự tải **Chrome for Testing** (giấy phép của Google Chrome for Testing / Chromium BSD).
- **Node.js** (`node:test`, `node:http`): test, headless, server. Không có dependency khác.

## Nội dung game
- Nhân vật, bối cảnh, tên gọi (Mây, Ông Đăng, Bóng Mực, Gió Lạc, Bùa Gió, Đảo Bến, Đảo Cau, Đảo Chuông): bản gốc của lab Day 12 AI SDLC. Lời thoại của Ông Đăng: tác giả viết cùng AI.
- **Mô hình 3D:** dựng bằng code từ hình khối cơ bản của Three.js (`web/main.js`). Không dùng file mô hình, texture hay ảnh bên ngoài; texture quầng sáng được vẽ bằng canvas trong code.
- **Âm thanh và nhạc:** tổng hợp bằng WebAudio trong code (oscillator, nhiễu). Không dùng file âm thanh.
- **Font:** font hệ thống (system-ui), không nhúng font.

## Công cụ AI
- **Claude Code** (Anthropic, model Claude Opus 5.5): viết mã, test, tài liệu, lời thoại và kiểm tra trình duyệt bằng Playwright, dưới sự điều phối và review của tác giả. Chi tiết và ước tính token ở `docs/notes/phase-*.md` và `docs/notes/retro.md`.
- Không có hình ảnh hay âm thanh nào do AI tạo sinh dưới dạng file. Mọi hình và tiếng đều được sinh bằng code.
