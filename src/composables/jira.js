// Коды задач Jira в названиях: «EOC-758», «UZCL - 709», «uzcl 709», «IND2-6065».
// По коду открываем задачу в своей Jira — у Эсхаты и у 2pp они разные.

const ESKHATA = "https://jira.eskhata.com/browse/";
const TWO_PP = "https://jira.2pp.dev/browse/";

// Известные проекты: их ловим в любом написании — регистр, пробелы вокруг
// дефиса, дефис можно не ставить вовсе. Новый проект — одна строка здесь.
const PROJECTS = {
  EOC: ESKHATA,
  UZCL: TWO_PP,
  BPMP: TWO_PP,
  IND2: TWO_PP,
};

// Незнакомый проект берём только в строгом виде «ABC-123» и ведём в 2pp:
// там проектов много и появляются новые. Строгость — чтобы «Тема 8» и
// подобное не превращались в ссылки.
const FALLBACK = TWO_PP;

// Кириллица, похожая на латиницу: код могли набрать в русской раскладке
// («ЕОС-758» на вид не отличить от «EOC-758»).
const LOOKALIKE = { А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y" };

// Только заглавные и только для известных проектов: иначе обычное «Тема-8»
// стало бы «TEMA-8» и ссылкой в никуда.
function latinize(text) {
  return text.replace(/[АВЕКМНОРСТХУ]/g, (ch) => LOOKALIKE[ch]);
}

// Без lookbehind: старый Safari на iOS его не знает, и модуль падал бы целиком.
// Граница слова слева — отдельной группой (начало строки или не буква/цифра).
const known = new RegExp(
  `(^|[^A-Za-z0-9])(${Object.keys(PROJECTS).join("|")})\\s*[-–—]?\\s*(\\d+)`,
  "gi",
);
const strict = /(^|[^A-Za-z0-9])([A-Z][A-Z0-9]{1,9})-(\d+)/g;

// jiraLinks — все коды из текста (или нескольких текстов) без повторов,
// в порядке появления: [{ key: "EOC-758", url }].
export function jiraLinks(...texts) {
  const found = new Map();
  for (const raw of texts) {
    if (!raw) continue;
    const text = String(raw);
    for (const m of latinize(text).matchAll(known)) {
      const project = m[2].toUpperCase();
      const key = `${project}-${m[3]}`;
      if (!found.has(key)) found.set(key, { key, url: PROJECTS[project] + key });
    }
    for (const m of text.matchAll(strict)) {
      const key = `${m[2]}-${m[3]}`;
      if (!found.has(key) && !PROJECTS[m[2]]) found.set(key, { key, url: FALLBACK + key });
    }
  }
  return Array.from(found.values());
}
