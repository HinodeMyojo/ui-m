<script setup>
import { ref, computed, onMounted, nextTick } from "vue";
import { useRouter } from "vue-router";
import {
  fetchTestSuites, fetchTestSuite, createTestSuite, updateTestSuite, deleteTestSuite,
  createTestTopic, updateTestTopic, deleteTestTopic,
  createTestSubtopic, deleteTestSubtopic,
  fetchTestQuestions, createTestQuestion, deleteTestQuestion, importTestQuestions,
  createTestExam, fetchTestExam, submitTestAnswer, finishTestExam,
  fetchExamHistory, fetchTestStats,
} from "./api.js";

const router = useRouter();

// --- Navigation state ---
const view = ref("list"); // list | detail | exam | results | stats
const suites = ref([]);
const selectedSuite = ref(null);
const selectedTopicId = ref(null);
const questions = ref([]);
const loading = ref(false);

// Exam state
const exam = ref(null);
const examQuestionIdx = ref(0);
const examAnswers = ref({}); // { questionId: givenAnswer }
const examResults = ref(null);
const examMode = ref("exam"); // exam | learning

// Modals
const showCreateSuite = ref(false);
const showCreateTopic = ref(false);
const showCreateSubtopic = ref(false);
const showCreateQuestion = ref(false);
const showImportQuestions = ref(false);
const showExamSetup = ref(false);

// Forms
const suiteForm = ref({ title: "", description: "", passingScore: 60 });
const topicForm = ref({ title: "", description: "" });
const subtopicForm = ref({ testTopicId: "", title: "" });
const questionForm = ref({ testTopicId: "", testSubtopicId: null, type: "single_choice", question: "", options: "", correct: "", explanation: "", difficulty: 1, tags: "" });
const importJson = ref("");
const importError = ref("");
const examSetup = ref({ questionCount: 20, mode: "exam", shuffle: true, timeLimitMin: null, topicIds: [], difficulties: [], types: [] });

// Stats
const stats = ref(null);
const examHistory = ref([]);

// --- Computed ---
const currentExamQuestion = computed(() => {
  if (!exam.value?.questions) return null;
  return exam.value.questions[examQuestionIdx.value];
});

const examProgress = computed(() => {
  if (!exam.value) return 0;
  return Object.keys(examAnswers.value).length;
});

// --- Data loading ---
async function loadSuites() {
  loading.value = true;
  try { suites.value = await fetchTestSuites(); } catch(e) { console.error(e); }
  finally { loading.value = false; }
}

async function openSuite(id) {
  loading.value = true;
  try {
    selectedSuite.value = await fetchTestSuite(id);
    view.value = "detail";
  } catch(e) { console.error(e); }
  finally { loading.value = false; }
}

async function loadQuestions(topicId, subtopicId) {
  selectedTopicId.value = topicId;
  try { questions.value = await fetchTestQuestions(topicId, subtopicId); } catch(e) { console.error(e); }
}

// --- Suite CRUD ---
async function saveSuite() {
  if (!suiteForm.value.title.trim()) return;
  await createTestSuite(suiteForm.value);
  showCreateSuite.value = false;
  suiteForm.value = { title: "", description: "", passingScore: 60 };
  await loadSuites();
}

async function removeSuite(id) {
  if (!confirm("Удалить тест?")) return;
  await deleteTestSuite(id);
  await loadSuites();
}

// --- Topic CRUD ---
async function saveTopic() {
  if (!topicForm.value.title.trim() || !selectedSuite.value) return;
  await createTestTopic({ testSuiteId: selectedSuite.value.id, ...topicForm.value, position: selectedSuite.value.topics?.length || 0 });
  showCreateTopic.value = false;
  topicForm.value = { title: "", description: "" };
  await openSuite(selectedSuite.value.id);
}

async function removeTopic(id) {
  await deleteTestTopic(id);
  await openSuite(selectedSuite.value.id);
}

// --- Subtopic ---
async function saveSubtopic() {
  if (!subtopicForm.value.title.trim() || !subtopicForm.value.testTopicId) return;
  await createTestSubtopic(subtopicForm.value);
  showCreateSubtopic.value = false;
  subtopicForm.value = { testTopicId: "", title: "" };
  await openSuite(selectedSuite.value.id);
}

