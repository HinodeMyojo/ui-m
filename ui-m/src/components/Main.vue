<script setup>
import { ref } from 'vue'

const tasks = ref([
  {
    title: 'Book: Grokking Algorithms',
    startDate: 2,
    endDate: 18,
    color: '#25636A',
    progress: 7 / 9 * 100,
    steps: 9,
    stepActive: 7,
  },
  {
    title: 'LeetCode: 25 problems',
    startDate: 5,
    endDate: 30,
    color: '#6B3B1A',
    progress: 19 / 25 * 100,
    steps: 25,
    stepActive: 19,
  },
  {
    title: 'Interviews (5)',
    startDate: 10,
    endDate: 28,
    color: '#25636A',
    progress: 2 / 5 * 100,
    steps: 5,
    stepActive: 2,
  },
  {
    title: 'Hackathon Project',
    startDate: 15,
    endDate: 28,
    color: '#3B3551',
    progress: 3 / 6 * 100,
    steps: 6,
    stepActive: 3,
  },
])

const currentDate = ref(new Date())
const currentMonth = ref(currentDate.value.getMonth())
const currentYear = ref(currentDate.value.getFullYear())

const getDaysInMonth = (month, year) => {
  return new Date(year, month + 1, 0).getDate()
}

const daysInMonth = ref(getDaysInMonth(currentMonth.value, currentYear.value))
const columns = Array.from({ length: 31 }, (_, i) => i + 1)
const draggedTask = ref(null)
const dragOffset = ref(0)
const dragOverTask = ref(null)
const dropIndex = ref(null)

const TASK_HEIGHT = 60
const TASK_MARGIN = 24
const TASK_TOTAL_HEIGHT = TASK_HEIGHT + TASK_MARGIN
const TASKS_TOP_OFFSET = 50

const handleDragStart = (task, event) => {
    draggedTask.value = task
    dragOffset.value = event.clientY - event.target.getBoundingClientRect().top
    event.dataTransfer.effectAllowed = 'move'
    event.target.style.opacity = '0.5'
}

const handleDragEnd = (event) => {
    event.target.style.opacity = '1'
    draggedTask.value = null
    dragOverTask.value = null
    dropIndex.value = null
}

const handleDragOver = (event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const container = event.currentTarget.querySelector('.tasks-container')
    const rect = container.getBoundingClientRect()
    const y = event.clientY - rect.top
    let index = Math.floor((y - TASKS_TOP_OFFSET) / TASK_TOTAL_HEIGHT)
    if (index < 0) index = 0
    if (index > tasks.value.length) index = tasks.value.length
    dropIndex.value = index
}

const handleTaskDragOver = (task, event) => {
    if (task !== draggedTask.value) {
        dragOverTask.value = task
    }
}

const handleTaskDragLeave = () => {
    dragOverTask.value = null
}

const handleDrop = (event) => {
    event.preventDefault()
    if (draggedTask.value !== null && dropIndex.value !== null) {
        const draggedIndex = tasks.value.indexOf(draggedTask.value)
        if (draggedIndex !== -1) {
            const newTasks = [...tasks.value]
            const [movedTask] = newTasks.splice(draggedIndex, 1)
            let insertIndex = dropIndex.value
            if (insertIndex > draggedIndex) insertIndex--
            newTasks.splice(insertIndex, 0, movedTask)
            tasks.value = newTasks
        }
    }
    dropIndex.value = null
    draggedTask.value = null
    dragOverTask.value = null
}

const handlePrevMonth = () => {
    currentMonth.value--
    if (currentMonth.value < 0) {
        currentMonth.value = 11
        currentYear.value--
    }
    daysInMonth.value = getDaysInMonth(currentMonth.value, currentYear.value)
    
    // Adjust tasks that are outside the new month's range
    tasks.value = tasks.value.map(task => {
        if (task.endDate > daysInMonth.value) {
            const duration = task.endDate - task.startDate
            return {
                ...task,
                startDate: Math.max(1, daysInMonth.value - duration),
                endDate: Math.max(1, daysInMonth.value - duration) + duration
            }
        }
        return task
    })
}

const handleNextMonth = () => {
    currentMonth.value++
    if (currentMonth.value > 11) {
        currentMonth.value = 0
        currentYear.value++
    }
    daysInMonth.value = getDaysInMonth(currentMonth.value, currentYear.value)
    
    // Adjust tasks that are outside the new month's range
    tasks.value = tasks.value.map(task => {
        if (task.endDate > daysInMonth.value) {
            const duration = task.endDate - task.startDate
            return {
                ...task,
                startDate: Math.max(1, daysInMonth.value - duration),
                endDate: Math.max(1, daysInMonth.value - duration) + duration
            }
        }
        return task
    })
}

