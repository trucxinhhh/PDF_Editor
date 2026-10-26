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
    highlight: { color: '#ffeb3b', opacity: 0.4 },
    whiteout: { color: '#ffffff' },
    comment: { color: '#ffd23f' },
    edit: { whiteBg: false },
  },
};
const els = new Map();   // ann.id -> element
let observer = null;
let uid = Date.now();
const newId = () => 'a' + (uid++).toString(36);

const HINTS = {
  select: 'Chọn: bấm vào đối tượng để chọn/kéo, nhấp đúp vào chữ để sửa. Bôi đen chữ trong PDF để copy (Ctrl+C).',
  text: 'Văn bản: bấm vào vị trí trên trang rồi gõ chữ. Enter để xuống dòng, Esc để xong.',
  image: 'Ảnh: chọn file ảnh rồi bấm vào trang để đặt. Có thể dán ảnh trực tiếp bằng Ctrl+V.',
  highlight: 'Highlight: kéo chuột để tô vùng. Mẹo: bôi đen chữ ở chế độ Chọn rồi bấm nút Highlight.',
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
      items: old[i] ? old[i].items : null, rendered: false, rendering: null };
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
    if (!p.items) p.items = extractItems(page, tc);
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

function buildHits(p) {
  p.hits.innerHTML = '';
  const s = state.scale;
  for (const it of p.items || []) {
    const d = document.createElement('div');
    d.className = 'hit';
    d.title = it.str;
    d.style.left = (it.x - 1) * s + 'px';
    d.style.top = (it.baseline - it.size * 0.9) * s + 'px';
    d.style.width = (it.w + 2) * s + 'px';
    d.style.height = it.size * 1.15 * s + 'px';
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
  if (a.type === 'highlight') { el.style.background = a.color; el.style.opacity = a.opacity; }
  if (a.type === 'whiteout') el.style.background = a.color;
  if (a.type === 'comment') {
    el.style.width = ''; el.style.height = '';
    el.querySelector('.icon').style.background = a.color;
    const ta = el.querySelector('textarea'); if (document.activeElement !== ta) ta.value = a.text || '';
  }
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
    a.x = clamp(ax + dx, -a.w + 5, p.w - 5);
    a.y = clamp(ay + dy, -a.h + 5, p.h - 5);
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
    } else {
      a.w = Math.max(4, w0 + dx); a.h = Math.max(3, h0 + dy);
    }
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
      break;
    }
    case 'highlight':
    case 'whiteout':
      dragRect(e, p, pt);
      break;
  }
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
    if (tool === 'highlight') addAnn({ type: 'highlight', ...base, ...state.defaults.highlight }, { selectIt: false });
    else addAnn({ type: 'whiteout', ...base, ...state.defaults.whiteout }, { selectIt: false });
  };
  p.overlay.addEventListener('pointermove', move); p.overlay.addEventListener('pointerup', up);
}

