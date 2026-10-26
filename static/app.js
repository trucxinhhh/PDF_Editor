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
function busy(on, text = 'Đang xử lý…') { $('#busy').hidden = !on; $('#busyText').textContent = text; }
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
async function openPdfBytes(bytes, name, anns = []) {
  busy(true, 'Đang mở PDF…');
  try {
    const fd = new FormData();
    fd.append('file', new Blob([bytes], { type: 'application/pdf' }), name);
    const info = await (await api('/api/upload', fd, true)).json();
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    try { state.pdf && (state.pdf.loadingTask ? state.pdf.loadingTask.destroy() : state.pdf.cleanup()); } catch (_) {}
    Object.assign(state, { docId: info.id, name, bytes, pdf, anns, pages: [], sel: null, editing: null, undo: [], redo: [], dirty: false });
    $('#scanBanner').hidden = true;
    notifyScanned._shown = false;
    document.title = name + ' – PDF Editor';
    document.body.classList.add('has-doc');
    await buildPages();
    setTool('select');
  } catch (e) {
    console.error(e); toast('Không mở được file: ' + e.message, true, 6000);
  } finally { busy(false); }
}

async function openPdfFile(file) {
  if (state.dirty && !confirm('Các thay đổi chưa lưu sẽ mất. Tiếp tục mở file mới?')) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await openPdfBytes(bytes, file.name);
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
    await new pdfjsLib.TextLayer({ textContentSource: tc, container: p.textLayer, viewport: vp }).render();
    const eoc = document.createElement('div'); eoc.className = 'endOfContent'; p.textLayer.appendChild(eoc);
    if (!p.items) {
      p.items = extractItems(page, tc);
      // trang không có chữ thật nhưng có hình ảnh -> PDF dạng ảnh scan
      p.scanned = !p.items.length && tc.items.every((it) => !it.str || !it.str.trim());
      if (p.scanned) notifyScanned(p, 'open');
    }
    buildHits(p);
    p.rendered = true;
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
  $('#pageInfo').textContent = state.pdf ? `Trang ${currentPageIndex() + 1} / ${state.pdf.numPages}` : '';
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
function undo() {
  finishEditing();
  if (!state.undo.length) return;
  state.redo.push(clone(state.anns));
  state.anns = state.undo.pop();
  rerenderAllAnns(); updateButtons(); state.dirty = true;
}
function redo() {
  finishEditing();
  if (!state.redo.length) return;
  state.undo.push(clone(state.anns));
  state.anns = state.redo.pop();
  rerenderAllAnns(); updateButtons(); state.dirty = true;
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

async function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) { toast('Hãy chọn file ảnh (png, jpg…)', true); return null; }
  let src = await readAsDataURL(file);
  // ảnh không phải png/jpg (webp, gif, svg...) -> chuyển sang PNG để PDF hỗ trợ
  if (!/^data:image\/(png|jpe?g)/i.test(src)) {
    const [w, h] = await imageSize(src);
    const c = document.createElement('canvas'); c.width = w || 800; c.height = h || 600;
    const img = new Image(); img.src = src; await img.decode();
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    src = c.toDataURL('image/png');
  }
  const [nw, nh] = await imageSize(src);
  return { src, nw, nh };
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
$('#filePdf').onchange = (e) => { const f = e.target.files[0]; if (f) openPdfFile(f); e.target.value = ''; };
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
  const f = e.dataTransfer.files[0]; if (!f) return;
  if (/\.json$/i.test(f.name)) return openProjectFile(f);
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return openPdfFile(f);
  if (f.type.startsWith('image/') && state.pdf) {     // thả ảnh lên trang
    const pageEl = document.elementsFromPoint(e.clientX, e.clientY).map((x) => x.closest('.page')).find(Boolean);
    const p = pageEl ? state.pages[+pageEl.dataset.index] : state.pages[currentPageIndex()];
    const img = await loadImageFile(f);
    if (img) { const pt = pageEl ? pagePoint(e, p) : visibleCenter(p); placeImage(img, p, pt.x, pt.y); }
    return;
  }
  toast('Chỉ hỗ trợ file PDF, ảnh hoặc dự án .json', true);
});
window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

setTool('select', true);
updateButtons();
window.__pdfEditor = state;   // để debug
