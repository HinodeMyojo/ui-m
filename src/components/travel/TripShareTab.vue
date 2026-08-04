<script setup>
// Совместный доступ: ссылки с ролями, предложения от гостей, история правок
// и уведомления. Спецификация: docs/travel-module.md, раздел 2.7.
import { ref, computed, onMounted } from "vue";
import {
  fetchShareLinks,
  createShareLink,
  updateShareLink,
  revokeShareLink,
  deleteShareLink,
  fetchSuggestions,
  acceptSuggestion,
  rejectSuggestion,
  fetchTripHistory,
  revertHistory,
  fetchTripNotifications,
  readTripNotifications,
} from "@/components/api.js";

const props = defineProps({
  trip: { type: Object, required: true },
});
const emit = defineEmits(["changed"]);

const links = ref([]);
const suggestions = ref([]);
const history = ref([]);
const notifications = ref([]);
const loading = ref(true);
const error = ref("");
const notice = ref("");

const section = ref("links");
const linkEditing = ref(null);
const linkForm = ref(emptyLink());

const ROLES = [
  {
    key: "view",
    label: "Просмотр",
    icon: "mdi-eye",
    hint: "смотреть, комментировать, ставить реакции",
  },
  {
    key: "suggest",
    label: "Предложение",
    icon: "mdi-lightbulb-on",
    hint: "добавлять своё, править своё и гостевое; твоё — только через предложение",
  },
  {
    key: "full",
    label: "Полный доступ",
    icon: "mdi-pencil",
    hint: "менять и удалять всё напрямую",
  },
];

function emptyLink() {
  return { title: "", role: "suggest", expiresAt: null, maxUses: null };
}

function roleOf(key) {
  return ROLES.find((r) => r.key === key) || ROLES[0];
}

const pending = computed(() => suggestions.value.filter((s) => s.status === "pending"));
const unread = computed(() => notifications.value.filter((n) => !n.read).length);

// Ссылку показываем от адреса, с которого открыт интерфейс:
// бэкенд не обязан знать, где живёт фронт.
function linkUrl(link) {
  return `${window.location.origin}/travel/shared/${link.token}`;
}

function fmtDate(value) {
  if (!value) return "";
  return value.slice(0, 16).replace("T", " ");
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [l, s, h, n] = await Promise.all([
      fetchShareLinks(props.trip.id),
      fetchSuggestions(props.trip.id),
      fetchTripHistory(props.trip.id),
      fetchTripNotifications(props.trip.id),
    ]);
    links.value = l;
    suggestions.value = s;
    history.value = h;
    notifications.value = n;
  } catch (e) {
    error.value = e.message || "не удалось загрузить";
  } finally {
    loading.value = false;
  }
}

// --- Ссылки ---

function openLink(link) {
  linkEditing.value = link ? link.id : "new";
  linkForm.value = link
    ? { title: link.title, role: link.role, expiresAt: link.expiresAt, maxUses: link.maxUses }
    : emptyLink();
}

async function saveLink() {
  try {
    if (linkEditing.value === "new") {
      const created = await createShareLink(props.trip.id, linkForm.value);
      await copy(linkUrl(created));
      notice.value = "Ссылка создана и скопирована в буфер";
    } else {
      await updateShareLink(linkEditing.value, linkForm.value);
    }
    linkEditing.value = null;
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить ссылку";
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    notice.value = "Скопировано";
  } catch {
    // Буфер недоступен — не беда, ссылку видно на экране.
    notice.value = text;
  }
}

async function revoke(link) {
  if (!window.confirm(`Отозвать ссылку «${link.title || "без названия"}»? Переходы перестанут работать.`)) return;
  await revokeShareLink(link.id);
  await load();
}

async function removeLink(link) {
  if (!window.confirm("Удалить ссылку вместе с её гостями?")) return;
  await deleteShareLink(link.id);
  await load();
}

// --- Предложения ---

async function accept(suggestion) {
  try {
    await acceptSuggestion(suggestion.id);
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось принять предложение";
  }
}

async function reject(suggestion) {
  const reason = window.prompt("Причина отказа (необязательно)") || "";
  await rejectSuggestion(suggestion.id, reason);
  await load();
}

// --- История ---

async function revert(entry) {
  if (!window.confirm("Вернуть объект в состояние до этой правки?")) return;
  try {
    await revertHistory(entry.id);
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message || "не удалось откатить";
  }
}

async function markRead() {
  await readTripNotifications(props.trip.id);
  await load();
}

onMounted(load);
</script>

