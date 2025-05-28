<template>
  <div class="modal-cntnt">
    <div class="content">
      <div class="title">
        <h3>{{ task.title }}</h3>
      </div>
      <div class="progres">
        <div class="today-progres">
          <div class="flex justify-between mb-1">
            <span class="text-base font-medium text-blue-700 dark:text-white"
              >Текущий прогресс</span
            >
            <span class="text-sm font-medium text-blue-700 dark:text-white"
              >{{ computeProgres() }}%</span
            >
          </div>
          <div class="w-full bg-gray-200 rounded-full h-3.5 dark:bg-gray-700">
            <div
              class="bg-indigo-500 h-3.5 rounded-full"
              :style="{ width: computeProgres() + '%' }"
            ></div>
          </div>
        </div>
        <div class="need-progres">
          <div class="flex justify-between mb-1">
            <span class="text-base font-medium text-blue-700 dark:text-white">{{
              checkNeedPersentText()
            }}</span>
            <span class="text-sm font-medium text-blue-700 dark:text-white"
              >{{ needProgress() }}%</span
            >
          </div>
          <div class="w-full bg-gray-200 rounded-full h-3.5 dark:bg-gray-700">
            <div
              class="bg-neonPink h-3.5 rounded-full"
              :style="{
                width: needProgress() === -1 ? '100%' : needProgress() + '%',
                backgroundColor: needProgress() === -1 ? 'red' : '#c14481',
              }"
            ></div>
          </div>
        </div>
      </div>
      <div class="inner-menu">
        <div
          class="subtasks"
          @drop="onSubtaskDrop($event, task.subtasks)"
          @dragover.prevent
        >
          <div ref="subtasksRef">
            <div
              v-for="(subtask, index) in task.subtasks"
              :key="index"
              draggable="true"
              @dragstart="startDrag($event, subtask)"
              @click="clickSubtask(subtask)"
              class="subtask"
            >
              <div class="subtask-boba">
                <input
                  type="checkbox"
                  v-model="subtask.completed"
                  :id="'subtask-' + index"
                  class="w-4 h-4 accent-blue"
                />
                <span
                  :for="'subtask-' + index"
                  :class="{ 'text-gray-500': subtask.completed }"
                  class="flex-1 overflow-hidden"
                >
                  <h3 class="truncate block text-white" :title="subtask.title">
                    {{ subtask.title }}
                  </h3>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="chat" ref="chatRef">
          <div class="chat-header">
            <h3>{{ chatValue?.name || "Общий чат" }}</h3>
          </div>
          <div
            class="chat-main"
            ref="chatMainRef"
            @dragover.prevent="handleDragOver"
            @dragleave="handleDragLeave"
            @drop.prevent="handleDrop"
          >
            <!-- Зоны загрузки внутри чата, но перед сообщениями -->
            <div class="drop-zones" :class="{ active: isDragging }">
              <!-- Показываем зону для изображений только если перетаскивается изображение -->
              <div
                v-if="isDraggingImage"
                class="dropzone image-dropzone"
                :class="{ active: isDraggingImage }"
                @dragover.prevent="handleImageDragOver"
                @dragleave="handleImageDragLeave"
                @drop.prevent="handleImageDrop"
              >
                <div class="dropzone-content">
                  <svg-icon type="mdi" :path="mdiImage" size="35"></svg-icon>
                  <span>Отправить как изображение</span>
                </div>
              </div>
              <!-- Зона для файлов показывается всегда -->
              <div
                class="dropzone file-dropzone"
                :class="{ active: isDraggingFile }"
                @dragover.prevent="handleFileDragOver"
                @dragleave="handleFileDragLeave"
                @drop.prevent="handleFileDrop"
              >
                <div class="dropzone-content">
                  <svg-icon type="mdi" :path="mdiFile" size="35"></svg-icon>
                  <span>{{
                    isDraggingImage ? "Отправить как файл" : "Перетащите файл"
                  }}</span>
                </div>
              </div>
            </div>
            <div class="chat-main-inner">
              <div
                v-for="message in messagesVar"
                :key="message.id"
                class="message"
              >
                <div class="chat-inner-message">
                  <template
                    v-if="
                      Array.isArray(message.images) && message.images.length
                    "
                  >
                    <div
                      class="chat-message-image"
                      :class="'count-' + message.images.length"
                    >
                      <div
                        class="chat-thumbnails"
                        :class="'x' + index"
                        v-for="(img, index) in message.images"
                        :key="index"
                        @click="openImage(img.imageId)"
                      >
                        <img
                          :src="img.thumbnail"
                          alt="User Image"
                          v-if="img.thumbnail"
                          :class="'img-' + index"
                        />
                      </div></div
                  ></template>
                  {{ message.text }}
                </div>
                <hr />
                <div class="chat-time">
                  {{ message.date }}
                </div>
              </div>
            </div>
          </div>
          <div class="chat-input">
            <!-- Предпросмотр загруженных файлов -->
            <div v-if="previewFiles.length > 0" class="preview-container">
              <div class="preview-header">
                <div class="preview-title">
                  Прикрепленные файлы ({{ previewFiles.length }})
                </div>
                <button @click="clearAllFiles" class="clear-all-button">
                  <svg-icon type="mdi" :path="mdiClose" size="20"></svg-icon>
                  Очистить все
                </button>
              </div>

              <!-- Предпросмотр изображений -->
              <div v-if="hasImages" class="preview-section">
                <div class="preview-section-header">
                  <svg-icon type="mdi" :path="mdiImage" size="16"></svg-icon>
                  <span>Изображения ({{ imageFiles.length }})</span>
                </div>
                <div class="preview-files image-preview">
                  <div
                    v-for="(file, index) in imageFiles"
                    :key="index"
                    class="preview-item"
                  >
                    <img :src="file.preview" class="preview-image" />
                    <button
                      @click="removePreviewFile(index)"
                      class="remove-preview"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>

              <!-- Предпросмотр других файлов -->
              <div v-if="hasOtherFiles" class="preview-section">
                <div class="preview-section-header">
                  <svg-icon type="mdi" :path="mdiFile" size="16"></svg-icon>
                  <span>Файлы ({{ nonImageFiles.length }})</span>
                </div>
                <div class="preview-files file-preview">
                  <div
                    v-for="(file, index) in nonImageFiles"
                    :key="index"
                    class="preview-item"
                  >
                    <svg-icon type="mdi" :path="mdiFile" size="20"></svg-icon>
                    <span class="preview-name">{{ file.name }}</span>
                    <button
                      @click="removePreviewFile(index + imageFiles.length)"
                      class="remove-preview"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="chat-input-inner">
              <chat-message ref="chatMessageRef"></chat-message>
            </div>
            <div class="chat-input-buttoms">
              <input
                type="file"
                ref="fileInput"
                @change="handleFileSelect"
                multiple
                accept="image/*,.pdf,.doc,.docx,.txt"
                style="display: none"
              />
              <button @click="fileInput.click()" class="send-icon">
                <svg-icon type="mdi" :path="path1" size="35"></svg-icon>
              </button>
              <div class="send-icon" @click="sendMessage">
                <svg-icon type="mdi" :path="path" size="35"></svg-icon>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import SvgIcon from "@jamescoyle/vue-icon";
