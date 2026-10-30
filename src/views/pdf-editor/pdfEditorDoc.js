// Документ PDF-редактора: откуда берутся страницы и как нарисовать каждую.
//
// Страница — простой объект, который никогда не меняется на месте: любая
// правка собирает новый объект (см. withPage во вьюхе). На этом держится
// история: снимок — это просто массив ссылок на страницы, и сорок шагов
// «отменить» не копируют мегабайты распознанного текста и картинок.
//
// Всё, что лежит на странице, — в её собственной системе координат: точки PDF
// (1/72 дюйма) с началом в левом верхнем углу, уже с учётом поворота. Поэтому
// поворот страницы поворачивает и всё, что на ней нарисовано (rotatePage).
//
// Источник — файл, из которого пришли страницы: PDF целиком или одна
// картинка. Байты источника хранятся нетронутыми — из них при сохранении
// копируются страницы, которые пользователь не трогал, со всем их текстом,
// ссылками и векторной графикой.

import { loadPdfjs, COMMON_OPTIONS } from "@/views/pdf-reader/composables/usePdfLoader.js";

let seq = 0;
export const uid = (prefix) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

// Фото со смартфона кладём на страницу шириной с A4: 4000 пикселей в точках
// PDF — это лист в полтора метра, и любой просмотрщик открыл бы его в 10%.
const A4 = { w: 595.28, h: 841.89 };

// Больше этого по длинной стороне фото не бывает нужно даже для печати, а
// память телефона не резиновая: 12 Мп кадр в canvas — это 48 МБ.
const MAX_IMAGE_SIDE = 4000;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];

export function isPdfFile(file) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
}

export function isImageFile(file) {
  return IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name || "");
}

export class PasswordNeededError extends Error {
  constructor(wrong) {
    super(wrong ? "Пароль не подошёл" : "Файл закрыт паролем");
    this.wrong = wrong;
  }
}

async function openPdfjs(bytes, password) {
  const lib = await loadPdfjs();
  // pdf.js передаёт буфер в воркер и отрывает его у нас — отдаём копию,
  // оригинал ещё понадобится при сохранении.
  const task = lib.getDocument({ data: bytes.slice(), password, ...COMMON_OPTIONS });
  try {
    return await task.promise;
  } catch (e) {
    if (e?.name === "PasswordException") throw new PasswordNeededError(e.code === 2);
    throw e;
  }
}

function loadImageElement(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Картинка не открылась"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Не удалось сжать картинку"))), type, quality);
  });
}

