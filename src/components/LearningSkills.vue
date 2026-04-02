<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import {
  fetchLearningSkills, createLearningSkill, updateLearningSkill, deleteLearningSkill,
  createLearningGrade, updateLearningGrade, deleteLearningGrade,
  createLearningExam, updateLearningExam, deleteLearningExam,
  fetchLearningMonthPlan, setLearningMonthPlan, removeLearningMonthPlan,
  importLearningGrades,
} from "./api.js";

const router = useRouter();

// --- State ---
const allSkills = ref([]);
const loading = ref(false);
const selectedSkillId = ref(null);

const today = new Date();
const planMonth = ref(today.getMonth() + 1);
const planYear = ref(today.getFullYear());
const monthPlan = ref(null);
const spForm = ref({});

// Panels
const detailPanel = ref(null); // { type: 'grade'|'exam', data }
const showAddSkillToMonth = ref(false);

// Modals
const showCreateSkill = ref(false);
const editingSkill = ref(null);
const showCreateGrade = ref(false);
const showCreateExam = ref(false);
const showEditGrade = ref(false);
const editingGrade = ref(null);
const showImportGrades = ref(false);

// Forms
const skillForm = ref({ title: "", description: "", color: "#60a5fa", icon: "📚", grades: "" });
const gradeForm = ref({ title: "", description: "", imageUrl: "" });
const editGradeForm = ref({ title: "", description: "", imageUrl: "", position: 0, deadline: "" });
const examForm = ref({ afterGradeId: "", title: "", description: "", link: "", imageUrl: "" });
const importJson = ref("");
const importError = ref("");

const collapsedMonths = ref({});
const monthNames = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

// --- Computed ---
const selectedSkill = computed(() => allSkills.value.find(s => s.id === selectedSkillId.value));
const totalDays = computed(() => monthPlan.value?.totalDays || 30);
const totalAllocated = computed(() => Object.values(spForm.value).reduce((s, v) => s + (parseInt(v) || 0), 0));

// Skills active this month (have a month plan entry)
const activeSkillIds = computed(() => new Set((monthPlan.value?.plans || []).map(p => p.learningSkillId)));
const activeSkills = computed(() => allSkills.value.filter(s => activeSkillIds.value.has(s.id)));
const inactiveSkills = computed(() => allSkills.value.filter(s => !activeSkillIds.value.has(s.id)));

// Overall progress for a skill
function skillProgress(skill) {
  if (!skill.grades?.length) return 0;
  const total = skill.grades.reduce((s, g) => s + g.totalTasks, 0);
  const done = skill.grades.reduce((s, g) => s + g.completedTasks, 0);
  return total ? Math.round((done / total) * 100) : 0;
}

function completedGrades(skill) {
  return skill.grades?.filter(g => g.isCompleted).length || 0;
}

// --- Data ---
async function loadSkills() {
  loading.value = true;
  try { allSkills.value = await fetchLearningSkills(); } catch (e) { console.error(e); }
  finally { loading.value = false; }
}

async function loadMonthPlan() {
  try {
    monthPlan.value = await fetchLearningMonthPlan(planMonth.value, planYear.value);
    const form = {};
    for (const p of monthPlan.value?.plans || []) form[p.learningSkillId] = p.storyPoints;
    spForm.value = form;
  } catch (e) { console.error(e); }
}

// --- Skill CRUD ---
async function saveSkill() {
  if (!skillForm.value.title.trim()) return;
  if (editingSkill.value) {
    await updateLearningSkill(editingSkill.value.id, skillForm.value);
  } else {
    const res = await createLearningSkill(skillForm.value);
    selectedSkillId.value = res.id;
    const gradeNames = skillForm.value.grades.split(",").map(g => g.trim()).filter(Boolean);
    if (gradeNames.length) {
      const sk = (await fetchLearningSkills()).find(s => s.id === res.id);
      if (sk?.grades?.length === 1) await deleteLearningGrade(sk.grades[0].id);
      for (let i = 0; i < gradeNames.length; i++) await createLearningGrade({ learningSkillId: res.id, title: gradeNames[i], position: i });
    }
    // Auto-activate in current month
    await setLearningMonthPlan({ learningSkillId: res.id, month: planMonth.value, year: planYear.value, storyPoints: 0 });
  }
  closeSkillModal();
  await reload();
}

function closeSkillModal() { showCreateSkill.value = false; editingSkill.value = null; skillForm.value = { title: "", description: "", color: "#60a5fa", icon: "📚", grades: "" }; }
function startEditSkill(skill) { editingSkill.value = skill; skillForm.value = { title: skill.title, description: skill.description || "", color: skill.color, icon: skill.icon || "📚", grades: "" }; showCreateSkill.value = true; }
async function removeSkill(id) { if (!confirm("Удалить навык?")) return; await deleteLearningSkill(id); if (selectedSkillId.value === id) selectedSkillId.value = null; await reload(); }

// --- Month activation ---
async function activateSkill(skillId) {
  await setLearningMonthPlan({ learningSkillId: skillId, month: planMonth.value, year: planYear.value, storyPoints: 5 });
  showAddSkillToMonth.value = false;
  await reload();
}

async function deactivateSkill(skillId) {
  await removeLearningMonthPlan(skillId, planMonth.value, planYear.value);
  await reload();
}

// --- Grades ---
async function saveGrade() { if (!gradeForm.value.title.trim() || !selectedSkill.value) return; await createLearningGrade({ learningSkillId: selectedSkill.value.id, title: gradeForm.value.title, description: gradeForm.value.description, imageUrl: gradeForm.value.imageUrl, position: selectedSkill.value.grades?.length || 0 }); showCreateGrade.value = false; gradeForm.value = { title: "", description: "", imageUrl: "" }; await reload(); }
function startEditGrade(grade) { editingGrade.value = grade; editGradeForm.value = { title: grade.title, description: grade.description || "", imageUrl: grade.imageUrl || "", position: grade.position, deadline: grade.deadline ? grade.deadline.slice(0, 16) : "" }; showEditGrade.value = true; }
async function saveEditGrade() { if (!editingGrade.value) return; await updateLearningGrade(editingGrade.value.id, { title: editGradeForm.value.title, description: editGradeForm.value.description, imageUrl: editGradeForm.value.imageUrl, position: editGradeForm.value.position, deadline: editGradeForm.value.deadline ? new Date(editGradeForm.value.deadline).toISOString() : null }); showEditGrade.value = false; editingGrade.value = null; await reload(); }
async function moveGrade(grade, dir) { const grades = selectedSkill.value.grades; const idx = grades.findIndex(g => g.id === grade.id); const si = idx + dir; if (si < 0 || si >= grades.length) return; await updateLearningGrade(grade.id, { title: grade.title, description: grade.description, position: si }); await updateLearningGrade(grades[si].id, { title: grades[si].title, description: grades[si].description, position: idx }); await reload(); }
async function removeGrade(id) { await deleteLearningGrade(id); await reload(); }