import {
  mdiSendCircleOutline,
  mdiPaperclip,
  mdiImage,
  mdiFile,
  mdiClose,
} from "@mdi/js";
import {
  useTemplateRef,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  computed,
} from "vue";

import chat from "./test.js";
import bonfire from "../../assets/gif/bonfire-dark-souls.gif";
import ChatMessage from "../extension/ChatMessage.vue";

// Icons
const path = mdiSendCircleOutline;
const path1 = mdiPaperclip;

// Drag and drop functionality
const images = ref([]);
const uploadedFiles = ref([]);
const isImageDragInvalid = ref(false);
const imageMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Drag and drop states
const isDragging = ref(false);
const isDraggingImage = ref(false);
const isDraggingFile = ref(false);
const previewFiles = ref([]);

function onDragOver(target, event) {
  const files = Array.from(event.dataTransfer.items);
  const allAreImages = files.every((item) =>
    imageMimeTypes.includes(item.type || item.getAsFile()?.type || "")
  );
  if (target === "image") {
    isImageDragInvalid.value = !allAreImages;
  }
}

function clearDragState() {
  isImageDragInvalid.value = false;
}

function onDrop(target, event) {
  clearDragState();
  const droppedFiles = Array.from(event.dataTransfer.files);

  if (target === "image") {
    const imageFiles = droppedFiles.filter((f) =>
      imageMimeTypes.includes(f.type)
    );
    images.value.push(...imageFiles);
  } else if (target === "file") {
    uploadedFiles.value.push(...droppedFiles);
  }
}