const getMonthName = (month) => {
    return new Date(2000, month, 1).toLocaleString('default', { month: 'long' }).toUpperCase()
}
</script>

<template>
    <div class="main">
        <div class="header">
            <v-icon
                icon="mdi-chevron-left"
                size="large"
                class="month-nav-icon"
                @click="handlePrevMonth"
            />
            <H3>{{ getMonthName(currentMonth) }}</H3>
            <v-icon
                icon="mdi-chevron-right"
                size="large"
                class="month-nav-icon"
                @click="handleNextMonth"
            />
        </div>
        <div class="body">
            <div class="columns-container" 
                 @dragover="handleDragOver"
                 @drop="handleDrop">
                <div v-for="col in daysInMonth" 
                     :key="col" 
                     class="column active">
                    <div class="column-number">{{ col }}</div>
                </div>
                <div class="tasks-container">
                    <template v-for="(task, index) in tasks" :key="task.title">
                        <div v-if="dropIndex === index" class="drop-indicator" :style="{ top: `${TASKS_TOP_OFFSET + index * TASK_TOTAL_HEIGHT}px` }"></div>
                        <div
                            class="task-item"
                            :style="{
                                top: `${TASKS_TOP_OFFSET + index * TASK_TOTAL_HEIGHT}px`,
                                left: `${(task.startDate - 1) * (100 / 31)}%`,
                                width: `${(task.endDate - task.startDate + 1) * (100 / 31)}%`,
                                height: `${TASK_HEIGHT}px`,
                                marginBottom: `${TASK_MARGIN}px`
                            }"
                            draggable="true"
                            @dragstart="handleDragStart(task, $event)"
                            @dragend="handleDragEnd"
                            @dragover="handleTaskDragOver(task, $event)"
                            @dragleave="handleTaskDragLeave"
                            :class="{ 'drag-over': dragOverTask === task }"
                        >
                            <div class="task-progress">
                                <div class="task-progress-bar" 
                                    :style="{ 
                                        width: `${task.progress}%`,
                                        backgroundColor: task.color
                                    }">
                                </div>
                                <div class="task-info">
                                    <!-- {{ task.title }} ({{ task.stepActive }}/{{ task.steps }}) -->
                                    <div class="task-model">
                                        <div class="task-model-title">
                                            {{ task.title }}
                                        </div>
                                        <div class="task-model-progress">
                                            {{ task.stepActive }}/{{ task.steps }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>
                    <div v-if="dropIndex === tasks.length" class="drop-indicator" :style="{ top: `${TASKS_TOP_OFFSET + tasks.length * TASK_TOTAL_HEIGHT}px` }"></div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.body {
    width: 100%;
    flex: 5;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.columns-container {
    width: 80%;
    height: 100%;
    display: flex;
    position: relative;
    background: transparent;
}

.column {
    flex: 1;
    min-width: 0;
    border-right: 1px solid rgba(44, 47, 54, 0.5);
    position: relative;
}

.column.active {
    opacity: 1;
}

.column-number {
    padding: 8px;
    text-align: center;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1;
}

.tasks-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 2;
}

.task-item {
    position: absolute;
    pointer-events: auto;
    cursor: move;
    user-select: none;
    transition: top 0.2s ease, height 0.2s, margin-bottom 0.2s;
}

.task-item.drag-over {
    transform: translateY(10px);
}

.task-progress {
    width: 100%;
    height: 100%;
    border-radius: 4px;
    overflow: hidden;
    position: relative;
    background: rgba(30, 32, 37, 0.3);
    backdrop-filter: blur(4px);
}

.task-progress-bar {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
}

.task-info {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 90%;
    text-align: center;
    z-index: 1;
}

.main {
    flex: 1;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
}

.header {
    width: 100%;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 50px;
    border-bottom: 2px solid #1E2025;
}

.header h3 {
    font-size: 28px;
    font-weight: 600;
    color: #fff;
}

.month-nav-icon {
    color: #fff;
    cursor: pointer;
}

.month-nav-icon:hover {
    opacity: 0.8;
}

.drop-indicator {
    position: absolute;
    left: 0;
    right: 0;
    height: 0;
    border-top: 2px dashed #4ecdc4;
    z-index: 10;
    pointer-events: none;
}
</style>
