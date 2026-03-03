<template>
    <div class="pdf-search-bar">
        <input ref="inputEl" class="pdf-search-input" type="text" placeholder="Поиск в PDF…" :value="searchQuery"
            @input="emit('update:searchQuery', $event.target.value)" @keydown.enter="emit('next')"
            @keydown.escape="emit('close')" />
        <span class="pdf-search-count">
            <template v-if="isSearching">…</template>
            <template v-else-if="matchCount > 0">{{ currentMatchIdx + 1 }}&thinsp;/&thinsp;{{ matchCount }}</template>
            <template v-else-if="searchQuery">Нет совпадений</template>
        </span>
        <button class="pdf-search-nav" @click="emit('prev')" :disabled="matchCount === 0" title="Предыдущее">↑</button>
        <button class="pdf-search-nav" @click="emit('next')" :disabled="matchCount === 0" title="Следующее">↓</button>
        <button class="pdf-search-close" @click="emit('close')">✕</button>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

defineProps({ searchQuery: String, matchCount: Number, currentMatchIdx: Number, isSearching: Boolean });
const emit = defineEmits(['update:searchQuery', 'next', 'prev', 'close']);

const inputEl = ref(null);
onMounted(() => inputEl.value?.focus());
</script>