<template>
  <div class="ts">
    <p v-if="error" class="ts-error" @click="error = ''">{{ error }}</p>
    <p v-if="notice" class="ts-notice" @click="notice = ''">{{ notice }}</p>
    <div v-if="loading" class="ts-empty">Загружаю…</div>

    <template v-else>
      <nav class="ts-sections">
        <button :class="{ active: section === 'links' }" @click="section = 'links'">
          Ссылки ({{ links.length }})
        </button>
        <button :class="{ active: section === 'suggestions' }" @click="section = 'suggestions'">
          Предложения
          <span v-if="pending.length" class="ts-badge">{{ pending.length }}</span>
        </button>
        <button :class="{ active: section === 'history' }" @click="section = 'history'">История</button>
        <button :class="{ active: section === 'notifications' }" @click="section = 'notifications'">
          Уведомления
          <span v-if="unread" class="ts-badge">{{ unread }}</span>
        </button>
      </nav>

      <!-- ССЫЛКИ -->
      <section v-if="section === 'links'">
        <div class="ts-head">
          <p class="ts-hint">
            Гость переходит по ссылке, называет своё имя — и работает без регистрации.
            Имя видно рядом с его правками.
          </p>
          <button class="ts-primary" @click="openLink(null)">
            <i class="mdi mdi-link-plus"></i> Создать ссылку
          </button>
        </div>

        <div v-if="!links.length" class="ts-empty ts-empty--small">Ссылок пока нет.</div>

        <article v-for="link in links" :key="link.id" class="ts-link" :class="{ revoked: link.revoked }">
          <div class="ts-link__head">
            <i class="mdi ts-link__icon" :class="roleOf(link.role).icon"></i>
            <div class="ts-link__title">
              <b>{{ link.title || "Без названия" }}</b>
              <span>{{ roleOf(link.role).label }} — {{ roleOf(link.role).hint }}</span>
            </div>
            <span v-if="link.revoked" class="ts-tag ts-tag--off">отозвана</span>
          </div>

          <div class="ts-link__url" @click="copy(linkUrl(link))">
            <code>{{ linkUrl(link) }}</code>
            <i class="mdi mdi-content-copy"></i>
          </div>

          <div class="ts-link__meta">
            <span>переходов: {{ link.usedCount }}<template v-if="link.maxUses"> из {{ link.maxUses }}</template></span>
            <span v-if="link.expiresAt">действует до {{ fmtDate(link.expiresAt) }}</span>
            <span v-if="link.guests.length">
              гости: {{ link.guests.map((g) => g.name).join(", ") }}
            </span>
          </div>

          <div class="ts-link__actions">
            <button @click="openLink(link)"><i class="mdi mdi-pencil"></i> Изменить</button>
            <button v-if="!link.revoked" @click="revoke(link)"><i class="mdi mdi-cancel"></i> Отозвать</button>
            <button class="danger" @click="removeLink(link)"><i class="mdi mdi-delete"></i></button>
          </div>
        </article>
      </section>

      <!-- ПРЕДЛОЖЕНИЯ -->
      <section v-else-if="section === 'suggestions'">
        <p class="ts-hint">
          Гость с ролью «Предложение» не может менять твои объекты напрямую —
          его правки ждут здесь.
        </p>

        <div v-if="!suggestions.length" class="ts-empty ts-empty--small">Предложений пока нет.</div>

        <article v-for="s in suggestions" :key="s.id" class="ts-suggestion" :class="s.status">
          <div class="ts-suggestion__head">
            <span class="ts-suggestion__summary">{{ s.summary }}</span>
            <span class="ts-tag" :class="`ts-tag--${s.status}`">
              {{ { pending: "ждёт", accepted: "принято", rejected: "отклонено" }[s.status] }}
            </span>
          </div>
          <div v-if="s.comment" class="ts-suggestion__comment">«{{ s.comment }}»</div>
          <div v-if="s.rejectReason" class="ts-suggestion__comment">отказ: {{ s.rejectReason }}</div>
          <div class="ts-suggestion__meta">{{ fmtDate(s.createdAt) }}</div>

          <div v-if="s.status === 'pending'" class="ts-link__actions">
            <button class="accept" @click="accept(s)"><i class="mdi mdi-check"></i> Принять</button>
            <button @click="reject(s)"><i class="mdi mdi-close"></i> Отклонить</button>
          </div>
        </article>
      </section>

      <!-- ИСТОРИЯ -->
      <section v-else-if="section === 'history'">
        <p class="ts-hint">Журнал правок хранится 20 дней. Отдельную правку можно откатить.</p>
        <div v-if="!history.length" class="ts-empty ts-empty--small">Записей пока нет.</div>

        <div v-for="entry in history" :key="entry.id" class="ts-history" :class="{ reverted: entry.reverted }">
          <span class="ts-history__dot" :class="`ts-history__dot--${entry.action}`"></span>
          <div class="ts-history__body">
            <div>{{ entry.summary }}</div>
            <div class="ts-history__meta">{{ fmtDate(entry.createdAt) }}</div>
          </div>
          <span v-if="entry.reverted" class="ts-tag ts-tag--off">откачено</span>
          <button v-else-if="entry.canRevert" class="ts-mini" @click="revert(entry)">
            <i class="mdi mdi-undo"></i> откатить
          </button>
        </div>
      </section>

      <!-- УВЕДОМЛЕНИЯ -->
      <section v-else>
        <div class="ts-head">
          <p class="ts-hint">Предложения, чужие правки, комментарии и реакции.</p>
          <button v-if="unread" class="ts-primary" @click="markRead">Отметить прочитанными</button>
        </div>
        <div v-if="!notifications.length" class="ts-empty ts-empty--small">Уведомлений нет.</div>

        <div v-for="n in notifications" :key="n.id" class="ts-notification" :class="{ unread: !n.read }">
          <i
            class="mdi"
            :class="{
              'mdi-lightbulb-on': n.kind === 'suggestion',
              'mdi-pencil': n.kind === 'edit',
              'mdi-comment-text': n.kind === 'comment',
              'mdi-emoticon-happy': n.kind === 'reaction',
            }"
          ></i>
          <div class="ts-notification__body">
            <div>{{ n.text }}</div>
            <div class="ts-history__meta">{{ fmtDate(n.createdAt) }}</div>
          </div>
        </div>
      </section>
    </template>

    <!-- Форма ссылки -->
    <div v-if="linkEditing" class="ts-modal-backdrop" @click.self="linkEditing = null">
      <div class="ts-modal">
        <h2>{{ linkEditing === "new" ? "Новая ссылка" : "Ссылка" }}</h2>

        <label class="ts-field">
          Для кого
          <input v-model="linkForm.title" class="ts-input" type="text" placeholder="Для Ани" />
        </label>

        <div class="ts-field">
          Что можно
          <div class="ts-roles">
            <button
              v-for="r in ROLES"
              :key="r.key"
              :class="{ active: linkForm.role === r.key }"
              @click="linkForm.role = r.key"
            >
              <i class="mdi" :class="r.icon"></i>
              <b>{{ r.label }}</b>
              <span>{{ r.hint }}</span>
            </button>
          </div>
        </div>

        <div class="ts-row">
          <label class="ts-field">
            Действует до
            <input
              class="ts-input"
              type="date"
              :value="linkForm.expiresAt ? linkForm.expiresAt.slice(0, 10) : ''"
              @input="linkForm.expiresAt = $event.target.value ? `${$event.target.value}T23:59:59Z` : null"
            />
          </label>
          <label class="ts-field">
            Лимит переходов
            <input v-model.number="linkForm.maxUses" class="ts-input" type="number" min="1" />
          </label>
        </div>

        <div class="ts-modal__actions">
          <button class="ts-ghost" @click="linkEditing = null">Отмена</button>
          <button class="ts-primary" @click="saveLink">Сохранить</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ts {
  flex: 1;
  padding: 16px 20px 60px;
  overflow-y: auto;
  color: #eaeef7;
}

