// Сборка готового PDF (pdf-lib).
//
// Два пути, и выбирается тот, что меньше теряет:
//
// «На месте» — когда все страницы из одного файла и стоят в прежнем порядке
// (замазали, подписали, повернули, обрезали — но не переставляли и не
// удаляли). Тогда правится сам исходный документ, и в нём остаётся всё, что
// pdf-lib не умеет переносить: оглавление (по нему читалка строит главы и
// пересказы), формы, ссылки, метаданные.
//
// «Новый документ» — после перестановок, удалений и склеек. Страницы
// копируются в чистый файл; оглавление при этом теряется.
//
// Каждая страница бывает трёх видов:
//   нетронутая — копируется как есть;
//   с разметкой — исходное содержимое остаётся (текст выделяется), сверху
//     кладётся прозрачная картинка с разметкой;
//   «сплющенная» — страница целиком становится картинкой, а её прежнее
//     содержимое, ресурсы, аннотации и поля формы из файла вычищаются. Так
//     сохраняется всё, где что-то замазано или размыто: иначе текст из-под
//     краски достаётся обычным копированием.
//
// После сборки из файла выметаются все объекты, до которых не дотянуться от
// корня. pdf-lib сам этого не делает: снятый со страницы поток с текстом
// остался бы лежать в файле, просто ни на что не ссылаясь.

import { renderBase, totalRotation, pageTouched, CancelledError } from "./pdfEditorDoc.js";
import { renderObjects, hidesContent, searchableText } from "./pdfEditorCanvas.js";
import robotoUrl from "./fonts/Roboto-Regular.ttf?url";

// Потолок холста. Safari на iPhone не даёт холст больше 16,7 Мп и падает
// молча, пустой картинкой; с запасом на вторую копию для разметки.
const MAX_PIXELS = 12_000_000;

export function exportScale(page, dpi) {
  const want = dpi / 72;
  const cap = Math.sqrt(MAX_PIXELS / (page.width * page.height));
  return Math.max(0.5, Math.min(want, cap));
}

// Что станет со страницей при сохранении. Нужна и интерфейсу: окно
// сохранения честно говорит, сколько страниц уйдёт картинкой.
export function pagePlan(page, source, options) {
  const rasterOnly = page.kind === "pdf" && !!source?.libFailed;
  const hiding = hidesContent(page.objects);
  const flatten =
    options.flattenAll ||
    rasterOnly ||
    page.enhance !== "none" ||
    (options.flattenHidden && hiding);
  return { flatten, hiding, rasterOnly };
}

// inPlacePossible — можно ли править исходный файл, а не собирать новый.
export function inPlacePossible(pages) {
  if (!pages.length || pages.some((p) => p.kind !== "pdf")) return false;
  const sourceId = pages[0].sourceId;
  return pages.every((p, i) => p.sourceId === sourceId && p.index === i);
}

function canvasBytes(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Не удалось сохранить страницу в картинку"));
        blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
      },
      type,
      quality,
    );
  });
}

async function renderBaseCanvas(page, source, scale) {
  const canvas = document.createElement("canvas");
  await renderBase(page, source, scale, canvas).promise;
  return canvas;
}

