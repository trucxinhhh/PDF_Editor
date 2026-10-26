import * as pdfjsLib from './lib/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/static/lib/pdf.worker.min.mjs';

/* =========================================================== state */
const $ = (s) => document.querySelector(s);
const ZOOMS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const CLIP_MARK = '⁣PDFEDIT_ANN⁣';
const FONT_CSS = {
  sans: 'Arial, "Liberation Sans", Helvetica, sans-serif',
  serif: '"Times New Roman", "Liberation Serif", Times, serif',
};
const EDIT_TOP = 0.94;   // khoảng cách top hộp chữ -> baseline (x cỡ chữ), line-height 1.2

const state = {
  docId: null, name: '', bytes: null, pdf: null,
  pages: [], anns: [], scale: 1.25,
  pageSel: new Set(), pageAnchor: null, textCache: {},
  search: { open: false, q: '', results: [], idx: -1, token: 0 },
  tool: 'select', sel: null, editing: null,
  undo: [], redo: [], clip: null, pendingImage: null, dirty: false,
  defaults: {
    text: { color: '#000000', size: 14, font: 'sans', bold: false },
    highlight: { color: '#ffeb3b', opacity: 0.4, style: 'highlight', mode: 'line' },
    whiteout: { color: '#ffffff' },
    comment: { color: '#ffd23f' },
    shape: { kind: 'rect', color: '#e53935', fill: null, width: 2, opacity: 1 },
    edit: { whiteBg: false },
  },
};

/* Bảng màu gợi ý theo loại đối tượng */
const PALETTES = {
  text: ['#000000', '#616161', '#ffffff', '#e53935', '#d81b60', '#8e24aa', '#3949ab', '#1e88e5', '#00897b', '#43a047', '#f9a825', '#fb8c00'],
  highlight: ['#ffeb3b', '#ffd54f', '#c5e1a5', '#80deea', '#90caf9', '#f48fb1', '#ce93d8', '#ffab91', '#ff5252', '#b0bec5'],
  whiteout: ['#ffffff', '#000000', '#f5f5f5', '#fafafa', '#fff8e1', '#eceff1'],
  comment: ['#ffd23f', '#ffab91', '#a5d6a7', '#81d4fa', '#ce93d8', '#f48fb1'],
  fill: [null, '#ffffff', '#000000', '#fff59d', '#ffcdd2', '#c8e6c9', '#bbdefb', '#e1bee7', '#ffe0b2', '#eeeeee'],
};
PALETTES.edit = PALETTES.text;
PALETTES.shape = PALETTES.text;
const KIND_LABEL = { text: 'Văn bản', edit: 'Sửa chữ gốc', highlight: 'Highlight', whiteout: 'Che vùng', comment: 'Chú thích',
  shape: 'Hình', image: 'Ảnh' };
const SHAPE_LABEL = { rect: 'Hình chữ nhật', ellipse: 'Hình elip', line: 'Đường thẳng', arrow: 'Mũi tên', pen: 'Bút vẽ' };
const measureCtx = document.createElement('canvas').getContext('2d');
const els = new Map();   // ann.id -> element
let observer = null;
let uid = Date.now();
const newId = () => 'a' + (uid++).toString(36);

const HINTS = {
  select: 'Chọn: bấm vào đối tượng để chọn/kéo, nhấp đúp vào chữ để sửa. Bôi đen chữ trong PDF để copy (Ctrl+C).',
  text: 'Văn bản: bấm vào vị trí trên trang rồi gõ chữ. Enter để xuống dòng, Esc để xong.',
  image: 'Ảnh: chọn file ảnh rồi bấm vào trang để đặt. Có thể dán ảnh trực tiếp bằng Ctrl+V.',
  highlight: 'Highlight: kéo trên chữ để tô theo dòng (tự bắt theo từng ký tự), bấm 1 lần vào dòng để tô cả dòng. Kéo ở vùng trống để tô vùng tự do.',
  shape: 'Hình: chọn loại hình ở thanh bên dưới rồi kéo chuột trên trang. Giữ Shift để vẽ hình vuông/tròn hoặc đường thẳng góc 45°.',
  whiteout: 'Che vùng: kéo chuột để che nội dung (đổi màu ở ô Màu).',
  comment: 'Chú thích: bấm vào trang để thêm ghi chú (sticky note, hiện trong Acrobat/Foxit).',
  edit: 'Sửa chữ gốc: bấm vào một dòng chữ có khung xanh để sửa trực tiếp nội dung đó.',
};

/* =========================================================== helpers */
function toast(msg, isError = false, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg; t.className = isError ? 'error' : ''; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}
function busy(on, text = 'Đang xử lý…') { busy.on = on; $('#busy').hidden = !on; $('#busyText').textContent = text; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (arr) => arr.map((a) => ({ ...a }));
const findAnn = (id) => state.anns.find((a) => a.id === id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const isTyping = (t) => t && (t.closest('input,textarea,select,[contenteditable="true"]'));

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function b64FromBytes(bytes) {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
function bytesFromB64(b64) {
  const s = atob(b64); const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function readAsDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}
function imageSize(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = rej; i.src = src; });
}
async function api(url, body, isForm = false) {
  const r = await fetch(url, isForm ? { method: 'POST', body } :
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    let msg = r.status + ' ' + r.statusText;
    try { msg = (await r.json()).error || msg; } catch (_) {}
    throw new Error(msg);
  }
  return r;
}

/* =========================================================== open documents */
async function uploadBytes(bytes, name) {
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type: 'application/pdf' }), name || 'document.pdf');
  return (await api('/api/upload', fd, true)).json();          // {id, pages}
}
async function fetchDocBytes(docId) {
  const r = await fetch('/api/file/' + docId);
  if (!r.ok) throw new Error('Không tải được tài liệu từ server');
  return new Uint8Array(await r.arrayBuffer());
}
/* nạp tài liệu vào trình xem. fresh=true: tài liệu mới mở (xoá lịch sử) */
async function loadDoc({ docId, bytes, name, anns = [], fresh = false }) {
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
  try { state.pdf && (state.pdf.loadingTask ? state.pdf.loadingTask.destroy() : state.pdf.cleanup()); } catch (_) {}
  const keep = fresh ? { undo: [], redo: [], dirty: false } : { undo: state.undo, redo: state.redo, dirty: true };
  Object.assign(state, { docId, name, bytes, pdf, anns, pages: [], sel: null, editing: null, textCache: {} }, keep);
  if (fresh) {
    $('#scanBanner').hidden = true;
    notifyScanned._shown = false;
    state.pageSel = new Set(); state.pageAnchor = null;
  } else {
    state.pageSel = new Set([...(state.pageSel || [])].filter((i) => i < pdf.numPages));
  }
  state.search.results = []; state.search.idx = -1;
  document.title = name + ' – PDF Editor';
  document.body.classList.add('has-doc');
  await buildPages();
  buildThumbs();
  updateButtons();
  if (state.search.open && state.search.q) runSearch(false);
}
async function openPdfBytes(bytes, name, anns = []) {
  busy(true, 'Đang mở PDF…');
  try {
    const info = await uploadBytes(bytes, name);
    await loadDoc({ docId: info.id, bytes, name, anns, fresh: true });
    setTool('select');
  } catch (e) {
    console.error(e); toast('Không mở được file: ' + e.message, true, 6000);
  } finally { busy(false); }
}
async function openPdfFile(file) { return openPdfFiles([file]); }
/* mở 1 file, hoặc nhiều file -> ghép thành 1 tài liệu */
async function openPdfFiles(files) {
  files = [...files].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (!files.length) return;
  if (state.dirty && !confirm('Các thay đổi chưa lưu sẽ mất. Tiếp tục mở file mới?')) return;
  if (files.length === 1) return openPdfBytes(new Uint8Array(await files[0].arrayBuffer()), files[0].name);
  busy(true, `Đang ghép ${files.length} file PDF…`);
  try {
    const specs = [];
    for (const f of files) {
      const info = await uploadBytes(new Uint8Array(await f.arrayBuffer()), f.name);
      for (let n = 0; n < info.pages; n++) specs.push({ src: info.id, page: n });
    }
    const res = await (await api('/api/compose', { pages: specs })).json();
    const bytes = await fetchDocBytes(res.id);
    const name = files[0].name.replace(/\.pdf$/i, '') + '_ghep.pdf';
    await loadDoc({ docId: res.id, bytes, name, anns: [], fresh: true });
    setTool('select');
    toast(`Đã ghép ${files.length} file thành ${res.pages} trang`);
  } catch (e) {
    console.error(e); toast('Không ghép được file: ' + e.message, true, 7000);
  } finally { busy(false); }
}

async function openProjectFile(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'pdf-editor' || !data.pdf) throw new Error('Không phải file dự án PDF Editor');
    await openPdfBytes(bytesFromB64(data.pdf), data.name || 'document.pdf', data.anns || []);
    toast('Đã mở dự án: ' + (data.anns || []).length + ' đối tượng');
  } catch (e) { toast('Lỗi mở dự án: ' + e.message, true, 6000); }
}

function saveProject() {
  if (!state.pdf) return;
  finishEditing();
  const data = { app: 'pdf-editor', version: 1, name: state.name, savedAt: new Date().toISOString(),
    pdf: b64FromBytes(state.bytes), anns: state.anns };
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }),
    state.name.replace(/\.pdf$/i, '') + '.pdfedit.json');
  state.dirty = false;
  toast('Đã lưu dự án. Dùng "Mở dự án" để sửa tiếp sau này.');
}

/* =========================================================== pages */
async function buildPages() {
  const container = $('#pages');
  const viewer = $('#viewer');
  const ratio = viewer.scrollHeight ? viewer.scrollTop / viewer.scrollHeight : 0;
  if (observer) observer.disconnect();
  container.innerHTML = '';
  els.clear();
  const old = state.pages;
  state.pages = [];
  for (let i = 0; i < state.pdf.numPages; i++) {
    let w, h;
    if (old[i] && old[i].w) { w = old[i].w; h = old[i].h; }
    else {
      const pg = await state.pdf.getPage(i + 1);
      const vp = pg.getViewport({ scale: 1 }); w = vp.width; h = vp.height;
    }
    const el = document.createElement('div');
    el.className = 'page'; el.dataset.index = i;
    el.style.width = w * state.scale + 'px'; el.style.height = h * state.scale + 'px';
    el.style.setProperty('--total-scale-factor', state.scale);
    el.innerHTML = '<canvas class="render"></canvas><div class="textLayer"></div><div class="overlay"><div class="hits"></div></div>' +
      `<div class="page-num">${i + 1} / ${state.pdf.numPages}</div>`;
    const p = { index: i, w, h, el, canvas: el.querySelector('canvas'), textLayer: el.querySelector('.textLayer'),
      overlay: el.querySelector('.overlay'), hits: el.querySelector('.hits'),
      items: old[i] ? old[i].items : null, scanned: old[i] ? old[i].scanned : false, rendered: false, rendering: null };
    p.overlay.addEventListener('pointerdown', (e) => onOverlayDown(e, p));
    p.textLayer.addEventListener('mousedown', () => p.textLayer.classList.add('selecting'));
    container.appendChild(el);
    state.pages.push(p);
  }
  observer = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) renderPage(state.pages[+en.target.dataset.index]);
  }, { root: viewer, rootMargin: '600px 0px' });
  state.pages.forEach((p) => observer.observe(p.el));
  state.anns.forEach(renderAnn);
  $('#zoomLabel').textContent = Math.round(state.scale * 100) + '%';
  viewer.scrollTop = ratio * viewer.scrollHeight;
  updatePageInfo();
}

