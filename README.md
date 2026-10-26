# PDF Editor

Web app chỉnh sửa PDF ngay trên trình duyệt, chạy trên máy của bạn (hoặc máy chủ nội bộ). File không bị gửi ra bên ngoài.

Mở một file PDF và bạn có thể:

- **Chèn ảnh** đè lên nội dung trang: kéo, đổi kích thước, dán từ clipboard
- **Chèn văn bản** tiếng Việt có dấu, chỉnh màu, cỡ chữ, font, in đậm
- **Highlight theo dòng chữ**: kéo trên chữ là tô đúng theo từng dòng, bắt theo từng ký tự; bấm 1 lần để tô cả dòng. Có 3 kiểu: tô nền, gạch chân, gạch ngang
- **Vẽ hình**: chữ nhật, elip/tròn, đường thẳng, mũi tên, bút vẽ tự do; chỉnh được màu nét, màu nền, độ dày nét, độ đậm
- **Bảng màu gợi ý** cho từng loại (chữ, highlight, hình, che vùng…), vẫn chọn được màu tuỳ ý
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

Mở trình duyệt: **http://localhost:5000** trên chính máy này. Các máy khác trong mạng nội bộ dùng **http://\<IP-máy-này\>:5000** (xem mục *Dùng chung trong mạng nội bộ* bên dưới).

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
docker run -d --name pdf-editor -p 5000:5000 -v pdf-data:/data --restart unless-stopped pdf-editor
```

Dừng và xoá: `docker stop pdf-editor && docker rm pdf-editor`

### Image nhẹ hơn (không có LibreOffice)

LibreOffice chỉ dùng cho chức năng **Word → PDF** và làm image nặng thêm khoảng 400 MB. Nếu không cần chức năng này:

```bash
docker build --build-arg WITH_LIBREOFFICE=false -t pdf-editor .
```
(hoặc sửa `WITH_LIBREOFFICE: "false"` trong `docker-compose.yml`)

### Dùng chung trong mạng nội bộ (LAN)

Mặc định app mở cho **mọi máy cùng mạng nội bộ** (cùng Wi-Fi / mạng LAN công ty) truy cập. Máy khác không cần cài gì, chỉ cần trình duyệt. Mỗi người mở file riêng và chỉnh sửa độc lập, không ảnh hưởng nhau.

**Thiết lập 1 lần trên máy chạy PDF Editor (Windows):**
1. Nhấp đúp **`lan-setup.bat`**, rồi bấm *Yes* khi Windows hỏi quyền Administrator. Script sẽ:
   - mở tường lửa Windows cho cổng 5000;
   - nếu mạng đang ở chế độ *Public*, hỏi để chuyển sang *Private* (Windows chặn kết nối từ máy khác khi mạng ở chế độ Public);
   - in ra địa chỉ để các máy khác truy cập, ví dụ `http://192.168.1.15:5000`.
2. Gửi địa chỉ đó cho mọi người. Họ mở bằng Chrome, Edge, Firefox… trên máy tính, điện thoại hoặc máy tính bảng cùng mạng.

**Tự tìm địa chỉ IP** (nếu không dùng script): mở PowerShell gõ `ipconfig`, lấy dòng **IPv4 Address** của card Wi-Fi hoặc Ethernet (thường dạng `192.168.x.x` hoặc `10.x.x.x`). Bỏ qua các card tên *vEthernet / WSL*.

**Nên đặt IP cố định** cho máy chạy PDF Editor (trong router, mục DHCP reservation, hoặc trong cài đặt card mạng). Nếu không, địa chỉ có thể đổi sau khi khởi động lại máy.

**Không truy cập được từ máy khác?**
- Trên chính máy chủ, http://localhost:5000 phải mở được trước. Nếu không mở được thì app chưa chạy.
- Hai máy phải cùng một mạng. Wi-Fi khách (guest) thường chặn các máy nói chuyện với nhau.
- Chạy lại `lan-setup.bat`. Nếu dùng phần mềm diệt virus có tường lửa riêng (Kaspersky, ESET…), cho phép cổng 5000 trong phần mềm đó.
- Một số VPN chặn mạng nội bộ khi đang bật.

**Chỉ muốn dùng trên một máy:** trong `docker-compose.yml` đổi `"5000:5000"` thành `"127.0.0.1:5000:5000"`. Nếu chạy bằng run.bat thì sửa dòng `set HOST=0.0.0.0` thành `set HOST=127.0.0.1`.

