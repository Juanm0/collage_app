'use strict';
/* Collage 30 fotos — todo corre en el navegador, nada se sube a internet. */
const $ = s => document.querySelector(s);
const stage = $('#stage'), viewer = $('#viewer');
const MOBILE = matchMedia('(pointer:coarse)').matches || (navigator.deviceMemory && navigator.deviceMemory <= 4);
// Estado: photos = [{id,file(original),thumb(url miniatura),name}], el índice i corresponde al "casillero" i del layout.
const S = { photos: [], o: 'v', seed: 1, zoom: 1, sel: -1, layout: null, keys: new Set(), nid: 1 };
const ratio = () => S.o === 'v' ? 2 / 3 : 3 / 2; // ancho / alto del collage

/* ---------- Layout del mosaico ---------- */
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* Reparte n fotos en una grilla sin huecos: algunas ocupan 2x2, 2x1 o 1x2.
   Empaqueta en el primer lugar libre y luego "estira" fotos vecinas para tapar huecos finales. */
function buildLayout(n) {
  const r = rng(S.seed * 7919 + (S.o === 'v' ? 1 : 2)), sz = []; let A = 0;
  for (let i = 0; i < n; i++) { const x = r(); const s = x < .12 ? [2, 2] : x < .26 ? [2, 1] : x < .40 ? [1, 2] : [1, 1]; sz.push(s); A += s[0] * s[1]; }
  const cols = Math.max(3, Math.min(24, Math.round(Math.sqrt(A * ratio()))));
  const g = []; const at = (y, x) => (g[y] || (g[y] = Array(cols).fill(-1)))[x];
  const free = (y, x, w, h) => { if (x < 0 || x + w > cols) return false; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (at(y + j, x + i) !== -1) return false; return true; };
  const P = [];
  for (let k = 0; k < n; k++) {
    const [w, h] = sz[k]; let done = false;
    for (let y = 0; !done; y++) for (let x = 0; x < cols && !done; x++) {
      if (at(y, x) !== -1) continue;
      for (const [tw, th] of [[w, h], [w, 1], [1, 1]]) if (free(y, x, tw, th)) {
        P[k] = { x, y, w: tw, h: th };
        for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) g[y + j][x + i] = k;
        done = true; break;
      }
    }
  }
  const R = Math.max(...P.map(p => p.y + p.h));
  for (let y = 0; y < R; y++) at(y, 0);
  const own = (y, x) => (y >= 0 && y < R && x >= 0 && x < cols) ? g[y][x] : -2;
  const strip = (cells) => cells.every(([y, x]) => own(y, x) === -1);
  const grow = (p, id, d) => {
    const ys = [...Array(p.h)].map((_, j) => p.y + j), xs = [...Array(p.w)].map((_, i) => p.x + i);
    let cells;
    if (d === 'r') cells = ys.map(y => [y, p.x + p.w]); else if (d === 'l') cells = ys.map(y => [y, p.x - 1]);
    else if (d === 'd') cells = xs.map(x => [p.y + p.h, x]); else cells = xs.map(x => [p.y - 1, x]);
    if (!strip(cells)) return false;
    cells.forEach(([y, x]) => g[y][x] = id);
    if (d === 'r') p.w++; else if (d === 'l') { p.x--; p.w++; } else if (d === 'd') p.h++; else { p.y--; p.h++; }
    return true;
  };
  for (let guard = 400, ch = true; ch && guard--;) {
    ch = false;
    for (let y = 0; y < R; y++) for (let x = 0; x < cols; x++) {
      if (own(y, x) !== -1) continue;
      for (const [id, d] of [[own(y, x - 1), 'r'], [own(y - 1, x), 'd'], [own(y, x + 1), 'l'], [own(y + 1, x), 'u']])
        if (id >= 0 && grow(P[id], id, d)) { ch = true; break; }
    }
  }
  return { cols, rows: R, P };
}