function removeFile(file) {
  const index = uploadedFiles.value.indexOf(file);
  if (index > -1) {
    uploadedFiles.value.splice(index, 1);
  }
}

// Task progress calculations
function computeProgres() {
  return Math.round((task.completed / task.total) * 100);
}

function needProgress() {
  if (task.currentDay === -1) return -1;
  if (task.currentDay === 0) return 0;
  const desiredCompletedTasks = (task.total / task.totalDays) * task.currentDay;
  return Math.round((desiredCompletedTasks / task.total) * 100);
}

function checkNeedPersentText() {
  if (needProgress() === -1) return "Срок проёбан брат";
  if (needProgress() === 0) return "Всё еще впереди брат";
  return "Нужно брат";
}

const task = reactive({
  id: 0,
  title: "Тестовая задача",
  description: "Нужно сделать очень много всего",
  start_date: "20.05.2025",
  end_date: "31.05.2025",
  totalDays: 11,
  currentDay: 2, // если -1 = то срок проёбан
  total: 3,
  completed: 1,
  required: 2,
  subtasks: [
    {
      id: 0,
      title: "Подзадача_1",
      description: "Нужно сделать всё",
      chatId: 0,
      completed: true,
    },
    {
      id: 1,
      title: "БИЛИБАОваовраоуцакерцуолароатуклравапшщзасвапщшшрпмарощшлорми",
      description: "Нужно сделать всё",
      chatId: 1,
      completed: true,
    },
    {
      id: 2,
      title: "Подзадача_2",
      description: "Нужно сделать всё",
      chatId: 2,
      completed: false,
    },
  ],
});

// Chat functionality
const messagesVar = ref(null);
const chatValue = ref(null);
const subtasksRef = useTemplateRef("subtasksRef");
const chatRef = useTemplateRef("chatRef");
const chatMainRef = ref(null);

const openImage = async (imageId) => {
  console.log(imageId);
};

// Функция для прокрутки чата вниз
function scrollToBottom() {
  if (chatMainRef.value) {
    chatMainRef.value.scrollTop = chatMainRef.value.scrollHeight;
  }
}

// Прокрутка при открытии чата
const clickSubtask = async (subtask) => {
  chatValue.value = { name: subtask.title, id: subtask.chatId };
  const chatR = chat[chatValue.value.id];
  if (chatR) {
    messagesVar.value = chatR.messages;
    // Добавляем небольшую задержку для гарантии, что DOM обновился
    setTimeout(scrollToBottom, 100);
  }
};

// Прокрутка при отправке сообщения
async function sendMessage() {
  const chatMessageRef = ref(null);
  const messageText = chatMessageRef.value?.getMessage() || "";

  if (!messageText && previewFiles.value.length === 0) return;

  const newMessage = {
    id: Date.now(),
    text: messageText,
    date: new Date().toLocaleTimeString(),
    images: previewFiles.value
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        imageId: Date.now() + Math.random(),
        thumbnail: file.preview,
      })),
  };

  // Добавляем сообщение в чат
  messagesVar.value = [...(messagesVar.value || []), newMessage];

  // Очищаем поле ввода и предпросмотр файлов
  chatMessageRef.value?.clearMessage();
  previewFiles.value = [];

  // Прокручиваем чат вниз после добавления сообщения
  setTimeout(scrollToBottom, 100);
}

// Добавляем обработчик изменения размера окна
onMounted(() => {
  window.addEventListener("resize", scrollToBottom);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", scrollToBottom);
});

// Drag and drop handlers
function handleDragOver(event) {
  // Проверяем, есть ли перетаскиваемые файлы
  if (event.dataTransfer.types.includes("Files")) {
    isDragging.value = true;
    const items = Array.from(event.dataTransfer.items);

    // Проверяем, есть ли среди перетаскиваемых файлов изображения
    const hasImages = items.some((item) => {
      const type = item.type || item.getAsFile()?.type || "";
      return imageMimeTypes.includes(type);
    });

    isDraggingImage.value = hasImages;
    isDraggingFile.value = true;
    event.stopPropagation(); // Предотвращаем всплытие события
  }
}