**Đóng tường lửa lại:** chạy lệnh sau trong PowerShell (Administrator):
`netsh advfirewall firewall delete rule name="PDF Editor (TCP 5000)"`

> App không có đăng nhập: ai trong mạng nội bộ cũng dùng được. Chỉ dùng trong mạng tin cậy (nhà, công ty) và **không** mở cổng ra Internet (port forwarding trên router).

### Cấu hình (biến môi trường)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `5000` | Cổng bên trong container |
| `KEEP_HOURS` | `24` | File tạm (PDF đã tải lên) tự xoá sau N giờ |
| `GUNICORN_WORKERS` | `2` | Số tiến trình xử lý |
| `GUNICORN_THREADS` | `4` | Số luồng mỗi tiến trình |
| `WORK_DIR` | `/data/uploads` | Thư mục lưu file tạm (nằm trong volume `pdf-data`) |

Đổi cổng ra ngoài, ví dụ dùng cổng 8080: sửa `"5000:5000"` thành `"8080:5000"` (khi đó sửa `PORT=5000` trong `lan-setup.bat` thành `8080`).

### Font chữ

Image có sẵn font **Liberation Sans / Liberation Serif**: hỗ trợ đủ tiếng Việt và có kích thước chữ giống hệt Arial / Times New Roman.
Muốn dùng font khác, đặt file vào thư mục `fonts/` với tên `sans.ttf`, `sans-bold.ttf`, `serif.ttf`, `serif-bold.ttf`, rồi build lại. Cũng có thể mount thư mục này vào mà không cần build lại: bỏ dấu `#` ở dòng `./fonts:/app/fonts:ro` trong `docker-compose.yml`.

### Kiểm tra

- Trạng thái: http://localhost:5000/api/health (hiển thị phiên bản PyMuPDF, font đang dùng, LibreOffice có hay không)
- `docker ps`: cột STATUS hiện `healthy` là container đang chạy tốt

### Xử lý lỗi khi build

**`failed to fetch oauth token` / `failed to solve: ... docker.io` / `connection was forcibly closed`**

Máy không kết nối được Docker Hub để tải image gốc `python`. Đây là lỗi mạng (hay gặp với một số nhà mạng hoặc khi dùng IPv6), không phải lỗi code. Có thể thử lần lượt:

1. **Dùng bản mirror của Google** (không cần Docker Hub). Trong PowerShell:
   ```powershell
   $env:BASE_IMAGE="mirror.gcr.io/library/python:3.12-slim-bookworm"
   docker compose up -d --build
   ```
   Muốn lần sau không phải gõ lại: tạo file `.env` cạnh `docker-compose.yml` với nội dung
   ```
   BASE_IMAGE=mirror.gcr.io/library/python:3.12-slim-bookworm
   ```
   Nếu chạy bằng lệnh docker thuần:
   `docker build --build-arg BASE_IMAGE=mirror.gcr.io/library/python:3.12-slim-bookworm -t pdf-editor .`
2. **Thêm mirror cho Docker Desktop**: vào Settings → Docker Engine, thêm `"registry-mirrors": ["https://mirror.gcr.io"]` vào JSON, bấm *Apply & restart*.
3. **Đổi DNS / tắt IPv6**: đặt DNS của máy thành `8.8.8.8` và `1.1.1.1`, hoặc tắt IPv6 trên card mạng rồi thử lại. Cũng có thể đổi mạng khác (4G, VPN).
4. Thử tải riêng image gốc để kiểm tra: `docker pull python:3.12-slim-bookworm`.

**Lỗi khi `pip install` hoặc `apt-get`**: cũng là lỗi mạng. Thử lại, hoặc đổi DNS/mạng như bước 3.

---

## 2. Chạy trực tiếp, không cần Docker