function createEditFromItem(p, key) {
  const exist = state.anns.find((a) => a.srcKey === key);
  if (exist) { startEditing(exist); return; }
  const it = (p.items || []).find((i) => i.key === key); if (!it) return;
  const a = addAnn({
    type: 'edit', page: p.index, srcKey: key, text: it.str,
    ox: it.x - 1, oy: it.baseline - it.size * 0.9, ow: it.w + 2, oh: it.size * 1.15,
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
    for (const r of merged) created.push({ type: 'highlight', page: p.index, ...r, ...state.defaults.highlight, id: newId() });
  }
  if (!created.length) return false;
  pushHistory(snap);
  created.forEach((a) => addAnn(a, { history: false, selectIt: false }));
  sel.removeAllRanges();
  toast('Đã highlight ' + created.length + ' vùng');
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
  syncProps();
}

function propTarget() {
  const a = state.sel && findAnn(state.sel);
  if (a) return { kind: a.type === 'edit' ? 'text' : a.type, obj: a, ann: a };
  const kind = { text: 'text', edit: 'text', select: 'text', image: 'text', highlight: 'highlight', whiteout: 'whiteout', comment: 'comment' }[state.tool];
  return { kind, obj: state.defaults[kind], ann: null };
}
function syncProps() {
  const { kind, obj, ann } = propTarget();
  const show = (sel, on) => ($(sel).style.display = on ? '' : 'none');
  const isText = kind === 'text';
  show('#propSize', isText); show('#propFont', isText); show('#propBold', isText);
  $('#propSize').parentElement.style.display = isText ? '' : 'none';
  show('#opacityWrap', kind === 'highlight');
  show('#whiteBgWrap', (ann && ann.type === 'edit') || (!ann && state.tool === 'edit'));
  $('#propColor').parentElement.style.display = kind === 'image' ? 'none' : '';
  if (obj) {
    if (obj.color) $('#propColor').value = obj.color;
    if (obj.size) $('#propSize').value = obj.size;
    if (obj.font) $('#propFont').value = obj.font;
    $('#propBold').classList.toggle('on', !!obj.bold);
    if (obj.opacity) $('#propOpacity').value = obj.opacity;
  }
  $('#propWhiteBg').checked = ann && ann.type === 'edit' ? !!ann.whiteBg : state.defaults.edit.whiteBg;
}
function changeProp(key, value) {
  const { obj, ann } = propTarget();
  if (key === 'whiteBg') {
    if (ann && ann.type === 'edit') { pushHistory(); ann.whiteBg = value; } else state.defaults.edit.whiteBg = value;
    return;
  }
  if (!obj) return;
  if (ann) { pushHistory(); ann[key] = value; updateAnnEl(ann); }
  else obj[key] = value;
  // nhớ làm mặc định cho lần sau
  if (ann && state.defaults[ann.type === 'edit' ? 'text' : ann.type] && key !== 'text') {
    const d = state.defaults[ann.type === 'edit' ? 'text' : ann.type];
    if (key in d) d[key] = value;
  }
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
  const a = { ...src, id: newId(), page: pageIndex, x: src.x + 12, y: src.y + 12 };
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
    if (e.key === 'ArrowLeft') a.x -= st; if (e.key === 'ArrowRight') a.x += st;
    if (e.key === 'ArrowUp') a.y -= st; if (e.key === 'ArrowDown') a.y += st;
    updateAnnEl(a); return;
  }
  const map = { v: 'select', t: 'text', i: 'image', h: 'highlight', w: 'whiteout', c: 'comment', e: 'edit' };
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
$('#propColor').addEventListener('input', (e) => {
  const { ann } = propTarget();
  if (ann) { ann.color = e.target.value; updateAnnEl(ann); } else changeProp('color', e.target.value);
});
$('#propColor').addEventListener('change', (e) => {   // lưu lịch sử 1 lần khi chọn xong màu
  const { ann } = propTarget();
  if (ann) { const snap = clone(state.anns); const prev = $('#propColor').dataset.prev; if (prev) snap.find((x) => x.id === ann.id).color = prev; pushHistory(snap); const k = ann.type === 'edit' ? 'text' : ann.type; if (state.defaults[k]) state.defaults[k].color = e.target.value; }
});
$('#propColor').addEventListener('focus', (e) => (e.target.dataset.prev = e.target.value));
$('#propColor').addEventListener('click', (e) => (e.target.dataset.prev = e.target.value));
$('#propSize').addEventListener('change', (e) => changeProp('size', clamp(parseFloat(e.target.value) || 14, 4, 300)));
$('#propFont').addEventListener('change', (e) => changeProp('font', e.target.value));
$('#propBold').addEventListener('click', () => changeProp('bold', !$('#propBold').classList.contains('on')));
$('#propOpacity').addEventListener('change', (e) => changeProp('opacity', parseFloat(e.target.value)));
$('#propWhiteBg').addEventListener('change', (e) => changeProp('whiteBg', e.target.checked));

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
