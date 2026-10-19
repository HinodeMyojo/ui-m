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

const rsvp = await import("../src/views/pdf-reader/speed/rsvpText.mjs");

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

check("рисунок встаёт в поток на своё место, подписи внутри него не читаются", () => {
  const lines = rsvp.linesFromItems([
    item("Текст над схемой.", 50, 700),
    item("Rules", 120, 600),
    item("Текст под схемой.", 50, 400),
  ]);
  const page = rsvp.analyzePage({ lines, images: [[40, 450, 500, 650]], page: 3 });
  const seq = page.tokens.map((t) => (t.k ? "[" + t.k + "]" : t.t)).join(" ");
  if (seq !== "Текст над схемой. [fig] Текст под схемой.") return `поток «${seq}»`;
  return page.words === 6 ? null : `слов ${page.words}, ждали 6`;
});

check("жирный зачин строки — термин с определением, жирная строка — заголовок", () => {
  const bold = { bold: true, italic: false, mono: false };
  const plain = { bold: false, italic: false, mono: false };
  const fontOf = (name) => (name === "B" ? bold : plain);
  const it = (str, x, y, font, eol) => ({ ...item(str, x, y, { eol }), fontName: font });
  const lines = rsvp.linesFromItems([
    it("Core Systems", 50, 760, "B", true),
    it("Float", 50, 700, "B", false),
    it("is the value earned from money held. More text here.", 90, 700, "R", true),
  ], fontOf);
  const page = rsvp.analyzePage({ lines, page: 1 });
  if (page.headings[0]?.text !== "Core Systems") return `заголовки ${JSON.stringify(page.headings)}`;
  const term = page.terms[0];
  return term?.term === "Float" && term.def === "is the value earned from money held."
    ? null : `термин ${JSON.stringify(term)}`;
});

check("рамка картинки считается по матрицам save/transform/restore", () => {
  const OPS = { save: 1, restore: 2, transform: 3, paintImageXObject: 4, paintFormXObjectBegin: 5, paintFormXObjectEnd: 6 };
  const boxes = rsvp.imageBoxesFromOps(
    [1, 3, 4, 2, 1, 3, 4, 2],
    [null, [400, 0, 0, 300, 50, 100], null, null, null, [10, 0, 0, 10, 0, 0], null, null],
    OPS,
  );
  return boxes.length === 1 && boxes[0].join() === "50,100,450,400" ? null : `рамки ${JSON.stringify(boxes)}`;
});

check("главы — верхний уровень оглавления, пункты на одной странице сливаются", () => {
  const toc = [
    { title: "About", pageNum: 3, level: 0 }, { title: "Thanks!", pageNum: 3, level: 0 },
    { title: "chapter 4 ACH", pageNum: 32, level: 0 }, { title: "ACH Basics", pageNum: 33, level: 1 },
    { title: "Chapter 5 Cards", pageNum: 49, level: 0 },
  ];
  const ch = rsvp.chaptersFromToc(toc, 149);
  const got = ch.map((c) => `${c.key}:${c.start}-${c.end}`).join(" ");
  if (got !== "p3:3-31 p32:32-48 p49:49-149") return got;
  return rsvp.chapterAt(ch, 40)?.key === "p32" ? null : "chapterAt мимо";
});

check("план по дням: остаток книги ровными кусками, даты подряд", () => {
  const plan = rsvp.readingPlan({ fromPage: 13, pageCount: 149, wordsPerPage: 350, wpm: 350, days: 3, today: "2026-10-31" });
  const got = plan.map((d) => `${d.date}:${d.from}-${d.to}:${d.minutes}`).join(" ");
  return got === "2026-10-31:13-58:46 2026-11-01:59-104:46 2026-11-02:105-149:45" ? null : got;
});

check("сдвинутое оглавление чинится по заголовкам в тексте", () => {
  const head = (page, text, h = 27) => ({ page, height: 842, lines: [{ text, h, y: 738 }, { text: "body text", h: 14, y: 600 }, { text: "more", h: 14, y: 580 }] });
  const pages = [head(2, "Payments Systems in the U.S.", 29), head(9, "Payments Systems Overview"), head(32, "Core Systems: Checking"), head(49, "Core Systems: ACH")];
  const fromText = rsvp.chaptersFromHeadings(pages, 149);
  // Как у calibre: ссылки оглавления сдвинуты на главу.
  const toc = [
    { key: "p7", title: "chapter 2 Payments Systems Overview", start: 7, end: 8 },
    { key: "p9", title: "chapter 3 Core Systems: Checking", start: 9, end: 31 },
    { key: "p32", title: "Chapter 4 Core Systems: ACH", start: 32, end: 149 },
  ];
  const got = rsvp.reconcileChapters(toc, fromText).map((c) => `${c.start}:${c.title}`).join(" | ");
  return got === "9:chapter 2 Payments Systems Overview | 32:chapter 3 Core Systems: Checking | 49:Chapter 4 Core Systems: ACH"
    ? null : got;
});

check("жирное начало слова не трогает кавычки и короткие слова", () => {
  const a = rsvp.bionicSplit("«Clearing»,");
  const b = rsvp.bionicSplit("is");
  const got = `${a.lead}|${a.head}|${a.tail} ${b.head}|${b.tail}`;
  return got === "«|Clea|ring», i|s" ? null : got;
});

check("рисунок рядом: сначала ближайший впереди, потом пройденный", () => {
  const t = (k) => (k ? { t: "", k: "fig", p: 1, f: 4 } : { t: "w", p: 1, f: 0 });
  const tokens = [t(true), ...Array(20).fill(0).map(() => t()), t(true), ...Array(5).fill(0).map(() => t())];
  const ahead = rsvp.nearbyBlock(tokens, 10);
  const behind = rsvp.nearbyBlock(tokens, 24);
  if (ahead?.i !== 21 || !ahead.ahead) return `впереди ${JSON.stringify(ahead)}`;
  return behind?.i === 21 && !behind.ahead ? null : `позади ${JSON.stringify(behind)}`;
});

const lookupPure = await import("../src/views/pdf-reader/speed/lookupPure.mjs");
check("словарь: аббревиатура ищется по первым буквам, слово — целым словом", () => {
  const got = [
    lookupPure.pickArticle(["NACHA", "Automated clearing house", "ACH Network"], "ACH"),
    lookupPure.pickArticle(["Payment and settlement systems in India", "Settlement (finance)"], "settlement"),
    lookupPure.pickArticle(["Agricultural value chain", "Value chain"], "value chain"),
    lookupPure.isAcronym("ODFIs") && !lookupPure.isAcronym("Fedwire"),
    lookupPure.cleanWord("“bank’s”"),
  ].join(" | ");
  return got === "Automated clearing house | Settlement (finance) | Value chain | true | bank" ? null : got;
});

console.log(`\nПроверок: ${checked}, провалено: ${failed}`);
process.exit(failed ? 1 : 0);
