<template>
  <div class="chat-message">
    <textarea
      v-model="message"
      @input="adjustTextarea"
      @keydown.enter.exact="$emit('send')"
      ref="textarea"
      class="autoresize"
      placeholder="Введите текст..."
    ></textarea>
  </div>
</template>

<script setup>
import { ref } from "vue";

const emit = defineEmits(["send"]);
const message = ref("");
const textarea = ref(null);

const adjustTextarea = () => {
  if (!textarea.value) return;
  textarea.value.style.height = "auto";
  textarea.value.style.height = `${textarea.value.scrollHeight}px`;
};

function getMessage() {
  return message.value;
}

function clearMessage() {
  message.value = "";
  if (textarea.value) {
    textarea.value.style.height = "auto";
  }
}

defineExpose({ getMessage, clearMessage });
</script>

<style scoped>
.chat-message {
  width: 100%;
  scrollbar-width: thin;
  scrollbar-color: #6e4aff #11111100;
}
.autoresize {
  min-height: 40px;
  width: 100%;
  max-height: 120px;
  box-sizing: border-box;
  resize: none;
  transition: 0.3s;
  outline: none;
  background-color: transparent;
  color: #fff;
  font-size: 14px;
}
</style>
