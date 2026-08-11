<script setup>
import { ref, computed, onMounted } from "vue";
import {
  fetchRoadmapFeeds,
  updateItem,
  createItem,
  deleteItem,
  FEED_KINDS,
  feedKindMeta,
} from "@/components/roadmapApi.js";
import RoadmapItemModal from "@/components/roadmap/RoadmapItemModal.vue";

// Вкладка «Источники»: блоги, рассылки, подкасты, конференции, каналы, репозитории.
// В процент квартала они не входят — здесь важен факт «подписан и настроен».

const props = defineProps({
  roadmapId: { type: String, required: true },
});

const feeds = ref([]);
const lang = ref("all");
const onlyUnsubscribed = ref(false);
const error = ref("");
const modal = ref(null);

async function load() {
  error.value = "";
  try {
    feeds.value = await fetchRoadmapFeeds(props.roadmapId);
  } catch (e) {
    error.value = e.message || "не удалось загрузить источники";
  }
}

const filtered = computed(() =>
  feeds.value.filter((f) => {
    if (lang.value !== "all" && f.feedLang !== lang.value) return false;
    if (onlyUnsubscribed.value && f.subscribed) return false;
    return true;
  }),
);

const grouped = computed(() => {
  const order = FEED_KINDS.map((k) => k.code);
  const map = new Map();
  for (const feed of filtered.value) {
    const key = feed.feedKind || "other";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(feed);
  }
  return Array.from(map, ([code, items]) => ({ code, meta: feedKindMeta(code), items })).sort(
    (a, b) => order.indexOf(a.code) - order.indexOf(b.code),
  );
});

const subscribedCount = computed(() => feeds.value.filter((f) => f.subscribed).length);

async function toggle(feed) {
  error.value = "";
  try {
    await updateItem(feed.id, { ...feed, subscribed: !feed.subscribed });
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить";
  }
}

function openCreate() {
  modal.value = {
    mode: "create",
    item: { type: "feed", tier: 2, feedKind: "blog", feedLang: "ru", groupLabel: "Источники", tags: [] },
  };
}

function openEdit(feed) {
  modal.value = { mode: "edit", item: { ...feed } };
}

async function save(payload) {
  try {
    if (modal.value.mode === "create") await createItem(props.roadmapId, payload);
    else await updateItem(modal.value.item.id, payload);
    modal.value = null;
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить";
  }
}

async function remove() {
  const item = modal.value?.item;
  if (!item?.id || !confirm(`Удалить источник «${item.title}»?`)) return;
  await deleteItem(item.id);
  modal.value = null;
  await load();
}

onMounted(load);
</script>

<template>
  <div>
    <div v-if="error" class="rm-error">{{ error }}</div>

    <div class="rm-row" style="margin: 12px 0">
      <strong>Подписан на {{ subscribedCount }} из {{ feeds.length }}</strong>
      <div class="rm-spacer" />
      <select v-model="lang" class="rm-select">
        <option value="all">Все языки</option>
        <option value="ru">ru</option>
        <option value="en">en</option>
      </select>
      <label class="rm-sub" style="display: flex; align-items: center; gap: 6px">
        <input v-model="onlyUnsubscribed" type="checkbox" /> только неподписанные
      </label>
      <button class="rm-btn is-small" @click="openCreate">＋ Источник</button>
    </div>

    <div v-if="!filtered.length" class="rm-empty">Ничего не нашлось под фильтром.</div>

    <template v-for="group in grouped" :key="group.code">
      <div class="rm-group-title">{{ group.meta.emoji }} {{ group.meta.label }}</div>
      <div class="rm-feeds">
        <div
          v-for="feed in group.items"
          :key="feed.id"
          class="rm-feed"
          :class="{ 'is-subscribed': feed.subscribed }"
        >
          <div class="rm-row">
            <span>{{ feed.emoji || group.meta.emoji }}</span>
            <strong style="flex: 1; font-size: 14px">{{ feed.title }}</strong>
            <span class="rm-chip">{{ feed.feedLang }}</span>
          </div>
          <div v-if="feed.author" class="rm-sub">{{ feed.author }}</div>
          <div v-if="feed.description" class="rm-sub">{{ feed.description }}</div>
          <a v-if="feed.url" :href="feed.url" target="_blank" rel="noopener">{{ feed.url }}</a>
          <div class="rm-row">
            <button class="rm-btn is-small" @click="toggle(feed)">
              {{ feed.subscribed ? "✓ Подписан" : "Отметить подписку" }}
            </button>
            <button class="rm-btn is-small" @click="openEdit(feed)">✎</button>
          </div>
        </div>
      </div>
    </template>

    <RoadmapItemModal
      v-if="modal"
      :item="modal.item"
      :mode="modal.mode"
      :quarters="[]"
      @close="modal = null"
      @save="save"
      @delete="remove"
    />
  </div>
</template>