.ts-sections {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  margin-bottom: 14px;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 11px;
}

.ts-sections button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 15px;
  font-size: 13px;
  color: #8b93a7;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.ts-sections button.active {
  color: #fff;
  background: #1767fd;
}

.ts-badge {
  min-width: 18px;
  padding: 1px 6px;
  font-size: 11px;
  color: #12141a;
  text-align: center;
  background: #ffd666;
  border-radius: 9px;
}

.ts-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.ts-head .ts-hint {
  flex: 1;
  margin: 0;
}

.ts-link {
  padding: 13px 15px;
  margin-bottom: 8px;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 12px;
}

.ts-link.revoked {
  opacity: 0.55;
}

.ts-link__head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.ts-link__icon {
  font-size: 19px;
  color: #1767fd;
}

.ts-link__title {
  flex: 1;
  min-width: 0;
}

.ts-link__title b {
  display: block;
  font-size: 14px;
}

.ts-link__title span {
  font-size: 11px;
  color: #6e7688;
}

.ts-link__url {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 7px 10px;
  margin-top: 9px;
  cursor: pointer;
  background: #12141a;
  border-radius: 8px;
}

.ts-link__url code {
  flex: 1;
  overflow: hidden;
  font-size: 12px;
  color: #86d68b;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ts-link__url:hover {
  background: #232733;
}

.ts-link__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  font-size: 11px;
  color: #6e7688;
}

.ts-link__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 10px;
}

.ts-link__actions button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 11px;
  font-size: 12px;
  color: #b9c0cf;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 8px;
  cursor: pointer;
}

.ts-link__actions button:hover {
  color: #fff;
  border-color: #3d4353;
}

.ts-link__actions .danger {
  color: #ff9d9f;
}

.ts-link__actions .accept {
  color: #fff;
  background: #22c55e;
  border-color: #22c55e;
}

