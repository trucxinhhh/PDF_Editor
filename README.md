# PDF Editor

Web app chỉnh sửa PDF ngay trên trình duyệt, chạy trên máy của bạn (hoặc máy chủ nội bộ). File không bị gửi ra bên ngoài.

Mở một file PDF và bạn có thể:

- **Chèn ảnh** đè lên nội dung trang: kéo, đổi kích thước, dán từ clipboard
- **Chèn văn bản** tiếng Việt có dấu, chỉnh màu, cỡ chữ, font, in đậm
- **Highlight**: kéo chuột tô vùng, hoặc bôi đen chữ rồi bấm Highlight
- **Che vùng**: che trắng hoặc che màu nội dung không muốn hiện
- **Chú thích** (sticky note), mở được trong Acrobat, Foxit, Edge
- **Sửa chữ gốc** của PDF: chữ cũ bị xoá thật và chữ mới được ghi vào đúng vị trí
- **Copy** chữ trong PDF, copy hoặc nhân bản các đối tượng đã thêm
- **Xuất PDF mới**, trong đó mọi phần đã thêm được giữ nguyên
- **Lưu dự án** (`.pdfedit.json`) để mở lại và sửa tiếp các phần đã thêm
- **PDF → Word (.docx)** giữ bố cục để sửa chữ trực tiếp trong Word, và **Word → PDF**

---

## 1. Chạy bằng Docker (khuyên dùng)

### Yêu cầu
- Đã cài [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) hoặc Docker Engine (Linux)
- Mở Terminal / PowerShell tại thư mục `PDF_Editor`

### Cách A: Docker Compose (đơn giản nhất)

```bash
docker compose up -d --build
```

Mở trình duyệt: **http://localhost:5000**

| Việc cần làm | Lệnh |
|---|---|
| Xem log | `docker compose logs -f` |
| Dừng | `docker compose down` |
| Khởi động lại | `docker compose restart` |
| Cập nhật sau khi sửa code | `docker compose up -d --build` |
| Xoá cả dữ liệu tạm | `docker compose down -v` |

### Cách B: Lệnh docker thuần

```bash
# Build image
docker build -t pdf-editor .

# Chạy container
docker run -d --name pdf-editor -p 127.0.0.1:5000:5000 -v pdf-data:/data --restart unless-stopped pdf-editor
```

Dừng và xoá: `docker stop pdf-editor && docker rm pdf-editor`

### Image nhẹ hơn (không có LibreOffice)

LibreOffice chỉ dùng cho chức năng **Word → PDF** và làm image nặng thêm khoảng 400 MB. Nếu không cần chức năng này:

```bash
docker build --build-arg WITH_LIBREOFFICE=false -t pdf-editor .
```
(hoặc sửa `WITH_LIBREOFFICE: "false"` trong `docker-compose.yml`)

### Cho máy khác trong mạng LAN dùng

Mặc định chỉ chính máy chạy Docker truy cập được (`127.0.0.1`). Muốn các máy khác cũng dùng được:
- Trong `docker-compose.yml`, đổi `"127.0.0.1:5000:5000"` thành `"5000:5000"`
- Truy cập bằng `http://<IP-máy-chạy-docker>:5000`

> App không có đăng nhập, nên đừng mở ra Internet công cộng. Nếu cần, hãy đặt sau reverse proxy có xác thực (Nginx, Caddy, Traefik…).

### Cấu hình (biến môi trường)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `5000` | Cổng bên trong container |
| `KEEP_HOURS` | `24` | File tạm (PDF đã tải lên) tự xoá sau N giờ |
| `GUNICORN_WORKERS` | `2` | Số tiến trình xử lý |
| `GUNICORN_THREADS` | `4` | Số luồng mỗi tiến trình |
| `WORK_DIR` | `/data/uploads` | Thư mục lưu file tạm (nằm trong volume `pdf-data`) |

Đổi cổng ra ngoài, ví dụ dùng cổng 8080: `-p 127.0.0.1:8080:5000`

### Font chữ

Image có sẵn font **Liberation Sans / Liberation Serif**: hỗ trợ đủ tiếng Việt và có kích thước chữ giống hệt Arial / Times New Roman.
Muốn dùng font khác, đặt file vào thư mục `fonts/` với tên `sans.ttf`, `sans-bold.ttf`, `serif.ttf`, `serif-bold.ttf`, rồi build lại. Cũng có thể mount thư mục này vào mà không cần build lại: bỏ dấu `#` ở dòng `./fonts:/app/fonts:ro` trong `docker-compose.yml`.