function handleDragLeave(event) {
  if (!event.relatedTarget?.closest(".dropzone")) {
    isDragging.value = false;
    isDraggingImage.value = false;
    isDraggingFile.value = false;
  }
}

function handleImageDragOver(event) {
  isDraggingImage.value = true;
}

function handleImageDragLeave(event) {
  if (!event.relatedTarget?.closest(".image-dropzone")) {
    isDraggingImage.value = false;
  }
}

function handleFileDragOver(event) {
  isDraggingFile.value = true;
}

function handleFileDragLeave(event) {
  if (!event.relatedTarget?.closest(".file-dropzone")) {
    isDraggingFile.value = false;
  }
}

async function handleImageDrop(event) {
  const files = Array.from(event.dataTransfer.files).filter((f) =>
    imageMimeTypes.includes(f.type)
  );
  await addPreviewFiles(files, "image");
  resetDragState();
}

async function handleFileDrop(event) {
  const files = Array.from(event.dataTransfer.files);
  await addPreviewFiles(files, "file");
  resetDragState();
}

function resetDragState() {
  isDragging.value = false;
  isDraggingImage.value = false;
  isDraggingFile.value = false;
}

async function addPreviewFiles(files, type) {
  for (const file of files) {
    const preview = file.type.startsWith("image/")
      ? await createImagePreview(file)
      : null;

    previewFiles.value.push({
      file,
      preview,
      type: file.type,
      name: file.name,
      uploadType: type,
    });
  }
}

function createImagePreview(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

function removePreviewFile(index) {
  previewFiles.value.splice(index, 1);
}

// Обработка выбора файлов через кнопку скрепки
const fileInput = ref(null);

async function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  await addPreviewFiles(files, "file");
  // Очищаем input для возможности повторного выбора тех же файлов
  event.target.value = "";
}

// Очистка всех файлов
function clearAllFiles() {
  previewFiles.value = [];
}

// Computed properties for file previews
const imageFiles = computed(() =>
  previewFiles.value.filter((file) => file.uploadType === "image")
);

const nonImageFiles = computed(() =>
  previewFiles.value.filter((file) => file.uploadType === "file")
);

const hasImages = computed(() => imageFiles.value.length > 0);
const hasOtherFiles = computed(() => nonImageFiles.value.length > 0);

// Добавляем функцию для перетаскивания подзадач
function startDrag(event, subtask) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/json", JSON.stringify(subtask));
  event.stopPropagation(); // Предотвращаем всплытие события
}

function onSubtaskDrop(event, subtasks) {
  // Проверяем, есть ли перетаскиваемые файлы
  if (event.dataTransfer.types.includes("Files")) {
    return; // Если это файлы, не обрабатываем событие здесь
  }

  const subtask = JSON.parse(event.dataTransfer.getData("application/json"));
  const fromIndex = subtasks.findIndex((s) => s.id === subtask.id);
  const toIndex = Array.from(
    event.target.closest(".subtasks").children
  ).findIndex((el) => el.contains(event.target));

  if (fromIndex !== -1 && toIndex !== -1) {
    const [removed] = subtasks.splice(fromIndex, 1);
    subtasks.splice(toIndex, 0, removed);
  }
  event.stopPropagation(); // Предотвращаем всплытие события
}
</script>
<style scoped>
/* drop */
.dropzone {
  border: 2px dashed #888;
  padding: 20px;
  margin: 10px 0;
  border-radius: 8px;
  text-align: center;
  transition: border-color 0.2s, background 0.2s;
}
.dropzone.invalid {
  border-color: red;
  background: #ffe6e6;
}

.modal-cntnt {
  display: flex;
  justify-content: center;
  height: 100vh;
  width: 50%;
  background-color: #18141d;
  border-top-left-radius: 30px;
  border-bottom-left-radius: 30px;
  border: 1px solid #2e2660;
}
.content {
  width: 100%;
  height: 100%;
  padding: 3% 5% 3% 5%;
  display: grid;
  grid-template-rows: 1fr 1.5fr 10fr;
  gap: 20px;
  justify-content: center;
  flex-direction: column;
  align-items: center;
}

.title {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}
.progres {
  justify-content: center;
  align-items: center;
  gap: 10px;
  width: 100%;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0 16px;
}
.today-progres,
.need-progres {
  width: 100%;
}