// --- Exams ---
async function saveExam() { if (!examForm.value.title.trim() || !examForm.value.afterGradeId || !selectedSkill.value) return; await createLearningExam({ learningSkillId: selectedSkill.value.id, ...examForm.value }); showCreateExam.value = false; examForm.value = { afterGradeId: "", title: "", description: "", link: "", imageUrl: "" }; await reload(); }
async function toggleExamPassed(exam) { await updateLearningExam(exam.id, { ...exam, passed: !exam.passed }); await reload(); }
async function removeExam(id) { await deleteLearningExam(id); await reload(); }

// --- SP ---
async function saveSP(skillId) { await setLearningMonthPlan({ learningSkillId: skillId, month: planMonth.value, year: planYear.value, storyPoints: parseInt(spForm.value[skillId]) || 0 }); await loadMonthPlan(); }

function prevPlanMonth() { planMonth.value === 1 ? (planMonth.value = 12, planYear.value--) : planMonth.value--; }
function nextPlanMonth() { planMonth.value === 12 ? (planMonth.value = 1, planYear.value++) : planMonth.value++; }

// --- Import ---
async function doImportGrades() { importError.value = ""; let parsed; try { parsed = JSON.parse(importJson.value.trim()); } catch (e) { importError.value = "Невалидный JSON"; return; } if (!Array.isArray(parsed)) { importError.value = "Массив!"; return; } await importLearningGrades(selectedSkill.value.id, parsed); showImportGrades.value = false; importJson.value = ""; await reload(); }
function copyPrompt() { const ta = document.createElement("textarea"); ta.value = importPrompt; ta.style.cssText = "position:fixed;left:-9999px"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }

const importPrompt = `Сгенерируй JSON-массив уровней для навыка. Формат: [{"title":"Уровень","description":"Описание","examTitle":"Тест","examLink":"https://..."}]. examTitle/examLink необязательны. Только JSON. Навык:`;

// --- Helpers ---
function gradeProgress(g) { return g.totalTasks ? Math.round((g.completedTasks / g.totalTasks) * 100) : 0; }
function getExamsForGrade(gid) { return (selectedSkill.value?.exams || []).filter(e => e.afterGradeId === gid); }

// Auto-gradient color for grade badge: from skill color (first) to darker (last)
function gradeColor(gi, total) {
  const sk = selectedSkill.value;
  if (!sk) return '#666';
  const base = sk.color;
  // Darken by mixing with black proportionally
  const factor = total > 1 ? 1 - (gi / (total - 1)) * 0.6 : 1;
  return adjustBrightness(base, factor);
}

function adjustBrightness(hex, factor) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
  const r = Math.round(parseInt(c.slice(0,2), 16) * factor);
  const g = Math.round(parseInt(c.slice(2,4), 16) * factor);
  const b = Math.round(parseInt(c.slice(4,6), 16) * factor);
  return `rgb(${r},${g},${b})`;
}
function formatDateShort(d) { return d ? new Date(d).toLocaleDateString("ru", { day: "numeric", month: "short" }) : "?"; }

function groupTasksByMonth(tasks) {
  const groups = {};
  for (const t of tasks) {
    const d = t.start ? new Date(t.start) : null;
    const key = d ? `${d.getFullYear()}-${d.getMonth() + 1}` : "none";
    if (!groups[key]) groups[key] = { month: d ? d.getMonth() + 1 : 0, year: d ? d.getFullYear() : 0, tasks: [], label: d ? `${monthNames[d.getMonth()]} ${d.getFullYear()}` : "Без даты" };
    groups[key].tasks.push(t);
  }
  // Auto-collapse non-current months
  const result = Object.entries(groups).map(([key, val]) => {
    const isCurrent = val.month === planMonth.value && val.year === planYear.value;
    return { ...val, key, isCurrent };
  });
  result.sort((a, b) => a.isCurrent ? -1 : b.isCurrent ? 1 : 0);
  return result;
}

function isMonthCollapsed(gradeId, monthKey) {
  const k = gradeId + monthKey;
  if (collapsedMonths.value[k] !== undefined) return collapsedMonths.value[k];
  // Default: collapse non-current months
  return !monthKey.endsWith(`-${planMonth.value}`) || !monthKey.startsWith(`${planYear.value}-`);
}

function toggleMonth(gradeId, monthKey) { const k = gradeId + monthKey; collapsedMonths.value[k] = !isMonthCollapsed(gradeId, monthKey); }

// Panel
function openGradePanel(grade) { detailPanel.value = { type: 'grade', data: grade }; }
function openExamPanel(exam) { detailPanel.value = { type: 'exam', data: exam }; }
function closePanel() { detailPanel.value = null; }

async function reload() { await loadSkills(); await loadMonthPlan(); }

onMounted(async () => { await reload(); if (activeSkills.value.length) selectedSkillId.value = activeSkills.value[0].id; });
watch([planMonth, planYear], async () => {
  await loadMonthPlan();
  collapsedMonths.value = {};
  // Reset selection if skill not active in new month
  if (selectedSkillId.value && !activeSkillIds.value.has(selectedSkillId.value)) {
    selectedSkillId.value = activeSkills.value.length ? activeSkills.value[0].id : null;
  }
});
</script>

