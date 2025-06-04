<template>
  <div class="chat-message">
    <textarea
      v-model="message"
      @input="adjustTextarea"
      ref="textarea"
      class="autoresize"
      placeholder="Введите текст..."
    ></textarea>
  </div>
</template>

<script setup>
import { ref } from "vue";

const message = ref("");
const textarea = ref(null);

const adjustTextarea = () => {
  textarea.value.style.height = "auto";
  textarea.value.style.height = `${textarea.value.scrollHeight}px`;
};
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
  -webkit-transition: 0.5s;
  transition: 0.5s;
  outline: none;
  background-color: transparent;
}
</style>
