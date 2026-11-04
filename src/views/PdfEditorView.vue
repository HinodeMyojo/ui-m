<script setup>
// PDF-редактор: замазать, размыть, дописать, подписать, переставить страницы.
// Работает и с «настоящими» PDF, и с PDF-фотографиями, и с фото с камеры.
//
// Устройство:
//   pdf-editor/pdfEditorDoc.js    — страницы, источники, отрисовка, улучшение скана;
//   pdf-editor/pdfEditorCanvas.js — разметка на fabric.js, размытие, подбор цвета;
//   pdf-editor/pdfEditorExport.js — сборка PDF (pdf-lib) и вычистка спрятанного;
//   pdf-editor/pdfEditorOcr.js    — распознавание текста на сканах;
//   pdf-editor/pdfEditorDraft.js  — черновик в IndexedDB.
//
// На сервер файл уходит только по кнопке «В библиотеку»: всё остальное
// делается в браузере, документы с паспортами и договорами никуда не летят.

import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRaw, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Canvas, Ellipse, FabricImage, IText, Line, Path, PencilBrush, Rect, util } from "fabric";
import { isMobile } from "@/composables/useIsMobile.js";
import { fetchPdfBlob, getPdfDetails, getPdfFiles, pdfSaveName, replacePdfFile, uploadPdfFile } from "@/api/pdfFiles.js";
import {
  ENHANCE_MODES,
  PasswordNeededError,
  blankPage,
  isImageFile,
  isPdfFile,
  openSource,
  pdfTextBoxes,
  releaseSource,
  renderBase,
  restoreSource,
  rotateRect,
  uid,
} from "./pdf-editor/pdfEditorDoc.js";
import {
  EffectRect,
  hidesContent,
  inkColor,
  paperColor,
  renderObjects,
  rotateObjects,
  styleControls,
} from "./pdf-editor/pdfEditorCanvas.js";
import { buildPdf, inPlacePossible, pagePlan } from "./pdf-editor/pdfEditorExport.js";
import { recognize, terminateOcr } from "./pdf-editor/pdfEditorOcr.js";
import * as draft from "./pdf-editor/pdfEditorDraft.js";
import PdfSignaturePad from "./pdf-editor/PdfSignaturePad.vue";

const route = useRoute();
const router = useRouter();

// Палец, а не мышь: ручки крупнее, рамка выделения выключена (она отнимает
// у пальца прокрутку), по умолчанию — «Рука».
const isTouch = window.matchMedia("(pointer: coarse)").matches;
styleControls(isTouch);

// --- Инструменты ---

const TOOLS = [
  { code: "hand", icon: "✋", label: "Рука", hint: "Листать и двигать страницу" },
  { code: "select", icon: "👆", label: "Выбор", hint: "Выделить, подвинуть, растянуть, удалить" },
  { sep: true },
  { code: "redact", icon: "⬛", label: "Закрасить", hint: "Сплошная краска поверх — спрятать навсегда" },
  { code: "whiteout", icon: "⬜", label: "Замазка", hint: "Цветом бумаги, как корректором" },
  { code: "blur", icon: "💧", label: "Размыть", hint: "Размыть кусок страницы" },
  { code: "pixelate", icon: "▦", label: "Пиксели", hint: "Пикселизация, как у номеров на фото" },
  { sep: true },
  { code: "edittext", icon: "✏️", label: "Править", hint: "Исправить надпись на странице — и на скане тоже" },
  { code: "text", icon: "🔤", label: "Текст", hint: "Дописать текст" },
  { code: "highlight", icon: "🖍️", label: "Маркер", hint: "Выделить маркером" },
  { code: "pen", icon: "✒️", label: "Перо", hint: "Рисовать от руки" },
  { code: "rect", icon: "▭", label: "Рамка", hint: "Прямоугольник" },
  { code: "ellipse", icon: "◯", label: "Овал", hint: "Овал" },
  { code: "line", icon: "╱", label: "Линия", hint: "Линия" },
  { code: "arrow", icon: "➜", label: "Стрелка", hint: "Стрелка" },
  { sep: true },
  { code: "image", icon: "🖼️", label: "Картинка", hint: "Вставить картинку или печать", action: true },
  { code: "signature", icon: "✍️", label: "Подпись", hint: "Расписаться от руки", action: true },
  { code: "crop", icon: "⛶", label: "Обрезать", hint: "Обрезать поля страницы" },
];

const DRAG_TOOLS = new Set(["redact", "whiteout", "blur", "pixelate", "highlight", "rect", "ellipse", "line", "arrow", "crop"]);

// Какие свойства показывать в панели — по виду объекта.
const TOOL_KIND = {
  redact: "redact",
  whiteout: "whiteout",
  blur: "effect",
  pixelate: "effect",
  highlight: "highlight",
  pen: "draw",
  rect: "shape",
  ellipse: "shape",
  line: "line",
  arrow: "line",
  text: "text",
  edittext: "text",
};

const KIND_TITLE = {
  redact: "Закраска",
  whiteout: "Замазка",
  textcover: "Замазка под правкой",
  effect: "Размытие",
  highlight: "Маркер",
  draw: "Перо",
  shape: "Фигура",
  line: "Линия",
  text: "Текст",
  image: "Картинка",
  mixed: "Несколько объектов",
};

const SWATCHES = ["#000000", "#ffffff", "#e03131", "#1c7ed6", "#2f9e44", "#ffd43b", "#f76707", "#7048e8"];
const FONTS = [
  { code: "Arial", label: "Без засечек" },
  { code: "Times New Roman", label: "С засечками" },
  { code: "Courier New", label: "Моноширинный" },
];

const styles = reactive({
  redact: { color: "#000000" },
  whiteout: { auto: true, color: "#ffffff" },
  textcover: { color: "#ffffff" },
  effect: { effect: "blur", strength: 10 },
  highlight: { color: "#ffd43b", opacity: 0.45 },
  draw: { color: "#e03131", strokeWidth: 3, opacity: 1 },
  shape: { color: "#e03131", strokeWidth: 2, fillOn: false, fill: "#fff3bf", opacity: 1 },
  line: { color: "#e03131", strokeWidth: 2.5 },
  text: { color: "#111111", fontSize: 14, fontFamily: "Arial", bold: false, opacity: 1 },
  image: { opacity: 1 },
});

const colorField = (kind) => (["draw", "line", "shape"].includes(kind) ? "stroke" : "fill");

// --- Состояние документа ---

const phase = ref("start"); // start | loading | edit
const loading = reactive({ text: "", progress: 0 });
const toastText = ref("");
const sources = new Map();
const pages = shallowRef([]);
const current = ref(0);
const docName = ref("");
const library = ref(null); // { id, title } — если открыт из библиотеки
const ocrMap = shallowRef(new Map()); // id страницы → распознанный текст
const tool = ref(isTouch ? "hand" : "select");
const zoom = ref(1);
const fitMode = ref(isMobile.value ? "width" : "page");
const selection = shallowRef([]);
const selVersion = ref(0);
const histVersion = ref(0);
const textBoxes = ref([]);
const textNote = ref("");
const ocrBusy = ref(null);
const showSignature = ref(false);
const showSave = ref(false);
const showPagesSheet = ref(false);
const passwordAsk = ref(null);
const passwordValue = ref("");
const draftInfo = ref(null);
const draftState = ref(""); // "" | saving | saved | off
const sheet = reactive({ w: 0, h: 0 });

const page = computed(() => pages.value[current.value] || null);
const passthrough = computed(() => tool.value === "hand" || tool.value === "edittext");

const undoStack = [];
const redoStack = [];
const canUndo = computed(() => (histVersion.value, undoStack.length > 0));
const canRedo = computed(() => (histVersion.value, redoStack.length > 0));

let toastTimer = null;
function toast(text, ms = 3200) {
  toastText.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastText.value = ""), ms);
}

// Страницы не меняются на месте — правка собирает новый массив. История
// хранит прежние массивы целиком: это ссылки, а не копии.
function withPage(list, i, patch) {
  const next = list.slice();
  next[i] = { ...list[i], ...patch, rev: list[i].rev + 1 };
  return next;
}

function setPages(next, nextCurrent = current.value, { history = true } = {}) {
  if (history) {
    undoStack.push({ pages: pages.value, current: current.value });
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
    histVersion.value++;
  }
  pages.value = next;
  current.value = Math.max(0, Math.min(next.length - 1, nextCurrent));
  scheduleDraft();
}

async function undo() {
  await flushEditing();
  const s = undoStack.pop();
  if (!s) return;
  redoStack.push({ pages: pages.value, current: current.value });
  pages.value = s.pages;
  current.value = Math.min(s.current, s.pages.length - 1);
  histVersion.value++;
  scheduleDraft();
}

async function redo() {
  await flushEditing();
  const s = redoStack.pop();
  if (!s) return;
  undoStack.push({ pages: pages.value, current: current.value });
  pages.value = s.pages;
  current.value = Math.min(s.current, s.pages.length - 1);
  histVersion.value++;
  scheduleDraft();
}

// Распознанный текст лежит отдельно от истории: «отменить» откатывает
// правки, а не распознавание, на которое ушла минута. Строки хранятся в
// повороте, при котором их распознали, и докручиваются под текущий.
function ocrFor(pg) {
  const entry = ocrMap.value.get(pg.id);
  if (!entry) return null;
  const steps = (((pg.rot - entry.rot) / 90) % 4 + 4) % 4;
  let W = entry.width;
  let H = entry.height;
  let lines = entry.lines;
  for (let k = 0; k < steps; k++) {
    const w0 = W;
    const h0 = H;
    lines = lines.map((l) => ({
      ...l,
      ...rotateRect(l, w0, h0, true),
      words: (l.words || []).map((w) => ({ ...w, ...rotateRect(w, w0, h0, true) })),
    }));
    W = h0;
    H = w0;
  }
  return lines;
}

// --- Холст ---

const stageEl = ref(null);
const baseEl = ref(null);
const fabricEl = ref(null);
const fileInput = ref(null);
const addInput = ref(null);
const cameraInput = ref(null);
const imageInput = ref(null);

let fc = null;
let loadedPageId = null;
let loadedRev = -1;
let loadedBaseKey = "";
let suppress = 0;
let baseTask = null;
let chain = Promise.resolve();

function initFabric() {
  fc = new Canvas(fabricEl.value, {
    preserveObjectStacking: true,
    selection: !isTouch,
    stopContextMenu: true,
    enableRetinaScaling: true,
    targetFindTolerance: isTouch ? 10 : 4,
    uniformScaling: false,
  });
  fc.showEffectFrames = true;
  fc.on("mouse:down", onDown);
  fc.on("mouse:move", onMove);
  fc.on("mouse:up", onUp);
  fc.on("object:modified", () => commit());
  fc.on("path:created", (e) => {
    e.path.set({ kind: "draw", opacity: styles.draw.opacity });
    commit();
  });
  fc.on("text:editing:exited", (e) => {
    const t = e.target;
    if (t && !t.text.trim()) {
      suppress++;
      fc.remove(t);
      suppress--;
    }
    commit();
  });
  // Набранное сохраняется по ходу: до выхода из правки дело может и не
  // дойти — закрыли вкладку, телефон убил страницу в фоне.
  fc.on("text:changed", () => commitSoon());
  fc.on("selection:created", syncSelection);
  fc.on("selection:updated", syncSelection);
  fc.on("selection:cleared", syncSelection);
}

function syncSelection() {
  selection.value = fc ? fc.getActiveObjects() : [];
  selVersion.value++;
}

// commit — разметка с холста в страницу и шаг в историю.
function commit() {
  if (suppress || !fc || !page.value || loadedPageId !== page.value.id) return;
  const objects = fc.toObject().objects;
  // Выход из правки текста после набора, отпускание без сдвига — не шаг
  // истории: иначе «отменить» пришлось бы жать по два раза.
  if (JSON.stringify(objects) === JSON.stringify(page.value.objects)) return;
  const next = withPage(pages.value, current.value, { objects });
  loadedRev = next[current.value].rev;
  setPages(next);
}

