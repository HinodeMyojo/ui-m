<script setup>
import { computed, inject } from "vue";
import {
  childrenOf,
  conceptPathForTag,
  docTitle,
  mentionsOf,
  relationsOf,
  richText,
  viewsWithElement,
} from "./archModel.js";
import ArchMarkdown from "./ArchMarkdown.vue";

// Всё, что известно об элементе: описание, технологии, метки-механизмы,
// связи, диаграммы и документы, где он есть, и привязанные дела.
const props = defineProps({
  elementId: { type: String, default: "" },
  edge: { type: Object, default: null },
  viewId: { type: String, default: "" },
});
const emit = defineEmits(["close"]);

const arch = inject("arch");
const { dump, files, paths, project, selection } = arch;

const el = computed(() => (props.elementId ? dump.value?.elements?.[props.elementId] || null : null));
const kindSpec = computed(() => (el.value ? dump.value?.specification?.elements?.[el.value.kind] : null));
const parentId = computed(() => {
  const i = props.elementId.lastIndexOf(".");
  return i > 0 ? props.elementId.slice(0, i) : "";
});
const parent = computed(() => (parentId.value ? dump.value?.elements?.[parentId.value] : null));
const children = computed(() => (el.value ? childrenOf(dump.value, props.elementId) : []));
const rels = computed(() => (el.value ? relationsOf(dump.value, props.elementId) : { incoming: [], outgoing: [] }));
const views = computed(() => (el.value ? viewsWithElement(dump.value, props.elementId) : []));
const mentions = computed(() => {
  void arch.fileVersion.value;
  return props.elementId ? mentionsOf(files, "element", props.elementId) : [];
});
const tags = computed(() =>
  (el.value?.tags || []).map((t) => ({ tag: t, concept: conceptPathForTag(paths.value, t) })),
);
const metadata = computed(() => Object.entries(el.value?.metadata || {}));
const links = computed(() =>
  (project.value?.links || []).filter((l) => l.anchor === props.elementId || l.anchor === "view:" + props.elementId),
);

const title = (fqn) => dump.value?.elements?.[fqn]?.title || fqn;

// --- Шаг сценария или связь ---

const edgeRelations = computed(() =>
  (props.edge?.relations || []).map((id) => dump.value?.relations?.[id]).filter(Boolean),
);
const edgeNotes = computed(() => richText(props.edge?.notes));
const edgeDescription = computed(() => richText(props.edge?.description));

function edgeSource() {
  const rel = props.edge?.relations?.[0];
  if (rel) arch.openSource({ relation: rel });
  else arch.openSource({ view: props.viewId });
}

function linkTask() {
  selection.anchor = props.elementId;
  arch.go("tasks");
}

const STATUS = { todo: "в плане", doing: "в работе", paused: "пауза", done: "сделано", dropped: "отменено" };
</script>