### Kiểm tra

- Trạng thái: http://localhost:5000/api/health (hiển thị phiên bản PyMuPDF, font đang dùng, LibreOffice có hay không)
- `docker ps`: cột STATUS hiện `healthy` là container đang chạy tốt

---

## 2. Chạy trực tiếp, không cần Docker

**Windows:** nhấp đúp `run.bat`. Lần đầu nó tự tạo `.venv` và cài thư viện (cần mạng), sau đó tự mở trình duyệt.
Yêu cầu: Python 3.9+ (https://www.python.org/downloads/, khi cài nhớ tick “Add python.exe to PATH”).

**macOS / Linux:** `bash run.sh`

Khi chạy trực tiếp trên Windows, chức năng Word → PDF dùng Microsoft Word nếu máy có cài, nếu không thì dùng LibreOffice.

---

## 3. Hướng dẫn sử dụng

| Công cụ | Cách dùng |
|---|---|
| **Chọn** (V) | Bấm để chọn hoặc kéo đối tượng. Nhấp đúp để sửa chữ. Kéo ô vuông ở góc dưới để đổi cỡ. Bôi đen chữ của PDF rồi Ctrl+C để copy. |
| **Văn bản** (T) | Bấm vào trang rồi gõ. Enter để xuống dòng, Esc để kết thúc. |
| **Ảnh** (I) | Chọn ảnh rồi bấm vào trang. Hoặc Ctrl+V để dán ảnh, hoặc kéo thả file ảnh lên trang. Kéo góc để đổi cỡ (giữ Shift để co giãn tự do). |
| **Highlight** (H) | Kéo chuột để tô, hoặc bôi đen chữ rồi bấm nút Highlight. |
| **Che vùng** (W) | Kéo chuột để che nội dung. |
| **Chú thích** (C) | Bấm vào trang để thêm ghi chú. |
| **Sửa chữ gốc** (E) | Bấm vào dòng chữ có khung xanh để sửa. Tick “Nền trắng” nếu muốn tô trắng vùng chữ cũ. |

**Phím tắt**

| Phím | Tác dụng |
|---|---|
| Ctrl+Z / Ctrl+Y | Hoàn tác / làm lại |
| Ctrl+C / Ctrl+V | Copy / dán đối tượng |
| Ctrl+D | Nhân bản đối tượng |
| Delete | Xoá đối tượng |
| Phím mũi tên | Dịch chuyển đối tượng (giữ Shift để dịch 10pt) |
| Ctrl+S | Xuất PDF |
| Ctrl+lăn chuột | Zoom |

**Các nút bên phải thanh công cụ**

- **Xuất PDF**: tải về `<tên>_edited.pdf`
- **Lưu dự án** / **Mở dự án**: lưu và mở lại file `.pdfedit.json`, chứa PDF gốc cùng mọi phần đã thêm
- **Word ▾**
  - **PDF gốc → Word**: chuyển file PDF ban đầu
  - **PDF đã chỉnh → Word**: chuyển bản PDF có cả các phần đã thêm
  - **Word → PDF**: chuyển một file `.docx` sang PDF

### Giới hạn
- PDF dạng **ảnh scan** không có chữ thật bên trong, nên “Sửa chữ gốc” và chuyển Word sẽ kém (cần OCR trước).
- Chuyển PDF → Word giữ bố cục ở mức tốt, nhưng với bảng biểu phức tạp có thể cần chỉnh lại.
- File tải lên tối đa 300 MB.

---

## 4. Cấu trúc thư mục

```
PDF_Editor/
├── app.py               Server Flask: xuất PDF (PyMuPDF), PDF→Word (pdf2docx), Word→PDF
├── requirements.txt
├── static/
│   ├── index.html       Giao diện
│   ├── app.js           Logic chỉnh sửa (pdf.js)
│   ├── style.css
│   └── lib/             pdf.js (Mozilla, Apache-2.0)
├── fonts/               Font tuỳ chọn
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── run.bat              Chạy trên Windows, không cần Docker
└── run.sh               Chạy trên macOS/Linux, không cần Docker
```

### API (dùng nội bộ)

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/upload` | Tải PDF lên (multipart `file`), trả về `id` |
| POST | `/api/export` | `{id, anns, name}` → PDF đã chỉnh |
| POST | `/api/docx` | `{id, anns, applyEdits}` → .docx |
| POST | `/api/docx2pdf` | Tải .docx lên (multipart `file`) → PDF |
| GET | `/api/health` | Trạng thái server |