async function renderPage(p) {
  if (p.rendered || p.rendering) return;
  p.rendering = (async () => {
    const page = await state.pdf.getPage(p.index + 1);
    const scale = state.scale;
    const vp = page.getViewport({ scale });
    const dpr = window.devicePixelRatio || 1;
    p.canvas.width = Math.floor(vp.width * dpr);
    p.canvas.height = Math.floor(vp.height * dpr);
    await page.render({ canvasContext: p.canvas.getContext('2d'), viewport: vp,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
    if (scale !== state.scale) return;   // đã zoom trong lúc render
    const tc = await page.getTextContent();
    p.textLayer.innerHTML = '';
    const tl = new pdfjsLib.TextLayer({ textContentSource: tc, container: p.textLayer, viewport: vp });
    await tl.render();
    p.textDivs = tl.textDivs;
    if (!state.textCache[p.index]) buildPageText(p.index, tc);
    const eoc = document.createElement('div'); eoc.className = 'endOfContent'; p.textLayer.appendChild(eoc);
    if (!p.items) {
      p.items = extractItems(page, tc);
      // trang không có chữ thật nhưng có hình ảnh -> PDF dạng ảnh scan
      p.scanned = !p.items.length && tc.items.every((it) => !it.str || !it.str.trim());
      if (p.scanned) notifyScanned(p, 'open');
    }
    buildHits(p);
    p.rendered = true;
    drawSearchHits(p);
  })().catch((e) => console.error('render page', p.index, e)).finally(() => (p.rendering = null));
}

function extractItems(page, tc) {
  const vp1 = page.getViewport({ scale: 1 });
  const out = [];
  tc.items.forEach((it, idx) => {
    if (!it.str || !it.str.trim()) return;
    const tx = pdfjsLib.Util.transform(vp1.transform, it.transform);
    if (Math.abs(tx[1]) > 0.01 || Math.abs(tx[2]) > 0.01 || tx[0] <= 0) return; // chỉ chữ nằm ngang
    const size = Math.hypot(tx[2], tx[3]);
    if (size < 2) return;
    let fname = '';
    try { fname = page.commonObjs.get(it.fontName)?.name || ''; } catch (_) {}
    const family = (tc.styles[it.fontName]?.fontFamily || '');
    out.push({
      key: page.pageNumber - 1 + ':' + idx, str: it.str, x: tx[4], baseline: tx[5], size,
      w: it.width || size * it.str.length * 0.5,
      font: /times|serif|roman|cambria|georgia|garamond/i.test(fname) || (family === 'serif' && !/arial|helvet|sans|calibri|verdana|tahoma|segoe/i.test(fname)) ? 'serif' : 'sans',
      bold: /bold|black|heavy|semibold|demi/i.test(fname),
    });
  });
  return out;
}

function itemBox(it) {
  return { x: it.x - 1, y: it.baseline - it.size * 0.9, w: it.w + 2, h: it.size * 1.15 };
}

/* =========================================================== PDF ảnh scan: chỉ thông báo */
function scannedPages() { return state.pages.filter((p) => p.scanned); }
function notifyScanned(p, reason) {
  if (reason === 'open' && notifyScanned._shown) return;
  notifyScanned._shown = true;
  const where = state.pages.length === 1 || reason === 'open' ? 'PDF này' : `Trang ${p.index + 1}`;
  const what = reason === 'highlight' ? 'Highlight chỉ tô được theo vùng tự do (không tô theo dòng chữ).'
    : `Không thể dùng “Sửa chữ gốc” hay bôi đen để copy chữ trên ${reason === 'open' && state.pages.length > 1 ? 'những trang đó' : 'trang này'}.`;
  $('#scanBannerText').textContent = `${where} ${reason === 'open' && state.pages.length > 1 ? 'có trang ' : ''}là ảnh scan (chỉ có hình ảnh, không có chữ thật). ${what} ` +
    'Bạn vẫn có thể thêm văn bản, ảnh, hình vẽ, che vùng và chú thích như bình thường.';
  $('#scanBanner').hidden = false;
}

function buildHits(p) {
  p.hits.innerHTML = '';
  const s = state.scale;
  for (const it of p.items || []) {
    const d = document.createElement('div');
    d.className = 'hit';
    d.title = it.str;
    const r = itemBox(it);
    d.style.left = r.x * s + 'px';
    d.style.top = r.y * s + 'px';
    d.style.width = r.w * s + 'px';
    d.style.height = r.h * s + 'px';
    d.dataset.key = it.key;
    p.hits.appendChild(d);
  }
}

function currentPageIndex() {
  const v = $('#viewer').getBoundingClientRect();
  const mid = v.top + v.height / 2;
  let best = 0, bestDist = Infinity;
  state.pages.forEach((p, i) => {
    const r = p.el.getBoundingClientRect();
    const d = mid < r.top ? r.top - mid : mid > r.bottom ? mid - r.bottom : 0;
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return best;
}
function updatePageInfo() {
  const cur = state.pdf ? currentPageIndex() : -1;
  $('#pageInfo').textContent = state.pdf ? `Trang ${cur + 1} / ${state.pdf.numPages}` : '';
  markCurrentThumb(cur);
}
function visibleCenter(p) {
  const v = $('#viewer').getBoundingClientRect();
  const r = p.el.getBoundingClientRect();
  const top = Math.max(v.top, r.top), bottom = Math.min(v.bottom, r.bottom);
  const y = ((top + bottom) / 2 - r.top) / state.scale;
  return { x: p.w / 2, y: clamp(y, 20, p.h - 20) };
}

function setZoom(z) {
  if (!state.pdf) return;
  finishEditing();
  state.scale = clamp(z, ZOOMS[0], ZOOMS[ZOOMS.length - 1]);
  buildPages().then(() => state.sel && select(state.sel));
}
function zoomStep(dir) {
  const i = ZOOMS.findIndex((z) => z >= state.scale - 0.001);
  setZoom(ZOOMS[clamp((i < 0 ? ZOOMS.length - 1 : i) + dir, 0, ZOOMS.length - 1)]);
}

/* =========================================================== annotations: render */
function renderAnn(a) {
  const p = state.pages[a.page];
  if (!p) return;
  let el = els.get(a.id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'ann ann-' + a.type;
    el.dataset.id = a.id;
    if (a.type === 'text' || a.type === 'edit') el.innerHTML = '<div class="content"></div>';
    else if (a.type === 'image') el.innerHTML = '<img alt="">';
    else if (a.type === 'comment') el.innerHTML = '<div class="icon">✎</div><div class="popup"><textarea placeholder="Nhập chú thích…"></textarea></div>';
    if (a.type !== 'comment') el.insertAdjacentHTML('beforeend', '<div class="handle"></div>');
    el.insertAdjacentHTML('beforeend', '<button class="del" title="Xoá">×</button>');
    if (a.type === 'edit') {
      el._cover = document.createElement('div');
      el._cover.className = 'ann-cover';
      p.overlay.insertBefore(el._cover, p.hits.nextSibling);
    }
    wireAnn(el, a.id);
    p.overlay.appendChild(el);
    els.set(a.id, el);
  }
  updateAnnEl(a);
}

function updateAnnEl(a) {
  const el = els.get(a.id); if (!el) return;
  const s = state.scale;
  el.style.left = a.x * s + 'px';
  el.style.top = a.y * s + 'px';
  if (a.type === 'text' || a.type === 'edit') {
    const c = el.querySelector('.content');
    if (state.editing !== a.id) c.textContent = a.text;
    Object.assign(el.style, { fontSize: a.size * s + 'px', color: a.color, fontFamily: FONT_CSS[a.font] || FONT_CSS.sans,
      fontWeight: a.bold ? '700' : '400', background: a.bg || 'transparent', width: '', height: '' });
    if (a.type === 'edit' && el._cover) {
      Object.assign(el._cover.style, { left: a.ox * s + 'px', top: a.oy * s + 'px', width: a.ow * s + 'px', height: a.oh * s + 'px' });
    }
    a.w = el.offsetWidth / s; a.h = el.offsetHeight / s;
  } else {
    el.style.width = a.w * s + 'px';
    el.style.height = a.h * s + 'px';
  }
  if (a.type === 'image') { const img = el.querySelector('img'); if (img.getAttribute('src') !== a.src) img.src = a.src; }
  if (a.type === 'highlight') renderHighlight(el, a);
  if (a.type === 'shape') renderShape(el, a);
  if (a.type === 'whiteout') el.style.background = a.color;
  if (a.type === 'comment') {
    el.style.width = ''; el.style.height = '';
    el.querySelector('.icon').style.background = a.color;
    const ta = el.querySelector('textarea'); if (document.activeElement !== ta) ta.value = a.text || '';
  }
}

/* ---- highlight nhiều vùng (theo dòng) */
function hlRects(a) { return a.rects && a.rects.length ? a.rects : [{ x: a.x, y: a.y, w: a.w, h: a.h }]; }
function renderHighlight(el, a) {
  const s = state.scale;
  const style = a.style || 'highlight';
  el.querySelectorAll('.hl').forEach((x) => x.remove());
  el.style.background = 'transparent';
  el.style.opacity = style === 'highlight' ? a.opacity : 1;
  el.style.mixBlendMode = style === 'highlight' ? 'multiply' : 'normal';
  const frag = document.createDocumentFragment();
  for (const r of hlRects(a)) {
    const d = document.createElement('div');
    d.className = 'hl';
    let top = r.y, h = r.h;
    if (style === 'underline') { h = Math.max(0.8, r.h * 0.07); top = r.y + r.h - h * 1.6; }
    else if (style === 'strike') { h = Math.max(0.8, r.h * 0.07); top = r.y + r.h * 0.52 - h / 2; }
    Object.assign(d.style, { left: (r.x - a.x) * s + 'px', top: (top - a.y) * s + 'px', width: r.w * s + 'px',
      height: Math.max(h * s, 1) + 'px', background: a.color });
    frag.appendChild(d);
  }
  el.insertBefore(frag, el.firstChild);
}
function bboxOfRects(rects) {
  const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w)), y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/* ---- hình vẽ */
function arrowHead(p1, p2, sw) {
  const L = Math.max(8, sw * 4), hw = L * 0.45;
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1], len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const l = Math.min(L, len * 0.9);
  const bx = p2[0] - ux * l, by = p2[1] - uy * l;
  return { base: [bx, by], pts: [p2, [bx - uy * hw * (l / L), by + ux * hw * (l / L)], [bx + uy * hw * (l / L), by - ux * hw * (l / L)]] };
}
function shapeBBox(a) {   // khung bao cho line/arrow/pen từ các điểm
  const xs = a.pts.map((p) => p[0]), ys = a.pts.map((p) => p[1]);
  const pad = a.width / 2 + (a.kind === 'arrow' ? Math.max(8, a.width * 4) * 0.5 : 0) + 3;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  a.x = x0; a.y = y0; a.w = Math.max(...xs) + pad - x0; a.h = Math.max(...ys) + pad - y0;
}
function renderShape(el, a) {
  const w = Math.max(a.w, 0.1), h = Math.max(a.h, 0.1), sw = +a.width || 0;
  const stroke = sw > 0 ? `stroke="${a.color}" stroke-width="${sw}"` : 'stroke="none"';
  let body = '';
  if (a.kind === 'rect') {
    body = `<rect x="${sw / 2}" y="${sw / 2}" width="${Math.max(w - sw, 0.1)}" height="${Math.max(h - sw, 0.1)}" fill="${a.fill || 'none'}" ${stroke}/>`;
  } else if (a.kind === 'ellipse') {
    body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.max(w / 2 - sw / 2, 0.1)}" ry="${Math.max(h / 2 - sw / 2, 0.1)}" fill="${a.fill || 'none'}" ${stroke}/>`;
  } else if (a.pts && a.pts.length) {
    const rel = a.pts.map(([x, y]) => [x - a.x, y - a.y]);
    if (a.kind === 'pen') {
      body = `<polyline points="${rel.map((p) => p.join(',')).join(' ')}" fill="none" ${stroke}/>`;
    } else {
      let [p1, p2] = [rel[0], rel[rel.length - 1]];
      if (a.kind === 'arrow') {
        const head = arrowHead(p1, p2, sw);
        body = `<line x1="${p1[0]}" y1="${p1[1]}" x2="${head.base[0]}" y2="${head.base[1]}" ${stroke}/>` +
          `<polygon points="${head.pts.map((p) => p.join(',')).join(' ')}" fill="${a.color}"/>`;
      } else body = `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" ${stroke}/>`;
    }
  }
  let svg = el.querySelector('svg');
  if (!svg) { el.insertAdjacentHTML('afterbegin', '<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"></svg>'); svg = el.querySelector('svg'); }
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.style.opacity = a.opacity ?? 1;
  svg.innerHTML = `<g stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
}

/* ---- dịch chuyển / co giãn chung cho mọi loại */
function shiftAnn(a, dx, dy) {
  a.x += dx; a.y += dy;
  if (a.pts) a.pts = a.pts.map(([x, y]) => [x + dx, y + dy]);
  if (a.rects) a.rects = a.rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }));
}
function scaleGeom(a, orig, kx, ky) {
  if (orig.pts) a.pts = orig.pts.map(([x, y]) => [a.x + (x - a.x) * kx, a.y + (y - a.y) * ky]);
  if (orig.rects) a.rects = orig.rects.map((r) => ({ x: a.x + (r.x - a.x) * kx, y: a.y + (r.y - a.y) * ky, w: r.w * kx, h: r.h * ky }));
}

function removeAnnEl(id) {
  const el = els.get(id);
  if (el) { el._cover?.remove(); el.remove(); els.delete(id); }
}
function rerenderAllAnns() {
  for (const id of [...els.keys()]) removeAnnEl(id);
  state.anns.forEach(renderAnn);
  if (state.sel && !findAnn(state.sel)) state.sel = null;
  if (state.sel) select(state.sel);
}

/* =========================================================== history */
function pushHistory(snapshot) {
  state.undo.push(snapshot || clone(state.anns));
  if (state.undo.length > 80) state.undo.shift();
  state.redo = [];
  state.dirty = true;
  updateButtons();
}
/* mục lịch sử là mảng đối tượng (thay đổi nội dung) hoặc {doc, anns} (thay đổi trang: xoá, xoay, ghép...) */
function docSnapshot() { return { doc: { bytes: state.bytes, name: state.name }, anns: clone(state.anns) }; }
async function restoreSnapshot(entry) {
  busy(true, 'Đang hoàn tác…');
  try {
    const info = await uploadBytes(entry.doc.bytes, entry.doc.name);
    await loadDoc({ docId: info.id, bytes: entry.doc.bytes, name: entry.doc.name, anns: entry.anns });
  } finally { busy(false); }
}
async function undo() {
  finishEditing();
  if (!state.undo.length || busy.on) return;
  const entry = state.undo.pop();
  if (entry && entry.doc) { state.redo.push(docSnapshot()); await restoreSnapshot(entry); }
  else { state.redo.push(clone(state.anns)); state.anns = entry; rerenderAllAnns(); }
  updateButtons(); state.dirty = true;
}
async function redo() {
  finishEditing();
  if (!state.redo.length || busy.on) return;
  const entry = state.redo.pop();
  if (entry && entry.doc) { state.undo.push(docSnapshot()); await restoreSnapshot(entry); }
  else { state.undo.push(clone(state.anns)); state.anns = entry; rerenderAllAnns(); }
  updateButtons(); state.dirty = true;
}
function updateButtons() {
  $('#btnUndo').disabled = !state.undo.length;
  $('#btnRedo').disabled = !state.redo.length;
  $('#btnDelete').disabled = !state.sel;
}

/* =========================================================== add / remove */
function addAnn(a, { history = true, selectIt = true } = {}) {
  a.id = a.id || newId();
  if (history) pushHistory();
  state.anns.push(a);
  renderAnn(a);
  if (selectIt) select(a.id);
  return a;
}
function deleteAnn(id, history = true) {
  const i = state.anns.findIndex((a) => a.id === id);
  if (i < 0) return;
  if (history) pushHistory();
  state.anns.splice(i, 1);
  removeAnnEl(id);
  if (state.sel === id) select(null);
}

function select(id) {
  if (state.sel && state.sel !== id) {
    const old = els.get(state.sel);
    if (old) old.classList.remove('selected', 'open');
  }
  state.sel = id && findAnn(id) ? id : null;
  if (state.sel) els.get(state.sel)?.classList.add('selected');
  syncProps();
  updateButtons();
}

/* =========================================================== interactions on annotations */
function wireAnn(el, id) {
  el.addEventListener('pointerdown', (e) => {
    const a = findAnn(id); if (!a || e.button !== 0) return;
    if (e.target.closest('.del')) { e.stopPropagation(); return; }
    if (e.target.closest('.popup')) { e.stopPropagation(); return; }
    if (state.editing === id) { e.stopPropagation(); return; }
    e.stopPropagation(); e.preventDefault();
    finishEditing();
    select(id);
    if (e.target.classList.contains('handle')) startResize(e, el, a);
    else startMove(e, el, a);
  });
  el.querySelector('.del').addEventListener('click', (e) => { e.stopPropagation(); deleteAnn(id); });
  el.addEventListener('dblclick', (e) => {
    const a = findAnn(id);
    if (a && (a.type === 'text' || a.type === 'edit')) { e.stopPropagation(); startEditing(a); }
  });
  const ta = el.querySelector('textarea');
  if (ta) {
    let snap = null;
    ta.addEventListener('focus', () => (snap = clone(state.anns)));
    ta.addEventListener('input', () => { const a = findAnn(id); if (a) a.text = ta.value; });
    ta.addEventListener('blur', () => {
      const a = findAnn(id);
      const before = snap && snap.find((x) => x.id === id);
      if (a && before && before.text !== a.text) pushHistory(snap);
    });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ta.blur(); el.classList.remove('open'); } });
  }
}

function startMove(e, el, a) {
  const p = state.pages[a.page];
  const sx = e.clientX, sy = e.clientY, ax = a.x, ay = a.y;
  const snap = clone(state.anns);
  let moved = false;
  el.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const dx = (ev.clientX - sx) / state.scale, dy = (ev.clientY - sy) / state.scale;
    if (!moved && Math.hypot(dx, dy) * state.scale < 3) return;
    moved = true;
    shiftAnn(a, clamp(ax + dx, -a.w + 5, p.w - 5) - a.x, clamp(ay + dy, -a.h + 5, p.h - 5) - a.y);
    updateAnnEl(a);
  };
  const up = () => {
    el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
    if (moved) pushHistory(snap);
    else if (a.type === 'comment') { el.classList.toggle('open'); if (el.classList.contains('open')) el.querySelector('textarea').focus(); }
  };
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}

function startResize(e, el, a) {
  const sx = e.clientX, sy = e.clientY;
  const w0 = a.w, h0 = a.h, size0 = a.size;
  const orig = { pts: a.pts, rects: a.rects };
  const snap = clone(state.anns);
  const handle = e.target;
  handle.setPointerCapture(e.pointerId);
  let changed = false;
  const move = (ev) => {
    changed = true;
    const dx = (ev.clientX - sx) / state.scale, dy = (ev.clientY - sy) / state.scale;
    if (a.type === 'text' || a.type === 'edit') {
      const k = Math.max((w0 + dx) / w0, 0.1);
      a.size = Math.round(clamp(size0 * k, 4, 300) * 10) / 10;
    } else if (a.type === 'image' && !ev.shiftKey) {
      const k = Math.max((w0 + dx) / w0, (h0 + dy) / h0, 8 / w0);
      a.w = w0 * k; a.h = h0 * k;
    } else if (a.type === 'shape' && ev.shiftKey && (a.kind === 'rect' || a.kind === 'ellipse')) {
      const k = Math.max((w0 + dx) / w0, (h0 + dy) / h0, 4 / w0);
      a.w = w0 * k; a.h = h0 * k;
    } else {
      a.w = Math.max(4, w0 + dx); a.h = Math.max(3, h0 + dy);
    }
    if (orig.pts || orig.rects) scaleGeom(a, orig, a.w / w0, a.h / h0);
    updateAnnEl(a);
  };
  const up = () => {
    handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
    if (changed) { pushHistory(snap); syncProps(); }
  };
  handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
}

/* ---- text editing */
function startEditing(a, isNew = false) {
  finishEditing();
  const el = els.get(a.id); if (!el) return;
  select(a.id);
  state.editing = a.id;
  el._snap = isNew ? null : clone(state.anns);
  el._isNew = isNew;
  el.classList.add('editing');
  const c = el.querySelector('.content');
  c.contentEditable = 'true';
  c.focus();
  const r = document.createRange(); r.selectNodeContents(c);
  if (!isNew) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
  const onInput = () => { a.text = readContent(c); a.w = el.offsetWidth / state.scale; a.h = el.offsetHeight / state.scale; };
  const onKey = (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); finishEditing(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); document.execCommand('insertLineBreak'); }
    ev.stopPropagation();
  };
  const onBlur = () => setTimeout(() => { if (state.editing === a.id && document.activeElement !== c) finishEditing(); }, 0);
  c.addEventListener('input', onInput); c.addEventListener('keydown', onKey); c.addEventListener('blur', onBlur);
  el._cleanup = () => { c.removeEventListener('input', onInput); c.removeEventListener('keydown', onKey); c.removeEventListener('blur', onBlur); };
}
function readContent(c) {
  let t = c.innerText.replace(/\r/g, '');
  if (t.endsWith('\n') && !c.textContent.endsWith('\n')) t = t.slice(0, -1);
  return t.replace(/ /g, ' ');
}
function finishEditing() {
  const id = state.editing; if (!id) return;
  state.editing = null;
  const el = els.get(id), a = findAnn(id);
  if (!el || !a) return;
  el._cleanup && el._cleanup();
  const c = el.querySelector('.content');
  a.text = readContent(c);
  c.contentEditable = 'false';
  el.classList.remove('editing');
  window.getSelection().removeAllRanges();
  if (a.type === 'text' && !a.text.trim()) {
    if (el._isNew) { state.undo.pop(); updateButtons(); deleteAnn(id, false); }
    else deleteAnn(id, true);
    return;
  }
  if (el._snap) {
    const before = el._snap.find((x) => x.id === id);
    if (!before || before.text !== a.text) pushHistory(el._snap);
  }
  updateAnnEl(a);
}

/* =========================================================== creating on page */
function pagePoint(e, p) {
  const r = p.el.getBoundingClientRect();
  return { x: (e.clientX - r.left) / state.scale, y: (e.clientY - r.top) / state.scale };
}

function onOverlayDown(e, p) {
  if (e.button !== 0 || state.tool === 'select') return;
  if (e.target.closest('.ann')) return;
  e.preventDefault();
  e.stopPropagation();
  finishEditing();
  const pt = pagePoint(e, p);
  const d = state.defaults;
  switch (state.tool) {
    case 'text': {
      const a = addAnn({ type: 'text', page: p.index, x: pt.x, y: pt.y - d.text.size * 0.6, text: '', ...d.text });
      setTool('select', true);
      startEditing(a, true);
      break;
    }
    case 'comment': {
      const a = addAnn({ type: 'comment', page: p.index, x: pt.x - 4, y: pt.y - 18, w: 22, h: 22, text: '', color: d.comment.color });
      setTool('select', true);
      const el = els.get(a.id); el.classList.add('open');
      el.querySelector('textarea').focus();
      break;
    }
    case 'image': {
      if (!state.pendingImage) { $('#fileImage').click(); return; }
      placeImage(state.pendingImage, p, pt.x, pt.y);
      state.pendingImage = null;
      setTool('select', true);
      break;
    }
    case 'edit': {
      const hit = e.target.closest('.hit');
      if (hit) createEditFromItem(p, hit.dataset.key);
      else if (p.scanned) notifyScanned(p, 'action');
      break;
    }
    case 'highlight':
      if (d.highlight.mode === 'line' && p.scanned) notifyScanned(p, 'highlight');
      if (d.highlight.mode === 'line' && p.items && p.items.length) {
        const loc = locateText(p, pt, true);
        if (loc) { dragTextHighlight(e, p, loc); break; }
      }
      dragRect(e, p, pt);
      break;
    case 'whiteout':
      dragRect(e, p, pt);
      break;
    case 'shape':
      drawShape(e, p, pt);
      break;
  }
}

/* ---- vẽ hình */
function drawShape(e, p, start) {
  const d = state.defaults.shape;
  const kind = d.kind;
  const snap = clone(state.anns);
  const a = { type: 'shape', kind, page: p.index, color: d.color, fill: kind === 'rect' || kind === 'ellipse' ? d.fill : null,
    width: d.width, opacity: d.opacity, x: start.x, y: start.y, w: 0.1, h: 0.1 };
  if (kind === 'line' || kind === 'arrow') a.pts = [[start.x, start.y], [start.x, start.y]];
  if (kind === 'pen') a.pts = [[start.x, start.y]];
  if (a.pts) shapeBBox(a);
  addAnn(a, { history: false, selectIt: false });
  p.overlay.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const q = pagePoint(ev, p);
    let cx = clamp(q.x, 0, p.w), cy = clamp(q.y, 0, p.h);
    if (kind === 'rect' || kind === 'ellipse') {
      let w = cx - start.x, h = cy - start.y;
      if (ev.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
      a.x = Math.min(start.x, start.x + w); a.y = Math.min(start.y, start.y + h); a.w = Math.abs(w); a.h = Math.abs(h);
    } else if (kind === 'pen') {
      const last = a.pts[a.pts.length - 1];
      if (Math.hypot(cx - last[0], cy - last[1]) * state.scale < 2) return;
      a.pts = [...a.pts, [cx, cy]];
      shapeBBox(a);
    } else {
      if (ev.shiftKey) {   // bắt góc 45°
        const ang = Math.round(Math.atan2(cy - start.y, cx - start.x) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(cx - start.x, cy - start.y);
        cx = start.x + Math.cos(ang) * len; cy = start.y + Math.sin(ang) * len;
      }
      a.pts = [[start.x, start.y], [cx, cy]];
      shapeBBox(a);
    }
    updateAnnEl(a);
  };
  const up = () => {
    p.overlay.removeEventListener('pointermove', move); p.overlay.removeEventListener('pointerup', up);
    const tiny = a.pts ? (a.pts.length < 2 || Math.hypot(a.pts.at(-1)[0] - a.pts[0][0], a.pts.at(-1)[1] - a.pts[0][1]) < 3 && a.kind !== 'pen')
      : (a.w < 3 || a.h < 3);
    if (tiny) { deleteAnn(a.id, false); return; }
    pushHistory(snap);
    select(a.id);
  };
  p.overlay.addEventListener('pointermove', move); p.overlay.addEventListener('pointerup', up);
}

/* ---- highlight theo dòng chữ */
function charEdges(it) {
  if (it._edges) return it._edges;
  measureCtx.font = `${it.bold ? 'bold ' : ''}100px ${FONT_CSS[it.font] || FONT_CSS.sans}`;
  const full = measureCtx.measureText(it.str).width || 1;
  const k = it.w / full;
  const edges = [it.x];
  for (let i = 1; i <= it.str.length; i++) edges.push(it.x + measureCtx.measureText(it.str.slice(0, i)).width * k);
  return (it._edges = edges);
}
function textLines(p) {
  if (p._lines && p._linesFrom === p.items) return p._lines;
  const items = [...(p.items || [])].sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const rows = [];
  for (const it of items) {
    let row = rows.find((r) => Math.abs(r.baseline - it.baseline) < Math.min(r.size, it.size) * 0.4);
    if (!row) { row = { baseline: it.baseline, size: it.size, items: [] }; rows.push(row); }
    row.items.push(it);
  }
  const segs = [];
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    let cur = null;
    for (const it of r.items) {
      if (cur && it.x - cur.x1 > Math.max(cur.size, it.size) * 2.5) { segs.push(cur); cur = null; }   // khoảng trống lớn = cột khác
      if (!cur) cur = { baseline: r.baseline, size: it.size, items: [], x0: it.x, x1: it.x + it.w };
      cur.items.push(it); cur.x1 = Math.max(cur.x1, it.x + it.w); cur.size = Math.max(cur.size, it.size);
    }
    if (cur) segs.push(cur);
  }
  segs.forEach((g) => { g.top = g.baseline - g.size * 0.88; g.bottom = g.baseline + g.size * 0.26; });
  segs.sort((a, b) => a.top - b.top || a.x0 - b.x0);
  segs.forEach((g, i) => (g.idx = i));
  p._linesFrom = p.items;
  return (p._lines = segs);
}
function snapX(seg, x) {
  if (x <= seg.x0) return seg.x0;
  if (x >= seg.x1) return seg.x1;
  let best = seg.x0, bd = Infinity;
  for (const it of seg.items) for (const e of charEdges(it)) { const dd = Math.abs(e - x); if (dd < bd) { bd = dd; best = e; } }
  return best;
}
function locateText(p, pt, strict) {
  let best = null, bd = Infinity;
  for (const g of textLines(p)) {
    const dy = pt.y < g.top ? g.top - pt.y : pt.y > g.bottom ? pt.y - g.bottom : 0;
    const dx = pt.x < g.x0 ? g.x0 - pt.x : pt.x > g.x1 ? pt.x - g.x1 : 0;
    const dist = dy * 4 + dx;
    if (dist < bd) { bd = dist; best = g; }
  }
  if (!best) return null;
  if (strict && bd > best.size * 1.5) return null;
  return { seg: best, x: snapX(best, pt.x) };
}
function textRangeRects(p, a, b) {
  const [s, e] = (a.seg.idx < b.seg.idx || (a.seg === b.seg && a.x <= b.x)) ? [a, b] : [b, a];
  const segs = textLines(p);
  const colL = Math.min(s.seg.x0, e.seg.x0), colR = Math.max(s.seg.x1, e.seg.x1);
  const out = [];
  for (let i = s.seg.idx; i <= e.seg.idx; i++) {
    const g = segs[i];
    if (g !== s.seg && g !== e.seg && (g.x1 < colL || g.x0 > colR)) continue;
    const x0 = g === s.seg ? s.x : g.x0, x1 = g === e.seg ? e.x : g.x1;
    if (x1 - x0 > 0.5) out.push({ x: x0, y: g.top, w: x1 - x0, h: g.bottom - g.top });
  }
  return out;
}
function makeHighlight(page, rects) {
  const d = state.defaults.highlight;
  return { type: 'highlight', page, ...bboxOfRects(rects), rects, color: d.color, opacity: d.opacity, style: d.style };
}
function dragTextHighlight(e, p, startLoc) {
  const s = state.scale;
  const layer = document.createElement('div');
  p.overlay.appendChild(layer);
  let rects = [];
  let moved = false;
  const sx = e.clientX, sy = e.clientY;
  const d = state.defaults.highlight;
  const paint = () => {
    layer.innerHTML = '';
    for (const r of rects) {
      const el = document.createElement('div');
      el.className = 'draft-hl';
      const style = d.style;
      let top = r.y, h = r.h;
      if (style === 'underline') { h = Math.max(0.8, r.h * 0.07); top = r.y + r.h - h * 1.6; }
      else if (style === 'strike') { h = Math.max(0.8, r.h * 0.07); top = r.y + r.h * 0.52 - h / 2; }
      Object.assign(el.style, { left: r.x * s + 'px', top: top * s + 'px', width: r.w * s + 'px', height: Math.max(h * s, 1) + 'px',
        background: d.color, opacity: style === 'highlight' ? d.opacity : 1 });
      layer.appendChild(el);
    }
  };
  p.overlay.setPointerCapture(e.pointerId);
  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
    moved = true;
    const loc = locateText(p, pagePoint(ev, p), false);
    if (loc) { rects = textRangeRects(p, startLoc, loc); paint(); }
  };
  const up = () => {
    p.overlay.removeEventListener('pointermove', move); p.overlay.removeEventListener('pointerup', up);
    layer.remove();
    if (!moved) {   // bấm 1 lần: tô cả dòng
      const g = startLoc.seg;
      rects = [{ x: g.x0, y: g.top, w: g.x1 - g.x0, h: g.bottom - g.top }];
    }
    if (!rects.length) return;
    addAnn(makeHighlight(p.index, rects), { selectIt: false });
  };
  p.overlay.addEventListener('pointermove', move); p.overlay.addEventListener('pointerup', up);
}

function dragRect(e, p, start) {
  const draft = document.createElement('div');
  draft.className = 'draft';
  p.overlay.appendChild(draft);
  const s = state.scale;
  let cur = start;
  const tool = state.tool;
  const paint = () => {
    const x = Math.min(start.x, cur.x), y = Math.min(start.y, cur.y);
    Object.assign(draft.style, { left: x * s + 'px', top: y * s + 'px',
      width: Math.abs(cur.x - start.x) * s + 'px', height: Math.abs(cur.y - start.y) * s + 'px' });
    if (tool === 'highlight') { draft.style.background = state.defaults.highlight.color; draft.style.opacity = state.defaults.highlight.opacity; }
    else draft.style.background = state.defaults.whiteout.color;
  };
  p.overlay.setPointerCapture(e.pointerId);
  const move = (ev) => { const q = pagePoint(ev, p); cur = { x: clamp(q.x, 0, p.w), y: clamp(q.y, 0, p.h) }; paint(); };
  const up = () => {
    p.overlay.removeEventListener('pointermove', move); p.overlay.removeEventListener('pointerup', up);
    draft.remove();
    const w = Math.abs(cur.x - start.x), h = Math.abs(cur.y - start.y);
    if (w < 3 || h < 3) return;
    const base = { page: p.index, x: Math.min(start.x, cur.x), y: Math.min(start.y, cur.y), w, h };
    if (tool === 'highlight') addAnn(makeHighlight(p.index, [{ x: base.x, y: base.y, w, h }]), { selectIt: false });
    else addAnn({ type: 'whiteout', ...base, ...state.defaults.whiteout }, { selectIt: false });
  };
  p.overlay.addEventListener('pointermove', move); p.overlay.addEventListener('pointerup', up);
}

function createEditFromItem(p, key) {
  const exist = state.anns.find((a) => a.srcKey === key);
  if (exist) { startEditing(exist); return; }
  const it = (p.items || []).find((i) => i.key === key); if (!it) return;
  const box = itemBox(it);
  const a = addAnn({
    type: 'edit', page: p.index, srcKey: key, text: it.str,
    ox: box.x, oy: box.y, ow: box.w, oh: box.h,
    x: it.x, y: it.baseline - it.size * EDIT_TOP,
    size: Math.round(it.size * 10) / 10, color: state.defaults.text.color === '#000000' ? '#000000' : state.defaults.text.color,
    font: it.font, bold: it.bold, whiteBg: state.defaults.edit.whiteBg,
  });
  startEditing(a);
}

const IMG_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', pjpeg: 'image/jpeg', pjp: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon' };
function extOf(name) { return ((name || '').match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || ''; }
function isImageFile(f) { return !!f && ((f.type || '').startsWith('image/') || !!IMG_EXT[extOf(f.name)]); }

async function loadImageFile(file) {
  if (!isImageFile(file)) {
    if (/^(heic|heif|tif|tiff|raw|cr2|nef)$/.test(extOf(file && file.name)))
      toast('Trình duyệt không đọc được ảnh dạng .' + extOf(file.name) + '. Hãy chuyển sang JPG hoặc PNG rồi thử lại.', true, 7000);
    else toast('Hãy chọn file ảnh (png, jpg, gif, webp…)', true);
    return null;
  }
  try {
    // file không có kiểu (một số app/hệ điều hành) -> đoán theo đuôi file để trình duyệt hiển thị được
    if (!(file.type || '').startsWith('image/')) file = new Blob([file], { type: IMG_EXT[extOf(file.name)] });
    let src = await readAsDataURL(file);
    // ảnh không phải png/jpg (webp, gif, svg, bmp...) -> chuyển sang PNG để PDF hỗ trợ
    if (!/^data:image\/(png|jpe?g)/i.test(src)) {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 800; c.height = img.naturalHeight || 600;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      src = c.toDataURL('image/png');
    }
    const [nw, nh] = await imageSize(src);
    if (!nw || !nh) throw new Error('ảnh rỗng');
    return { src, nw, nh };
  } catch (err) {
    console.error('loadImageFile', err);
    toast('Không đọc được ảnh này (file hỏng hoặc định dạng không hỗ trợ). Hãy thử ảnh JPG/PNG khác.', true, 7000);
    return null;
  }
}

/* lấy ảnh từ đường dẫn (kéo ảnh từ trang web / ứng dụng khác) */
async function imageFileFromUrl(url) {
  let blob = null;
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (r.ok) blob = await r.blob();
  } catch (_) { /* bị chặn CORS -> nhờ server tải hộ */ }
  if (!blob || !blob.type.startsWith('image/')) {
    if (!/^https?:/i.test(url)) return null;
    const r = await api('/api/fetch-image', { url });
    blob = await r.blob();
  }
  if (!blob.type.startsWith('image/')) return null;
  return new File([blob], 'image.' + (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg'), { type: blob.type });
}
function filesFromDataTransfer(dt) {
  const files = [...(dt.files || [])];
  if (!files.length && dt.items) {
    for (const it of dt.items) if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f); }
  }
  return files;
}
function imageUrlFromDataTransfer(dt) {
  const html = dt.getData('text/html');
  const m = html && html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
  if (m) return m[1].replace(/&amp;/g, '&');
  const uri = (dt.getData('text/uri-list') || '').split(/\r?\n/).find((l) => l && !l.startsWith('#'));
  const plain = dt.getData('text/plain');
  const cand = (uri || plain || '').trim();
  if (/^data:image\//i.test(cand) || /^https?:\/\/\S+$/i.test(cand)) return cand;
  return null;
}
function placeImage(img, p, cx, cy) {
  let w = img.nw * 0.75, h = img.nh * 0.75;   // px -> pt
  const maxW = p.w * 0.5, maxH = p.h * 0.5;
  const k = Math.min(1, maxW / w, maxH / h); w *= k; h *= k;
  addAnn({ type: 'image', page: p.index, x: clamp(cx - w / 2, 0, p.w - w), y: clamp(cy - h / 2, 0, p.h - h), w, h, src: img.src });
}

/* highlight phần chữ đang bôi đen */
function highlightSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  const anc = range.commonAncestorContainer;
  const node = anc.nodeType === 1 ? anc : anc.parentElement;
  if (!node.closest('.textLayer') && !node.closest('#pages')) return false;
  const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
  if (!rects.length) return false;
  const snap = clone(state.anns);
  const s = state.scale;
  const created = [];
  for (const p of state.pages) {
    const pr = p.el.getBoundingClientRect();
    const mine = rects.filter((r) => r.top + r.height / 2 > pr.top && r.top + r.height / 2 < pr.bottom &&
      r.left + r.width / 2 > pr.left && r.left + r.width / 2 < pr.right)
      .map((r) => ({ x: (r.left - pr.left) / s, y: (r.top - pr.top) / s, w: r.width / s, h: r.height / s }))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    // gộp các mảnh cùng dòng
    const merged = [];
    for (const r of mine) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last.y - r.y) < r.h * 0.5 && r.x <= last.x + last.w + r.h) {
        const x2 = Math.max(last.x + last.w, r.x + r.w), y2 = Math.max(last.y + last.h, r.y + r.h);
        last.x = Math.min(last.x, r.x); last.y = Math.min(last.y, r.y); last.w = x2 - last.x; last.h = y2 - last.y;
      } else merged.push({ ...r });
    }
    if (merged.length) created.push({ ...makeHighlight(p.index, merged), id: newId() });
  }
  if (!created.length) return false;
  pushHistory(snap);
  created.forEach((a) => addAnn(a, { history: false, selectIt: false }));
  sel.removeAllRanges();
  toast('Đã highlight phần chữ đã bôi đen');
  return true;
}

/* =========================================================== tools & props */
function setTool(t, silent = false) {
  if (t === 'highlight' && highlightSelection()) return;
  if (!state.pdf && t !== 'select') { toast('Hãy mở PDF trước'); return; }
  finishEditing();
  state.tool = t;
  document.body.className = document.body.className.replace(/\btool-\w+/g, '').trim() + ' tool-' + t;
  document.querySelectorAll('#tools button').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  if (t !== 'select') select(null);
  if (t === 'image' && !state.pendingImage && !silent) $('#fileImage').click();
  if (t !== 'image') state.pendingImage = null;
  $('#hint').textContent = HINTS[t];
  if ((t === 'edit' || t === 'highlight') && state.pdf) {
    const p = state.pages[currentPageIndex()];
    if (p && p.scanned) notifyScanned(p, t === 'highlight' ? 'highlight' : 'action');
  }
  syncProps();
}

function defaultsFor(kind) { return state.defaults[kind === 'edit' ? 'text' : kind] || null; }
function propTarget() {
  const a = state.sel && findAnn(state.sel);
  if (a) return { kind: a.type, ann: a, obj: a };
  const kind = { text: 'text', edit: 'edit', highlight: 'highlight', whiteout: 'whiteout', comment: 'comment', shape: 'shape' }[state.tool] || null;
  return { kind, ann: null, obj: kind ? defaultsFor(kind) : null };
}
function renderSwatches(sel, colors, current, onPick) {
  const box = $(sel);
  box.innerHTML = '';
  for (const c of colors) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === null ? ' none' : '');
    if (c) b.style.background = c;
    b.title = c === null ? 'Không tô nền' : c;
    if (c === null ? !current : (current && c.toLowerCase() === current.toLowerCase())) b.classList.add('active');
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => onPick(c));
    box.appendChild(b);
  }
}
function syncProps() {
  const { kind, ann, obj } = propTarget();
  const shapeKind = ann && ann.type === 'shape' ? ann.kind : state.defaults.shape.kind;
  const boxy = shapeKind === 'rect' || shapeKind === 'ellipse';
  const hasFill = kind === 'shape' && boxy;
  document.querySelectorAll('#propbar .pgroup').forEach((g) => {
    const fors = g.dataset.for.split(' ');
    let on = !!kind && (fors.includes(kind) || (hasFill && fors.includes('shape-fill')));
    // nhóm "tool-only": hiện khi đang dùng công cụ đó; khi chỉ chọn đối tượng thì chỉ cho đổi chữ nhật <-> elip
    if (g.classList.contains('tool-only') && ann && state.tool !== kind) on = on && kind === 'shape' && boxy;
    g.hidden = !on;
  });
  $('#ctxLabel').textContent = kind ? (ann ? 'Đang chọn: ' : 'Công cụ: ') + KIND_LABEL[kind] +
    (kind === 'shape' ? ' – ' + SHAPE_LABEL[shapeKind] : '') : '';
  const empty = $('#propEmpty');
  empty.hidden = !!kind && kind !== 'image';
  empty.textContent = kind === 'image' ? 'Kéo để di chuyển, kéo góc dưới để đổi cỡ (giữ Shift để co giãn tự do).'
    : state.tool === 'image' ? 'Chọn file ảnh rồi bấm vào trang để đặt.'
    : 'Chọn một công cụ hoặc một đối tượng để chỉnh thuộc tính.';
  if (obj) {
    $('#colorLabel').textContent = kind === 'shape' ? 'Màu nét' : 'Màu';
    if (obj.color) $('#propColor').value = obj.color;
    if (obj.size) $('#propSize').value = obj.size;
    if (obj.font) $('#propFont').value = obj.font;
    $('#propBold').classList.toggle('on', !!obj.bold);
    $('#propOpacity').value = obj.opacity ?? 1;
    if (kind === 'shape') { $('#propWidth').value = obj.width ?? 2; if (obj.fill) $('#propFill').value = obj.fill; }
    if (kind === 'highlight') { $('#hlStyle').value = obj.style || 'highlight'; $('#hlMode').value = state.defaults.highlight.mode; }
  }
  $('#propWhiteBg').checked = ann && ann.type === 'edit' ? !!ann.whiteBg : state.defaults.edit.whiteBg;
  document.querySelectorAll('#shapeKinds button').forEach((b) => b.classList.toggle('active', b.dataset.kind === shapeKind));
  if (kind && PALETTES[kind]) renderSwatches('#swColor', PALETTES[kind], obj?.color, (c) => changeProp('color', c));
  if (hasFill) renderSwatches('#swFill', PALETTES.fill, obj?.fill ?? null, (c) => changeProp('fill', c));
}
function changeProp(key, value) {
  const { kind, ann } = propTarget();
  if (!kind) return;
  if (key === 'whiteBg') {
    if (ann && ann.type === 'edit') { pushHistory(); ann.whiteBg = value; } else state.defaults.edit.whiteBg = value;
    return;
  }
  if (ann) {
    pushHistory();
    ann[key] = value;
    if (ann.type === 'shape' && ann.pts) shapeBBox(ann);
    updateAnnEl(ann);
  }
  const d = defaultsFor(kind);       // nhớ làm mặc định cho lần sau
  if (d && key in d) d[key] = value;
  syncProps();
}
let liveSnap = null;               // đổi liên tục (kéo thanh màu/độ đậm) -> chỉ lưu 1 bước hoàn tác
function liveProp(key, value) {
  const { kind, ann } = propTarget();
  if (!kind) return;
  if (ann) {
    if (!liveSnap) liveSnap = clone(state.anns);
    ann[key] = value;
    if (ann.type === 'shape' && ann.pts) shapeBBox(ann);
    updateAnnEl(ann);
  }
  const d = defaultsFor(kind);
  if (d && key in d) d[key] = value;
}
function commitLive() {
  if (liveSnap) { pushHistory(liveSnap); liveSnap = null; }
  syncProps();
}

/* =========================================================== export / convert */
async function exportPdf() {
  if (!state.docId) return;
  finishEditing();
  busy(true, 'Đang tạo PDF…');
  try {
    const r = await api('/api/export', { id: state.docId, anns: state.anns, name: state.name });
    download(await r.blob(), state.name.replace(/\.pdf$/i, '') + '_edited.pdf');
    toast('Đã xuất PDF mới');
  } catch (e) { toast('Lỗi xuất PDF: ' + e.message, true, 7000); }
  finally { busy(false); }
}
async function toDocx(applyEdits) {
  if (!state.docId) return;
  finishEditing();
  if (scannedPages().length &&
      !confirm('PDF này có trang là ảnh scan (không có chữ thật). File Word tạo ra sẽ chỉ chứa hình ảnh của trang, không sửa chữ được. Vẫn tiếp tục?')) return;
  busy(true, 'Đang chuyển sang Word… (file lớn có thể mất vài phút)');
  try {
    const r = await api('/api/docx', { id: state.docId, anns: state.anns, name: state.name, applyEdits });
    download(await r.blob(), state.name.replace(/\.pdf$/i, '') + (applyEdits ? '_edited' : '') + '.docx');
    toast('Đã tạo file Word. Mở bằng Word để sửa chữ trực tiếp.');
  } catch (e) { toast('Lỗi chuyển Word: ' + e.message, true, 7000); }
  finally { busy(false); }
}
async function docxToPdf(file) {
  busy(true, 'Đang chuyển Word → PDF…');
  try {
    const fd = new FormData(); fd.append('file', file);
    const blob = await (await api('/api/docx2pdf', fd, true)).blob();
    const name = file.name.replace(/\.docx$/i, '') + '.pdf';
    download(blob, name);
    busy(false);
    if (confirm('Đã chuyển xong. Mở PDF này trong trình chỉnh sửa?')) {
      if (state.dirty && !confirm('Các thay đổi chưa lưu ở file hiện tại sẽ mất. Tiếp tục?')) return;
      await openPdfBytes(new Uint8Array(await blob.arrayBuffer()), name);
    }
  } catch (e) { toast(e.message, true, 9000); }
  finally { busy(false); }
}

/* =========================================================== clipboard & keyboard */
document.addEventListener('copy', (e) => {
  if (isTyping(e.target) || state.editing) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) return;           // copy chữ bình thường
  const a = state.sel && findAnn(state.sel);
  if (!a) return;
  state.clip = { ...a };
  e.clipboardData.setData('text/plain', CLIP_MARK + (a.text || ''));
  e.preventDefault();
  toast('Đã copy đối tượng. Ctrl+V để dán.', false, 1500);
});
document.addEventListener('cut', (e) => {
  if (isTyping(e.target) || state.editing) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) return;
  const a = state.sel && findAnn(state.sel);
  if (!a) return;
  state.clip = { ...a };
  e.clipboardData.setData('text/plain', CLIP_MARK + (a.text || ''));
  e.preventDefault();
  deleteAnn(a.id);
});
document.addEventListener('paste', async (e) => {
  const cd = e.clipboardData;
  const text = cd.getData('text/plain');
  if (state.editing || isTyping(e.target)) {
    if (e.target.closest('[contenteditable="true"]')) {   // dán dạng chữ thuần
      e.preventDefault();
      document.execCommand('insertText', false, text.startsWith(CLIP_MARK) ? text.slice(CLIP_MARK.length) : text);
    }
    return;
  }
  if (!state.pdf) return;
  const p = state.pages[currentPageIndex()];
  const file = [...cd.items].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
  if (file) {
    e.preventDefault();
    const img = await loadImageFile(file);
    if (img) { const c = visibleCenter(p); placeImage(img, p, c.x, c.y); setTool('select', true); }
    return;
  }
  if (text.startsWith(CLIP_MARK) && state.clip) {
    e.preventDefault();
    duplicate(state.clip, state.clip.page === p.index || !els.get(state.clip.id) ? state.clip.page : p.index);
    return;
  }
  if (text.trim()) {
    e.preventDefault();
    const c = visibleCenter(p);
    addAnn({ type: 'text', page: p.index, x: 40, y: c.y, text: text.replace(/\r/g, ''), ...state.defaults.text });
    setTool('select', true);
  }
});
function duplicate(src, pageIndex = src.page) {
  const a = { ...src, id: newId(), page: pageIndex };
  shiftAnn(a, 12, 12);
  if (a.type === 'edit') {   // bản sao của "sửa chữ" thành văn bản thường
    a.type = 'text'; delete a.ox; delete a.oy; delete a.ow; delete a.oh; delete a.srcKey; delete a.whiteBg;
  }
  addAnn(a);
  state.clip = { ...a };
}

document.addEventListener('keydown', (e) => {
  if (isTyping(e.target)) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
  if (ctrl && k === 's') { e.preventDefault(); exportPdf(); return; }
  if (ctrl && k === 'o') { e.preventDefault(); $('#filePdf').click(); return; }
  if (ctrl && k === 'd') { e.preventDefault(); const a = state.sel && findAnn(state.sel); if (a) duplicate(a); return; }
  if (ctrl && (k === '=' || k === '+')) { e.preventDefault(); zoomStep(1); return; }
  if (ctrl && k === '-') { e.preventDefault(); zoomStep(-1); return; }
  if (ctrl) return;
  const a = state.sel && findAnn(state.sel);
  if ((e.key === 'Delete' || e.key === 'Backspace') && a) { e.preventDefault(); deleteAnn(a.id); return; }
  if (e.key === 'Escape') { select(null); setTool('select', true); return; }
  if (e.key === 'Enter' && a && (a.type === 'text' || a.type === 'edit')) { e.preventDefault(); startEditing(a); return; }
  if (a && e.key.startsWith('Arrow')) {
    e.preventDefault();
    const st = e.shiftKey ? 10 : 1;
    if (!e.repeat) pushHistory();
    const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0;
    const dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
    shiftAnn(a, dx, dy);
    updateAnnEl(a); return;
  }
  const map = { v: 'select', t: 'text', i: 'image', h: 'highlight', s: 'shape', w: 'whiteout', c: 'comment', e: 'edit' };
  if (map[k] && state.pdf) setTool(map[k]);
});

/* =========================================================== wiring UI */
$('#btnOpen').onclick = () => $('#filePdf').click();
$('#btnOpenProject').onclick = () => $('#fileProject').click();
$('#filePdf').onchange = (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) openPdfFiles(fs); };
$('#fileProject').onchange = (e) => { const f = e.target.files[0]; if (f) openProjectFile(f); e.target.value = ''; };
$('#fileImage').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) { if (state.tool === 'image') setTool('select', true); return; }
  const img = await loadImageFile(f);
  if (!img) return;
  state.pendingImage = img;
  if (state.tool !== 'image') setTool('image', true);
  $('#hint').textContent = 'Bấm vào vị trí trên trang để đặt ảnh (Esc để huỷ).';
};
$('#fileDocx').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) docxToPdf(f); };

document.querySelectorAll('#tools button').forEach((b) => {
  b.addEventListener('mousedown', (e) => e.preventDefault());   // giữ vùng bôi đen
  b.addEventListener('click', () => setTool(b.dataset.tool));
});
$('#propColor').addEventListener('input', (e) => liveProp('color', e.target.value));
$('#propColor').addEventListener('change', commitLive);
$('#propFill').addEventListener('input', (e) => liveProp('fill', e.target.value));
$('#propFill').addEventListener('change', commitLive);
$('#propOpacity').addEventListener('input', (e) => liveProp('opacity', parseFloat(e.target.value)));
$('#propOpacity').addEventListener('change', commitLive);
$('#propWidth').addEventListener('input', (e) => { const v = parseFloat(e.target.value); if (v >= 0) liveProp('width', clamp(v, 0, 40)); });
$('#propWidth').addEventListener('change', commitLive);
$('#propSize').addEventListener('change', (e) => changeProp('size', clamp(parseFloat(e.target.value) || 14, 4, 300)));
$('#propFont').addEventListener('change', (e) => changeProp('font', e.target.value));
$('#propBold').addEventListener('click', () => changeProp('bold', !$('#propBold').classList.contains('on')));
$('#propWhiteBg').addEventListener('change', (e) => changeProp('whiteBg', e.target.checked));
$('#hlStyle').addEventListener('change', (e) => changeProp('style', e.target.value));
$('#hlMode').addEventListener('change', (e) => { state.defaults.highlight.mode = e.target.value; });
document.querySelectorAll('#shapeKinds button').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.kind;
  const a = state.sel && findAnn(state.sel);
  if (state.tool !== 'shape' && a && a.type === 'shape' && (a.kind === 'rect' || a.kind === 'ellipse') && (k === 'rect' || k === 'ellipse')) {
    changeProp('kind', k); return;
  }
  state.defaults.shape.kind = k;
  if (state.tool !== 'shape') setTool('shape'); else { select(null); syncProps(); }
}));

$('#btnUndo').onclick = undo;
$('#btnRedo').onclick = redo;
$('#btnDelete').onclick = () => state.sel && deleteAnn(state.sel);
$('#zoomIn').onclick = () => zoomStep(1);
$('#zoomOut').onclick = () => zoomStep(-1);
$('#btnExport').onclick = exportPdf;
$('#btnSaveProject').onclick = saveProject;

const dd = $('#btnWord').parentElement;
$('#btnWord').onclick = (e) => { e.stopPropagation(); dd.classList.toggle('open'); };
document.addEventListener('click', () => dd.classList.remove('open'));
document.querySelectorAll('[data-docx]').forEach((b) => (b.onclick = () => {
  if (!state.docId) { toast('Hãy mở PDF trước'); return; }
  toDocx(b.dataset.docx === 'edited');
}));
$('#btnDocx2Pdf').onclick = () => $('#fileDocx').click();
$('#scanBannerClose').onclick = () => { $('#scanBanner').hidden = true; };

// bỏ chọn khi bấm ra ngoài
$('#viewer').addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.ann')) {
    if (state.editing) finishEditing();
    document.querySelectorAll('.ann-comment.open').forEach((x) => x.classList.remove('open'));
    if (state.tool === 'select') select(null);
  }
});
document.addEventListener('mouseup', () => document.querySelectorAll('.textLayer.selecting').forEach((t) => t.classList.remove('selecting')));
$('#viewer').addEventListener('scroll', () => requestAnimationFrame(updatePageInfo));
$('#viewer').addEventListener('wheel', (e) => {
  if (e.ctrlKey && state.pdf) { e.preventDefault(); zoomStep(e.deltaY < 0 ? 1 : -1); }
}, { passive: false });

// kéo thả file
const viewerEl = $('#viewer');
['dragenter', 'dragover'].forEach((ev) => viewerEl.addEventListener(ev, (e) => { e.preventDefault(); document.body.classList.add('dragging'); }));
['dragleave', 'drop'].forEach((ev) => viewerEl.addEventListener(ev, () => document.body.classList.remove('dragging')));
viewerEl.addEventListener('drop', async (e) => {
  e.preventDefault();
  const dt = e.dataTransfer;
  // xác định trang & vị trí thả ngay lập tức (trước mọi thao tác chờ)
  const pageEl = document.elementsFromPoint(e.clientX, e.clientY).map((x) => x.closest('.page')).find(Boolean);
  const p = state.pdf ? (pageEl ? state.pages[+pageEl.dataset.index] : state.pages[currentPageIndex()]) : null;
  const dropPt = p ? (pageEl ? pagePoint(e, p) : visibleCenter(p)) : null;
  const putImage = async (file) => {
    if (!state.pdf) { toast('Hãy mở PDF trước, rồi kéo ảnh vào trang.'); return; }
    const img = await loadImageFile(file);
    if (img) { placeImage(img, p, dropPt.x, dropPt.y); setTool('select', true); toast('Đã thêm ảnh', false, 1500); }
  };

  const files = filesFromDataTransfer(dt);
  const f = files[0];
  if (f) {
    if (/\.json$/i.test(f.name)) return openProjectFile(f);
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return openPdfFiles(files);
    if (isImageFile(f) || /^(heic|heif|tif|tiff)$/.test(extOf(f.name))) return putImage(f);
    toast('Chỉ hỗ trợ file PDF, ảnh hoặc dự án .json', true);
    return;
  }
  // không có file: ảnh được kéo từ trang web / ứng dụng khác
  const url = imageUrlFromDataTransfer(dt);
  if (url) {
    if (!state.pdf) { toast('Hãy mở PDF trước, rồi kéo ảnh vào trang.'); return; }
    busy(true, 'Đang lấy ảnh…');
    try {
      const file = await imageFileFromUrl(url);
      busy(false);
      if (file) return putImage(file);
    } catch (err) { console.error(err); }
    finally { busy(false); }
  }
  toast('Không nhận được ảnh từ nội dung vừa kéo thả. Hãy lưu ảnh về máy rồi kéo file vào, hoặc copy ảnh rồi dán bằng Ctrl+V.', true, 8000);
});
window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

setTool('select', true);
updateButtons();
window.__pdfEditor = state;   // để debug

/* =====================================================================
   QUẢN LÝ TRANG: thumbnail, chọn, kéo sắp xếp, xoay, xoá, nhân bản,
   thêm trang trắng, ghép PDF, tách / trích xuất
   ===================================================================== */
const curSpecs = () => state.pages.map((p, i) => ({ src: 'cur', page: i }));
function selectedPages() {
  const s = [...state.pageSel].sort((a, b) => a - b);
  return s.length ? s : (state.pdf ? [currentPageIndex()] : []);
}
function pageLabel(arr) {        // [0,1,2,4] -> "1-3, 5"
  const parts = []; let start = null, prev = null;
  for (const p of [...arr, null]) {
    if (p !== null && prev !== null && p === prev + 1) { prev = p; continue; }
    if (start !== null) parts.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
    start = prev = p;
  }
  return parts.join(', ');
}

/* ---- xoay toạ độ các đối tượng khi xoay trang */
function rotPt(x, y, deg, W, H) {
  deg = ((deg % 360) + 360) % 360;
  if (deg === 90) return [H - y, x];
  if (deg === 180) return [W - x, H - y];
  if (deg === 270) return [y, W - x];
  return [x, y];
}
function rotRect(r, deg, W, H) {
  const [x1, y1] = rotPt(r.x, r.y, deg, W, H), [x2, y2] = rotPt(r.x + r.w, r.y + r.h, deg, W, H);
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}
function rotateAnn(a, deg, pg) {
  const W = pg.w, H = pg.h;
  if (a.pts) { a.pts = a.pts.map(([x, y]) => rotPt(x, y, deg, W, H)); shapeBBox(a); return; }
  if (a.rects) { a.rects = a.rects.map((r) => rotRect(r, deg, W, H)); Object.assign(a, bboxOfRects(a.rects)); return; }
  if (a.type === 'shape' || a.type === 'whiteout' || a.type === 'highlight') { Object.assign(a, rotRect(a, deg, W, H)); return; }
  // chữ, ảnh, chú thích: giữ nguyên chiều, chỉ dời theo tâm
  const w = a.w || 0, h = a.h || 0;
  const [cx, cy] = rotPt(a.x + w / 2, a.y + h / 2, deg, W, H);
  a.x = cx - w / 2; a.y = cy - h / 2;
  if (a.type === 'edit') {
    const r = rotRect({ x: a.ox, y: a.oy, w: a.ow, h: a.oh }, deg, W, H);
    Object.assign(a, { ox: r.x, oy: r.y, ow: r.w, oh: r.h });
  }
}
/* các đối tượng đi theo trang của nó sang vị trí mới */
function remapAnns(specs) {
  const out = [], used = new Set();
  specs.forEach((sp, i) => {
    if (sp.src !== 'cur') return;
    for (const a of state.anns) {
      if (a.page !== sp.page) continue;
      const b = { ...a, page: i };
      if (used.has(a.id)) b.id = newId();
      used.add(a.id);
      if (b.srcKey) b.srcKey = i + ':' + b.srcKey.split(':')[1];
      if (sp.rotate) rotateAnn(b, sp.rotate, state.pages[sp.page]);
      out.push(b);
    }
  });
  return out;
}
async function applyPageSpecs(specs, label, selectAfter = null, doneMsg = '') {
  if (!state.docId || busy.on) return;
  if (!specs.length) { toast('Tài liệu phải còn ít nhất 1 trang.', true); return; }
  finishEditing();
  busy(true, label || 'Đang cập nhật trang…');
  try {
    const body = specs.map((sp) => (sp.src === 'cur' ? { ...sp, src: state.docId } : sp));
    const res = await (await api('/api/compose', { pages: body })).json();
    const bytes = await fetchDocBytes(res.id);
    const newAnns = remapAnns(specs);
    pushHistory(docSnapshot());
    await loadDoc({ docId: res.id, bytes, name: state.name, anns: newAnns });
    if (selectAfter) { state.pageSel = new Set(selectAfter.filter((i) => i < res.pages)); refreshThumbSel(); }
    if (doneMsg) toast(doneMsg + ' (Ctrl+Z để hoàn tác)');
  } catch (e) {
    console.error(e); toast('Lỗi: ' + e.message, true, 7000);
  } finally { busy(false); }
}

function rotatePages(deg) {
  const sel = selectedPages(); if (!sel.length) return;
  const specs = curSpecs().map((sp, i) => (sel.includes(i) ? { ...sp, rotate: deg } : sp));
  applyPageSpecs(specs, 'Đang xoay trang…', sel);
}
function deletePages() {
  const sel = selectedPages(); if (!sel.length) return;
  if (sel.length >= state.pages.length) { toast('Không thể xoá hết các trang. Tài liệu phải còn ít nhất 1 trang.', true); return; }
  const specs = curSpecs().filter((sp, i) => !sel.includes(i));
  const next = Math.min(sel[0], specs.length - 1);
  applyPageSpecs(specs, 'Đang xoá trang…', [next], `Đã xoá ${sel.length} trang`);
}
function duplicatePages() {
  const sel = selectedPages(); if (!sel.length) return;
  const specs = [], after = [];
  curSpecs().forEach((sp, i) => { specs.push(sp); if (sel.includes(i)) { specs.push({ ...sp }); after.push(specs.length - 1); } });
  applyPageSpecs(specs, 'Đang nhân bản trang…', after, `Đã nhân bản ${sel.length} trang`);
}
function insertBlankPage() {
  const sel = selectedPages(); if (!sel.length) return;
  const at = sel[sel.length - 1];
  const ref = state.pages[at];
  const specs = curSpecs();
  specs.splice(at + 1, 0, { blank: true, w: ref.w, h: ref.h });
  applyPageSpecs(specs, 'Đang thêm trang…', [at + 1], 'Đã thêm 1 trang trắng');
}
function movePages(moving, insertAt) {     // insertAt: vị trí chèn tính theo thứ tự cũ (0..N)
  moving = [...moving].sort((a, b) => a - b);
  const rest = curSpecs().filter((sp, i) => !moving.includes(i));
  const before = moving.filter((i) => i < insertAt).length;
  const pos = insertAt - before;
  const specs = [...rest.slice(0, pos), ...moving.map((i) => ({ src: 'cur', page: i })), ...rest.slice(pos)];
  if (specs.every((sp, i) => sp.page === i)) return;   // không đổi gì
  applyPageSpecs(specs, 'Đang sắp xếp trang…', moving.map((_, k) => pos + k));
}
/* chèn (ghép) các file PDF khác vào vị trí insertAt; mặc định sau trang đang chọn hoặc cuối tài liệu */
async function insertPdfFiles(files, insertAt = null) {
  files = [...files].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (!files.length) { toast('Hãy chọn file PDF.', true); return; }
  if (!state.docId) return openPdfFiles(files);
  if (insertAt === null) insertAt = state.pageSel.size ? Math.max(...state.pageSel) + 1 : state.pages.length;
  busy(true, `Đang tải lên ${files.length} file…`);
  const inserted = [];
  try {
    for (const f of files) {
      const info = await uploadBytes(new Uint8Array(await f.arrayBuffer()), f.name);
      for (let n = 0; n < info.pages; n++) inserted.push({ src: info.id, page: n });
    }
  } catch (e) { busy(false); toast('Không đọc được file: ' + e.message, true, 7000); return; }
  busy(false);
  const specs = curSpecs();
  specs.splice(insertAt, 0, ...inserted);
  await applyPageSpecs(specs, 'Đang ghép PDF…', inserted.map((_, k) => insertAt + k),
    `Đã ghép ${inserted.length} trang từ ${files.length} file`);
}

/* ---- thumbnail */
let thumbObserver = null;
const THUMB_W = 150;
function buildThumbs() {
  const box = $('#thumbs');
  box.innerHTML = '';
  if (thumbObserver) thumbObserver.disconnect();
  if (!state.pdf) return;
  const pdf = state.pdf;
  thumbObserver = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) renderThumb(en.target, pdf);
  }, { root: box, rootMargin: '400px 0px' });
  state.pages.forEach((p, i) => {
    const t = document.createElement('div');
    t.className = 'thumb'; t.dataset.index = i; t.draggable = true;
    const h = Math.round(p.h * THUMB_W / p.w);
    t.innerHTML = `<canvas class="tcanvas" style="width:${THUMB_W}px;height:${h}px"></canvas><div class="tnum">${i + 1}</div>`;
    t.title = 'Trang ' + (i + 1);
    box.appendChild(t);
    thumbObserver.observe(t);
  });
  refreshThumbSel();
  markCurrentThumb(currentPageIndex(), true);
}
async function renderThumb(t, pdf) {
  if (t._done || pdf !== state.pdf) return;
  t._done = true;
  try {
    const i = +t.dataset.index;
    const page = await pdf.getPage(i + 1);
    const dpr = window.devicePixelRatio || 1;
    const vp = page.getViewport({ scale: (THUMB_W / state.pages[i].w) * dpr });
    const c = t.querySelector('canvas');
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  } catch (e) { t._done = false; }
}
function refreshThumbSel() {
  document.querySelectorAll('#thumbs .thumb').forEach((t) => t.classList.toggle('selected', state.pageSel.has(+t.dataset.index)));
  const n = state.pages.length, k = state.pageSel.size;
  $('#sbInfo').textContent = n ? `${n} trang${k ? ` · đã chọn ${k}` : ''}` : '';
}
function markCurrentThumb(cur, force = false) {
  if (!force && markCurrentThumb._last === cur) return;
  markCurrentThumb._last = cur;
  document.querySelectorAll('#thumbs .thumb.current').forEach((t) => t.classList.remove('current'));
  const t = document.querySelector(`#thumbs .thumb[data-index="${cur}"]`);
  if (!t) return;
  t.classList.add('current');
  if (!$('#sidebar').hidden) {
    const box = $('#thumbs'), r = t.getBoundingClientRect(), br = box.getBoundingClientRect();
    if (r.top < br.top || r.bottom > br.bottom) box.scrollTop += r.top - br.top - br.height / 2 + r.height / 2;
  }
}
function scrollToPage(i) {
  const p = state.pages[i]; if (!p) return;
  $('#viewer').scrollTop = p.el.offsetTop - 12;
}
function toggleSidebar(show) {
  const sb = $('#sidebar');
  show = show ?? sb.hidden;
  sb.hidden = !show;
  $('#btnPages').classList.toggle('on', show);
  if (show) { markCurrentThumb(currentPageIndex(), true); }
}

const thumbsBox = $('#thumbs');
thumbsBox.addEventListener('click', (e) => {
  const t = e.target.closest('.thumb'); if (!t) return;
  const i = +t.dataset.index;
  if (e.shiftKey && state.pageAnchor !== null) {
    const [a, b] = [Math.min(state.pageAnchor, i), Math.max(state.pageAnchor, i)];
    if (!(e.ctrlKey || e.metaKey)) state.pageSel = new Set();
    for (let k = a; k <= b; k++) state.pageSel.add(k);
  } else if (e.ctrlKey || e.metaKey) {
    state.pageSel.has(i) ? state.pageSel.delete(i) : state.pageSel.add(i);
    state.pageAnchor = i;
  } else {
    state.pageSel = new Set([i]); state.pageAnchor = i;
  }
  refreshThumbSel();
  scrollToPage(i);
});
let dragPages = null, dropAt = null;
function clearDropMarks() { thumbsBox.querySelectorAll('.drop-before,.drop-after').forEach((t) => t.classList.remove('drop-before', 'drop-after')); }
thumbsBox.addEventListener('dragstart', (e) => {
  const t = e.target.closest('.thumb'); if (!t) return;
  const i = +t.dataset.index;
  if (!state.pageSel.has(i)) { state.pageSel = new Set([i]); state.pageAnchor = i; refreshThumbSel(); }
  dragPages = [...state.pageSel];
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'trang ' + pageLabel(dragPages.sort((a, b) => a - b)));
  thumbsBox.querySelectorAll('.thumb.selected').forEach((x) => x.classList.add('dragging'));
});
thumbsBox.addEventListener('dragend', () => {
  dragPages = null; clearDropMarks(); thumbsBox.classList.remove('drop-file');
  thumbsBox.querySelectorAll('.dragging').forEach((x) => x.classList.remove('dragging'));
});
thumbsBox.addEventListener('dragover', (e) => {
  const isFile = !dragPages && [...(e.dataTransfer.types || [])].includes('Files');
  if (!dragPages && !isFile) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = isFile ? 'copy' : 'move';
  thumbsBox.classList.toggle('drop-file', isFile);
  clearDropMarks();
  const t = e.target.closest('.thumb');
  if (t) {
    const r = t.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
    t.classList.add(after ? 'drop-after' : 'drop-before');
    dropAt = +t.dataset.index + (after ? 1 : 0);
  } else {
    dropAt = state.pages.length;
    thumbsBox.lastElementChild?.classList.add('drop-after');
  }
});
thumbsBox.addEventListener('dragleave', (e) => {
  if (!thumbsBox.contains(e.relatedTarget)) { clearDropMarks(); thumbsBox.classList.remove('drop-file'); }
});
thumbsBox.addEventListener('drop', (e) => {
  e.preventDefault();
  const at = dropAt ?? state.pages.length;
  clearDropMarks(); thumbsBox.classList.remove('drop-file');
  if (dragPages) { const m = dragPages; dragPages = null; movePages(m, at); return; }
  const files = filesFromDataTransfer(e.dataTransfer);
  if (files.length) insertPdfFiles(files, at);
});