let commitTimer = null;
function commitSoon() {
  clearTimeout(commitTimer);
  commitTimer = setTimeout(commit, 350);
}

// Перед любым действием со страницами дописываем незаконченное: правку текста
// и отложенный commit от ползунка.
async function flushEditing() {
  if (!fc) return;
  const active = fc.getActiveObject();
  if (active?.isEditing) active.exitEditing();
  if (commitTimer) {
    clearTimeout(commitTimer);
    commitTimer = null;
    commit();
  }
}

function displayScale(pg) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return Math.min(zoom.value * dpr, Math.sqrt(16e6 / (pg.width * pg.height)));
}

// Отрисовки идут цепочкой: две параллельные загрузки разметки в fabric
// перемешали бы объекты двух страниц.
function refreshPage() {
  chain = chain.then(doRefresh).catch((e) => {
    if (!e?.cancelled) console.error(e);
  });
  return chain;
}

async function doRefresh() {
  const pg = page.value;
  if (!pg || !fc) return;
  applySize(pg);
  if (pg.id !== loadedPageId || pg.rev !== loadedRev) {
    suppress++;
    try {
      fc.discardActiveObject();
      fc.clear();
      await fc.loadFromJSON({ objects: pg.objects });
    } finally {
      suppress--;
    }
    loadedPageId = pg.id;
    loadedRev = pg.rev;
    applyTool();
    syncSelection();
  }
  const scale = displayScale(pg);
  const baseKey = `${pg.id}|${pg.rot}|${pg.enhance}|${scale.toFixed(3)}`;
  if (baseKey !== loadedBaseKey) {
    baseTask?.cancel();
    const task = renderBase(pg, sources.get(pg.sourceId), scale, baseEl.value);
    baseTask = task;
    await task.promise;
    loadedBaseKey = baseKey;
    fc.effectSource = { id: `${baseKey}:${Math.random()}`, canvas: baseEl.value, scale: baseEl.value.width / pg.width };
  }
  fc.requestRenderAll();
}

function applySize(pg) {
  sheet.w = pg.width * zoom.value;
  sheet.h = pg.height * zoom.value;
  fc.setDimensions({ width: sheet.w, height: sheet.h });
  fc.setZoom(zoom.value);
}

watch(page, () => {
  if (phase.value === "edit") refreshPage();
});

let zoomTimer = null;
watch(zoom, () => {
  if (!page.value || !fc) return;
  applySize(page.value);
  fc.requestRenderAll();
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(refreshPage, 140);
});

function fitZoom() {
  const pg = page.value;
  const el = stageEl.value;
  if (!pg || !el || !fitMode.value) return;
  const pad = isMobile.value ? 16 : 48;
  const byW = (el.clientWidth - pad) / pg.width;
  const byH = (el.clientHeight - pad) / pg.height;
  const z = fitMode.value === "width" ? byW : Math.min(byW, byH);
  zoom.value = Math.max(0.1, Math.min(6, z));
}

function setFit(mode) {
  fitMode.value = mode;
  fitZoom();
}

function zoomBy(k) {
  fitMode.value = null;
  zoom.value = Math.max(0.1, Math.min(6, +(zoom.value * k).toFixed(3)));
}

watch(() => page.value?.id, () => fitMode.value && fitZoom());
watch(() => page.value?.rot, () => fitMode.value && fitZoom());

// --- Инструменты на холсте ---

function setTool(code) {
  const def = TOOLS.find((t) => t.code === code);
  if (def?.action) {
    if (code === "image") imageInput.value?.click();
    if (code === "signature") showSignature.value = true;
    return;
  }
  if (code === "blur" || code === "pixelate") styles.effect.effect = code;
  tool.value = code;
  applyTool();
}

function applyTool() {
  if (!fc) return;
  const t = tool.value;
  const sel = t === "select";
  if (!sel) fc.discardActiveObject();
  fc.getObjects().forEach((o) => {
    o.selectable = sel;
    o.evented = sel;
  });
  fc.selection = sel && !isTouch;
  fc.isDrawingMode = t === "pen";
  if (t === "pen") refreshBrush();
  const cross = DRAG_TOOLS.has(t) || t === "text";
  fc.defaultCursor = cross ? "crosshair" : "default";
  fc.hoverCursor = sel ? "move" : fc.defaultCursor;
  fc.requestRenderAll();
}

function refreshBrush() {
  const b = new PencilBrush(fc);
  b.color = styles.draw.color;
  b.width = styles.draw.strokeWidth;
  b.decimate = 0.6;
  fc.freeDrawingBrush = b;
}

let drag = null;
let textDown = null;

function clampPoint(p) {
  const pg = page.value;
  return { x: Math.max(0, Math.min(pg.width, p.x)), y: Math.max(0, Math.min(pg.height, p.y)) };
}

function onDown(opt) {
  const t = tool.value;
  // Текст ставим на отпускании: на нажатии fabric ещё разбирает клик, и
  // только что созданная надпись тут же теряла бы выделение.
  if (t === "text") {
    textDown = clampPoint(fc.getScenePoint(opt.e));
    return;
  }
  if (!DRAG_TOOLS.has(t)) return;
  const p = clampPoint(fc.getScenePoint(opt.e));
  const obj = makeDraft(t, p);
  drag = { tool: t, start: p, obj };
  suppress++;
  fc.add(obj);
  suppress--;
}

function onMove(opt) {
  if (!drag) return;
  updateDraft(drag, clampPoint(fc.getScenePoint(opt.e)));
  fc.requestRenderAll();
}

function onUp() {
  if (textDown) {
    const p = textDown;
    textDown = null;
    if (tool.value === "text") placeText(p);
    return;
  }
  if (!drag) return;
  const d = drag;
  drag = null;
  finishDraft(d);
}

const NO_FILL = "rgba(0,0,0,0)";

function makeDraft(t, p) {
  const at = { left: p.x, top: p.y, width: 0, height: 0, selectable: false, evented: false, objectCaching: false };
  switch (t) {
    case "redact":
      return new Rect({ ...at, fill: styles.redact.color, strokeWidth: 0, kind: "redact" });
    case "whiteout":
      return new Rect({
        ...at,
        fill: styles.whiteout.auto ? "#ffffff" : styles.whiteout.color,
        stroke: "#4361ee",
        strokeDashArray: [4, 3],
        strokeWidth: 1 / zoom.value,
        kind: "whiteout",
      });
    case "blur":
    case "pixelate":
      return new EffectRect({ ...at, kind: "effect", effect: t, strength: styles.effect.strength });
    case "highlight":
      return new Rect({
        ...at,
        fill: styles.highlight.color,
        opacity: styles.highlight.opacity,
        globalCompositeOperation: "multiply",
        strokeWidth: 0,
        kind: "highlight",
      });
    case "rect":
      return new Rect({ ...at, ...shapeStyle(), kind: "shape" });
    case "ellipse":
      return new Ellipse({ left: p.x, top: p.y, rx: 0, ry: 0, selectable: false, evented: false, ...shapeStyle(), kind: "shape" });
    case "line":
    case "arrow":
      return new Line([p.x, p.y, p.x, p.y], {
        stroke: styles.line.color,
        strokeWidth: styles.line.strokeWidth,
        strokeLineCap: "round",
        selectable: false,
        evented: false,
        kind: "line",
      });
    case "crop":
      return new Rect({
        ...at,
        fill: "rgba(67,97,238,.08)",
        stroke: "#4361ee",
        strokeDashArray: [6, 4],
        strokeWidth: 1.5 / zoom.value,
        kind: "crop",
      });
    default:
      return null;
  }
}

function shapeStyle() {
  return {
    stroke: styles.shape.color,
    strokeWidth: styles.shape.strokeWidth,
    strokeUniform: true,
    fill: styles.shape.fillOn ? styles.shape.fill : NO_FILL,
    opacity: styles.shape.opacity,
  };
}

function dragRect(d, p) {
  return {
    x: Math.min(d.start.x, p.x),
    y: Math.min(d.start.y, p.y),
    w: Math.abs(p.x - d.start.x),
    h: Math.abs(p.y - d.start.y),
  };
}

function updateDraft(d, p) {
  const o = d.obj;
  d.end = p;
  if (o instanceof Line) {
    o.set({ x2: p.x, y2: p.y });
  } else if (o instanceof Ellipse) {
    const r = dragRect(d, p);
    o.set({ left: r.x, top: r.y, rx: r.w / 2, ry: r.h / 2 });
  } else {
    const r = dragRect(d, p);
    o.set({ left: r.x, top: r.y, width: r.w, height: r.h });
  }
  o.setCoords();
}

function arrowPath(x1, y1, x2, y2, sw) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const L = Math.max(9, sw * 4.5);
  const l = [x2 - L * Math.cos(a - Math.PI / 7), y2 - L * Math.sin(a - Math.PI / 7)];
  const r = [x2 - L * Math.cos(a + Math.PI / 7), y2 - L * Math.sin(a + Math.PI / 7)];
  return `M ${x1} ${y1} L ${x2} ${y2} M ${l[0]} ${l[1]} L ${x2} ${y2} L ${r[0]} ${r[1]}`;
}

function finishDraft(d) {
  const o = d.obj;
  const end = d.end || d.start;
  const r = dragRect(d, end);
  const isLine = o instanceof Line;
  const tiny = isLine ? Math.hypot(r.w, r.h) < 3 : r.w < 3 || r.h < 3;
  suppress++;
  fc.remove(o);
  suppress--;
  if (tiny) {
    if (DRAG_TOOLS.has(d.tool) && d.tool !== "crop") toast("Потяни, чтобы нарисовать область", 1800);
    fc.requestRenderAll();
    return;
  }

  if (d.tool === "crop") {
    setPages(withPage(pages.value, current.value, { crop: r }));
    setTool(isTouch ? "hand" : "select");
    toast("Поля обрезаны. Вернуть — «Сбросить обрезку» в настройках страницы.");
    return;
  }

  let obj = o;
  if (d.tool === "arrow") {
    obj = new Path(arrowPath(d.start.x, d.start.y, end.x, end.y, styles.line.strokeWidth), {
      stroke: styles.line.color,
      strokeWidth: styles.line.strokeWidth,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      fill: "",
      kind: "line",
    });
  }
  if (d.tool === "whiteout") {
    obj.set({
      stroke: null,
      strokeWidth: 0,
      strokeDashArray: null,
      fill: styles.whiteout.auto && fc.effectSource ? paperColor(fc.effectSource, r) : styles.whiteout.color,
    });
  }
  if (!(obj instanceof EffectRect)) obj.set({ objectCaching: true });
  obj.set({ selectable: false, evented: false });
  obj.setCoords();
  fc.add(obj);
  commit();
}

function placeText(p) {
  const s = styles.text;
  const t = new IText("Текст", {
    left: p.x,
    top: p.y - s.fontSize * 0.6,
    fontSize: s.fontSize,
    fill: s.color,
    fontFamily: s.fontFamily,
    fontWeight: s.bold ? "bold" : "normal",
    kind: "text",
  });
  setTool("select");
  fc.add(t);
  fc.setActiveObject(t);
  t.enterEditing();
  t.selectAll();
  fc.requestRenderAll();
}

// --- «Править текст» ---

function familyFor(family) {
  const f = String(family || "").toLowerCase();
  if (f.includes("mono") || f.includes("courier")) return "Courier New";
  if (f.includes("serif") && !f.includes("sans")) return "Times New Roman";
  if (f.includes("times")) return "Times New Roman";
  return "Arial";
}

