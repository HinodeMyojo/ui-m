<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  createHubNode,
  fetchHubFileBlob,
  fetchHubPlan,
  percent,
  reorderHubNodes,
  updateHubNode,
  uploadHubFiles,
} from "@/components/hubApi.js";
import HubTreeNode from "@/components/hub/HubTreeNode.vue";
import HubNodeDrawer from "@/components/hub/HubNodeDrawer.vue";
import HubArtifactViewer from "@/components/hub/HubArtifactViewer.vue";
import HubPlanModal from "@/components/hub/HubPlanModal.vue";

// План из хаба: путь по ступеням (N5 → N4 → N3 🏁), под выбранной ступенью —
// темы, учебники и главы с артефактами. docs/hub-module.md (back-m).

const route = useRoute();
const router = useRouter();

const data = ref(null);
const error = ref("");
const loading = ref(true);
const selectedId = ref("");
const collapsed = reactive({});
const viewerFile = ref(null);
const imageUrl = ref("");
const planModal = ref(false);
const uploading = ref(false);

const planId = computed(() => route.params.id);

async function load() {
  try {
    data.value = await fetchHubPlan(planId.value);
    error.value = "";
    if (!stageId.value || !byId.value[stageId.value]) {
      const active = stages.value.find((s) => s.status === "active") || stages.value.find((s) => s.status !== "done");
      setStage(active?.id || stages.value[0]?.id || "");
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

const plan = computed(() => data.value?.plan || null);
const byId = computed(() => Object.fromEntries((data.value?.nodes || []).map((n) => [n.id, n])));

const childMap = computed(() => {
  const map = {};
  for (const n of data.value?.nodes || []) {
    if (!n.parentId) continue;
    (map[n.parentId] ||= []).push(n);
  }
  for (const list of Object.values(map)) list.sort((a, b) => a.position - b.position);
  return map;
});

function childrenOf(id) {
  return childMap.value[id] || [];
}

const stages = computed(() => (plan.value ? childrenOf(plan.value.id).filter((n) => n.kind === "stage") : []));
const loose = computed(() => (plan.value ? childrenOf(plan.value.id).filter((n) => n.kind !== "stage") : []));

// Выбранная ступень живёт в адресе: обновил страницу — остался на ней.
const stageId = computed(() => route.query.stage || "");
function setStage(id) {
  router.replace({ query: { ...route.query, stage: id || undefined } });
}

// Объявлено после всех computed, которые читает load(): immediate-вызов до
// их строки упал бы на обращении к ещё не объявленной константе.
watch(
  planId,
  () => {
    data.value = null;
    loading.value = true;
    selectedId.value = "";
    load();
  },
  { immediate: true },
);

const currentStage = computed(() => byId.value[stageId.value] || null);
const stageChildren = computed(() => (currentStage.value ? childrenOf(currentStage.value.id) : loose.value));
const selected = computed(() => byId.value[selectedId.value] || null);

// --- Действия ---

async function run(action) {
  try {
    await action();
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

function addStage() {
  const title = prompt("Новая ступень пути — например «N4»");
  if (!title?.trim()) return;
  run(() => createHubNode({ parentId: plan.value.id, kind: "stage", title: title.trim() }));
}

function addChild({ parentId, kind, title }) {
  run(() => createHubNode({ parentId, kind, title }));
}

const quickTitle = ref("");
const quickKind = ref("topic");
function quickAdd() {
  const title = quickTitle.value.trim();
  if (!title) return;
  const parentId = currentStage.value?.id || plan.value.id;
  quickTitle.value = "";
  run(() => createHubNode({ parentId, kind: quickKind.value, title }));
}

function toggleDone(node) {
  run(() => updateHubNode(node.id, { status: node.status === "done" ? "todo" : "done" }));
}

function moveStage(stage, delta) {
  const list = stages.value.map((s) => s.id);
  const from = list.indexOf(stage.id);
  const to = from + delta;
  if (to < 0 || to >= list.length) return;
  list.splice(to, 0, list.splice(from, 1)[0]);
  // Ступени — не единственные дети плана: общие темы держим после них.
  run(() => reorderHubNodes([...list, ...loose.value.map((n) => n.id)]));
}

function toggleCollapse(id) {
  collapsed[id] = !collapsed[id];
}

async function dropFiles({ nodeId, files }) {
  uploading.value = true;
  try {
    await uploadHubFiles(nodeId, files);
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    uploading.value = false;
  }
}

async function openFile(file) {
  if (file.kind === "artifact") {
    viewerFile.value = file;
    return;
  }
  try {
    const blob = await fetchHubFileBlob(file.id);
    const url = URL.createObjectURL(blob);
    if (file.kind === "image") {
      imageUrl.value = url;
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    error.value = e.message;
  }
}

function closeImage() {
  URL.revokeObjectURL(imageUrl.value);
  imageUrl.value = "";
}

function openLink(link) {
  if (link.missing) return;
  if (link.kind === "pdf") router.push({ path: "/pdfReader", query: { file: link.targetId } });
  else if (link.kind === "section") router.push(link.targetId);
  else if (link.kind === "roadmap_item") router.push("/roadmap");
  else if (link.kind === "learning_skill") router.push("/learning-skills");
  else if (link.kind === "task") router.push("/");
  else if (link.kind === "url") window.open(link.url, "_blank", "noopener");
}

function closeViewer() {
  viewerFile.value = null;
  load(); // счётчик открытий и время
}

async function savePlan(form) {
  planModal.value = false;
  await run(() => updateHubNode(plan.value.id, form));
}

function onDeleted(node) {
  selectedId.value = "";
  if (node.kind === "plan") router.push("/hub");
  else load();
}

function onKey(event) {
  if (event.key === "Escape" && !viewerFile.value && selectedId.value) selectedId.value = "";
}
window.addEventListener("keydown", onKey);
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

const horizonLabel = computed(() => {
  if (!plan.value) return "";
  if (plan.value.horizon === "far") return "далёкий план";
  return plan.value.targetDate ? `до ${new Date(plan.value.targetDate).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}` : "близкий план";
});
</script>

<template>
  <div class="hp" :class="{ 'has-drawer': !!selected }">
    <div class="hp-main">
      <header v-if="plan" class="hp-head" :style="{ '--planet': plan.color || '#8b7cff' }">
        <button class="hp-back" @click="router.push('/hub')">← Космос</button>
        <div class="hp-title-row">
          <span class="hp-planet">{{ plan.emoji || "🪐" }}</span>
          <div class="hp-title-block">
            <h1 class="hp-title" @click="selectedId = plan.id">{{ plan.title }}</h1>
            <div class="hp-sub">
              {{ horizonLabel }} · {{ percent(plan.progress) }}%
              <template v-if="plan.leavesAll"> · пройдено {{ plan.leavesDone }} из {{ plan.leavesAll }}</template>
            </div>
          </div>
          <button class="hp-btn" @click="planModal = true">Настроить</button>
        </div>
        <p v-if="plan.description" class="hp-desc">{{ plan.description }}</p>
        <div class="hp-bar"><i :style="{ width: percent(plan.progress) + '%' }" /></div>
      </header>

      <!-- Путь по ступеням -->
      <section v-if="plan" class="hp-path-wrap">
        <div class="hp-path">
          <template v-for="(s, i) in stages" :key="s.id">
            <div v-if="i" class="hp-link" :class="{ lit: stages[i - 1].status === 'done' }" />
            <button
              class="hp-stage"
              :class="{ on: s.id === stageId, done: s.status === 'done', active: s.status === 'active', goal: s.isGoal }"
              @click="setStage(s.id)"
              @dblclick="selectedId = s.id"
            >
              <span class="hp-stage-orb">
                <svg viewBox="0 0 44 44" class="hp-stage-ring">
                  <circle cx="22" cy="22" r="19" class="bg" />
                  <circle
                    cx="22"
                    cy="22"
                    r="19"
                    class="fill"
                    :stroke-dasharray="`${119.4 * s.progress} 119.4`"
                    transform="rotate(-90 22 22)"
                  />
                </svg>
                <span>{{ s.status === "done" ? "✓" : s.emoji || (s.isGoal ? "🏁" : i + 1) }}</span>
              </span>
              <span class="hp-stage-title">{{ s.title }}</span>
              <span class="hp-stage-meta">
                <template v-if="s.isGoal">цель · </template>{{ percent(s.progress) }}%
              </span>
            </button>
          </template>
          <div v-if="stages.length" class="hp-link dim" />
          <button class="hp-stage add" @click="addStage">
            <span class="hp-stage-orb">＋</span>
            <span class="hp-stage-title">ступень</span>
          </button>
          <button
            v-if="loose.length || !stages.length"
            class="hp-stage loose"
            :class="{ on: !currentStage }"
            @click="setStage('')"
          >
            <span class="hp-stage-orb">📦</span>
            <span class="hp-stage-title">Общее</span>
          </button>
        </div>
      </section>

      <!-- Содержимое ступени -->
      <section v-if="plan" class="hp-content">
        <div class="hp-content-head">
          <div>
            <h2 class="hp-h2">
              {{ currentStage ? currentStage.title : "Общее для плана" }}
              <span v-if="currentStage?.isGoal" class="hp-goal">🏁 цель</span>
            </h2>
            <div v-if="currentStage" class="hp-content-sub">
              {{ currentStage.leavesDone }}/{{ currentStage.leavesAll }} пройдено
              <button class="hp-linkbtn" @click="selectedId = currentStage.id">открыть ступень</button>
              <button class="hp-linkbtn" title="Левее" @click="moveStage(currentStage, -1)">←</button>
              <button class="hp-linkbtn" title="Правее" @click="moveStage(currentStage, 1)">→</button>
            </div>
          </div>
          <span v-if="uploading" class="hp-dim">загружаю…</span>
        </div>

        <p v-if="currentStage?.description" class="hp-desc">{{ currentStage.description }}</p>

        <div class="hp-quick">
          <select v-model="quickKind" class="hp-select">
            <option value="topic">🧩 Тема</option>
            <option value="book">📗 Учебник</option>
            <option value="chapter">📄 Глава</option>
            <option value="note">📝 Заметка</option>
          </select>
          <input
            v-model="quickTitle"
            class="hp-input"
            :placeholder="currentStage ? `Что входит в ${currentStage.title}: тема, учебник…` : 'Тема или материал на весь план'"
            @keydown.enter.prevent="quickAdd"
          />
          <button class="hp-btn" @click="quickAdd">Добавить</button>
        </div>

        <div class="hp-tree">
          <HubTreeNode
            v-for="n in stageChildren"
            :key="n.id"
            :node="n"
            :children-of="childrenOf"
            :selected-id="selectedId"
            :collapsed="collapsed"
            @select="selectedId = $event"
            @toggle-done="toggleDone"
            @add-child="addChild"
            @open-file="openFile"
            @open-link="openLink"
            @drop-files="dropFiles"
            @collapse="toggleCollapse"
          />
          <div v-if="!stageChildren.length" class="hp-empty">
            Пусто. Добавь сюда темы, которые нужно знать, учебник с главами — и прикрепи к главам
            артефакты: перетащи HTML прямо на строку главы.
          </div>
        </div>

        <!-- Файлы и связи самой ступени -->
        <div v-if="currentStage && (currentStage.files.length || currentStage.links.length)" class="hp-own">
          <button v-for="f in currentStage.files" :key="f.id" class="hp-chip" @click="openFile(f)">
            {{ f.kind === "artifact" ? "▶" : "📎" }} {{ f.title || f.filename }}
          </button>
          <button v-for="l in currentStage.links" :key="l.id" class="hp-chip" @click="openLink(l)">
            {{ l.kind === "pdf" ? "📕" : "↗" }} {{ l.title }}
          </button>
        </div>
      </section>

      <div v-if="loading" class="hp-loading">Лечу к планете…</div>
      <div v-if="error" class="hp-error" @click="error = ''">{{ error }}</div>
    </div>

    <div v-if="selected" class="hp-drawer">
      <HubNodeDrawer
        :key="selected.id"
        :node="selected"
        @changed="load"
        @close="selectedId = ''"
        @open-file="openFile"
        @open-link="openLink"
        @deleted="onDeleted"
      />
    </div>

    <HubArtifactViewer v-if="viewerFile" :file="viewerFile" @close="closeViewer" />

    <div v-if="imageUrl" class="hp-image" @click="closeImage">
      <img :src="imageUrl" alt="" />
    </div>

    <HubPlanModal v-if="planModal && plan" :plan="plan" @save="savePlan" @close="planModal = false" />
  </div>
</template>

<style scoped>
.hp {
  width: 100%;
  min-height: calc(100dvh - var(--tabbar-h, 0px));
  display: flex;
  background:
    radial-gradient(900px 500px at 10% -10%, rgba(86, 54, 168, 0.25), transparent 60%),
    radial-gradient(700px 500px at 100% 0%, rgba(22, 110, 160, 0.18), transparent 60%),
    #070810;
  color: #e9ecf8;
}

.hp-main {
  flex: 1;
  min-width: 0;
  max-width: 1100px;
  margin: 0 auto;
  padding: 18px 20px 60px;
  box-sizing: border-box;
}

.hp-head {
  padding: 16px 18px 14px;
  border-radius: 20px;
  background:
    radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--planet) 26%, transparent), transparent 60%),
    #10121c;
  border: 1px solid #22263a;
}

.hp-back {
  background: none;
  border: 0;
  color: #9aa2c4;
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 10px;
}

.hp-title-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.hp-planet {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 26px;
  background:
    radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.5), transparent 34%),
    radial-gradient(circle, color-mix(in srgb, var(--planet) 80%, #fff), var(--planet) 60%, color-mix(in srgb, var(--planet) 45%, #000));
  box-shadow: 0 0 26px color-mix(in srgb, var(--planet) 50%, transparent);
}

.hp-title-block {
  flex: 1;
  min-width: 0;
}

.hp-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
  cursor: pointer;
  overflow-wrap: anywhere;
}

.hp-sub {
  color: #9aa2c4;
  font-size: 13px;
  margin-top: 3px;
}

.hp-desc {
  color: #b7bdd6;
  font-size: 13.5px;
  line-height: 1.5;
  margin: 10px 0 0;
  white-space: pre-wrap;
}

.hp-bar {
  height: 5px;
  margin-top: 14px;
  border-radius: 4px;
  background: #1a1d2c;
  overflow: hidden;
}

.hp-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--planet), #34d399);
}