$('#btnPages').onclick = () => { if (!state.pdf) { toast('Hãy mở PDF trước'); return; } toggleSidebar(); };
$('#sbClose').onclick = () => toggleSidebar(false);
$('#sbRotL').onclick = () => rotatePages(270);
$('#sbRotR').onclick = () => rotatePages(90);
$('#sbDup').onclick = duplicatePages;
$('#sbBlank').onclick = insertBlankPage;
$('#sbDelete').onclick = deletePages;
$('#sbMerge').onclick = () => openWorkspace('merge');
$('#fileMerge').onchange = (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) insertPdfFiles(fs); };
$('#sbExtract').onclick = () => {
  const sel = selectedPages(); if (!sel.length) return;
  doSplit([sel], `Đang trích xuất trang ${pageLabel(sel)}…`);
};
$('#sbSplit').onclick = () => openWorkspace('split');

/* ---- tách PDF */
function parseRanges(text, N) {
  const groups = [];
  for (const raw of text.split(/[,;]+/)) {
    const part = raw.trim(); if (!part) continue;
    const m = part.match(/^(\d+)\s*(?:-|–|đến)\s*(\d+)$/i) || part.match(/^(\d+)$/);
    if (!m) throw new Error(`Không hiểu "${part}". Ví dụ đúng: 1-3, 5, 7-9`);
    const a = +m[1], b = +(m[2] || m[1]);
    if (a < 1 || b > N || a > b) throw new Error(`Khoảng "${part}" không hợp lệ (tài liệu có ${N} trang)`);
    groups.push(Array.from({ length: b - a + 1 }, (_, k) => a - 1 + k));
  }
  if (!groups.length) throw new Error('Hãy nhập khoảng trang, ví dụ: 1-3, 4-6');
  return groups;
}
async function doSplit(groups, label, applyEdits = true) {
  finishEditing();
  busy(true, label || 'Đang tách PDF…');
  try {
    const r = await api('/api/split', { id: state.docId, anns: state.anns, name: state.name, groups, applyEdits });
    const base = state.name.replace(/\.pdf$/i, '');
    const blob = await r.blob();
    const fname = groups.length === 1 ? `${base}_trang_${pageLabel(groups[0]).replace(/, /g, '_')}.pdf` : `${base}_tach.zip`;
    download(blob, fname);
    toast(groups.length === 1 ? 'Đã tạo file PDF' : `Đã tách thành ${groups.length} file (ZIP)`);
    return { blob, fname };
  } catch (e) { toast('Lỗi tách PDF: ' + e.message, true, 7000); return null; }
  finally { busy(false); }
}
/* =====================================================================
   TÌM KIẾM (Ctrl+F) – không phân biệt hoa/thường & dấu tiếng Việt (tuỳ chọn)
   ===================================================================== */
