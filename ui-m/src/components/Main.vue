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
                            :class="{ 'drag-over': dragOverTask === task, 'dragging': draggedTask === task }"
                            :style="{
                                top: `${TASKS_TOP_OFFSET + index * TASK_TOTAL_HEIGHT}px`,
                                left: `${(task.startDate - 1) * (100 / daysInMonth)}%`,
                                width: `${(task.endDate - task.startDate + 1) * (100 / daysInMonth)}%`,
                                height: `${TASK_HEIGHT}px`,
                                marginBottom: `${TASK_MARGIN}px`
                            }"
                            draggable="true"
                            @dragstart="handleDragStart(task, $event)"
                            @dragend="handleDragEnd"
                        >
                            <div class="task-inner">
                                <div class="task-row">
                                    <span class="task-icon">📚</span>
                                    <span class="task-title">{{ task.title }}</span>
                                </div>
                                <div class="task-dates">
                                    {{ task.startDate }} {{ getMonthName(currentMonth).slice(0,3) }} – {{ task.endDate }} {{ getMonthName(currentMonth).slice(0,3) }}
                                </div>
                            </div>
                            <div class="task-progress-bar-segments">
                                    <span v-for="n in task.steps" :key="n" class="segment" :class="{ filled: n <= task.stepActive }" :style="{ backgroundColor: n <= task.stepActive ? task.color : '' }"></span>
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
    border-radius: 18px;
    transition:
        top 0.35s cubic-bezier(.4,2,.6,1),
        box-shadow 0.25s cubic-bezier(.4,2,.6,1),
        background 0.25s,
        transform 0.25s,
        z-index 0.25s,
        border-radius 0.2s;
    will-change: top, box-shadow, background, transform, border-radius;
    z-index: 1;
    background: #18343b;
    box-shadow: 0 2px 12px 0 rgba(0,0,0,0.18);
    padding: 20px 28px 18px 24px;
    min-width: 220px;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
}

.task-item:hover {
    box-shadow: 0 6px 24px 0 rgba(80,200,255,0.18), 0 1.5px 6px 0 rgba(0,0,0,0.10);
    background: rgba(60, 80, 100, 0.92) !important;
    filter: brightness(1.08);
}

.task-item.dragging {
    box-shadow: 0 8px 32px 0 rgba(0,0,0,0.32);
    transform: scale(1.04) translateY(-4px);
    z-index: 10;
    background: rgba(40, 60, 80, 0.95) !important;
}

.task-item.drag-over {
    transform: translateY(10px);
}

.task-inner {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
}

.task-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.task-icon {
    font-size: 1.6rem;
    margin-right: 2px;
}

.task-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.01em;
    line-height: 1.2;
}

.task-dates {
    font-size: 1.08rem;
    color: #b7c9d1;
    margin-left: 2px;
    margin-top: 2px;
    font-weight: 500;
}

.task-progress-bar-segments {
    display: flex;
    gap: 6px;
    margin-top: 6px;
    margin-left: 2px;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
}

.segment {
    flex: 1 1 0;
    min-width: 10px;
    max-width: 32px;
    height: 10px;
    border-radius: 3px;
    background: rgba(255,255,255,0.08);
    transition: background 0.2s;
}

.segment.filled {
    background: var(--segment-color, #25636A);
    opacity: 0.95;
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
    z-index: 5;
    pointer-events: none;
    opacity: 1;
    transition: top 0.35s cubic-bezier(.4,2,.6,1), opacity 0.2s;
}
</style>