async function loadTextBoxes() {
  textBoxes.value = [];
  textNote.value = "";
  const pg = page.value;
  if (!pg) return;
  let boxes = [];
  if (pg.kind === "pdf") {
    try {
      boxes = await pdfTextBoxes(pg, sources.get(pg.sourceId));
    } catch {
      boxes = [];
    }
  }
  const lines = ocrFor(pg);
  if (lines) {
    boxes = boxes.concat(
      // Рамка строки у распознавателя — от верха заглавных до низа «у» и «р»,
      // это чуть меньше кегля. С множителем 0.8 замена выходила на треть мельче
      // соседних строк (проверено на скане договора).
      lines.map((l) => ({ text: l.text, x: l.x, y: l.y, w: l.w, h: l.h, fontSize: l.h * 1.05, family: "sans-serif" })),
    );
  }
  if (page.value !== pg || tool.value !== "edittext") return;
  textBoxes.value = boxes;
  if (!boxes.length) {
    textNote.value =
      pg.kind === "blank"
        ? "На пустой странице править нечего — бери «Текст»."
        : "Текстового слоя нет: это картинка или скан. Распознай текст — и строки станут правимыми.";
  }
}

watch([tool, () => page.value?.id, () => page.value?.rot, ocrMap], () => {
  if (tool.value === "edittext" && phase.value === "edit") loadTextBoxes();
  else {
    textBoxes.value = [];
    textNote.value = "";
  }
});

function replaceText(box) {
  const src = fc.effectSource;
  const pad = Math.max(1, box.h * 0.1);
  const rect = { x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: box.h + 2 * pad };
  const cover = new Rect({
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: rect.h,
    fill: src ? paperColor(src, rect) : "#ffffff",
    strokeWidth: 0,
    kind: "textcover",
  });
  const fontSize = Math.max(4, box.fontSize);
  const text = new IText(box.text, {
    left: box.x,
    top: box.y + (box.h - fontSize * 1.16) / 2,
    fontSize,
    fill: src ? inkColor(src, box) : "#000000",
    fontFamily: familyFor(box.family),
    kind: "text",
  });
  setTool("select");
  fc.add(cover);
  fc.add(text);
  fc.setActiveObject(text);
  text.enterEditing();
  text.selectAll();
  fc.requestRenderAll();
}

// --- Картинка и подпись ---

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Картинку вставляем не больше 2000 точек по стороне: она живёт в черновике и
// в истории правок, а печати и штампу больше и не нужно.
async function shrinkDataUrl(url, max = 2000) {
  const img = await util.loadImage(url);
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  if (k >= 1) return url;
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(url.startsWith("data:image/png") ? "image/png" : "image/jpeg", 0.9);
}

async function insertImage(url, widthShare = 0.4, kind = "image") {
  const pg = page.value;
  if (!pg) return;
  const img = await FabricImage.fromURL(url);
  const k = (pg.width * widthShare) / img.width;
  img.set({
    scaleX: k,
    scaleY: k,
    left: (pg.width - img.width * k) / 2,
    top: (pg.height - img.height * k) / 2,
    kind,
  });
  setTool("select");
  fc.add(img);
  fc.setActiveObject(img);
  fc.requestRenderAll();
  commit();
}

async function onImagePicked(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    await insertImage(await shrinkDataUrl(await readAsDataUrl(file)));
  } catch {
    toast("Картинка не вставилась");
  }
}

async function onSignature(url) {
  showSignature.value = false;
  await insertImage(url, 0.28);
  toast("Подпись на странице — перетащи её на место");
}

// --- Выделенные объекты ---

const propKind = computed(() => {
  selVersion.value;
  const sel = selection.value;
  if (sel.length) {
    const kinds = new Set(sel.map((o) => o.kind || "shape"));
    return kinds.size === 1 ? [...kinds][0] : "mixed";
  }
  return TOOL_KIND[tool.value] || null;
});

const propVals = computed(() => {
  selVersion.value;
  const k = propKind.value;
  const sel = selection.value;
  if (sel.length && k !== "mixed") {
    const o = sel[0];
    return {
      color: o[colorField(k)],
      strokeWidth: o.strokeWidth,
      opacity: o.opacity,
      fontSize: o.fontSize,
      fontFamily: o.fontFamily,
      bold: o.fontWeight === "bold",
      strength: o.strength,
      effect: o.effect,
      fillOn: k === "shape" ? o.fill && o.fill !== NO_FILL : false,
      fill: o.fill,
      auto: false,
    };
  }
  return k && styles[k] ? styles[k] : {};
});

function setObjProp(o, field, v) {
  const kind = o.kind || "shape";
  if (field === "color") o.set(colorField(kind), v);
  else if (field === "bold") o.set("fontWeight", v ? "bold" : "normal");
  else if (field === "fillOn") o.set("fill", v ? styles.shape.fill : NO_FILL);
  else if (field === "fill") o.set("fill", v);
  else if (field === "auto") return;
  else o.set(field, v);
  o.setCoords();
}

function applyProp(field, v) {
  const sel = selection.value;
  const k = propKind.value;
  if (sel.length) {
    sel.forEach((o) => setObjProp(o, field, v));
    fc.requestRenderAll();
    selVersion.value++;
    commitSoon();
  }
  if (k && styles[k] && field in styles[k]) styles[k][field] = v;
  if (field === "fill" && k === "shape") styles.shape.fillOn = true;
  if (tool.value === "pen") refreshBrush();
}

// Замазка, подвинутая на другое место, перекрашивается под бумагу там.
function matchPaper() {
  const src = fc.effectSource;
  if (!src) return;
  selection.value.forEach((o) => {
    const b = o.getBoundingRect();
    o.set("fill", paperColor(src, { x: b.left, y: b.top, w: b.width, h: b.height }));
  });
  fc.requestRenderAll();
  selVersion.value++;
  commit();
}

function deleteSelected() {
  const sel = fc?.getActiveObjects() || [];
  if (!sel.length) return;
  suppress++;
  fc.discardActiveObject();
  sel.forEach((o) => fc.remove(o));
  suppress--;
  fc.requestRenderAll();
  commit();
}

let clipboard = null;

function copySelected() {
  const sel = fc?.getActiveObjects() || [];
  if (!sel.length) return false;
  // Внутри группового выделения координаты у объектов свои, групповые;
  // toObject() холста переводит их обратно в координаты страницы.
  const all = fc.toObject().objects;
  const idx = sel.map((o) => fc.getObjects().indexOf(o));
  clipboard = idx.filter((i) => i >= 0).map((i) => all[i]);
  return true;
}

async function pasteClipboard(offset = 12) {
  if (!clipboard?.length || !fc) return;
  const live = await util.enlivenObjects(clipboard);
  setTool("select");
  live.forEach((o) => {
    o.set({ left: o.left + offset, top: o.top + offset });
    fc.add(o);
  });
  if (live.length === 1) fc.setActiveObject(live[0]);
  fc.requestRenderAll();
  commit();
}

async function duplicateSelected() {
  if (copySelected()) await pasteClipboard();
}

function bringForward() {
  selection.value.forEach((o) => fc.bringObjectForward(o));
  fc.requestRenderAll();
  commit();
}

function sendBackward() {
  selection.value.forEach((o) => fc.sendObjectBackwards(o));
  fc.requestRenderAll();
  commit();
}

// --- Страницы ---

async function goTo(i) {
  if (i < 0 || i >= pages.value.length || i === current.value) return;
  await flushEditing();
  fc?.discardActiveObject();
  current.value = i;
  showPagesSheet.value = false;
}

async function rotatePage(i, clockwise) {
  await flushEditing();
  const pg = pages.value[i];
  const objects = await rotateObjects(pg.objects, pg.width, pg.height, clockwise);
  const crop = pg.crop ? rotateRect(pg.crop, pg.width, pg.height, clockwise) : null;
  const rot = (pg.rot + (clockwise ? 90 : 270)) % 360;
  setPages(withPage(pages.value, i, { rot, width: pg.height, height: pg.width, objects, crop }));
}

async function deletePage(i) {
  await flushEditing();
  if (pages.value.length === 1) {
    toast("Последнюю страницу не удалить");
    return;
  }
  const next = pages.value.filter((_, k) => k !== i);
  setPages(next, i >= next.length ? next.length - 1 : i);
  toast(`Страница ${i + 1} удалена. Вернуть — «Отменить».`);
}

async function duplicatePage(i) {
  await flushEditing();
  const copy = { ...pages.value[i], id: uid("p"), rev: 0 };
  const entry = ocrMap.value.get(pages.value[i].id);
  if (entry) {
    const m = new Map(ocrMap.value);
    m.set(copy.id, entry);
    ocrMap.value = m;
  }
  const next = pages.value.slice();
  next.splice(i + 1, 0, copy);
  setPages(next, i + 1);
}

async function movePage(from, to) {
  if (to < 0 || to >= pages.value.length || from === to) return;
  await flushEditing();
  const next = pages.value.slice();
  const [pg] = next.splice(from, 1);
  next.splice(to, 0, pg);
  setPages(next, to);
}

async function insertBlank() {
  await flushEditing();
  const next = pages.value.slice();
  next.splice(current.value + 1, 0, blankPage(page.value));
  setPages(next, current.value + 1);
}

function setEnhance(mode) {
  if (!page.value || page.value.enhance === mode) return;
  setPages(withPage(pages.value, current.value, { enhance: mode }));
}

function resetCrop() {
  if (!page.value?.crop) return;
  setPages(withPage(pages.value, current.value, { crop: null }));
}

// Перетаскивание миниатюр мышью. На телефоне для этого кнопки ← →: долгое
// нажатие с перетаскиванием в списке, который ещё и скроллится, — лотерея.
const dragFrom = ref(-1);
const dropAt = ref(-1);

function onThumbDragStart(i, e) {
  dragFrom.value = i;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(i));
}

function onThumbDrop(i) {
  const from = dragFrom.value;
  dragFrom.value = -1;
  dropAt.value = -1;
  if (from >= 0) movePage(from, i);
}

// --- Миниатюры ---

const thumbs = reactive({});
const visibleThumbs = new Set();
const thumbQueue = [];
let thumbBusy = false;

function wantThumb(id) {
  const pg = pages.value.find((p) => p.id === id);
  if (!pg || thumbs[id]?.rev === pg.rev) return;
  if (!thumbQueue.includes(id)) thumbQueue.push(id);
  pumpThumbs();
}

async function pumpThumbs() {
  if (thumbBusy) return;
  thumbBusy = true;
  try {
    while (thumbQueue.length) {
      const id = thumbQueue.shift();
      const pg = pages.value.find((p) => p.id === id);
      if (!pg || thumbs[id]?.rev === pg.rev || !visibleThumbs.has(id)) continue;
      try {
        thumbs[id] = { rev: pg.rev, url: await makeThumb(pg) };
      } catch {
        /* миниатюра не главное */
      }
    }
  } finally {
    thumbBusy = false;
  }
}

async function makeThumb(pg) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const s = (150 * dpr) / Math.max(pg.width, pg.height * 0.75);
  const base = document.createElement("canvas");
  await renderBase(pg, sources.get(pg.sourceId), s, base).promise;
  const out = pg.objects.length ? await renderObjects(pg.objects, pg.width, pg.height, s, { base, flatten: true }) : base;
  return out.toDataURL("image/jpeg", 0.72);
}

const thumbObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const id = e.target.dataset.pid;
      if (e.isIntersecting) {
        visibleThumbs.add(id);
        wantThumb(id);
      } else {
        visibleThumbs.delete(id);
      }
    }
  },
  { rootMargin: "300px" },
);

const vThumb = {
  mounted: (el) => thumbObserver.observe(el),
  unmounted: (el) => {
    thumbObserver.unobserve(el);
    visibleThumbs.delete(el.dataset.pid);
  },
};

watch(pages, (list) => {
  for (const pg of list) if (visibleThumbs.has(pg.id)) wantThumb(pg.id);
});

// --- Открытие ---