function normChar(c, keepCase, keepAccent) {
  let r = c;
  if (r === '\n') return ' ';
  if (!keepAccent) {
    if (r === 'đ') r = 'd'; else if (r === 'Đ') r = 'D';
    else {
      const n = r.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (n.length === 1) r = n;
    }
  }
  if (!keepCase) { const l = r.toLowerCase(); if (l.length === 1) r = l; }
  return r;
}
function normStr(s, keepCase, keepAccent) {
  let out = '';
  for (let i = 0; i < s.length; i++) out += normChar(s[i], keepCase, keepAccent);
  return out;
}
function buildPageText(i, tc) {
  let text = '';
  const segs = [];
  let k = 0;
  for (const it of tc.items) {
    if (it.str === undefined) continue;     // marked content: không có span tương ứng
    const start = text.length;
    text += it.str;
    segs.push({ div: k, start, end: text.length });
    k++;
    if (it.hasEOL) text += '\n';
  }
  return (state.textCache[i] = { text, segs, norm: {} });
}
async function getPageText(i) {
  if (state.textCache[i]) return state.textCache[i];
  const page = await state.pdf.getPage(i + 1);
  return buildPageText(i, await page.getTextContent());
}
function updateSearchCount(progress = false) {
  const S = state.search, el = $('#searchCount'), inp = $('#searchInput');
  if (!S.q.trim()) { el.textContent = ''; inp.classList.remove('notfound'); return; }
  if (progress) { el.textContent = `${S.results.length}…`; return; }
  el.textContent = S.results.length ? `${S.idx + 1}/${S.results.length}` : 'Không thấy';
  inp.classList.toggle('notfound', !S.results.length);
}
async function runSearch(jump = true) {
  const S = state.search;
  S.q = $('#searchInput').value;
  const token = ++S.token;
  S.results = []; S.idx = -1;
  redrawSearchHits();
  if (!S.q.trim() || !state.pdf) { updateSearchCount(); return; }
  const keepCase = $('#searchCase').checked, keepAccent = $('#searchAccent').checked;
  const key = (keepCase ? 'c' : '') + (keepAccent ? 'a' : '');
  const nq = normStr(S.q, keepCase, keepAccent);
  const startPage = currentPageIndex();
  const pdf = state.pdf;
  for (let i = 0; i < state.pages.length; i++) {
    const t = await getPageText(i);
    if (token !== S.token || pdf !== state.pdf) return;
    const nt = t.norm[key] ??= normStr(t.text, keepCase, keepAccent);
    let pos = 0;
    while ((pos = nt.indexOf(nq, pos)) !== -1) { S.results.push({ page: i, start: pos, end: pos + nq.length }); pos += nq.length || 1; }
    if (i % 10 === 9) updateSearchCount(true);
  }
  if (S.results.length) { S.idx = S.results.findIndex((r) => r.page >= startPage); if (S.idx < 0) S.idx = 0; }
  updateSearchCount();
  if (!S.results.length && scannedPages().length) toast('Không tìm thấy. Lưu ý: trang ảnh scan không có chữ nên không tìm được.', false, 4500);
  if (jump && S.idx >= 0) gotoResult(S.idx); else redrawSearchHits();
}
function drawSearchHits(p) {
  let layer = p.overlay.querySelector('.search-layer');
  const S = state.search;
  const mine = S.open ? S.results.map((r, ri) => [r, ri]).filter(([r]) => r.page === p.index) : [];
  if (!mine.length) { if (layer) layer.innerHTML = ''; return; }
  const t = state.textCache[p.index], divs = p.textDivs;
  if (!t || !divs) return;
  if (!layer) { layer = document.createElement('div'); layer.className = 'search-layer'; p.overlay.prepend(layer); }
  layer.innerHTML = '';
  const pr = p.el.getBoundingClientRect();
  for (const [r, ri] of mine) {
    for (const sg of t.segs) {
      if (sg.end <= r.start || sg.start >= r.end) continue;
      const node = divs[sg.div] && divs[sg.div].firstChild;
      if (!node || node.nodeType !== 3) continue;
      const a = Math.max(r.start, sg.start) - sg.start, b = Math.min(r.end, sg.end) - sg.start;
      const range = document.createRange();
      range.setStart(node, Math.min(a, node.length)); range.setEnd(node, Math.min(b, node.length));
      for (const rc of range.getClientRects()) {
        const d = document.createElement('div');
        d.className = 'search-hit' + (ri === S.idx ? ' current' : '');
        Object.assign(d.style, { left: rc.left - pr.left + 'px', top: rc.top - pr.top + 'px', width: rc.width + 'px', height: rc.height + 'px' });
        layer.appendChild(d);
      }
    }
  }
}
function redrawSearchHits() { state.pages.forEach((p) => { if (p.rendered) drawSearchHits(p); }); }
async function gotoResult(idx) {
  const S = state.search;
  if (!S.results.length) return;
  S.idx = (idx + S.results.length) % S.results.length;
  const r = S.results[S.idx], p = state.pages[r.page], viewer = $('#viewer');
  if (!p.rendered) {
    viewer.scrollTop = p.el.offsetTop - 12;
    renderPage(p);
    for (let tries = 0; !p.rendered && tries < 100; tries++) await (p.rendering || sleep(50));
    if (state.pages[r.page] !== p) return;
  }
  redrawSearchHits();
  updateSearchCount();
  const cur = p.el.querySelector('.search-hit.current');
  if (cur) {
    const vr = viewer.getBoundingClientRect(), cr = cur.getBoundingClientRect();
    if (cr.top < vr.top + 70 || cr.bottom > vr.bottom - 30) viewer.scrollTop += cr.top - vr.top - vr.height / 3;
    if (cr.left < vr.left || cr.right > vr.right) viewer.scrollLeft += cr.left - vr.left - vr.width / 3;
  } else viewer.scrollTop = p.el.offsetTop - 12;
}
function openSearch() {
  if (!state.pdf) { toast('Hãy mở PDF trước'); return; }
  const S = state.search;
  S.open = true;
  $('#searchBar').hidden = false;
  const inp = $('#searchInput');
  const selText = window.getSelection().toString().trim();
  if (selText && selText.length < 100 && !selText.includes('\n')) inp.value = selText;
  inp.focus(); inp.select();
  if (inp.value.trim()) runSearch(true);
}
function closeSearch() {
  state.search.open = false;
  $('#searchBar').hidden = true;
  redrawSearchHits();
}
let searchTimer = null;
$('#searchInput').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(true), 250); });
$('#searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const S = state.search;
    if (S.q !== $('#searchInput').value) { clearTimeout(searchTimer); runSearch(true); return; }
    gotoResult(S.idx + (e.shiftKey ? -1 : 1));
  } else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
});
$('#searchCase').addEventListener('change', () => runSearch(true));
$('#searchAccent').addEventListener('change', () => runSearch(true));
$('#searchPrev').onclick = () => gotoResult(state.search.idx - 1);
$('#searchNext').onclick = () => gotoResult(state.search.idx + 1);
$('#searchClose').onclick = closeSearch;
$('#btnSearch').onclick = () => (state.search.open ? $('#searchInput').focus() : openSearch());