<template>
  <div class="ar-pane">
    <div class="ar-pane-head">
      <strong>{{ edge ? (edge.id.startsWith("step-") ? "Шаг сценария" : "Связь") : "Элемент" }}</strong>
      <div class="ar-spacer" />
      <button class="ar-btn is-ghost is-small" @click="emit('close')">✕</button>
    </div>

    <div class="ar-pane-body">
      <!-- Элемент -->
      <div v-if="el" class="ar-el">
        <div>
          <div class="ar-el-kind">{{ kindSpec?.notation || el.notation || el.kind }}</div>
          <div class="ar-el-title">{{ el.title }}</div>
          <div class="ar-mono ar-dim" style="font-size: 12px">{{ el.id }}</div>
        </div>

        <div class="ar-row">
          <button class="ar-btn is-small" @click="arch.openSource({ element: el.id })">‹› В коде</button>
          <button class="ar-btn is-small" @click="linkTask">📌 Привязать дело</button>
        </div>

        <div v-if="el.technology || parent || metadata.length" class="ar-kv">
          <template v-if="el.technology">
            <span>Технологии</span><span>{{ el.technology }}</span>
          </template>
          <template v-if="parent">
            <span>Внутри</span>
            <span><a href="#" @click.prevent="arch.openElement(parent.id)">{{ parent.title }}</a></span>
          </template>
          <template v-for="[k, v] in metadata" :key="k">
            <span>{{ k }}</span><span class="ar-mono" style="font-size: 12px">{{ Array.isArray(v) ? v.join(", ") : v }}</span>
          </template>
        </div>

        <div v-if="tags.length">
          <div class="ar-label">Механизмы и метки</div>
          <div class="ar-row" style="gap: 6px">
            <span
              v-for="t in tags"
              :key="t.tag"
              class="ar-chip"
              :class="{ 'is-link': t.concept }"
              :title="t.concept ? 'Открыть описание механизма' : 'Описания нет — заведите concepts/' + t.tag + '.md'"
              @click="t.concept && arch.openFile(t.concept)"
            >
              <span class="ar-tag">#{{ t.tag }}</span>
              <span v-if="t.concept">· {{ docTitle(t.concept, files[t.concept]) }}</span>
            </span>
          </div>
        </div>

        <div v-if="richText(el.description)" class="ar-card" style="padding: 0">
          <ArchMarkdown :text="richText(el.description)" />
        </div>

        <div v-if="(el.links || []).length">
          <div class="ar-label">Ссылки</div>
          <div v-for="l in el.links" :key="l.url">
            <a :href="l.url" target="_blank" rel="noopener" style="color: var(--ar-accent-2)">{{ l.title || l.url }}</a>
          </div>
        </div>

        <div v-if="children.length">
          <div class="ar-label">Внутри ({{ children.length }})</div>
          <div v-for="c in children" :key="c.id" class="ar-item" @click="arch.openElement(c.id)">
            <span class="ar-item-label">{{ c.title }}</span>
            <span class="ar-dim" style="font-size: 12px">{{ c.kind }}</span>
          </div>
        </div>

        <div v-if="rels.outgoing.length">
          <div class="ar-label">Обращается к</div>
          <div v-for="r in rels.outgoing" :key="r.id" class="ar-rel">
            <span class="ar-dim">→</span>
            <a href="#" @click.prevent="arch.openElement(r.target)">{{ title(r.target) }}</a>
            <span class="ar-muted">{{ r.title }}</span>
            <span v-if="r.technology" class="ar-dim" style="font-size: 12px">· {{ r.technology }}</span>
            <span v-for="t in r.tags" :key="t" class="ar-tag">#{{ t }}</span>
          </div>
        </div>
        <div v-if="rels.incoming.length">
          <div class="ar-label">К нему обращаются</div>
          <div v-for="r in rels.incoming" :key="r.id" class="ar-rel">
            <span class="ar-dim">←</span>
            <a href="#" @click.prevent="arch.openElement(r.source)">{{ title(r.source) }}</a>
            <span class="ar-muted">{{ r.title }}</span>
            <span v-if="r.technology" class="ar-dim" style="font-size: 12px">· {{ r.technology }}</span>
          </div>
        </div>

        <div v-if="views.length">
          <div class="ar-label">На диаграммах</div>
          <div class="ar-row" style="gap: 6px">
            <span v-for="v in views" :key="v.id" class="ar-chip is-link" @click="arch.openView(v.id)">{{ v.title }}</span>
          </div>
        </div>

        <div v-if="mentions.length">
          <div class="ar-label">Упоминается в документах</div>
          <div v-for="p in mentions" :key="p" class="ar-item" @click="arch.openFile(p)">
            <span class="ar-item-icon">¶</span>
            <span class="ar-item-label">{{ docTitle(p, files[p]) }}</span>
          </div>
        </div>

        <div v-if="links.length">
          <div class="ar-label">Дела</div>
          <div v-for="l in links" :key="l.id" class="ar-item" @click="arch.go('tasks')">
            <span class="ar-item-icon">{{ l.done ? "✔" : "○" }}</span>
            <span class="ar-item-label" :style="{ textDecoration: l.done ? 'line-through' : 'none' }">{{ l.title }}</span>
            <span class="ar-dim" style="font-size: 12px">{{ STATUS[l.status] || l.status }}</span>
          </div>
        </div>
      </div>

      <!-- Шаг или связь -->
      <div v-else-if="edge" class="ar-el">
        <div>
          <div class="ar-el-kind">{{ title(edge.source) }} → {{ title(edge.target) }}</div>
          <div class="ar-el-title">{{ edge.label || "без подписи" }}</div>
        </div>
        <div class="ar-kv">
          <template v-if="edge.technology"><span>Технологии</span><span>{{ edge.technology }}</span></template>
          <template v-if="edge.kind"><span>Вид</span><span>{{ edge.kind }}</span></template>
        </div>
        <div v-if="(edge.tags || []).length" class="ar-row" style="gap: 6px">
          <span
            v-for="t in edge.tags"
            :key="t"
            class="ar-chip"
            :class="{ 'is-link': conceptPathForTag(paths, t) }"
            @click="conceptPathForTag(paths, t) && arch.openFile(conceptPathForTag(paths, t))"
          >
            <span class="ar-tag">#{{ t }}</span>
          </span>
        </div>
        <div v-if="edgeNotes" class="ar-card" style="padding: 0">
          <ArchMarkdown :text="edgeNotes" />
        </div>
        <div v-if="edgeDescription" class="ar-card" style="padding: 0">
          <ArchMarkdown :text="edgeDescription" />
        </div>
        <div v-if="edgeRelations.length">
          <div class="ar-label">Связи модели</div>
          <div v-for="r in edgeRelations" :key="r.id" class="ar-rel">
            <span>{{ title(r.source?.model) }} → {{ title(r.target?.model) }}</span>
            <span class="ar-muted">{{ r.title }}</span>
          </div>
        </div>
        <div class="ar-row">
          <button class="ar-btn is-small" @click="edgeSource">‹› В коде</button>
          <button class="ar-btn is-small" @click="arch.openElement(edge.source)">Откуда</button>
          <button class="ar-btn is-small" @click="arch.openElement(edge.target)">Куда</button>
        </div>
      </div>

      <div v-else class="ar-empty">Элемента «{{ elementId }}» нет в модели.</div>
    </div>
  </div>
</template>
