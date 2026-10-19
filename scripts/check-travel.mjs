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

// --- Скорочтение ---
//
// Разбор текста PDF на слова живёт в чистом модуле, и ошибки в нём не видно ни
// компилятору, ни глазом на десктопе: «програм- мирование», номер страницы
// посреди фразы или кадр «точка. Новое» молча портят чтение на 500 сл/мин.

section("Скорочтение");

const rsvp = await import("../src/views/pdf-reader/speed/rsvpText.js");

// Кусочек текста так, как его отдаёт pdf.js: строка на высоте y, шрифт 10.
function item(str, x, y, { eol = true, width = str.length * 5 } = {}) {
  return { str, transform: [10, 0, 0, 10, x, y], width, height: 10, hasEOL: eol };
}

check("перенос в конце строки склеивается в одно слово", () => {
  const lines = rsvp.linesFromItems([
    item("Это книга про програм-", 50, 700),
    item("мирование и Нью-", 50, 688),
    item("Йорк.", 50, 676),
  ]);
  const words = rsvp.tokensFromLines(lines, 1).map((t) => t.t);
  const want = ["Это", "книга", "про", "программирование", "и", "Нью-Йорк."];
  return JSON.stringify(words) === JSON.stringify(want) ? null : `получили ${JSON.stringify(words)}`;
});

check("номер страницы и колонтитул не попадают в текст", () => {
  const page = (n, body) => rsvp.linesFromItems([
    item(`${n}   Чистая архитектура`, 50, 760),
    item(body, 50, 700),
    item("Вторая строка текста.", 50, 688),
    item(String(n), 300, 40),
  ]);
  const neighbors = [page(11, "Совсем другой текст"), page(13, "И ещё один")];
  const kept = rsvp.stripRunningLines(page(12, "Первая строка"), neighbors).map((l) => l.text);
  return kept.length === 2 && kept[0] === "Первая строка" ? null : `осталось ${JSON.stringify(kept)}`;
});

check("перенос через страницу склеивается", () => {
  const prev = rsvp.tokensFromLines(rsvp.linesFromItems([item("это архитек-", 50, 100)]), 5);
  const next = rsvp.tokensFromLines(rsvp.linesFromItems([item("тура системы.", 50, 700)]), 6);
  rsvp.mergeAcrossPages(prev, next);
  const all = [...prev, ...next].map((t) => t.t).join(" ");
  return all === "это архитектура системы." ? null : `получили «${all}»`;
});

check("красная буква — чуть левее середины слова", () => {
  const cases = { "и": "и", "мама": "а", "чтение": "е", "«Привет»,": "и", "архитектура": "и" };
  const bad = Object.entries(cases)
    .filter(([word, letter]) => rsvp.splitAtPivot(word).pivot !== letter)
    .map(([word, letter]) => `${word}: ждали «${letter}», получили «${rsvp.splitAtPivot(word).pivot}»`);
  return bad.length ? bad.join("\n") : null;
});

check("кадр из нескольких слов не перешагивает конец предложения", () => {
  const tokens = rsvp.tokensFromLines(rsvp.linesFromItems([item("Он ушёл. Она осталась дома", 50, 700)]), 1);
  const first = rsvp.frameAt(tokens, 0, 3);
  return first.text === "Он ушёл." ? null : `первый кадр «${first.text}»`;
});

check("паузы: точка дольше запятой, запятая дольше обычного слова", () => {
  const [plain, comma, dot] = rsvp.tokensFromLines(rsvp.linesFromItems([item("слово запятая, точка.", 50, 700)]), 1);
  const w = (t) => rsvp.wordWeight(t);
  return w(dot) > w(comma) && w(comma) > w(plain) ? null : `веса ${w(plain)}, ${w(comma)}, ${w(dot)}`;
});

check("«назад» уходит в начало предложения, повторно — в предыдущее", () => {
  const tokens = rsvp.tokensFromLines(rsvp.linesFromItems([item("Раз два. Три четыре пять.", 50, 700)]), 1);
  const a = rsvp.prevSentence(tokens, 4);  // «пять.» → «Три»
  const b = rsvp.prevSentence(tokens, a);  // «Три» → «Раз»
  return a === 2 && b === 0 ? null : `получили ${a} и ${b}`;
});

check("«читать отсюда» находит выделение, даже с середины слова", () => {
  const tokens = rsvp.tokensFromLines(rsvp.linesFromItems([item("Глава первая. Мысль о главном пришла поздно.", 50, 700)]), 1);
  const i = rsvp.findTextOffset(tokens, "ысль о главном");
  return i === 2 ? null : `нашли ${i}`;
});

check("подсказка скорости: два хороших захода — быстрее, провал — медленнее", () => {
  const good = { comprehension: 5, seconds: 600, wpm: 300, targetWpm: 300 };
  const bad = { comprehension: 2, seconds: 600, wpm: 400, targetWpm: 400 };
  const up = rsvp.suggestWpm([good, good], 300);
  const down = rsvp.suggestWpm([bad, good], 400);
  if (up?.wpm !== 350) return `вверх ждали 350, получили ${JSON.stringify(up)}`;
  if (down?.wpm !== 350) return `вниз ждали 350, получили ${JSON.stringify(down)}`;
  return null;
});

console.log(`\nПроверок: ${checked}, провалено: ${failed}`);
process.exit(failed ? 1 : 0);