/* phím tắt: Ctrl+F tìm kiếm; Delete / Ctrl+A khi đang ở thanh trang */
document.addEventListener('keydown', (e) => {
  if (!$('#ws').hidden) { wsKeydown(e); return; }
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === 'f') { e.preventDefault(); e.stopImmediatePropagation(); openSearch(); return; }
  if (e.key === 'F3') { e.preventDefault(); gotoResult(state.search.idx + (e.shiftKey ? -1 : 1)); return; }
  const inSidebar = document.activeElement && document.activeElement.closest && document.activeElement.closest('#sidebar');
  if (inSidebar && !isTyping(e.target)) {
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); deletePages(); }
    else if (ctrl && e.key.toLowerCase() === 'a') {
      e.preventDefault(); e.stopImmediatePropagation();
      state.pageSel = new Set(state.pages.map((_, i) => i)); refreshThumbSel();
    } else if (e.key === 'Escape') { state.pageSel = new Set(); refreshThumbSel(); e.stopImmediatePropagation(); }
  }
}, true);

/* =====================================================================
   KHÔNG GIAN LÀM VIỆC TÁCH / GHÉP PDF
   (chọn tính năng -> màn hình riêng: lưới trang, cắt bằng ✂, kéo thả…)
   ===================================================================== */
