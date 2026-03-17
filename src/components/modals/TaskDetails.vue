<template>
  <div v-if="modalState.active">
    <UniversalSubtaskModal
      :key="modalState.mode + (modalState.subtask?.id || '')"
      :task="task"
      :mode="modalState.mode"
      :subtask="modalState.subtask"
      @close="closeModal"
      @created="handleCreatedSubtask"
      @updated="handleUpdatedSubtask"
      @deleted="handleDeletedSubtask"
    />
  </div>
  <div class="modal-cntnt">
    <!-- Модальное окно для просмотра изображения -->
    <div
      v-if="selectedImage"
      class="image-preview-modal"
      @click="closeImagePreview"
    >
      <div class="image-preview-content" @click.stop>
        <img :src="selectedImage" alt="Preview" />
        <button class="close-button" @click="closeImagePreview">
          <svg-icon type="mdi" :path="mdiClose" size="24"></svg-icon>
        </button>
      </div>
    </div>
    <div class="content">
      <div class="content-header">
        <div class="title">
          <h3>{{ task.title }}</h3>
        </div>
        <div class="icons">
          <div class="trash-icon" @click="deleteTask(task)">
            <svg-icon type="mdi" :path="trash" size="24"></svg-icon>
          </div>
        </div>
      </div>
      <div class="progres">
        <div class="today-progres">
          <div class="flex justify-between mb-1">
            <span class="text-base font-medium text-blue-700 dark:text-white"
              >Текущий прогресс:
            </span>
            <span class="text-sm font-medium text-blue-700 dark:text-white"
              >{{ progressObj.CompletedTasks }} /
              {{ progressObj.TotalTasks }}</span
            >
          </div>
          <div class="w-full bg-gray-200 rounded-full h-3.5 dark:bg-gray-700">
            <div
              class="bg-indigo-500 h-3.5 rounded-full"
              :style="{ width: progressPercentage + '%' }"
            ></div>
          </div>
        </div>
        <div class="need-progres">
          <div class="flex justify-between mb-1">
            <span class="text-base font-medium text-blue-700 dark:text-white"
              >{{ checkNeedPersentText() }}:
            </span>
            <span class="text-sm font-medium text-blue-700 dark:text-white"
              >{{ progressObj.RequiredTasks }} /
              {{ progressObj.TotalTasks }}</span
            >
          </div>
          <div class="w-full bg-gray-200 rounded-full h-3.5 dark:bg-gray-700">
            <div
              class="bg-neonPink h-3.5 rounded-full"
              :style="{
                width:
                  needProgressPercentage === -1
                    ? '100%'
                    : needProgressPercentage + '%',
                backgroundColor: needProgress() === -1 ? 'red' : '#c14481',
              }"
            ></div>
          </div>
        </div>
      </div>
      <div class="inner-menu">
        <div class="inner-menu-content">
          <div
            class="subtasks"
            @drop="onSubtaskDrop($event, task.subtasks)"
            @dragover.prevent
            ref="subtasksRef"
          >
            <div
              v-for="(subtask, index) in task.subtasks"
              :key="index"
              draggable="true"
              @dragstart="startDrag($event, subtask)"
              @click="clickSubtask(subtask)"
              :class="['subtask', { selected: isSelected(subtask) }]"
            >
              <div class="subtask-boba">
                <input
                  type="checkbox"
                  v-model="subtask.done"
                  :id="'subtask-' + index"
                  class="w-4 h-4 accent-blue"
                  @change="updateSubtask(subtask.id, subtask.done)"
                />
                <span
                  :for="'subtask-' + index"
                  :class="{ 'text-gray-500': subtask.done }"
                  class="flex-1 overflow-hidden subtask-content"
                >
                  <h3 class="truncate block text-white" :title="subtask.title">
                    {{ subtask.title }}
                  </h3>
                  <div
                    v-if="subtask.end"
                    class="subtask-deadline"
                    :class="getDeadlineClass(subtask.end)"
                  >
                    {{ formatDeadline(subtask.end) }}
                  </div>
                </span>
              </div>
            </div>
          </div>
          <div class="subtask-buttons">
            <button class="subtask-btn add-btn" @click="openAddSubtaskModal">
              Добавить
            </button>
            <div v-if="chatValue?.id !== null" style="display: contents">
              <button
                class="subtask-btn edit-btn"
                @click="openEditSubtaskModal(selectedSubtask)"
              >
                Редактировать
              </button>
            </div>
            <div v-if="chatValue?.id !== null" style="display: contents">
              <button
                class="subtask-btn delete-btn"
                @click="openDeleteSubtaskModal(selectedSubtask)"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>

        <div
          class="chat"
          ref="chatRef"
          @dragover.prevent="handleDragOver"
          @dragleave="handleDragLeave"
          @drop.prevent="handleDrop"
        >
          <div class="chat-header" ref="chatHeaderRef">
            <div class="chat-header-content">
              <button
                v-if="chatValue?.id !== null"
                class="back-button"
                @click="openTaskChat"
              >
                <svg-icon type="mdi" :path="mdiArrowLeft" size="20"></svg-icon>
              </button>
              <h3>{{ chatValue?.name || task.title }}</h3>
            </div>
          </div>
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
          <div class="chat-main" ref="chatMainRef">
            <div class="chat-main-inner">
              <div v-if="messagesVar == null" class="empty-chat">
                <img src="@/assets/gif/bonfire-dark-souls.gif" alt="" />
              </div>
              <div
                v-for="message in messagesVar"
                :key="message.id"
                class="message"
              >
                <div class="chat-inner-message">
                  <!-- Изображения -->
                  <template v-if="message.attachments?.images?.length">
                    <div
                      class="chat-message-image"
                      :class="'count-' + message.attachments.images.length"
                    >
                      <div
                        class="chat-thumbnails"
                        :class="'x' + index"
                        v-for="(img, index) in message.attachments.images"
                        :key="img.id"
                        @click="openImage(img.original)"
                      >
                        <img
                          :src="img.thumbnail"
                          :alt="'Image ' + (index + 1)"
                          :class="'img-' + index"
                        />
                        <button
                          v-if="isEditing(message.id)"
                          class="remove-attachment"
                          @click.stop="removeImage(message.id, index)"
                        >
                          <svg-icon
                            type="mdi"
                            :path="mdiClose"
                            size="16"
                          ></svg-icon>
                        </button>
                      </div>
                    </div>
                  </template>

                  <!-- Файлы -->
                  <template v-if="message.attachments?.files?.length">
                    <div class="chat-message-files">
                      <div
                        v-for="(file, index) in message.attachments.files"
                        :key="file.id"
                        class="file-item"
                      >
                        <div class="file-info">
                          <svg-icon
                            type="mdi"
                            :path="getFileIcon(file.type)"
                            size="20"
                          ></svg-icon>
                          <a
                            :href="file.url"
                            class="file-name"
                            target="_blank"
                            >{{ file.name }}</a
                          >
                          <span class="file-size">{{
                            formatFileSize(file.size)
                          }}</span>
                        </div>
                        <button
                          v-if="isEditing(message.id)"
                          class="remove-attachment"
                          @click="removeMessageFile(message.id, index)"
                        >
                          <svg-icon
                            type="mdi"
                            :path="mdiClose"
                            size="16"
                          ></svg-icon>
                        </button>
                      </div>
                    </div>
                  </template>

                  <div class="message-content">
                    <div class="message-text" v-if="!isEditing(message.id)">
                      {{ message.text }}
                    </div>
                    <textarea
                      v-else
                      v-model="editingText"
                      class="message-edit-input"
                      @keydown.enter.prevent="saveEdit(message.id)"
                      @keydown.esc="cancelEdit"
                      ref="editInput"
                    ></textarea>
                    <div class="message-actions">
                      <button
                        v-if="!isEditing(message.id)"
                        class="edit-button"
                        @click="startEdit(message)"
                      >
                        <svg-icon
                          type="mdi"
                          :path="mdiPencil"
                          size="16"
                        ></svg-icon>
                      </button>
                      <template v-else>
                        <button
                          class="save-button"
                          @click="saveEdit(message.id)"
                        >
                          <svg-icon
                            type="mdi"
                            :path="mdiCheck"
                            size="16"
                          ></svg-icon>
                        </button>
                        <button class="cancel-button" @click="cancelEdit">
                          <svg-icon
                            type="mdi"
                            :path="mdiClose"
                            size="16"
                          ></svg-icon>
                        </button>
                      </template>
                    </div>
                  </div>
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
import UniversalSubtaskModal from "./UniversalSubtaskModal.vue";

