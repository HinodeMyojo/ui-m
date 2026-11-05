// Откуда строка дисциплины берёт отметку. Пороги — в единицах источника,
// умолчания те же, что на сервере (discipline_sources.go, back-m).
// Приложения — docs/apps-protocol.md (back-m).
import { fetchApps } from "@/components/api.js";
import { fetchJpStudies } from "@/components/japaneseApi.js";

function sessions(n) {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return `${n} сессия`;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return `${n} сессии`;
  return `${n} сессий`;
}

// describe — подпись уровня по порогу: «2 сессии», «50% плана».
export const DISCIPLINE_SOURCES = [
  { value: "", label: "Отмечаю руками" },
  { value: "app", label: "Считать: сессии в приложении", unit: "сессий", defaults: [2, 3, 5], describe: sessions },
  { value: "sport", label: "Считать: план тренировок", unit: "% плана", defaults: [50, 75, 100], describe: (n) => `${n}% плана` },
  { value: "reading", label: "Считать: страницы книги уровня", unit: "стр.", defaults: [10, 20, 40], describe: (n) => `${n} стр.` },
];

export const sourceOf = (value) =>
  DISCIPLINE_SOURCES.find((x) => x.value === (value || "")) || DISCIPLINE_SOURCES[0];

// Ссылка на приложение: «ключ» или «ключ:курс».
export function parseAppRef(ref) {
  const [app = "", ...rest] = (ref || "").split(":");
  return { app, course: rest.join(":") };
}

export const appRef = (app, course) => (course ? `${app}:${course}` : app);

// Строки, заведённые до протокола, считали японский источником japanese.
// Сервер понимает их по-прежнему, а в редакторе они выглядят приложением
// «Японский» и при сохранении переписываются на него.
export function normalizeSource(row) {
  if (row.source !== "japanese") return row;
  return { ...row, source: "app", sourceRef: appRef("japanese", row.sourceRef || "") };
}

// Список приложений и курсов японского нужен каждой строке редактора —
// грузим один раз. Неудачу не запоминаем: следующий редактор спросит снова.
let catalog = null;

export function loadSourceCatalog() {
  catalog ||= Promise.all([fetchApps(), fetchJpStudies()])
    .then(([apps, studies]) => ({ apps: apps || [], studies: studies || [] }))
    .catch((e) => {
      catalog = null;
      throw e;
    });
  return catalog;
}