function resetDocument() {
  for (const s of sources.values()) releaseSource(s);
  sources.clear();
  pages.value = [];
  current.value = 0;
  ocrMap.value = new Map();
  undoStack.length = 0;
  redoStack.length = 0;
  histVersion.value++;
  loadedPageId = null;
  loadedRev = -1;
  loadedBaseKey = "";
  for (const k of Object.keys(thumbs)) delete thumbs[k];
  library.value = null;
}

function askPassword(name, wrong) {
  passwordValue.value = "";
  return new Promise((resolve) => {
    passwordAsk.value = { name, wrong, resolve };
  });
}

function answerPassword(value) {
  const ask = passwordAsk.value;
  passwordAsk.value = null;
  ask?.resolve(value);
}

async function openOne(file) {
  let password;
  for (;;) {
    try {
      return await openSource(file, { password });
    } catch (e) {
      if (!(e instanceof PasswordNeededError)) throw e;
      password = await askPassword(file.name, e.wrong);
      if (!password) return null;
    }
  }
}

async function openFiles(files, { append = false } = {}) {
  const list = [...files].filter((f) => isPdfFile(f) || isImageFile(f));
  if (!list.length) {
    toast("Нужен PDF или картинка (JPG, PNG, WebP)");
    return;
  }
  const prevPhase = phase.value;
  phase.value = "loading";
  const added = [];
  const newSources = [];
  try {
    for (let k = 0; k < list.length; k++) {
      loading.text = list.length > 1 ? `Открываю ${k + 1} из ${list.length}: ${list[k].name}` : `Открываю ${list[k].name}`;
      loading.progress = k / list.length;
      const res = await openOne(list[k]);
      if (!res) continue;
      newSources.push(res.source);
      added.push(...res.pages);
    }
  } catch (e) {
    newSources.forEach(releaseSource);
    phase.value = prevPhase === "edit" ? "edit" : "start";
    toast(e.message || "Файл не открылся", 5000);
    return;
  }
  if (!added.length) {
    phase.value = prevPhase === "edit" ? "edit" : "start";
    return;
  }

  if (!append) {
    showSave.value = false;
    resetDocument();
    await draft.startDraft();
    docName.value = list[0].name.replace(/\.[^.]+$/, "");
  }
  for (const s of newSources) {
    sources.set(s.id, s);
    draft.putDraftSource(s).then((ok) => ok || (draftState.value = "off"));
  }
  if (append) {
    await flushEditing();
    const next = pages.value.slice();
    next.splice(current.value + 1, 0, ...added);
    setPages(next, current.value + 1);
    phase.value = "edit";
    toast(`Добавлено страниц: ${added.length}`);
  } else {
    pages.value = added;
    current.value = 0;
    await enterEdit();
  }
}

async function enterEdit() {
  phase.value = "edit";
  fitMode.value = isMobile.value ? "width" : "page";
  await nextTick();
  fitZoom();
  await refreshPage();
  scheduleDraft();
}

function onPickFiles(e) {
  const files = e.target.files;
  if (files?.length) openFiles(files);
  e.target.value = "";
}

function onAddFiles(e) {
  const files = e.target.files;
  if (files?.length) openFiles(files, { append: true });
  e.target.value = "";
}

async function newBlank() {
  resetDocument();
  await draft.startDraft();
  docName.value = "Новый документ";
  pages.value = [blankPage()];
  current.value = 0;
  await enterEdit();
}

const dropActive = ref(false);
// Подсвечиваем зону, только когда тащат файлы, — не миниатюры страниц.
function onRootDragOver(e) {
  dropActive.value = dragFrom.value < 0 && [...(e.dataTransfer?.types || [])].includes("Files");
}
function onDrop(e) {
  dropActive.value = false;
  const files = e.dataTransfer?.files;
  if (files?.length && dragFrom.value < 0) openFiles(files, { append: phase.value === "edit" });
}

// --- Библиотека ---

const libraryList = ref([]);
const libraryQuery = ref("");
const libraryLoading = ref(false);
let libraryTimer = null;

async function loadLibrary() {
  libraryLoading.value = true;
  try {
    const list = await getPdfFiles({ query: libraryQuery.value.trim(), sort: "recent" });
    libraryList.value = (list || []).filter((f) => !f.fileMissing).slice(0, 40);
  } catch {
    libraryList.value = [];
  } finally {
    libraryLoading.value = false;
  }
}

watch(libraryQuery, () => {
  clearTimeout(libraryTimer);
  libraryTimer = setTimeout(loadLibrary, 300);
});

async function openFromLibrary(fileOrId) {
  phase.value = "loading";
  loading.text = "Скачиваю книгу из библиотеки";
  loading.progress = 0;
  try {
    const file = typeof fileOrId === "object" ? fileOrId : await getPdfDetails(fileOrId);
    const blob = await fetchPdfBlob(file, (p) => (loading.progress = p));
    const name = pdfSaveName(file);
    await openFiles([new File([blob], name, { type: "application/pdf" })]);
    if (phase.value === "edit") {
      library.value = { id: file.id, title: file.title || file.filename || name };
      docName.value = library.value.title.replace(/\.pdf$/i, "");
      scheduleDraft();
    }
  } catch (e) {
    phase.value = "start";
    toast(e.message || "Книга не скачалась", 5000);
  }
}

// --- Черновик ---

let draftTimer = null;

function scheduleDraft() {
  if (draftState.value === "off") return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraftNow, 1200);
}

async function saveDraftNow() {
  clearTimeout(draftTimer);
  if (phase.value !== "edit" || !pages.value.length) return;
  const ids = new Set(pages.value.map((p) => p.id));
  draftState.value = "saving";
  const ok = await draft.putDraftState({
    name: docName.value,
    library: library.value ? { ...toRaw(library.value) } : null,
    current: current.value,
    pages: pages.value,
    ocr: [...ocrMap.value].filter(([id]) => ids.has(id)),
    sourceIds: [...new Set(pages.value.map((p) => p.sourceId).filter(Boolean))],
  });
  draftState.value = ok ? "saved" : "off";
}

async function restoreDraft() {
  phase.value = "loading";
  loading.text = "Поднимаю черновик";
  loading.progress = 0;
  try {
    const d = await draft.loadDraft();
    if (!d) throw new Error("Черновик не читается");
    resetDocument();
    for (const s of d.sources) {
      const restored = await restoreSource(s);
      sources.set(restored.id, restored);
    }
    pages.value = d.pages;
    current.value = Math.min(d.current || 0, d.pages.length - 1);
    docName.value = d.name || "Документ";
    library.value = d.library || null;
    ocrMap.value = new Map(d.ocr || []);
    await enterEdit();
  } catch (e) {
    phase.value = "start";
    toast(e.message || "Черновик не открылся", 5000);
  }
}

async function dropDraft() {
  await draft.clearDraft();
  draftInfo.value = null;
}

function draftWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const today = new Date();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === today.toDateString() ? `сегодня в ${time}` : `${d.toLocaleDateString("ru-RU")} в ${time}`;
}

async function backToStart() {
  await flushEditing();
  await saveDraftNow();
  draftInfo.value = await draft.peekDraft();
  phase.value = "start";
  loadLibrary();
}

// --- Распознавание ---

let ocrCancelled = false;

async function ocrPage(pg) {
  const scale = Math.min(300 / 72, Math.sqrt(7e6 / (pg.width * pg.height)));
  const c = document.createElement("canvas");
  await renderBase(pg, sources.get(pg.sourceId), scale, c).promise;
  const res = await recognize(c, scale, (p) => {
    if (ocrBusy.value) ocrBusy.value = { ...ocrBusy.value, ...p };
  });
  const m = new Map(ocrMap.value);
  m.set(pg.id, { rot: pg.rot, width: pg.width, height: pg.height, lines: res.lines, text: res.text });
  ocrMap.value = m;
  return res;
}

async function runOcr(all = false) {
  const list = all ? pages.value.filter((p) => p.kind !== "blank") : [page.value];
  if (!list.length || !list[0]) return;
  ocrCancelled = false;
  let lines = 0;
  try {
    for (let k = 0; k < list.length; k++) {
      if (ocrCancelled) break;
      ocrBusy.value = { stage: "загружаю распознаватель", progress: 0, page: all ? `стр. ${k + 1} из ${list.length}` : "" };
      const res = await ocrPage(list[k]);
      lines += res.lines.length;
    }
    if (!ocrCancelled) toast(lines ? `Распознано строк: ${lines}` : "Текст не нашёлся — попробуй «Контраст» и распознать снова");
  } catch (e) {
    if (!ocrCancelled) toast(e.message || "Распознаватель не запустился", 5000);
  } finally {
    ocrBusy.value = null;
    scheduleDraft();
  }
}

async function cancelOcr() {
  ocrCancelled = true;
  ocrBusy.value = null;
  await terminateOcr();
}

const pageOcr = computed(() => (page.value ? ocrMap.value.get(page.value.id) : null));

async function copyPageText() {
  const text = pageOcr.value?.text;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast("Текст страницы скопирован");
  } catch {
    toast("Браузер не дал доступ к буферу обмена");
  }
}

// --- Сохранение ---

const saveOpts = reactive({ name: "", flattenHidden: true, flattenAll: false, dpi: 200, ocrLayer: true });
const saveState = reactive({ busy: false, stage: "", progress: 0, error: "", done: "", created: null, confirmReplace: false });

async function openSave() {
  await flushEditing();
  saveOpts.name = docName.value || "документ";
  Object.assign(saveState, { busy: false, stage: "", progress: 0, error: "", done: "", created: null, confirmReplace: false });
  showSave.value = true;
}

const savePlan = computed(() => {
  if (!showSave.value) return null;
  let flattened = 0;
  let hidingKept = 0;
  let encrypted = false;
  for (const pg of pages.value) {
    const src = pg.sourceId ? sources.get(pg.sourceId) : null;
    if (src?.libFailed) encrypted = true;
    const plan = pagePlan(pg, src, saveOpts);
    if (plan.flatten) flattened++;
    else if (plan.hiding) hidingKept++;
  }
  const anyOcr = pages.value.some((p) => ocrMap.value.has(p.id));
  return {
    flattened,
    hidingKept,
    encrypted,
    anyOcr,
    anyHiding: pages.value.some((p) => hidesContent(p.objects)),
    inPlace: inPlacePossible(pages.value) && !encrypted,
  };
});

const canShare = typeof navigator.canShare === "function";

async function build() {
  saveState.busy = true;
  saveState.error = "";
  saveState.done = "";
  saveState.progress = 0;
  try {
    const { bytes } = await buildPdf({
      pages: pages.value,
      sources,
      options: { ...saveOpts, jpegQuality: 0.86, title: saveOpts.name },
      ocrFor,
      onProgress: ({ done, total, stage }) => {
        saveState.stage = stage;
        saveState.progress = total ? done / total : 0;
      },
    });
    return new File([bytes], pdfSaveName({ title: saveOpts.name }), { type: "application/pdf" });
  } catch (e) {
    console.error(e);
    saveState.error = e.message || "PDF не собрался";
    return null;
  } finally {
    saveState.busy = false;
    saveState.stage = "";
  }
}

async function saveDownload() {
  const file = await build();
  if (!file) return;
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  saveState.done = `Готово: ${file.name}, ${(file.size / 1048576).toFixed(1)} МБ`;
  docName.value = saveOpts.name;
}

async function saveShare() {
  const file = await build();
  if (!file) return;
  if (!navigator.canShare?.({ files: [file] })) {
    saveState.error = "Этот браузер не умеет делиться файлами — скачай его";
    return;
  }
  try {
    await navigator.share({ files: [file], title: saveOpts.name });
    saveState.done = "Отправлено";
  } catch (e) {
    if (e?.name !== "AbortError") saveState.error = "Не удалось поделиться";
  }
}