// --- Question ---
async function saveQuestion() {
  if (!questionForm.value.question.trim()) return;
  // Build options JSON from text
  let optionsJson = "[]";
  if (questionForm.value.options.trim()) {
    try {
      const lines = questionForm.value.options.split("\n").filter(l => l.trim());
      const opts = lines.map((l, i) => ({ id: String(i), text: l.trim() }));
      optionsJson = JSON.stringify(opts);
    } catch(e) { optionsJson = "[]"; }
  }
  let correctJson = "{}";
  if (questionForm.value.correct.trim()) {
    try { correctJson = questionForm.value.correct.trim(); JSON.parse(correctJson); } catch(e) { correctJson = `{"id":"${questionForm.value.correct.trim()}"}`; }
  }

  await createTestQuestion({
    testTopicId: questionForm.value.testTopicId || selectedTopicId.value,
    testSubtopicId: questionForm.value.testSubtopicId || null,
    type: questionForm.value.type,
    question: questionForm.value.question,
    options: optionsJson,
    correct: correctJson,
    explanation: questionForm.value.explanation,
    difficulty: questionForm.value.difficulty,
    tags: questionForm.value.tags,
  });
  showCreateQuestion.value = false;
  questionForm.value = { testTopicId: "", testSubtopicId: null, type: "single_choice", question: "", options: "", correct: "", explanation: "", difficulty: 1, tags: "" };
  if (selectedTopicId.value) await loadQuestions(selectedTopicId.value);
}

// --- Import ---
async function doImport() {
  importError.value = "";
  let parsed;
  try { parsed = JSON.parse(importJson.value.trim()); } catch(e) { importError.value = "Невалидный JSON"; return; }
  if (!parsed.questions && Array.isArray(parsed)) parsed = { questions: parsed };
  if (!parsed.questions) { importError.value = "Нужен массив questions"; return; }
  try {
    const res = await importTestQuestions({ testTopicId: selectedTopicId.value, questions: parsed.questions });
    showImportQuestions.value = false;
    importJson.value = "";
    await openSuite(selectedSuite.value.id);
  } catch(e) { importError.value = e.message; }
}

function copyImportPrompt() {
  const prompt = `Сгенерируй JSON для импорта вопросов тестирования. Формат:
{"questions":[{"type":"single_choice","difficulty":"medium","tags":["tag1"],"subtopic":"15-1","question":"Текст вопроса","options":["Вариант A","Вариант B","Вариант C"],"correct":[0],"explanation":"Объяснение"}]}
Типы: single_choice, multiple_choice, true_false, free_text, code_input, fill_blanks, ordering, matching
difficulty: easy/medium/hard. correct — индексы правильных ответов (с 0). Только JSON.
Тема:`;
  const ta = document.createElement("textarea");
  ta.value = prompt; ta.style.cssText = "position:fixed;left:-9999px";
  document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
}

// --- Exam ---
async function startExam() {
  const setup = examSetup.value;
  try {
    exam.value = await createTestExam({
      testSuiteId: selectedSuite.value.id,
      questionCount: setup.questionCount,
      mode: setup.mode,
      shuffle: setup.shuffle,
      timeLimitMin: setup.timeLimitMin,
      topicIds: setup.topicIds,
      difficulties: setup.difficulties,
      types: setup.types,
    });
    examQuestionIdx.value = 0;
    examAnswers.value = {};
    examMode.value = setup.mode;
    showExamSetup.value = false;
    view.value = "exam";
  } catch(e) { alert(e.message || "Нет вопросов"); }
}

function selectAnswer(questionId, answer) {
  examAnswers.value[questionId] = answer;
}

async function submitCurrentAnswer() {
  const q = currentExamQuestion.value;
  if (!q) return;
  // Submit answer if selected
  if (examAnswers.value[q.id]) {
    await submitTestAnswer({
      testExamId: exam.value.id,
      testQuestionId: q.id,
      givenAnswer: JSON.stringify(examAnswers.value[q.id]),
    });
  }
  // Advance or finish
  if (examQuestionIdx.value < exam.value.questions.length - 1) {
    examQuestionIdx.value++;
  } else {
    await finishCurrentExam();
  }
}

async function finishCurrentExam() {
  const result = await finishTestExam({ testExamId: exam.value.id });
  examResults.value = result;
  view.value = "results";
}

// --- Stats ---
async function openStats() {
  if (!selectedSuite.value) return;
  try {
    stats.value = await fetchTestStats(selectedSuite.value.id);
    examHistory.value = await fetchExamHistory(selectedSuite.value.id);
    view.value = "stats";
  } catch(e) { console.error(e); }
}

