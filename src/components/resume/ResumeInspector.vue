<script setup>
import { ref, computed, watch } from "vue";
import {
  STATUSES,
  LINK_TYPES,
  linkTypeTitle,
  searchLinkTargets,
  addBulletLink,
  addEntryLink,
  deleteLink,
  setBulletStatus,
  setEntryStatus,
  promoteBullet,
  updateBullet,
  updateEntry,
} from "@/components/resumeApi.js";
import ResumeSpawnDialog from "@/components/resume/ResumeSpawnDialog.vue";

// Панель «Связи» — всё про выделенную строку или блок: статус, дедлайн,
// целевой текст, связи и их состояние.
//
// Автоперевода план → факт здесь нет и не будет: закрытие связанных пунктов
// лишь подсвечивает строку как готовую, решает человек.

const props = defineProps({
  item: { type: Object, default: null },
  itemKind: { type: String, default: "bullet" }, // bullet | entry
});

const emit = defineEmits(["changed"]);

const query = ref("");
const searchType = ref("roadmap_item");
const results = ref([]);
const searching = ref(false);
const error = ref("");
const spawnKind = ref("");

const isBullet = computed(() => props.itemKind === "bullet");
const links = computed(() => props.item?.links || []);
const ready = computed(
  () =>
    props.item &&
    props.item.status !== "fact" &&
    links.value.length > 0 &&
    props.item.linksDone === links.value.length,
);

watch(
  () => props.item?.id,
  () => {
    results.value = [];
    query.value = "";
    error.value = "";
  },
);

async function run(action) {
  error.value = "";
  try {
    await action();
    emit("changed");
  } catch (e) {
    error.value = e.message;
  }
}

function setStatus(code) {
  const body = { status: code, deadline: props.item.deadline || null };
  return run(() =>
    isBullet.value ? setBulletStatus(props.item.id, body) : setEntryStatus(props.item.id, body),
  );
}

function setDeadline(event) {
  const value = event.target.value || null;
  return run(() =>
    isBullet.value
      ? setBulletStatus(props.item.id, { status: props.item.status, deadline: value })
      : setEntryStatus(props.item.id, { status: props.item.status, deadline: value }),
  );
}

function saveField(field, event) {
  const value = event.target.value;
  const patch = isBullet.value
    ? {
        sectionId: props.item.sectionId,
        entryId: props.item.entryId,
        groupLabel: props.item.groupLabel,
        text: props.item.text,
        textTarget: props.item.textTarget,
        note: props.item.note,
        status: props.item.status,
        deadline: props.item.deadline || null,
        hidden: props.item.hidden,
        sortOrder: props.item.sortOrder,
      }
    : {
        title: props.item.title,
        organization: props.item.organization,
        location: props.item.location,
        dateStart: props.item.dateStart || null,
        dateEnd: props.item.dateEnd || null,
        isCurrent: props.item.isCurrent,
        url: props.item.url,
        description: props.item.description,
        status: props.item.status,
        deadline: props.item.deadline || null,
        note: props.item.note,
        hidden: props.item.hidden,
        sortOrder: props.item.sortOrder,
      };
  patch[field] = value;
  return run(() =>
    isBullet.value ? updateBullet(props.item.id, patch) : updateEntry(props.item.id, patch),
  );
}

async function search() {
  searching.value = true;
  error.value = "";
  try {
    results.value = await searchLinkTargets(query.value, [searchType.value]);
  } catch (e) {
    error.value = e.message;
  } finally {
    searching.value = false;
  }
}

function attach(target) {
  const body = { targetType: target.type, targetId: target.id };
  return run(async () => {
    if (isBullet.value) await addBulletLink(props.item.id, body);
    else await addEntryLink(props.item.id, body);
    results.value = results.value.filter((r) => r.id !== target.id);
  });
}

const detach = (linkId) => run(() => deleteLink(linkId));
const promote = () => run(() => promoteBullet(props.item.id));

function onSpawned() {
  spawnKind.value = "";
  emit("changed");
}
</script>