/* ---------- Render ---------- */
function render() { // recalcula layout y repinta todo (al agregar/quitar fotos o cambiar formato)
  const n = S.photos.length;
  S.layout = n ? buildLayout(n) : null;
  $('#empty').hidden = n > 0; stage.hidden = !n;
  $('#count').textContent = n + (n === 1 ? ' foto' : ' fotos');
  renderThumbs(); fit(); paint();
}
function paint(popA, popB) { // repinta solo los casilleros (al intercambiar)
  if (!S.layout) { stage.innerHTML = ''; return; }
  const { cols, rows, P } = S.layout;
  stage.style.gridTemplateColumns = `repeat(${cols},1fr)`; stage.style.gridTemplateRows = `repeat(${rows},1fr)`;
  stage.innerHTML = '';
  P.forEach((p, i) => {
    const t = document.createElement('div');
    t.className = 'tile' + (i === S.sel ? ' sel' : '') + (i === popA || i === popB ? ' pop' : '');
    t.dataset.i = i; t.style.gridArea = `${p.y + 1} / ${p.x + 1} / span ${p.h} / span ${p.w}`;
    t.innerHTML = `<img src="${S.photos[i].thumb}" alt="" draggable="false"><button class="del" title="Quitar foto">✕</button>`;
    stage.appendChild(t);
  });
}
function renderThumbs() {
  $('#thumbs').innerHTML = S.photos.map((p, i) => `<div class="th"><img src="${p.thumb}" alt=""><button data-rm="${i}" title="Eliminar">✕</button></div>`).join('');
}
function fit() { // tamaño del collage en pantalla = ajuste a la ventana × zoom
  const r = ratio(), vw = viewer.clientWidth - 24, vh = viewer.clientHeight - 24;
  const w = Math.max(120, Math.min(vw, vh * r)) * S.zoom;
  stage.style.width = w + 'px'; stage.style.height = w / r + 'px';
  $('#zl').textContent = Math.round(S.zoom * 100) + '%';
}
function setZoom(z) {
  z = Math.min(8, Math.max(1, z));
  const cx = (viewer.scrollLeft + viewer.clientWidth / 2) / (stage.offsetWidth || 1), cy = (viewer.scrollTop + viewer.clientHeight / 2) / (stage.offsetHeight || 1);
  S.zoom = z; fit();
  viewer.scrollLeft = cx * stage.offsetWidth - viewer.clientWidth / 2; viewer.scrollTop = cy * stage.offsetHeight - viewer.clientHeight / 2;
}

/* ---------- Carga de fotos ---------- */
async function decode(f) { // decodifica el ARCHIVO ORIGINAL (se usa para miniaturas y para exportar)
  try { const b = await createImageBitmap(f); return { src: b, w: b.width, h: b.height, close: () => b.close() }; }
  catch (e) {
    const u = URL.createObjectURL(f), im = new Image(); im.src = u; await im.decode();
    return { src: im, w: im.naturalWidth, h: im.naturalHeight, close: () => { URL.revokeObjectURL(u); im.src = ''; } };
  }
}
async function makeThumb(f) { // miniatura liviana (700 px) solo para la vista previa
  const im = await decode(f), s = Math.min(1, 700 / Math.max(im.w, im.h));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.w * s)); c.height = Math.max(1, Math.round(im.h * s));
  c.getContext('2d').drawImage(im.src, 0, 0, c.width, c.height); im.close();
  const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .85)); c.width = c.height = 0;
  if (!b) throw Error('thumb'); return URL.createObjectURL(b);
}
async function addFiles(list) {
  const all = [...list].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name));
  const fresh = all.filter(f => { const k = f.name + '|' + f.size + '|' + f.lastModified; if (S.keys.has(k)) return false; S.keys.add(k); f._k = k; return true; });
  if (!fresh.length) return toast(all.length ? 'Esas fotos ya estaban cargadas' : 'No se encontraron imágenes');
  let done = 0, failed = 0, next = 0; const out = new Array(fresh.length);
  busy('Preparando miniaturas…', 0);
  const worker = async () => { while (next < fresh.length) { const i = next++, f = fresh[i];
    try { out[i] = { id: S.nid++, file: f, thumb: await makeThumb(f), name: f.name }; } catch (e) { failed++; S.keys.delete(f._k); }
    busy(`Preparando miniaturas… ${++done}/${fresh.length}`, done / fresh.length); await new Promise(r => setTimeout(r)); } };
  await Promise.all([worker(), worker(), worker()]);
  S.photos.push(...out.filter(Boolean)); busyOff(); render();
  const dup = all.length - fresh.length;
  toast(`${out.filter(Boolean).length} fotos agregadas` + (dup ? ` · ${dup} repetidas omitidas` : '') + (failed ? ` · ${failed} no se pudieron leer` : ''));
}
function removePhoto(i) {
  const p = S.photos[i]; if (!p) return;
  URL.revokeObjectURL(p.thumb); S.keys.delete(p.file._k); S.photos.splice(i, 1); S.sel = -1; render();
}
function clearAll() {
  if (!S.photos.length || !confirm('¿Eliminar todas las fotografías?')) return;
  S.photos.forEach(p => URL.revokeObjectURL(p.thumb)); S.photos = []; S.keys.clear(); S.sel = -1; render();
}

