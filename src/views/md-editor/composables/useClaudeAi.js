import { ref, watch, nextTick } from 'vue';

const AI_KEY_STORAGE = 'claude-api-key';
const AI_MODE_STORAGE = 'claude-ai-mode';

export function useClaudeAi(mdParser) {
    const aiPanelOpen = ref(false);
    const aiMode = ref(localStorage.getItem(AI_MODE_STORAGE) || 'tab');
    const aiMessages = ref([]);
    const aiInputText = ref('');
    const aiStreaming = ref(false);
    const aiMessagesEl = ref(null);
    const aiKeyModalOpen = ref(false);
    const aiKeyInput = ref('');
    const tabPendingContext = ref('');
    let aiMsgId = 0;

    watch(aiMode, (val) => localStorage.setItem(AI_MODE_STORAGE, val));

    function getApiKey() { return localStorage.getItem(AI_KEY_STORAGE) || ''; }

    function openApiKeyModal() { aiKeyInput.value = getApiKey(); aiKeyModalOpen.value = true; }

    function confirmApiKey() {
        const key = aiKeyInput.value.trim();
        if (key) localStorage.setItem(AI_KEY_STORAGE, key);
        aiKeyModalOpen.value = false;
        aiKeyInput.value = '';
    }

    function toggleAiPanel() { aiPanelOpen.value = !aiPanelOpen.value; }
    function clearAiChat() { aiMessages.value = []; }

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function scrollAiToBottom() {
        nextTick(() => { if (aiMessagesEl.value) aiMessagesEl.value.scrollTop = aiMessagesEl.value.scrollHeight; });
    }

    function setContextFromSelection(text) {
        if (aiMode.value === 'api') {
            aiMessages.value.push({ id: aiMsgId++, role: 'context', content: text.slice(0, 400) });
            aiInputText.value = '';
            scrollAiToBottom();
        } else {
            tabPendingContext.value = text;
            aiInputText.value = '';
        }
    }

    function openInTab() {
        const question = aiInputText.value.trim();
        let text = '';
        if (tabPendingContext.value) text += `Контекст:\n"${tabPendingContext.value}"\n\n`;
        if (question) text += question;
        else if (tabPendingContext.value) text += 'Объясни этот фрагмент текста.';
        navigator.clipboard.writeText(text).catch(() => {});
        window.open('https://claude.ai/new', '_blank', 'noopener');
        tabPendingContext.value = '';
        aiInputText.value = '';
    }

    async function sendAiMessage() {
        const question = aiInputText.value.trim();
        if (!question || aiStreaming.value) return;

        const key = getApiKey();
        if (!key) { openApiKeyModal(); return; }

        const lastCtx = [...aiMessages.value].reverse().find(m => m.role === 'context');
        let userContent = question;
        if (lastCtx) userContent = `Контекст из текста:\n"${lastCtx.content}"\n\nВопрос: ${question}`;

        aiMessages.value.push({ id: aiMsgId++, role: 'user', content: question });
        aiInputText.value = '';
        scrollAiToBottom();

        const filtered = aiMessages.value.filter(m => m.role === 'user' || m.role === 'assistant');
        const apiMessages = filtered.map((m, i) =>
            (m.role === 'user' && i === filtered.length - 1)
                ? { role: 'user', content: userContent }
                : { role: m.role, content: m.content }
        );

        const assistantMsg = { id: aiMsgId++, role: 'assistant', content: '', streaming: true };
        aiMessages.value.push(assistantMsg);
        aiStreaming.value = true;
        scrollAiToBottom();

        try {
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true',
                },
                body: JSON.stringify({
                    model: 'claude-opus-4-6',
                    max_tokens: 2048,
                    stream: true,
                    system: 'Ты помощник для чтения и понимания текстов. Отвечай на русском, если вопрос на русском. Форматируй ответы с markdown когда уместно.',
                    messages: apiMessages,
                }),
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: { message: resp.statusText } }));
                assistantMsg.content = `Ошибка: ${err?.error?.message || resp.statusText}`;
                assistantMsg.streaming = false;
                return;
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') break;
                    try {
                        const evt = JSON.parse(data);
                        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                            assistantMsg.content += evt.delta.text;
                            scrollAiToBottom();
                        }
                    } catch {}
                }
            }
        } catch (err) {
            assistantMsg.content = `Ошибка соединения: ${err.message}`;
        } finally {
            assistantMsg.streaming = false;
            aiStreaming.value = false;
            scrollAiToBottom();
        }
    }

    return {
        aiPanelOpen, aiMode, aiMessages, aiInputText, aiStreaming, aiMessagesEl,
        aiKeyModalOpen, aiKeyInput, tabPendingContext,
        toggleAiPanel, clearAiChat, openApiKeyModal, confirmApiKey,
        sendAiMessage, openInTab, setContextFromSelection, escapeHtml, scrollAiToBottom,
        mdParser,
    };
}