<template>
  <div class="sk">
    <!-- Header -->
    <header class="sk-head">
      <button class="sk-back" @click="router.push('/')">←</button>
      <h1>Навыки</h1>
      <div class="sk-head-month">
        <button class="sk-mn" @click="prevPlanMonth">◀</button>
        <span class="sk-month-name">{{ monthNames[planMonth - 1] }} {{ planYear }}</span>
        <button class="sk-mn" @click="nextPlanMonth">▶</button>
      </div>
      <button class="sk-create" @click="showCreateSkill = true; editingSkill = null; skillForm = { title: '', description: '', color: '#60a5fa', icon: '📚', grades: '' }">+ Навык</button>
    </header>

    <div class="sk-body">
      <!-- Left: active skills this month + SP -->
      <aside class="sk-sidebar">
        <div class="sk-sp-summary">
          <div class="sk-sp-bar">
            <div v-for="s in activeSkills" :key="s.id" class="sk-sp-seg" :style="{ flex: (spForm[s.id] || 0), background: s.color }" :title="s.title + ': ' + (spForm[s.id] || 0) + ' SP'"></div>
            <div class="sk-sp-seg sk-sp-free" :style="{ flex: Math.max(0, totalDays - totalAllocated) }"></div>
          </div>
          <div class="sk-sp-legend">
            <span class="sk-sp-legend-total">{{ totalAllocated }}/{{ totalDays }} SP</span>
            <span v-if="totalAllocated > totalDays" class="sk-sp-legend-warn">Перегрузка!</span>
            <span v-else-if="totalDays - totalAllocated > 0" class="sk-sp-legend-free">{{ totalDays - totalAllocated }} свободно</span>
          </div>
        </div>

        <div class="sk-section-title">Навыки этого месяца</div>
        <div class="sk-skill-list">
          <div v-for="s in activeSkills" :key="s.id" class="sk-skill" :class="{ active: selectedSkillId === s.id }" @click="selectedSkillId = s.id">
            <div class="sk-skill-icon" :style="{ background: s.color + '25', borderColor: s.color }">{{ s.icon || '📚' }}</div>
            <div class="sk-skill-info">
              <div class="sk-skill-name">{{ s.title }}</div>
              <div class="sk-skill-stats">
                {{ completedGrades(s) }}/{{ s.grades?.length || 0 }} ур. · {{ skillProgress(s) }}%
              </div>
              <div class="sk-skill-minibar"><div class="sk-skill-minibar-fill" :style="{ width: skillProgress(s) + '%', background: s.color }"></div></div>
            </div>
            <div class="sk-sp-control" @click.stop>
              <input type="number" class="sk-sp-input" min="0" :max="totalDays" v-model="spForm[s.id]" @change="saveSP(s.id)" />
              <div class="sk-sp-micro-bar"><div class="sk-sp-micro-fill" :style="{ width: ((spForm[s.id] || 0) / totalDays * 100) + '%', background: s.color }"></div></div>
            </div>
            <button class="sk-deactivate" @click.stop="deactivateSkill(s.id)" title="Убрать из месяца">✕</button>
          </div>
        </div>

        <button class="sk-add-skill-btn" @click="showAddSkillToMonth = true">+ Добавить навык в месяц</button>

        <div v-if="!activeSkills.length" class="sk-empty-msg">Добавь навыки в этот месяц</div>
      </aside>

      <!-- Center: selected skill detail or empty state -->
      <main class="sk-main" v-if="selectedSkill">
        <div class="sk-detail-head">
          <div class="sk-detail-icon" :style="{ background: selectedSkill.color + '20', borderColor: selectedSkill.color }">{{ selectedSkill.icon || '📚' }}</div>
          <div class="sk-detail-title-wrap">
            <h2>{{ selectedSkill.title }}</h2>
            <p v-if="selectedSkill.description" class="sk-detail-desc">{{ selectedSkill.description }}</p>
          </div>
          <div class="sk-detail-btns">
            <button class="sk-btn" @click="startEditSkill(selectedSkill)">Изменить</button>
            <button class="sk-btn sk-btn--red" @click="removeSkill(selectedSkill.id)">Удалить</button>
            <button class="sk-btn" @click="showCreateGrade = true; gradeForm = { title: '', description: '', imageUrl: '' }">+ Уровень</button>
            <button class="sk-btn" v-if="selectedSkill.grades?.length" @click="showCreateExam = true; examForm = { afterGradeId: '', title: '', description: '', link: '', imageUrl: '' }">+ Тест</button>
            <button class="sk-btn" @click="showImportGrades = true; importJson = ''; importError = ''">{ } JSON</button>
          </div>
        </div>

        <!-- Grades list -->
        <div class="sk-grades">
          <div v-for="(grade, gi) in selectedSkill.grades" :key="grade.id" class="sk-grade-wrap">
            <div class="sk-grade" :class="{ completed: grade.isCompleted }" @click="openGradePanel(grade)">
              <div class="sk-grade-badge" :style="{ background: grade.isCompleted ? '#22c55e' : gradeColor(gi, selectedSkill.grades.length) }">
                {{ grade.isCompleted ? '✓' : gi + 1 }}
              </div>
              <div class="sk-grade-body">
                <div class="sk-grade-title">{{ grade.title }}</div>
                <div v-if="grade.description" class="sk-grade-desc">{{ grade.description }}</div>
                <div class="sk-grade-meta">
                  <span class="sk-grade-tasks-count">{{ grade.completedTasks }}/{{ grade.totalTasks }} задач</span>
                  <span v-if="grade.deadline" class="sk-grade-deadline">до {{ formatDateShort(grade.deadline) }}</span>
                  <span v-if="grade.isCompleted" class="sk-grade-done-tag">Завершён</span>
                </div>
              </div>
              <div class="sk-grade-progress">
                <div class="sk-grade-progress-bar"><div class="sk-grade-progress-fill" :style="{ width: gradeProgress(grade) + '%', background: gradeColor(gi, selectedSkill.grades.length) }"></div></div>
                <span class="sk-grade-progress-pct">{{ gradeProgress(grade) }}%</span>
              </div>
              <div class="sk-grade-actions" @click.stop>
                <div class="sk-grade-move">
                  <button class="sk-move-btn" @click="moveGrade(grade, -1)" :disabled="gi === 0" title="Вверх">↑</button>
                  <button class="sk-move-btn" @click="moveGrade(grade, 1)" :disabled="gi === selectedSkill.grades.length - 1" title="Вниз">↓</button>
                </div>
                <button class="sk-action-btn" @click="startEditGrade(grade)" title="Редактировать">✎</button>
                <button class="sk-action-btn sk-action-btn--rm" @click="removeGrade(grade.id)" title="Удалить">✕</button>
              </div>
            </div>

            <!-- Tasks by month -->
            <div v-if="grade.tasks?.length" class="sk-grade-tasks">
              <div v-for="mg in groupTasksByMonth(grade.tasks)" :key="mg.key" class="sk-mg">
                <div class="sk-mg-head" @click="toggleMonth(grade.id, mg.key)">
                  <span class="sk-mg-arrow">{{ isMonthCollapsed(grade.id, mg.key) ? '▸' : '▾' }}</span>
                  <span class="sk-mg-label" :class="{ current: mg.isCurrent }">{{ mg.label }}</span>
                  <span class="sk-mg-count">{{ mg.tasks.filter(t => t.done).length }}/{{ mg.tasks.length }}</span>
                </div>
                <div v-if="!isMonthCollapsed(grade.id, mg.key)" class="sk-mg-tasks">
                  <div v-for="task in mg.tasks" :key="task.id" class="sk-task" :class="{ done: task.done }">
                    <div class="sk-task-dot" :class="{ checked: task.done }"></div>
                    <div class="sk-task-info">
                      <div class="sk-task-name">{{ task.title }}</div>
                      <div class="sk-task-meta">
                        <span class="sk-task-dates">{{ formatDateShort(task.start) }} – {{ formatDateShort(task.end) }}</span>
                        <span v-if="task.totalSubtasks" class="sk-task-subs">{{ task.completedSubtasks }}/{{ task.totalSubtasks }}</span>
                      </div>
                    </div>
                    <div v-if="task.totalSubtasks" class="sk-task-bar"><div class="sk-task-bar-fill" :style="{ width: (task.completedSubtasks / task.totalSubtasks * 100) + '%', background: selectedSkill.color }"></div></div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="sk-no-tasks">Привяжи задачи на главной</div>

            <!-- Exams (multiple per grade) -->
            <div v-for="exam in getExamsForGrade(grade.id)" :key="exam.id" class="sk-exam" :class="{ passed: exam.passed }" @click="openExamPanel(exam)">
              <div class="sk-exam-icon">{{ exam.passed ? '🏆' : '📝' }}</div>
              <div class="sk-exam-body">
                <div class="sk-exam-label">{{ exam.passed ? 'Тест пройден' : 'Промежуточный тест' }}</div>
                <div class="sk-exam-name">{{ exam.title }}</div>
              </div>
              <input type="checkbox" class="sk-exam-cb" :checked="exam.passed" @change.stop="toggleExamPassed(exam)" @click.stop />
            </div>

            <div v-if="gi < selectedSkill.grades.length - 1" class="sk-connector" :style="{ background: selectedSkill.color + '20' }"></div>
          </div>
          <div v-if="!selectedSkill.grades?.length" class="sk-empty-msg">Добавь уровни</div>
        </div>
      </main>
      <main v-else class="sk-main sk-main--empty">
        <div class="sk-empty-state">
          <div class="sk-empty-icon">🎯</div>
          <h3 v-if="!activeSkills.length">Нет навыков на {{ monthNames[planMonth - 1] }}</h3>
          <h3 v-else>Выбери навык слева</h3>
          <p v-if="!activeSkills.length">Добавь навыки в этот месяц, чтобы начать обучение</p>
          <button v-if="!activeSkills.length && allSkills.length" class="sk-create" @click="showAddSkillToMonth = true" style="margin-top:12px">+ Добавить навык в месяц</button>
          <button v-if="!allSkills.length" class="sk-create" @click="showCreateSkill = true" style="margin-top:12px">+ Создать первый навык</button>
        </div>
      </main>

      <!-- Right slide panel -->
      <transition name="slide-right">
        <aside v-if="detailPanel" class="sk-panel" @click.self="closePanel">
          <div class="sk-panel-inner">
            <button class="sk-panel-close" @click="closePanel">×</button>

            <!-- Grade panel -->
            <template v-if="detailPanel.type === 'grade'">
              <div class="sk-panel-badge" :style="{ background: gradeColor(detailPanel.data.position, selectedSkill?.grades?.length || 1) }">{{ detailPanel.data.position + 1 }}</div>
              <h3>{{ detailPanel.data.title }}</h3>
              <div v-if="detailPanel.data.imageUrl" class="sk-panel-img"><img :src="detailPanel.data.imageUrl" /></div>
              <p class="sk-panel-desc">{{ detailPanel.data.description || 'Нет описания' }}</p>
              <div class="sk-panel-stats">
                <div class="sk-panel-stat"><span class="sk-panel-stat-val">{{ detailPanel.data.completedTasks }}/{{ detailPanel.data.totalTasks }}</span><span class="sk-panel-stat-label">Задач</span></div>
                <div class="sk-panel-stat"><span class="sk-panel-stat-val">{{ gradeProgress(detailPanel.data) }}%</span><span class="sk-panel-stat-label">Прогресс</span></div>
              </div>
              <div v-if="detailPanel.data.deadline" class="sk-panel-deadline">Дедлайн: {{ formatDateShort(detailPanel.data.deadline) }}</div>
              <div class="sk-panel-status" :class="detailPanel.data.isCompleted ? 'done' : 'active'">{{ detailPanel.data.isCompleted ? 'Завершён' : 'В процессе' }}</div>
            </template>

            <!-- Exam panel -->
            <template v-if="detailPanel.type === 'exam'">
              <div class="sk-panel-exam-icon">{{ detailPanel.data.passed ? '🏆' : '📝' }}</div>
              <h3>{{ detailPanel.data.title }}</h3>
              <div v-if="detailPanel.data.imageUrl" class="sk-panel-img"><img :src="detailPanel.data.imageUrl" /></div>
              <p class="sk-panel-desc">{{ detailPanel.data.description || 'Нет описания' }}</p>
              <a v-if="detailPanel.data.link" :href="detailPanel.data.link" target="_blank" class="sk-panel-link">Открыть ссылку</a>
              <div class="sk-panel-status" :class="detailPanel.data.passed ? 'done' : 'active'">{{ detailPanel.data.passed ? 'Пройден' : 'Не пройден' }}</div>
            </template>
          </div>
        </aside>
      </transition>
    </div>

    <!-- Add skill to month modal -->
    <transition name="modal-fade"><div v-if="showAddSkillToMonth" class="modal-overlay" @click.self="showAddSkillToMonth = false"><div class="modal-card sk-modal">
      <button class="modal-close" @click="showAddSkillToMonth = false">×</button>
      <h2 class="modal-title">Добавить навык в {{ monthNames[planMonth - 1] }}</h2>
      <div v-if="inactiveSkills.length" class="sk-pool">
        <div v-for="s in inactiveSkills" :key="s.id" class="sk-pool-item" @click="activateSkill(s.id)">
          <span class="sk-pool-icon" :style="{ background: s.color + '25', borderColor: s.color }">{{ s.icon || '📚' }}</span>
          <span class="sk-pool-name">{{ s.title }}</span>
          <span class="sk-pool-add">+ Добавить</span>
        </div>
      </div>
      <div v-else class="sk-empty-msg">Все навыки уже добавлены</div>
    </div></div></transition>

    <!-- Create/Edit Skill -->
    <transition name="modal-fade"><div v-if="showCreateSkill" class="modal-overlay" @click.self="closeSkillModal"><div class="modal-card sk-modal">
      <button class="modal-close" @click="closeSkillModal">×</button>
      <h2 class="modal-title">{{ editingSkill ? 'Изменить' : 'Новый навык' }}</h2>
      <div class="sk-fg"><label>Иконка</label><input v-model="skillForm.icon" class="form-input" maxlength="4" style="width:60px;font-size:24px;text-align:center" /></div>
      <div class="sk-fg"><label>Название</label><input v-model="skillForm.title" class="form-input" placeholder="Английский язык..." @keyup.enter="saveSkill" /></div>
      <div class="sk-fg"><label>Описание</label><textarea v-model="skillForm.description" class="form-input" rows="2" placeholder="О чём этот навык..."></textarea></div>
      <div class="sk-fg"><label>Цвет</label><input v-model="skillForm.color" type="color" class="sk-color" /></div>
      <div v-if="!editingSkill" class="sk-fg"><label>Уровни (через запятую)</label><input v-model="skillForm.grades" class="form-input" placeholder="A1, A2, B1" /></div>
      <button class="sk-submit" @click="saveSkill">{{ editingSkill ? 'Сохранить' : 'Создать' }}</button>
    </div></div></transition>

    <!-- Create Grade -->
    <transition name="modal-fade"><div v-if="showCreateGrade" class="modal-overlay" @click.self="showCreateGrade = false"><div class="modal-card sk-modal">
      <button class="modal-close" @click="showCreateGrade = false">×</button>
      <h2 class="modal-title">Новый уровень</h2>
      <div class="sk-fg"><label>Название</label><input v-model="gradeForm.title" class="form-input" @keyup.enter="saveGrade" /></div>
      <div class="sk-fg"><label>Описание</label><textarea v-model="gradeForm.description" class="form-input" rows="2"></textarea></div>
      <div class="sk-fg"><label>URL картинки</label><input v-model="gradeForm.imageUrl" class="form-input" placeholder="https://..." /></div>
      <button class="sk-submit" @click="saveGrade">Создать</button>
    </div></div></transition>

    <!-- Edit Grade -->
    <transition name="modal-fade"><div v-if="showEditGrade" class="modal-overlay" @click.self="showEditGrade = false"><div class="modal-card sk-modal">
      <button class="modal-close" @click="showEditGrade = false">×</button>
      <h2 class="modal-title">Редактировать уровень</h2>
      <div class="sk-fg"><label>Название</label><input v-model="editGradeForm.title" class="form-input" /></div>
      <div class="sk-fg"><label>Описание</label><textarea v-model="editGradeForm.description" class="form-input" rows="2"></textarea></div>
      <div class="sk-fg"><label>URL картинки</label><input v-model="editGradeForm.imageUrl" class="form-input" /></div>
      <div class="sk-fg"><label>Дедлайн</label><input v-model="editGradeForm.deadline" type="datetime-local" class="form-input" /></div>
      <button class="sk-submit" @click="saveEditGrade">Сохранить</button>
    </div></div></transition>

    <!-- Create Exam -->
    <transition name="modal-fade"><div v-if="showCreateExam" class="modal-overlay" @click.self="showCreateExam = false"><div class="modal-card sk-modal">
      <button class="modal-close" @click="showCreateExam = false">×</button>
      <h2 class="modal-title">Тестирование</h2>
      <div class="sk-fg"><label>После уровня</label><select v-model="examForm.afterGradeId" class="form-input"><option value="" disabled>Выбери</option><option v-for="g in selectedSkill?.grades" :key="g.id" :value="g.id">{{ g.title }}</option></select></div>
      <div class="sk-fg"><label>Название</label><input v-model="examForm.title" class="form-input" /></div>
      <div class="sk-fg"><label>Описание</label><textarea v-model="examForm.description" class="form-input" rows="2"></textarea></div>
      <div class="sk-fg"><label>Ссылка</label><input v-model="examForm.link" class="form-input" placeholder="https://..." /></div>
      <div class="sk-fg"><label>URL картинки</label><input v-model="examForm.imageUrl" class="form-input" /></div>
      <button class="sk-submit" @click="saveExam">Создать</button>
    </div></div></transition>

    <!-- Import JSON -->
    <transition name="modal-fade"><div v-if="showImportGrades" class="modal-overlay" @click.self="showImportGrades = false"><div class="modal-card sk-modal">
      <button class="modal-close" @click="showImportGrades = false">×</button>
      <h2 class="modal-title">Импорт уровней</h2>
      <div class="sk-import-hint"><span>Скопируй промпт для нейронки</span><button class="sk-btn" @click="copyPrompt">Копировать</button></div>
      <textarea v-model="importJson" class="form-input" rows="8" style="font-family:monospace;font-size:12px" placeholder='[{"title":"A1","description":"..."}]'></textarea>
      <div v-if="importError" style="color:#f87171;font-size:12px;margin-top:4px">{{ importError }}</div>
      <button class="sk-submit" @click="doImportGrades">Импортировать</button>
    </div></div></transition>
  </div>
