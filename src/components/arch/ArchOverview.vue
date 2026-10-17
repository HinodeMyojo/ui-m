<script setup>
import { computed, inject } from "vue";
import { STAGE_COLORS, stageTitle } from "@/components/archApi.js";
import { ADR_STATUS, conceptPathForTag, docTitle, frontMatter, sameTag, sortViews, viewList } from "./archModel.js";

// Обзор: проект на одном экране — что внутри модели, какие сценарии и
// механизмы описаны, какие решения приняты, что открыто по делам.
const arch = inject("arch");
const { project, dump, files, paths, errors, building } = arch;

const elements = computed(() => Object.values(dump.value?.elements || {}));
const relationsCount = computed(() => Object.keys(dump.value?.relations || {}).length);
const views = computed(() => sortViews(viewList(dump.value), "title"));
const flows = computed(() => views.value.filter((v) => v.type === "dynamic"));
const structure = computed(() => views.value.filter((v) => v.type === "element"));
const deployments = computed(() => views.value.filter((v) => v.type === "deployment"));

const concepts = computed(() => {
  void arch.fileVersion.value;
  return paths.value
    .filter((p) => p.startsWith("concepts/") && p.endsWith(".md"))
    .map((p) => {
      const tag = p.slice("concepts/".length, -3);
      const has = (tags) => (tags || []).some((t) => sameTag(t, tag));
      const usedBy = elements.value.filter((e) => has(e.tags)).length;
      const relUsed = Object.values(dump.value?.relations || {}).filter((r) => has(r.tags)).length;
      return { path: p, tag, title: docTitle(p, files[p]), usedBy: usedBy + relUsed };
    });
});

const decisions = computed(() => {
  void arch.fileVersion.value;
  return paths.value
    .filter((p) => p.startsWith("decisions/") && p.endsWith(".md"))
    .map((p) => {
      const { meta } = frontMatter(files[p]);
      return { path: p, title: docTitle(p, files[p]), status: ADR_STATUS[meta.status] || null, date: meta.date || "" };
    })
    .reverse();
});

const openLinks = computed(() => (project.value?.links || []).filter((l) => !l.done && !l.missing));
const events = computed(() => project.value?.stageEvents || []);

// Метки из словаря, у которых нет описания механизма.
const undocumentedTags = computed(() => {
  const tags = Object.keys(dump.value?.specification?.tags || {});
  return tags.filter((t) => !conceptPathForTag(paths.value, t) && elements.value.some((e) => (e.tags || []).includes(t)));
});

const AUTHOR = { user: "вы", claude: "Claude", template: "шаблон" };
const fmt = (iso) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
</script>

