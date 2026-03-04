<template>
    <!-- API Key Modal -->
    <div v-if="aiKeyModalOpen" class="ai-key-modal-overlay" @click.self="$emit('close-key-modal')">
        <div class="ai-key-modal">
            <div class="ai-key-modal-title">🤖 Claude API Key</div>
            <p class="ai-key-modal-desc">Введите ваш Anthropic API ключ. Он сохранится в localStorage только в браузере.</p>
            <input :value="aiKeyInput" @input="$emit('update:aiKeyInput', $event.target.value)"
                   type="password" class="ai-key-input" placeholder="sk-ant-..."
                   @keydown.enter="$emit('confirm-key')" @keydown.stop />
            <div class="ai-key-modal-actions">
                <button class="ai-key-save-btn" @click="$emit('confirm-key')">Сохранить</button>
                <button class="ai-key-cancel-btn" @click="$emit('close-key-modal')">Отмена</button>
            </div>
        </div>
    </div>

    <!-- AI Chat Panel -->
    <div v-if="open" class="ai-panel" :class="{ dark: darkMode }"
         :style="sidebarOpen ? { right: sidebarWidth + 'px' } : {}"
         @click.stop>
        <div class="ai-panel-header">
            <span class="ai-panel-title">🤖 Claude AI</span>
            <div class="ai-panel-actions">
                <div class="ai-mode-toggle">
                    <button class="ai-mode-btn" :class="{ active: aiMode === 'api' }" @click="$emit('update:aiMode', 'api')">API</button>
                    <button class="ai-mode-btn" :class="{ active: aiMode === 'tab' }" @click="$emit('update:aiMode', 'tab')">claude.ai</button>
                </div>
                <button v-if="aiMode === 'api'" class="ai-panel-btn" @click="$emit('clear')" title="Очистить чат">🗑</button>
                <button v-if="aiMode === 'api'" class="ai-panel-btn" @click="$emit('open-key-modal')" title="API ключ">🔑</button>
                <button class="ai-panel-btn ai-panel-close" @click="$emit('update:open', false)">✕</button>
            </div>
        </div>

        <!-- API mode -->
        <template v-if="aiMode === 'api'">
            <div class="ai-messages" ref="aiMessagesElRef">
                <div v-if="!aiMessages.length" class="ai-empty">
                    Выделите текст и нажмите «Спросить Claude», или задайте вопрос ниже.<br><br>
                    <small>Нужен API ключ с <b>console.anthropic.com</b></small>
                </div>
                <div v-for="msg in aiMessages" :key="msg.id" class="ai-message" :class="'ai-message-' + msg.role">
                    <div v-if="msg.role === 'context'" class="ai-context-block">
                        <span class="ai-context-label">📎 Контекст:</span>
                        <span class="ai-context-text">{{ msg.content }}</span>
                    </div>
                    <template v-else>
                        <div class="ai-message-bubble"
                             v-html="msg.role === 'assistant' ? mdParser.parse(msg.content || '...') : escapeHtml(msg.content)"></div>
                        <div v-if="msg.role === 'assistant' && msg.streaming" class="ai-streaming-dot"></div>
                    </template>
                </div>
            </div>
            <div class="ai-input-row">
                <textarea :value="aiInputText" @input="$emit('update:aiInputText', $event.target.value)"
                          class="ai-input" placeholder="Задайте вопрос... (Enter — отправить)" rows="2"
                          @keydown.enter.exact.prevent="$emit('send')" @keydown.stop />
                <button class="ai-send-btn" @click="$emit('send')" :disabled="aiStreaming">
                    {{ aiStreaming ? '⏳' : '➤' }}
                </button>
            </div>
        </template>

        <!-- Tab mode -->
        <template v-else>
            <div class="ai-tab-body">
                <div class="ai-tab-icon">🌐</div>
                <div class="ai-tab-desc">
                    Откроет <b>claude.ai</b> в новой вкладке в вашем браузере.<br>
                    Используется ваша существующая сессия — логин не сбивается.
                </div>
                <div v-if="tabPendingContext" class="ai-tab-context-preview">
                    <div class="ai-tab-context-label">📎 Выделенный текст будет скопирован:</div>
                    <div class="ai-tab-context-text">{{ tabPendingContext.slice(0, 200) }}{{ tabPendingContext.length > 200 ? '…' : '' }}</div>
                </div>
                <div class="ai-tab-input-group">
                    <textarea :value="aiInputText" @input="$emit('update:aiInputText', $event.target.value)"
                              class="ai-input ai-tab-input"
                              :placeholder="tabPendingContext ? 'Добавьте вопрос (необязательно)...' : 'Введите вопрос или выделите текст...'"
                              rows="3" @keydown.stop />
                    <button class="ai-tab-open-btn" @click="$emit('open-in-tab')">Открыть claude.ai →</button>
                    <div class="ai-tab-hint">Текст скопируется в буфер — вставьте его в Claude (Ctrl+V)</div>
                </div>
            </div>
        </template>
    </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
    open: Boolean,
    darkMode: Boolean,
    sidebarOpen: Boolean,
    sidebarWidth: { type: Number, default: 0 },
    aiMode: { type: String, default: 'tab' },
    aiMessages: { type: Array, default: () => [] },
    aiInputText: { type: String, default: '' },
    aiStreaming: Boolean,
    aiKeyModalOpen: Boolean,
    aiKeyInput: { type: String, default: '' },
    tabPendingContext: { type: String, default: '' },
    mdParser: Object,
    escapeHtml: { type: Function, default: (s) => s },
});

