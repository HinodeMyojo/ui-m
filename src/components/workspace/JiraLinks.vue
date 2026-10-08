<script setup>
import { computed } from "vue";
import { jiraLinks } from "@/composables/jira.js";

// Кнопки «открыть в Jira» по кодам из названия задачи. Кодов нет — ничего нет.
const props = defineProps({
  texts: { type: Array, required: true },
});

const links = computed(() => jiraLinks(...props.texts));
</script>

<template>
  <div v-if="links.length" class="jira">
    <a
      v-for="l in links"
      :key="l.key"
      class="jira-link"
      :href="l.url"
      target="_blank"
      rel="noopener"
      :title="'Открыть в Jira: ' + l.url"
      @click.stop
    >
      <span class="jira-mark">J</span>{{ l.key }}<span class="jira-arrow">↗</span>
    </a>
  </div>
</template>

<style scoped>
.jira {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.jira-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 4px 12px 4px 5px;
  border-radius: 20px;
  border: 1px solid #2b4f8f;
  background: #16223a;
  color: #9cc2ff;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  letter-spacing: 0.02em;
}

.jira-link:hover {
  background: #1c2c4b;
  border-color: #4a7fd6;
  color: #cfe0ff;
}

.jira-mark {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #2684ff;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

.jira-arrow {
  opacity: 0.7;
}
</style>