import {
  fetchTasks,
  addTaskAPI,
  deleteTaskAPI,
  updateTaskAPI,
  fetchTask,
  checkTask,
  fetchProgress,
} from "../api.js";

import {
  mdiSendCircleOutline,
  mdiPaperclip,
  mdiImage,
  mdiFile,
  mdiClose,
  mdiPencil,
  mdiCheck,
  mdiFileDocument,
  mdiArrowLeft,
  mdiTrashCanOutline,
} from "@mdi/js";
import {
  useTemplateRef,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  computed,
  nextTick,
} from "vue";

import chat from "./test.js";
import bonfire from "../../assets/gif/bonfire-dark-souls.gif";
import ChatMessage from "../extension/ChatMessage.vue";

// Icons
const path = mdiSendCircleOutline;
const path1 = mdiPaperclip;
const trash = mdiTrashCanOutline;

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
  return Math.round(
    (progressObj.value.CompletedTasks / progressObj.value.TotalTasks) * 100
  );
}

function needProgress() {
  if (progressObj.CurrentDay === -1) return -1;
  if (progressObj.CurrentDay === 0) return 0;
  return Math.round(
    (progressObj.value.RequiredTasks / progressObj.value.TotalTasks) * 100
  );
}

function checkNeedPersentText() {
  if (needProgress() === -1) return "Срок проёбан брат";
  if (needProgress() === 0) return "Всё еще впереди брат";
  return "Нужно брат";
}