const GROUP_COLORS = ['#3B7597', '#e5484d', '#12a594', '#f5a524', '#8e4ec6', '#093C5D', '#d6409f', '#2fb8c2', '#a16207', '#4f46e5'];
const IC = {
  sc: '<svg class="ic" viewBox="0 0 20 20"><circle cx="5.5" cy="5.5" r="2.5"/><circle cx="5.5" cy="14.5" r="2.5"/><path d="M7.5 7l9 8M7.5 13l9-8"/></svg>',
  mg: '<svg class="ic" viewBox="0 0 20 20"><rect x="2.5" y="3" width="7" height="9" rx="1"/><rect x="10.5" y="8" width="7" height="9" rx="1"/><path d="M6 15v2h4"/></svg>',
  rot: '<svg class="ic" viewBox="0 0 20 20"><path d="M16 9a6 6 0 1 0-2 5"/><path d="M16 4v5h-5"/></svg>',
  dup: '<svg class="ic" viewBox="0 0 20 20"><rect x="6" y="6" width="10" height="11" rx="1.5"/><path d="M4 13V4.5A1.5 1.5 0 0 1 5.5 3H13"/></svg>',
  del: '<svg class="ic" viewBox="0 0 20 20"><path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11"/></svg>',
  check: '<svg class="ic" viewBox="0 0 20 20"><path d="M4 10.5l4 4 8-9"/></svg>',
};
const ws = { mode: null, fileTarget: null, obs: null, split: null, merge: null, dragUid: null, dropIdx: null };
let wsUid = 1;

