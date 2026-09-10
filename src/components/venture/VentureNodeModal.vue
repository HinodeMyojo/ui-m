<script setup>
import { computed, ref, onMounted } from "vue";
import { fetchGlobalTasks } from "@/components/api.js";
import {
  NODE_STATUSES,
  createDraft,
  updateDraft,
  deleteDraft,
  takeDraft,
  attachTasks,
  detachTask,
  percent,
  shortDate,
} from "@/components/ventureApi.js";

// Карточка узла: поля этапа, привязанные задачи с главного экрана и черновики
// будущих задач. Чек-листов здесь намеренно нет — вся мелкая работа живёт
// задачами на главном экране, сюда она только привязывается.

const props = defineProps({
  node: { type: Object, required: true },
  lanes: { type: Array, default: () => [] },
  periods: { type: Array, default: () => [] },
});

const emit = defineEmits(["close", "save", "delete", "changed", "link-start"]);

const form = ref({
  title: props.node.title || "",
  subtitle: props.node.subtitle || "",
  description: props.node.description || "",
  emoji: props.node.emoji || "",
  laneId: props.node.laneId || "",
  periodId: props.node.periodId || "",
  isMilestone: props.node.isMilestone || false,
  weight: props.node.weight || 1,
  status: props.node.status || "planned",
  dropReason: props.node.dropReason || "",
  planStart: props.node.planStart || "",
  planEnd: props.node.planEnd || "",
  factStart: props.node.factStart || "",
  factEnd: props.node.factEnd || "",
  budgetPlan: props.node.budgetPlan || 0,
  budgetFact: props.node.budgetFact || 0,
  cost: props.node.cost || "",
  url: props.node.url || "",
  shiftReason: "",
});

// Ручной процент включается галочкой: пока она снята, цифра считается по задачам.
const manualOn = ref(props.node.progressManual !== null && props.node.progressManual !== undefined);
const manualValue = ref(props.node.progressManual ?? props.node.progress ?? 0);

const tab = ref("main");
const error = ref("");
const busy = ref(false);

const drafts = ref([...(props.node.drafts || [])]);
const newDraft = ref("");

const globalTasks = ref([]);
const attachId = ref("");

const openDrafts = computed(() => drafts.value.filter((d) => !d.takenTaskId));
const takenDrafts = computed(() => drafts.value.filter((d) => d.takenTaskId));

const planEndChanged = computed(
  () => form.value.planEnd !== (props.node.planEnd || "") && !!props.node.planEnd,
);

onMounted(async () => {
  try {
    const tasks = await fetchGlobalTasks();
    globalTasks.value = Array.isArray(tasks) ? tasks : [];
  } catch {
    globalTasks.value = []; // список задач не критичен: без него просто нечего привязать
  }
});

const attachable = computed(() => {
  const attached = new Set((props.node.tasks || []).map((t) => t.id));
  return globalTasks.value.filter((t) => !attached.has(t.id));
});

function submit() {
  if (!form.value.title.trim()) {
    error.value = "Нужно название";
    return;
  }
  emit("save", {
    ...form.value,
    laneId: form.value.laneId || null,
    periodId: form.value.periodId || null,
    weight: Number(form.value.weight) || 1,
    budgetPlan: Number(form.value.budgetPlan) || 0,
    budgetFact: Number(form.value.budgetFact) || 0,
    progressManual: manualOn.value ? Math.round(Number(manualValue.value) || 0) : null,
  });
}

async function run(action) {
  busy.value = true;
  error.value = "";
  try {
    await action();
    emit("changed");
  } catch (err) {
    error.value = err.message || String(err);
  } finally {
    busy.value = false;
  }
}

async function addDraft() {
  const title = newDraft.value.trim();
  if (!title) return;
  await run(async () => {
    const created = await createDraft(props.node.id, { title, sortOrder: drafts.value.length });
    drafts.value.push({ id: created.id, nodeId: props.node.id, title, priority: 0 });
    newDraft.value = "";
  });
}

async function renameDraft(draft) {
  const title = window.prompt("Название", draft.title);
  if (title === null) return;
  await run(async () => {
    await updateDraft(draft.id, { ...draft, title });
    draft.title = title;
  });
}

async function removeDraft(draft) {
  await run(async () => {
    await deleteDraft(draft.id);
    drafts.value = drafts.value.filter((d) => d.id !== draft.id);
  });
}

// Разбор черновика: заводится настоящая задача на главном экране и сразу
// привязывается к этому узлу.
async function take(draft) {
  await run(async () => {
    await takeDraft(draft.id, {});
    draft.takenTaskId = "taken";
  });
}