export async function buildPdf({ pages, sources, options, ocrFor = () => null, onProgress = () => {}, isCancelled = () => false }) {
  const lib = await import("pdf-lib");
  const { PDFDocument, PDFName, PDFArray, PDFDict, PDFRef, PDFStream, degrees } = lib;

  // Сначала пробуем открыть исходники в pdf-lib. Зашифрованный PDF (а таких
  // много: банковские выписки закрыты «паролем владельца») pdf.js покажет, а
  // pdf-lib скопировать не сможет — его страницы уйдут картинками.
  const libDocs = new Map();
  for (const source of sources.values()) {
    if (source.kind !== "pdf") continue;
    if (!pages.some((p) => p.sourceId === source.id)) continue;
    if (source.libFailed) continue;
    try {
      libDocs.set(source.id, await PDFDocument.load(source.bytes, { updateMetadata: false }));
    } catch {
      source.libFailed = true;
    }
  }

  const inPlace = options.keepStructure !== false && inPlacePossible(pages) && libDocs.has(pages[0].sourceId);
  const out = inPlace ? libDocs.get(pages[0].sourceId) : await PDFDocument.create();
  const ctx = out.context;

  // Шрифт для невидимого текста из распознавания. Стандартные шрифты PDF
  // кириллицы не знают, поэтому свой — и только когда он правда нужен.
  let font = null;
  async function getFont() {
    if (font) return font;
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    out.registerFontkit(fontkit);
    const bytes = new Uint8Array(await (await fetch(robotoUrl)).arrayBuffer());
    font = await out.embedFont(bytes, { subset: true });
    return font;
  }

  const imageCache = new Map();
  async function sourceImage(source) {
    if (!imageCache.has(source.id)) {
      const img = source.type === "image/png" ? await out.embedPng(source.bytes) : await out.embedJpg(source.bytes);
      imageCache.set(source.id, img);
    }
    return imageCache.get(source.id);
  }

  // В новом документе страницы одного исходника копируются одним вызовом:
  // у каждого copyPages свой копировщик, и шрифты книги, скопированные
  // постранично, легли бы в файл по разу на страницу.
  const copied = new Map();
  if (!inPlace) {
    const want = new Map();
    pages.forEach((page, i) => {
      if (page.kind !== "pdf" || !libDocs.has(page.sourceId)) return;
      if (pagePlan(page, sources.get(page.sourceId), options).flatten) return;
      if (!want.has(page.sourceId)) want.set(page.sourceId, []);
      want.get(page.sourceId).push(i);
    });
    for (const [sourceId, order] of want) {
      const indices = order.map((i) => pages[i].index);
      const result = await out.copyPages(libDocs.get(sourceId), indices);
      order.forEach((pageNo, k) => copied.set(pageNo, result[k]));
    }
  }

  let flattenedCount = 0;
  const targetPages = [];

  for (let i = 0; i < pages.length; i++) {
    if (isCancelled()) throw new CancelledError();
    onProgress({ done: i, total: pages.length, stage: `Страница ${i + 1} из ${pages.length}` });
    const page = pages[i];
    const source = page.sourceId ? sources.get(page.sourceId) : null;
    const plan = pagePlan(page, source, options);
    const ocrLines = options.ocrLayer && ocrFor(page) ? await searchableText(page.objects, ocrFor(page)) : null;
    const withOcr = !!ocrLines?.length;

    // Нетронутая страница — копия один в один.
    if (!plan.flatten && !pageTouched(page) && !withOcr && page.kind === "pdf" && libDocs.has(page.sourceId)) {
      if (!inPlace) out.addPage(copied.get(i));
      continue;
    }

    // A — из координат экрана (точки, ось y вверх) в координаты страницы PDF.
    // Для страниц исходника её даёт pdf.js: он знает и /Rotate, и смещённый
    // MediaBox. У новых страниц экран и PDF совпадают.
    let A = (x, y) => [x, y];
    let pg;
    const W = page.width;
    const H = page.height;

    if (page.kind === "pdf" && libDocs.has(page.sourceId) && (inPlace || !plan.flatten)) {
      pg = inPlace ? out.getPage(i) : copied.get(i);
      if (!inPlace) out.addPage(pg);
      const p = await source.pdf.getPage(page.index + 1);
      const vp = p.getViewport({ scale: 1, rotation: totalRotation(page) });
      A = (x, y) => vp.convertToPdfPoint(x, H - y);
      pg.setRotation(degrees(totalRotation(page)));
      detachContents(pg);
      if (plan.flatten) {
        wipePage(out, pg);
        flattenedCount++;
      }
    } else {
      pg = out.addPage([W, H]);
      if (plan.flatten) flattenedCount++;
    }
    targetPages.push(pg);

    const scale = exportScale(page, options.dpi);
    const needBase = plan.flatten || page.objects.some((o) => o.kind === "effect");
    const base = needBase && page.kind !== "blank" ? await renderBaseCanvas(page, source, scale) : null;

    if (plan.flatten) {
      const full = page.objects.length
        ? await renderObjects(page.objects, W, H, scale, { base: base || whiteCanvas(W, H, scale), flatten: true })
        : base || whiteCanvas(W, H, scale);
      const jpg = await out.embedJpg(await canvasBytes(full, "image/jpeg", options.jpegQuality));
      drawCovering(lib, pg, jpg, A, W, H);
    } else {
      if (page.kind === "image") {
        drawRotatedImage(pg, await sourceImage(source), page, degrees);
      }
      if (page.objects.length) {
        const overlay = await renderObjects(page.objects, W, H, scale, { base });
        const png = await out.embedPng(await canvasBytes(overlay, "image/png"));
        drawCovering(lib, pg, png, A, W, H);
      }
    }

    if (withOcr) drawInvisibleText(lib, pg, await getFont(), ocrLines, A, H);

    if (page.crop) {
      const c = page.crop;
      const [x1, y1] = A(c.x, H - c.y - c.h);
      const [x2, y2] = A(c.x + c.w, H - c.y);
      pg.setCropBox(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    }
  }

  onProgress({ done: pages.length, total: pages.length, stage: "Собираю файл" });
  if (options.title) out.setTitle(options.title);
  out.setModificationDate(new Date());
  await out.flush();
  sweepUnreachable(ctx, { PDFRef, PDFDict, PDFArray, PDFStream });
  const bytes = await out.save({ useObjectStreams: true });
  return { bytes, inPlace, flattenedCount };

  // --- помощники, которым нужен lib ---

  // Чужой массив Contents может быть общим у двух копий одной страницы —
  // разметка, дописанная в него, проступила бы на обеих.
  function detachContents(pg) {
    const contents = pg.node.Contents();
    if (contents instanceof PDFArray) {
      pg.node.set(PDFName.of("Contents"), ctx.obj(contents.asArray().slice()));
    }
  }

  // wipePage — у страницы остаётся только геометрия. Всё прочее, включая
  // миниатюру (/Thumb — да, это картинка той самой страницы), уходит. Поля
  // формы со страницы снимаются из AcroForm: иначе значение поля лежит в
  // документе отдельно от страницы и переживает любую замазку.
  function wipePage(doc, pg) {
    try {
      const form = doc.getForm();
      for (const field of form.getFields()) {
        const onPage = field.acroField.getWidgets().some((w) => {
          try {
            return form.findWidgetPage(w) === pg;
          } catch {
            return false;
          }
        });
        if (onPage) form.removeField(field);
      }
    } catch {
      /* формы нет или она кривая — снимать нечего */
    }
    const keep = new Set(["Type", "Parent", "MediaBox", "CropBox", "Rotate", "UserUnit"]);
    // Унаследованные MediaBox/CropBox прибиваем к самой странице: родитель может
    // быть общим, а геометрия у этой страницы должна остаться прежней.
    for (const key of ["MediaBox", "CropBox"]) {
      const value = pg.node.getInheritableAttribute(PDFName.of(key));
      if (value) pg.node.set(PDFName.of(key), value);
    }
    for (const key of pg.node.keys()) {
      if (!keep.has(key.decodeText())) pg.node.delete(key);
    }
    pg.node.set(PDFName.of("Resources"), ctx.obj({}));
    pg.node.set(PDFName.of("Contents"), ctx.obj([]));
    pg.node.normalized = false;
  }
}

function whiteCanvas(W, H, scale) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(W * scale));
  c.height = Math.max(1, Math.round(H * scale));
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// Матрица cm по функции точки: значения в трёх точках однозначно задают
// аффинное преобразование, и путаться в порядке перемножения не нужно.
function matrixOf(A) {
  const [e, f] = A(0, 0);
  const [ax, ay] = A(1, 0);
  const [cx, cy] = A(0, 1);
  return [ax - e, ay - f, cx - e, cy - f, e, f];
}

