<script setup>
import { computed } from "vue";
import { dateRange, monthYear } from "@/components/resumeApi.js";

// Лист А4 «как напечатается» — docs/resume-module.md, раздел 4.
// Превью и печать используют один и тот же компонент: иначе PDF всегда
// оказывается не таким, каким его видели в редакторе.

const props = defineProps({
  full: { type: Object, required: true },
  mode: { type: String, default: "working" }, // working | clean
  editable: { type: Boolean, default: false },
  selectedId: { type: String, default: "" },
});

const emit = defineEmits(["select", "edit-bullet", "edit-entry", "edit-header"]);

const resume = computed(() => props.full?.resume || {});
const clean = computed(() => props.mode === "clean");

const accent = computed(() =>
  resume.value.templateKey === "accent" && resume.value.accentColor
    ? resume.value.accentColor
    : "#111111",
);

const contacts = computed(() =>
  [
    resume.value.city,
    resume.value.relocation,
    resume.value.phone,
    resume.value.email,
    resume.value.telegram,
    resume.value.github,
    resume.value.website,
  ]
    .map((v) => (v || "").trim())
    .filter(Boolean)
    .join(" · "),
);

// Метка незаконченного: «в процессе, ожидается 11/2026» — рекрутер читает
// такое правильно с первого раза.
function progressSuffix(deadline) {
  const en = resume.value.lang === "en";
  if (!deadline) return en ? " (in progress)" : " (в процессе)";
  return en
    ? ` (in progress, expected ${monthYear(deadline)})`
    : ` (в процессе, ожидается ${monthYear(deadline)})`;
}

function bulletText(bullet) {
  if (clean.value && bullet.status === "in_progress") {
    return bullet.text + progressSuffix(bullet.deadline);
  }
  return bullet.text;
}

function visibleBullets(list) {
  return (list || []).filter((b) => {
    if (b.hidden) return false;
    // Плановая строка не попадает в чистый вид ни при каких условиях.
    if (clean.value && b.status === "planned") return false;
    return true;
  });
}

function visibleEntries(list) {
  return (list || []).filter((e) => {
    if (e.hidden) return false;
    if (clean.value && e.status === "planned") return false;
    return true;
  });
}

const sections = computed(() =>
  (props.full?.sections || []).filter((s) => {
    if (s.hidden) return false;
    return visibleEntries(s.entries).length > 0 || visibleBullets(s.bullets).length > 0;
  }),
);

function groupedSkills(bullets) {
  const order = [];
  const map = new Map();
  for (const bullet of visibleBullets(bullets)) {
    const key = bullet.groupLabel || "";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key).push(bullet);
  }
  return order.map((name) => ({ name, items: map.get(name) }));
}

function entryHead(entry) {
  const organization = (entry.organization || "").trim();
  const title = (entry.title || "").trim();
  if (organization && title) return `${organization} — ${title}`;
  return organization || title;
}

function entryMeta(entry) {
  return [entry.location, dateRange(entry, resume.value.lang)].filter(Boolean).join(" · ");
}

function lineClass(item) {
  return {
    "is-planned": item.status === "planned",
    "is-progress": item.status === "in_progress",
    "is-overdue": !!item.overdue,
    "is-selected": item.id === props.selectedId,
  };
}

function onBulletInput(bullet, event) {
  const text = event.target.innerText.replace(/\s+$/, "");
  if (text !== bullet.text) emit("edit-bullet", { id: bullet.id, text });
}

function onEntryInput(entry, field, event) {
  const value = event.target.innerText.trim();
  if (value !== (entry[field] || "")) emit("edit-entry", { id: entry.id, [field]: value });
}

function onHeaderInput(field, event) {
  const value = event.target.innerText.trim();
  if (value !== (resume.value[field] || "")) emit("edit-header", { [field]: value });
}
</script>

