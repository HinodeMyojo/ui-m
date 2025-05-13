<script setup>
import { ref, onMounted } from 'vue'
const tasks = [
  {
    icon: 'mdi-book',
    title: 'Book: Grokking Algorithms',
    date: '2 Apr – 18 Apr',
    color: '#25636A',
    progress: 7 / 9 * 100,
    steps: 9,
    stepActive: 7,
  },
  {
    icon: 'mdi-lightbulb-question-outline',
    title: 'LeetCode: 25 problems',
    date: '5 Apr – 30 Apr',
    color: '#6B3B1A',
    progress: 19 / 25 * 100,
    steps: 25,
    stepActive: 19,
  },
  {
    icon: 'mdi-briefcase',
    title: 'Interviews (5)',
    date: '10 Apr – 28 Apr',
    color: '#25636A',
    progress: 2 / 5 * 100,
    steps: 5,
    stepActive: 2,
  },
  {
    icon: 'mdi-robot',
    title: 'Hackathon Project',
    date: '15 Apr – 28 Apr',
    color: '#3B3551',
    progress: 3 / 6 * 100,
    steps: 6,
    stepActive: 3,
  },
]
const columns = Array.from({ length: 28 }, (_, i) => i + 1)
const visibleRows = ref(0)

onMounted(() => {
  const rowHeight = 30 // px — подстроить под ваш стиль
  const headerHeight = 40
  const totalHeight = window.innerHeight - headerHeight
  visibleRows.value = Math.floor(totalHeight / rowHeight)
})


const currentDate = new Date()
const currentMonth = currentDate.getMonth()
const currentYear = currentDate.getFullYear()

const getDaysInMonth = (month, year) => {
  return new Date(year, month + 1, 0).getDate()
}

const daysInMonth = getDaysInMonth(currentMonth, currentYear)
const gridColumns = Array.from({ length: daysInMonth }, (_, i) => i + 1)

const handlePrevMonth = () => {
  // TODO: Implement previous month logic
  console.log('Previous month clicked')
}

const handleNextMonth = () => {
  // TODO: Implement next month logic
  console.log('Next month clicked')
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
            <H3>APRIL</H3>
            <v-icon
                icon="mdi-chevron-right"
                size="large"
                class="month-nav-icon"
                @click="handleNextMonth"
            />
        </div>
        <div class="body">
            <div class="table-wrapper">
            <table class="custom-table">
            <thead>
                <tr>
                <th v-for="col in columns" :key="col">{{ col }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="row in visibleRows" :key="row">
                <td v-for="col in columns" :key="col">&nbsp;</td>
                </tr>
            </tbody>
            </table>
            </div>
        </div>
    </div>
</template>

<style scoped>

.body{
    width: 100%;
    flex: 5;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.table-wrapper {
    width: 100%;
    height: 100%;
    overflow: auto;
    flex: 1;
}

.table-wrapper::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

.table-wrapper::-webkit-scrollbar-track {
    background: #1E2025;
}

.table-wrapper::-webkit-scrollbar-thumb {
    background: #2C2F36;
    border-radius: 4px;
}

.table-wrapper::-webkit-scrollbar-thumb:hover {
    background: #3B3F48;
}

.custom-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    min-width: max-content;
}

.custom-table th,
.custom-table td {
  border: 1px solid #1E2025;
  padding: 5px;
  height: 30px;
  text-align: center;
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

.header{
    width: 100%;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 50px;
    border-bottom: 2px solid #1E2025;
}

.header h3{
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

</style>