.today-progres .w-full,
.need-progres .w-full {
  background-color: rgba(37, 33, 57, 0.5);
  border-radius: 9999px;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
}

.today-progres .bg-indigo-500 {
  background-color: #6e4aff;
  box-shadow: 0 1px 2px rgba(110, 74, 255, 0.3);
  transition: width 0.3s ease;
}

.need-progres .bg-neonPink {
  background-color: #c14481;
  box-shadow: 0 1px 2px rgba(193, 68, 129, 0.3);
  transition: width 0.3s ease;
}

.today-progres .text-blue-700,
.need-progres .text-blue-700 {
  color: #a5b4fc;
  font-weight: 500;
}

.today-progres .text-sm,
.need-progres .text-sm {
  color: #6e4aff;
  font-weight: 600;
}

.need-progres .text-sm {
  color: #c14481;
}

.subtasks {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 16px;
}
.subtask {
  cursor: grab;
  user-select: none;
}
.subtask :active {
  cursor: grabbing;
}
.subtask-boba {
  display: flex;
  padding: 8px 0;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 40px;
  gap: 15px;
  border-radius: 8px;
  user-select: none;
  transition: background-color 0.2s ease;
}
.subtask-boba:hover {
  background-color: #252139;
}

.subtask-boba input[type="checkbox"] {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  cursor: pointer;
  accent-color: #6e4aff;
  transition: all 0.2s ease;
}

.subtask-boba input[type="checkbox"]:hover {
  transform: scale(1.05);
}