const props = defineProps({
  task: Object,
});

const task = ref(props.task);

const reloadTask = async () => {
  var taskResponse = await fetchTask(task.value.id);
  await getProgress();
  task.value.subtasks = taskResponse.subtasks;
};

// Chat functionality
const messagesVar = ref(null);
const chatValue = ref(null);
const chatMainRef = ref(null);
const chatMessageRef = ref(null);

// Состояние для выбранного изображения
const selectedImage = ref(null);

const modalState = ref({
  active: false,
  mode: "add",
  subtask: null,
});

// Открытие модалки
const openAddSubtaskModal = () => {
  modalState.value = { active: true, mode: "add", subtask: null };
};

const openEditSubtaskModal = (subtask) => {
  modalState.value = { active: true, mode: "edit", subtask };
};

const openDeleteSubtaskModal = (subtask) => {
  modalState.value = { active: true, mode: "delete", subtask };
};

const closeModal = () => {
  modalState.value.active = false;
};

const handleCreatedSubtask = (subtask) => {
  reloadTask();
};

const handleUpdatedSubtask = (updatedSubtask) => {
  reloadTask();
};

const handleDeletedSubtask = (subtask) => {
  reloadTask();
};

// Функции для форматирования дедлайна
const formatDeadline = (dateString) => {
  if (!dateString) return "";

  const deadline = new Date(dateString);
  const now = new Date();

  // Нормализуем даты к началу дня для корректного сравнения
  const deadlineDay = new Date(
    deadline.getFullYear(),
    deadline.getMonth(),
    deadline.getDate()
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Разница в днях (календарных)
  const diffDays = Math.floor((deadlineDay - today) / (1000 * 60 * 60 * 24));

  // Разница в миллисекундах для проверки просрочки
  const diffMs = deadline - now;

  // Форматируем время
  const timeStr = deadline.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Форматируем дату (06.11.2025)
  const fullDateStr = deadline.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  // Просрочено
  if (diffMs < 0) {
    const absDiffMs = Math.abs(diffMs);
    const absDiffHours = Math.floor(absDiffMs / (1000 * 60 * 60));
    const absDiffMinutes = Math.floor(
      (absDiffMs % (1000 * 60 * 60)) / (1000 * 60)
    );

    // Просрочено сегодня (в пределах текущих суток)
    if (diffDays === 0) {
      if (absDiffHours === 0) {
        return `⚠️ ${absDiffMinutes}мин назад (${timeStr})`;
      }
      return `⚠️ ${absDiffHours}ч назад (${timeStr})`;
    }

    // Просрочено на несколько дней
    const dateStr = deadline.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
    });
    return `⚠️ ${dateStr} в ${timeStr} (${Math.abs(diffDays)}д назад)`;
  }

  // Сегодня
  if (diffDays === 0) {
    return `⏰ Сегодня в ${timeStr}`;
  }

  // Завтра
  if (diffDays === 1) {
    return `📅 Завтра в ${timeStr} (${fullDateStr})`;
  }

  // В течение недели (2-6 дней)
  if (diffDays >= 2 && diffDays < 7) {
    const dayName = deadline.toLocaleDateString("ru-RU", { weekday: "short" });
    return `🚀 ${
      dayName.charAt(0).toUpperCase() + dayName.slice(1)
    } в ${timeStr} (${fullDateStr})`;
  }

  // Далекое будущее (7+ дней)
  const dateStr = deadline.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
  return `🪐 ${dateStr} в ${timeStr}`;
};