// drawCovering — картинка на весь экранный лист W×H.
function drawCovering(lib, pg, image, A, W, H) {
  const { pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject } = lib;
  const name = pg.node.newXObject("PdfEd", image.ref);
  const m = matrixOf(A);
  pg.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(...m),
    concatTransformationMatrix(W, 0, 0, H, 0, 0),
    drawObject(name),
    popGraphicsState(),
  );
}

// Фото на новой странице. Страница уже повёрнута вместе с фото (её W×H —
// экранные), так что кадр кладётся с поворотом, а не страница.
function drawRotatedImage(pg, image, page, degrees) {
  const r = page.rot % 360;
  const sideways = r % 180 !== 0;
  const w0 = sideways ? page.height : page.width;
  const h0 = sideways ? page.width : page.height;
  const at = { 0: [0, 0], 90: [0, w0], 180: [w0, h0], 270: [h0, 0] }[r];
  pg.drawImage(image, { x: at[0], y: at[1], width: w0, height: h0, rotate: degrees(-r) });
}

// Невидимый текст под картинкой (режим отрисовки 3): его не видно, но по нему
// работают поиск и выделение. Ширина слова подгоняется сжатием Tz, чтобы
// выделение ложилось ровно на слово на картинке.
function drawInvisibleText(lib, pg, font, lines, A, H) {
  const {
    pushGraphicsState,
    popGraphicsState,
    concatTransformationMatrix,
    beginText,
    endText,
    setFontAndSize,
    setTextMatrix,
    showText,
    setTextRenderingMode,
    TextRenderingMode,
    setCharacterSqueeze,
  } = lib;
  const name = pg.node.newFontDictionary("PdfEdF", font.ref);
  const list = [pushGraphicsState(), concatTransformationMatrix(...matrixOf(A)), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];
  for (const line of lines) {
    const words = line.words?.length ? line.words : [line];
    for (const w of words) {
      if (!w.text || w.w <= 0 || w.h <= 0) continue;
      try {
        const size = Math.max(1, w.h * 0.85);
        const natural = font.widthOfTextAtSize(w.text, size);
        if (!natural) continue;
        list.push(
          setFontAndSize(name, size),
          setCharacterSqueeze(Math.max(10, Math.min(400, (100 * w.w) / natural))),
          setTextMatrix(1, 0, 0, 1, w.x, H - (w.y + w.h) + w.h * 0.2),
          showText(font.encodeText(w.text)),
        );
      } catch {
        /* символа нет в шрифте — слово пропускаем, остальное ляжет */
      }
    }
  }
  list.push(endText(), popGraphicsState());
  pg.pushOperators(...list);
}

// sweepUnreachable — удалить из файла всё, до чего нельзя дойти от корня.
function sweepUnreachable(ctx, { PDFRef, PDFDict, PDFArray, PDFStream }) {
  const seen = new Set();
  const stack = [ctx.trailerInfo.Root, ctx.trailerInfo.Info].filter(Boolean);
  while (stack.length) {
    const obj = stack.pop();
    if (obj instanceof PDFRef) {
      if (seen.has(obj.tag)) continue;
      seen.add(obj.tag);
      const target = ctx.lookup(obj);
      if (target) stack.push(target);
    } else if (obj instanceof PDFDict) {
      for (const [, v] of obj.entries()) stack.push(v);
    } else if (obj instanceof PDFArray) {
      for (const v of obj.asArray()) stack.push(v);
    } else if (obj instanceof PDFStream) {
      stack.push(obj.dict);
    }
  }
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!seen.has(ref.tag)) ctx.delete(ref);
  }
}
