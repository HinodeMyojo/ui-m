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
          @drop="onDrop($event, task.subtasks)"
          @dragover="onDragOver"
        >
          <div ref="subtasksRef">
            <div
              v-for="(subtask, index) in task.subtasks"
              :key="index"
              draggable="true"
              @dragstart="startDrag($event, subtask)"
              @click="clickSubtask(subtask.id)"
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
                  <h3 class="truncate block text-white" title="subtask.title">
                    {{ subtask.title }}
                  </h3>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="chat" ref="chatRef">
          <div class="chat-header">
            <h3>Чат</h3>
          </div>
          <div class="chat-main">
            <div class="chat-main-inner">
              <div
                v-for="message in Array.isArray(chat.messages)
                  ? chat.messages
                  : []"
                :key="message.id"
                class="message"
              >
                <div class="chat-inner-message">
                  <template
                    v-if="
                      Array.isArray(message.images) && message.images.length
                    "
                  >
                    <div class="chat-message-image">
                      <div
                        class="chat-thumbnails"
                        v-for="img in message.images"
                        :key="img.imageId"
                        @click="openImage(img.imageId)"
                      >
                        <img
                          :src="img.thumbnail"
                          alt="User Image"
                          v-if="img.thumbnail"
                        />
                      </div>
                    </div>
                  </template>
                  {{ message.text }}
                </div>
                <!-- <hr /> -->
                <div class="chat-time">
                  {{ message.date }}
                </div>
              </div>
            </div>
            <div class="chat-background">
              <img
                :src="bonfire"
                alt="Bonfire GIF"
                :style="{ userSelect: 'none', pointerEvents: 'none' }"
              />
            </div>
          </div>
          <div class="chat-input">
            <div class="chat-input-inner">
              <input type="text" placeholder="Введите сообщение..." />
            </div>
            <div class="chat-input-buttoms">
              <div class="send-icon">
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
import { mdiSendCircleOutline } from "@mdi/js";
import { useTemplateRef, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import chat from "./test.js";
import bonfire from "../../assets/gif/bonfire-dark-souls.gif";

// icons
const path = mdiSendCircleOutline;

// для начала перетаскивания
function startDrag(evt, item, index) {
  evt.dataTransfer.effectAllowed = "move";
  evt.dataTransfer.setData("itemID", item.id);
  evt.dataTransfer.setData("fromIndex", index);
}

// когда закинули объект
function onDrop(evt, targetList) {
  evt.preventDefault();
  const itemID = parseInt(evt.dataTransfer.getData("text/plain"));
  const item = targetList.find((i) => i.id === itemID);
}

function onDragOver(evt) {
  evt.preventDefault();
}

function computeProgres() {
  var persent = Math.round((task.completed / task.total) * 100);
  return persent;
}

function needProgress() {
  if (task.currentDay === -1) {
    return -1;
  }
  if (task.currentDay === 0) {
    return 0;
  }
  var desiredCompletedTasks = (task.total / task.totalDays) * task.currentDay;
  var desiredProgressPercent = (desiredCompletedTasks / task.total) * 100;
  var persent = Math.round(desiredProgressPercent);
  return persent;
}

function checkNeedPersentText() {
  if (needProgress() === -1) {
    return "Срок проёбан брат";
  }
  if (needProgress() === 0) {
    return "Всё еще впереди брат";
  }
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

// TODO получение фото
const openImage = async (imageId) => {
  console.log(imageId);
};

// Клик по подзадаче
const subtasksContainer = useTemplateRef("subtasksRef");
const chatContainer = useTemplateRef("chatRef");
const isSubtaskClicked = ref(false);
const isSubtaskChatOpen = ref(false);

// Обработчик клика по подзадаче
const clickSubtask = async (id) => {
  //   const chat = await fetch("/chat/" + id);
  const chatVal = chat.find((chat) => chat.id === id);
  if (chatVal) {
    isSubtaskChatOpen.value = true;
  }

  console.log(id);
};

// const handleClickOutside = (event) => {
//   if (
//     subtasksContainer.value &&
//     !subtasksContainer.value.contains(event.target) &&
//     !chatContainer.value.contains(event.target)
//   ) {
//     isSubtaskClicked.value = false;
//   }
// };

// onMounted(() => {
//   document.addEventListener("click", handleClickOutside);
// });

// onBeforeUnmount(() => {
//   document.removeEventListener("click", handleClickOutside);
// });
</script>
<style scoped>
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
  /* margin: 2%; */
  padding: 3% 5% 3% 5%;
  display: grid;
  grid-template-rows: 1fr 1.5fr 10fr;
  gap: 20px;
  justify-content: center;
  flex-direction: column;
  align-items: center;
}

.title {
  /* flex: 1; */
  display: flex;
  justify-content: center;
  align-items: center;
  /* background-color: #2E2660; */
  width: 100%;
  height: 100%;
}
.progres {
  /* flex: 1.5; */
  /* display: flex; */
  justify-content: center;
  align-items: center;
  gap: 10px;
  /* background-color: #8d4c21; */
  width: 100%;
  flex-direction: column;
  height: 100%;
}
.today-progres,
.need-progres {
  width: 100%;
}
.inner-menu {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex-direction: row;
  flex: 10;
  gap: 7px;
  width: 100%;
  max-height: 100%;
}

.subtasks {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* background-color: aquamarine; */
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
  padding-left: 10px;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 40px;
  gap: 15px;
  border-radius: 5px;
  /* border-bottom-right-radius: 0px;
  border-top-right-radius: 0px; */
  user-select: none;
  /* background-color: aquamarine; */
}
.subtask :hover {
  background-color: #252139;
}

.subtask :checked {
  background-color: #252139;
}

.subtask h3 {
  font-size: 18px;
  line-height: 29px;
  color: #ffffff;
}
.chat {
  width: 100%;
  max-height: 100%;
  display: grid;
  grid-template-rows: 1fr 10fr 1fr;
  justify-content: center;
  align-items: center;
  border-radius: 20px;
  /* border-top-left-radius: 0px; */
  background-color: #120e16;
  overflow: hidden;
}
.chat-header {
  display: grid;
  width: 100%;
  height: 100%;
  background-color: #252139;
  align-content: center;
  justify-items: flex-start;
}
.chat-header h3 {
  padding-left: 10px;
  font-size: 22px;
  font-weight: 400;
  line-height: 29px;
  /* color: #ffffff; */
}
.chat-main {
  display: grid;
  /* flex: 10; */
  width: 100%;
  max-height: 100%;
  overflow-y: auto;
}
.chat-background {
  display: flex;
  flex: 1;
  justify-content: center;
  align-items: center;
  opacity: 0.4;
}
.chat-input {
  /* display: flex; */
  flex-direction: column;
  /* flex: 2; */
  width: 100%;
  gap: 10px;
  padding: 10px 10px 0px 10px;
  height: 100%;
  background-color: #252139;
}
.chat-input-inner {
  align-self: center;
  width: 100%;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 10px 10px 10px 10px;
  border-radius: 10px;
  background-color: #3d375a8a;
  color: #ffffff;
}
.chat-input-inner input {
  width: 100%;
  height: 100%;
  box-sizing: border-box;

  -webkit-transition: 0.5s;
  transition: 0.5s;
  outline: none;
  background-color: transparent;
}
.message {
  background-color: #25213980;
  padding: 10px;
  width: 100%;
  display: flex;
  border-radius: 10px;
  flex-direction: column;
  /* gap: 10px; */
}
.message hr {
  color: #ffffff0e;
}
.chat-main-inner {
  width: 100%;
  display: grid;
  grid-template-rows: repeat(auto-fit, minmax(100px, 1fr));
  /* display: flex; */
  /* flex-direction: column; */
  align-items: flex-start;
  gap: 10px;
  padding: 10px 10px 10px 10px;
}

.chat-input-buttoms {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 20px;
}
.send-icon {
  cursor: pointer;
  transition: 0.3s ease;
}
.send-icon:hover {
  color: white;
}
.send-icon:active {
  transform: scale(0.9);
}
.chat-time {
  width: 100%;
  text-align: end;
  font-size: 12px;
  /* line-height: 29px; */
  /* color: #ffffff; */
}
.chat-thumbnails {
  width: 100%;
  cursor: pointer;
  display: flex;
}
.chat-message-image {
  display: grid;
  /* grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); */
  /* grid-auto-rows: minmax(10px, auto); */
  gap: 10px;
}

.chat-inner-message {
  display: flex;
  gap: 10px;
  flex-direction: column;
}
.title h3 {
  font-family: "Montserrat", 0;
  font-style: normal;
  font-weight: 500;
  font-size: 34px;
  line-height: 29px;
  color: #ffffff;
}
</style>