function goBack() {
  if (view.value === "exam" || view.value === "results" || view.value === "stats") view.value = "detail";
  else if (view.value === "detail") { view.value = "list"; selectedSuite.value = null; }
  else router.push("/");
}

function parseOptions(json) { try { return JSON.parse(json); } catch { return []; } }
function diffLabel(d) { return d === 1 ? "Easy" : d === 2 ? "Medium" : "Hard"; }
function diffColor(d) { return d === 1 ? "#4ade80" : d === 2 ? "#facc15" : "#f87171"; }

const questionTypes = [
  { value: "single_choice", label: "Один ответ" },
  { value: "multiple_choice", label: "Несколько ответов" },
  { value: "true_false", label: "Верно/Неверно" },
  { value: "free_text", label: "Свободный текст" },
  { value: "code_input", label: "Код" },
  { value: "fill_blanks", label: "Заполни пропуски" },
  { value: "ordering", label: "Порядок" },
  { value: "matching", label: "Соответствие" },
];

onMounted(() => loadSuites());
</script>

<template>
  <div class="tp">
    <!-- Header -->
    <header class="tp-head">
      <button class="tp-back" @click="goBack">←</button>
      <h1>{{ view === 'list' ? 'Тестирование' : view === 'exam' ? 'Экзамен' : view === 'results' ? 'Результаты' : view === 'stats' ? 'Статистика' : selectedSuite?.title || '' }}</h1>
      <div class="tp-head-actions">
        <button v-if="view === 'list'" class="tp-btn tp-btn--primary" @click="showCreateSuite = true">+ Тест</button>
        <template v-if="view === 'detail'">
          <button class="tp-btn" @click="showCreateTopic = true">+ Тема</button>
          <button class="tp-btn" @click="showExamSetup = true">Экзамен</button>
          <button class="tp-btn" @click="openStats">Статистика</button>
        </template>
      </div>
    </header>

    <div class="tp-body">
      <!-- === LIST VIEW === -->
      <div v-if="view === 'list'" class="tp-list">
        <div v-if="!suites.length" class="tp-empty">
          <div class="tp-empty-icon">📝</div>
          <h3>Нет тестов</h3>
          <p>Создай первый тест</p>
        </div>
        <div v-for="s in suites" :key="s.id" class="tp-suite-card" @click="openSuite(s.id)">
          <div class="tp-suite-icon">📋</div>
          <div class="tp-suite-info">
            <div class="tp-suite-title">{{ s.title }}</div>
            <div class="tp-suite-meta">{{ s.totalQuestions }} вопросов · {{ s.passingScore }}% для сдачи</div>
          </div>
          <button class="tp-rm" @click.stop="removeSuite(s.id)">✕</button>
        </div>
      </div>

      <!-- === DETAIL VIEW === -->
      <div v-if="view === 'detail' && selectedSuite" class="tp-detail">
        <div v-if="selectedSuite.description" class="tp-suite-desc">{{ selectedSuite.description }}</div>

        <div v-for="topic in selectedSuite.topics" :key="topic.id" class="tp-topic">
          <div class="tp-topic-head" @click="loadQuestions(topic.id)">
            <span class="tp-topic-title">{{ topic.title }}</span>
            <span class="tp-topic-count">{{ topic.totalQuestions }} вопр.</span>
            <button class="tp-rm" @click.stop="removeTopic(topic.id)">✕</button>
          </div>

          <!-- Subtopics -->
          <div v-if="topic.subtopics?.length" class="tp-subtopics">
            <div v-for="sub in topic.subtopics" :key="sub.id" class="tp-subtopic" @click="loadQuestions(topic.id, sub.id)">
              <span>{{ sub.title }}</span>
              <span class="tp-sub-count">{{ sub.totalQuestions }}</span>
            </div>
          </div>

          <!-- Questions (when topic selected) -->
          <div v-if="selectedTopicId === topic.id && questions.length" class="tp-questions">
            <div class="tp-q-actions">
              <button class="tp-btn tp-btn--sm" @click="questionForm.testTopicId = topic.id; showCreateQuestion = true">+ Вопрос</button>
              <button class="tp-btn tp-btn--sm" @click="selectedTopicId = topic.id; showImportQuestions = true">{ } JSON</button>
              <button class="tp-btn tp-btn--sm" @click="subtopicForm.testTopicId = topic.id; showCreateSubtopic = true">+ Подтема</button>
            </div>
            <div v-for="q in questions" :key="q.id" class="tp-q">
              <div class="tp-q-diff" :style="{ background: diffColor(q.difficulty) }">{{ diffLabel(q.difficulty) }}</div>
              <div class="tp-q-type">{{ q.type }}</div>
              <div class="tp-q-text">{{ q.question }}</div>
              <button class="tp-rm" @click="deleteTestQuestion(q.id).then(() => loadQuestions(topic.id))">✕</button>
            </div>
          </div>

          <div v-if="selectedTopicId === topic.id && !questions.length" class="tp-q-actions">
            <button class="tp-btn tp-btn--sm" @click="questionForm.testTopicId = topic.id; showCreateQuestion = true">+ Вопрос</button>
            <button class="tp-btn tp-btn--sm" @click="selectedTopicId = topic.id; showImportQuestions = true">{ } JSON</button>
            <button class="tp-btn tp-btn--sm" @click="subtopicForm.testTopicId = topic.id; showCreateSubtopic = true">+ Подтема</button>
            <span class="tp-empty-hint">Нет вопросов</span>
          </div>
        </div>

        <div v-if="!selectedSuite.topics?.length" class="tp-empty-hint" style="padding:20px">Добавь темы</div>
      </div>

      <!-- === EXAM VIEW === -->
      <div v-if="view === 'exam' && exam" class="tp-exam">
        <div class="tp-exam-bar">
          <div class="tp-exam-progress">{{ examQuestionIdx + 1 }} / {{ exam.questions.length }}</div>
          <div class="tp-exam-bar-track"><div class="tp-exam-bar-fill" :style="{ width: ((examQuestionIdx + 1) / exam.questions.length * 100) + '%' }"></div></div>
          <button class="tp-btn tp-btn--danger" @click="finishCurrentExam">Завершить</button>
        </div>

        <div v-if="currentExamQuestion" class="tp-exam-question">
          <div class="tp-exam-q-header">
            <span class="tp-exam-q-diff" :style="{ background: diffColor(currentExamQuestion.difficulty) }">{{ diffLabel(currentExamQuestion.difficulty) }}</span>
            <span class="tp-exam-q-type">{{ currentExamQuestion.type }}</span>
          </div>
          <div class="tp-exam-q-text">{{ currentExamQuestion.question }}</div>

          <!-- Single/Multiple choice -->
          <div v-if="['single_choice','multiple_choice','true_false','image_choice'].includes(currentExamQuestion.type)" class="tp-exam-options">
            <button
              v-for="opt in parseOptions(currentExamQuestion.options)"
              :key="opt.id"
              class="tp-exam-option"
              :class="{ selected: examAnswers[currentExamQuestion.id]?.id === opt.id }"
              @click="selectAnswer(currentExamQuestion.id, { id: opt.id })"
            >
              {{ opt.text }}
            </button>
          </div>

          <!-- Free text / Code -->
          <div v-if="['free_text','code_input'].includes(currentExamQuestion.type)" class="tp-exam-text-input">
            <textarea
              :value="examAnswers[currentExamQuestion.id]?.text || ''"
              @input="selectAnswer(currentExamQuestion.id, { text: $event.target.value })"
              class="tp-exam-textarea"
              :class="{ code: currentExamQuestion.type === 'code_input' }"
              rows="5"
              :placeholder="currentExamQuestion.type === 'code_input' ? 'Введи код...' : 'Введи ответ...'"
            ></textarea>
          </div>

          <!-- Learning mode: show explanation after answer -->
          <div v-if="examMode === 'learning' && examAnswers[currentExamQuestion.id] && currentExamQuestion.explanation" class="tp-exam-explanation">
            <strong>Объяснение:</strong> {{ currentExamQuestion.explanation }}
          </div>

          <div class="tp-exam-nav">
            <button class="tp-btn" :disabled="examQuestionIdx === 0" @click="examQuestionIdx--">← Назад</button>
            <button class="tp-btn tp-btn--primary" @click="submitCurrentAnswer">
              {{ examQuestionIdx < exam.questions.length - 1 ? 'Далее →' : 'Завершить экзамен' }}
            </button>
          </div>
        </div>
      </div>

      <!-- === RESULTS VIEW === -->
      <div v-if="view === 'results' && examResults" class="tp-results">
        <div class="tp-results-score" :class="{ passed: examResults.passed }">
          <div class="tp-results-pct">{{ Math.round(examResults.scorePercent) }}%</div>
          <div class="tp-results-label">{{ examResults.correctCount }} / {{ examResults.totalQuestions }}</div>
          <div class="tp-results-status">{{ examResults.passed ? 'СДАНО' : 'НЕ СДАНО' }}</div>
        </div>
        <div class="tp-results-answers">
          <div v-for="(a, i) in examResults.answers" :key="a.id" class="tp-results-answer" :class="{ correct: a.isCorrect, wrong: !a.isCorrect }">
            <span class="tp-results-num">{{ i + 1 }}</span>
            <span class="tp-results-icon">{{ a.isCorrect ? '✓' : '✗' }}</span>
            <span class="tp-results-q-title">{{ (examResults.questions?.find(q => q.id === a.testQuestionId)?.question || '...').slice(0, 80) }}</span>
          </div>
        </div>
        <button class="tp-btn tp-btn--primary" @click="view = 'detail'" style="margin-top:16px">Назад к тесту</button>
      </div>

      <!-- === STATS VIEW === -->
      <div v-if="view === 'stats' && stats" class="tp-stats">
        <div class="tp-stats-overview">
          <div class="tp-stat-card"><div class="tp-stat-val">{{ stats.totalQuestions }}</div><div class="tp-stat-label">Вопросов</div></div>
          <div class="tp-stat-card"><div class="tp-stat-val">{{ stats.totalAttempted }}</div><div class="tp-stat-label">Попыток</div></div>
          <div class="tp-stat-card"><div class="tp-stat-val">{{ Math.round(stats.correctPercent) }}%</div><div class="tp-stat-label">Правильных</div></div>
        </div>
        <div class="tp-stats-section" v-if="stats.byTopic?.length">
          <h3>По темам</h3>
          <div v-for="t in stats.byTopic" :key="t.topicId" class="tp-stats-row">
            <span class="tp-stats-name">{{ t.topicName }}</span>
            <div class="tp-stats-bar"><div class="tp-stats-bar-fill" :style="{ width: t.percent + '%' }"></div></div>
            <span class="tp-stats-pct">{{ Math.round(t.percent) }}%</span>
          </div>
        </div>
        <div class="tp-stats-section" v-if="examHistory.length">
          <h3>История экзаменов</h3>
          <div v-for="e in examHistory" :key="e.id" class="tp-history-row">
            <span class="tp-history-date">{{ e.startedAt ? new Date(e.startedAt).toLocaleDateString('ru') : '—' }}</span>
            <span class="tp-history-score" :class="{ passed: e.passed }">{{ Math.round(e.scorePercent) }}%</span>
            <span>{{ e.correctCount }}/{{ e.totalQuestions }}</span>
          </div>
        </div>
        <button class="tp-btn" @click="view = 'detail'" style="margin-top:16px">Назад</button>
      </div>
    </div>

    <!-- === MODALS === -->

    <!-- Create Suite -->
    <transition name="modal-fade"><div v-if="showCreateSuite" class="modal-overlay" @click.self="showCreateSuite = false"><div class="modal-card tp-modal">
      <button class="modal-close" @click="showCreateSuite = false">×</button>
      <h2 class="modal-title">Новый тест</h2>
      <div class="tp-fg"><label>Название</label><input v-model="suiteForm.title" class="form-input" @keyup.enter="saveSuite" /></div>
      <div class="tp-fg"><label>Описание</label><textarea v-model="suiteForm.description" class="form-input" rows="2"></textarea></div>
      <div class="tp-fg"><label>Проходной балл (%)</label><input v-model.number="suiteForm.passingScore" type="number" class="form-input" min="0" max="100" /></div>
      <button class="tp-submit" @click="saveSuite">Создать</button>
    </div></div></transition>

    <!-- Create Topic -->
    <transition name="modal-fade"><div v-if="showCreateTopic" class="modal-overlay" @click.self="showCreateTopic = false"><div class="modal-card tp-modal">
      <button class="modal-close" @click="showCreateTopic = false">×</button>
      <h2 class="modal-title">Новая тема</h2>
      <div class="tp-fg"><label>Название</label><input v-model="topicForm.title" class="form-input" @keyup.enter="saveTopic" /></div>
      <div class="tp-fg"><label>Описание</label><textarea v-model="topicForm.description" class="form-input" rows="2"></textarea></div>
      <button class="tp-submit" @click="saveTopic">Создать</button>
    </div></div></transition>

    <!-- Create Subtopic -->
    <transition name="modal-fade"><div v-if="showCreateSubtopic" class="modal-overlay" @click.self="showCreateSubtopic = false"><div class="modal-card tp-modal">
      <button class="modal-close" @click="showCreateSubtopic = false">×</button>
      <h2 class="modal-title">Новая подтема</h2>
      <div class="tp-fg"><label>Название</label><input v-model="subtopicForm.title" class="form-input" @keyup.enter="saveSubtopic" /></div>
      <button class="tp-submit" @click="saveSubtopic">Создать</button>
    </div></div></transition>

    <!-- Create Question -->
    <transition name="modal-fade"><div v-if="showCreateQuestion" class="modal-overlay" @click.self="showCreateQuestion = false"><div class="modal-card tp-modal">
      <button class="modal-close" @click="showCreateQuestion = false">×</button>
      <h2 class="modal-title">Новый вопрос</h2>
      <div class="tp-fg"><label>Тип</label><select v-model="questionForm.type" class="form-input"><option v-for="t in questionTypes" :key="t.value" :value="t.value">{{ t.label }}</option></select></div>
      <div class="tp-fg"><label>Вопрос</label><textarea v-model="questionForm.question" class="form-input" rows="3"></textarea></div>
      <div class="tp-fg"><label>Варианты (по одному на строку)</label><textarea v-model="questionForm.options" class="form-input" rows="4" placeholder="Вариант A&#10;Вариант B&#10;Вариант C"></textarea></div>
      <div class="tp-fg"><label>Правильный (JSON или индекс)</label><input v-model="questionForm.correct" class="form-input" placeholder='{"id":"0"} или 0' /></div>
      <div class="tp-fg"><label>Объяснение</label><textarea v-model="questionForm.explanation" class="form-input" rows="2"></textarea></div>
      <div class="tp-fg"><label>Сложность</label><select v-model.number="questionForm.difficulty" class="form-input"><option :value="1">Easy</option><option :value="2">Medium</option><option :value="3">Hard</option></select></div>
      <button class="tp-submit" @click="saveQuestion">Создать</button>
    </div></div></transition>

    <!-- Import Questions -->
    <transition name="modal-fade"><div v-if="showImportQuestions" class="modal-overlay" @click.self="showImportQuestions = false"><div class="modal-card tp-modal">
      <button class="modal-close" @click="showImportQuestions = false">×</button>
      <h2 class="modal-title">Импорт вопросов</h2>
      <div class="tp-import-hint"><span>Скопируй промпт для AI</span><button class="tp-btn tp-btn--sm" @click="copyImportPrompt">Копировать</button></div>
      <textarea v-model="importJson" class="form-input" rows="10" style="font-family:monospace;font-size:12px" placeholder='{"questions":[...]}'></textarea>
      <div v-if="importError" style="color:#f87171;font-size:12px;margin-top:4px">{{ importError }}</div>
      <button class="tp-submit" @click="doImport">Импортировать</button>
    </div></div></transition>

    <!-- Exam Setup -->
    <transition name="modal-fade"><div v-if="showExamSetup" class="modal-overlay" @click.self="showExamSetup = false"><div class="modal-card tp-modal">
      <button class="modal-close" @click="showExamSetup = false">×</button>
      <h2 class="modal-title">Настройки экзамена</h2>
      <div class="tp-fg"><label>Количество вопросов</label><input v-model.number="examSetup.questionCount" type="number" class="form-input" min="1" /></div>
      <div class="tp-fg"><label>Режим</label><select v-model="examSetup.mode" class="form-input"><option value="exam">Экзамен</option><option value="learning">Обучение</option><option value="infinite">Бесконечный</option></select></div>
      <div class="tp-fg"><label>Перемешать</label><input type="checkbox" v-model="examSetup.shuffle" /></div>
      <div class="tp-fg"><label>Лимит (мин, пусто=без)</label><input v-model.number="examSetup.timeLimitMin" type="number" class="form-input" min="1" /></div>
      <button class="tp-submit" @click="startExam">Начать</button>
    </div></div></transition>
  </div>