async function attach() {
  if (!attachId.value) return;
  const id = attachId.value;
  await run(async () => {
    await attachTasks(props.node.id, [id]);
    attachId.value = "";
  });
}

async function detach(task) {
  await run(() => detachTask(task.id));
}
</script>

<template>
  <div class="vt-modal-back" @click.self="emit('close')">
    <div class="vt-modal">
      <div class="vt-row">
        <h3 style="margin: 0">
          {{ node.isMilestone ? "Веха" : "Узел" }}: {{ node.title || "новый" }}
        </h3>
        <div class="vt-spacer" />
        <button class="vt-btn is-small" @click="emit('link-start', node.id)">→ Связать</button>
        <button class="vt-btn is-small is-danger" @click="emit('delete', node.id)">Удалить</button>
      </div>

      <div class="vt-tabs">
        <button class="vt-tab" :class="{ 'is-active': tab === 'main' }" @click="tab = 'main'">
          Этап
        </button>
        <button class="vt-tab" :class="{ 'is-active': tab === 'tasks' }" @click="tab = 'tasks'">
          Задачи ({{ node.taskDoneCount }}/{{ node.taskCount }})
        </button>
        <button class="vt-tab" :class="{ 'is-active': tab === 'drafts' }" @click="tab = 'drafts'">
          Черновики ({{ openDrafts.length }})
        </button>
        <button
          v-if="node.shifts && node.shifts.length"
          class="vt-tab"
          :class="{ 'is-active': tab === 'shifts' }"
          @click="tab = 'shifts'"
        >
          Переносы ({{ node.shifts.length }})
        </button>
      </div>

      <div v-if="error" class="vt-error">{{ error }}</div>

      <!-- Поля этапа -->
      <template v-if="tab === 'main'">
        <div class="vt-form-grid">
          <div class="vt-full">
            <label class="vt-label">Название</label>
            <input v-model="form.title" class="vt-input" placeholder="MVP" />
          </div>
          <div class="vt-full">
            <label class="vt-label">Подпись под названием</label>
            <input v-model="form.subtitle" class="vt-input" placeholder="Основные функции" />
          </div>

          <div>
            <label class="vt-label">Направление</label>
            <select v-model="form.laneId" class="vt-select" style="width: 100%">
              <option value="">— без направления —</option>
              <option v-for="lane in lanes" :key="lane.id" :value="lane.id">
                {{ lane.emoji }} {{ lane.title }}
              </option>
            </select>
          </div>
          <div>
            <label class="vt-label">Полоса времени</label>
            <select v-model="form.periodId" class="vt-select" style="width: 100%">
              <option value="">— свободно —</option>
              <option v-for="period in periods" :key="period.id" :value="period.id">
                {{ period.title }}
              </option>
            </select>
          </div>
          <div>
            <label class="vt-label">Статус</label>
            <select v-model="form.status" class="vt-select" style="width: 100%">
              <option v-for="status in NODE_STATUSES" :key="status.code" :value="status.code">
                {{ status.title }}
              </option>
            </select>
          </div>

          <div>
            <label class="vt-label">Эмодзи</label>
            <input v-model="form.emoji" class="vt-input" placeholder="🚀" />
          </div>
          <div>
            <label class="vt-label">План: начало</label>
            <input v-model="form.planStart" type="date" class="vt-input" />
          </div>
          <div>
            <label class="vt-label">План: конец</label>
            <input v-model="form.planEnd" type="date" class="vt-input" />
          </div>
          <div v-if="planEndChanged" class="vt-full">
            <label class="vt-label">Причина переноса (попадёт в историю)</label>
            <input v-model="form.shiftReason" class="vt-input" placeholder="Подрядчик сдвинул сроки" />
          </div>

          <div>
            <label class="vt-label">Бюджет план</label>
            <input v-model="form.budgetPlan" type="number" class="vt-input" />
          </div>
          <div>
            <label class="vt-label">Бюджет факт</label>
            <input v-model="form.budgetFact" type="number" class="vt-input" />
          </div>
          <div>
            <label class="vt-label">Прикидка словами</label>
            <input v-model="form.cost" class="vt-input" placeholder="~2 месяца, подрядчик" />
          </div>

          <div>
            <label class="vt-label">
              <input v-model="form.isMilestone" type="checkbox" /> Это веха
            </label>
            <div class="vt-muted">По вехам считается процент проекта</div>
          </div>
          <div v-if="form.isMilestone">
            <label class="vt-label">Вес вехи</label>
            <input v-model="form.weight" type="number" min="1" class="vt-input" />
          </div>

          <div class="vt-full">
            <label class="vt-label">
              <input v-model="manualOn" type="checkbox" /> Задать процент вручную
            </label>
            <div v-if="manualOn" class="vt-row">
              <input v-model="manualValue" type="range" min="0" max="100" style="flex: 1" />
              <span>{{ percent(manualValue) }}%</span>
            </div>
            <div v-else class="vt-muted">
              Сейчас {{ percent(node.progress) }}% — считается по закрытым задачам узла
            </div>
          </div>

          <div v-if="form.status === 'dropped'" class="vt-full">
            <label class="vt-label">Причина отмены</label>
            <input v-model="form.dropReason" class="vt-input" />
          </div>

          <div class="vt-full">
            <label class="vt-label">Ссылка</label>
            <input v-model="form.url" class="vt-input" placeholder="https://" />
          </div>
          <div class="vt-full">
            <label class="vt-label">Описание (markdown)</label>
            <textarea v-model="form.description" class="vt-textarea" />
          </div>
        </div>

        <div class="vt-row">
          <div class="vt-spacer" />
          <button class="vt-btn" @click="emit('close')">Отмена</button>
          <button class="vt-btn is-primary" @click="submit">Сохранить</button>
        </div>
      </template>

      <!-- Привязанные задачи с главного экрана -->
      <template v-else-if="tab === 'tasks'">
        <div class="vt-muted">
          Задачи живут на главном экране; здесь видно, какие из них тянут этот этап.
        </div>
        <div class="vt-list">
          <div v-for="task in node.tasks" :key="task.id" class="vt-item">
            <span>{{ task.done ? "✅" : "⬜" }}</span>
            <span style="flex: 1">{{ task.title }}</span>
            <span v-if="task.subTotal" class="vt-chip">{{ task.subDone }}/{{ task.subTotal }}</span>
            <span v-if="task.end" class="vt-muted">{{ shortDate(task.end) }}</span>
            <button class="vt-btn is-small" :disabled="busy" @click="detach(task)">Отвязать</button>
          </div>
          <div v-if="!node.tasks || !node.tasks.length" class="vt-empty">
            Задач пока нет. Привяжите существующую или разберите черновик.
          </div>
        </div>

        <div class="vt-row">
          <select v-model="attachId" class="vt-select" style="flex: 1">
            <option value="">— выбрать задачу —</option>
            <option v-for="task in attachable" :key="task.id" :value="task.id">
              {{ task.done ? "✅ " : "" }}{{ task.title }}
            </option>
          </select>
          <button class="vt-btn" :disabled="!attachId || busy" @click="attach">Привязать</button>
        </div>
      </template>

      <!-- Черновики будущих задач -->
      <template v-else-if="tab === 'drafts'">
        <div class="vt-muted">
          Черновик — то, что точно надо сделать в этапе, но чему ещё не пришло время.
          «Разобрать» превращает его в настоящую задачу и привязывает к этому узлу.
        </div>
        <div class="vt-list">
          <div v-for="draft in openDrafts" :key="draft.id" class="vt-item">
            <span style="flex: 1">{{ draft.title }}</span>
            <button class="vt-btn is-small" :disabled="busy" @click="take(draft)">Разобрать</button>
            <button class="vt-btn is-small" :disabled="busy" @click="renameDraft(draft)">✎</button>
            <button class="vt-btn is-small is-danger" :disabled="busy" @click="removeDraft(draft)">
              ✕
            </button>
          </div>
          <div v-if="!openDrafts.length" class="vt-empty">Неразобранных черновиков нет.</div>
        </div>

        <div class="vt-row">
          <input
            v-model="newDraft"
            class="vt-input"
            placeholder="Что нужно сделать в этом этапе"
            style="flex: 1"
            @keyup.enter="addDraft"
          />
          <button class="vt-btn" :disabled="busy" @click="addDraft">Добавить</button>
        </div>

        <div v-if="takenDrafts.length">
          <div class="vt-label">Уже разобраны</div>
          <div class="vt-list">
            <div v-for="draft in takenDrafts" :key="draft.id" class="vt-item" style="opacity: 0.6">
              <span style="flex: 1">{{ draft.title }}</span>
              <span class="vt-chip is-ok">задача заведена</span>
            </div>
          </div>
        </div>
      </template>

      <!-- История переносов сроков -->
      <template v-else>
        <div class="vt-list">
          <div v-for="shift in node.shifts" :key="shift.id" class="vt-item">
            <span>{{ shortDate(shift.oldEnd) || "—" }} → {{ shortDate(shift.newEnd) || "—" }}</span>
            <span class="vt-muted" style="flex: 1">{{ shift.reason || "без причины" }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