const getDeadlineClass = (dateString) => {
  if (!dateString) return "";

  const deadline = new Date(dateString);
  const now = new Date();

  // Нормализуем даты к началу дня
  const deadlineDay = new Date(
    deadline.getFullYear(),
    deadline.getMonth(),
    deadline.getDate()
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffDays = Math.floor((deadlineDay - today) / (1000 * 60 * 60 * 24));
  const diffMs = deadline - now;

  // Просрочено
  if (diffMs < 0) {
    return "deadline-overdue";
  }

  // Сегодня
  if (diffDays === 0) {
    return "deadline-today";
  }

  // Завтра или послезавтра
  if (diffDays <= 2) {
    return "deadline-soon";
  }

  // Больше 2 дней
  return "deadline-normal";
};

// Обновляем функцию открытия изображения
const openImage = async (imageUrl) => {
  selectedImage.value = imageUrl;
};

// Добавляем функцию закрытия превью
const closeImagePreview = () => {
  selectedImage.value = null;
};

// Функция для прокрутки чата вниз
function scrollToBottom() {
  if (chatMainRef.value) {
    chatMainRef.value.scrollTop = chatMainRef.value.scrollHeight;
  }
}

const selectedSubtask = ref(null);
const selectedSubtaskId = ref(null);

const isSelected = function (subtask) {
  return selectedSubtaskId.value === subtask.id;
};

const clickSubtask = async (subtask) => {
  selectedSubtask.value = subtask;
  selectedSubtaskId.value = subtask.id;
  chatValue.value = { name: subtask.title };
  const chatR = chat[chatValue.value.id];
  if (chatR) {
    messagesVar.value = chatR.messages;
    setTimeout(scrollToBottom, 100);
  }
};

// Функция для открытия общего чата задачи
const openTaskChat = () => {
  chatValue.value = task.value.chat;
  chatValue.value.id = null;
  messagesVar.value = chatValue.value.messages;
  setTimeout(scrollToBottom, 100);
};

async function deleteTask(task) {
  await deleteTaskAPI(task.id);
  location.reload();
}

// Прокрутка при отправке сообщения
async function sendMessage() {
  const chatMessageRef = ref(null);
  const messageText = chatMessageRef.value?.getMessage() || "";

  if (!messageText && previewFiles.value.length === 0) return;

  const newMessage = {
    id: Date.now(),
    text: messageText,
    date: new Date().toLocaleTimeString(),
    attachments: {
      images: previewFiles.value
        .filter((file) => file.type.startsWith("image/"))
        .map((file) => ({
          id: Date.now() + Math.random(),
          original: file.preview,
          thumbnail: file.preview,
        })),
      files: previewFiles.value
        .filter((file) => !file.type.startsWith("image/"))
        .map((file) => ({
          id: Date.now() + Math.random(),
          name: file.name,
          type: file.type,
          size: file.file.size,
          url: URL.createObjectURL(file.file),
        })),
    },
  };

  messagesVar.value = [...(messagesVar.value || []), newMessage];
  chatMessageRef.value?.clearMessage();
  previewFiles.value = [];
  setTimeout(scrollToBottom, 100);
}

onMounted(() => {
  openTaskChat();
  getProgress();
  window.addEventListener("resize", scrollToBottom);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", scrollToBottom);
});

// Drag and drop handlers
function handleDragOver(event) {
  if (event.dataTransfer.types.includes("Files")) {
    isDragging.value = true;
    const items = Array.from(event.dataTransfer.items);

    const hasImages = items.some((item) => {
      const type = item.type || item.getAsFile()?.type || "";
      return imageMimeTypes.includes(type);
    });

    isDraggingImage.value = hasImages;
    isDraggingFile.value = true;
    event.stopPropagation();
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

const fileInput = ref(null);

async function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  await addPreviewFiles(files, "file");
  event.target.value = "";
}

function clearAllFiles() {
  previewFiles.value = [];
}

const imageFiles = computed(() =>
  previewFiles.value.filter((file) => file.uploadType === "image")
);

const nonImageFiles = computed(() =>
  previewFiles.value.filter((file) => file.uploadType === "file")
);

const hasImages = computed(() => imageFiles.value.length > 0);
const hasOtherFiles = computed(() => nonImageFiles.value.length > 0);

function startDrag(event, subtask) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/json", JSON.stringify(subtask));
  event.stopPropagation();
}

function onSubtaskDrop(event, subtasks) {
  if (event.dataTransfer.types.includes("Files")) {
    return;
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
  event.stopPropagation();
}

const editingMessageId = ref(null);
const editingText = ref("");

function isEditing(messageId) {
  return editingMessageId.value === messageId;
}

function startEdit(message) {
  editingMessageId.value = message.id;
  editingText.value = message.text;
  editingAttachments.value = {
    images: [...(message.attachments?.images || [])],
    files: [...(message.attachments?.files || [])],
  };
  nextTick(() => {
    if (editInput.value) {
      editInput.value.focus();
    }
  });
}

function saveEdit(messageId) {
  const messageIndex = messagesVar.value.findIndex((m) => m.id === messageId);
  if (messageIndex !== -1) {
    messagesVar.value[messageIndex].text = editingText.value;
    messagesVar.value[messageIndex].date = new Date().toLocaleTimeString();
    messagesVar.value[messageIndex].attachments = {
      images: [...(editingAttachments.value?.images || [])],
      files: [...(editingAttachments.value?.files || [])],
    };
  }
  cancelEdit();
}

function cancelEdit() {
  const messageIndex = messagesVar.value.findIndex(
    (m) => m.id === editingMessageId.value
  );
  if (messageIndex !== -1 && editingAttachments.value) {
    messagesVar.value[messageIndex].attachments = {
      images: [...editingAttachments.value.images],
      files: [...editingAttachments.value.files],
    };
  }
  editingMessageId.value = null;
  editingText.value = "";
  editingAttachments.value = null;
}

async function updateSubtask(taskId, state) {
  await checkTask(taskId, state);
  await getProgress();
}

const progressObj = ref({
  TotalDays: 0,
  CurrentDay: 0,
  TotalTasks: 0,
  CompletedTasks: 0,
  RequiredTasks: 0,
});

const progressPercentage = ref(0);
const needProgressPercentage = ref(0);

async function getProgress() {
  var result = await fetchProgress(task.value.id);
  progressObj.value = result.progress;
  progressPercentage.value = computeProgres();
  needProgressPercentage.value = needProgress();
}

const editingAttachments = ref(null);

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function removeImage(messageId, imageIndex) {
  const messageIndex = messagesVar.value.findIndex((m) => m.id === messageId);
  if (messageIndex !== -1) {
    messagesVar.value[messageIndex].attachments.images.splice(imageIndex, 1);
  }
}

function removeMessageFile(messageId, fileIndex) {
  const messageIndex = messagesVar.value.findIndex((m) => m.id === messageId);
  if (messageIndex !== -1) {
    messagesVar.value[messageIndex].attachments.files.splice(fileIndex, 1);
  }
}

function getFileIcon(type) {
  if (type.startsWith("image/")) return mdiImage;
  return mdiFileDocument;
}
</script>
<style scoped>
/* ... (сохраняем все существующие стили) ... */

/* Новые стили для дедлайнов в подзадачах */
.subtask-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.subtask-deadline {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  display: inline-block;
  width: fit-content;
  font-weight: 500;
  transition: all 0.2s ease;
}

.deadline-overdue {
  background: rgba(255, 68, 68, 0.15);
  color: #ff6b6b;
  border: 1px solid rgba(255, 68, 68, 0.3);
}

.deadline-today {
  background: rgba(255, 183, 77, 0.15);
  color: #ffb74d;
  border: 1px solid rgba(255, 183, 77, 0.3);
}

.deadline-soon {
  background: rgba(193, 68, 129, 0.15);
  color: #c14481;
  border: 1px solid rgba(193, 68, 129, 0.3);
}

.deadline-normal {
  background: rgba(110, 74, 255, 0.15);
  color: #a5b4fc;
  border: 1px solid rgba(110, 74, 255, 0.3);
}

/* Остальные существующие стили остаются без изменений */
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
  height: 100%;
  width: 50%;
  background-color: #18141d;
  border-top-left-radius: 30px;
  border-bottom-left-radius: 30px;
  border: 1px solid #2e2660;
}
.content {
  width: 100%;
  height: 100%;
  padding: 1.5% 5% 3% 5%;
  display: grid;
  grid-template-rows: 1fr 1.5fr 10fr;
  gap: 15px;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
}

.content-header {
  display: grid;
  grid-template-columns: 95% auto;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  height: 100%;
}

.title {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  text-align: center;
}

.icons {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  width: auto;
}
.trash-icon {
  opacity: 0.5;
  cursor: pointer;
  transition: all 0.2s ease;
}
.trash-icon:hover {
  opacity: 1;
  color: #ff4444;
}
.trash-icon:active {
  transform: scale(0.9);
}

.progres {
  justify-content: center;
  align-items: center;
  gap: 10px;
  width: 100%;
  display: flex;
  flex-direction: column;
  height: 100%;
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

.inner-menu-content {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 100%;
  flex-grow: 1;
  flex-direction: column;
}

.subtask-buttons {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.subtask-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 50%;
  border-radius: 8px;
  border: 2px solid transparent;
  padding: 10px 20px;
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-btn {
  border-color: #6e4aff;
}

.edit-btn {
  border-color: #6e4aff;
}

.delete-btn {
  border-color: #c14481;
}

.subtask-btn:hover {
  opacity: 0.85;
}

.subtask-btn:active {
  transform: scale(0.95);
}

.subtasks {
  flex: 10;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  text-overflow: ellipsis;
  white-space: nowrap;
  height: 100%;
  gap: 5px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: #6e4aff #111;
}
.subtask {
  cursor: grab;
  user-select: none;
  display: grid;
  grid-template-columns: 10fr 1fr;
}

.subtask :active {
  cursor: grabbing;
}

/* ====== MOBILE RESPONSIVE ====== */
@media (max-width: 768px) {
  .modal-cntnt {
    width: 100%;
    border-radius: 20px 20px 0 0;
    border-bottom-left-radius: 0;
    max-height: 92vh;
    overflow-y: auto;
  }

  .content {
    padding: 4% 4% 3% 4%;
    grid-template-rows: auto auto 1fr;
    gap: 10px;
  }

  .content-header {
    grid-template-columns: 1fr auto;
  }

  .title h3 {
    font-size: 1.1rem;
  }

  .subtask-buttons {
    flex-wrap: wrap;
    gap: 6px;
  }

  .subtask-btn {
    padding: 8px 12px;
    font-size: 0.85rem;
  }

  .subtasks {
    max-height: 50vh;
  }

  .subtask {
    grid-template-columns: 1fr auto;
  }

  .image-preview-modal {
    padding: 10px;
  }

  .image-preview-content img {
    max-width: 95vw;
    max-height: 85vh;
  }
}
.subtask.selected {
  background-color: rgba(61, 55, 90, 0.5);
}
.subtask:hover {
  background-color: rgba(61, 55, 90, 0.5);
}

.subtask-boba {
  display: flex;
  padding: 8px 0;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  min-height: 40px;
  gap: 15px;
  border-radius: 8px;
  user-select: none;
  overflow: hidden;
  transition: background-color 0.2s ease;
}

.subtask-boba input[type="checkbox"] {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  cursor: pointer;
  accent-color: #6e4aff;
  transition: all 0.2s ease;
  flex-shrink: 0;
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
  gap: 11px;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.chat {
  display: grid;
  grid-template-rows: 1fr 10fr 1fr;
  height: 100%;
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
  min-height: 48px;
  background-color: #252139;
  align-content: center;
  justify-items: flex-start;
  padding: 0 16px;
}
.chat-header h3 {
  padding-left: 8px;
  font-size: 18px;
  font-weight: 500;
  line-height: 1.4;
  color: #ffffff;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.chat-main {
  display: grid;
  width: 100%;
  height: 100%;
  max-height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #6e4aff #111;
  padding: 16px;
}

.chat-main::-webkit-scrollbar {
  width: 8px;
}

.chat-main::-webkit-scrollbar-track {
  background: #111;
}

.chat-main::-webkit-scrollbar-thumb {
  background-color: #888;
  border-radius: 4px;
  border: 2px solid #111;
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
  position: relative;
  flex-direction: column;
  width: 100%;
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
.empty-chat {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #ffffff;
  opacity: 0.6;
  font-size: 14px;
  user-select: none;
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

.image-grid {
  display: grid;
  gap: 8px;
}

.count-1 {
  grid-template-columns: 1fr;
}

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

.image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
}

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
  position: absolute;
  top: 48px;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: v-bind('chatMainRef?.clientHeight + "px"');
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
  scrollbar-width: thin;
  scrollbar-color: #6e4aff #111;
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

.image-preview-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.9);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  cursor: pointer;
}

.image-preview-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  cursor: default;
}

.image-preview-content img {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

.close-button {
  position: absolute;
  top: -40px;
  right: -40px;
  background: rgba(37, 33, 57, 0.8);
  border: none;
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-button:hover {
  background: rgba(37, 33, 57, 1);
  transform: scale(1.1);
}

.close-button:active {
  transform: scale(0.95);
}

.message-content {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
}

.message-text {
  flex: 1;
  word-break: break-word;
}

.message-edit-input {
  flex: 1;
  min-height: 60px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(37, 33, 57, 0.5);
  border: 1px solid rgba(110, 74, 255, 0.3);
  color: white;
  font-size: 14px;
  resize: vertical;
  outline: none;
  transition: all 0.2s ease;
}

.message-edit-input:focus {
  border-color: #6e4aff;
  background: rgba(37, 33, 57, 0.8);
}

.message-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.message:hover .message-actions {
  opacity: 1;
}

.edit-button,
.save-button,
.cancel-button {
  padding: 4px;
  border: none;
  border-radius: 4px;
  background: rgba(37, 33, 57, 0.5);
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.edit-button:hover {
  background: rgba(110, 74, 255, 0.3);
}

.save-button {
  background: rgba(46, 160, 67, 0.3);
}

.save-button:hover {
  background: rgba(46, 160, 67, 0.5);
}

.cancel-button {
  background: rgba(218, 54, 51, 0.3);
}

.cancel-button:hover {
  background: rgba(218, 54, 51, 0.5);
}

.edit-button:active,
.save-button:active,
.cancel-button:active {
  transform: scale(0.95);
}

.chat-message-files {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0;
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  background: rgba(37, 33, 57, 0.3);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.file-item:hover {
  background: rgba(37, 33, 57, 0.5);
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: white;
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  color: #6e4aff;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.2s ease;
}

.file-name:hover {
  color: #8a6eff;
  text-decoration: underline;
}

.file-size {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
}

.remove-attachment {
  padding: 4px;
  border: none;
  border-radius: 4px;
  background: rgba(218, 54, 51, 0.3);
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-attachment:hover {
  background: rgba(218, 54, 51, 0.5);
  transform: scale(1.1);
}

.remove-attachment:active {
  transform: scale(0.95);
}

.chat-thumbnails {
  position: relative;
}

.chat-thumbnails .remove-attachment {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.7);
}

.chat-thumbnails .remove-attachment:hover {
  background: rgba(218, 54, 51, 0.7);
}

.chat-header-content {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 0 8px;
  min-width: 0;
}

.back-button {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.back-button:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.chat-switch-button {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.chat-switch-button:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.chat-switch-button.active {
  color: #6e4aff;
  background: rgba(110, 74, 255, 0.1);
}

.chat-divider {
  color: rgba(255, 255, 255, 0.3);
  font-size: 14px;
}

.subtask-chats {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.subtask-chats::-webkit-scrollbar {
  height: 4px;
}

.subtask-chats::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.subtask-chats::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.subtask-chats::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.preview-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  padding: 2px 5px;
}
</style>