**Windows:** nhấp đúp `run.bat`. Lần đầu nó tự tạo `.venv` và cài thư viện (cần mạng), sau đó tự mở trình duyệt. Cửa sổ dòng lệnh sẽ in địa chỉ cho các máy khác trong mạng nội bộ. Nhớ chạy `lan-setup.bat` 1 lần để mở tường lửa (xem mục *Dùng chung trong mạng nội bộ*).
Yêu cầu: Python 3.9+ (https://www.python.org/downloads/, khi cài nhớ tick “Add python.exe to PATH”).

**macOS / Linux:** `bash run.sh`

Khi chạy trực tiếp trên Windows, chức năng Word → PDF dùng Microsoft Word nếu máy có cài, nếu không thì dùng LibreOffice.

---

## 3. PDF dạng ảnh scan

PDF tạo từ máy scan (hoặc ảnh chụp) chỉ chứa **hình ảnh** của trang, không có chữ thật bên trong. Khi mở loại file này, app hiện một **thông báo màu vàng** ở đầu trang.

| Với PDF ảnh scan | |
|---|---|
| Thêm văn bản, ảnh, hình vẽ, che vùng, chú thích, highlight vùng tự do, xuất PDF | ✔ Dùng bình thường |
| Sửa chữ gốc, highlight theo dòng chữ, bôi đen để copy chữ | ✘ Không dùng được (không có chữ thật) |
| Chuyển sang Word | File Word chỉ chứa hình ảnh của trang |

Cách sửa nội dung trên bản scan: dùng **Che vùng** để che chữ cũ, rồi dùng **Văn bản** để gõ chữ mới đè lên.

---

## 4. Hướng dẫn sử dụng

| Công cụ | Cách dùng |
|---|---|
| **Chọn** (V) | Bấm để chọn hoặc kéo đối tượng. Nhấp đúp để sửa chữ. Kéo ô vuông ở góc dưới để đổi cỡ. Bôi đen chữ của PDF rồi Ctrl+C để copy. |
| **Văn bản** (T) | Bấm vào trang rồi gõ. Enter để xuống dòng, Esc để kết thúc. |
| **Ảnh** (I) | Chọn ảnh rồi bấm vào trang. Hoặc Ctrl+V để dán ảnh, hoặc kéo thả file ảnh lên trang. Kéo góc để đổi cỡ (giữ Shift để co giãn tự do). |
| **Highlight** (H) | Kéo trên chữ để tô theo dòng (tự bắt theo từng ký tự). Bấm 1 lần vào một dòng để tô cả dòng. Kéo ở vùng trống để tô một vùng tự do. Muốn luôn tô vùng tự do thì chọn “Tô vùng tự do” ở thanh thuộc tính. Đổi kiểu Tô nền / Gạch chân / Gạch ngang ở đó. Cũng có thể bôi đen chữ ở chế độ Chọn rồi bấm nút Highlight. |
| **Hình** (S) | Chọn loại hình ở thanh thuộc tính: ▭ chữ nhật, ◯ elip, ╱ đường thẳng, ↗ mũi tên, ✎ bút vẽ. Kéo chuột trên trang để vẽ. Giữ Shift để vẽ hình vuông/tròn hoặc đường thẳng góc 45°. Chỉnh được màu nét, màu nền (ô gạch đỏ = không tô nền), độ dày nét, độ đậm. |
| **Che vùng** (W) | Kéo chuột để che nội dung. |
| **Chú thích** (C) | Bấm vào trang để thêm ghi chú. |
| **Sửa chữ gốc** (E) | Bấm vào dòng chữ có khung xanh để sửa. Tick “Nền trắng” nếu muốn tô trắng vùng chữ cũ. Không dùng được với PDF ảnh scan (xem mục 3). |

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

**Thanh thuộc tính** (hàng thứ hai) thay đổi theo công cụ hoặc đối tượng đang chọn: màu (có các ô màu gợi ý, bấm ô vuông màu để chọn màu bất kỳ), cỡ chữ, font, độ dày nét… Nếu đang chọn một đối tượng thì thay đổi áp dụng ngay cho đối tượng đó và được ghi nhớ làm mặc định cho lần vẽ sau.

**Các nút bên phải thanh công cụ**

- **Xuất PDF**: tải về `<tên>_edited.pdf`
- **Lưu dự án** / **Mở dự án**: lưu và mở lại file `.pdfedit.json`, chứa PDF gốc cùng mọi phần đã thêm
- **Word ▾**
  - **PDF gốc → Word**: chuyển file PDF ban đầu
  - **PDF đã chỉnh → Word**: chuyển bản PDF có cả các phần đã thêm
  - **Word → PDF**: chuyển một file `.docx` sang PDF

### Giới hạn
- PDF dạng **ảnh scan** không sửa chữ gốc được (xem mục 3).
- Chuyển PDF → Word giữ bố cục ở mức tốt, nhưng với bảng biểu phức tạp có thể cần chỉnh lại.
- File tải lên tối đa 300 MB.

---

## 5. Cấu trúc thư mục

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
├── lan-setup.bat        Mở tường lửa cổng 5000 cho mạng nội bộ, in địa chỉ truy cập
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