async function saveToLibrary() {
  const file = await build();
  if (!file) return;
  saveState.busy = true;
  saveState.stage = "Загружаю в библиотеку";
  try {
    const created = await uploadPdfFile(file);
    saveState.created = created;
    saveState.done = "Лежит в библиотеке новой книгой";
  } catch (e) {
    saveState.error = e.message || "Не загрузилось";
  } finally {
    saveState.busy = false;
    saveState.stage = "";
  }
}

async function replaceInLibrary() {
  saveState.confirmReplace = false;
  const file = await build();
  if (!file || !library.value) return;
  saveState.busy = true;
  saveState.stage = "Заменяю файл в библиотеке";
  try {
    await replacePdfFile(library.value.id, file);
    saveState.done = "Файл книги заменён. Прогресс, закладки и план остались.";
  } catch (e) {
    saveState.error = e.message || "Не заменилось";
  } finally {
    saveState.busy = false;
    saveState.stage = "";
  }
}

// --- Клавиатура и мышь ---

function onKey(e) {
  if (phase.value !== "edit" || showSave.value || showSignature.value || passwordAsk.value) return;
  const tag = e.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === "z") {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if (mod && key === "y") {
    e.preventDefault();
    redo();
  } else if (mod && key === "d") {
    e.preventDefault();
    duplicateSelected();
  } else if (mod && key === "c") {
    copySelected();
  } else if (mod && key === "v") {
    if (clipboard) {
      e.preventDefault();
      pasteClipboard();
    }
  } else if (e.key === "Delete" || e.key === "Backspace") {
    if (selection.value.length) {
      e.preventDefault();
      deleteSelected();
    }
  } else if (e.key === "Escape") {
    if (selection.value.length) fc.discardActiveObject();
    else setTool("select");
    fc.requestRenderAll();
  } else if (e.key === "PageDown") {
    e.preventDefault();
    goTo(current.value + 1);
  } else if (e.key === "PageUp") {
    e.preventDefault();
    goTo(current.value - 1);
  }
}

function onWheel(e) {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
}

// «Рука» мышью: тянуть страницу, как в просмотрщиках.
let pan = null;
function onStagePointerDown(e) {
  // Клик по серому полю вокруг листа fabric не видит, а человек ждёт, что
  // так правка текста закончится и выделение снимется.
  if (fc && !e.target.closest(".pe-sheet")) {
    flushEditing();
    if (fc.getActiveObject()) {
      fc.discardActiveObject();
      fc.requestRenderAll();
    }
  }
  if (tool.value !== "hand" || e.pointerType !== "mouse") return;
  pan = { x: e.clientX, y: e.clientY, sl: stageEl.value.scrollLeft, st: stageEl.value.scrollTop };
  stageEl.value.setPointerCapture(e.pointerId);
}
function onStagePointerMove(e) {
  if (!pan) return;
  stageEl.value.scrollLeft = pan.sl - (e.clientX - pan.x);
  stageEl.value.scrollTop = pan.st - (e.clientY - pan.y);
}
function onStagePointerUp() {
  pan = null;
}

let resizeObserver = null;

// Телефон выгружает фоновую вкладку без предупреждения: черновик дописываем,
// как только страница ушла с экрана.
function onHide() {
  if (document.visibilityState !== "hidden" || phase.value !== "edit") return;
  flushEditing().then(saveDraftNow);
}

onMounted(async () => {
  initFabric();
  window.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onHide);
  stageEl.value.addEventListener("wheel", onWheel, { passive: false });
  resizeObserver = new ResizeObserver(() => {
    if (phase.value === "edit" && fitMode.value) fitZoom();
  });
  resizeObserver.observe(stageEl.value);
  if (route.query.file) {
    openFromLibrary(String(route.query.file));
    router.replace({ path: route.path });
    return;
  }
  draftInfo.value = await draft.peekDraft();
  loadLibrary();
});

onBeforeUnmount(() => {
  if (commitTimer) commit();
  saveDraftNow();
  window.removeEventListener("keydown", onKey);
  document.removeEventListener("visibilitychange", onHide);
  resizeObserver?.disconnect();
  thumbObserver.disconnect();
  baseTask?.cancel();
  fc?.dispose();
  fc = null;
  for (const s of sources.values()) releaseSource(s);
  terminateOcr();
});

function goBack() {
  if (window.history.length > 1) router.back();
  else router.push("/");
}

const cropShade = computed(() => {
  const pg = page.value;
  if (!pg?.crop) return null;
  const z = zoom.value;
  const c = pg.crop;
  return [
    { left: 0, top: 0, width: sheet.w, height: c.y * z },
    { left: 0, top: (c.y + c.h) * z, width: sheet.w, height: sheet.h - (c.y + c.h) * z },
    { left: 0, top: c.y * z, width: c.x * z, height: c.h * z },
    { left: (c.x + c.w) * z, top: c.y * z, width: sheet.w - (c.x + c.w) * z, height: c.h * z },
  ];
});

const toolHint = computed(() => {
  if (tool.value === "edittext") return textNote.value || "Нажми на строку, чтобы её исправить";
  if (DRAG_TOOLS.has(tool.value) && tool.value !== "crop") return "Потяни по странице, чтобы отметить область";
  if (tool.value === "crop") return "Обведи то, что оставить";
  if (tool.value === "text") return "Нажми туда, где нужен текст";
  return "";
});
</script>