<template>
  <div class="ar-grid" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); align-items: start">
    <div class="ar-card">
      <div class="ar-h2">Модель</div>
      <div v-if="!dump && building" class="ar-muted" style="font-size: 13px">Разбираю модель…</div>
      <div v-else class="ar-kv">
        <span>Элементов</span><span>{{ elements.length }}</span>
        <span>Связей</span><span>{{ relationsCount }}</span>
        <span>Диаграмм структуры</span><span>{{ structure.length }}</span>
        <span>Сценариев</span><span>{{ flows.length }}</span>
        <span>Окружений</span><span>{{ deployments.length }}</span>
        <span>Файлов</span><span>{{ paths.length }}</span>
      </div>
      <div class="ar-row" style="margin-top: 10px">
        <button v-for="v in structure.slice(0, 4)" :key="v.id" class="ar-btn is-small" @click="arch.openView(v.id)">
          ▦ {{ v.title }}
        </button>
      </div>
      <div v-if="errors.length" class="ar-error" style="margin-top: 10px; cursor: pointer" @click="arch.go('editor')">
        В модели ошибок: {{ errors.length }}. Первая: {{ errors[0].path }}:{{ errors[0].line }} — {{ errors[0].message }}
      </div>
    </div>

    <div class="ar-card">
      <div class="ar-h2">Сценарии</div>
      <div v-if="!flows.length" class="ar-muted" style="font-size: 13px">
        Сценариев пока нет. Опишите главный процесс — шаблон «Новый сценарий» в редакторе, или попросите Claude.
      </div>
      <div v-for="v in flows" :key="v.id" class="ar-item" @click="arch.openView(v.id)">
        <span class="ar-item-icon">⇄</span>
        <span class="ar-item-label">{{ v.title }}</span>
        <span class="ar-dim ar-mono" style="font-size: 11px">{{ v.id }}</span>
      </div>
    </div>

    <div class="ar-card">
      <div class="ar-h2">Механизмы</div>
      <div v-if="!concepts.length" class="ar-muted" style="font-size: 13px">Описаний механизмов пока нет.</div>
      <div v-for="c in concepts" :key="c.path" class="ar-item" @click="arch.openFile(c.path)">
        <span class="ar-item-icon">⚙</span>
        <span class="ar-item-label">{{ c.title }}</span>
        <span class="ar-tag">#{{ c.tag }}</span>
        <span class="ar-dim" style="font-size: 12px" title="Сколько элементов и связей помечено">{{ c.usedBy }}</span>
      </div>
      <div v-if="undocumentedTags.length" class="ar-muted" style="font-size: 12px; margin-top: 6px">
        Метки без описания: <span v-for="t in undocumentedTags" :key="t" class="ar-tag" style="margin-right: 6px">#{{ t }}</span>
      </div>
    </div>

    <div class="ar-card">
      <div class="ar-h2">Решения</div>
      <div v-if="!decisions.length" class="ar-muted" style="font-size: 13px">Решений пока нет.</div>
      <div v-for="d in decisions" :key="d.path" class="ar-item" @click="arch.openFile(d.path)">
        <span class="ar-dot" :style="{ background: d.status?.color || '#64748b' }" :title="d.status?.title" />
        <span class="ar-item-label">{{ d.title }}</span>
        <span class="ar-dim" style="font-size: 12px">{{ d.date }}</span>
      </div>
    </div>

    <div class="ar-card">
      <div class="ar-row">
        <div class="ar-h2" style="margin: 0">Открытые дела</div>
        <div class="ar-spacer" />
        <button class="ar-btn is-small" @click="arch.go('tasks')">Все</button>
      </div>
      <div v-if="!openLinks.length" class="ar-muted" style="font-size: 13px; margin-top: 8px">
        Нет открытых дел. Привязать карточку «Сегодня» или задачу главной — во вкладке «Задачи».
      </div>
      <div v-for="l in openLinks.slice(0, 8)" :key="l.id" class="ar-item" @click="arch.go('tasks')">
        <span class="ar-item-icon">{{ l.targetKind === "card" ? "📅" : "📋" }}</span>
        <span class="ar-item-label">{{ l.title }}</span>
        <span v-if="l.anchor" class="ar-dim ar-mono" style="font-size: 11px">{{ l.anchor }}</span>
      </div>
    </div>

    <div class="ar-card">
      <div class="ar-h2">Стадии</div>
      <div v-for="(e, i) in events" :key="i" class="ar-row" style="font-size: 13px; padding: 4px 0; flex-wrap: nowrap; align-items: flex-start">
        <span class="ar-dot" :style="{ background: STAGE_COLORS[e.toStage], marginTop: '6px' }" />
        <div style="flex: 1">
          <div>
            <template v-if="e.fromStage">{{ stageTitle(e.fromStage) }} → </template>
            <strong>{{ stageTitle(e.toStage) }}</strong>
            <span class="ar-dim"> · {{ fmt(e.at) }} · {{ AUTHOR[e.author] || e.author }}</span>
          </div>
          <div v-if="e.note" class="ar-muted">{{ e.note }}</div>
        </div>
      </div>
    </div>

    <div class="ar-card">
      <div class="ar-h2">Claude</div>
      <div class="ar-muted" style="font-size: 13px; line-height: 1.5">
        В Claude с коннектором сайта говорите про проект <span class="ar-mono" style="color: var(--ar-text)">{{ project.slug }}</span>:
        «в {{ project.slug }} поменялся процесс OTP — теперь …», «опиши, как формируется платёж и где ключ идемпотентности»,
        «переведи на стадию ревью». Claude читает модель, правит файлы и сразу видит ошибки разбора — все правки попадают в «Историю».
      </div>
    </div>
  </div>
</template>
