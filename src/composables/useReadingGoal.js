import { ref, computed, unref, watch, isRef } from "vue";

// Цель на текущую сессию чтения — docs/pdf-library.md (back-m).
//
// Хранится в sessionStorage и нигде больше: это намерение, а не обязательство.
// Закрыл вкладку — цели нет; перезагрузил читалку по F5 или ушёл из карточки
// книги в читалку — цель на месте, иначе поставить её было бы негде.
//
// Цель одна на всю вкладку: читают по одной книге за раз, а две «текущие
// сессии» одновременно — это уже не намерение, а список задач.

const KEY = "pdfSessionGoal";

function readStored() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.fileId || !(parsed.pages > 0)) return null;
    return parsed;
  } catch {
    // Приватный режим Safari бросается на первом же обращении к хранилищу.
    return null;
  }
}

function writeStored(value) {
  try {
    if (value) sessionStorage.setItem(KEY, JSON.stringify(value));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* цель переживёт и без хранилища — до перезагрузки страницы */
  }
}

const goal = ref(readStored());

export function setSessionGoal(fileId, pages, fromPage) {
  const count = Math.floor(Number(pages) || 0);
  if (!fileId || count <= 0) {
    clearSessionGoal();
    return;
  }
  const from = Math.max(1, Math.floor(Number(fromPage) || 1));
  // Та же цель — не трогаем: setAt начинает отсчёт заново, и открытая заново
  // панель обнуляла бы уже прочитанные страницы.
  const current = goal.value;
  if (current && current.fileId === fileId && current.pages === count && current.fromPage === from) {
    return;
  }
  goal.value = { fileId, pages: count, fromPage: from, setAt: Date.now() };
  writeStored(goal.value);
}

export function clearSessionGoal() {
  goal.value = null;
  writeStored(null);
}

// fileId — строка или ref. currentPage нужен только читалке: карточка книги
// цель ставит, а отсчитывает её тот, кто листает.
export function useSessionGoal(fileId, currentPage = null) {
  const active = computed(() => {
    const id = unref(fileId);
    return id && goal.value?.fileId === id ? goal.value : null;
  });

  // Докуда добрались за сессию. Только вперёд: возврат к оглавлению не должен
  // обнулять цель — ровно так же считает прогресс и сам план (roadmap_pdf.go).
  const maxSeen = ref(active.value?.fromPage || 0);

  if (isRef(currentPage)) {
    watch(
      [currentPage, active],
      () => {
        const from = active.value?.fromPage || 0;
        if (maxSeen.value < from) maxSeen.value = from;
        maxSeen.value = Math.max(maxSeen.value, currentPage.value || 0);
      },
      { immediate: true },
    );
    // Новая цель или другая книга — новый отсчёт. Без сброса по книге цель
    // засчиталась бы чужими страницами: открыл вторую книгу, долистал до
    // трёхсотой, вернулся к первой — и «цель взята» на пустом месте.
    watch(
      [() => unref(fileId), () => active.value?.setAt],
      () => {
        maxSeen.value = Math.max(active.value?.fromPage || 0, currentPage.value || 0);
      },
    );
  }

  const pagesRead = computed(() => {
    if (!active.value) return 0;
    return Math.max(0, Math.min(active.value.pages, maxSeen.value - active.value.fromPage));
  });

  const done = computed(() => !!active.value && pagesRead.value >= active.value.pages);

  return {
    goal: active,
    pagesRead,
    remaining: computed(() => (active.value ? active.value.pages - pagesRead.value : 0)),
    done,
    setPages: (pages, fromPage) => setSessionGoal(unref(fileId), pages, fromPage),
    clear: clearSessionGoal,
  };
}