/* ---------- Edición manual: tocar/clic para elegir e intercambiar, arrastrar (mouse) o pulsación larga (táctil) ---------- */
function swap(i, j) { [S.photos[i], S.photos[j]] = [S.photos[j], S.photos[i]]; S.sel = -1; renderThumbs(); paint(i, j); }
function tap(i) { if (S.sel === -1) S.sel = i; else if (S.sel === i) S.sel = -1; else return swap(S.sel, i); paint(); }
let D = null; // gesto actual
const tileAt = (x, y) => { const t = document.elementFromPoint(x, y); return t && t.closest ? t.closest('.tile') : null; };
function abort() { if (!D) return; clearTimeout(D.timer); D.ghost && D.ghost.remove(); stage.querySelectorAll('.drag,.over').forEach(e => e.classList.remove('drag', 'over')); D = null; }
function startDrag() {
  if (!D) return; D.active = true; navigator.vibrate && navigator.vibrate(20);
  const t = stage.querySelector(`.tile[data-i="${D.i}"]`); if (!t) return abort();
  t.classList.add('drag'); const g = document.createElement('img'); g.src = S.photos[D.i].thumb; g.className = 'ghost'; document.body.appendChild(g); D.ghost = g;
  g.style.left = D.x + 'px'; g.style.top = D.y + 'px';
}
stage.addEventListener('pointerdown', e => {
  if (e.target.closest('.del') || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const t = e.target.closest('.tile'); if (!t) return; abort();
  D = { i: +t.dataset.i, x: e.clientX, y: e.clientY, id: e.pointerId, type: e.pointerType, active: false };
  if (e.pointerType !== 'mouse') D.timer = setTimeout(startDrag, 380); // pulsación larga en celular
});
addEventListener('pointermove', e => {
  if (!D || e.pointerId !== D.id) return;
  const d = Math.hypot(e.clientX - D.x, e.clientY - D.y);
  if (!D.active) { if (D.type === 'mouse') { if (d > 6) startDrag(); } else if (d > 10) return abort(); if (!D || !D.active) return; }
  D.ghost.style.left = e.clientX + 'px'; D.ghost.style.top = e.clientY + 'px';
  stage.querySelectorAll('.over').forEach(x => x.classList.remove('over'));
  const t = tileAt(e.clientX, e.clientY); if (t && +t.dataset.i !== D.i) t.classList.add('over');
  const b = viewer.getBoundingClientRect(), m = 44; // auto-scroll en los bordes
  viewer.scrollLeft += e.clientX < b.left + m ? -14 : e.clientX > b.right - m ? 14 : 0;
  viewer.scrollTop += e.clientY < b.top + m ? -14 : e.clientY > b.bottom - m ? 14 : 0;
});
addEventListener('pointerup', e => {
  if (!D || e.pointerId !== D.id) return;
  const { i, active } = D, t = active ? tileAt(e.clientX, e.clientY) : null; abort();
  if (active) { if (t && +t.dataset.i !== i) swap(i, +t.dataset.i); } else tap(i);
});
addEventListener('pointercancel', e => { if (D && e.pointerId === D.id) abort(); });
document.addEventListener('touchmove', e => { if (D && D.active) e.preventDefault(); }, { passive: false }); // no scrollear mientras se mueve una foto
stage.addEventListener('contextmenu', e => e.preventDefault());
stage.addEventListener('click', e => { const b = e.target.closest('.del'); if (b) { e.stopPropagation(); removePhoto(+b.parentNode.dataset.i); } });
$('#thumbs').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) removePhoto(+b.dataset.rm); });

