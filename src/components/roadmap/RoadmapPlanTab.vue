<script setup>
import { ref, computed, watch } from "vue";
import confetti from "canvas-confetti";
import {
  percent,
  shortMonth,
  formatHours,
  reorderItems,
  createQuarter,
  updateQuarter,
  deleteQuarter,
  createBenchmark,
  updateBenchmark,
  deleteBenchmark,
  createItem,
  updateItem,
  deleteItem,
} from "@/components/roadmapApi.js";
import RoadmapItemPanel from "@/components/roadmap/RoadmapItemPanel.vue";
import RoadmapItemModal from "@/components/roadmap/RoadmapItemModal.vue";
import RoadmapQuarterModal from "@/components/roadmap/RoadmapQuarterModal.vue";

// Вкладка «План»: таймлайн кварталов → список пунктов квартала → панель деталей.
// docs/roadmap-module.md, раздел 5.1

const props = defineProps({
  roadmap: { type: Object, required: true },
});
const emit = defineEmits(["changed"]);

const BACKLOG = "backlog";

const selectedQuarterId = ref("");
const selectedItemId = ref("");
const onlyCore = ref(false);
const error = ref("");
const itemModal = ref(null); // { mode: 'create'|'edit', item }
const quarterModal = ref(null);
const dragItemId = ref("");
const dropGroup = ref("");
const closedShown = ref(new Set());

// Открываем на текущем квартале — в 90% случаев нужен именно он.
watch(
  () => props.roadmap,
  (roadmap) => {
    if (!roadmap) return;
    const known = roadmap.quarters.some((q) => q.id === selectedQuarterId.value);
    if (!known && selectedQuarterId.value !== BACKLOG) {
      const current = roadmap.quarters.find((q) => q.isCurrent) || roadmap.quarters[0];
      selectedQuarterId.value = current ? current.id : BACKLOG;
    }
    // Закрылся квартал — отмечаем это один раз, а не на каждой перезагрузке данных.
    for (const q of roadmap.quarters) {
      if (q.closed && !closedShown.value.has(q.id)) {
        closedShown.value.add(q.id);
        if (closedShown.value.size > 1 || q.isCurrent) {
          confetti({ particleCount: 120, spread: 70, origin: { y: 0.7 } });
        }
      }
    }
  },
  { immediate: true },
);

const selectedQuarter = computed(() =>
  props.roadmap.quarters.find((q) => q.id === selectedQuarterId.value) || null,
);

const visibleItems = computed(() => {
  // Сертификации живут на своей вкладке — в бэклоге они только шумят.
  const items = selectedQuarterId.value === BACKLOG
    ? props.roadmap.backlog.filter((i) => i.type !== "cert")
    : selectedQuarter.value?.items || [];
  return onlyCore.value ? items.filter((i) => i.tier === 1) : items;
});

