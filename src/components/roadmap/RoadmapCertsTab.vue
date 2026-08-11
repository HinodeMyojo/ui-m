<script setup>
import { ref, computed, onMounted } from "vue";
import {
  fetchRoadmapBacklog,
  updateItem,
  createItem,
  deleteItem,
  CERT_VERDICTS,
  statusMeta,
} from "@/components/roadmapApi.js";
import RoadmapItemModal from "@/components/roadmap/RoadmapItemModal.vue";

// Сводная таблица сертификаций: цена, трудозатраты, ценность, вердикт.
// Сертификации живут вне кварталов, поэтому берём их из бэклога.

const props = defineProps({
  roadmapId: { type: String, required: true },
});

const certs = ref([]);
const error = ref("");
const modal = ref(null);

async function load() {
  error.value = "";
  try {
    const backlog = await fetchRoadmapBacklog(props.roadmapId);
    certs.value = backlog.filter((i) => i.type === "cert");
  } catch (e) {
    error.value = e.message || "не удалось загрузить сертификации";
  }
}

const grouped = computed(() => {
  const order = ["take", "optional", "skip", ""];
  return [...certs.value].sort(
    (a, b) => order.indexOf(a.certVerdict || "") - order.indexOf(b.certVerdict || ""),
  );
});

function verdictMeta(code) {
  return CERT_VERDICTS.find((v) => v.code === code) || { label: "—", color: "#7a7f8e" };
}

async function setVerdict(cert, verdict) {
  await updateItem(cert.id, { ...cert, certVerdict: verdict });
  await load();
}

async function togglePassed(cert) {
  const status = cert.status === "done" ? "planned" : "done";
  await updateItem(cert.id, { ...cert, status });
  await load();
}

function openCreate() {
  modal.value = {
    mode: "create",
    item: { type: "cert", tier: 3, groupLabel: "Сертификации", status: "planned", tags: [] },
  };
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
  if (!item?.id || !confirm(`Удалить «${item.title}»?`)) return;
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
      <strong>Сертификации</strong>
      <span class="rm-sub">
        книги, pet-проекты и чтение первоисточников дают больше, чем сертификаты
      </span>
      <div class="rm-spacer" />
      <button class="rm-btn is-small" @click="openCreate">＋ Сертификация</button>
    </div>

    <div v-if="!certs.length" class="rm-empty">Ни одной не заведено.</div>

    <div v-for="cert in grouped" :key="cert.id" class="rm-card" style="margin-bottom: 8px">
      <div class="rm-row">
        <span>{{ cert.emoji || "🎖️" }}</span>
        <strong style="flex: 1">{{ cert.title }}</strong>
        <span
          class="rm-chip"
          :style="{ color: verdictMeta(cert.certVerdict).color, borderColor: verdictMeta(cert.certVerdict).color }"
        >
          {{ verdictMeta(cert.certVerdict).label }}
        </span>
        <span class="rm-chip" :style="{ color: statusMeta(cert.status).color }">
          {{ statusMeta(cert.status).label }}
        </span>
      </div>

      <div class="rm-sub" style="margin-top: 6px">
        <template v-if="cert.certCost">💸 {{ cert.certCost }} · </template>
        <template v-if="cert.certEffort">⏱️ {{ cert.certEffort }}</template>
      </div>
      <div v-if="cert.certValue" class="rm-desc" style="margin-top: 4px">{{ cert.certValue }}</div>
      <div v-if="cert.skipReason" class="rm-sub" style="margin-top: 4px">
        Пропущена: {{ cert.skipReason }}
      </div>

      <div class="rm-row" style="margin-top: 8px">
        <select class="rm-select" :value="cert.certVerdict || ''" @change="setVerdict(cert, $event.target.value)">
          <option value="">вердикт не задан</option>
          <option v-for="v in CERT_VERDICTS" :key="v.code" :value="v.code">{{ v.label }}</option>
        </select>
        <button class="rm-btn is-small" @click="togglePassed(cert)">
          {{ cert.status === "done" ? "✓ Сдана" : "Отметить сданной" }}
        </button>
        <button class="rm-btn is-small" @click="modal = { mode: 'edit', item: { ...cert } }">✎</button>
      </div>
    </div>

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