defineEmits([
    'update:open', 'update:aiMode', 'update:aiInputText', 'update:aiKeyInput',
    'send', 'clear', 'open-key-modal', 'close-key-modal', 'confirm-key', 'open-in-tab',
]);

const aiMessagesElRef = ref(null);

// Scroll to bottom when messages change
watch(() => props.aiMessages.length, () => {
    setTimeout(() => { if (aiMessagesElRef.value) aiMessagesElRef.value.scrollTop = aiMessagesElRef.value.scrollHeight; }, 30);
});
</script>

<style scoped>
/* ===== Note tooltip AI button ===== */
:global(.note-tooltip-ai-btn) {
    background: #6d28d9 !important;
}
:global(.note-tooltip-ai-btn:hover) {
    background: #5b21b6 !important;
}

/* ===== AI Panel ===== */
.ai-panel {
    position: fixed;
    right: 0;
    bottom: 0;
    top: 52px;
    width: 380px;
    z-index: 2000;
    background: #fff;
    border-left: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 24px rgba(0,0,0,0.12);
    font-size: 13px;
    transition: right 0.2s;
}
.ai-panel.dark { background: #181825; border-left-color: #313244; color: #cdd6f4; }

.ai-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
}
.ai-panel.dark .ai-panel-header { border-bottom-color: #313244; }

.ai-panel-title { font-weight: 700; font-size: 13px; color: #6d28d9; }
.ai-panel.dark .ai-panel-title { color: #cba6f7; }

.ai-panel-actions { display: flex; gap: 4px; align-items: center; }

.ai-mode-toggle { display: flex; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-right: 4px; }
.ai-panel.dark .ai-mode-toggle { border-color: #45475a; }

.ai-mode-btn {
    padding: 3px 9px; border: none; background: none;
    font-size: 11px; font-weight: 600; cursor: pointer;
    color: #94a3b8; transition: background 0.12s, color 0.12s; font-family: inherit;
}
.ai-mode-btn.active { background: #7c3aed; color: #fff; }
.ai-mode-btn:not(.active):hover { background: #f1f5f9; color: #475569; }
.ai-panel.dark .ai-mode-btn:not(.active):hover { background: #313244; color: #cdd6f4; }

.ai-panel-btn {
    background: none; border: none; cursor: pointer; padding: 3px 7px;
    border-radius: 4px; font-size: 13px; color: #64748b; transition: background 0.12s;
}
.ai-panel-btn:hover { background: #f1f5f9; color: #1e293b; }
.ai-panel.dark .ai-panel-btn { color: #a6adc8; }
.ai-panel.dark .ai-panel-btn:hover { background: #313244; color: #cdd6f4; }
.ai-panel-close { color: #94a3b8; }
.ai-panel-close:hover { color: #f87171 !important; }

.ai-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }

.ai-empty { color: #94a3b8; text-align: center; padding: 24px 12px; font-size: 12px; line-height: 1.5; }

.ai-message-user .ai-message-bubble {
    background: #eff6ff; color: #1e3a5f; border-radius: 12px 12px 4px 12px;
    padding: 8px 12px; margin-left: auto; max-width: 90%; word-break: break-word;
}
.ai-panel.dark .ai-message-user .ai-message-bubble { background: #1e2640; color: #bfdbfe; }

.ai-message-assistant .ai-message-bubble {
    background: #f8fafc; color: #1e293b; border-radius: 12px 12px 12px 4px;
    padding: 8px 12px; max-width: 98%; word-break: break-word; border: 1px solid #e2e8f0;
}
.ai-panel.dark .ai-message-assistant .ai-message-bubble { background: #1e1e2e; color: #cdd6f4; border-color: #313244; }

.ai-message-assistant .ai-message-bubble :deep(p) { margin: 0 0 6px; }
.ai-message-assistant .ai-message-bubble :deep(p:last-child) { margin: 0; }
.ai-message-assistant .ai-message-bubble :deep(ul),
.ai-message-assistant .ai-message-bubble :deep(ol) { margin: 0 0 6px; padding-left: 20px; }
.ai-message-assistant .ai-message-bubble :deep(li) { margin: 0 0 2px; display: list-item; }
.ai-message-assistant .ai-message-bubble :deep(code) { background: #0d1117; color: #e6edf3; padding: 1px 5px; border-radius: 3px; font-size: 0.85em; }
.ai-message-assistant .ai-message-bubble :deep(pre) { background: #0d1117; color: #e6edf3; padding: 10px 12px; border-radius: 6px; overflow-x: auto; margin: 6px 0; }
.ai-message-assistant .ai-message-bubble :deep(pre code) { background: none; padding: 0; }
.ai-message-assistant .ai-message-bubble :deep(strong) { color: #9d174d; font-weight: 700; }
.ai-panel.dark .ai-message-assistant .ai-message-bubble :deep(strong) { color: #f5c2e7; }
.ai-message-assistant .ai-message-bubble :deep(h1),
.ai-message-assistant .ai-message-bubble :deep(h2),
.ai-message-assistant .ai-message-bubble :deep(h3) { margin: 8px 0 4px; font-size: 1em; font-weight: 700; }

.ai-streaming-dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%;
    background: #6d28d9; margin: 4px 0 0 4px; animation: ai-blink 0.8s infinite;
}
.ai-panel.dark .ai-streaming-dot { background: #cba6f7; }

@keyframes ai-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.2; }
}

.ai-context-block {
    background: #faf5ff; border-left: 3px solid #a855f7;
    padding: 6px 10px; border-radius: 0 6px 6px 0; font-size: 12px; color: #581c87;
}
.ai-panel.dark .ai-context-block { background: #1e1030; border-left-color: #cba6f7; color: #e9d5ff; }
.ai-context-label { font-weight: 700; margin-right: 4px; }
.ai-context-text { opacity: 0.8; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.ai-input-row { display: flex; gap: 6px; padding: 10px 12px; border-top: 1px solid #e2e8f0; flex-shrink: 0; align-items: flex-end; }
.ai-panel.dark .ai-input-row { border-top-color: #313244; }

.ai-input {
    flex: 1; border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px;
    font-size: 13px; font-family: inherit; resize: none; outline: none;
    background: #fff; color: #1e293b; line-height: 1.4;
}
.ai-input:focus { border-color: #7c3aed; box-shadow: 0 0 0 2px #7c3aed22; }
.ai-panel.dark .ai-input { background: #1e1e2e; border-color: #45475a; color: #cdd6f4; }
.ai-panel.dark .ai-input:focus { border-color: #cba6f7; box-shadow: 0 0 0 2px #cba6f722; }

.ai-send-btn {
    padding: 8px 12px; border: none; border-radius: 8px; background: #7c3aed;
    color: #fff; font-size: 15px; cursor: pointer; transition: background 0.12s;
    flex-shrink: 0; height: 36px;
}
.ai-send-btn:hover:not(:disabled) { background: #6d28d9; }
.ai-send-btn:disabled { opacity: 0.5; cursor: default; }

/* Tab mode */
.ai-tab-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 20px; gap: 16px; overflow-y: auto; }
.ai-tab-icon { font-size: 40px; line-height: 1; }
.ai-tab-desc { font-size: 13px; color: #475569; text-align: center; line-height: 1.6; }
.ai-panel.dark .ai-tab-desc { color: #a6adc8; }
.ai-tab-desc :deep(b) { color: #1e293b; }
.ai-panel.dark .ai-tab-desc :deep(b) { color: #cdd6f4; }

.ai-tab-context-preview { width: 100%; background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 8px; padding: 10px 12px; font-size: 12px; }
.ai-panel.dark .ai-tab-context-preview { background: #1e1030; border-color: #6d28d9; }
.ai-tab-context-label { font-weight: 700; color: #7c3aed; margin-bottom: 4px; display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.ai-panel.dark .ai-tab-context-label { color: #cba6f7; }
.ai-tab-context-text { color: #374151; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 4; line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.ai-panel.dark .ai-tab-context-text { color: #e9d5ff; }

.ai-tab-input-group { width: 100%; display: flex; flex-direction: column; gap: 8px; }
.ai-tab-input { width: 100% !important; }

.ai-tab-open-btn {
    padding: 10px; border: none; border-radius: 8px;
    background: linear-gradient(135deg, #7c3aed, #2563eb);
    color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity 0.12s; text-align: center;
}
.ai-tab-open-btn:hover { opacity: 0.88; }
.ai-tab-hint { font-size: 11px; color: #94a3b8; text-align: center; }
.ai-panel.dark .ai-tab-hint { color: #585b70; }

/* API Key Modal */
.ai-key-modal-overlay {
    position: fixed; inset: 0; z-index: 5000; background: rgba(0,0,0,0.55);
    display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);
}
.ai-key-modal { background: #fff; border-radius: 14px; padding: 28px 28px 22px; width: 400px; box-shadow: 0 16px 48px rgba(0,0,0,0.3); }
.ai-key-modal-title { font-size: 18px; font-weight: 700; margin-bottom: 10px; color: #1e293b; }
.ai-key-modal-desc { font-size: 13px; color: #64748b; margin-bottom: 16px; line-height: 1.5; }
.ai-key-input {
    width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px;
    font-size: 14px; font-family: 'Fira Code', monospace; outline: none; margin-bottom: 16px;
    color: #1e293b; background: #f8fafc;
}
.ai-key-input:focus { border-color: #7c3aed; box-shadow: 0 0 0 2px #7c3aed22; background: #fff; }
.ai-key-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
.ai-key-save-btn { padding: 8px 20px; border: none; border-radius: 8px; background: #7c3aed; color: #fff; font-size: 13px; cursor: pointer; font-weight: 600; transition: background 0.12s; }
.ai-key-save-btn:hover { background: #6d28d9; }
.ai-key-cancel-btn { padding: 8px 16px; border: 1px solid #e2e8f0; border-radius: 8px; background: none; color: #64748b; font-size: 13px; cursor: pointer; transition: background 0.12s; }
.ai-key-cancel-btn:hover { background: #f1f5f9; }
</style>