.hp-btn {
  padding: 9px 14px;
  border-radius: 11px;
  border: 1px solid #2c3146;
  background: #1a1d2c;
  color: #dfe3f4;
  font-size: 13.5px;
  cursor: pointer;
  white-space: nowrap;
}

.hp-btn:hover {
  border-color: #8b7cff;
}

/* Путь */
.hp-path-wrap {
  margin: 18px -20px 4px;
  padding: 0 20px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.hp-path {
  display: flex;
  align-items: flex-start;
  gap: 0;
  /* Сверху запас под увеличенную выбранную ступень с обводкой: прокрутка
     по горизонтали режет и вертикальный вылет. */
  padding: 14px 8px 10px;
  min-width: max-content;
}

.hp-link {
  width: 44px;
  height: 2px;
  margin-top: 31px;
  background: repeating-linear-gradient(90deg, #343a55 0 6px, transparent 6px 11px);
  flex-shrink: 0;
}

.hp-link.lit {
  background: linear-gradient(90deg, #34d399, #8b7cff);
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.6);
}

.hp-link.dim {
  opacity: 0.4;
}

.hp-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 92px;
  background: none;
  border: 0;
  color: #cfd3e6;
  cursor: pointer;
  flex-shrink: 0;
}

.hp-stage-orb {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 18px;
  font-weight: 700;
  background: radial-gradient(circle at 35% 30%, #2b3150, #141726 70%);
  border: 1px solid #2c3146;
  transition: transform 0.15s, box-shadow 0.15s;
}

.hp-stage-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.hp-stage-ring .bg {
  fill: none;
  stroke: transparent;
  stroke-width: 3;
}

.hp-stage-ring .fill {
  fill: none;
  stroke: #8b7cff;
  stroke-width: 3;
  stroke-linecap: round;
}

.hp-stage.done .hp-stage-orb {
  background: radial-gradient(circle at 35% 30%, #4ade80, #059669 75%);
  color: #04261a;
  border-color: transparent;
}

.hp-stage.done .hp-stage-ring .fill {
  stroke: #34d399;
}

.hp-stage.active .hp-stage-orb {
  box-shadow: 0 0 0 2px #ffd68a, 0 0 22px rgba(255, 214, 138, 0.35);
}

.hp-stage.goal .hp-stage-orb {
  background: radial-gradient(circle at 35% 30%, #ffe08a, #f59e0b 60%, #b45309);
  color: #4a2a00;
  border-color: transparent;
  box-shadow: 0 0 26px rgba(245, 158, 11, 0.45);
}

.hp-stage.on .hp-stage-orb {
  transform: scale(1.1);
  outline: 2px solid #8b7cff;
  outline-offset: 4px;
}

.hp-stage.add .hp-stage-orb,
.hp-stage.loose .hp-stage-orb {
  background: transparent;
  border-style: dashed;
  color: #8b91aa;
}

.hp-stage-title {
  font-size: 13.5px;
  font-weight: 600;
  text-align: center;
  max-width: 92px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hp-stage-meta {
  font-size: 11.5px;
  color: #7d849e;
}

/* Содержимое */
.hp-content {
  margin-top: 8px;
  padding: 16px;
  border-radius: 20px;
  background: rgba(16, 18, 28, 0.85);
  border: 1px solid #22263a;
}

.hp-content-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.hp-h2 {
  margin: 0;
  font-size: 19px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.hp-goal {
  font-size: 12px;
  color: #ffd68a;
  border: 1px solid rgba(255, 214, 138, 0.4);
  border-radius: 999px;
  padding: 2px 9px;
  font-weight: 600;
}

.hp-content-sub {
  margin-top: 4px;
  color: #8b91aa;
  font-size: 12.5px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.hp-linkbtn {
  background: none;
  border: 0;
  padding: 2px 4px;
  color: #a99cff;
  font-size: 12.5px;
  cursor: pointer;
}

.hp-quick {
  display: flex;
  gap: 8px;
  margin: 14px 0 10px;
}

.hp-select,
.hp-input {
  background: #0a0c14;
  border: 1px solid #262b40;
  border-radius: 11px;
  color: #eef0f8;
  font-size: 14px;
  padding: 9px 11px;
  outline: none;
}

.hp-input {
  flex: 1;
  min-width: 0;
}

.hp-input:focus {
  border-color: #8b7cff;
}

.hp-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hp-empty {
  color: #7d849e;
  font-size: 13.5px;
  line-height: 1.5;
  padding: 16px 8px;
}

.hp-own {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #1e2233;
}

.hp-chip {
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid #2c3146;
  background: #151827;
  color: #cfd3e6;
  font-size: 12.5px;
  cursor: pointer;
}

.hp-dim {
  color: #7d849e;
  font-size: 12.5px;
}

.hp-loading {
  text-align: center;
  color: #7d849e;
  padding: 60px 0;
}

.hp-error {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: #2a1418;
  border: 1px solid #5c2a31;
  color: #ffb3b8;
  font-size: 13px;
  cursor: pointer;
}

.hp-drawer {
  width: 400px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  height: calc(100dvh - var(--tabbar-h, 0px));
}

.hp-image {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.9);
  display: grid;
  place-items: center;
  cursor: zoom-out;
}

.hp-image img {
  max-width: 96vw;
  max-height: 94dvh;
  object-fit: contain;
}

/* Телефон: панель узла — поверх, на весь экран */
@media (max-width: 900px) {
  .hp-drawer {
    position: fixed;
    inset: 0;
    width: auto;
    height: auto;
    z-index: 1500;
    padding-bottom: var(--tabbar-h, 0px);
    background: #0f1119;
  }
}

@media (max-width: 640px) {
  .hp-main {
    padding: 12px 12px 40px;
  }

  .hp-path-wrap {
    margin: 14px -12px 2px;
    padding: 0 12px;
  }

  .hp-title {
    font-size: 20px;
  }

  .hp-planet {
    width: 46px;
    height: 46px;
    font-size: 22px;
  }

  .hp-content {
    padding: 12px 8px;
    border-radius: 16px;
  }

  .hp-quick {
    flex-wrap: wrap;
  }

  .hp-select {
    flex: 1;
  }

  .hp-input {
    flex-basis: 100%;
    order: 3;
  }
}
</style>
