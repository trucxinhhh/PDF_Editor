"""
PDF Editor - server Flask
Chạy:  python app.py   rồi mở http://127.0.0.1:5000
"""
import base64
import io
import math
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import webbrowser

import fitz  # PyMuPDF
from flask import Flask, jsonify, request, send_file, send_from_directory

# Windows đôi khi gán sai MIME cho .js/.mjs -> trình duyệt từ chối chạy module
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
WORK_DIR = os.environ.get("WORK_DIR") or os.path.join(tempfile.gettempdir(), "pdf_editor_uploads")
os.makedirs(WORK_DIR, exist_ok=True)

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024  # 300 MB


# ----------------------------------------------------------------- tiện ích
def cleanup_old(max_age_hours=24):
    now = time.time()
    for name in os.listdir(WORK_DIR):
        p = os.path.join(WORK_DIR, name)
        try:
            if now - os.path.getmtime(p) > max_age_hours * 3600:
                os.remove(p)
        except OSError:
            pass


_last_cleanup = [0.0]


def maybe_cleanup():
    if time.time() - _last_cleanup[0] > 3600:
        _last_cleanup[0] = time.time()
        cleanup_old(float(os.environ.get("KEEP_HOURS", 24)))


def doc_path(doc_id):
    if not doc_id or not all(c in "0123456789abcdef" for c in doc_id):
        raise ValueError("doc id không hợp lệ")
    p = os.path.join(WORK_DIR, doc_id + ".pdf")
    if not os.path.exists(p):
        raise FileNotFoundError("Không tìm thấy file trên server, hãy mở lại PDF.")
    return p


def hex_to_rgb(h, default=(0, 0, 0)):
    try:
        h = (h or "").lstrip("#")
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    except Exception:
        return default


