// Иконки Material Design Icons без шрифта.
//
// Раздел «Путешествия» рисует иконки классами — `<i class="mdi mdi-plus">`.
// Так было, пока в приложении жил Vuetify: он тянул за собой шрифт MDI, и
// классы работали сами собой. Vuetify убрали (см. main.js), шрифт уехал
// вместе с ним, а разметка осталась — полторы сотни иконок в путешествиях
// стали пустыми квадратами, и вместе с ними пропали кнопки «назад»,
// «добавить», «удалить». Раздел на вид сломался целиком.
//
// Возвращать шрифт ради одного раздела не хочется: это мегабайт с лишним на
// каждое первое открытие, ровно то, от чего избавлялись. Поэтому иконки
// собираются в CSS: плагин ищет в исходниках имена `mdi-*`, берёт контуры из
// @mdi/js (он уже в зависимостях) и складывает их в маски. В сборку попадают
// только те иконки, которые действительно используются, — сейчас это
// примерно сто двадцать штук, около сорока килобайт.
//
// Маска, а не фоновая картинка, потому что иконки должны краситься в цвет
// текста: в разметке они лежат внутри кнопок разных цветов и меняют его при
// наведении, как это делал шрифт.

import fs from "node:fs";
import path from "node:path";

import * as mdi from "@mdi/js";

// VIRTUAL_ID — то, что пишут в import. Ведущий \0 в разрешённом имени —
// соглашение Rollup: так остальные плагины понимают, что файла на диске нет.
const VIRTUAL_ID = "virtual:mdi.css";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

// EXTRA — иконки, которых нет в разметке: имена лежат в базе и приезжают с
// сервера. Это справочники модуля «Путешествия» — типы точек на карте и
// категории трат; их заводит seedTravelCategories в back-m
// (infra/persistence/postgres.go). Заводите категорию с новой иконкой —
// допишите её сюда, иначе вместо неё будет запасной кружок.
export const EXTRA = [
  // travel_place_categories
  "mdi-camera",
  "mdi-temple-buddhist",
  "mdi-torii", // старые базы, см. ALIAS
  "mdi-bank",
  "mdi-silverware-fork-knife",
  "mdi-coffee",
  "mdi-shopping",
  "mdi-bed",
  "mdi-train",
  "mdi-binoculars",
  "mdi-tree",
  "mdi-ferris-wheel",
  "mdi-hot-tub",
  "mdi-information",
  // travel_expense_categories
  "mdi-train-car",
  "mdi-ticket",
  "mdi-gift",
  "mdi-sim",
  "mdi-party-popper",
  "mdi-alert-circle",
];

// ALIAS — имена, которых в MDI нет, но они уже лежат в чужих базах.
// mdi-torii записан в категорию «Храм / святыня» первым посевом; такой иконки
// в наборе никогда не было, и поменять запись некому — в интерфейсе категории
// не редактируются. В посеве имя уже исправлено, здесь — для старых баз.
export const ALIAS = {
  "mdi-torii": "mdi-temple-buddhist",
};

// FALLBACK — что показать вместо незнакомого имени. Пустое место посреди
// кнопок — это как раз та поломка, из-за которой плагин и появился; пусть
// лучше будет видно «иконка не нашлась».
const FALLBACK = "mdi-help-circle-outline";

const SOURCE_DIRS = ["src"];
export const SOURCE_EXT = new Set([".vue", ".js", ".mjs", ".ts"]);

// mdi-arrow-left → mdiArrowLeft: имена экспортов в @mdi/js устроены так.
export function exportName(className) {
  return (
    "mdi" +
    className
      .slice("mdi-".length)
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("")
  );
}

export function collectNames(dir, found) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectNames(full, found);
      continue;
    }
    if (!SOURCE_EXT.has(path.extname(entry.name))) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const match of text.matchAll(/\bmdi-[a-z0-9]+(?:-[a-z0-9]+)*\b/g)) {
      found.add(match[0]);
    }
  }
  return found;
}

// dataUri — контур в маску. Кодируем минимально: угловые скобки ломают
// парсер CSS, кавычки внутри url("…") закрывают строку. Запятые и пробелы,
// которых в контурах большинство, оставляем как есть — encodeURIComponent
// раздул бы файл вдвое на пустом месте.
function dataUri(pathData) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>` +
    `<path d='${pathData}'/></svg>`;
  const encoded = svg
    .replace(/%/g, "%25")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/#/g, "%23");
  return `url("data:image/svg+xml,${encoded}")`;
}

function buildCss(warn) {
  const names = new Set(EXTRA);
  names.add(FALLBACK);
  for (const dir of SOURCE_DIRS) {
    if (fs.existsSync(dir)) collectNames(dir, names);
  }

  const fallbackPath = mdi[exportName(FALLBACK)];
  const rules = [];
  const missing = [];

  for (const name of [...names].sort()) {
    const pathData = mdi[exportName(ALIAS[name] || name)];
    if (!pathData) {
      missing.push(name);
      continue;
    }
    rules.push(`.${name}{--mdi-icon:${dataUri(pathData)}}`);
  }

  if (missing.length && warn) {
    // Не ошибка сборки: чаще всего это опечатка в одном классе, и ронять из-за
    // неё весь фронт незачем — иконка станет запасной, а запись останется в логе.
    warn(`нет контура для иконок: ${missing.join(", ")}`);
  }

  // Базовое правило повторяет поведение шрифта: размер по кеглю текста, цвет
  // текста, посадка на базовую линию. flex:none — потому что у коробки с
  // маской нет содержимого, и в flex-строке она схлопнулась бы в ноль, чего
  // с глифом не происходило.
  const base = [
    `.mdi{`,
    `display:inline-block;`,
    `width:1em;`,
    `height:1em;`,
    `flex:none;`,
    `line-height:1;`,
    `vertical-align:-0.125em;`,
    `background-color:currentColor;`,
    `--mdi-icon:${dataUri(fallbackPath)};`,
    `-webkit-mask:var(--mdi-icon) no-repeat center/contain;`,
    `mask:var(--mdi-icon) no-repeat center/contain;`,
    `}`,
  ].join("");

  return [base, ...rules].join("\n");
}

export default function mdiCssPlugin() {
  let cache = null;
  return {
    name: "mdi-css",
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      if (!cache) cache = buildCss((msg) => this.warn(msg));
      return cache;
    },
    // Новую иконку в разметке надо увидеть без перезапуска: список собран
    // один раз, поэтому сбрасываем его, когда исходник меняется.
    handleHotUpdate({ file, server }) {
      if (!SOURCE_EXT.has(path.extname(file))) return;
      cache = null;
      const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
      if (mod) server.moduleGraph.invalidateModule(mod);
    },
  };
}
