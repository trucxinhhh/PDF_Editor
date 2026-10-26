# ---------------------------------------------------------------
# PDF Editor - Docker image
#   docker build -t pdf-editor .
#   docker run -d -p 127.0.0.1:5000:5000 --name pdf-editor pdf-editor
# ---------------------------------------------------------------
FROM python:3.12-slim-bookworm

# true  = cài LibreOffice để dùng chức năng Word (.docx) -> PDF (image ~ +400MB)
# false = image nhỏ gọn, mọi chức năng khác vẫn chạy
ARG WITH_LIBREOFFICE=true

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HOST=0.0.0.0 \
    PORT=5000 \
    NO_BROWSER=1 \
    WORK_DIR=/data/uploads \
    KEEP_HOURS=24 \
    GUNICORN_WORKERS=2 \
    GUNICORN_THREADS=4 \
    HOME=/tmp

# Font hỗ trợ tiếng Việt (Liberation = tương đương Arial/Times New Roman) + thư viện hệ thống cho OpenCV (pdf2docx)
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      fonts-liberation fonts-dejavu-core fontconfig libglib2.0-0 libgomp1 \
 && if [ "$WITH_LIBREOFFICE" = "true" ]; then \
      apt-get install -y --no-install-recommends libreoffice-writer-nogui ; \
    fi \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app.py ./
COPY static ./static
COPY fonts ./fonts

RUN useradd --create-home --uid 1000 appuser \
 && mkdir -p /data/uploads \
 && chown -R appuser:appuser /data
USER appuser

VOLUME ["/data"]
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,os; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT','5000'), timeout=4)" || exit 1

CMD ["sh", "-c", "exec gunicorn app:app --bind ${HOST}:${PORT} --workers ${GUNICORN_WORKERS} --threads ${GUNICORN_THREADS} --timeout 600 --access-logfile -"]