.ts-suggestion {
  padding: 12px 14px;
  margin-bottom: 7px;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 11px;
}

.ts-suggestion.pending {
  border-color: rgba(255, 214, 102, 0.4);
}

.ts-suggestion__head {
  display: flex;
  gap: 10px;
  align-items: center;
}

.ts-suggestion__summary {
  flex: 1;
  font-size: 13px;
}

.ts-suggestion__comment {
  margin-top: 5px;
  font-size: 12px;
  color: #b9c0cf;
}

.ts-suggestion__meta {
  margin-top: 4px;
  font-size: 11px;
  color: #6e7688;
}

.ts-tag {
  padding: 2px 9px;
  font-size: 11px;
  color: #b9c0cf;
  white-space: nowrap;
  background: #232733;
  border-radius: 999px;
}

.ts-tag--pending {
  color: #12141a;
  background: #ffd666;
}

.ts-tag--accepted {
  color: #fff;
  background: #22c55e;
}

.ts-tag--rejected {
  color: #fff;
  background: #e5484d;
}

.ts-tag--off {
  color: #6e7688;
}

.ts-history {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 9px 12px;
  margin-bottom: 4px;
  background: #1b1e27;
  border-radius: 10px;
}

.ts-history.reverted {
  opacity: 0.55;
}

.ts-history__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  background: #6e7688;
  border-radius: 50%;
}

.ts-history__dot--create {
  background: #22c55e;
}

.ts-history__dot--update {
  background: #1767fd;
}

.ts-history__dot--delete {
  background: #e5484d;
}

.ts-history__body {
  flex: 1;
  font-size: 13px;
}

.ts-history__meta {
  margin-top: 2px;
  font-size: 11px;
  color: #6e7688;
}

.ts-mini {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  font-size: 11px;
  color: #b9c0cf;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 8px;
  cursor: pointer;
}

.ts-notification {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 13px;
  margin-bottom: 4px;
  background: #1b1e27;
  border-radius: 10px;
}

.ts-notification.unread {
  border-left: 3px solid #1767fd;
}

.ts-notification i {
  color: #6e7688;
}

.ts-notification__body {
  flex: 1;
  font-size: 13px;
}

.ts-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 15px;
  font-size: 13px;
  color: #fff;
  white-space: nowrap;
  background: #1767fd;
  border: none;
  border-radius: 9px;
  cursor: pointer;
}

.ts-ghost {
  padding: 9px 15px;
  font-size: 13px;
  color: #b9c0cf;
  background: transparent;
  border: 1px solid #2c313d;
  border-radius: 9px;
  cursor: pointer;
}

.ts-error,
.ts-notice {
  padding: 9px 14px;
  margin: 0 0 12px;
  font-size: 13px;
  cursor: pointer;
  border-radius: 9px;
}

.ts-error {
  color: #ff9d9f;
  background: rgba(229, 72, 77, 0.14);
}

.ts-notice {
  color: #86d68b;
  background: rgba(34, 197, 94, 0.13);
}

.ts-empty {
  padding: 34px 20px;
  color: #6e7688;
  text-align: center;
}

.ts-empty--small {
  padding: 20px;
  font-size: 13px;
}

.ts-hint {
  font-size: 12px;
  color: #6e7688;
}

.ts-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(8, 9, 13, 0.72);
}

.ts-modal {
  width: 100%;
  max-width: 500px;
  max-height: 92vh;
  padding: 20px;
  overflow-y: auto;
  background: #1b1e27;
  border: 1px solid #2c313d;
  border-radius: 16px;
}

.ts-modal h2 {
  margin: 0 0 10px;
  font-size: 18px;
}

.ts-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.ts-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  color: #eaeef7;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 9px;
  outline: none;
}

.ts-field {
  display: block;
  margin-top: 12px;
  font-size: 12px;
  color: #8b93a7;
}

.ts-field .ts-input {
  margin-top: 4px;
}

.ts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.ts-roles {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 5px;
}

.ts-roles button {
  display: grid;
  grid-template-columns: 22px 1fr;
  grid-template-rows: auto auto;
  gap: 2px 9px;
  padding: 10px 12px;
  text-align: left;
  color: #b9c0cf;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 10px;
  cursor: pointer;
}

.ts-roles button i {
  grid-row: span 2;
  align-self: center;
  font-size: 18px;
}

.ts-roles button b {
  font-size: 13px;
}

.ts-roles button span {
  font-size: 11px;
  opacity: 0.75;
}

.ts-roles button.active {
  color: #fff;
  background: #1767fd;
  border-color: #1767fd;
}

@media (max-width: 900px) {
  .ts {
    padding: 12px 12px 60px;
  }

  .ts-row {
    grid-template-columns: 1fr;
  }

  .ts-link__actions button {
    padding: 9px 12px;
    font-size: 13px;
  }
}
</style>
