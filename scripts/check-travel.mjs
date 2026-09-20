// Проверки интерфейса, которые нельзя увидеть в сборке.
//
// Оба бага, из-за которых раздел «Путешествия» полгода выглядел сломанным,
// собирались без единой ошибки: шрифт иконок уехал вместе с Vuetify, а нижнее
// меню телефона накрыло переключатель «Карта / Маршрут». Компилятору нечего
// было сказать — пустые кнопки это валидный HTML. Поэтому такие вещи
// проверяются здесь, отдельным прогоном перед сборкой.
//
// Зависимостей нет нарочно: проверка должна работать и в CI, и на сервере,
// где ставится только то, что перечислено в package.json.
//
// Запуск: npm run check

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as mdi from "@mdi/js";
import mdiCss, { ALIAS, EXTRA, SOURCE_EXT, collectNames, exportName }
  from "../vite-plugin-mdi.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let checked = 0;
let failed = 0;

function check(name, fn) {
  checked++;
  try {
    const problem = fn();
    if (problem) {
      failed++;
      console.error(`  ✗ ${name}\n      ${String(problem).replace(/\n/g, "\n      ")}`);
    } else {
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n      упало: ${err.message}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function walk(dir, ext, hit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, hit);
    else if (ext.has(path.extname(entry.name))) hit(full, fs.readFileSync(full, "utf8"));
  }
}

// --- Иконки ---

section("Иконки");

const usedIcons = collectNames(path.join(root, "src"), new Set());

check("в разметке вообще есть иконки mdi", () =>
  usedIcons.size > 0 ? null : "ни одной не нашлось — проверка перестала что-либо проверять",
);

check("у каждой иконки из разметки есть контур", () => {
  const missing = [...usedIcons].filter((name) => !mdi[exportName(ALIAS[name] || name)]);
  return missing.length
    ? `нет контура у ${missing.length}: ${missing.join(", ")}.\n` +
        "Опечатка в классе или иконку переименовали в @mdi/js."
    : null;
});

check("иконки из базы перечислены в EXTRA", () => {
  // Имена справочников приходят с сервера, в разметке их нет — сканирование
  // их не найдёт. Сверяемся с посевом back-m, если он лежит рядом.
  const seed = path.resolve(root, "..", "back-m", "infra", "persistence", "postgres.go");
  if (!fs.existsSync(seed)) return null; // на сервере соседнего репозитория нет
  const text = fs.readFileSync(seed, "utf8");
  const seeded = new Set();
  for (const m of text.matchAll(/Icon:\s*"(mdi-[a-z0-9-]+)"/g)) seeded.add(m[1]);
  const known = new Set([...EXTRA, ...usedIcons]);
  const forgotten = [...seeded].filter((name) => !known.has(name));
  return forgotten.length
    ? `посев back-m заводит категории с иконками, которых плагин не соберёт: ${forgotten.join(", ")}.\n` +
        "Допишите их в EXTRA в vite-plugin-mdi.mjs."
    : null;
});

check("в EXTRA нет имён без контура", () => {
  const broken = EXTRA.filter((name) => !mdi[exportName(ALIAS[name] || name)]);
  return broken.length ? `в EXTRA перечислено несуществующее: ${broken.join(", ")}` : null;
});

check("каждый алиас ведёт на существующую иконку", () => {
  const broken = Object.entries(ALIAS).filter(([, target]) => !mdi[exportName(target)]);
  return broken.length
    ? `алиасы указывают в никуда: ${broken.map(([from, to]) => `${from} → ${to}`).join(", ")}`
    : null;
});

check("CSS иконок подключён в main.js", () => {
  const main = read("src/main.js");
  return main.includes("virtual:mdi.css")
    ? null
    : "src/main.js не импортирует virtual:mdi.css — иконок в сборке не будет";
});

check("плагин иконок подключён в vite.config.mjs", () => {
  const config = read("vite.config.mjs");
  return config.includes("mdiCss()")
    ? null
    : "vite.config.mjs не подключает плагин — иконки не соберутся";
});

check("файл плагина уезжает на сервер при деплое", () => {
  // Образ собирается на сервере заново, из того, что скопировал scp.
  const workflow = read(".github/workflows/deploy-dev.yml");
  const line = workflow.split("\n").find((l) => l.trim().startsWith("source:"));
  if (!line) return "в деплое не нашёлся список файлов (source:)";
  return line.includes("vite-plugin-mdi.mjs")
    ? null
    : "vite-plugin-mdi.mjs не входит в source: деплоя — сборка на сервере упадёт";
});

// --- Нижнее меню телефона ---

section("Нижнее меню телефона");

const APP_VUE = read("src/App.vue");

check("высота меню объявлена переменной", () =>
  APP_VUE.includes("--tabbar-h:")
    ? null
    : "в App.vue нет --tabbar-h: экранам не от чего отталкиваться",
);

check("обёртка держит отступ этой же переменной", () =>
  /padding-bottom:\s*var\(--tabbar-h\)/.test(APP_VUE)
    ? null
    : "padding-bottom обёртки задан мимо переменной — значения разъедутся",
);

// Экран, который сам занимает высоту окна, обязан вычесть меню: иначе его
// нижняя полоса кнопок оказывается под ним и раздел теряет навигацию.
const FULL_HEIGHT = /(?:^|\n)\s*(?:min-)?height:\s*(100vh|100dvh)\s*;/g;

check("полноэкранные экраны путешествий вычитают меню", () => {
  const offenders = [];
  walk(path.join(root, "src", "views", "travel"), new Set([".vue"]), (file, text) => {
    // Гостевая ссылка открывается без меню — ей вычитать нечего.
    if (path.basename(file) === "PublicTripView.vue") return;
    for (const match of text.matchAll(FULL_HEIGHT)) {
      offenders.push(`${path.relative(root, file)}: ${match[0].trim()}`);
    }
  });
  return offenders.length
    ? `высота окна без поправки на меню:\n${offenders.join("\n")}\n` +
        "Нужно height: calc(100dvh - var(--tabbar-h, 0px))."
    : null;
});

check("вычитание действительно прописано", () => {
  const dir = path.join(root, "src", "views", "travel");
  const screens = ["TripView.vue", "CountryView.vue", "TravelCountriesView.vue", "TripTodayView.vue"];
  const without = screens.filter(
    (name) => !fs.readFileSync(path.join(dir, name), "utf8").includes("var(--tabbar-h"),
  );
  return without.length ? `не вычитают высоту меню: ${without.join(", ")}` : null;
});

// --- Маршруты ---

section("Маршруты");

const ROUTER = read("src/router/index.js");

check("все маршруты раздела ведут на существующие файлы", () => {
  const missing = [];
  for (const m of ROUTER.matchAll(/import\("(\.\.\/views\/[^"]+)"\)/g)) {
    const target = path.resolve(root, "src", "router", m[1]);
    if (!fs.existsSync(target)) missing.push(m[1]);
  }
  return missing.length ? `нет файлов: ${missing.join(", ")}` : null;
});

check("пути раздела «Путешествия» на месте", () => {
  const required = ["/travel", "/travel/countries/:id", "/travel/trips/:id", "/travel/today/:id?", "/travel/shared/:token"];
  const absent = required.filter((route) => !ROUTER.includes(`"${route}"`));
  return absent.length ? `маршруты пропали: ${absent.join(", ")}` : null;
});

check("гостевая ссылка помечена публичной", () => {
  const index = ROUTER.indexOf('"/travel/shared/:token"');
  if (index < 0) return "маршрут гостевой ссылки не найден";
  const block = ROUTER.slice(index, index + 400);
  return /public:\s*true/.test(block)
    ? null
    : "у /travel/shared/:token нет meta.public — гостя развернёт на форму входа";
});

// --- Исходники ---

section("Исходники");

// Самая важная проверка: не «контур существует в @mdi/js», а «плагин
// действительно положил правило в CSS». Между первым и вторым помещается
// ровно та поломка, ради которой всё это написано.
check("сгенерированный CSS покрывает каждую иконку разметки", () => {
  const plugin = mdiCss();
  const id = plugin.resolveId("virtual:mdi.css");
  const css = plugin.load.call({ warn() {} }, id);
  if (!css || !css.includes(".mdi{")) return "плагин не отдал базовое правило .mdi";

  const defined = new Set();
  for (const m of css.matchAll(/\.(mdi-[a-z0-9-]+)\{/g)) defined.add(m[1]);

  const uncovered = [...usedIcons, ...EXTRA].filter((name) => !defined.has(name));
  return uncovered.length
    ? `в CSS нет правил для ${uncovered.length} иконок: ${uncovered.join(", ")}`
    : null;
});

check("service worker путешествий лежит на месте", () =>
  fs.existsSync(path.join(root, "public", "travel-sw.js"))
    ? null
    : "public/travel-sw.js пропал — офлайн раздела отвалится молча",
);

console.log(`\nПроверок: ${checked}, провалено: ${failed}`);
process.exit(failed ? 1 : 0);