.subtask-boba h3 {
  font-size: 16px;
  line-height: 1.4;
  color: #ffffff;
  margin: 0;
  transition: color 0.2s ease;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subtask-boba input[type="checkbox"]:checked + span h3 {
  color: #6e4aff;
  text-decoration: line-through;
  opacity: 0.7;
}

.inner-menu {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex-direction: row;
  gap: 7px;
  width: 100%;
  max-height: 100%;
}

.chat {
  display: grid;
  grid-template-rows: 1fr 10fr 1fr;
  height: 700px;
  width: 100%;
  align-items: center;
  border-radius: 20px;
  background-color: #120e16;
  overflow: hidden;
  position: relative;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
  margin-right: 16px;
}
.chat-header {
  display: grid;
  width: 100%;
  height: 100%;
  background-color: #252139;
  align-content: center;
  justify-items: flex-start;
  padding: 0 16px;
}
.chat-header h3 {
  padding-left: 8px;
  font-size: 18px;
  max-width: 100%;
  font-weight: 500;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #ffffff;
}
.chat-main {
  display: grid;
  width: 100%;
  height: 100%;
  max-height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #6e4aff #111;
  position: relative;
  padding: 16px;
}

/* Chrome, Safari, Edge */
.chat-main::-webkit-scrollbar {
  width: 8px;
}

.chat-main::-webkit-scrollbar-track {
  background: #111; /* Трек (фон) */
}

.chat-main::-webkit-scrollbar-thumb {
  background-color: #888; /* Цвет полосы */
  border-radius: 4px;
  border: 2px solid #111; /* Отступ внутри трека */
}

.chat-main::-webkit-scrollbar-thumb:hover {
  background-color: #aaa;
}
.chat-background {
  display: flex;
  flex: 1;
  justify-content: center;
  align-items: center;
  opacity: 0.4;
}
.chat-input {
  flex-direction: column;
  width: 100%;
  /* gap: 12px; */
  padding: 16px;
  display: grid;
  grid-template-rows: 1fr auto;
  height: 100%;
  background-color: #252139;
}
.chat-input-inner {
  align-self: center;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: 12px;
  background-color: rgba(61, 55, 90, 0.5);
  color: #ffffff;
  gap: 12px;
}
.chat-input-inner textarea {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  resize: none;
  overflow-y: hidden;
  -webkit-transition: 0.5s;
  transition: 0.5s;
  outline: none;
  background-color: transparent;
}
.message {
  background-color: #252139;
  padding: 16px;
  width: 100%;
  display: flex;
  border-radius: 12px;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.message hr {
  border: none;
  height: 1px;
  background-color: rgba(255, 255, 255, 0.1);
  margin: 8px 0;
}
.chat-main-inner {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  padding: 8px;
  position: relative;
  z-index: 1;
}

.chat-input-buttoms {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}
.send-icon {
  cursor: pointer;
  transition: all 0.2s ease;
  color: #6e4aff;
  padding: 4px;
  border-radius: 8px;
}
.send-icon:hover {
  color: #ffffff;
  background-color: rgba(110, 74, 255, 0.1);
  transform: scale(1.05);
}
.send-icon:active {
  transform: scale(0.95);
}
.chat-time {
  width: 100%;
  text-align: end;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}
.chat-thumbnails {
  cursor: pointer;
  display: grid;
  padding: 3px;
}
.chat-thumbnails img {
  border-radius: 10px;
}

.chat-inner-message {
  display: flex;
  gap: 10px;
  flex-direction: column;
}
/*  */
.image-grid {
  display: grid;
  gap: 8px;
}

/* Один элемент */
.count-1 {
  grid-template-columns: 1fr;
}

/* Два элемента — две колонки */
.count-2 {
  grid-template-columns: repeat(2, 1fr);
}

.chat-message-image {
  display: grid;
}

.count-3 {
  grid-template-columns: 2fr 1fr;
  grid-template-rows: 1fr 1fr;
  grid-template-areas:
    "main img1"
    "main img2";
  /* gap: 8px; */
}

.count-3 .x0 {
  grid-area: main;
}
.count-3 .x1 {
  grid-area: img1;
}
.count-3 .x2 {
  grid-area: img2;
}

/* Четыре элемента: равномерная сетка 2x2 */
.count-4 {
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
}

.count-5 {
  grid-template-areas:
    "img0 img0 img0 img1 img1 img1"
    "img2 img2 img3 img3 img4 img4";
}
.count-5 .x0 {
  grid-area: img0;
}
.count-5 .x1 {
  grid-area: img1;
}
.count-5 .x2 {
  grid-area: img2;
}
.count-5 .x3 {
  grid-area: img3;
}
.count-5 .x4 {
  grid-area: img4;
}

/* Общие стили изображений */
.image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
}

/*  */

.title h3 {
  font-family: "Montserrat", 0;
  font-style: normal;
  font-weight: 500;
  font-size: 34px;
  line-height: 29px;
  color: #ffffff;
}

.global-drop-zones {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 20px;
  pointer-events: none;
  z-index: 9999;
  background: rgba(18, 14, 22, 0.5);
  backdrop-filter: blur(5px);
}

.drop-zones {
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 20px;
  background: rgba(18, 14, 22, 0.5);
  backdrop-filter: blur(5px);
  z-index: 100;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.drop-zones.active {
  opacity: 1;
  pointer-events: auto;
}

.dropzone {
  width: 80%;
  max-width: 400px;
  min-height: 100px;
  border: 2px dashed rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(37, 33, 57, 0.3);
  transition: all 0.3s ease;
  pointer-events: auto;
  cursor: pointer;
}

.dropzone:hover {
  border-color: #c14481;
  background: rgba(37, 33, 57, 0.5);
  transform: scale(1.02);
}

.dropzone.active {
  border-color: #c14481;
  background: rgba(37, 33, 57, 0.5);
  transform: scale(1.05);
}

.dropzone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #fff;
  padding: 10px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.preview-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  background: rgba(37, 33, 57, 0.5);
  border-radius: 8px;
  max-height: 120px;
  overflow-y: auto;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 5px;
}

.preview-title {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
}

.clear-all-button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  background: rgba(255, 68, 68, 0.2);
  border: none;
  border-radius: 4px;
  color: #ff4444;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
}

.clear-all-button:hover {
  background: rgba(255, 68, 68, 0.3);
}

.preview-section {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.preview-section:not(:last-child) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 5px;
}

.preview-files {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 5px;
}

.image-preview {
  background: rgba(37, 33, 57, 0.3);
  border-radius: 8px;
}

.file-preview {
  background: rgba(37, 33, 57, 0.3);
  border-radius: 8px;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: #252139;
  border-radius: 4px;
  position: relative;
}

.preview-image {
  width: 30px;
  height: 30px;
  object-fit: cover;
  border-radius: 4px;
}

.preview-name {
  font-size: 11px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

.remove-preview {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #ff4444;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 12px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
}

.remove-preview:hover {
  background: #ff6666;
}
</style>