// Картинку перекодируем один раз, при открытии. Дело не в размере: JPEG с
// телефона почти всегда лежит боком и повёрнут только флажком EXIF. Браузер
// флажок учитывает, а PDF-просмотрщики — нет, и вложенный как есть кадр
// приехал бы в PDF на боку. Через canvas он выходит уже повёрнутым.
async function normalizeImage(blob) {
  const { img, url } = await loadImageElement(blob);
  try {
    const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const png = blob.type === "image/png";
    if (!png) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    const type = png ? "image/png" : "image/jpeg";
    const out = await canvasToBlob(canvas, type, 0.92);
    return { blob: out, type, width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// openSource — файл в источник и его страницы.
export async function openSource(file, { password } = {}) {
  const name = file.name || "документ";
  if (isPdfFile(file)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await openPdfjs(bytes, password);
    const source = { id: uid("s"), kind: "pdf", name, bytes, password: password || "", pdf };
    source.libFailed = await isEncrypted(pdf);
    return { source, pages: await pagesOfPdf(source) };
  }
  if (isImageFile(file)) {
    const norm = await normalizeImage(file);
    const source = await imageSource(name, norm.blob, norm.type);
    return { source, pages: [imagePage(source)] };
  }
  throw new Error(`«${name}» — не PDF и не картинка`);
}

// Зашифрованный файл (часто — без пароля на открытие, только «пароль
// владельца», как у банковских выписок) pdf.js покажет, а pdf-lib не
// скопирует: его страницы при сохранении уйдут картинками. Знать это нужно
// заранее, чтобы окно сохранения не обещало лишнего.
async function isEncrypted(pdf) {
  try {
    const meta = await pdf.getMetadata();
    return !!meta?.info?.EncryptFilterName;
  } catch {
    return false;
  }
}

async function imageSource(name, blob, type) {
  const { img, url } = await loadImageElement(blob);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { id: uid("s"), kind: "image", name, bytes, type, img, url, width: img.naturalWidth, height: img.naturalHeight };
}

// restoreSource — источник из черновика: байты те же, объекты pdf.js и
// картинки поднимаются заново.
export async function restoreSource(saved) {
  if (saved.kind === "pdf") {
    const pdf = await openPdfjs(saved.bytes, saved.password || undefined);
    return { ...saved, pdf, libFailed: await isEncrypted(pdf) };
  }
  const blob = new Blob([saved.bytes], { type: saved.type });
  const restored = await imageSource(saved.name, blob, saved.type);
  return { ...restored, id: saved.id };
}

export function releaseSource(source) {
  try {
    source.pdf?.destroy();
  } catch {
    /* уже закрыт */
  }
  if (source.url) URL.revokeObjectURL(source.url);
}

async function pagesOfPdf(source) {
  const n = source.pdf.numPages;
  const pages = new Array(n);
  // getPage по одной на книге в пятьсот страниц — это секунды ожидания; пачками
  // воркер справляется в разы быстрее, а память не взлетает.
  const BATCH = 24;
  for (let start = 0; start < n; start += BATCH) {
    const chunk = [];
    for (let i = start; i < Math.min(n, start + BATCH); i++) {
      chunk.push(
        source.pdf.getPage(i + 1).then((p) => {
          const vp = p.getViewport({ scale: 1 });
          pages[i] = {
            id: uid("p"),
            kind: "pdf",
            sourceId: source.id,
            index: i,
            baseRotate: p.rotate || 0,
            // view — та область страницы, которую pdf.js рисует (CropBox,
            // обрезанный по MediaBox). Её же потом вкладываем при сохранении,
            // иначе картинка и разметка поверх неё разъедутся.
            view: [...p.view],
            rot: 0,
            width: vp.width,
            height: vp.height,
            objects: [],
            crop: null,
            enhance: "none",
            rev: 0,
          };
        }),
      );
    }
    await Promise.all(chunk);
  }
  return pages;
}

function imagePage(source) {
  const portrait = source.height >= source.width;
  const box = portrait ? A4 : { w: A4.h, h: A4.w };
  const k = Math.min(box.w / source.width, box.h / source.height);
  return {
    id: uid("p"),
    kind: "image",
    sourceId: source.id,
    index: 0,
    baseRotate: 0,
    view: null,
    rot: 0,
    width: source.width * k,
    height: source.height * k,
    objects: [],
    crop: null,
    enhance: "none",
    rev: 0,
  };
}

export function blankPage(like) {
  return {
    id: uid("p"),
    kind: "blank",
    sourceId: null,
    index: 0,
    baseRotate: 0,
    view: null,
    rot: 0,
    width: like?.width || A4.w,
    height: like?.height || A4.h,
    objects: [],
    crop: null,
    enhance: "none",
    rev: 0,
  };
}

// totalRotation — как страница стоит на экране: собственный /Rotate файла
// плюс то, что докрутил пользователь.
export function totalRotation(page) {
  return (((page.baseRotate + page.rot) % 360) + 360) % 360;
}

// Есть ли на странице хоть одна правка. Нетронутую страницу при сохранении
// копируем как есть, со ссылками, формами и выделяемым текстом.
export function pageTouched(page) {
  return page.objects.length > 0 || page.rot !== 0 || page.crop || page.enhance !== "none";
}

// --- Отрисовка ---

function drawImageRotated(ctx, img, srcW, srcH, rotation, outW, outH) {
  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const sideways = rotation % 180 !== 0;
  const w = sideways ? outH : outW;
  const h = sideways ? outW : outH;
  ctx.drawImage(img, 0, 0, srcW, srcH, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// renderBase рисует страницу без разметки — то, что лежит «под» ней. Отдаёт
// { promise, cancel }: при быстром листании незаконченную отрисовку надо
// отменять, иначе pdf.js выстраивает очередь из десятка ненужных страниц.
export function renderBase(page, source, scale, canvas) {
  const W = Math.max(1, Math.floor(page.width * scale));
  const H = Math.max(1, Math.floor(page.height * scale));
  let cancelled = false;
  let task = null;

  const promise = (async () => {
    if (page.kind === "pdf") {
      const p = await source.pdf.getPage(page.index + 1);
      if (cancelled) throw new CancelledError();
      const viewport = p.getViewport({ scale, rotation: totalRotation(page) });
      // Холст готовим в стороне и переносим одним махом: иначе при листании
      // на долю секунды виден пустой белый лист вместо прошлой страницы.
      const off = document.createElement("canvas");
      off.width = W;
      off.height = H;
      const ctx = off.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      task = p.render({ canvasContext: ctx, viewport });
      try {
        await task.promise;
      } catch (e) {
        if (e?.name === "RenderingCancelledException") throw new CancelledError();
        throw e;
      }
      if (cancelled) throw new CancelledError();
      canvas.width = W;
      canvas.height = H;
      canvas.getContext("2d").drawImage(off, 0, 0);
    } else {
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      if (page.kind === "image") {
        drawImageRotated(ctx, source.img, source.width, source.height, page.rot, W, H);
      }
    }
    if (page.enhance !== "none") enhanceCanvas(canvas, page.enhance);
  })();

  return {
    promise,
    cancel() {
      cancelled = true;
      try {
        task?.cancel();
      } catch {
        /* уже дорисовалась */
      }
    },
  };
}

export class CancelledError extends Error {
  constructor() {
    super("cancelled");
    this.cancelled = true;
  }
}

// --- Улучшение скана ---
//
// Фото документа почти всегда серое, с тенью от руки и жёлтым светом лампы.
// Три режима закрывают почти всё: «серый» снимает цвет, «контраст» растягивает
// гистограмму (бумага становится белой, текст — чёрным), «ч/б» — порог по
// Оцу, как у сканера в режиме «документ».

export const ENHANCE_MODES = [
  { code: "none", label: "Как есть" },
  { code: "gray", label: "Серый" },
  { code: "contrast", label: "Контраст" },
  { code: "bw", label: "Ч/Б" },
];

function enhanceCanvas(canvas, mode) {
  const ctx = canvas.getContext("2d");
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  const n = d.length / 4;
  const lum = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const v = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
    lum[i] = v;
    hist[lum[i]]++;
  }

  let map;
  if (mode === "gray") {
    map = (v) => v;
  } else if (mode === "contrast") {
    // Отрезаем по 1% с краёв: одна чёрная точка или блик не должны
    // испортить растяжку всей страницы.
    const cut = n * 0.01;
    let lo = 0;
    let hi = 255;
    for (let acc = 0; lo < 255 && acc + hist[lo] < cut; lo++) acc += hist[lo];
    for (let acc = 0; hi > 0 && acc + hist[hi] < cut; hi--) acc += hist[hi];
    if (hi <= lo) hi = lo + 1;
    map = (v) => ((v - lo) * 255) / (hi - lo);
  } else {
    const t = otsu(hist, n);
    map = (v) => (v > t ? 255 : 0);
  }

  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = map(v);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const v = lut[lum[i]];
    d[j] = v;
    d[j + 1] = v;
    d[j + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
}

function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

// --- Текст страницы ---

// pdfTextBoxes — строки настоящего текста PDF в координатах страницы. По ним
// инструмент «Править текст» знает, где что написано и каким кеглем.
export async function pdfTextBoxes(page, source) {
  if (page.kind !== "pdf") return [];
  const lib = await loadPdfjs();
  const p = await source.pdf.getPage(page.index + 1);
  const vp = p.getViewport({ scale: 1, rotation: totalRotation(page) });
  const content = await p.getTextContent();
  const items = [];
  for (const item of content.items) {
    if (!item.str || !item.str.trim()) continue;
    const tx = lib.Util.transform(vp.transform, item.transform);
    const fontSize = Math.hypot(tx[2], tx[3]);
    if (fontSize < 1) continue;
    // Повёрнутый и вертикальный текст на экране «Править» не берёт: надпись
    // поверх него легла бы поперёк.
    if (Math.abs(Math.atan2(tx[1], tx[0])) > 0.02) continue;
    const style = content.styles[item.fontName] || {};
    const ascent = style.ascent > 0 ? style.ascent : 0.8;
    const descent = style.descent < 0 ? style.descent : -0.2;
    items.push({
      text: item.str,
      x: tx[4],
      baseline: tx[5],
      w: item.width * vp.scale,
      fontSize,
      ascent,
      descent,
      family: style.fontFamily || "sans-serif",
    });
  }
  return mergeRuns(items).map((r) => ({
    text: r.text,
    x: r.x,
    y: r.baseline - r.fontSize * r.ascent,
    w: r.w,
    h: r.fontSize * (r.ascent - r.descent),
    fontSize: r.fontSize,
    family: r.family,
  }));
}

// Генераторы PDF режут строку на куски как попало — иногда по слову, иногда по
// букве. Править фразу по буквам невозможно, поэтому соседние куски одной
// строки с тем же кеглем склеиваем обратно.
function mergeRuns(items) {
  const out = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (prev) {
      const sameLine = Math.abs(prev.baseline - it.baseline) < prev.fontSize * 0.3;
      const sameSize = Math.abs(prev.fontSize - it.fontSize) < prev.fontSize * 0.15;
      const gap = it.x - (prev.x + prev.w);
      if (sameLine && sameSize && gap > -prev.fontSize * 0.5 && gap < prev.fontSize * 0.8) {
        const space = gap > prev.fontSize * 0.15 && !/\s$/.test(prev.text) && !/^\s/.test(it.text);
        prev.text += (space ? " " : "") + it.text;
        prev.w = it.x + it.w - prev.x;
        continue;
      }
    }
    out.push({ ...it });
  }
  return out;
}

// --- Повороты и пересчёт координат ---

// Точка страницы W×H после поворота на 90° по часовой: верхний левый угол
// уходит в верхний правый. Против часовой — обратно.
export function rotatePoint(x, y, W, H, clockwise) {
  return clockwise ? [H - y, x] : [y, W - x];
}

export function rotateRect(r, W, H, clockwise) {
  const [x1, y1] = rotatePoint(r.x, r.y, W, H, clockwise);
  const [x2, y2] = rotatePoint(r.x + r.w, r.y + r.h, W, H, clockwise);
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}
