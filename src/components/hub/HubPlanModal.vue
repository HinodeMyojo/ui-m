<script setup>
import { reactive } from "vue";

// Новый план или правка плана: название, горизонт, срок, цвет планеты.

const props = defineProps({
  plan: { type: Object, default: null },
});
const emit = defineEmits(["save", "close"]);

const COLORS = ["#ffb35c", "#ff7a7a", "#f472b6", "#a78bfa", "#7aa2ff", "#38bdf8", "#34d399", "#facc15"];

const form = reactive({
  title: props.plan?.title || "",
  emoji: props.plan?.emoji || "",
  description: props.plan?.description || "",
  horizon: props.plan?.horizon || "near",
  targetDate: props.plan?.targetDate || "",
  color: props.plan?.color || "",
});

function submit() {
  if (!form.title.trim()) return;
  emit("save", {
    title: form.title.trim(),
    emoji: form.emoji.trim(),
    description: form.description,
    horizon: form.horizon,
    targetDate: form.horizon === "near" ? form.targetDate : "",
    color: form.color,
  });
}
</script>

<template>
  <div class="hpm-overlay" @pointerdown.self="emit('close')">
    <form class="hpm" @submit.prevent="submit">
      <div class="hpm-head">
        <h2>{{ plan ? "План" : "Новый план" }}</h2>
        <button type="button" class="hpm-x" @click="emit('close')">✕</button>
      </div>

      <div class="hpm-row">
        <input v-model="form.emoji" class="hpm-input hpm-emoji" maxlength="4" placeholder="🗾" />
        <input v-model="form.title" class="hpm-input" placeholder="Выучить японский" autofocus />
      </div>

      <div class="hpm-label">Горизонт</div>
      <div class="hpm-seg">
        <button type="button" :class="{ on: form.horizon === 'near' }" @click="form.horizon = 'near'">
          <b>Близкий</b>
          <span>понятный срок, до 5–10 лет</span>
        </button>
        <button type="button" :class="{ on: form.horizon === 'far' }" @click="form.horizon = 'far'">
          <b>Далёкий</b>
          <span>без чёткого начала и конца</span>
        </button>
      </div>

      <label v-if="form.horizon === 'near'" class="hpm-label">
        Срок (необязательно)
        <input v-model="form.targetDate" type="date" class="hpm-input" />
      </label>

      <label class="hpm-label">
        Зачем и что считается финишем
        <textarea v-model="form.description" class="hpm-input" rows="3" placeholder="Например: сдать JLPT N3 и читать мангу без словаря" />
      </label>

      <div class="hpm-label">Цвет планеты</div>
      <div class="hpm-colors">
        <button
          v-for="c in COLORS"
          :key="c"
          type="button"
          class="hpm-color"
          :class="{ on: form.color === c }"
          :style="{ background: c }"
          @click="form.color = c"
        />
      </div>

      <div class="hpm-actions">
        <button type="button" class="hpm-btn" @click="emit('close')">Отмена</button>
        <button type="submit" class="hpm-btn primary" :disabled="!form.title.trim()">
          {{ plan ? "Сохранить" : "Запустить на орбиту" }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.hpm-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(2, 3, 10, 0.72);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.hpm {
  width: min(460px, 100%);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  background: #12141f;
  border: 1px solid #2a2f45;
  border-radius: 18px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #e9ecf8;
}

.hpm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hpm-head h2 {
  margin: 0;
  font-size: 18px;
}

.hpm-x {
  background: none;
  border: 0;
  color: #8b91aa;
  font-size: 16px;
  cursor: pointer;
}

.hpm-row {
  display: flex;
  gap: 8px;
}

.hpm-input {
  width: 100%;
  box-sizing: border-box;
  background: #0b0d16;
  border: 1px solid #2a2f45;
  border-radius: 10px;
  color: #eef0f8;
  font-size: 15px;
  padding: 10px 12px;
  outline: none;
  font-family: inherit;
}

.hpm-input:focus {
  border-color: #8b7cff;
}

.hpm-emoji {
  width: 58px;
  flex-shrink: 0;
  text-align: center;
  font-size: 20px;
  padding: 6px;
}

.hpm-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
  color: #8b91aa;
}

.hpm-seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.hpm-seg button {
  text-align: left;
  background: #0b0d16;
  border: 1px solid #2a2f45;
  border-radius: 12px;
  padding: 10px 12px;
  color: #cfd3e6;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hpm-seg button span {
  font-size: 12px;
  color: #7d8399;
}

.hpm-seg button.on {
  border-color: #8b7cff;
  background: #191a33;
}

.hpm-colors {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.hpm-color {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}

.hpm-color.on {
  border-color: #fff;
  box-shadow: 0 0 0 2px #12141f inset;
}

.hpm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.hpm-btn {
  padding: 10px 16px;
  border-radius: 11px;
  border: 1px solid #2a2f45;
  background: #1a1d2c;
  color: #dfe3f4;
  font-size: 14px;
  cursor: pointer;
}

.hpm-btn.primary {
  background: linear-gradient(135deg, #6d5bff, #3b82f6);
  border-color: transparent;
  color: #fff;
  font-weight: 600;
}

.hpm-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Телефон: снизу листом — до кнопок дотягивается большой палец */
@media (max-width: 640px) {
  .hpm-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .hpm {
    width: 100%;
    max-height: 92dvh;
    border-radius: 20px 20px 0 0;
    padding-bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  }

  .hpm-input {
    font-size: 16px;
  }

  .hpm-actions .hpm-btn {
    flex: 1;
    padding: 13px 16px;
  }
}
</style>