function closeToolsMenu() { $('#toolsDD').classList.remove('open'); }
function wsObserver() {
  if (ws.obs) ws.obs.disconnect();
  ws.obs = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting || !en.target._render) continue;
      const f = en.target._render; en.target._render = null; f();
    }
  }, { root: $('#wsGridWrap'), rootMargin: '500px 0px' });
}
async function wsRenderThumb(canvas, pdfDoc, pageNo) {
  try {
    const page = await pdfDoc.getPage(pageNo);
    const vp1 = page.getViewport({ scale: 1 });
    const dpr = window.devicePixelRatio || 1;
    const k = Math.min(130 / vp1.width, 170 / vp1.height);
    const vp = page.getViewport({ scale: k * dpr });
    canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
    canvas.style.width = vp1.width * k + 'px'; canvas.style.height = vp1.height * k + 'px';
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    canvas._ready = true;
    if (canvas._afterRender) canvas._afterRender();
  } catch (e) { console.warn('thumb', e); }
}

function openWorkspace(mode) {
  closeToolsMenu();
  if (mode === 'split' && !state.pdf) {        // chưa có tài liệu -> chọn file trước
    ws.fileTarget = 'split-start';
    $('#wsFiles').click();
    return;
  }
  finishEditing();
  if (state.search.open) closeSearch();
  ws.mode = mode;
  $('#ws').hidden = false;
  document.querySelectorAll('.ws-switch button').forEach((b) => b.classList.toggle('active', b.dataset.ws === mode));
  wsObserver();
  if (mode === 'split') initSplit(); else initMerge();
}
function closeWorkspace() {
  $('#ws').hidden = true;
  if (ws.obs) ws.obs.disconnect();
  $('#wsGrid').innerHTML = '';
  if (ws.merge) for (const s of ws.merge.sources) if (!s.isCur) { try { s.pdf.loadingTask.destroy(); } catch (_) {} }
  ws.merge = null; ws.split = null; ws.mode = null;
}

/* ------------------------------------------------------------------ TÁCH */
function initSplit() {
  const N = state.pages.length;
  const half = Math.ceil(N / 2);
  ws.split = { mode: 'cut', cuts: new Set(), picked: new Set(), separate: false, every: Math.min(2, N) || 1,
    ranges: N > 1 ? `1-${half}, ${half + 1}${N > half + 1 ? '-' + N : ''}` : '1', done: null, cells: [], gaps: [] };
  $('#wsIcon').className = 'tc-ic split'; $('#wsIcon').innerHTML = IC.sc;
  $('#wsTitle').textContent = 'Tách PDF';
  $('#wsSub').textContent = `${state.name} · ${N} trang`;
  const grid = $('#wsGrid');
  grid.className = ''; grid.innerHTML = '';
  for (let i = 0; i < N; i++) {
    const cell = document.createElement('div');
    cell.className = 'ws-cell';
    cell.innerHTML = `<div class="ws-page" data-i="${i}"><span class="ws-tag" hidden></span><div class="ws-thumb"></div><div class="ws-num">${i + 1}</div></div>`;
    const holder = cell.querySelector('.ws-thumb');
    const canvas = document.createElement('canvas');
    holder.appendChild(canvas);
    holder._render = () => wsRenderThumb(canvas, state.pdf, i + 1);
    ws.obs.observe(holder);
    if (i < N - 1) {
      const gap = document.createElement('div');
      gap.className = 'ws-gap'; gap.dataset.g = i;
      gap.innerHTML = `<button class="ws-cut" title="Cắt sau trang ${i + 1}">${IC.sc}</button>`;
      cell.appendChild(gap);
      ws.split.gaps.push(gap);
    }
    grid.appendChild(cell);
    ws.split.cells.push(cell.querySelector('.ws-page'));
  }
  renderSplitPanel();
}
function splitResult() {
  const S = ws.split, N = state.pages.length;
  try {
    if (S.mode === 'cut' || S.mode === 'every') {
      const groups = []; let cur = [];
      for (let i = 0; i < N; i++) { cur.push(i); if (S.cuts.has(i) || i === N - 1) { groups.push(cur); cur = []; } }
      return { groups };
    }
    if (S.mode === 'extract') {
      const sel = [...S.picked].sort((a, b) => a - b);
      if (!sel.length) return { groups: [], error: 'Bấm vào các trang muốn trích xuất.' };
      return { groups: S.separate ? sel.map((p) => [p]) : [sel] };
    }
    return { groups: parseRanges(S.ranges, N) };
  } catch (e) { return { groups: [], error: e.message }; }
}
function setEveryCuts() {
  const S = ws.split, N = state.pages.length, k = Math.max(1, S.every | 0);
  S.cuts = new Set();
  for (let i = k - 1; i < N - 1; i += k) S.cuts.add(i);
}
function renderSplitPanel() {
  const S = ws.split;
  const panel = $('#wsPanel');
  if (S.done) {
    panel.innerHTML = `<div class="wp-done">
        <div class="ok">✓</div><h3>Đã tách xong!</h3>
        <p>Đã tạo ${S.done.count} file PDF${S.done.count > 1 ? ' (trong 1 file ZIP)' : ''}.<br>File đã được tải về máy.</p>
        <div class="col">
          <button class="primary wp-go" id="wpRedl">Tải xuống lại</button>
          <button id="wpAgain">Tách tiếp file này</button>
          <button id="wpBackEd">Quay lại trình chỉnh sửa</button>
        </div></div>`;
    $('#wpRedl').onclick = () => download(S.done.blob, S.done.fname);
    $('#wpAgain').onclick = () => { S.done = null; renderSplitPanel(); };
    $('#wpBackEd').onclick = closeWorkspace;
    return;
  }
  const modes = [
    ['cut', IC.sc, 'Cắt thủ công', 'Bấm biểu tượng ✂ giữa các trang để cắt'],
    ['extract', IC.check, 'Trích xuất trang', 'Bấm chọn các trang muốn lấy ra'],
    ['ranges', '1-3', 'Theo khoảng trang', 'Ví dụ: 1-3, 4-6, 8'],
    ['every', 'N', 'Cứ mỗi N trang', 'Chia đều thành các file N trang'],
  ];
  panel.innerHTML = `
    <div class="wp-sec"><h3>Chọn cách tách</h3><div class="wp-modes">
      ${modes.map(([m, ic, t, d]) => `<button class="wp-mode${S.mode === m ? ' active' : ''}" data-m="${m}"><span class="mi">${ic}</span><span><b>${t}</b><small>${d}</small></span></button>`).join('')}
    </div></div>
    <div class="wp-sec wp-opts" id="wpOpts"></div>
    <div class="wp-sec wp-sum" id="wpSum"></div>
    <div class="wp-foot">
      <label class="row" style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="wpEdits"${S.edits === false ? '' : ' checked'}> Gồm cả các phần đã thêm / chỉnh sửa</label>
      <button class="primary wp-go split" id="wpGo">${IC.sc} Tách PDF</button>
    </div>`;
  panel.querySelectorAll('.wp-mode').forEach((b) => b.addEventListener('click', () => {
    const m = b.dataset.m;
    if (m === 'every') setEveryCuts();
    S.mode = m; renderSplitPanel();
  }));
  $('#wpEdits').onchange = (e) => { S.edits = e.target.checked; };
  const opts = $('#wpOpts');
  if (S.mode === 'cut' || S.mode === 'every') {
    opts.innerHTML = (S.mode === 'every'
      ? `<label>Cứ mỗi <input type="number" id="wpEvery" min="1" max="${state.pages.length}" value="${S.every}"> trang → 1 file</label>` : '') +
      `<div class="row"><button id="wpCutAll">Cắt từng trang</button><button id="wpCutNone">Bỏ hết đường cắt</button></div>
       <small style="color:var(--muted)">Mẹo: di chuột vào khe giữa hai trang rồi bấm ✂ để thêm/bỏ đường cắt.</small>`;
    $('#wpCutAll').onclick = () => { S.mode = 'cut'; S.cuts = new Set(state.pages.slice(0, -1).map((_, i) => i)); renderSplitPanel(); };
    $('#wpCutNone').onclick = () => { S.mode = 'cut'; S.cuts = new Set(); renderSplitPanel(); };
    if ($('#wpEvery')) $('#wpEvery').oninput = (e) => { S.every = Math.max(1, parseInt(e.target.value, 10) || 1); setEveryCuts(); splitUpdate(); };
  } else if (S.mode === 'extract') {
    opts.innerHTML = `<div class="row"><button id="wpPickAll">Chọn tất cả</button><button id="wpPickNone">Bỏ chọn</button></div>
      <label><input type="radio" name="wpSep" value="0"${S.separate ? '' : ' checked'}> Gộp các trang đã chọn thành 1 file</label>
      <label><input type="radio" name="wpSep" value="1"${S.separate ? ' checked' : ''}> Mỗi trang đã chọn thành 1 file riêng</label>`;
    $('#wpPickAll').onclick = () => { S.picked = new Set(state.pages.map((_, i) => i)); splitUpdate(); };
    $('#wpPickNone').onclick = () => { S.picked = new Set(); splitUpdate(); };
    opts.querySelectorAll('input[name=wpSep]').forEach((r) => (r.onchange = () => { S.separate = r.value === '1'; splitUpdate(); }));
  } else {
    opts.innerHTML = `<label style="display:block">Các khoảng trang, cách nhau bằng dấu phẩy:</label>
      <input type="text" id="wpRanges" value="${S.ranges}" placeholder="VD: 1-3, 4-6, 8">
      <small style="color:var(--muted)">Mỗi khoảng tạo thành 1 file. Tài liệu có ${state.pages.length} trang.</small>`;
    $('#wpRanges').oninput = (e) => { S.ranges = e.target.value; splitUpdate(); };
  }
  $('#wpGo').onclick = async () => {
    const { groups, error } = splitResult();
    if (error || !groups.length) { toast(error || 'Chưa có gì để tách', true); return; }
    if (groups.length === 1 && groups[0].length === state.pages.length) {
      toast('Chưa có đường cắt nào – kết quả sẽ giống file gốc. Hãy bấm ✂ giữa các trang để cắt.', true, 5000); return;
    }
    const res = await doSplit(groups, `Đang tách thành ${groups.length} file…`, S.edits !== false);
    if (res) { S.done = { ...res, count: groups.length }; renderSplitPanel(); }
  };
  splitUpdate();
}
function splitUpdate() {
  const S = ws.split; if (!S) return;
  const { groups, error } = splitResult();
  const owner = new Map(), first = new Map();
  groups.forEach((g, gi) => { g.forEach((p) => { if (!owner.has(p)) owner.set(p, gi); }); if (g.length && !first.has(g[0])) first.set(g[0], gi); });
  const selective = S.mode === 'extract' || S.mode === 'ranges';
  S.cells.forEach((el, i) => {
    const gi = owner.get(i);
    const color = gi !== undefined ? GROUP_COLORS[gi % GROUP_COLORS.length] : '';
    el.style.borderColor = color;
    el.classList.toggle('dim', selective && gi === undefined);
    el.classList.toggle('extract-mode', S.mode === 'extract');
    el.classList.toggle('picked', S.mode === 'extract' && S.picked.has(i));
    const tag = el.querySelector('.ws-tag');
    const showTag = first.has(i) && (groups.length > 1 || selective);
    tag.hidden = !showTag;
    if (showTag) { tag.textContent = `File ${first.get(i) + 1}`; tag.style.background = GROUP_COLORS[first.get(i) % GROUP_COLORS.length]; }
  });
  const cutMode = S.mode === 'cut' || S.mode === 'every';
  $('#wsGrid').classList.toggle('no-cuts', !cutMode);
  S.gaps.forEach((g) => g.classList.toggle('cut', cutMode && S.cuts.has(+g.dataset.g)));
  const hint = {
    cut: `${IC.sc} Bấm vào biểu tượng kéo giữa hai trang để cắt tài liệu tại đó. Mỗi phần có màu riêng sẽ thành 1 file.`,
    every: `${IC.sc} Đã tự cắt cứ mỗi ${S.every} trang. Bạn vẫn có thể bấm ✂ để chỉnh lại.`,
    extract: 'Bấm vào các trang muốn lấy ra (trang được chọn có dấu ✓).',
    ranges: 'Nhập khoảng trang ở bên phải. Trang mờ là trang không nằm trong khoảng nào.',
  }[S.mode];
  $('#wsHint').innerHTML = hint;
  const sum = $('#wpSum');
  if (error) { sum.innerHTML = `<div class="err" style="color:#c62828">${error}</div>`; $('#wpGo').disabled = true; return; }
  $('#wpGo').disabled = false;
  const same = groups.length === 1 && groups[0].length === state.pages.length;
  sum.innerHTML = `<div class="big">${same ? 'Chưa cắt – sẽ giống file gốc' : `Sẽ tạo ${groups.length} file PDF`}</div>
    <div class="wp-files">${groups.slice(0, 40).map((g, gi) => `<div class="wp-file"><span class="dot" style="background:${GROUP_COLORS[gi % GROUP_COLORS.length]}"></span>
      <span class="nm">File ${gi + 1}</span><span class="ct">trang ${pageLabel(g)} (${g.length})</span></div>`).join('')}
      ${groups.length > 40 ? `<div class="wp-file"><span class="nm">… và ${groups.length - 40} file nữa</span></div>` : ''}</div>`;
}