<template>
  <div
    class="pe"
    :class="{ 'is-mobile': isMobile, 'is-drop': dropActive }"
    @dragover.prevent="onRootDragOver"
    @dragleave.self="dropActive = false"
    @drop.prevent="onDrop"
  >
    <input ref="fileInput" type="file" accept="application/pdf,image/*" multiple hidden @change="onPickFiles" />
    <input ref="addInput" type="file" accept="application/pdf,image/*" multiple hidden @change="onAddFiles" />
    <input ref="cameraInput" type="file" accept="image/*" capture="environment" hidden @change="onPickFiles" />
    <input ref="imageInput" type="file" accept="image/*" hidden @change="onImagePicked" />

    <!-- Стартовый экран -->
    <div v-if="phase === 'start'" class="pe-start">
      <header class="pe-start-head">
        <button class="pe-btn ghost" @click="goBack">← Назад</button>
        <h1>🖍️ PDF-редактор</h1>
      </header>

      <div class="pe-drop" @click="fileInput.click()">
        <div class="pe-drop-icon">📄</div>
        <div class="pe-drop-title">{{ isMobile ? "Выбери PDF или фото" : "Перетащи сюда PDF или фото" }}</div>
        <div class="pe-drop-sub">Можно сразу несколько — склеятся в один документ</div>
        <div class="pe-drop-actions" @click.stop>
          <button class="pe-btn primary" @click="fileInput.click()">Выбрать файлы</button>
          <button v-if="isTouch" class="pe-btn" @click="cameraInput.click()">📷 Сфотографировать</button>
          <button class="pe-btn" @click="newBlank">Пустой лист</button>
        </div>
      </div>

      <div v-if="draftInfo" class="pe-draft">
        <div>
          <b>Черновик: {{ draftInfo.name || "документ" }}</b>
          <div class="pe-muted">{{ draftInfo.pages?.length || 0 }} стр. · {{ draftWhen(draftInfo.savedAt) }}</div>
        </div>
        <div class="pe-row">
          <button class="pe-btn primary" @click="restoreDraft">Продолжить</button>
          <button class="pe-btn ghost" @click="dropDraft">Удалить</button>
        </div>
      </div>

      <section class="pe-lib">
        <div class="pe-lib-head">
          <h2>Из библиотеки</h2>
          <input v-model="libraryQuery" class="pe-input" placeholder="Поиск по названию" />
        </div>
        <div v-if="libraryLoading && !libraryList.length" class="pe-muted">Загружаю…</div>
        <div v-else-if="!libraryList.length" class="pe-muted">Книг не нашлось</div>
        <ul v-else class="pe-lib-list">
          <li v-for="f in libraryList" :key="f.id">
            <button class="pe-lib-item" @click="openFromLibrary(f)">
              <span class="pe-lib-title">{{ f.title || f.filename }}</span>
              <span v-if="f.pageCount" class="pe-muted">{{ f.pageCount }} стр.</span>
            </button>
          </li>
        </ul>
      </section>

      <ul class="pe-features">
        <li><b>Замазать навсегда.</b> Закраска, замазка цветом бумаги, размытие и пиксели. Под замазкой текст из файла вычищается, а не просто прикрыт.</li>
        <li><b>Сканы и фото.</b> Распознавание текста, правка строк прямо на картинке, улучшение скана, поиск по готовому PDF.</li>
        <li><b>Страницы.</b> Повернуть, переставить, удалить, размножить, обрезать поля, вклеить другой PDF или фото.</li>
        <li><b>Всё в браузере.</b> Файл никуда не уходит, пока сам не положишь его в библиотеку.</li>
      </ul>
    </div>

    <!-- Загрузка -->
    <div v-if="phase === 'loading'" class="pe-loading">
      <div class="pe-spinner" />
      <div>{{ loading.text }}</div>
      <div v-if="loading.progress > 0" class="pe-bar"><i :style="{ width: loading.progress * 100 + '%' }" /></div>
    </div>

    <!-- Редактор. v-show, а не v-if: холст fabric создаётся один раз. -->
    <div v-show="phase === 'edit'" class="pe-editor">
      <header class="pe-top">
        <button class="pe-icon" title="Назад" @click="goBack">←</button>
        <div class="pe-doc">
          <div class="pe-doc-name" :title="docName">{{ docName }}</div>
          <div class="pe-muted pe-doc-sub">
            <template v-if="isMobile">
              <button class="pe-link" @click="showPagesSheet = true">стр. {{ current + 1 }} из {{ pages.length }} ▾</button>
            </template>
            <template v-else>{{ pages.length }} стр.</template>
            <span v-if="draftState === 'saved'" title="Черновик в этом браузере"> · черновик сохранён</span>
            <span v-else-if="draftState === 'off'" title="Браузер не дал сохранить черновик"> · без черновика</span>
          </div>
        </div>
        <div class="pe-top-actions">
          <template v-if="!isMobile">
            <button class="pe-btn ghost" title="Открыть другой файл" @click="backToStart">Открыть…</button>
            <button class="pe-btn ghost" title="Вклеить PDF или фото после текущей страницы" @click="addInput.click()">＋ Страницы</button>
            <span class="pe-divider" />
          </template>
          <button class="pe-icon" :disabled="!canUndo" title="Отменить (Ctrl+Z)" @click="undo">↶</button>
          <button class="pe-icon" :disabled="!canRedo" title="Вернуть (Ctrl+Shift+Z)" @click="redo">↷</button>
          <template v-if="!isMobile">
            <span class="pe-divider" />
            <button class="pe-icon" title="Мельче" @click="zoomBy(1 / 1.2)">−</button>
            <button class="pe-btn ghost pe-zoom" title="Вписать страницу" @click="setFit(fitMode === 'page' ? 'width' : 'page')">
              {{ Math.round(zoom * 100) }}%
            </button>
            <button class="pe-icon" title="Крупнее" @click="zoomBy(1.2)">+</button>
            <span class="pe-divider" />
          </template>
          <button class="pe-btn primary" @click="openSave">{{ isMobile ? "Сохранить" : "💾 Сохранить" }}</button>
        </div>
      </header>

      <nav v-if="!isMobile" class="pe-tools">
        <template v-for="(t, k) in TOOLS" :key="t.code || 'sep' + k">
          <span v-if="t.sep" class="pe-tools-sep" />
          <button v-else class="pe-tool" :class="{ on: tool === t.code }" :title="t.hint" @click="setTool(t.code)">
            <span class="pe-tool-icon">{{ t.icon }}</span>
            <span class="pe-tool-label">{{ t.label }}</span>
          </button>
        </template>
      </nav>

      <div class="pe-main">
        <!-- Страницы (десктоп) -->
        <aside v-if="!isMobile" class="pe-pages">
          <div
            v-for="(pg, i) in pages"
            :key="pg.id"
            class="pe-thumb"
            :class="{ on: i === current, drop: dropAt === i && dragFrom !== i }"
            draggable="true"
            @click="goTo(i)"
            @dragstart="onThumbDragStart(i, $event)"
            @dragover.prevent.stop="dropAt = i"
            @drop.prevent.stop="onThumbDrop(i)"
            @dragend="dragFrom = -1; dropAt = -1"
          >
            <div v-thumb class="pe-thumb-img" :data-pid="pg.id" :style="{ aspectRatio: `${pg.width} / ${pg.height}` }">
              <img v-if="thumbs[pg.id]" :src="thumbs[pg.id].url" alt="" draggable="false" />
            </div>
            <div class="pe-thumb-foot">
              <span>{{ i + 1 }}</span>
              <span v-if="hidesContent(pg.objects)" title="Есть замазка">⬛</span>
              <span v-if="ocrMap.has(pg.id)" title="Текст распознан">🔤</span>
            </div>
            <div class="pe-thumb-acts" @click.stop>
              <button title="Повернуть влево" @click="rotatePage(i, false)">⟲</button>
              <button title="Повернуть вправо" @click="rotatePage(i, true)">⟳</button>
              <button title="Копия страницы" @click="duplicatePage(i)">⧉</button>
              <button title="Удалить страницу" @click="deletePage(i)">🗑</button>
            </div>
          </div>
          <div class="pe-pages-add">
            <button class="pe-btn ghost" @click="insertBlank">＋ Пустая</button>
            <button class="pe-btn ghost" @click="addInput.click()">＋ Из файла</button>
          </div>
        </aside>

        <section
          ref="stageEl"
          class="pe-stage"
          :class="{ 'is-hand': tool === 'hand' }"
          @pointerdown="onStagePointerDown"
          @pointermove="onStagePointerMove"
          @pointerup="onStagePointerUp"
          @pointercancel="onStagePointerUp"
        >
          <div class="pe-stage-inner">
            <div class="pe-sheet" :style="{ width: sheet.w + 'px', height: sheet.h + 'px' }">
              <canvas ref="baseEl" class="pe-base" />
              <div class="pe-fabric" :class="{ passthrough }">
                <canvas ref="fabricEl" />
              </div>
              <template v-if="cropShade">
                <div v-for="(s, k) in cropShade" :key="k" class="pe-crop-shade" :style="{ left: s.left + 'px', top: s.top + 'px', width: s.width + 'px', height: s.height + 'px' }" />
              </template>
              <div v-if="tool === 'edittext'" class="pe-textboxes">
                <button
                  v-for="(b, k) in textBoxes"
                  :key="k"
                  class="pe-textbox"
                  :title="b.text"
                  :style="{ left: b.x * zoom + 'px', top: b.y * zoom + 'px', width: b.w * zoom + 'px', height: b.h * zoom + 'px' }"
                  @click="replaceText(b)"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- Свойства и страница (десктоп) -->
        <aside v-if="!isMobile" class="pe-props">
          <template v-if="propKind">
            <h3>{{ selection.length ? KIND_TITLE[propKind] : `Новая: ${KIND_TITLE[propKind]?.toLowerCase()}` }}</h3>
            <div v-if="propKind !== 'mixed' && propKind !== 'image' && propKind !== 'effect'" class="pe-field">
              <label>Цвет</label>
              <div class="pe-swatches">
                <button
                  v-for="c in SWATCHES"
                  :key="c"
                  class="pe-swatch"
                  :class="{ on: propVals.color === c }"
                  :style="{ background: c }"
                  @click="applyProp('color', c)"
                />
                <input class="pe-color" type="color" :value="propVals.color" @input="applyProp('color', $event.target.value)" />
              </div>
            </div>
            <label v-if="propKind === 'whiteout' && !selection.length" class="pe-check">
              <input type="checkbox" :checked="styles.whiteout.auto" @change="styles.whiteout.auto = $event.target.checked" />
              Подбирать цвет под бумагу
            </label>
            <button v-if="(propKind === 'whiteout' || propKind === 'textcover') && selection.length" class="pe-btn" @click="matchPaper">
              Подобрать под бумагу
            </button>
            <template v-if="propKind === 'effect'">
              <div class="pe-field">
                <label>Вид</label>
                <div class="pe-seg">
                  <button :class="{ on: propVals.effect === 'blur' }" @click="applyProp('effect', 'blur')">Размытие</button>
                  <button :class="{ on: propVals.effect === 'pixelate' }" @click="applyProp('effect', 'pixelate')">Пиксели</button>
                </div>
              </div>
              <div class="pe-field">
                <label>Сила: {{ propVals.strength }}</label>
                <input type="range" min="2" max="30" step="1" :value="propVals.strength" @input="applyProp('strength', +$event.target.value)" />
              </div>
              <p class="pe-note">Слабое размытие текст не прячет: буквы угадываются. Для паролей и номеров — «Закрасить».</p>
            </template>
            <div v-if="['draw', 'shape', 'line'].includes(propKind)" class="pe-field">
              <label>Толщина: {{ propVals.strokeWidth }}</label>
              <input type="range" min="0.5" max="24" step="0.5" :value="propVals.strokeWidth" @input="applyProp('strokeWidth', +$event.target.value)" />
            </div>
            <template v-if="propKind === 'shape'">
              <label class="pe-check">
                <input type="checkbox" :checked="propVals.fillOn" @change="applyProp('fillOn', $event.target.checked)" />
                Заливка
              </label>
              <input v-if="propVals.fillOn" class="pe-color wide" type="color" :value="propVals.fill" @input="applyProp('fill', $event.target.value)" />
            </template>
            <template v-if="propKind === 'text'">
              <div class="pe-field">
                <label>Кегль: {{ Math.round(propVals.fontSize * 10) / 10 }}</label>
                <input type="range" min="5" max="96" step="0.5" :value="propVals.fontSize" @input="applyProp('fontSize', +$event.target.value)" />
              </div>
              <div class="pe-field">
                <label>Шрифт</label>
                <select class="pe-input" :value="propVals.fontFamily" @change="applyProp('fontFamily', $event.target.value)">
                  <option v-for="f in FONTS" :key="f.code" :value="f.code">{{ f.label }}</option>
                </select>
              </div>
              <label class="pe-check">
                <input type="checkbox" :checked="propVals.bold" @change="applyProp('bold', $event.target.checked)" />
                Жирный
              </label>
            </template>
            <div v-if="['highlight', 'draw', 'shape', 'image', 'text'].includes(propKind)" class="pe-field">
              <label>Прозрачность: {{ Math.round((1 - propVals.opacity) * 100) }}%</label>
              <input type="range" min="0.1" max="1" step="0.05" :value="propVals.opacity ?? 1" @input="applyProp('opacity', +$event.target.value)" />
            </div>
          </template>

          <div v-if="selection.length" class="pe-actions">
            <button class="pe-btn" title="Ctrl+D" @click="duplicateSelected">⧉ Копия</button>
            <button class="pe-btn" @click="bringForward">Выше</button>
            <button class="pe-btn" @click="sendBackward">Ниже</button>
            <button class="pe-btn danger" title="Delete" @click="deleteSelected">🗑 Удалить</button>
          </div>

          <div v-if="page" class="pe-pageprops">
            <h3>Страница {{ current + 1 }}</h3>
            <div class="pe-row wrap">
              <button class="pe-btn" @click="rotatePage(current, false)">⟲ Влево</button>
              <button class="pe-btn" @click="rotatePage(current, true)">⟳ Вправо</button>
              <button v-if="page.crop" class="pe-btn" @click="resetCrop">Сбросить обрезку</button>
            </div>
            <div v-if="page.kind !== 'blank'" class="pe-field">
              <label>Скан</label>
              <div class="pe-seg">
                <button v-for="m in ENHANCE_MODES" :key="m.code" :class="{ on: page.enhance === m.code }" @click="setEnhance(m.code)">
                  {{ m.label }}
                </button>
              </div>
            </div>
            <div v-if="page.kind !== 'blank'" class="pe-field">
              <label>Текст на скане</label>
              <div class="pe-row wrap">
                <button class="pe-btn" :disabled="!!ocrBusy" @click="runOcr(false)">{{ pageOcr ? "Распознать заново" : "Распознать" }}</button>
                <button v-if="pages.length > 1" class="pe-btn ghost" :disabled="!!ocrBusy" @click="runOcr(true)">Все страницы</button>
                <button v-if="pageOcr?.text" class="pe-btn ghost" @click="copyPageText">Скопировать текст</button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div v-if="toolHint && !isMobile" class="pe-hint">{{ toolHint }}</div>

      <!-- Телефон: свойства и инструменты внизу -->
      <template v-if="isMobile">
        <div v-if="toolHint" class="pe-mhint">
          {{ toolHint }}
          <button v-if="tool === 'edittext' && textNote && page?.kind !== 'blank'" class="pe-link" :disabled="!!ocrBusy" @click="runOcr(false)">Распознать</button>
        </div>
        <div class="pe-mzoom">
          <button @click="zoomBy(1 / 1.25)">−</button>
          <button @click="setFit('width')">⤢</button>
          <button @click="zoomBy(1.25)">+</button>
        </div>
        <div v-if="propKind || selection.length" class="pe-mprops">
          <template v-if="propKind && propKind !== 'mixed' && propKind !== 'image' && propKind !== 'effect'">
            <button
              v-for="c in SWATCHES"
              :key="c"
              class="pe-swatch"
              :class="{ on: propVals.color === c }"
              :style="{ background: c }"
              @click="applyProp('color', c)"
            />
          </template>
          <template v-if="propKind === 'effect'">
            <button class="pe-chip" :class="{ on: propVals.effect === 'blur' }" @click="applyProp('effect', 'blur')">Размытие</button>
            <button class="pe-chip" :class="{ on: propVals.effect === 'pixelate' }" @click="applyProp('effect', 'pixelate')">Пиксели</button>
            <input class="pe-mrange" type="range" min="2" max="30" :value="propVals.strength" @input="applyProp('strength', +$event.target.value)" />
          </template>
          <input
            v-if="['draw', 'shape', 'line'].includes(propKind)"
            class="pe-mrange"
            type="range"
            min="0.5"
            max="24"
            step="0.5"
            :value="propVals.strokeWidth"
            @input="applyProp('strokeWidth', +$event.target.value)"
          />
          <input
            v-if="propKind === 'text'"
            class="pe-mrange"
            type="range"
            min="5"
            max="72"
            step="0.5"
            :value="propVals.fontSize"
            @input="applyProp('fontSize', +$event.target.value)"
          />
          <button v-if="(propKind === 'whiteout' || propKind === 'textcover') && selection.length" class="pe-chip" @click="matchPaper">Под бумагу</button>
          <template v-if="selection.length">
            <span class="pe-mprops-sep" />
            <button class="pe-chip" @click="duplicateSelected">⧉</button>
            <button class="pe-chip danger" @click="deleteSelected">🗑</button>
          </template>
        </div>
        <nav class="pe-mtools">
          <template v-for="(t, k) in TOOLS" :key="t.code || 'sep' + k">
            <button v-if="!t.sep" class="pe-tool" :class="{ on: tool === t.code }" @click="setTool(t.code)">
              <span class="pe-tool-icon">{{ t.icon }}</span>
              <span class="pe-tool-label">{{ t.label }}</span>
            </button>
          </template>
        </nav>
      </template>
    </div>

    <!-- Телефон: страницы -->
    <div v-if="showPagesSheet" class="pe-sheet-backdrop" @click.self="showPagesSheet = false">
      <div class="pe-bottom-sheet">
        <div class="pe-sheet-head">
          <b>Страницы · {{ pages.length }}</b>
          <button class="pe-icon" @click="showPagesSheet = false">✕</button>
        </div>
        <div class="pe-sheet-scroll">
          <div class="pe-mgrid">
            <button v-for="(pg, i) in pages" :key="pg.id" class="pe-mthumb" :class="{ on: i === current }" @click="goTo(i)">
              <div v-thumb class="pe-thumb-img" :data-pid="pg.id" :style="{ aspectRatio: `${pg.width} / ${pg.height}` }">
                <img v-if="thumbs[pg.id]" :src="thumbs[pg.id].url" alt="" />
              </div>
              <span>{{ i + 1 }}</span>
            </button>
          </div>
          <div v-if="page" class="pe-mpage">
            <b>Страница {{ current + 1 }}</b>
            <div class="pe-row wrap">
              <button class="pe-btn" @click="rotatePage(current, false)">⟲</button>
              <button class="pe-btn" @click="rotatePage(current, true)">⟳</button>
              <button class="pe-btn" :disabled="current === 0" @click="movePage(current, current - 1)">← Раньше</button>
              <button class="pe-btn" :disabled="current === pages.length - 1" @click="movePage(current, current + 1)">Позже →</button>
              <button class="pe-btn" @click="duplicatePage(current)">⧉ Копия</button>
              <button class="pe-btn danger" @click="deletePage(current)">🗑</button>
            </div>
            <div v-if="page.kind !== 'blank'" class="pe-seg">
              <button v-for="m in ENHANCE_MODES" :key="m.code" :class="{ on: page.enhance === m.code }" @click="setEnhance(m.code)">{{ m.label }}</button>
            </div>
            <div class="pe-row wrap">
              <button v-if="page.kind !== 'blank'" class="pe-btn" :disabled="!!ocrBusy" @click="runOcr(false); showPagesSheet = false">
                {{ pageOcr ? "Распознать заново" : "Распознать текст" }}
              </button>
              <button v-if="pageOcr?.text" class="pe-btn ghost" @click="copyPageText">Скопировать текст</button>
              <button v-if="page.crop" class="pe-btn" @click="resetCrop">Сбросить обрезку</button>
            </div>
            <div class="pe-row wrap">
              <button class="pe-btn ghost" @click="insertBlank">＋ Пустая</button>
              <button class="pe-btn ghost" @click="addInput.click()">＋ PDF или фото</button>
              <button class="pe-btn ghost" @click="cameraInput.click()">📷 Снять</button>
              <button class="pe-btn ghost" @click="backToStart">Открыть другой</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Распознавание -->
    <div v-if="ocrBusy" class="pe-ocr">
      <div>
        Распознаю текст<span v-if="ocrBusy.page">, {{ ocrBusy.page }}</span>: {{ ocrBusy.stage }}
        <span v-if="ocrBusy.progress">{{ Math.round(ocrBusy.progress * 100) }}%</span>
      </div>
      <div class="pe-bar"><i :style="{ width: (ocrBusy.progress || 0) * 100 + '%' }" /></div>
      <button class="pe-link" @click="cancelOcr">Отмена</button>
    </div>

    <!-- Пароль -->
    <div v-if="passwordAsk" class="pe-modal-backdrop">
      <form class="pe-modal small" @submit.prevent="answerPassword(passwordValue)">
        <h3>🔒 {{ passwordAsk.name }}</h3>
        <p class="pe-muted">{{ passwordAsk.wrong ? "Пароль не подошёл, попробуй ещё." : "Файл закрыт паролем." }}</p>
        <input v-model="passwordValue" class="pe-input" type="password" autocomplete="off" autofocus placeholder="Пароль" />
        <p class="pe-note">Зашифрованный файл сохранится картинками: переложить его страницы как есть нельзя.</p>
        <div class="pe-row end">
          <button type="button" class="pe-btn ghost" @click="answerPassword(null)">Не открывать</button>
          <button type="submit" class="pe-btn primary" :disabled="!passwordValue">Открыть</button>
        </div>
      </form>
    </div>

    <!-- Сохранение -->
    <div v-if="showSave" class="pe-modal-backdrop" @click.self="!saveState.busy && (showSave = false)">
      <div class="pe-modal">
        <div class="pe-modal-head">
          <h3>Сохранить PDF</h3>
          <button class="pe-icon" :disabled="saveState.busy" @click="showSave = false">✕</button>
        </div>
        <label class="pe-label">Название</label>
        <input v-model="saveOpts.name" class="pe-input" :disabled="saveState.busy" />

        <div v-if="savePlan" class="pe-plan">
          <div>{{ pages.length }} стр.<span v-if="savePlan.flattened">, из них {{ savePlan.flattened }} уйдут картинкой</span></div>
          <div v-if="savePlan.inPlace" class="pe-muted">Оглавление, ссылки и формы файла сохранятся.</div>
          <div v-else-if="pages.some((p) => p.kind === 'pdf')" class="pe-muted">Страницы переставлялись или склеивались — оглавление исходника не переносится.</div>
          <div v-if="savePlan.encrypted" class="pe-warn">Файл зашифрован: его страницы сохранятся картинками.</div>
        </div>

        <label v-if="savePlan?.anyHiding" class="pe-check">
          <input v-model="saveOpts.flattenHidden" type="checkbox" :disabled="saveState.busy" />
          <span>
            <b>Страницы с замазкой — в картинку</b><br />
            <span class="pe-muted">Текст и картинки из-под замазки и размытия вычищаются из файла. Без этого их можно выделить и скопировать.</span>
          </span>
        </label>
        <div v-if="savePlan?.hidingKept" class="pe-warn">
          На {{ savePlan.hidingKept }} стр. замазка будет просто нарисована сверху — то, что под ней, останется в файле.
        </div>
        <label class="pe-check">
          <input v-model="saveOpts.flattenAll" type="checkbox" :disabled="saveState.busy" />
          <span>
            Все страницы — картинкой<br />
            <span class="pe-muted">Как распечатать и отсканировать: ничего не выделить, файл тяжелее.</span>
          </span>
        </label>
        <label v-if="savePlan?.anyOcr" class="pe-check">
          <input v-model="saveOpts.ocrLayer" type="checkbox" :disabled="saveState.busy" />
          <span>
            Невидимый текст из распознавания<br />
            <span class="pe-muted">По скану заработают поиск и копирование.</span>
          </span>
        </label>
        <div v-if="savePlan && (savePlan.flattened || saveOpts.flattenAll)" class="pe-field">
          <label>Качество картинок</label>
          <div class="pe-seg">
            <button :class="{ on: saveOpts.dpi === 150 }" @click="saveOpts.dpi = 150">Лёгкое</button>
            <button :class="{ on: saveOpts.dpi === 200 }" @click="saveOpts.dpi = 200">Обычное</button>
            <button :class="{ on: saveOpts.dpi === 300 }" @click="saveOpts.dpi = 300">Для печати</button>
          </div>
        </div>

        <div v-if="saveState.busy" class="pe-progress">
          <div>{{ saveState.stage || "Собираю…" }}</div>
          <div class="pe-bar"><i :style="{ width: saveState.progress * 100 + '%' }" /></div>
        </div>
        <div v-if="saveState.error" class="pe-warn">{{ saveState.error }}</div>
        <div v-if="saveState.done" class="pe-ok">
          {{ saveState.done }}
          <template v-if="saveState.created?.id">
            · <a href="#" @click.prevent="router.push({ path: '/pdfReader', query: { file: saveState.created.id } })">открыть в читалке</a>
          </template>
        </div>

        <div v-if="saveState.confirmReplace" class="pe-confirm">
          Файл книги «{{ library?.title }}» заменится этим. Прогресс, закладки и привязка к плану останутся, прежний файл — нет.
          <div class="pe-row end">
            <button class="pe-btn ghost" @click="saveState.confirmReplace = false">Не надо</button>
            <button class="pe-btn danger" @click="replaceInLibrary">Заменить</button>
          </div>
        </div>
        <div v-else class="pe-row wrap end">
          <button v-if="library" class="pe-btn" :disabled="saveState.busy" @click="saveState.confirmReplace = true">Заменить в библиотеке</button>
          <button class="pe-btn" :disabled="saveState.busy" @click="saveToLibrary">В библиотеку</button>
          <button v-if="canShare && isTouch" class="pe-btn" :disabled="saveState.busy" @click="saveShare">Поделиться</button>
          <button class="pe-btn primary" :disabled="saveState.busy" @click="saveDownload">⬇ Скачать</button>
        </div>
      </div>
    </div>

    <PdfSignaturePad v-if="showSignature" @done="onSignature" @close="showSignature = false" />

    <div v-if="dropActive" class="pe-dropzone-overlay">Отпусти — {{ phase === "edit" ? "страницы добавятся после текущей" : "файл откроется" }}</div>
    <div v-if="toastText" class="pe-toast">{{ toastText }}</div>
  </div>
