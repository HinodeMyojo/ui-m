<template>
    <Teleport to="body">
        <div v-if="visible" class="pdf-translate-backdrop" @click.self="emit('close')">
            <div class="pdf-ts-panel" @click.stop>

                <div class="pdf-tm-header">
                    <span class="pdf-tm-title">⚙️ Настройки перевода</span>
                    <button class="pdf-tm-close" @click="emit('close')">✕</button>
                </div>

                <!-- ── DeepL Section ── -->
                <div class="pdf-ts-section">
                    <label class="pdf-ts-label">DeepL API ключ (для перевода)</label>
                    <div class="pdf-ts-key-row">
                        <input
                            class="pdf-ts-key-input"
                            :type="showDeeplKey ? 'text' : 'password'"
                            v-model="deeplKeyInput"
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
                            @blur="saveDeeplKey"
                            @keydown.enter="saveDeeplKey"
                        />
                        <button class="pdf-tb-btn pdf-tb-sm" @click="showDeeplKey = !showDeeplKey" title="Показать/скрыть">
                            {{ showDeeplKey ? '🙈' : '👁' }}
                        </button>
                    </div>
                    <div class="pdf-ts-hint">
                        Бесплатный ключ:
                        <a href="https://www.deepl.com/en/pro#developer" target="_blank" rel="noopener" class="pdf-ts-link">
                            deepl.com/pro#developer
                        </a>
                        (500K символов/мес бесплатно)
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
                        <button class="pdf-tm-save-btn" @click="onCheckKey" :disabled="checking">
                            {{ checking ? '…' : '✓ Проверить ключ' }}
                        </button>
                        <span v-if="checkResult" :class="['pdf-ts-check-result', checkResult.ok ? 'ok' : 'err']">
                            {{ checkResult.ok
                                ? `✓ ${fmt(checkResult.used)} / ${fmt(checkResult.limit)} символов`
                                : `✗ ${checkResult.error}` }}
                        </span>
                    </div>
                </div>

                <!-- ── AI Analysis Section ── -->
                <div class="pdf-ts-section">
                    <label class="pdf-ts-label">AI для разбора (вкладка «Разбор»)</label>

                    <!-- Provider selector -->
                    <div class="pdf-ts-provider-row">
                        <button v-for="p in providers" :key="p.id"
                            class="pdf-ts-provider-btn"
                            :class="{ active: localProvider === p.id }"
                            @click="localProvider = p.id">
                            {{ p.label }}
                        </button>
                    </div>

                    <!-- API key for selected provider -->
                    <div class="pdf-ts-key-row" style="margin-top:8px;">
                        <input
                            class="pdf-ts-key-input"
                            :type="showAiKey ? 'text' : 'password'"
                            v-model="aiKeyInput"
                            :placeholder="currentProvider.placeholder"
                            @blur="saveAiKey"
                            @keydown.enter="saveAiKey"
                        />
                        <button class="pdf-tb-btn pdf-tb-sm" @click="showAiKey = !showAiKey" title="Показать/скрыть">
                            {{ showAiKey ? '🙈' : '👁' }}
                        </button>
                    </div>
                    <div class="pdf-ts-hint">
                        <a :href="currentProvider.link" target="_blank" rel="noopener" class="pdf-ts-link">
                            {{ currentProvider.linkLabel }}
                        </a>
                    </div>
                </div>

                <!-- Storage toggle (greyed out) -->
                <div class="pdf-ts-section pdf-ts-section-disabled">
                    <label class="pdf-ts-label">Хранение ключей</label>
                    <div class="pdf-ts-storage-row">
                        <button class="pdf-ts-storage-btn active" disabled>Браузер (localStorage)</button>
                        <button class="pdf-ts-storage-btn" disabled title="Скоро">
                            🔒 Сервер
                            <span class="pdf-ts-soon">Скоро</span>
                        </button>
                    </div>
                </div>

            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
    visible: Boolean,
    apiKey: { type: String, default: '' },
    checkApiKey: { type: Function, required: true },
    analyzeProvider: { type: String, default: 'gemini' },
    analyzeKeys: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['close', 'update:apiKey', 'update:analyzeProvider', 'update:analyzeKeys']);

const providers = [
    {
        id: 'gigachat',
        label: 'GigaChat',
        placeholder: 'Client Credentials (Base64)',
        link: 'https://developers.sber.ru/portal/products/gigachat-api',
        linkLabel: 'developers.sber.ru — GigaChat API (есть бесплатный тариф)',
    },
    {
        id: 'gemini',
        label: 'Gemini',
        placeholder: 'AIza...',
        link: 'https://aistudio.google.com/apikey',
        linkLabel: 'aistudio.google.com/apikey (бесплатно)',
    },
    {
        id: 'claude',
        label: 'Claude',
        placeholder: 'sk-ant-...',
        link: 'https://console.anthropic.com/settings/keys',
        linkLabel: 'console.anthropic.com/settings/keys',
    },
    {
        id: 'openai',
        label: 'OpenAI',
        placeholder: 'sk-proj-...',
        link: 'https://platform.openai.com/api-keys',
        linkLabel: 'platform.openai.com/api-keys',
    },
];

// DeepL
const deeplKeyInput = ref(props.apiKey);
const showDeeplKey = ref(false);
const checking = ref(false);
const checkResult = ref(null);

watch(() => props.apiKey, v => { deeplKeyInput.value = v; });
watch(() => props.visible, v => {
    if (v) {
        deeplKeyInput.value = props.apiKey;
        checkResult.value = null;
        localProvider.value = props.analyzeProvider;
        aiKeyInput.value = props.analyzeKeys[props.analyzeProvider] ?? '';
    }
});

function saveDeeplKey() { emit('update:apiKey', deeplKeyInput.value.trim()); }

async function onCheckKey() {
    saveDeeplKey();
    checking.value = true;
    checkResult.value = null;
    await new Promise(r => setTimeout(r, 50));
    checkResult.value = await props.checkApiKey();
    checking.value = false;
}

// AI provider
const localProvider = ref(props.analyzeProvider);
const showAiKey = ref(false);
const aiKeyInput = ref(props.analyzeKeys[props.analyzeProvider] ?? '');

const currentProvider = computed(() => providers.find(p => p.id === localProvider.value) ?? providers[0]);

watch(localProvider, (v) => {
    emit('update:analyzeProvider', v);
    aiKeyInput.value = props.analyzeKeys[v] ?? '';
});

function saveAiKey() {
    const updated = { ...props.analyzeKeys, [localProvider.value]: aiKeyInput.value.trim() };
    emit('update:analyzeKeys', updated);
}

function fmt(n) {
    if (n == null) return '?';
    return n.toLocaleString('ru-RU');
}
</script>