// Пункты сгруппированы так же, как в исходном документе: «Э1 — ядро», «Э1 — домен»…
const groups = computed(() => {
  const map = new Map();
  for (const item of visibleItems.value) {
    const key = item.groupLabel || "Без группы";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return Array.from(map, ([label, items]) => ({ label, items }));
});

const selectedItem = computed(() => {
  for (const group of groups.value) {
    const found = group.items.find((i) => i.id === selectedItemId.value);
    if (found) return found;
  }
  return null;
});

function itemClasses(item) {
  return {
    "is-selected": item.id === selectedItemId.value,
    "is-done": item.status === "done",
    "is-skipped": item.status === "skipped",
    "is-dim": onlyCore.value ? false : item.tier === 3,
    "is-dragging": item.id === dragItemId.value,
  };
}

function progressLabel(item) {
  if (item.status === "skipped") return "пропущен";
  if (item.progressTotal > 0) {
    return `${item.progressCurrent}/${item.progressTotal} ${item.progressUnit || ""}`.trim();
  }
  if (item.status === "done") return "готово";
  if (item.taskProgress !== null && item.taskProgress !== undefined) {
    return `задача ${percent(item.taskProgress)}`;
  }
  if (item.subItems?.length) {
    const done = item.subItems.filter((s) => s.done).length;
    return `${done}/${item.subItems.length} пунктов`;
  }
  return item.status === "in_progress" ? "в процессе" : "не начат";
}

// --- Drag'n'drop: перенос между группами и кварталами ---

function onDragStart(item) {
  dragItemId.value = item.id;
}

function onDragEnd() {
  dragItemId.value = "";
  dropGroup.value = "";
}

async function onDropToGroup(groupLabel) {
  const id = dragItemId.value;
  onDragEnd();
  if (!id) return;
  await move(id, selectedQuarterId.value, groupLabel);
}

async function onDropToQuarter(quarterId) {
  const id = dragItemId.value;
  onDragEnd();
  if (!id || quarterId === selectedQuarterId.value) return;
  await move(id, quarterId, null);
}

async function move(id, quarterTarget, groupLabel) {
  error.value = "";
  try {
    await reorderItems([
      {
        id,
        quarterId: quarterTarget === BACKLOG ? null : quarterTarget,
        groupLabel,
        sortOrder: 0,
      },
    ]);
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось перенести пункт";
  }
}

// --- CRUD пунктов ---

function openCreate() {
  itemModal.value = {
    mode: "create",
    item: {
      quarterId: selectedQuarterId.value === BACKLOG ? null : selectedQuarterId.value,
      type: "book",
      tier: 1,
      groupLabel: groups.value[0]?.label || "",
      status: "planned",
      tags: [],
    },
  };
}

function openEdit(item) {
  itemModal.value = { mode: "edit", item: { ...item } };
}

async function saveItem(payload) {
  error.value = "";
  try {
    if (itemModal.value.mode === "create") await createItem(props.roadmap.id, payload);
    else await updateItem(itemModal.value.item.id, payload);
    itemModal.value = null;
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось сохранить пункт";
  }
}

async function removeItem() {
  const item = itemModal.value?.item;
  if (!item?.id) return;
  if (!confirm(`Удалить «${item.title}» вместе с сессиями и конспектом?`)) return;
  await deleteItem(item.id);
  itemModal.value = null;
  if (selectedItemId.value === item.id) selectedItemId.value = "";
  emit("changed");
}

// --- CRUD кварталов ---

function openQuarterCreate() {
  quarterModal.value = {
    mode: "create",
    quarter: { number: props.roadmap.quarters.length + 1, monthsSpan: 3, title: "" },
  };
}

function openQuarterEdit() {
  if (!selectedQuarter.value) return;
  quarterModal.value = { mode: "edit", quarter: { ...selectedQuarter.value } };
}

async function saveQuarter(payload) {
  error.value = "";
  try {
    if (quarterModal.value.mode === "create") await createQuarter(props.roadmap.id, payload);
    else await updateQuarter(quarterModal.value.quarter.id, payload);
    quarterModal.value = null;
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось сохранить квартал";
  }
}

async function removeQuarter() {
  const quarter = quarterModal.value?.quarter;
  if (!quarter?.id) return;
  if (!confirm(`Удалить квартал «${quarter.title}»? Пункты уйдут в бэклог, прогресс сохранится.`)) return;
  await deleteQuarter(quarter.id);
  quarterModal.value = null;
  selectedQuarterId.value = BACKLOG;
  emit("changed");
}

// --- Бенчмарки ---

const benchmarkDraft = ref("");

async function toggleBenchmark(benchmark) {
  await updateBenchmark(benchmark.id, {
    title: benchmark.title,
    done: !benchmark.done,
    sortOrder: benchmark.sortOrder,
  });
  emit("changed");
}

async function addBenchmark() {
  const title = benchmarkDraft.value.trim();
  if (!title || !selectedQuarter.value) return;
  await createBenchmark(selectedQuarter.value.id, {
    title,
    sortOrder: selectedQuarter.value.benchmarks.length,
  });
  benchmarkDraft.value = "";
  emit("changed");
}

async function removeBenchmark(benchmark) {
  await deleteBenchmark(benchmark.id);
  emit("changed");
}
</script>

<template>
  <div>
    <div v-if="error" class="rm-error">{{ error }}</div>

    <div class="rm-timeline">
      <button
        v-for="q in roadmap.quarters"
        :key="q.id"
        class="rm-quarter"
        :class="{
          'is-selected': q.id === selectedQuarterId,
          'is-current': q.isCurrent,
          'is-closed': q.closed,
        }"
        @click="selectedQuarterId = q.id"
        @dragover.prevent
        @drop.prevent="onDropToQuarter(q.id)"
      >
        <div class="rm-quarter-top">
          <strong>Q{{ q.number }}</strong>
          <span>{{ percent(q.progress) }}</span>
        </div>
        <div class="rm-quarter-title">{{ q.title }}</div>
        <div class="rm-bar">
          <div
            class="rm-bar-fill"
            :class="{ 'is-ok': q.closed }"
            :style="{ width: percent(q.progress) }"
          />
          <div class="rm-bar-mark" :style="{ left: percent(q.timeProgress) }" />
        </div>
        <div class="rm-quarter-dates">
          {{ shortMonth(q.startDate) }} — {{ shortMonth(q.endDate) }}
          <template v-if="q.extraTotal"> · доп. {{ q.extraDone }}/{{ q.extraTotal }}</template>
        </div>
      </button>

      <button
        class="rm-quarter"
        :class="{ 'is-selected': selectedQuarterId === BACKLOG }"
        @click="selectedQuarterId = BACKLOG"
        @dragover.prevent
        @drop.prevent="onDropToQuarter(BACKLOG)"
      >
        <div class="rm-quarter-top">
          <strong>Бэклог</strong>
          <span>{{ roadmap.backlog.length }}</span>
        </div>
        <div class="rm-quarter-title">После года и то, что решено пропустить</div>
      </button>
    </div>

    <div class="rm-body">
      <div>
        <div class="rm-row" style="margin-top: 12px">
          <strong v-if="selectedQuarter">
            Q{{ selectedQuarter.number }} · {{ selectedQuarter.title }}
          </strong>
          <strong v-else>Бэклог</strong>
          <span v-if="selectedQuarter" class="rm-sub">
            {{ formatHours(selectedQuarter.hoursSpent) }} вложено
          </span>
          <div class="rm-spacer" />
          <label class="rm-sub" style="display: flex; align-items: center; gap: 6px">
            <input v-model="onlyCore" type="checkbox" /> только Э1
          </label>
          <button class="rm-btn is-small" @click="openCreate">＋ Пункт</button>
          <button v-if="selectedQuarter" class="rm-btn is-small" @click="openQuarterEdit">
            ✎ Квартал
          </button>
          <button class="rm-btn is-small" @click="openQuarterCreate">＋ Квартал</button>
        </div>

        <div v-if="!groups.length" class="rm-empty">Пунктов здесь пока нет.</div>

        <template v-for="group in groups" :key="group.label">
          <div
            class="rm-group-title"
            @dragover.prevent="dropGroup = group.label"
            @drop.prevent="onDropToGroup(group.label)"
          >
            {{ group.label }}
          </div>
          <div
            class="rm-list"
            @dragover.prevent="dropGroup = group.label"
            @drop.prevent="onDropToGroup(group.label)"
          >
            <div
              v-for="item in group.items"
              :key="item.id"
              class="rm-item"
              :class="itemClasses(item)"
              draggable="true"
              @dragstart="onDragStart(item)"
              @dragend="onDragEnd"
              @click="selectedItemId = item.id"
              @dblclick="openEdit(item)"
            >
              <span class="rm-item-emoji">{{ item.emoji || "📎" }}</span>
              <div class="rm-item-main">
                <div class="rm-item-title">{{ item.title }}</div>
                <div class="rm-item-meta">
                  <template v-if="item.author">{{ item.author }} · </template>
                  <template v-if="item.edition">{{ item.edition }} · </template>
                  <template v-if="item.estimateHours">~{{ item.estimateHours }} ч</template>
                </div>
              </div>
              <span class="rm-tier" :class="{ 'is-core': item.tier === 1 }">Э{{ item.tier }}</span>
              <div class="rm-item-progress">
                <div class="rm-bar">
                  <div
                    class="rm-bar-fill"
                    :class="{ 'is-ok': item.status === 'done' }"
                    :style="{ width: percent(item.progress) }"
                  />
                </div>
                <small>{{ progressLabel(item) }}</small>
              </div>
            </div>
          </div>
        </template>

        <div v-if="selectedQuarter" class="rm-card" style="margin-top: 18px">
          <h4 style="margin: 0 0 8px; font-size: 13px">
            Бенчмарки квартала —
            {{ selectedQuarter.benchmarks.filter((b) => b.done).length }} /
            {{ selectedQuarter.benchmarks.length }}
          </h4>
          <div
            v-for="b in selectedQuarter.benchmarks"
            :key="b.id"
            class="rm-benchmark"
            :class="{ 'is-done': b.done }"
          >
            <input type="checkbox" :checked="b.done" @change="toggleBenchmark(b)" />
            <span style="flex: 1">{{ b.title }}</span>
            <button class="rm-btn is-small is-danger" @click="removeBenchmark(b)">✕</button>
          </div>
          <div class="rm-row" style="margin-top: 8px">
            <input
              v-model="benchmarkDraft"
              class="rm-input"
              style="flex: 1"
              placeholder="Новый критерий завершения квартала"
              @keyup.enter="addBenchmark"
            />
            <button class="rm-btn is-small" @click="addBenchmark">Добавить</button>
          </div>
          <p class="rm-sub" style="margin: 8px 0 0">
            Квартал закрыт, когда все Э1-пункты доведены и все бенчмарки отмечены. Э2/Э3
            в процент не входят.
          </p>
        </div>
      </div>

      <RoadmapItemPanel
        v-if="selectedItem"
        :item="selectedItem"
        @changed="emit('changed')"
        @edit="openEdit(selectedItem)"
      />
      <div v-else class="rm-panel">
        <p class="rm-sub">
          Выберите пункт слева — здесь появятся прогресс, конспект, сессии чтения и
          связки с PDF и задачами. Двойной клик по пункту открывает редактирование,
          перетаскивание меняет группу или квартал.
        </p>
      </div>
    </div>

    <RoadmapItemModal
      v-if="itemModal"
      :item="itemModal.item"
      :mode="itemModal.mode"
      :quarters="roadmap.quarters"
      @close="itemModal = null"
      @save="saveItem"
      @delete="removeItem"
    />

    <RoadmapQuarterModal
      v-if="quarterModal"
      :quarter="quarterModal.quarter"
      :mode="quarterModal.mode"
      @close="quarterModal = null"
      @save="saveQuarter"
      @delete="removeQuarter"
    />
  </div>
</template>