# Font có hỗ trợ tiếng Việt. Ưu tiên thư mục ./fonts, sau đó font hệ thống.
FONT_CANDIDATES = {
    ("sans", False): ["fonts/sans.ttf", "C:/Windows/Fonts/arial.ttf", "/Library/Fonts/Arial.ttf",
                      "/System/Library/Fonts/Supplemental/Arial.ttf",
                      "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
                      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
    ("sans", True): ["fonts/sans-bold.ttf", "C:/Windows/Fonts/arialbd.ttf", "/Library/Fonts/Arial Bold.ttf",
                     "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
                     "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
                     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
    ("serif", False): ["fonts/serif.ttf", "C:/Windows/Fonts/times.ttf", "/Library/Fonts/Times New Roman.ttf",
                       "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
                       "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
                       "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"],
    ("serif", True): ["fonts/serif-bold.ttf", "C:/Windows/Fonts/timesbd.ttf",
                      "/Library/Fonts/Times New Roman Bold.ttf",
                      "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
                      "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
                      "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"],
}
_font_cache = {}


def get_font(family, bold):
    key = (family if family in ("sans", "serif") else "sans", bool(bold))
    if key in _font_cache:
        return _font_cache[key]
    result = None
    for cand in FONT_CANDIDATES[key]:
        p = cand if os.path.isabs(cand) else os.path.join(BASE_DIR, cand)
        if os.path.exists(p):
            f = fitz.Font(fontfile=p)
            result = {"file": p, "name": "F%s%s" % (key[0], "B" if key[1] else "R"),
                      "asc": f.ascender, "desc": f.descender}
            break
    if result is None:  # không tìm thấy -> font có sẵn (không đủ dấu tiếng Việt)
        result = {"file": None, "name": "hebo" if key[1] else "helv", "asc": 0.905, "desc": -0.212}
    _font_cache[key] = result
    return result


LINE_HEIGHT = 1.2  # phải khớp với CSS line-height của .ann-text


def draw_text(page, ann, x, y, text):
    """Vẽ text sao cho khớp với hộp text CSS (top-left = x,y; line-height 1.2)."""
    size = float(ann.get("size", 14))
    font = get_font(ann.get("font", "sans"), ann.get("bold"))
    color = hex_to_rgb(ann.get("color"))
    asc, desc = font["asc"], font["desc"]
    first_baseline = ((LINE_HEIGHT - (asc - desc)) / 2 + asc) * size
    m = page.derotation_matrix
    for i, line in enumerate(text.split("\n")):
        if not line.strip():
            continue
        pt = fitz.Point(x, y + first_baseline + i * LINE_HEIGHT * size) * m
        kw = dict(fontsize=size, fontname=font["name"], color=color, rotate=page.rotation)
        if font["file"]:
            kw["fontfile"] = font["file"]
        page.insert_text(pt, line, **kw)


def to_page_rect(page, x, y, w, h):
    r = fitz.Rect(x, y, x + w, y + h) * page.derotation_matrix
    r.normalize()
    return r


def _arrow_head(p1, p2, sw):
    """Giống arrowHead() ở frontend: trả về (điểm gốc của đầu mũi tên, 3 đỉnh tam giác)."""
    L = max(8.0, sw * 4)
    hw = L * 0.45
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    length = math.hypot(dx, dy) or 1.0
    ux, uy = dx / length, dy / length
    l = min(L, length * 0.9)
    k = l / L
    bx, by = p2[0] - ux * l, p2[1] - uy * l
    return (bx, by), [p2, (bx - uy * hw * k, by + ux * hw * k), (bx + uy * hw * k, by - ux * hw * k)]


def draw_shape(page, a):
    m = page.derotation_matrix
    sh = page.new_shape() if hasattr(page, "new_shape") else page.newShape()
    sw = max(float(a.get("width", 2) or 0), 0)
    color = hex_to_rgb(a.get("color"), (1, 0, 0))
    fill = hex_to_rgb(a.get("fill")) if a.get("fill") else None
    op = float(a.get("opacity", 1))
    kind = a.get("kind", "rect")
    pt = lambda p: fitz.Point(float(p[0]), float(p[1])) * m

    if kind in ("rect", "ellipse"):
        x, y, w, h = (float(a.get(k, 0)) for k in ("x", "y", "w", "h"))
        r = to_page_rect(page, x + sw / 2, y + sw / 2, max(w - sw, 0.1), max(h - sw, 0.1))
        if kind == "rect":
            sh.draw_rect(r)
        else:
            sh.draw_oval(r)
        if sw <= 0 and fill is None:
            return
        sh.finish(color=color if sw > 0 else None, fill=fill, width=sw,
                  stroke_opacity=op, fill_opacity=op, lineJoin=1)
    else:
        pts = [(float(p[0]), float(p[1])) for p in a.get("pts") or []]
        if len(pts) < 2:
            return
        if kind == "pen":
            sh.draw_polyline([pt(p) for p in pts])
            sh.finish(color=color, width=sw, lineCap=1, lineJoin=1, closePath=False, stroke_opacity=op)
        else:
            p1, p2 = pts[0], pts[-1]
            if kind == "arrow":
                base, tri = _arrow_head(p1, p2, sw)
                if sw > 0:
                    sh.draw_line(pt(p1), pt(base))
                    sh.finish(color=color, width=sw, lineCap=1, stroke_opacity=op)
                sh.draw_polyline([pt(p) for p in tri] + [pt(tri[0])])
                sh.finish(color=None, fill=color, closePath=True, fill_opacity=op, stroke_opacity=op)
            else:
                sh.draw_line(pt(p1), pt(p2))
                sh.finish(color=color, width=sw, lineCap=1, stroke_opacity=op)
    sh.commit(overlay=True)


def apply_annotations(doc, anns):
    by_page = {}
    for a in anns or []:
        by_page.setdefault(int(a.get("page", 0)), []).append(a)

    for pno, items in by_page.items():
        if pno < 0 or pno >= doc.page_count:
            continue
        page = doc[pno]

        # 1) Sửa chữ gốc: xoá chữ cũ bằng redaction (giữ ảnh và hình nền)
        edits = [a for a in items if a.get("type") == "edit"]
        if edits:
            for a in edits:
                ox, oy, ow, oh = (float(a[k]) for k in ("ox", "oy", "ow", "oh"))
                inset = oh * 0.15  # tránh ăn vào dòng trên/dưới
                r = to_page_rect(page, ox, oy + inset, ow, max(oh - 2 * inset, 1))
                fill = (1, 1, 1) if a.get("whiteBg") else False
                page.add_redact_annot(r, fill=fill)
            try:
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE,
                                      graphics=fitz.PDF_REDACT_LINE_ART_NONE)
            except (TypeError, AttributeError):  # PyMuPDF cũ
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

        # 2) Nội dung vẽ đè, theo đúng thứ tự người dùng tạo
        for a in items:
            t = a.get("type")
            x, y = float(a.get("x", 0)), float(a.get("y", 0))
            w, h = float(a.get("w", 0)), float(a.get("h", 0))
            if t == "whiteout":
                page.draw_rect(to_page_rect(page, x, y, w, h), color=None,
                               fill=hex_to_rgb(a.get("color"), (1, 1, 1)), width=0, overlay=True)
            elif t == "image":
                src = a.get("src", "")
                data = base64.b64decode(src.split(",", 1)[1] if "," in src else src)
                page.insert_image(to_page_rect(page, x, y, w, h), stream=data,
                                  keep_proportion=False, overlay=True, rotate=page.rotation)
            elif t == "shape":
                draw_shape(page, a)
            elif t in ("text", "edit"):
                if t == "text" and a.get("bg"):
                    page.draw_rect(to_page_rect(page, x, y, w, h), color=None,
                                   fill=hex_to_rgb(a.get("bg"), (1, 1, 1)), width=0, overlay=True)
                text = a.get("text", "")
                if text:
                    draw_text(page, a, x, y, text)

        # 3) Annotation PDF chuẩn (vẫn sửa/xoá được trong Acrobat, Foxit...)
        for a in items:
            t = a.get("type")
            x, y = float(a.get("x", 0)), float(a.get("y", 0))
            w, h = float(a.get("w", 0)), float(a.get("h", 0))
            if t == "highlight":
                rects = a.get("rects") or [{"x": x, "y": y, "w": w, "h": h}]
                quads = [to_page_rect(page, float(r["x"]), float(r["y"]), float(r["w"]), float(r["h"]))
                         for r in rects]
                style = a.get("style", "highlight")
                if style == "underline":
                    annot = page.add_underline_annot(quads)
                elif style == "strike":
                    annot = page.add_strikeout_annot(quads)
                else:
                    annot = page.add_highlight_annot(quads)
                if annot is None:
                    continue
                annot.set_colors(stroke=hex_to_rgb(a.get("color"), (1, 1, 0)))
                if style == "highlight":
                    annot.set_opacity(float(a.get("opacity", 0.4)))
                annot.update()
            elif t == "comment":
                pt = fitz.Point(x, y) * page.derotation_matrix
                annot = page.add_text_annot(pt, a.get("text", ""), icon="Comment")
                annot.set_info(title=a.get("author") or "PDF Editor", content=a.get("text", ""))
                annot.set_colors(stroke=hex_to_rgb(a.get("color"), (1, 0.85, 0.2)))
                annot.update()
    return doc


def build_edited_pdf(doc_id, anns):
    doc = fitz.open(doc_path(doc_id))
    apply_annotations(doc, anns)
    try:
        doc.subset_fonts()  # chỉ nhúng các ký tự đã dùng -> file nhỏ
    except Exception:
        pass
    buf = io.BytesIO()
    doc.save(buf, garbage=3, deflate=True)
    doc.close()
    buf.seek(0)
    return buf


def err(msg, code=400):
    return jsonify({"error": str(msg)}), code


# ----------------------------------------------------------------- routes
@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/static/<path:path>")
def static_files(path):
    resp = send_from_directory(STATIC_DIR, path)
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.post("/api/upload")
def upload():
    f = request.files.get("file")
    if not f:
        return err("Chưa chọn file")
    data = f.read()
    try:
        d = fitz.open(stream=data, filetype="pdf")
        pages = d.page_count
        if d.needs_pass:
            return err("PDF có mật khẩu, hãy bỏ mật khẩu trước.")
        d.close()
    except Exception as e:
        return err("File không phải PDF hợp lệ: %s" % e)
    maybe_cleanup()
    doc_id = uuid.uuid4().hex
    with open(os.path.join(WORK_DIR, doc_id + ".pdf"), "wb") as out:
        out.write(data)
    return jsonify({"id": doc_id, "pages": pages})


@app.post("/api/export")
def export_pdf():
    body = request.get_json(force=True)
    try:
        buf = build_edited_pdf(body.get("id"), body.get("anns", []))
    except Exception as e:
        app.logger.exception("export")
        return err(e, 500)
    name = (body.get("name") or "document").rsplit(".", 1)[0] + "_edited.pdf"
    return send_file(buf, mimetype="application/pdf", as_attachment=True, download_name=name)


@app.post("/api/docx")
def to_docx():
    try:
        from pdf2docx import Converter
    except ImportError:
        return err("Chưa cài pdf2docx (pip install pdf2docx)", 500)
    body = request.get_json(force=True)
    tmpdir = tempfile.mkdtemp(dir=WORK_DIR)
    try:
        src = doc_path(body.get("id"))
        if body.get("applyEdits"):
            p = os.path.join(tmpdir, "edited.pdf")
            with open(p, "wb") as fh:
                fh.write(build_edited_pdf(body.get("id"), body.get("anns", [])).getvalue())
            src = p
        out = os.path.join(tmpdir, "out.docx")
        cv = Converter(src)
        try:
            cv.convert(out)
        finally:
            cv.close()
        with open(out, "rb") as fh:
            data = io.BytesIO(fh.read())
    except Exception as e:
        app.logger.exception("docx")
        return err(e, 500)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    name = (body.get("name") or "document").rsplit(".", 1)[0] + ".docx"
    return send_file(data, as_attachment=True, download_name=name,
                     mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document")


def find_soffice():
    for c in [shutil.which("soffice"), shutil.which("libreoffice"),
              r"C:\Program Files\LibreOffice\program\soffice.exe",
              r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
              "/Applications/LibreOffice.app/Contents/MacOS/soffice"]:
        if c and os.path.exists(c):
            return c
    return None


@app.post("/api/docx2pdf")
def docx_to_pdf():
    f = request.files.get("file")
    if not f:
        return err("Chưa chọn file .docx")
    tmpdir = tempfile.mkdtemp(dir=WORK_DIR)
    src = os.path.join(tmpdir, "in.docx")
    out = os.path.join(tmpdir, "in.pdf")
    f.save(src)
    errors = []
    try:
        # Cách 1: Microsoft Word (Windows / macOS) qua docx2pdf
        if sys.platform in ("win32", "darwin"):
            try:
                if sys.platform == "win32":
                    import pythoncom
                    pythoncom.CoInitialize()
                from docx2pdf import convert
                convert(src, out)
            except Exception as e:
                errors.append("Word: %s" % e)
        # Cách 2: LibreOffice
        if not os.path.exists(out):
            so = find_soffice()
            if so:
                profile = "file:///" + os.path.join(tmpdir, "lo_profile").replace("\\", "/").lstrip("/")
                subprocess.run([so, "-env:UserInstallation=" + profile, "--headless",
                                "--convert-to", "pdf", "--outdir", tmpdir, src],
                               check=False, timeout=180, capture_output=True)
            else:
                errors.append("Không tìm thấy LibreOffice")
        if not os.path.exists(out):
            return err("Không chuyển được DOCX → PDF. Cần cài Microsoft Word hoặc LibreOffice. ("
                       + "; ".join(errors) + ")", 500)
        with open(out, "rb") as fh:
            data = io.BytesIO(fh.read())
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    name = (f.filename or "document").rsplit(".", 1)[0] + ".pdf"
    return send_file(data, mimetype="application/pdf", as_attachment=True, download_name=name)


@app.get("/api/health")
def health():
    fonts = {"%s-%s" % (k[0], "bold" if k[1] else "regular"): get_font(*k)["file"] for k in FONT_CANDIDATES}
    return jsonify({"ok": True, "pymupdf": fitz.VersionBind, "fonts": fonts,
                    "libreoffice": find_soffice()})


def lan_addresses():
    """Các địa chỉ IPv4 trong mạng nội bộ của máy này."""
    import socket
    ips = []
    try:  # địa chỉ của card mạng đang dùng (không gửi dữ liệu đi đâu)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    return [ip for ip in ips if not ip.startswith("127.") and not ip.startswith("169.254.")]


if __name__ == "__main__":
    maybe_cleanup()
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", 5000))
    url = "http://127.0.0.1:%d" % port
    if "--no-browser" not in sys.argv and not os.environ.get("NO_BROWSER"):
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    print("PDF Editor đang chạy tại", url, "(Ctrl+C để dừng)")
    if host in ("0.0.0.0", "::"):
        ips = lan_addresses()
        if ips:
            print("Các máy khác trong mạng nội bộ truy cập bằng:")
            for ip in ips:
                print("    http://%s:%d" % (ip, port))
        print("(Nếu máy khác không vào được: chạy lan-setup.bat để mở tường lửa cổng %d)" % port)
    app.run(host=host, port=port, debug=False, threaded=True)
