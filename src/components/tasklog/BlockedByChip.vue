<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";

// «⛓ ждёт: …» — на какое дело ссылается блокер и закрыто ли оно.
// Блокирующее дело закрыли, а блокер ещё висит — подсказываем снять его:
// снимать молча не стали, вдруг ждали не только этого.
const props = defineProps({
  blockedBy: { type: Object, required: true },
  resolved: { type: Boolean, default: false },
});
const emit = defineEmits(["resolve"]);

const router = useRouter();

const closed = computed(() => props.blockedBy.done || props.blockedBy.dropped);

const context = computed(() => {
  const ref = props.blockedBy;
  if (!ref.context) return "";
  if (ref.kind !== "item") return ref.context;
  const d = new Date(ref.context + "T12:00:00");
  return Number.isNaN(d.getTime())
    ? ref.context
    : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
});

// Карточка дня открывается в своём дне; задача с главной — на главной.
function open() {
  const ref = props.blockedBy;
  if (ref.missing) return;
  if (ref.kind === "item" && ref.context) router.push({ path: "/today", query: { date: ref.context } });
}
</script>

<template>
  <div class="bbc" :class="{ closed, missing: blockedBy.missing }">
    <span class="bbc-label">⛓ ждёт:</span>
    <span class="bbc-title" :class="{ link: blockedBy.kind === 'item' && !blockedBy.missing }" @click="open">
      <template v-if="blockedBy.missing">дело удалено</template>
      <template v-else>
        {{ blockedBy.done ? "✅" : blockedBy.dropped ? "✖" : blockedBy.kind === "item" ? "📓" : "📋" }}
        {{ blockedBy.title }}
        <i v-if="context" class="bbc-dim">· {{ context }}</i>
      </template>
    </span>
    <button v-if="closed && !resolved" type="button" class="bbc-resolve" @click="emit('resolve')">
      {{ blockedBy.done ? "закрыта" : "отменена" }} — снять блокер
    </button>
  </div>
</template>

<style scoped>
.bbc {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  font-size: 12.5px;
  margin-top: 3px;
}

.bbc-label {
  color: #ff9ba0;
}

.bbc.closed .bbc-label {
  color: #a8e59a;
}

.bbc-title {
  color: #e8eaf2;
}

.bbc-title.link {
  cursor: pointer;
  text-decoration: underline dotted;
}

.bbc.missing .bbc-title {
  color: #7a7f8e;
  font-style: italic;
}

.bbc-dim {
  color: #7a7f8e;
  font-style: normal;
}

.bbc-resolve {
  background: #63c94f1f;
  border: 1px solid #63c94f66;
  color: #a8e59a;
  border-radius: 10px;
  padding: 1px 8px;
  font-size: 11.5px;
  cursor: pointer;
}
</style>