<template>
  <div v-if="!item" class="rs-sub">Выберите строку на листе, чтобы увидеть её связи.</div>

  <div v-else>
    <div class="rs-row" style="margin-bottom: 10px">
      <button
        v-for="status in STATUSES"
        :key="status.code"
        class="rs-btn is-small"
        :class="{ 'is-active': item.status === status.code }"
        :style="item.status === status.code ? { borderColor: status.color, color: status.color } : {}"
        @click="setStatus(status.code)"
      >
        {{ status.title }}
      </button>
    </div>

    <div v-if="item.status !== 'fact'" class="rs-field">
      <label class="rs-label">Дедлайн</label>
      <input class="rs-input" type="date" :value="item.deadline || ''" @change="setDeadline" />
      <div v-if="item.overdue" class="rs-error" style="margin-top: 4px">Просрочено</div>
    </div>

    <div v-if="isBullet" class="rs-field">
      <label class="rs-label">Как будет звучать, когда закончу</label>
      <textarea
        class="rs-textarea"
        :value="item.textTarget"
        placeholder="Формулировка на будущее — в экспорт не идёт"
        @change="saveField('textTarget', $event)"
      />
    </div>

    <div class="rs-field">
      <label class="rs-label">Заметка (никогда не экспортируется)</label>
      <textarea class="rs-textarea" :value="item.note" @change="saveField('note', $event)" />
    </div>

    <div v-if="ready" class="rs-card" style="border-color: rgba(34, 197, 94, 0.5); margin-bottom: 12px">
      <div>Все связи закрыты — возможно, пора перевести в факт.</div>
      <button v-if="isBullet" class="rs-btn is-primary" @click="promote">
        Перевести в факт
      </button>
    </div>

    <h4>Связи ({{ item.linksDone }}/{{ links.length }})</h4>
    <div v-if="!links.length" class="rs-sub">
      Пока ни к чему не привязано. Привяжите к пунктам roadmap — тогда видно, чем план подкреплён.
    </div>
    <div v-for="link in links" :key="link.id" class="rs-link-row">
      <span class="rs-dot" :class="{ 'is-done': link.done }" />
      <span class="rs-link-title" :title="link.targetTitle">
        {{ link.targetTitle }}
        <span class="rs-sub">— {{ linkTypeTitle(link.targetType) }}</span>
      </span>
      <span v-if="!link.missing" class="rs-sub">{{ Math.round(link.progress) }}%</span>
      <button class="rs-btn is-small is-danger" @click="detach(link.id)">×</button>
    </div>

    <h4 style="margin-top: 14px">Привязать</h4>
    <div class="rs-row" style="margin-bottom: 8px">
      <select v-model="searchType" class="rs-select" style="flex: 1">
        <option v-for="type in LINK_TYPES" :key="type.code" :value="type.code">
          {{ type.title }}
        </option>
      </select>
    </div>
    <div class="rs-row" style="margin-bottom: 8px">
      <input
        v-model="query"
        class="rs-input"
        style="flex: 1"
        placeholder="поиск"
        @keyup.enter="search"
      />
      <button class="rs-btn" :disabled="searching" @click="search">Найти</button>
    </div>
    <div v-for="target in results" :key="target.type + target.id" class="rs-link-row">
      <span class="rs-dot" :class="{ 'is-done': target.done }" />
      <span class="rs-link-title" :title="target.title">{{ target.title }}</span>
      <button class="rs-btn is-small" @click="attach(target)">+</button>
    </div>

    <template v-if="isBullet">
      <h4 style="margin-top: 14px">Создать из строки</h4>
      <div class="rs-row">
        <button class="rs-btn" @click="spawnKind = 'roadmap'">Пункт roadmap</button>
        <button class="rs-btn" @click="spawnKind = 'task'">Задачу</button>
      </div>
    </template>

    <div v-if="error" class="rs-error" style="margin-top: 10px">{{ error }}</div>

    <ResumeSpawnDialog
      v-if="spawnKind"
      :bullet="item"
      :kind="spawnKind"
      @close="spawnKind = ''"
      @created="onSpawned"
    />
  </div>
</template>