</template>

<style scoped>
.pe {
  --acc: #4361ee;
  --acc-soft: rgba(67, 97, 238, 0.12);
  --line: #e2e5ee;
  --ink: #1d2233;
  --muted: #6b7286;
  --bg: #eef0f5;
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--ink);
  font-size: 14px;
}

/* --- общие --- */
.pe-btn {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  border-radius: 9px;
  padding: 7px 12px;
  font-size: 13.5px;
  cursor: pointer;
  white-space: nowrap;
  line-height: 1.2;
}
.pe-btn:hover:not(:disabled) {
  border-color: #c5cbe0;
}
.pe-btn.primary {
  background: var(--acc);
  border-color: var(--acc);
  color: #fff;
}
.pe-btn.ghost {
  background: transparent;
  border-color: transparent;
}
.pe-btn.ghost:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
}
.pe-btn.danger {
  color: #c92a2a;
}
.pe-btn:disabled,
.pe-icon:disabled {
  opacity: 0.45;
  cursor: default;
}
.pe-icon {
  border: none;
  background: transparent;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  font-size: 18px;
  cursor: pointer;
  color: var(--ink);
  flex-shrink: 0;
}
.pe-icon:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.06);
}
.pe-link {
  border: none;
  background: none;
  color: var(--acc);
  padding: 0;
  font: inherit;
  cursor: pointer;
}
.pe-muted {
  color: var(--muted);
  font-size: 12.5px;
}
.pe-note {
  font-size: 12px;
  color: var(--muted);
  margin: 4px 0 0;
}
.pe-warn {
  background: #fff4e6;
  color: #a6420c;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  margin: 8px 0;
}
.pe-ok {
  background: #ebfbee;
  color: #2b8a3e;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  margin: 8px 0;
}
.pe-input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 8px 10px;
  font-size: 14px;
  background: #fff;
  box-sizing: border-box;
}
.pe-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.pe-row.wrap {
  flex-wrap: wrap;
}
.pe-row.end {
  justify-content: flex-end;
}
.pe-divider {
  width: 1px;
  height: 22px;
  background: var(--line);
  margin: 0 4px;
}
.pe-bar {
  height: 4px;
  border-radius: 2px;
  background: #dde1ee;
  overflow: hidden;
  margin-top: 6px;
  width: 100%;
}
.pe-bar i {
  display: block;
  height: 100%;
  background: var(--acc);
  transition: width 0.2s;
}
.pe-seg {
  display: inline-flex;
  flex-wrap: wrap;
  border: 1px solid var(--line);
  border-radius: 9px;
  overflow: hidden;
  background: #fff;
}
.pe-seg button {
  border: none;
  background: transparent;
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
}
.pe-seg button.on {
  background: var(--acc-soft);
  color: var(--acc);
  font-weight: 600;
}
.pe-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 10px 0;
  cursor: pointer;
  line-height: 1.35;
}
.pe-check input {
  margin-top: 3px;
}

/* --- старт --- */
.pe-start {
  overflow-y: auto;
  padding: 16px 16px 40px;
  max-width: 820px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}