/* ------------------------------------------------------------------ GHÉP / CHÈN */
function initMerge() {
  const M = ws.merge = { sources: [], items: [], sel: null };
  if (state.pdf) {
    M.sources.push({ id: 'cur', name: state.name, color: GROUP_COLORS[0], pdf: state.pdf, pages: state.pages.length, isCur: true });
    state.pages.forEach((p, i) => M.items.push({ uid: wsUid++, src: 0, page: i, rotate: 0 }));
  }
  M.original = M.items.map((it) => it.page);
  $('#wsIcon').className = 'tc-ic merge'; $('#wsIcon').innerHTML = IC.mg;
  $('#wsTitle').textContent = 'Ghép / Chèn PDF';
  mergeRenderGrid();
  renderMergePanel();
}
function mergeSub() {
  const M = ws.merge;
  $('#wsSub').textContent = M.items.length ? `${M.items.length} trang · ${M.sources.filter((s) => M.items.some((it) => it.src === M.sources.indexOf(s))).length} file` : 'Chưa có trang nào';
}
function mergeApplyRot(it) {
  const c = it.canvas; if (!c) return;
  const apply = () => {
    const w = parseFloat(c.style.width) || 130, h = parseFloat(c.style.height) || 170;
    const r = it.rotate % 180 !== 0;
    const k = r ? Math.min(130 / h, 170 / w, 1) : 1;
    c.style.transform = it.rotate ? `rotate(${it.rotate}deg) scale(${k})` : '';
  };
  if (c._ready) apply(); else c._afterRender = apply;
}
function mergeRenderGrid() {
  const M = ws.merge, grid = $('#wsGrid');
  grid.className = 'merge'; grid.innerHTML = '';
  M.items.forEach((it, idx) => {
    const src = it.blank ? null : M.sources[it.src];
    const cell = document.createElement('div');
    cell.className = 'ws-cell'; cell.dataset.uid = it.uid;
    const label = it.blank ? 'Trang trắng' : `${src.isCur ? 'Hiện tại' : src.name.replace(/\.pdf$/i, '')} · tr.${it.page + 1}`;
    cell.innerHTML = `<div class="ws-page${M.sel === it.uid ? ' sel' : ''}" draggable="true" data-uid="${it.uid}" title="${label}">
        <div class="ws-acts">
          <button data-act="rot" title="Xoay 90°">${IC.rot}</button>
          <button data-act="dup" title="Nhân bản">${IC.dup}</button>
          <button data-act="del" class="del" title="Xoá trang">${IC.del}</button>
        </div>
        <div class="ws-thumb${it.blank ? ' blank' : ''}"></div>
        <div class="ws-num"><b>${idx + 1}</b> · ${label}</div>
        <div class="ws-src" style="background:${src ? src.color : '#cbd2dd'}"></div>
      </div>`;
    if (!it.blank) {
      const holder = cell.querySelector('.ws-thumb');
      if (!it.canvas) {
        it.canvas = document.createElement('canvas');
        const c = it.canvas, pdfDoc = src.pdf, pn = it.page + 1;
        it._pending = () => wsRenderThumb(c, pdfDoc, pn);
      }
      holder.appendChild(it.canvas);
      if (it._pending) { holder._render = () => { const f = it._pending; it._pending = null; f && f(); }; ws.obs.observe(holder); }
      mergeApplyRot(it);
    }
    const gap = document.createElement('div');
    gap.className = 'ws-gap';
    if (M.sel === it.uid) gap.innerHTML = '<div class="ws-insert-mark"></div>';
    cell.appendChild(gap);
    grid.appendChild(cell);
  });
  if (!M.items.length) {
    grid.innerHTML = `<div style="margin:40px auto;text-align:center;color:var(--muted)">
      <div style="font-size:15px;margin-bottom:12px">Chưa có trang nào</div>
      <button class="wp-add" id="wsEmptyAdd" style="width:auto">＋ Chọn file PDF để ghép</button>
      <div style="margin-top:8px;font-size:12.5px">hoặc kéo thả nhiều file PDF vào đây</div></div>`;
    $('#wsEmptyAdd').onclick = () => { ws.fileTarget = 'merge'; $('#wsFiles').click(); };
  }
  $('#wsHint').innerHTML = M.items.length
    ? 'Kéo thả để sắp xếp trang · Di chuột vào trang để xoay / nhân bản / xoá · <b>Bấm chọn 1 trang</b> để đặt vị trí chèn file mới (vạch xanh), bấm lại để bỏ chọn.'
    : '';
  mergeSub();
}
function renderMergePanel() {
  const M = ws.merge, panel = $('#wsPanel');
  const used = new Map();
  M.items.forEach((it) => { if (!it.blank) used.set(it.src, (used.get(it.src) || 0) + 1); });
  const pos = M.sel ? M.items.findIndex((it) => it.uid === M.sel) + 1 : null;
  panel.innerHTML = `
    <div class="wp-sec">
      <button class="wp-add" id="wpAdd">＋ Thêm file PDF</button>
      <div style="font-size:12.5px;color:var(--muted);margin-top:8px">${pos ? `File mới sẽ được <b>chèn sau trang ${pos}</b>.` : 'File mới sẽ được thêm vào <b>cuối</b>. Bấm chọn 1 trang để chèn vào giữa.'}<br>Có thể kéo thả file PDF vào vùng trang bên trái.</div>
    </div>
    <div class="wp-sec"><h3>Các file (${M.sources.length})</h3><div class="wp-files">
      ${M.sources.map((s, i) => `<div class="wp-file"><span class="dot" style="background:${s.color}"></span>
        <span class="nm" title="${s.name}">${s.isCur ? '<b>Tài liệu hiện tại</b>' : s.name}</span>
        <span class="ct">${(used.get(i) || 0) === s.pages ? `${s.pages} trang` : `dùng ${used.get(i) || 0} · gốc ${s.pages} trang`}</span>
        ${s.isCur ? '' : `<button data-rm="${i}" title="Bỏ file này">×</button>`}</div>`).join('') || '<div style="color:var(--muted);font-size:12.5px">Chưa có file nào</div>'}
    </div></div>
    <div class="wp-sec wp-opts">
      <div class="row"><button id="wpBlank">＋ Trang trắng</button><button id="wpReverse">⇅ Đảo thứ tự</button><button id="wpReset" title="Huỷ mọi thay đổi trong màn hình này">↺ Làm lại</button></div>
    </div>
    <div class="wp-sec wp-sum"><div class="big">Kết quả: ${M.items.length} trang</div>
      <div style="color:var(--muted);font-size:12.5px">${state.pdf ? 'Bấm “Áp dụng” để cập nhật tài liệu đang sửa (vẫn hoàn tác được bằng Ctrl+Z).' : 'Bấm “Ghép” để mở tài liệu đã ghép trong trình chỉnh sửa.'}</div></div>
    <div class="wp-foot">
      <button class="primary wp-go" id="wpApply">${IC.mg} ${state.pdf ? 'Áp dụng vào tài liệu' : 'Ghép PDF'}</button>
      <button id="wpMergeDl">Ghép &amp; tải về PDF</button>
    </div>`;
  $('#wpAdd').onclick = () => { ws.fileTarget = 'merge'; $('#wsFiles').click(); };
  panel.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => {
    const i = +b.dataset.rm;
    M.items = M.items.filter((it) => it.blank || it.src !== i);
    M.sources[i].removed = true;
    M.sources = M.sources.map((s) => s);     // giữ chỉ số, đánh dấu đã bỏ
    const keep = M.sources.filter((s) => !s.removed);
    const remap = new Map(M.sources.map((s, k) => [k, keep.indexOf(s)]));
    M.items.forEach((it) => { if (!it.blank) it.src = remap.get(it.src); });
    try { M.sources[i].pdf.loadingTask.destroy(); } catch (_) {}
    M.sources = keep;
    if (M.sel && !M.items.some((it) => it.uid === M.sel)) M.sel = null;
    mergeRenderGrid(); renderMergePanel();
  }));
  $('#wpBlank').onclick = mergeAddBlank;
  $('#wpReverse').onclick = () => { M.items.reverse(); mergeRenderGrid(); renderMergePanel(); };
  $('#wpReset').onclick = () => {
    for (const s of M.sources) if (!s.isCur) { try { s.pdf.loadingTask.destroy(); } catch (_) {} }
    initMerge();
  };
  $('#wpApply').onclick = () => mergeFinish(false);
  $('#wpMergeDl').onclick = () => mergeFinish(true);
  $('#wpApply').disabled = $('#wpMergeDl').disabled = !M.items.length;
}
async function mergeAddFiles(files, insertAt = null) {
  const M = ws.merge; if (!M) return;
  files = [...files].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (!files.length) { toast('Hãy chọn file PDF.', true); return; }
  if (insertAt === null) insertAt = M.sel ? M.items.findIndex((it) => it.uid === M.sel) + 1 : M.items.length;
  const added = [];
  busy(true, `Đang đọc ${files.length} file…`);
  try {
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const info = await uploadBytes(bytes, f.name);
      const pdfDoc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const used = new Set(M.sources.map((s) => s.color));
      const color = GROUP_COLORS.find((c) => !used.has(c)) || GROUP_COLORS[M.sources.length % GROUP_COLORS.length];
      M.sources.push({ id: info.id, name: f.name, color, pdf: pdfDoc, pages: info.pages });
      const si = M.sources.length - 1;
      for (let n = 0; n < info.pages; n++) added.push({ uid: wsUid++, src: si, page: n, rotate: 0 });
    }
  } catch (e) { toast('Không đọc được file: ' + e.message, true, 7000); }
  finally { busy(false); }
  if (!added.length) return;
  M.items.splice(insertAt, 0, ...added);
  if (M.sel) M.sel = added[added.length - 1].uid;    // file tiếp theo sẽ nối tiếp sau
  mergeRenderGrid(); renderMergePanel();
  toast(`Đã thêm ${added.length} trang từ ${files.length} file`);
}
async function mergeAddBlank() {
  const M = ws.merge;
  const idx = M.sel ? M.items.findIndex((it) => it.uid === M.sel) : M.items.length - 1;
  let w = 595, h = 842;
  const ref = M.items[idx];
  if (ref && !ref.blank) {
    try { const vp = (await M.sources[ref.src].pdf.getPage(ref.page + 1)).getViewport({ scale: 1 }); w = vp.width; h = vp.height; } catch (_) {}
  } else if (ref && ref.blank) { w = ref.w; h = ref.h; }
  const it = { uid: wsUid++, blank: true, w, h, rotate: 0 };
  M.items.splice(idx + 1, 0, it);
  if (M.sel) M.sel = it.uid;
  mergeRenderGrid(); renderMergePanel();
}
function mergeAction(uid, act) {
  const M = ws.merge, idx = M.items.findIndex((it) => it.uid === uid);
  if (idx < 0) return;
  const it = M.items[idx];
  if (act === 'rot') { it.rotate = (it.rotate + 90) % 360; mergeApplyRot(it); return; }
  if (act === 'del') {
    M.items.splice(idx, 1);
    if (M.sel === uid) M.sel = null;
  } else if (act === 'dup') {
    const copy = { ...it, uid: wsUid++, canvas: null, _pending: null };
    if (it.canvas && it.canvas._ready) {
      const c = document.createElement('canvas');
      c.width = it.canvas.width; c.height = it.canvas.height;
      c.style.width = it.canvas.style.width; c.style.height = it.canvas.style.height;
      c.getContext('2d').drawImage(it.canvas, 0, 0); c._ready = true;
      copy.canvas = c;
    }
    M.items.splice(idx + 1, 0, copy);
  }
  mergeRenderGrid(); renderMergePanel();
}
async function mergeFinish(andDownload) {
  const M = ws.merge;
  if (!M.items.length) return;
  const specs = M.items.map((it) => {
    if (it.blank) return { blank: true, w: it.w, h: it.h };
    const s = M.sources[it.src];
    return s.isCur ? { src: 'cur', page: it.page, rotate: it.rotate } : { src: s.id, page: it.page, rotate: it.rotate };
  });
  const unchanged = state.pdf && specs.length === state.pages.length && specs.every((sp, i) => sp.src === 'cur' && sp.page === i && !sp.rotate);
  if (unchanged && !andDownload) { toast('Chưa có thay đổi nào.'); return; }
  if (state.docId) {
    if (!unchanged) await applyPageSpecs(specs, 'Đang ghép PDF…', null, `Đã cập nhật tài liệu: ${specs.length} trang`);
  } else {
    busy(true, 'Đang ghép PDF…');
    try {
      const res = await (await api('/api/compose', { pages: specs })).json();
      const bytes = await fetchDocBytes(res.id);
      const first = M.sources.find((s) => !s.isCur);
      await loadDoc({ docId: res.id, bytes, name: (first ? first.name.replace(/\.pdf$/i, '') : 'tai_lieu') + '_ghep.pdf', anns: [], fresh: true });
      setTool('select');
    } catch (e) { toast('Lỗi ghép PDF: ' + e.message, true, 7000); busy(false); return; }
    busy(false);
    toast(`Đã ghép thành ${specs.length} trang`);
  }
  closeWorkspace();
  if (andDownload) exportPdf();
}

/* ------------------------------------------------------------------ sự kiện chung */
$('#btnTools').onclick = (e) => { e.stopPropagation(); $('#toolsDD').classList.toggle('open'); };
document.addEventListener('click', (e) => { if (!e.target.closest('#toolsDD')) closeToolsMenu(); });
document.querySelectorAll('#toolsDD [data-ws]').forEach((b) => b.addEventListener('click', () => openWorkspace(b.dataset.ws)));
document.querySelectorAll('.ws-switch [data-ws]').forEach((b) => b.addEventListener('click', () => {
  if (ws.mode === b.dataset.ws) return;
  if (ws.merge) for (const s of ws.merge.sources) if (!s.isCur) { try { s.pdf.loadingTask.destroy(); } catch (_) {} }
  openWorkspace(b.dataset.ws);
}));
document.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', (e) => {
  e.stopPropagation();
  if (b.dataset.start === 'split') openWorkspace('split');
  else { openWorkspace('merge'); ws.fileTarget = 'merge'; $('#wsFiles').click(); }
}));
$('#wsBack').onclick = closeWorkspace;
$('#wsFiles').onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = '';
  if (!files.length) return;
  if (ws.fileTarget === 'split-start') {
    await openPdfFiles(files);
    if (state.pdf) openWorkspace('split');
  } else if (ws.merge) mergeAddFiles(files);
};
const wsGrid = $('#wsGrid');
wsGrid.addEventListener('click', (e) => {
  if (ws.mode === 'split') {
    const S = ws.split;
    const cut = e.target.closest('.ws-cut');
    if (cut) {
      const g = +cut.parentElement.dataset.g;
      if (S.mode !== 'cut') { if (S.mode !== 'every') S.cuts = new Set(); S.mode = 'cut'; renderSplitPanel(); }
      S.cuts.has(g) ? S.cuts.delete(g) : S.cuts.add(g);
      splitUpdate(); return;
    }
    const pg = e.target.closest('.ws-page');
    if (pg) {
      const i = +pg.dataset.i;
      if (S.mode !== 'extract') return;
      S.picked.has(i) ? S.picked.delete(i) : S.picked.add(i);
      splitUpdate();
    }
    return;
  }
  if (ws.mode === 'merge') {
    const btn = e.target.closest('.ws-acts button');
    const pg = e.target.closest('.ws-page');
    if (btn && pg) { mergeAction(+pg.dataset.uid, btn.dataset.act); return; }
    const M = ws.merge;
    M.sel = pg ? (M.sel === +pg.dataset.uid ? null : +pg.dataset.uid) : null;
    mergeRenderGrid(); renderMergePanel();
  }
});
const wsWrap = $('#wsGridWrap');
function wsClearDrop() { wsGrid.querySelectorAll('.drop-before,.drop-after').forEach((c) => c.classList.remove('drop-before', 'drop-after')); }
wsGrid.addEventListener('dragstart', (e) => {
  const pg = e.target.closest('.ws-page');
  if (ws.mode !== 'merge' || !pg) { e.preventDefault(); return; }
  ws.dragUid = +pg.dataset.uid;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'page');
  setTimeout(() => pg.classList.add('dragging'), 0);
});
wsGrid.addEventListener('dragend', () => { ws.dragUid = null; wsClearDrop(); wsWrap.classList.remove('drop-file'); });
wsWrap.addEventListener('dragover', (e) => {
  const isFile = ws.dragUid === null && [...(e.dataTransfer.types || [])].includes('Files');
  if (ws.mode !== 'merge' || (ws.dragUid === null && !isFile)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = isFile ? 'copy' : 'move';
  wsWrap.classList.toggle('drop-file', isFile);
  wsClearDrop();
  const cell = e.target.closest('.ws-cell');
  const M = ws.merge;
  if (cell) {
    const r = cell.querySelector('.ws-page').getBoundingClientRect();
    const after = e.clientX > r.left + r.width / 2;
    cell.classList.add(after ? 'drop-after' : 'drop-before');
    const idx = M.items.findIndex((it) => it.uid === +cell.dataset.uid);
    ws.dropIdx = idx + (after ? 1 : 0);
  } else ws.dropIdx = M.items.length;
});
wsWrap.addEventListener('dragleave', (e) => { if (!wsWrap.contains(e.relatedTarget)) { wsClearDrop(); wsWrap.classList.remove('drop-file'); } });
wsWrap.addEventListener('drop', (e) => {
  if (ws.mode !== 'merge') return;
  e.preventDefault();
  wsClearDrop(); wsWrap.classList.remove('drop-file');
  const M = ws.merge, at = ws.dropIdx ?? M.items.length;
  if (ws.dragUid !== null) {
    const from = M.items.findIndex((it) => it.uid === ws.dragUid);
    ws.dragUid = null;
    if (from < 0) return;
    const [it] = M.items.splice(from, 1);
    M.items.splice(from < at ? at - 1 : at, 0, it);
    mergeRenderGrid(); renderMergePanel();
    return;
  }
  const files = filesFromDataTransfer(e.dataTransfer);
  if (files.length) mergeAddFiles(files, at);
});
function wsKeydown(e) {
  e.stopImmediatePropagation();               // không để phím tắt của trình chỉnh sửa chạy phía sau
  if (isTyping(e.target)) return;
  if (e.key === 'Escape') { e.preventDefault(); closeWorkspace(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && ws.mode === 'merge' && ws.merge.sel) { e.preventDefault(); mergeAction(ws.merge.sel, 'del'); }
  if ((e.ctrlKey || e.metaKey) && ['f', 's', 'z', 'y', 'o'].includes(e.key.toLowerCase())) e.preventDefault();
}
['paste', 'copy', 'cut'].forEach((ev) => document.addEventListener(ev, (e) => { if (!$('#ws').hidden && !isTyping(e.target)) e.stopImmediatePropagation(); }, true));
