<script setup>
// Ключи доступа для нейросетей — блок профиля.
//
// Один ключ на клиента: Claude на телефоне, ChatGPT, Cursor, свой скрипт.
// Срок жизни выбирается при выпуске, протухший ключ не пускает — выпускают
// новый. Ключ и адреса с ним видны один раз: на сервере лежит только
// отпечаток. Как подключать — вкладки под ключом.
import { computed, onMounted, ref } from "vue";
import { fetchAiTokens, issueAiToken, revokeAiToken } from "./api";

const props = defineProps({
  guest: { type: Boolean, default: false },
});

const tokens = ref([]);
const error = ref("");
const busy = ref(false);
const issued = ref(null);
const copiedKey = ref("");
const tab = ref("claude");

const TTL = [
  { value: 60, label: "1 час" },
  { value: 24 * 60, label: "1 день" },
  { value: 7 * 24 * 60, label: "7 дней" },
  { value: 30 * 24 * 60, label: "30 дней" },
  { value: 90 * 24 * 60, label: "90 дней" },
  { value: 365 * 24 * 60, label: "1 год" },
  { value: "custom", label: "до даты…" },
];
const form = ref({ name: "", ttl: 30 * 24 * 60, until: "", readOnly: false });

async function load() {
  try {
    tokens.value = await fetchAiTokens();
    error.value = "";
  } catch (e) {
    error.value = String(e?.message || e);
  }
}
onMounted(load);

async function issue() {
  const f = form.value;
  error.value = "";
  const body = { name: f.name.trim(), readOnly: f.readOnly };
  if (f.ttl === "custom") {
    if (!f.until) {
      error.value = "Выбери дату, до которой ключ живёт";
      return;
    }
    body.expiresAt = new Date(`${f.until}T23:59:00`).toISOString();
  } else {
    body.ttlMinutes = f.ttl;
  }
  busy.value = true;
  try {
    issued.value = await issueAiToken(body);
    copiedKey.value = "";
    form.value = { name: "", ttl: f.ttl, until: "", readOnly: false };
    await load();
  } catch (e) {
    error.value = String(e?.message || e);
  } finally {
    busy.value = false;
  }
}

async function revoke(t) {
  if (!confirm(`Погасить ключ «${t.name}»? Нейросеть с ним больше не зайдёт.`)) return;
  busy.value = true;
  try {
    await revokeAiToken(t.id);
    if (issued.value?.id === t.id) issued.value = null;
    await load();
  } catch (e) {
    error.value = String(e?.message || e);
  } finally {
    busy.value = false;
  }
}

async function copy(text, key) {
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = key;
  } catch {
    copiedKey.value = "";
  }
}

const snippets = computed(() => {
  const t = issued.value;
  if (!t) return {};
  return {
    json: JSON.stringify(
      { mcpServers: { planner: { url: t.llmUrl, headers: { Authorization: `Bearer ${t.token}` } } } },
      null,
      2,
    ),
    cli: `claude mcp add --transport http planner ${t.llmUrl} --header "Authorization: Bearer ${t.token}"`,
    curl: `curl -s ${t.llmUrl}/tools/get_day \\\n  -H "Authorization: Bearer ${t.token}" \\\n  -H "Content-Type: application/json" -d '{}'`,
  };
});