<template>
  <div class="rs-sheet" :style="{ '--sheet-accent': accent }">
    <h1
      :contenteditable="editable"
      @blur="onHeaderInput('fullName', $event)"
      v-text="resume.fullName"
    />
    <div
      class="rs-sheet-headline"
      :contenteditable="editable"
      @blur="onHeaderInput('headline', $event)"
      v-text="resume.headline"
    />
    <div class="rs-sheet-contacts">{{ contacts }}</div>

    <template v-for="section in sections" :key="section.id">
      <h2>{{ section.title }}</h2>

      <!-- Сплошной текст: О себе -->
      <template v-if="section.layout === 'text'">
        <div
          v-for="bullet in visibleBullets(section.bullets)"
          :key="bullet.id"
          class="rs-line"
          :class="lineClass(bullet)"
          @click="emit('select', bullet)"
        >
          <span v-if="!clean && bullet.status !== 'fact'" class="rs-line-mark">
            {{ bullet.status === "planned" ? "◇ план" : "◈ в процессе" }}
          </span>
          <span
            class="rs-line-editable"
            :contenteditable="editable"
            @blur="onBulletInput(bullet, $event)"
            v-text="bulletText(bullet)"
          />
          <span v-if="!clean && bullet.links?.length" class="rs-line-links">
            [{{ bullet.linksDone }}/{{ bullet.links.length }}]
          </span>
          <span v-if="!clean && bullet.textTarget" class="rs-line-target">
            ⇢ {{ bullet.textTarget }}
          </span>
        </div>
      </template>

      <!-- Чипы навыков, сгруппированные -->
      <template v-else-if="section.layout === 'tags'">
        <div
          v-for="group in groupedSkills(section.bullets)"
          :key="group.name || 'default'"
          class="rs-sheet-skills"
        >
          <b v-if="group.name">{{ group.name }}:</b>
          <template v-for="(bullet, index) in group.items" :key="bullet.id">
            <span
              class="rs-line"
              :class="lineClass(bullet)"
              @click="emit('select', bullet)"
            >
              <span
                class="rs-line-editable"
                :contenteditable="editable"
                @blur="onBulletInput(bullet, $event)"
                v-text="bulletText(bullet)"
              />
              <span v-if="!clean && bullet.links?.length" class="rs-line-links">
                [{{ bullet.linksDone }}/{{ bullet.links.length }}]
              </span>
            </span>
            <span v-if="index < group.items.length - 1"> · </span>
          </template>
        </div>
      </template>

      <!-- Блоки с датами: опыт, образование, курсы, проекты -->
      <template v-else>
        <div
          v-for="entry in visibleEntries(section.entries)"
          :key="entry.id"
          class="rs-sheet-entry"
        >
          <div
            class="rs-sheet-entry-head rs-line"
            :class="lineClass(entry)"
            @click="emit('select', entry)"
          >
            <span v-if="!clean && entry.status !== 'fact'" class="rs-line-mark">
              {{ entry.status === "planned" ? "◇ план" : "◈ в процессе" }}
            </span>
            <span
              class="rs-line-editable"
              :contenteditable="editable"
              @blur="onEntryInput(entry, 'title', $event)"
              v-text="entryHead(entry)"
            />
          </div>
          <div v-if="entryMeta(entry)" class="rs-sheet-entry-meta">{{ entryMeta(entry) }}</div>
          <div v-if="entry.description">{{ entry.description }}</div>
          <ul v-if="visibleBullets(entry.bullets).length">
            <li
              v-for="bullet in visibleBullets(entry.bullets)"
              :key="bullet.id"
              class="rs-line"
              :class="lineClass(bullet)"
              @click="emit('select', bullet)"
            >
              <span v-if="!clean && bullet.status !== 'fact'" class="rs-line-mark">
                {{ bullet.status === "planned" ? "◇" : "◈" }}
              </span>
              <span
                class="rs-line-editable"
                :contenteditable="editable"
                @blur="onBulletInput(bullet, $event)"
                v-text="bulletText(bullet)"
              />
              <span v-if="!clean && bullet.links?.length" class="rs-line-links">
                [{{ bullet.linksDone }}/{{ bullet.links.length }}]
              </span>
              <span v-if="!clean && bullet.textTarget" class="rs-line-target">
                ⇢ {{ bullet.textTarget }}
              </span>
            </li>
          </ul>
        </div>

        <ul v-if="visibleBullets(section.bullets).length">
          <li
            v-for="bullet in visibleBullets(section.bullets)"
            :key="bullet.id"
            class="rs-line"
            :class="lineClass(bullet)"
            @click="emit('select', bullet)"
          >
            <span v-if="!clean && bullet.status !== 'fact'" class="rs-line-mark">
              {{ bullet.status === "planned" ? "◇" : "◈" }}
            </span>
            <span
              class="rs-line-editable"
              :contenteditable="editable"
              @blur="onBulletInput(bullet, $event)"
              v-text="bulletText(bullet)"
            />
            <span v-if="!clean && bullet.links?.length" class="rs-line-links">
              [{{ bullet.linksDone }}/{{ bullet.links.length }}]
            </span>
          </li>
        </ul>
      </template>
    </template>

    <!-- Дальше HR обычно не читает: граница первой страницы А4. -->
    <div class="rs-page-break" style="top: 283mm">
      <span>конец первой страницы</span>
    </div>
  </div>
</template>