/* ---------- Zoom ---------- */
$('#zi').onclick = () => setZoom(S.zoom * 1.25); $('#zo').onclick = () => setZoom(S.zoom / 1.25); $('#z1').onclick = () => setZoom(1);
viewer.addEventListener('wheel', e => { if (!S.photos.length) return; e.preventDefault(); setZoom(S.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)); }, { passive: false });
let pd = 0, pz = 1; const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
viewer.addEventListener('touchstart', e => { if (e.touches.length === 2) { abort(); pd = dist(e.touches); pz = S.zoom; } }, { passive: true });
viewer.addEventListener('touchmove', e => { if (e.touches.length === 2 && pd) { e.preventDefault(); setZoom(pz * dist(e.touches) / pd); } }, { passive: false });
viewer.addEventListener('touchend', e => { if (e.touches.length < 2) pd = 0; });
new ResizeObserver(fit).observe(viewer);

/* ---------- Exportación en alta calidad (canvas, con los archivos originales) ---------- */
async function exportCollage(long) {
  if (!S.photos.length) return toast('Primero cargá algunas fotos');
  const fmt = $('#fmt').value, q = +$('#q').value / 100, r = ratio();
  let W = r < 1 ? Math.round(long * r) : long, H = r < 1 ? long : Math.round(long / r), note = '';
  const maxPx = MOBILE ? 32e6 : 96e6; // límite de memoria razonable según dispositivo
  if (W * H > maxPx) { const k = Math.sqrt(maxPx / (W * H)); W = Math.floor(W * k); H = Math.floor(H * k); note = ` (ajustada a ${W}×${H} px por límites del dispositivo)`; }
  busy('Preparando…', 0);
  try {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'); if (!ctx) throw Error('canvas');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.imageSmoothingQuality = 'high';
    const { cols, rows, P } = S.layout;
    for (let i = 0; i < P.length; i++) { // una foto original a la vez para cuidar la memoria
      const p = P[i], x0 = Math.round(p.x * W / cols), x1 = Math.round((p.x + p.w) * W / cols), y0 = Math.round(p.y * H / rows), y1 = Math.round((p.y + p.h) * H / rows);
      const im = await decode(S.photos[i].file), dw = x1 - x0, dh = y1 - y0, s = Math.max(dw / im.w, dh / im.h), sw = dw / s, sh = dh / s;
      ctx.drawImage(im.src, (im.w - sw) / 2, (im.h - sh) / 2, sw, sh, x0, y0, dw, dh); im.close(); // recorte "cover", sin deformar
      busy(`Procesando foto ${i + 1} de ${P.length}…`, (i + 1) / P.length * .9); await new Promise(r => setTimeout(r));
    }
    busy('Generando archivo…', .95);
    const blob = await new Promise(res => cv.toBlob(res, fmt === 'png' ? 'image/png' : 'image/jpeg', q)); cv.width = cv.height = 0;
    if (!blob) throw Error('blob');
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `collage-30-fotos.${fmt}`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 15000);
    busyOff(); toast(`Listo: ${W}×${H} px${note}`);
  } catch (e) {
    busyOff();
    if (confirm('No se pudo generar el collage a esa resolución (probablemente falta de memoria).\n¿Probar con una versión más liviana (2500 px)?')) { $('#res').value = '2500'; exportCollage(2500); }
  }
}

/* ---------- UI ---------- */
function busy(t, p) { $('#busy').hidden = false; $('#busyt').textContent = t; $('#busyb').style.width = (p * 100) + '%'; }
function busyOff() { $('#busy').hidden = true; }
let tt; function toast(m) { const e = $('#toast'); e.textContent = m; e.hidden = false; clearTimeout(tt); tt = setTimeout(() => e.hidden = true, 3500); }
const fi = $('#file');
$('#drop').onclick = $('#add').onclick = () => fi.click();
fi.onchange = () => { addFiles(fi.files); fi.value = ''; };
$('#clear').onclick = clearAll;
$('#shuffle').onclick = () => { S.seed++; S.sel = -1; render(); };
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); S.o = b.dataset.o; S.sel = -1; render();
});
$('#fmt').onchange = () => $('#qwrap').hidden = $('#fmt').value !== 'jpg';
$('#q').oninput = () => $('#qv').textContent = $('#q').value;
$('#res').value = MOBILE ? '3000' : '4500';
$('#dl').onclick = () => exportCollage(+$('#res').value);
addEventListener('dragover', e => { e.preventDefault(); $('#drop').classList.add('over'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) $('#drop').classList.remove('over'); });
addEventListener('drop', e => { e.preventDefault(); $('#drop').classList.remove('over'); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
render();
