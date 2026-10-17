<script setup>
import { computed, inject, onBeforeUnmount, onMounted } from "vue";
import { conceptBody, termUsages } from "./archTerms.js";
import ArchMarkdown from "./ArchMarkdown.vue";

// Карточка термина: что это, как устроено у нас и все места проекта, где он
// применяется. Места собираются сами — по меткам модели и упоминаниям в текстах.
const props = defineProps({ term: { type: Object, required: true } });
const emit = defineEmits(["close"]);

const arch = inject("arch");
const { dump, files, paths } = arch;

const usages = computed(() => {
  void arch.fileVersion.value;
  return termUsages(dump.value, files, paths.value, props.term);
});
const body = computed(() => (props.term.conceptPath ? conceptBody(files[props.term.conceptPath]) : ""));

function go(fn) {
  emit("close", { keepReturn: true });
  fn();
}

function onKey(e) {
  if (e.key === "Escape") emit("close");
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="ar-drawer-back" @click.self="emit('close')">
    <aside class="ar-drawer">
      <div class="ar-pane-head">
        <span class="ar-el-kind" style="margin: 0">{{ term.kind === "concept" ? "Механизм" : "Термин" }}</span>
        <div class="ar-spacer" />
        <button class="ar-btn is-ghost is-small" @click="emit('close')">✕</button>
      </div>

      <div class="ar-drawer-body">
        <h2 class="ar-term-title">{{ term.title }}</h2>
        <p v-if="term.short" class="ar-term-short">{{ term.short }}</p>
        <p v-if="term.meaning && term.meaning !== term.short" class="ar-muted" style="font-size: 13px">
          📖 {{ term.meaning }}
        </p>

        <section class="ar-term-usages">
          <div class="ar-term-h">
            Где применяется в проекте
            <span class="ar-badge">{{ usages.total }}</span>
          </div>
          <div v-if="!usages.total" class="ar-muted" style="font-size: 13px">
            Пока нигде. Пометьте блок или связь в модели
            <span v-if="term.tag" class="ar-mono">#{{ term.tag }}</span> или упомяните термин в описании — место появится здесь само.
          </div>

          <template v-if="usages.elements.length">
            <div class="ar-label">Блоки схемы ({{ usages.elements.length }})</div>
            <a v-for="u in usages.elements" :key="u.id" class="ar-use" @click.prevent="go(() => arch.openElement(u.id))">
              <span class="ar-use-title">◇ {{ u.title }}</span>
              <span class="ar-use-how" :class="{ 'is-tag': u.how === 'метка' }">{{ u.how }}</span>
              <span class="ar-use-snip">{{ u.snip.before }}<mark v-if="u.snip.match">{{ u.snip.match }}</mark>{{ u.snip.after }}</span>
            </a>
          </template>

          <template v-if="usages.steps.length">
            <div class="ar-label">Шаги сценариев ({{ usages.steps.length }})</div>
            <a
              v-for="u in usages.steps"
              :key="u.viewId + u.n"
              class="ar-use"
              @click.prevent="go(() => arch.openView(u.viewId))"
            >
              <span class="ar-use-title">⇄ {{ u.viewTitle }} · шаг {{ u.n }}</span>
              <span class="ar-use-how" :class="{ 'is-tag': u.how === 'метка' }">{{ u.how }}</span>
              <span class="ar-use-snip">{{ u.snip.before }}<mark v-if="u.snip.match">{{ u.snip.match }}</mark>{{ u.snip.after }}</span>
            </a>
          </template>

          <template v-if="usages.relations.length">
            <div class="ar-label">Связи ({{ usages.relations.length }})</div>
            <a v-for="u in usages.relations" :key="u.id" class="ar-use" @click.prevent="go(() => arch.openElement(u.source))">
              <span class="ar-use-title">{{ u.from }} → {{ u.to }}</span>
              <span class="ar-use-how" :class="{ 'is-tag': u.how === 'метка' }">{{ u.how }}</span>
              <span class="ar-use-snip">{{ u.snip.before }}<mark v-if="u.snip.match">{{ u.snip.match }}</mark>{{ u.snip.after }}</span>
            </a>
          </template>

          <template v-if="usages.docs.length">
            <div class="ar-label">Документы ({{ usages.docs.length }})</div>
            <a v-for="u in usages.docs" :key="u.path" class="ar-use" @click.prevent="go(() => arch.openFile(u.path))">
              <span class="ar-use-title">¶ {{ u.title }}</span>
              <span v-for="(h, i) in u.hits" :key="i" class="ar-use-snip">{{ h.before }}<mark v-if="h.match">{{ h.match }}</mark>{{ h.after }}</span>
            </a>
          </template>
        </section>

        <details v-if="body" class="ar-term-how" open>
          <summary>Как устроено у нас</summary>
          <ArchMarkdown :text="body" :path="term.conceptPath" />
          <a href="#" class="ar-crumb" @click.prevent="go(() => arch.openFile(term.conceptPath))">Открыть описание целиком →</a>
        </details>
        <a
          v-else-if="term.glossaryPath"
          href="#"
          class="ar-crumb"
          @click.prevent="go(() => arch.openFile(term.glossaryPath))"
        >Открыть глоссарий →</a>
      </div>
    </aside>
  </div>
</template>