.pe-start-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.pe-start-head h1 {
  font-size: 20px;
  margin: 0;
}
.pe-drop {
  border: 2px dashed #b9c1dc;
  border-radius: 16px;
  background: #fff;
  padding: 32px 16px;
  text-align: center;
  cursor: pointer;
}
.pe-drop-icon {
  font-size: 40px;
}
.pe-drop-title {
  font-size: 17px;
  font-weight: 600;
  margin-top: 6px;
}
.pe-drop-sub {
  color: var(--muted);
  font-size: 13px;
  margin: 4px 0 16px;
}
.pe-drop-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}
.pe-draft {
  margin-top: 14px;
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  border-left: 4px solid var(--acc);
}
.pe-lib {
  margin-top: 18px;
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
}
.pe-lib-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.pe-lib-head h2 {
  font-size: 15px;
  margin: 0;
  white-space: nowrap;
}
.pe-lib-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 300px;
  overflow-y: auto;
}
.pe-lib-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border: none;
  background: none;
  text-align: left;
  padding: 9px 6px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}
.pe-lib-item:hover {
  background: var(--acc-soft);
}
.pe-lib-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pe-features {
  margin: 18px 0 0;
  padding-left: 18px;
  color: #474e63;
  line-height: 1.5;
  font-size: 13.5px;
}
.pe-features li {
  margin-bottom: 6px;
}

.pe-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  text-align: center;
}
.pe-loading .pe-bar {
  max-width: 280px;
}
.pe-spinner {
  width: 34px;
  height: 34px;
  border: 3px solid #d0d6ea;
  border-top-color: var(--acc);
  border-radius: 50%;
  animation: pe-spin 0.8s linear infinite;
}
@keyframes pe-spin {
  to {
    transform: rotate(360deg);
  }
}

/* --- редактор --- */
.pe-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.pe-top {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #fff;
  border-bottom: 1px solid var(--line);
  min-height: 48px;
  box-sizing: border-box;
  padding-top: max(6px, env(safe-area-inset-top));
}
.pe-doc {
  flex: 1;
  min-width: 0;
}
.pe-doc-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pe-doc-sub {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pe-top-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.pe-zoom {
  min-width: 58px;
}
.pe-tools {
  display: flex;
  align-items: stretch;
  gap: 2px;
  padding: 4px 8px;
  background: #fff;
  border-bottom: 1px solid var(--line);
  overflow-x: auto;
}
.pe-tools-sep {
  width: 1px;
  background: var(--line);
  margin: 4px 4px;
  flex-shrink: 0;
}
.pe-tool {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 4px 8px;
  cursor: pointer;
  min-width: 56px;
  color: var(--ink);
  flex-shrink: 0;
}
.pe-tool:hover {
  background: rgba(0, 0, 0, 0.05);
}
.pe-tool.on {
  background: var(--acc-soft);
  color: var(--acc);
}
.pe-tool-icon {
  font-size: 18px;
  line-height: 22px;
}
.pe-tool-label {
  font-size: 11.5px;
}

.pe-main {
  flex: 1;
  min-height: 0;
  display: flex;
}
.pe-pages {
  width: 168px;
  flex-shrink: 0;
  overflow-y: auto;
  background: #f7f8fb;
  border-right: 1px solid var(--line);
  padding: 10px;
  box-sizing: border-box;
}
.pe-thumb {
  position: relative;
  margin-bottom: 12px;
  cursor: pointer;
  border-radius: 6px;
  padding: 4px;
  border: 2px solid transparent;
}
.pe-thumb.on {
  border-color: var(--acc);
  background: #fff;
}
.pe-thumb.drop {
  box-shadow: 0 -4px 0 -1px var(--acc);
}
.pe-thumb-img {
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  width: 100%;
  overflow: hidden;
}
.pe-thumb-img img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}
.pe-thumb-foot {
  display: flex;
  gap: 6px;
  justify-content: center;
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}
.pe-thumb-acts {
  position: absolute;
  top: 6px;
  right: 6px;
  display: none;
  flex-direction: column;
  gap: 2px;
}
.pe-thumb:hover .pe-thumb-acts {
  display: flex;
}
.pe-thumb-acts button {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.95);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}
.pe-pages-add {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pe-stage {
  flex: 1;
  min-width: 0;
  overflow: auto;
  position: relative;
  overscroll-behavior: contain;
}
.pe-stage.is-hand {
  cursor: grab;
}
.pe-stage-inner {
  width: max-content;
  min-width: 100%;
  padding: 24px;
  box-sizing: border-box;
}
.pe-sheet {
  position: relative;
  margin: 0 auto;
  background: #fff;
  box-shadow: 0 2px 14px rgba(20, 30, 60, 0.18);
}
.pe-base {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.pe-fabric {
  position: absolute;
  inset: 0;
}
.pe-fabric.passthrough {
  pointer-events: none;
}
.pe-fabric.passthrough :deep(.upper-canvas) {
  pointer-events: none;
}
.pe-crop-shade {
  position: absolute;
  background: rgba(20, 24, 40, 0.45);
  pointer-events: none;
}
.pe-textboxes {
  position: absolute;
  inset: 0;
}
.pe-textbox {
  position: absolute;
  border: 1px dashed rgba(67, 97, 238, 0.55);
  background: rgba(67, 97, 238, 0.06);
  border-radius: 2px;
  padding: 0;
  cursor: text;
}
.pe-textbox:hover,
.pe-textbox:focus-visible {
  background: rgba(67, 97, 238, 0.18);
  border-style: solid;
}

.pe-props {
  width: 260px;
  flex-shrink: 0;
  overflow-y: auto;
  background: #fff;
  border-left: 1px solid var(--line);
  padding: 12px 14px;
  box-sizing: border-box;
}
.pe-props h3,
.pe-pageprops h3 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  margin: 4px 0 10px;
}
.pe-field {
  margin-bottom: 12px;
}
.pe-field > label {
  display: block;
  font-size: 12.5px;
  color: var(--muted);
  margin-bottom: 5px;
}
.pe-field input[type="range"] {
  width: 100%;
}
.pe-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.pe-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px #c9cede;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.pe-swatch.on {
  box-shadow: 0 0 0 2.5px var(--acc);
}
.pe-color {
  width: 30px;
  height: 26px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 1px;
  background: #fff;
  cursor: pointer;
}
.pe-color.wide {
  width: 100%;
  margin-bottom: 10px;
}
.pe-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin: 6px 0 14px;
}
.pe-pageprops {
  border-top: 1px solid var(--line);
  padding-top: 12px;
  margin-top: 6px;
}
.pe-pageprops .pe-row {
  margin-bottom: 10px;
}
.pe-hint {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  background: rgba(29, 34, 51, 0.86);
  color: #fff;
  padding: 7px 14px;
  border-radius: 20px;
  font-size: 13px;
  pointer-events: none;
  max-width: 70%;
  text-align: center;
}

/* --- окна --- */
.pe-modal-backdrop,
.pe-sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(15, 18, 30, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.pe-modal {
  background: #fff;
  border-radius: 14px;
  padding: 16px 18px;
  width: min(520px, 100%);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  box-sizing: border-box;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.pe-modal.small {
  width: min(400px, 100%);
}
.pe-modal h3 {
  margin: 0 0 8px;
  font-size: 17px;
}
.pe-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pe-label {
  display: block;
  font-size: 12.5px;
  color: var(--muted);
  margin: 6px 0 4px;
}
.pe-plan {
  background: #f5f6fa;
  border-radius: 8px;
  padding: 8px 10px;
  margin: 12px 0 4px;
  line-height: 1.45;
}
.pe-progress {
  margin: 10px 0;
  font-size: 13px;
}
.pe-confirm {
  background: #fff4e6;
  border-radius: 10px;
  padding: 10px 12px;
  margin-top: 10px;
  font-size: 13.5px;
  line-height: 1.4;
}
.pe-confirm .pe-row {
  margin-top: 8px;
}
.pe-modal > .pe-row:last-child {
  margin-top: 14px;
}

.pe-ocr {
  position: fixed;
  left: 50%;
  top: 64px;
  transform: translateX(-50%);
  z-index: 40;
  background: #fff;
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  width: min(380px, calc(100% - 32px));
  box-sizing: border-box;
  font-size: 13px;
}
.pe-ocr .pe-link {
  margin-top: 6px;
}

.pe-toast {
  position: fixed;
  left: 50%;
  bottom: 64px;
  transform: translateX(-50%);
  z-index: 70;
  background: #1d2233;
  color: #fff;
  border-radius: 10px;
  padding: 10px 16px;
  font-size: 13.5px;
  max-width: calc(100% - 32px);
  box-sizing: border-box;
  text-align: center;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
.pe-dropzone-overlay {
  position: fixed;
  inset: 12px;
  z-index: 45;
  border: 3px dashed var(--acc);
  border-radius: 18px;
  background: rgba(67, 97, 238, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  color: var(--acc);
  pointer-events: none;
}

/* --- телефон --- */
.pe.is-mobile .pe-top {
  padding: 4px 6px;
  padding-top: max(4px, env(safe-area-inset-top));
}
.pe.is-mobile .pe-stage-inner {
  padding: 8px;
}
.pe-mhint {
  background: #fff;
  border-top: 1px solid var(--line);
  padding: 6px 12px;
  font-size: 12.5px;
  color: var(--muted);
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}
.pe-mzoom {
  position: fixed;
  right: 10px;
  bottom: calc(150px + env(safe-area-inset-bottom));
  z-index: 15;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}
.pe-mzoom button {
  width: 42px;
  height: 40px;
  border: none;
  background: transparent;
  font-size: 18px;
}
.pe-mzoom button + button {
  border-top: 1px solid var(--line);
}
.pe-mprops {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fff;
  border-top: 1px solid var(--line);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.pe-mprops .pe-swatch {
  width: 30px;
  height: 30px;
}
.pe-mrange {
  min-width: 120px;
  flex: 1;
}
.pe-mprops-sep {
  flex: 1;
  min-width: 4px;
}
.pe-chip {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 18px;
  padding: 7px 12px;
  font-size: 13.5px;
  white-space: nowrap;
  flex-shrink: 0;
}
.pe-chip.on {
  background: var(--acc-soft);
  border-color: var(--acc);
  color: var(--acc);
}
.pe-chip.danger {
  color: #c92a2a;
}
.pe-mtools {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  background: #fff;
  border-top: 1px solid var(--line);
  padding: 4px 6px;
  padding-bottom: max(4px, env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.pe-mtools::-webkit-scrollbar {
  display: none;
}
.pe-mtools .pe-tool {
  min-width: 66px;
  padding: 6px 4px;
}
.pe-tool-label {
  white-space: nowrap;
}
.pe-mtools .pe-tool-icon {
  font-size: 20px;
}
.pe-sheet-backdrop {
  align-items: flex-end;
  padding: 0;
}
.pe-bottom-sheet {
  background: #fff;
  width: 100%;
  max-height: 85dvh;
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
}
.pe-sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px 4px;
}
.pe-sheet-scroll {
  overflow-y: auto;
  padding: 0 14px 14px;
}
.pe-mgrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 8px 0 12px;
}
.pe-mthumb {
  border: 2px solid transparent;
  background: none;
  border-radius: 8px;
  padding: 4px;
  font-size: 12px;
  color: var(--muted);
}
.pe-mthumb.on {
  border-color: var(--acc);
}
.pe-mthumb span {
  display: block;
  margin-top: 4px;
}
.pe-mpage {
  border-top: 1px solid var(--line);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pe-mpage .pe-btn {
  padding: 9px 12px;
}
.pe.is-mobile .pe-modal-backdrop {
  align-items: flex-end;
  padding: 0;
}
.pe.is-mobile .pe-modal {
  width: 100%;
  border-radius: 16px 16px 0 0;
  max-height: 92dvh;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}
.pe.is-mobile .pe-modal .pe-btn {
  padding: 10px 14px;
}
.pe.is-mobile .pe-toast {
  bottom: calc(130px + env(safe-area-inset-bottom));
}
</style>