function when(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function left(t) {
  if (t.legacy) return "без срока (старый адрес)";
  if (t.expired) return `истёк ${when(t.expiresAt)}`;
  const ms = new Date(t.expiresAt) - Date.now();
  const h = Math.round(ms / 3600000);
  if (h < 48) return `ещё ${Math.max(1, h)} ч · до ${when(t.expiresAt)}`;
  return `ещё ${Math.round(h / 24)} дн · до ${when(t.expiresAt)}`;
}
</script>

<template>
  <section class="card ai-keys">
    <h2>Нейросети — доступ к сайту</h2>
    <p class="hint">
      Любая нейросеть может читать и вести твой сайт: план дня в «Сегодня», ветку развития, уровни и места поездок,
      хаб, архитектуру. Выпусти ключ для каждого клиента — Claude, ChatGPT, Cursor, свой скрипт — и выбери, сколько он
      живёт. Протухший ключ перестаёт пускать сам.
    </p>

    <div v-if="tokens.length" class="ak-list">
      <div v-for="t in tokens" :key="t.id" class="ak-row" :class="{ expired: t.expired }">
        <div class="ak-main">
          <b>{{ t.name }}</b>
          <span class="ak-tags">
            <i v-if="t.readOnly" class="ak-tag">только чтение</i>
            <i v-if="t.expired" class="ak-tag bad">протух</i>
            <i v-else-if="t.legacy" class="ak-tag warn">без срока</i>
          </span>
        </div>
        <div class="ak-meta">
          {{ left(t) }} ·
          {{ t.lastUsedAt ? `заходил ${when(t.lastUsedAt)}` : "ещё не заходил" }}
        </div>
        <button class="ghost" :disabled="busy" @click="revoke(t)">Погасить</button>
      </div>
    </div>
    <p v-else class="hint">Ключей пока нет.</p>

    <form class="ak-form" @submit.prevent="issue">
      <input v-model="form.name" placeholder="Для кого ключ: Claude на телефоне, ChatGPT, Cursor…" maxlength="100" />
      <div class="row">
        <label>Живёт
          <select v-model="form.ttl">
            <option v-for="o in TTL" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>
        <input v-if="form.ttl === 'custom'" v-model="form.until" type="date" />
        <label class="ak-check"><input v-model="form.readOnly" type="checkbox" /> только чтение</label>
        <button class="primary" type="submit" :disabled="busy || !form.name.trim()">Выпустить ключ</button>
      </div>
      <p v-if="props.guest" class="hint">С гостевой учёткой любой ключ работает только на чтение.</p>
    </form>

    <div v-if="issued" class="ak-issued">
      <p class="notice">
        Ключ «{{ issued.name }}» готов, живёт до {{ when(issued.expiresAt) }}. Ключ и адреса показываются один раз —
        скопируй сейчас.
      </p>
      <div class="ak-copy">
        <span>Ключ</span>
        <input :value="issued.token" readonly @focus="$event.target.select()" />
        <button class="primary" @click="copy(issued.token, 'token')">{{ copiedKey === "token" ? "✓" : "Копировать" }}</button>
      </div>

      <nav class="ak-tabs">
        <button :class="{ on: tab === 'claude' }" @click="tab = 'claude'">Claude / ChatGPT</button>
        <button :class="{ on: tab === 'mcp' }" @click="tab = 'mcp'">Cursor, Claude Code и др.</button>
        <button :class="{ on: tab === 'http' }" @click="tab = 'http'">Без MCP</button>
      </nav>

      <div v-if="tab === 'claude'" class="ak-pane">
        <div class="ak-copy">
          <span>Адрес</span>
          <input :value="issued.mcpUrl" readonly @focus="$event.target.select()" />
          <button class="primary" @click="copy(issued.mcpUrl, 'mcp')">{{ copiedKey === "mcp" ? "✓" : "Копировать" }}</button>
        </div>
        <ol class="steps">
          <li><b>Claude</b> (claude.ai): Настройки → Connectors → <b>Add custom connector</b>, URL — этот адрес, авторизацию не заполнять. Коннектор появится и в приложении на телефоне.</li>
          <li><b>ChatGPT</b>: Настройки → Apps & Connectors → режим разработчика → <b>Create</b>, URL — этот адрес, без аутентификации.</li>
          <li>Ключ здесь внутри адреса — адрес и есть пароль, никому его не показывай.</li>
        </ol>
      </div>

      <div v-else-if="tab === 'mcp'" class="ak-pane">
        <p class="hint">MCP-клиенты с заголовками: адрес <code>{{ issued.llmUrl }}</code>, ключ — в <code>Authorization: Bearer</code>.</p>
        <div class="ak-code">
          <pre>{{ snippets.json }}</pre>
          <button class="ghost" @click="copy(snippets.json, 'json')">{{ copiedKey === "json" ? "✓" : "Копировать" }}</button>
        </div>
        <p class="hint">Cursor — в <code>.cursor/mcp.json</code>; другие клиенты (Windsurf, Cline, LM Studio) — в свой файл MCP-серверов. Claude Code — одной командой:</p>
        <div class="ak-code">
          <pre>{{ snippets.cli }}</pre>
          <button class="ghost" @click="copy(snippets.cli, 'cli')">{{ copiedKey === "cli" ? "✓" : "Копировать" }}</button>
        </div>
      </div>

      <div v-else class="ak-pane">
        <p class="hint">
          Для моделей без MCP — GPT Actions, свой бот, любая обвязка с function calling. Описание инструментов в OpenAPI:
        </p>
        <div class="ak-copy">
          <span>OpenAPI</span>
          <input :value="issued.openApi" readonly @focus="$event.target.select()" />
          <button class="primary" @click="copy(issued.openApi, 'oa')">{{ copiedKey === "oa" ? "✓" : "Копировать" }}</button>
        </div>
        <p class="hint">
          <code>GET …/tools</code> — список инструментов с JSON-схемами, <code>POST …/tools/&lt;имя&gt;</code> — вызов, тело —
          аргументы, ответ — <code>{"text": …}</code>. Пример:
        </p>
        <div class="ak-code">
          <pre>{{ snippets.curl }}</pre>
          <button class="ghost" @click="copy(snippets.curl, 'curl')">{{ copiedKey === "curl" ? "✓" : "Копировать" }}</button>
        </div>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>

<style scoped>
.ak-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ak-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 10px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #2a2d38;
}