</template>

<style scoped>
.sk { width: 100vw; height: 100vh; background: linear-gradient(160deg, #0d0f18 0%, #111422 50%, #0a0d14 100%); color: #e8ecf4; display: flex; flex-direction: column; overflow: hidden; }

/* ===== Header ===== */
.sk-head { display: flex; align-items: center; gap: 16px; padding: 14px 24px; background: rgba(8,10,18,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(100,140,255,0.08); flex-shrink: 0; }
.sk-back { background: rgba(23,103,253,0.12); border: 1px solid rgba(23,103,253,0.3); color: #fff; width: 38px; height: 38px; border-radius: 50%; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.sk-back:hover { background: rgba(23,103,253,0.25); box-shadow: 0 0 12px rgba(23,103,253,0.3); }
.sk-head h1 { font-size: 20px; font-weight: 800; background: linear-gradient(135deg, #a5c4ff, #7c9dff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.sk-head-month { display: flex; align-items: center; gap: 10px; margin-left: auto; background: rgba(255,255,255,0.03); padding: 6px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.06); }
.sk-month-name { font-size: 15px; font-weight: 700; color: #d4dfff; min-width: 130px; text-align: center; }
.sk-mn { background: rgba(23,103,253,0.1); border: 1px solid rgba(23,103,253,0.25); color: #8bb4ff; width: 28px; height: 28px; border-radius: 50%; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.sk-mn:hover { background: rgba(23,103,253,0.2); color: #fff; }
.sk-mn:disabled { opacity: 0.2; cursor: default; }
.sk-create { background: linear-gradient(135deg, #1767fd, #8b5cf6); border: none; color: #fff; padding: 9px 18px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; margin-left: 8px; box-shadow: 0 2px 12px rgba(23,103,253,0.3); transition: all 0.15s; }
.sk-create:hover { box-shadow: 0 4px 20px rgba(23,103,253,0.5); transform: translateY(-1px); }

.sk-body { flex: 1; display: flex; overflow: hidden; position: relative; }

/* ===== Sidebar ===== */
.sk-sidebar { width: 310px; border-right: 1px solid rgba(100,140,255,0.06); display: flex; flex-direction: column; overflow-y: auto; padding: 16px; gap: 12px; flex-shrink: 0; background: rgba(0,0,0,0.15); }
.sk-sp-summary { padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.sk-sp-bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: rgba(255,255,255,0.06); box-shadow: inset 0 1px 3px rgba(0,0,0,0.3); }
.sk-sp-seg { min-width: 2px; transition: flex 0.3s; }
.sk-sp-free { background: transparent; }
.sk-sp-legend { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
.sk-sp-legend-total { font-size: 12px; color: rgba(200,215,255,0.5); font-weight: 600; }
.sk-sp-legend-free { font-size: 11px; color: rgba(200,215,255,0.3); }
.sk-sp-legend-warn { font-size: 11px; color: #f87171; font-weight: 600; }
.sk-section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(140,170,255,0.5); font-weight: 700; }

.sk-skill-list { display: flex; flex-direction: column; gap: 4px; }
.sk-skill { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; cursor: pointer; transition: all 0.2s; border: 1px solid transparent; }
.sk-skill:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); }
.sk-skill.active { background: rgba(23,103,253,0.1); border-color: rgba(23,103,253,0.3); box-shadow: 0 0 16px rgba(23,103,253,0.1); }

.sk-skill-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; border: 2px solid; flex-shrink: 0; transition: box-shadow 0.2s; }
.sk-skill.active .sk-skill-icon { box-shadow: 0 0 12px rgba(23,103,253,0.25); }
.sk-skill-info { flex: 1; min-width: 0; }
.sk-skill-name { font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #f0f3ff; }
.sk-skill-stats { font-size: 11px; color: rgba(200,215,255,0.5); margin-top: 3px; }
.sk-skill-minibar { height: 4px; background: rgba(255,255,255,0.07); border-radius: 2px; overflow: hidden; margin-top: 5px; }
.sk-skill-minibar-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
.sk-sp-input { width: 46px; background: rgba(0,0,0,0.4); border: 1px solid rgba(100,140,255,0.15); border-radius: 8px; padding: 5px; color: #d4dfff; font-size: 13px; font-weight: 600; text-align: center; flex-shrink: 0; }
.sk-deactivate { background: none; border: none; color: rgba(255,255,255,0.15); font-size: 14px; cursor: pointer; flex-shrink: 0; transition: color 0.15s; }
.sk-deactivate:hover { color: #f87171; }
.sk-add-skill-btn { background: rgba(23,103,253,0.06); border: 2px dashed rgba(23,103,253,0.2); color: rgba(100,160,255,0.7); padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; text-align: center; transition: all 0.15s; }
.sk-add-skill-btn:hover { background: rgba(23,103,253,0.1); color: #6ea8ff; border-color: rgba(23,103,253,0.35); }

/* ===== Main ===== */
.sk-main { flex: 1; overflow-y: auto; padding: 24px 30px; }
.sk-main--empty { display: flex; align-items: center; justify-content: center; }

.sk-detail-head { display: flex; align-items: flex-start; gap: 18px; margin-bottom: 28px; flex-wrap: wrap; }
.sk-detail-icon { width: 64px; height: 64px; border-radius: 18px; display: flex; align-items: center; justify-content: center; font-size: 36px; border: 2px solid; flex-shrink: 0; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
.sk-detail-title-wrap { flex: 1; min-width: 200px; }
.sk-detail-title-wrap h2 { font-size: 26px; font-weight: 800; color: #f4f7ff; }
.sk-detail-desc { font-size: 14px; color: rgba(200,215,255,0.55); margin-top: 6px; line-height: 1.5; }
.sk-detail-btns { display: flex; gap: 6px; flex-wrap: wrap; }

.sk-btn { background: rgba(23,103,253,0.08); border: 1px solid rgba(23,103,253,0.25); color: #6ea8ff; padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.15s; }
.sk-btn:hover { background: rgba(23,103,253,0.15); color: #8cc0ff; }
.sk-btn--red { color: #ff7b7b; border-color: rgba(248,113,113,0.25); background: rgba(248,113,113,0.05); }
.sk-icon-btn { background: none; border: none; color: rgba(200,215,255,0.4); cursor: pointer; font-size: 16px; transition: color 0.15s; }
.sk-icon-btn:hover { color: #fff; }
.sk-rm { background: none; border: none; color: rgba(248,113,113,0.45); font-size: 18px; cursor: pointer; transition: color 0.15s; }
.sk-rm:hover { color: #ff6b6b; }

/* ===== Grades ===== */
.sk-grades { display: flex; flex-direction: column; }
.sk-grade-wrap { position: relative; }

.sk-grade {
  display: flex; align-items: flex-start; gap: 14px; padding: 18px 20px;
  background: linear-gradient(135deg, rgba(20,24,40,0.8), rgba(15,18,30,0.6));
  border: 1px solid rgba(100,140,255,0.08); border-radius: 16px;
  cursor: pointer; transition: all 0.2s;
}
.sk-grade:hover { border-color: rgba(100,140,255,0.18); background: linear-gradient(135deg, rgba(25,30,50,0.9), rgba(18,22,38,0.7)); box-shadow: 0 2px 16px rgba(0,0,0,0.2); }
.sk-grade.completed { border-color: rgba(74,222,128,0.3); box-shadow: 0 0 20px rgba(74,222,128,0.08); }

.sk-grade-badge { width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800; color: #fff; flex-shrink: 0; box-shadow: 0 2px 10px rgba(0,0,0,0.3); }
.sk-grade-body { flex: 1; min-width: 0; }
.sk-grade-title { font-size: 18px; font-weight: 700; color: #f0f3ff; }
.sk-grade-desc { font-size: 13px; color: rgba(200,215,255,0.5); margin-top: 3px; line-height: 1.4; }
.sk-grade-meta { display: flex; gap: 10px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
.sk-grade-tasks-count { font-size: 13px; color: rgba(200,215,255,0.7); background: rgba(255,255,255,0.05); padding: 3px 10px; border-radius: 6px; font-weight: 600; }
.sk-grade-deadline { font-size: 12px; color: #fbbf24; font-weight: 500; }
.sk-grade-done-tag { font-size: 11px; background: rgba(74,222,128,0.18); color: #4ade80; padding: 3px 10px; border-radius: 6px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }

.sk-grade-progress { width: 160px; flex-shrink: 0; margin-top: 10px; }
.sk-grade-progress-bar { height: 10px; background: rgba(255,255,255,0.07); border-radius: 5px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.3); }
.sk-grade-progress-fill { height: 100%; border-radius: 5px; transition: width 0.4s ease; }
.sk-grade-progress-pct { font-size: 14px; font-weight: 700; color: rgba(200,215,255,0.6); display: block; text-align: right; margin-top: 3px; }

.sk-grade-actions { display: flex; gap: 4px; align-items: center; flex-shrink: 0; margin-top: 6px; }

/* ===== Tasks ===== */
.sk-grade-tasks { padding: 10px 0 6px 56px; }
.sk-mg { margin-bottom: 8px; }
.sk-mg-head { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px 10px; border-radius: 8px; user-select: none; transition: background 0.12s; }
.sk-mg-head:hover { background: rgba(100,140,255,0.05); }
.sk-mg-arrow { font-size: 11px; color: rgba(200,215,255,0.4); width: 14px; }
.sk-mg-label { font-size: 13px; font-weight: 700; color: rgba(200,215,255,0.6); }
.sk-mg-label.current { color: #6ea8ff; text-shadow: 0 0 8px rgba(110,168,255,0.3); }
.sk-mg-count { font-size: 11px; color: rgba(200,215,255,0.35); margin-left: auto; font-weight: 500; }

.sk-mg-tasks { padding-left: 22px; }
.sk-task { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; margin-bottom: 3px; background: rgba(255,255,255,0.02); transition: all 0.12s; border: 1px solid transparent; }
.sk-task:hover { background: rgba(255,255,255,0.045); border-color: rgba(255,255,255,0.06); }
.sk-task.done { opacity: 0.35; }
.sk-task-dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(200,215,255,0.2); flex-shrink: 0; transition: all 0.15s; }
.sk-task-dot.checked { background: #4ade80; border-color: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,0.4); }
.sk-task-info { flex: 1; min-width: 0; }
.sk-task-name { font-size: 14px; font-weight: 600; color: #e0e6f4; }
.sk-task.done .sk-task-name { text-decoration: line-through; color: rgba(200,215,255,0.4); }
.sk-task-meta { display: flex; gap: 12px; margin-top: 4px; }
.sk-task-dates { font-size: 12px; color: rgba(200,215,255,0.5); background: rgba(100,140,255,0.06); padding: 2px 8px; border-radius: 5px; font-weight: 500; }
.sk-task-subs { font-size: 12px; color: rgba(200,215,255,0.5); font-weight: 500; }
.sk-task-bar { width: 60px; height: 6px; background: rgba(255,255,255,0.07); border-radius: 3px; overflow: hidden; flex-shrink: 0; }
.sk-task-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
.sk-no-tasks { padding: 8px 0 8px 56px; font-size: 12px; color: rgba(200,215,255,0.25); font-style: italic; }

/* ===== Exam ===== */
.sk-exam {
  display: flex; align-items: center; gap: 14px;
  margin: 10px 0 10px 40px; padding: 16px 20px;
  background: linear-gradient(135deg, rgba(250,204,21,0.06), rgba(250,180,21,0.02));
  border: 2px solid rgba(250,204,21,0.25);
  border-radius: 14px; cursor: pointer; transition: all 0.2s;
}
.sk-exam:hover { border-color: rgba(250,204,21,0.4); box-shadow: 0 0 20px rgba(250,204,21,0.08); }
.sk-exam.passed { border-color: rgba(74,222,128,0.3); background: linear-gradient(135deg, rgba(74,222,128,0.05), rgba(74,222,128,0.02)); box-shadow: 0 0 16px rgba(74,222,128,0.06); }
.sk-exam-icon { font-size: 30px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); }
.sk-exam-body { flex: 1; }
.sk-exam-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #fbbf24; font-weight: 700; }
.sk-exam.passed .sk-exam-label { color: #4ade80; }
.sk-exam-name { font-size: 16px; font-weight: 700; margin-top: 2px; color: #fef3c7; }
.sk-exam.passed .sk-exam-name { text-decoration: line-through; color: rgba(200,215,255,0.4); }
.sk-exam-cb { width: 22px; height: 22px; accent-color: #fbbf24; cursor: pointer; flex-shrink: 0; }

.sk-connector { width: 4px; height: 16px; margin: 0 0 0 20px; border-radius: 2px; }

/* ===== Slide panel ===== */
.sk-panel { position: absolute; top: 0; right: 0; bottom: 0; width: 38%; min-width: 320px; max-width: 480px; background: linear-gradient(180deg, #161a28, #111520); border-left: 1px solid rgba(100,140,255,0.1); z-index: 20; overflow-y: auto; box-shadow: -10px 0 40px rgba(0,0,0,0.5); }
.sk-panel-inner { padding: 28px; }
.sk-panel-close { position: absolute; top: 16px; right: 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); width: 32px; height: 32px; border-radius: 8px; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.sk-panel-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
.sk-panel-badge { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800; color: #fff; margin-bottom: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.4); }
.sk-panel-exam-icon { font-size: 48px; margin-bottom: 16px; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3)); }
.sk-panel h3 { font-size: 24px; font-weight: 800; margin-bottom: 14px; color: #f4f7ff; }
.sk-panel-img { margin-bottom: 16px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(100,140,255,0.1); }
.sk-panel-img img { width: 100%; display: block; }
.sk-panel-desc { font-size: 15px; color: rgba(200,215,255,0.6); line-height: 1.7; margin-bottom: 20px; }
.sk-panel-stats { display: flex; gap: 28px; margin-bottom: 20px; }
.sk-panel-stat { text-align: center; }
.sk-panel-stat-val { display: block; font-size: 28px; font-weight: 800; color: #d4dfff; }
.sk-panel-stat-label { font-size: 12px; color: rgba(200,215,255,0.45); font-weight: 500; }
.sk-panel-deadline { font-size: 14px; color: #fbbf24; margin-bottom: 14px; font-weight: 600; }
.sk-panel-link { display: inline-block; background: linear-gradient(135deg, rgba(23,103,253,0.15), rgba(110,74,255,0.1)); border: 1px solid rgba(23,103,253,0.3); color: #6ea8ff; padding: 8px 18px; border-radius: 10px; font-size: 14px; font-weight: 600; text-decoration: none; margin-bottom: 14px; transition: all 0.15s; }
.sk-panel-link:hover { background: rgba(23,103,253,0.2); box-shadow: 0 2px 12px rgba(23,103,253,0.2); }
.sk-panel-status { display: inline-block; padding: 6px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; }
.sk-panel-status.done { background: rgba(74,222,128,0.15); color: #4ade80; }
.sk-panel-status.active { background: rgba(23,103,253,0.12); color: #6ea8ff; }

.slide-right-enter-active, .slide-right-leave-active { transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); }

/* ===== Pool picker ===== */
.sk-pool { display: flex; flex-direction: column; gap: 4px; }
.sk-pool-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 10px; cursor: pointer; transition: all 0.15s; border: 1px solid transparent; }
.sk-pool-item:hover { background: rgba(23,103,253,0.08); border-color: rgba(23,103,253,0.15); }
.sk-pool-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px; border: 2px solid; flex-shrink: 0; }
.sk-pool-name { flex: 1; font-size: 15px; font-weight: 600; color: #e0e6f4; }
.sk-pool-add { font-size: 13px; color: #4ade80; font-weight: 600; }

/* ===== Modals ===== */
.sk-modal { max-width: 460px; }
.sk-fg { margin-bottom: 14px; }
.sk-fg label { display: block; font-size: 13px; color: rgba(200,215,255,0.55); margin-bottom: 4px; font-weight: 500; }
.sk-color { width: 100%; height: 38px; border: none; border-radius: 8px; cursor: pointer; }
.sk-submit { width: 100%; padding: 12px; background: linear-gradient(135deg, #1767fd, #8b5cf6); border: none; border-radius: 10px; color: #fff; font-weight: 700; font-size: 14px; cursor: pointer; margin-top: 6px; box-shadow: 0 2px 12px rgba(23,103,253,0.3); transition: all 0.15s; }
.sk-submit:hover { box-shadow: 0 4px 20px rgba(23,103,253,0.4); transform: translateY(-1px); }
.sk-import-hint { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; }
.sk-import-hint span { font-size: 12px; color: rgba(200,215,255,0.45); }

/* ===== Empty state ===== */
.sk-empty-state { text-align: center; padding: 40px 20px; }
.sk-empty-icon { font-size: 56px; margin-bottom: 16px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.3)); }
.sk-empty-state h3 { font-size: 20px; font-weight: 700; color: rgba(200,215,255,0.6); margin-bottom: 8px; }
.sk-empty-state p { font-size: 14px; color: rgba(200,215,255,0.35); }
.sk-empty-msg { color: rgba(200,215,255,0.25); font-size: 14px; text-align: center; padding: 24px; font-style: italic; }

/* ===== Grade actions (fixed) ===== */
.sk-grade-move { display: flex; flex-direction: column; gap: 3px; }
.sk-move-btn {
  width: 28px; height: 24px; border-radius: 6px;
  background: rgba(100,140,255,0.08); border: 1px solid rgba(100,140,255,0.15);
  color: rgba(200,215,255,0.6); font-size: 14px; font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.sk-move-btn:hover { background: rgba(100,140,255,0.15); color: #fff; }
.sk-move-btn:disabled { opacity: 0.2; cursor: default; }

.sk-action-btn {
  width: 30px; height: 30px; border-radius: 8px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  color: rgba(200,215,255,0.5); font-size: 15px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.sk-action-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
.sk-action-btn--rm { color: rgba(248,113,113,0.5); }
.sk-action-btn--rm:hover { color: #ff6b6b; background: rgba(248,113,113,0.1); }

/* ===== SP control per skill ===== */
.sk-sp-control { display: flex; flex-direction: column; align-items: center; gap: 3px; flex-shrink: 0; }
.sk-sp-micro-bar { width: 46px; height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
.sk-sp-micro-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
</style>