</template>

<style scoped>
.tp { width: 100vw; height: 100vh; background: #0e1018; color: #e4e8ef; display: flex; flex-direction: column; overflow: hidden; }

.tp-head { display: flex; align-items: center; gap: 14px; padding: 14px 24px; background: rgba(8,10,18,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(100,140,255,0.08); flex-shrink: 0; }
.tp-back { background: rgba(23,103,253,0.1); border: 1px solid rgba(23,103,253,0.25); color: #fff; width: 36px; height: 36px; border-radius: 50%; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.tp-head h1 { flex: 1; font-size: 18px; font-weight: 700; }
.tp-head-actions { display: flex; gap: 6px; }

.tp-body { flex: 1; overflow-y: auto; padding: 20px 24px; }

/* Buttons */
.tp-btn { background: rgba(23,103,253,0.08); border: 1px solid rgba(23,103,253,0.2); color: #6ea8ff; padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.tp-btn:hover { background: rgba(23,103,253,0.15); }
.tp-btn--primary { background: linear-gradient(135deg, #1767fd, #8b5cf6); border: none; color: #fff; }
.tp-btn--danger { background: rgba(248,113,113,0.1); border-color: rgba(248,113,113,0.2); color: #ff7b7b; }
.tp-btn--sm { padding: 4px 10px; font-size: 11px; }
.tp-btn:disabled { opacity: 0.3; cursor: default; }
.tp-rm { background: none; border: none; color: rgba(248,113,113,0.4); font-size: 16px; cursor: pointer; flex-shrink: 0; }
.tp-rm:hover { color: #ff6b6b; }

/* Empty */
.tp-empty { text-align: center; padding: 60px 20px; }
.tp-empty-icon { font-size: 48px; margin-bottom: 12px; }
.tp-empty h3 { font-size: 18px; color: rgba(200,215,255,0.5); }
.tp-empty p { font-size: 13px; color: rgba(200,215,255,0.3); }
.tp-empty-hint { font-size: 12px; color: rgba(200,215,255,0.25); font-style: italic; }

/* Suite list */
.tp-list { display: flex; flex-direction: column; gap: 6px; }
.tp-suite-card { display: flex; align-items: center; gap: 14px; padding: 16px 18px; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; cursor: pointer; transition: all 0.15s; }
.tp-suite-card:hover { border-color: rgba(23,103,253,0.2); background: rgba(23,103,253,0.04); }
.tp-suite-icon { font-size: 28px; }
.tp-suite-info { flex: 1; }
.tp-suite-title { font-size: 16px; font-weight: 700; }
.tp-suite-meta { font-size: 12px; color: rgba(200,215,255,0.45); margin-top: 2px; }
.tp-suite-desc { font-size: 13px; color: rgba(200,215,255,0.5); margin-bottom: 16px; line-height: 1.5; }

/* Topic */
.tp-topic { margin-bottom: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; overflow: hidden; }
.tp-topic-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; transition: background 0.12s; }
.tp-topic-head:hover { background: rgba(255,255,255,0.03); }
.tp-topic-title { flex: 1; font-size: 15px; font-weight: 600; }
.tp-topic-count { font-size: 12px; color: rgba(200,215,255,0.4); }

.tp-subtopics { padding: 0 16px 8px; display: flex; flex-wrap: wrap; gap: 6px; }
.tp-subtopic { padding: 4px 10px; background: rgba(23,103,253,0.06); border: 1px solid rgba(23,103,253,0.12); border-radius: 6px; font-size: 12px; cursor: pointer; }
.tp-subtopic:hover { background: rgba(23,103,253,0.1); }
.tp-sub-count { margin-left: 4px; color: rgba(200,215,255,0.35); }

/* Questions */
.tp-questions { padding: 8px 16px 12px; }
.tp-q-actions { padding: 8px 16px; display: flex; gap: 6px; align-items: center; }
.tp-q { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; margin-bottom: 3px; background: rgba(255,255,255,0.015); }
.tp-q:hover { background: rgba(255,255,255,0.04); }
.tp-q-diff { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; color: #000; flex-shrink: 0; }
.tp-q-type { font-size: 10px; color: rgba(200,215,255,0.4); flex-shrink: 0; width: 80px; }
.tp-q-text { flex: 1; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Exam */
.tp-exam { max-width: 700px; margin: 0 auto; }
.tp-exam-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
.tp-exam-progress { font-size: 14px; font-weight: 700; color: rgba(200,215,255,0.6); flex-shrink: 0; }
.tp-exam-bar-track { flex: 1; height: 8px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; }
.tp-exam-bar-fill { height: 100%; background: linear-gradient(90deg, #1767fd, #8b5cf6); border-radius: 4px; transition: width 0.3s; }

.tp-exam-question { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 24px; }
.tp-exam-q-header { display: flex; gap: 8px; margin-bottom: 16px; }
.tp-exam-q-diff { padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; color: #000; }
.tp-exam-q-type { padding: 3px 10px; background: rgba(255,255,255,0.05); border-radius: 6px; font-size: 11px; color: rgba(200,215,255,0.5); }
.tp-exam-q-text { font-size: 16px; line-height: 1.6; margin-bottom: 20px; color: #f0f3ff; }

.tp-exam-options { display: flex; flex-direction: column; gap: 8px; }
.tp-exam-option { text-align: left; padding: 14px 18px; background: rgba(255,255,255,0.03); border: 2px solid rgba(255,255,255,0.08); border-radius: 12px; color: #e0e6f4; font-size: 14px; cursor: pointer; transition: all 0.15s; }
.tp-exam-option:hover { border-color: rgba(23,103,253,0.3); background: rgba(23,103,253,0.04); }
.tp-exam-option.selected { border-color: #1767fd; background: rgba(23,103,253,0.1); color: #fff; }

.tp-exam-textarea { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 12px; color: #fff; font-size: 14px; resize: vertical; outline: none; box-sizing: border-box; }
.tp-exam-textarea.code { font-family: monospace; }
.tp-exam-textarea:focus { border-color: rgba(23,103,253,0.4); }

.tp-exam-explanation { margin-top: 16px; padding: 12px 16px; background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.2); border-radius: 10px; font-size: 13px; color: rgba(200,215,255,0.7); line-height: 1.5; }

.tp-exam-nav { display: flex; justify-content: space-between; margin-top: 20px; }

/* Results */
.tp-results { max-width: 600px; margin: 0 auto; }
.tp-results-score { text-align: center; padding: 30px; background: rgba(248,113,113,0.06); border: 2px solid rgba(248,113,113,0.2); border-radius: 16px; margin-bottom: 20px; }
.tp-results-score.passed { background: rgba(74,222,128,0.06); border-color: rgba(74,222,128,0.25); }
.tp-results-pct { font-size: 48px; font-weight: 800; }
.tp-results-score.passed .tp-results-pct { color: #4ade80; }
.tp-results-label { font-size: 16px; color: rgba(200,215,255,0.5); }
.tp-results-status { font-size: 14px; font-weight: 700; margin-top: 8px; text-transform: uppercase; letter-spacing: 1px; }
.tp-results-score.passed .tp-results-status { color: #4ade80; }
.tp-results-answers { display: flex; flex-direction: column; gap: 4px; }
.tp-results-answer { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; }
.tp-results-answer.correct { background: rgba(74,222,128,0.04); }
.tp-results-answer.wrong { background: rgba(248,113,113,0.04); }
.tp-results-num { font-size: 12px; color: rgba(200,215,255,0.4); width: 24px; }
.tp-results-icon { font-size: 16px; }
.tp-results-answer.correct .tp-results-icon { color: #4ade80; }
.tp-results-answer.wrong .tp-results-icon { color: #f87171; }
.tp-results-q-title { font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Stats */
.tp-stats { max-width: 600px; margin: 0 auto; }
.tp-stats-overview { display: flex; gap: 12px; margin-bottom: 20px; }
.tp-stat-card { flex: 1; text-align: center; padding: 16px; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; }
.tp-stat-val { font-size: 28px; font-weight: 800; }
.tp-stat-label { font-size: 12px; color: rgba(200,215,255,0.4); margin-top: 4px; }
.tp-stats-section { margin-bottom: 20px; }
.tp-stats-section h3 { font-size: 14px; font-weight: 700; color: rgba(200,215,255,0.6); margin-bottom: 10px; }
.tp-stats-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.tp-stats-name { width: 140px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tp-stats-bar { flex: 1; height: 8px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; }
.tp-stats-bar-fill { height: 100%; background: linear-gradient(90deg, #1767fd, #8b5cf6); border-radius: 4px; }
.tp-stats-pct { font-size: 13px; font-weight: 600; width: 40px; text-align: right; }

.tp-history-row { display: flex; gap: 12px; padding: 6px 0; font-size: 13px; }
.tp-history-date { color: rgba(200,215,255,0.4); }
.tp-history-score { font-weight: 700; }
.tp-history-score.passed { color: #4ade80; }

/* Modals */
.tp-modal { max-width: 480px; }
.tp-fg { margin-bottom: 12px; }
.tp-fg label { display: block; font-size: 12px; color: rgba(200,215,255,0.5); margin-bottom: 3px; }
.tp-submit { width: 100%; padding: 10px; background: linear-gradient(135deg, #1767fd, #8b5cf6); border: none; border-radius: 8px; color: #fff; font-weight: 600; cursor: pointer; }
.tp-submit:hover { filter: brightness(1.15); }
.tp-import-hint { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.tp-import-hint span { font-size: 11px; color: rgba(200,215,255,0.4); }
</style>