.ak-row.expired {
  opacity: 0.6;
}

.ak-main {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ak-meta {
  grid-column: 1;
  font-size: 12px;
  color: #9aa0b0;
}

.ak-row > button {
  grid-row: 1 / span 2;
  grid-column: 2;
}

.ak-tags {
  display: flex;
  gap: 4px;
}

.ak-tag {
  font-style: normal;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #2a2d38;
}

.ak-tag.bad {
  background: #5a2a33;
}

.ak-tag.warn {
  background: #5a4a2a;
}

.ak-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.ak-form label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.ak-check {
  white-space: nowrap;
}

.ak-issued {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #2a2d38;
}

.ak-copy {
  display: grid;
  grid-template-columns: 70px 1fr auto;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

.ak-copy input {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.ak-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.ak-tabs button {
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 13px;
}

.ak-tabs button.on {
  outline: 2px solid #6e4aff;
}

.ak-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ak-code {
  position: relative;
}

.ak-code pre {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #0f1015;
  color: #cfd5e6;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.ak-code button {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 12px;
}

code {
  font-size: 12px;
}

/* Общий вид карточек профиля: стили AccountView скоупнуты и сюда не доходят. */
.card {
  background: #23232b;
  border: 1px solid #2e2e3a;
  border-radius: 14px;
  padding: 18px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
h2 {
  font-size: 1.1rem;
  margin: 0 0 4px;
}
input,
select {
  background: #18191f;
  border: 1px solid #2e2660;
  border-radius: 8px;
  color: #fff;
  padding: 10px 12px;
  font-size: 1rem;
  outline: none;
  box-sizing: border-box;
}
input:focus,
select:focus {
  border-color: #6e4aff;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.primary {
  background: linear-gradient(90deg, #2e2660 60%, #18191f 100%);
  border: none;
  border-radius: 8px;
  color: #fff;
  padding: 10px 18px;
  font-weight: 600;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ghost,
.ak-tabs button {
  background: none;
  border: 1px solid #3a3a48;
  border-radius: 8px;
  color: #c8cad4;
  padding: 8px 14px;
  cursor: pointer;
  white-space: nowrap;
}
.ghost:hover {
  border-color: #6e4aff;
  color: #fff;
}
.hint {
  color: #8b90a0;
  font-size: 0.88rem;
  line-height: 1.45;
  margin: 0;
}
.error {
  color: #ff7875;
  margin: 0;
}
.notice {
  color: #7ee0a5;
  margin: 0;
}
.steps {
  margin: 0;
  padding-left: 20px;
  color: #c8cad4;
  font-size: 0.9rem;
  line-height: 1.55;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

@media (max-width: 620px) {
  .ak-copy {
    grid-template-columns: 1fr;
  }
  .ak-row {
    grid-template-columns: 1fr;
  }
  .ak-row > button {
    grid-row: auto;
    grid-column: 1;
  }
  input,
  select {
    font-size: 16px; /* iOS не зумит поле с таким размером */
  }
}
</style>
