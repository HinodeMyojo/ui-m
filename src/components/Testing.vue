<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  fetchTestSuites, fetchTestSuite, createTestSuite, updateTestSuite, deleteTestSuite,
  createTestTopic, updateTestTopic, deleteTestTopic,
  createTestSubtopic, updateTestSubtopic, deleteTestSubtopic,
  fetchTestQuestions, createTestQuestion, updateTestQuestion, deleteTestQuestion, importTestQuestions,
  createTestExam, submitTestAnswer, finishTestExam,
  fetchExamHistory, fetchTestStats,
  fetchLearningSkills,
} from "./api.js";

const router = useRouter();

// --- State ---
const view = ref("list"); // list | detail | exam | results | stats
const suites = ref([]);
const selectedSuite = ref(null);
const selectedTopicId = ref(null);
const questions = ref([]);
const loading = ref(false);
const allSkills = ref([]);

// Exam
const exam = ref(null);
const examIdx = ref(0);
const examAnswers = ref({});
const examResults = ref(null);
const examMode = ref("exam");

// Practice mode — instant feedback
const practiceResult = ref(null); // { isCorrect, explanation } shown after each answer in practice

// Modals
const modal = ref(null); // 'suite' | 'editSuite' | 'topic' | 'editTopic' | 'subtopic' | 'question' | 'editQuestion' | 'importQ' | 'importTopics' | 'examSetup'

// List filtering
const filterSkillId = ref(null);

// Forms
const suiteForm = ref({ title: "", description: "", icon: "📋", passingScore: 60, learningSkillId: null, learningGradeId: null });
const topicForm = ref({ title: "", description: "" });
const subtopicForm = ref({ testTopicId: "", title: "" });
const importJson = ref("");
const importError = ref("");
const importTopicsJson = ref("");
const importTopicsError = ref("");
const editTopicForm = ref({ id: null, title: "", description: "" });
const editSubtopicForm = ref({ id: null, title: "" });
const examSetup = ref({ questionCount: 20, mode: "exam", shuffle: true, timeLimitMin: null, topicIds: [], difficulties: [], types: [] });

// Question form — dynamic by type
const qForm = ref({
  testTopicId: "", testSubtopicId: null, type: "single_choice",
  question: "", imageUrl: "", explanation: "", difficulty: 1, tags: "",
  // Type-specific
  options: [{ text: "" }, { text: "" }, { text: "" }, { text: "" }],
  correctIdx: 0, // single_choice
  correctIdxs: [], // multiple_choice
  trueFalseAnswer: "true",
  freeTextKeywords: "",
  codeLanguage: "sql", codeExpected: "",
  blanks: [{ placeholder: "", answer: "" }],
  orderItems: [{ text: "" }],
  matchPairs: [{ left: "", right: "" }],
});

// Stats
const stats = ref(null);

// --- Computed ---
const currentQ = computed(() => exam.value?.questions?.[examIdx.value]);
const selectedSkill = computed(() => allSkills.value.find(s => s.id === suiteForm.value.learningSkillId));
const suiteSkill = computed(() => {
  if (!selectedSuite.value?.learningSkillId) return null;
  return allSkills.value.find(s => s.id === selectedSuite.value.learningSkillId);
});
const suiteGrade = computed(() => {
  if (!suiteSkill.value || !selectedSuite.value?.learningGradeId) return null;
  return suiteSkill.value.grades?.find(g => g.id === selectedSuite.value.learningGradeId);
});

// --- Load ---
async function loadSuites() { loading.value = true; try { suites.value = await fetchTestSuites(); } catch(e){} finally { loading.value = false; } }
async function loadSkills() { try { allSkills.value = await fetchLearningSkills(); } catch(e){} }
async function openSuite(id) { loading.value = true; try { selectedSuite.value = await fetchTestSuite(id); view.value = "detail"; } catch(e){} finally { loading.value = false; } }
async function loadQuestions(topicId, subtopicId) { selectedTopicId.value = topicId; try { questions.value = await fetchTestQuestions(topicId, subtopicId); } catch(e){} }

// --- Suite ---
async function saveSuite() {
  if (!suiteForm.value.title.trim()) return;
  await createTestSuite(suiteForm.value);
  modal.value = null;
  suiteForm.value = { title: "", description: "", passingScore: 60, learningSkillId: null, learningGradeId: null };
  await loadSuites();
}
async function removeSuite(id) { if (!confirm("Удалить?")) return; await deleteTestSuite(id); await loadSuites(); }

function startEditSuite(s) {
  suiteForm.value = { title: s.title, description: s.description || "", icon: s.icon || "📋", passingScore: s.passingScore, learningSkillId: s.learningSkillId, learningGradeId: s.learningGradeId };
  modal.value = "editSuite";
}
async function saveEditSuite() {
  if (!selectedSuite.value) return;
  await updateTestSuite(selectedSuite.value.id, suiteForm.value);
  modal.value = null;
  await openSuite(selectedSuite.value.id);
}

// Filtered suites
const filteredSuites = computed(() => {
  if (!filterSkillId.value) return suites.value;
  return suites.value.filter(s => s.learningSkillId === filterSkillId.value);
});

// --- Topic ---
async function saveTopic() {
  if (!topicForm.value.title.trim() || !selectedSuite.value) return;
  await createTestTopic({ testSuiteId: selectedSuite.value.id, ...topicForm.value, position: selectedSuite.value.topics?.length || 0 });
  modal.value = null; topicForm.value = { title: "", description: "" };
  await openSuite(selectedSuite.value.id);
}
async function removeTopic(id) { await deleteTestTopic(id); await openSuite(selectedSuite.value.id); }

function startEditTopic(t) { editTopicForm.value = { id: t.id, title: t.title, description: t.description || "" }; modal.value = "editTopic"; }
async function saveEditTopic() {
  await updateTestTopic(editTopicForm.value.id, { title: editTopicForm.value.title, description: editTopicForm.value.description });
  modal.value = null; await openSuite(selectedSuite.value.id);
}

function startEditSubtopic(sub) { editSubtopicForm.value = { id: sub.id, title: sub.title }; modal.value = "editSubtopic"; }
async function saveEditSubtopic() {
  await updateTestSubtopic(editSubtopicForm.value.id, { title: editSubtopicForm.value.title });
  modal.value = null; await openSuite(selectedSuite.value.id);
}

// --- Subtopic ---
async function saveSubtopic() {
  if (!subtopicForm.value.title.trim()) return;
  await createTestSubtopic(subtopicForm.value);
  modal.value = null; subtopicForm.value = { testTopicId: "", title: "" };
  await openSuite(selectedSuite.value.id);
}

// --- Question ---
function openQuestionModal(topicId, subtopicId) {
  qForm.value = {
    testTopicId: topicId, testSubtopicId: subtopicId || null, type: "single_choice",
    question: "", imageUrl: "", explanation: "", difficulty: 1, tags: "",
    options: [{ text: "" }, { text: "" }, { text: "" }, { text: "" }],
    correctIdx: 0, correctIdxs: [], trueFalseAnswer: "true",
    freeTextKeywords: "", codeLanguage: "sql", codeExpected: "",
    blanks: [{ placeholder: "", answer: "" }], orderItems: [{ text: "" }], matchPairs: [{ left: "", right: "" }],
  };
  modal.value = "question";
}

async function saveQuestion() {
  const f = qForm.value;
  if (!f.question.trim()) return;

  let optionsJson = "[]";
  let correctJson = "{}";
  let metaJson = "{}";

  switch (f.type) {
    case "single_choice":
    case "image_choice": {
      const opts = f.options.filter(o => o.text.trim()).map((o, i) => ({ id: String(i), text: o.text, imageUrl: o.imageUrl || "" }));
      optionsJson = JSON.stringify(opts);
      correctJson = JSON.stringify({ id: String(f.correctIdx) });
      break;
    }
    case "multiple_choice": {
      const opts = f.options.filter(o => o.text.trim()).map((o, i) => ({ id: String(i), text: o.text }));
      optionsJson = JSON.stringify(opts);
      correctJson = JSON.stringify({ ids: f.correctIdxs.map(String) });
      break;
    }
    case "true_false":
      optionsJson = JSON.stringify([{ id: "true", text: "Верно" }, { id: "false", text: "Неверно" }]);
      correctJson = JSON.stringify({ id: f.trueFalseAnswer });
      break;
    case "free_text":
      correctJson = JSON.stringify({ keywords: f.freeTextKeywords.split(",").map(k => k.trim()).filter(Boolean) });
      break;
    case "code_input":
      correctJson = JSON.stringify({ language: f.codeLanguage, expected: f.codeExpected });
      metaJson = JSON.stringify({ language: f.codeLanguage });
      break;
    case "ordering": {
      const items = f.orderItems.filter(o => o.text.trim()).map((o, i) => ({ id: String(i), text: o.text }));
      optionsJson = JSON.stringify(items);
      correctJson = JSON.stringify({ order: items.map((_, i) => String(i)) });
      break;
    }
    case "matching": {
      const pairs = f.matchPairs.filter(p => p.left.trim() && p.right.trim()).map((p, i) => ({ id: String(i), left: p.left, right: p.right }));
      optionsJson = JSON.stringify(pairs);
      correctJson = JSON.stringify({ pairs: pairs.map((_, i) => ({ left: String(i), right: String(i) })) });
      break;
    }
    case "fill_blanks": {
      const blanks = f.blanks.filter(b => b.answer.trim()).map((b, i) => ({ id: String(i), placeholder: b.placeholder || "___", acceptedValues: [b.answer] }));
      optionsJson = JSON.stringify(blanks);
      correctJson = JSON.stringify({ blanks: blanks.map(b => ({ id: b.id, values: b.acceptedValues })) });
      break;
    }
  }

  await createTestQuestion({
    testTopicId: f.testTopicId, testSubtopicId: f.testSubtopicId,
    type: f.type, question: f.question, imageUrl: f.imageUrl,
    options: optionsJson, correct: correctJson, metadata: metaJson,
    explanation: f.explanation, difficulty: f.difficulty, tags: f.tags,
  });
  modal.value = null;
  if (selectedTopicId.value) await loadQuestions(selectedTopicId.value);
}

// --- Import topics from JSON ---
async function doImportTopics() {
  importTopicsError.value = "";
  let parsed;
  try { parsed = JSON.parse(importTopicsJson.value.trim()); } catch(e) { importTopicsError.value = "Невалидный JSON"; return; }
  if (!Array.isArray(parsed)) { importTopicsError.value = "Нужен массив"; return; }
  for (let i = 0; i < parsed.length; i++) {
    const t = parsed[i];
    if (!t.title) continue;
    await createTestTopic({ testSuiteId: selectedSuite.value.id, title: t.title, description: t.description || "", position: i });
  }
  modal.value = null; importTopicsJson.value = "";
  await openSuite(selectedSuite.value.id);
}

// --- Import questions from JSON ---
async function doImportQuestions() {
  importError.value = "";
  let parsed;
  try { parsed = JSON.parse(importJson.value.trim()); } catch(e) { importError.value = "Невалидный JSON"; return; }
  if (!parsed.questions && Array.isArray(parsed)) parsed = { questions: parsed };
  if (!parsed.questions) { importError.value = "Нужен массив questions"; return; }
  try {
    await importTestQuestions({ testTopicId: selectedTopicId.value, questions: parsed.questions });
    modal.value = null; importJson.value = "";
    await openSuite(selectedSuite.value.id);
  } catch(e) { importError.value = e.message; }
}

function copyPrompt(type) {
  const prompts = {
    topics: `Сгенерируй JSON массив тем для теста. Формат: [{"title":"Тема 1","description":"Описание"}]. Только JSON. Тест:`,
    questions: `Сгенерируй JSON вопросов. Формат: {"questions":[{"type":"single_choice","difficulty":"medium","tags":["tag"],"subtopic":"1-1","question":"Текст","options":["A","B","C"],"correct":[0],"explanation":"Почему"}]}. Типы: single_choice, multiple_choice, true_false, free_text, code_input, ordering, matching. Только JSON. Тема:`,
  };
  const ta = document.createElement("textarea");
  ta.value = prompts[type]; ta.style.cssText = "position:fixed;left:-9999px";
  document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
}

// --- Exam ---
async function startExam() {
  try {
    exam.value = await createTestExam({ testSuiteId: selectedSuite.value.id, ...examSetup.value });
    examIdx.value = 0; examAnswers.value = {}; examMode.value = examSetup.value.mode;
    modal.value = null; view.value = "exam";
  } catch(e) { alert("Нет вопросов для экзамена"); }
}

function quickTest(topicIds) {
  examSetup.value.topicIds = topicIds;
  examSetup.value.mode = "learning";
  examSetup.value.questionCount = 999;
  examSetup.value.shuffle = true;
  startExam();
}

function selectAnswer(qid, answer) { examAnswers.value[qid] = answer; }
function setMatchPair(qid, leftId, rightId) {
  const cur = examAnswers.value[qid]?.pairs || {};
  examAnswers.value[qid] = { pairs: { ...cur, [leftId]: rightId } };
}
const shuffledRightsCache = {};
function shuffledRights(q) {
  if (shuffledRightsCache[q.id]) return shuffledRightsCache[q.id];
  const opts = parseOpts(q.options);
  const arr = opts.map((o, i) => ({ id: o.id ?? i, right: o.right }));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  shuffledRightsCache[q.id] = arr;
  return arr;
}
function orderingCurrent(q) {
  const opts = parseOpts(q.options);
  const cur = examAnswers.value[q.id]?.order;
  if (!Array.isArray(cur) || cur.length !== opts.length) {
    // initialize: same order as options (user must rearrange)
    const init = opts.map(o => String(o.id));
    examAnswers.value[q.id] = { order: init };
    return opts;
  }
  return cur.map(id => opts.find(o => String(o.id) === String(id))).filter(Boolean);
}
function moveOrdering(q, i, dir) {
  const cur = [...(examAnswers.value[q.id]?.order || [])];
  const j = i + dir;
  if (j < 0 || j >= cur.length) return;
  [cur[i], cur[j]] = [cur[j], cur[i]];
  examAnswers.value[q.id] = { order: cur };
}
function toggleMulti(qid, optId) {
  const cur = examAnswers.value[qid]?.ids || [];
  const idx = cur.indexOf(optId);
  const ids = idx === -1 ? [...cur, optId] : cur.filter(i => i !== optId);
  examAnswers.value[qid] = { ids };
}

async function submitAndNext() {
  const q = currentQ.value;

  // If practice result is showing — just advance to next question
  if (practiceResult.value) {
    practiceResult.value = null;
    if (examIdx.value < exam.value.questions.length - 1) { examIdx.value++; }
    else { const r = await finishTestExam({ testExamId: exam.value.id }); examResults.value = r; view.value = "results"; }
    return;
  }

  // Submit answer
  if (q && examAnswers.value[q.id]) {
    await submitTestAnswer({ testExamId: exam.value.id, testQuestionId: q.id, givenAnswer: JSON.stringify(examAnswers.value[q.id]) });
  }

  // In learning mode — show feedback, don't advance yet
  if (examMode.value === "learning" && q) {
    let correctData = {};
    try { correctData = JSON.parse(q.correct || "{}"); } catch(e) {}

    // Normalize correct data: support both {"id":"0"} and legacy [0] formats
    let correctId = correctData.id;
    let correctIds = correctData.ids;
    if (Array.isArray(correctData)) {
      // Legacy format: [0] or [1,2,3] — but skip nested arrays (matching pairs)
      const isFlat = correctData.every(x => typeof x !== "object");
      if (isFlat) {
        const arr = correctData.map(String);
        if (arr.length === 1 && (q.type === "single_choice" || q.type === "true_false" || q.type === "image_choice")) {
          correctId = arr[0];
        } else if (q.type === "multiple_choice") {
          correctIds = arr;
        }
      }
    }

    const given = examAnswers.value[q.id];
    let isCorrect = false;
    if (q.type === "multiple_choice") {
      const givenIds = [...(given?.ids || [])].sort();
      const cIds = [...(correctIds || [])].map(String).sort();
      isCorrect = givenIds.length === cIds.length && givenIds.every((v, i) => v === cIds[i]);
    } else if (q.type === "true_false" || q.type === "single_choice" || q.type === "image_choice") {
      isCorrect = given?.id === correctId;
    } else if (q.type === "free_text") {
      const givenText = (given?.text || "").toLowerCase().trim();
      const keywords = correctData.keywords || [];
      isCorrect = givenText.length > 0 && keywords.length > 0 && keywords.some(k => givenText.includes(k.toLowerCase()));
    } else if (q.type === "code_input") {
      const givenCode = (given?.text || "").trim().toLowerCase();
      const expected = (correctData.expected || "").trim().toLowerCase();
      isCorrect = givenCode.length > 0 && expected.length > 0 && givenCode === expected;
    } else if (q.type === "matching") {
      // correctData может быть { pairs: [{left,right}] } или legacy [[0,0],[1,1]]
      const givenPairs = given?.pairs || {};
      let expectedMap = {};
      if (Array.isArray(correctData)) {
        correctData.forEach(p => { if (Array.isArray(p)) expectedMap[String(p[0])] = String(p[1]); });
      } else if (Array.isArray(correctData.pairs)) {
        correctData.pairs.forEach(p => { expectedMap[String(p.left)] = String(p.right); });
      }
      const keys = Object.keys(expectedMap);
      isCorrect = keys.length > 0 && keys.every(k => String(givenPairs[k]) === expectedMap[k]);
    } else {
      // ordering, matching, fill_blanks — strict compare
      isCorrect = !!given && JSON.stringify(given) === JSON.stringify(correctData);
    }
    practiceResult.value = { isCorrect, explanation: q.explanation || "", correctId, correctIds, correctExpected: correctData.expected, correctKeywords: correctData.keywords };
    return;
  }

  // Exam mode — advance immediately
  if (examIdx.value < exam.value.questions.length - 1) { examIdx.value++; }
  else { const r = await finishTestExam({ testExamId: exam.value.id }); examResults.value = r; view.value = "results"; }
}

async function openStats() {
  if (!selectedSuite.value) return;
  stats.value = await fetchTestStats(selectedSuite.value.id);
  view.value = "stats";
}

function goBack() {
  if (view.value === "exam" || view.value === "results" || view.value === "stats") view.value = "detail";
  else if (view.value === "detail") { view.value = "list"; selectedSuite.value = null; }
  else router.push("/");
}

function parseOpts(json) { try { return JSON.parse(json); } catch { return []; } }
function diffLabel(d) { return d === 1 ? "Easy" : d === 2 ? "Medium" : "Hard"; }
function diffColor(d) { return d === 1 ? "#4ade80" : d === 2 ? "#facc15" : "#f87171"; }
function typeLabel(t) { const m = { single_choice:"Один",multiple_choice:"Несколько",true_false:"Да/Нет",free_text:"Текст",code_input:"Код",fill_blanks:"Пропуски",ordering:"Порядок",matching:"Соответствие",image_choice:"Картинка" }; return m[t] || t; }

const questionTypes = [
  { v: "single_choice", l: "Один ответ" }, { v: "multiple_choice", l: "Несколько ответов" },
  { v: "true_false", l: "Верно/Неверно" }, { v: "free_text", l: "Свободный текст" },
  { v: "code_input", l: "Код" }, { v: "fill_blanks", l: "Пропуски" },
  { v: "ordering", l: "Порядок" }, { v: "matching", l: "Соответствие" }, { v: "image_choice", l: "Картинка" },
];

onMounted(async () => { await loadSuites(); await loadSkills(); });
</script>

<template>
  <div class="tp">
    <header class="tp-head">
      <button class="tp-back" @click="goBack">←</button>
      <div class="tp-head-title">
        <h1>{{ view === 'list' ? 'Тестирование' : view === 'exam' ? 'Экзамен' : view === 'results' ? 'Результаты' : view === 'stats' ? 'Статистика' : selectedSuite?.title || '' }}</h1>
        <!-- Skill/Grade badge -->
        <div v-if="view === 'detail' && suiteSkill" class="tp-suite-skill-badge" :style="{ borderColor: suiteSkill.color }">
          <span class="tp-suite-skill-icon" :style="{ background: suiteSkill.color + '25' }">{{ suiteSkill.icon || '📚' }}</span>
          <span>{{ suiteSkill.title }}</span>
          <span v-if="suiteGrade" class="tp-suite-grade-tag">{{ suiteGrade.title }}</span>
        </div>
      </div>
      <div class="tp-head-actions">
        <button v-if="view === 'list'" class="tp-btn tp-btn--primary" @click="modal = 'suite'">+ Тест</button>
        <template v-if="view === 'detail'">
          <button class="tp-btn" @click="startEditSuite(selectedSuite)">✎ Тест</button>
          <button class="tp-btn" @click="modal = 'topic'">+ Тема</button>
          <button class="tp-btn" @click="modal = 'importTopics'">{ } JSON</button>
          <button class="tp-btn tp-btn--primary" @click="examSetup = { questionCount: 0, mode: 'learning', shuffle: true, timeLimitMin: null, topicIds: [], difficulties: [], types: [] }; modal = 'examSetup'">Тестирование</button>
          <button class="tp-btn tp-btn--primary" @click="examSetup = { questionCount: 20, mode: 'exam', shuffle: true, timeLimitMin: null, topicIds: [], difficulties: [], types: [] }; modal = 'examSetup'">Экзамен</button>
          <button class="tp-btn" @click="openStats">Статистика</button>
        </template>
      </div>
    </header>

    <div class="tp-body">
      <!-- LIST -->
      <div v-if="view === 'list'" class="tp-list">
        <!-- Skill filter -->
        <div v-if="allSkills.length" class="tp-filter-bar">
          <button class="tp-filter-btn" :class="{ active: !filterSkillId }" @click="filterSkillId = null">Все</button>
          <button v-for="sk in allSkills" :key="sk.id" class="tp-filter-btn" :class="{ active: filterSkillId === sk.id }" @click="filterSkillId = sk.id" :style="filterSkillId === sk.id ? { borderColor: sk.color, color: sk.color } : {}">
            {{ sk.icon || '📚' }} {{ sk.title }}
          </button>
        </div>
        <div v-if="!filteredSuites.length" class="tp-empty"><div class="tp-empty-icon">📝</div><h3>Нет тестов</h3><p>Создай первый тест для самоподготовки</p></div>
        <div v-for="s in filteredSuites" :key="s.id" class="tp-suite-card" @click="openSuite(s.id)">
          <div class="tp-suite-icon">{{ s.icon || '📋' }}</div>
          <div class="tp-suite-info">
            <div class="tp-suite-title">{{ s.title }}</div>
            <div class="tp-suite-meta">
              {{ s.totalQuestions }} вопр. · {{ s.totalExams }} экз. · {{ s.totalPractices }} практ.
              <span v-if="s.bestScore > 0"> · лучший {{ Math.round(s.bestScore) }}%</span>
            </div>
          </div>
          <button class="tp-rm" @click.stop="removeSuite(s.id)">✕</button>
        </div>
      </div>

      <!-- DETAIL -->
      <div v-if="view === 'detail' && selectedSuite" class="tp-detail">
        <p v-if="selectedSuite.description" class="tp-desc">{{ selectedSuite.description }}</p>
        <div class="tp-detail-stats">
          <span>{{ selectedSuite.totalQuestions }} вопросов</span>
          <span>{{ selectedSuite.topics?.length || 0 }} тем</span>
        </div>

        <div v-for="topic in selectedSuite.topics" :key="topic.id" class="tp-topic">
          <div class="tp-topic-head" @click="loadQuestions(topic.id)">
            <span class="tp-topic-num">{{ topic.position + 1 }}</span>
            <span class="tp-topic-title">{{ topic.title }}</span>
            <span class="tp-topic-count">{{ topic.totalQuestions }} вопр.</span>
            <button class="tp-btn tp-btn--sm" @click.stop="quickTest([topic.id])" title="Тестирование по теме">▶</button>
            <button class="tp-btn tp-btn--sm" @click.stop="startEditTopic(topic)">✎</button>
            <button class="tp-rm" @click.stop="removeTopic(topic.id)">✕</button>
          </div>

          <div v-if="topic.subtopics?.length" class="tp-subtopics">
            <div v-for="sub in topic.subtopics" :key="sub.id" class="tp-sub" @click.stop="loadQuestions(topic.id, sub.id)">
              {{ sub.title }} <span class="tp-sub-n">{{ sub.totalQuestions }}</span>
              <button class="tp-btn tp-btn--sm" @click.stop="startEditSubtopic(sub)" style="padding:2px 6px;font-size:10px">✎</button>
              <button class="tp-rm tp-rm--sm" @click.stop="deleteTestSubtopic(sub.id).then(() => openSuite(selectedSuite.id))">✕</button>
            </div>
          </div>

          <!-- Expanded: questions + actions -->
          <div v-if="selectedTopicId === topic.id" class="tp-topic-body">
            <div class="tp-topic-actions">
              <button class="tp-btn tp-btn--sm" @click="openQuestionModal(topic.id)">+ Вопрос</button>
              <button class="tp-btn tp-btn--sm" @click="selectedTopicId = topic.id; modal = 'importQ'">{ } Вопросы из JSON</button>
              <button class="tp-btn tp-btn--sm" @click="subtopicForm.testTopicId = topic.id; modal = 'subtopic'">+ Подтема</button>
            </div>
            <div v-if="questions.length" class="tp-q-list">
              <div v-for="q in questions" :key="q.id" class="tp-q">
                <span class="tp-q-diff" :style="{ background: diffColor(q.difficulty) }">{{ diffLabel(q.difficulty) }}</span>
                <span class="tp-q-type">{{ typeLabel(q.type) }}</span>
                <span class="tp-q-text">{{ q.question }}</span>
                <button class="tp-rm tp-rm--sm" @click="deleteTestQuestion(q.id).then(() => loadQuestions(topic.id))">✕</button>
              </div>
            </div>
            <div v-else class="tp-no-q">Нет вопросов</div>
          </div>
        </div>
        <div v-if="!selectedSuite.topics?.length" class="tp-no-q" style="padding:20px">Добавь темы</div>
      </div>

      <!-- EXAM -->
      <div v-if="view === 'exam' && exam" class="tp-exam">
        <div class="tp-exam-bar">
          <span class="tp-exam-counter">{{ examIdx + 1 }} / {{ exam.questions.length }}</span>
          <div class="tp-exam-track"><div class="tp-exam-fill" :style="{ width: ((examIdx + 1) / exam.questions.length * 100) + '%' }"></div></div>
          <button class="tp-btn tp-btn--danger tp-btn--sm" @click="finishTestExam({ testExamId: exam.id }).then(r => { examResults = r; view = 'results'; })">Завершить</button>
        </div>
        <div v-if="currentQ" class="tp-exam-card">
          <div class="tp-exam-q-meta">
            <span class="tp-exam-q-diff" :style="{ background: diffColor(currentQ.difficulty) }">{{ diffLabel(currentQ.difficulty) }}</span>
            <span class="tp-exam-q-type">{{ typeLabel(currentQ.type) }}</span>
            <span v-if="currentQ.tags" class="tp-exam-q-tags">{{ currentQ.tags }}</span>
          </div>
          <div v-if="currentQ.imageUrl" class="tp-exam-q-img"><img :src="currentQ.imageUrl" /></div>
          <div class="tp-exam-q-text">{{ currentQ.question }}</div>

          <!-- Choice -->
          <div v-if="['single_choice','multiple_choice','true_false','image_choice'].includes(currentQ.type)" class="tp-opts">
            <button v-for="opt in parseOpts(currentQ.options)" :key="opt.id" class="tp-opt" :class="{ sel: examAnswers[currentQ.id]?.id === opt.id || examAnswers[currentQ.id]?.ids?.includes(opt.id) }" @click="currentQ.type === 'multiple_choice' ? toggleMulti(currentQ.id, opt.id) : selectAnswer(currentQ.id, { id: opt.id })">
              <img v-if="opt.imageUrl" :src="opt.imageUrl" class="tp-opt-img" />
              <span>{{ opt.text }}</span>
            </button>
          </div>

          <!-- Matching: для каждого левого выбираем правый -->
          <div v-if="currentQ.type === 'matching'" class="tp-match-game">
            <div v-for="(pair, i) in parseOpts(currentQ.options)" :key="pair.id || i" class="tp-match-game-row">
              <div class="tp-match-left">{{ pair.left }}</div>
              <select class="form-input tp-match-select" :value="examAnswers[currentQ.id]?.pairs?.[String(pair.id ?? i)] ?? ''" @change="setMatchPair(currentQ.id, String(pair.id ?? i), $event.target.value)">
                <option value="">— выбери —</option>
                <option v-for="(opt, j) in shuffledRights(currentQ)" :key="opt.id || j" :value="String(opt.id ?? j)">{{ opt.right }}</option>
              </select>
            </div>
          </div>

          <!-- Ordering: расставить элементы в правильном порядке (стрелки вверх/вниз) -->
          <div v-if="currentQ.type === 'ordering'" class="tp-order-list">
            <div v-for="(item, i) in orderingCurrent(currentQ)" :key="item.id" class="tp-order-row">
              <span class="tp-order-num">{{ i + 1 }}</span>
              <div class="tp-order-text">{{ item.text }}</div>
              <div class="tp-order-btns">
                <button class="tp-btn tp-btn--sm" :disabled="i === 0" @click="moveOrdering(currentQ, i, -1)">↑</button>
                <button class="tp-btn tp-btn--sm" :disabled="i === orderingCurrent(currentQ).length - 1" @click="moveOrdering(currentQ, i, 1)">↓</button>
              </div>
            </div>
          </div>

          <!-- fill_blanks — заглушка пока -->
          <div v-if="currentQ.type === 'fill_blanks'" class="tp-no-q" style="padding:16px;color:#facc15">
            ⚠ Тип "{{ typeLabel(currentQ.type) }}" пока не поддерживается в UI.
          </div>

          <!-- Text / Code -->
          <div v-if="['free_text','code_input'].includes(currentQ.type)">
            <textarea class="tp-text-input" :class="{ code: currentQ.type === 'code_input' }" rows="5" :placeholder="currentQ.type === 'code_input' ? 'Код...' : 'Ответ...'" :value="examAnswers[currentQ.id]?.text || ''" @input="selectAnswer(currentQ.id, { text: $event.target.value })"></textarea>
          </div>

          <!-- Practice mode: instant feedback -->
          <div v-if="practiceResult" class="tp-practice-result" :class="{ correct: practiceResult.isCorrect, wrong: !practiceResult.isCorrect }">
            <div class="tp-practice-verdict">{{ practiceResult.isCorrect ? '✓ Правильно!' : '✗ Неправильно' }}</div>
            <div v-if="!practiceResult.isCorrect && practiceResult.correctId" class="tp-practice-correct">
              Правильный ответ: {{ parseOpts(currentQ.options)?.find(o => o.id === practiceResult.correctId)?.text || practiceResult.correctId }}
            </div>
            <div v-if="!practiceResult.isCorrect && practiceResult.correctIds?.length" class="tp-practice-correct">
              Правильные ответы: {{ practiceResult.correctIds.map(id => parseOpts(currentQ.options)?.find(o => o.id === id)?.text || id).join(', ') }}
            </div>
            <div v-if="!practiceResult.isCorrect && practiceResult.correctExpected" class="tp-practice-correct">
              Правильный ответ: <code>{{ practiceResult.correctExpected }}</code>
            </div>
            <div v-if="!practiceResult.isCorrect && practiceResult.correctKeywords?.length" class="tp-practice-correct">
              Ключевые слова: {{ practiceResult.correctKeywords.join(', ') }}
            </div>
            <div v-if="practiceResult.explanation" class="tp-practice-explanation">{{ practiceResult.explanation }}</div>
          </div>

          <div class="tp-exam-nav">
            <button class="tp-btn" :disabled="examIdx === 0" @click="practiceResult = null; examIdx--">← Назад</button>
            <button class="tp-btn tp-btn--primary" @click="submitAndNext">
              {{ practiceResult ? 'Далее →' : (examIdx < exam.questions.length - 1 ? 'Ответить →' : 'Завершить') }}
            </button>
          </div>
        </div>
      </div>

      <!-- RESULTS -->
      <div v-if="view === 'results' && examResults" class="tp-results">
        <div class="tp-score" :class="{ pass: examResults.passed }">
          <div class="tp-score-pct">{{ Math.round(examResults.scorePercent) }}%</div>
          <div class="tp-score-detail">{{ examResults.correctCount }} / {{ examResults.totalQuestions }}</div>
          <div class="tp-score-label">{{ examResults.passed ? 'СДАНО' : 'НЕ СДАНО' }}</div>
        </div>
        <div class="tp-answers-list">
          <div v-for="(a, i) in examResults.answers" :key="a.id" class="tp-answer-row" :class="{ ok: a.isCorrect, fail: !a.isCorrect }">
            <span class="tp-answer-num">{{ i + 1 }}</span>
            <span class="tp-answer-icon">{{ a.isCorrect ? '✓' : '✗' }}</span>
            <span class="tp-answer-text">{{ (examResults.questions?.find(q => q.id === a.testQuestionId)?.question || '...').slice(0, 80) }}</span>
          </div>
        </div>
        <button class="tp-btn tp-btn--primary" @click="view = 'detail'" style="margin-top:16px">Назад</button>
      </div>

      <!-- STATS -->
      <div v-if="view === 'stats' && stats" class="tp-stats">
        <div class="tp-stats-cards">
          <div class="tp-sc"><div class="tp-sc-v">{{ stats.totalQuestions }}</div><div class="tp-sc-l">Вопросов</div></div>
          <div class="tp-sc"><div class="tp-sc-v">{{ stats.totalExams }}</div><div class="tp-sc-l">Экзаменов</div></div>
          <div class="tp-sc"><div class="tp-sc-v">{{ stats.totalPractices }}</div><div class="tp-sc-l">Тестирований</div></div>
          <div class="tp-sc"><div class="tp-sc-v">{{ Math.round(stats.avgScore) }}%</div><div class="tp-sc-l">Средний балл</div></div>
          <div class="tp-sc"><div class="tp-sc-v" style="color:#4ade80">{{ Math.round(stats.bestScore) }}%</div><div class="tp-sc-l">Лучший</div></div>
        </div>

        <div class="tp-stats-cards" style="margin-top:8px">
          <div class="tp-sc"><div class="tp-sc-v">{{ stats.totalAnswered }}</div><div class="tp-sc-l">Отвечено</div></div>
          <div class="tp-sc"><div class="tp-sc-v">{{ stats.totalCorrect }}</div><div class="tp-sc-l">Правильных</div></div>
          <div class="tp-sc"><div class="tp-sc-v">{{ Math.round(stats.correctPercent) }}%</div><div class="tp-sc-l">Точность</div></div>
        </div>

        <!-- Weak topics -->
        <div v-if="stats.weakTopics?.length" class="tp-stats-section" style="margin-top:16px">
          <h3 style="color:#f87171">Слабые места (&lt; 60%)</h3>
          <div v-for="t in stats.weakTopics" :key="t.topicId" class="tp-stats-row">
            <span class="tp-stats-name">{{ t.topicName }}</span>
            <div class="tp-stats-bar"><div class="tp-stats-fill" :style="{ width: t.percent + '%', background: '#f87171' }"></div></div>
            <span class="tp-stats-pct" style="color:#f87171">{{ Math.round(t.percent) }}%</span>
          </div>
        </div>

        <div v-if="stats.byTopic?.length" class="tp-stats-section" style="margin-top:16px">
          <h3>По темам</h3>
          <div v-for="t in stats.byTopic" :key="t.topicId" class="tp-stats-row">
            <span class="tp-stats-name">{{ t.topicName }}</span>
            <div class="tp-stats-bar"><div class="tp-stats-fill" :style="{ width: t.percent + '%' }"></div></div>
            <span class="tp-stats-pct">{{ Math.round(t.percent) }}%</span>
          </div>
        </div>

        <div v-if="Object.keys(stats.byDifficulty || {}).length" class="tp-stats-section" style="margin-top:16px">
          <h3>По сложности</h3>
          <div v-for="(val, key) in stats.byDifficulty" :key="key" class="tp-stats-row">
            <span class="tp-stats-name" :style="{ color: key === 'easy' ? '#4ade80' : key === 'medium' ? '#facc15' : '#f87171' }">{{ key }}</span>
            <div class="tp-stats-bar"><div class="tp-stats-fill" :style="{ width: val.percent + '%' }"></div></div>
            <span class="tp-stats-pct">{{ val.correct }}/{{ val.total }} ({{ Math.round(val.percent) }}%)</span>
          </div>
        </div>

        <div v-if="Object.keys(stats.byType || {}).length" class="tp-stats-section" style="margin-top:16px">
          <h3>По типу вопросов</h3>
          <div v-for="(val, key) in stats.byType" :key="key" class="tp-stats-row">
            <span class="tp-stats-name">{{ typeLabel(key) }}</span>
            <div class="tp-stats-bar"><div class="tp-stats-fill" :style="{ width: val.percent + '%' }"></div></div>
            <span class="tp-stats-pct">{{ val.correct }}/{{ val.total }}</span>
          </div>
        </div>

        <div v-if="stats.examHistory?.length" class="tp-stats-section" style="margin-top:16px">
          <h3>История</h3>
          <div v-for="e in stats.examHistory" :key="e.id" class="tp-history-row">
            <span class="tp-history-date">{{ e.startedAt ? new Date(e.startedAt).toLocaleDateString('ru') : '—' }}</span>
            <span class="tp-history-score" :class="{ passed: e.passed }">{{ Math.round(e.scorePercent) }}%</span>
            <span>{{ e.correctCount }}/{{ e.totalQuestions }}</span>
            <span class="tp-history-mode">{{ e.mode === 'learning' ? 'Тест' : 'Экзамен' }}</span>
          </div>
        </div>

        <button class="tp-btn" @click="view = 'detail'" style="margin-top:16px">Назад</button>
      </div>
    </div>

    <!-- ===== MODALS ===== -->

    <!-- Create Suite -->
    <transition name="modal-fade"><div v-if="modal === 'suite'" class="modal-overlay" @click.self="modal = null"><div class="modal-card tp-modal">
      <button class="modal-close" @click="modal = null">×</button>
      <h2 class="modal-title">Новый тест</h2>
      <div class="tp-fg"><label>Название</label><input v-model="suiteForm.title" class="form-input" @keyup.enter="saveSuite" /></div>
      <div class="tp-fg"><label>Описание</label><textarea v-model="suiteForm.description" class="form-input" rows="2"></textarea></div>
      <div class="tp-fg"><label>Проходной балл (%)</label><input v-model.number="suiteForm.passingScore" type="number" class="form-input" min="1" max="100" /></div>
      <div class="tp-fg"><label>Навык (необязательно)</label>
        <select v-model="suiteForm.learningSkillId" class="form-input" @change="suiteForm.learningGradeId = null">
          <option :value="null">Без навыка</option>
          <option v-for="s in allSkills" :key="s.id" :value="s.id">{{ s.icon }} {{ s.title }}</option>
        </select>
      </div>
      <div v-if="selectedSkill?.grades?.length" class="tp-fg"><label>Уровень</label>
        <select v-model="suiteForm.learningGradeId" class="form-input">
          <option :value="null">Без уровня</option>
          <option v-for="g in selectedSkill.grades" :key="g.id" :value="g.id">{{ g.title }}</option>
        </select>
      </div>
      <button class="tp-submit" @click="saveSuite">Создать</button>
    </div></div></transition>

    <!-- Create Topic -->
    <transition name="modal-fade"><div v-if="modal === 'topic'" class="modal-overlay" @click.self="modal = null"><div class="modal-card tp-modal">
      <button class="modal-close" @click="modal = null">×</button>
      <h2 class="modal-title">Новая тема</h2>
      <div class="tp-fg"><label>Название</label><input v-model="topicForm.title" class="form-input" @keyup.enter="saveTopic" /></div>
      <div class="tp-fg"><label>Описание</label><textarea v-model="topicForm.description" class="form-input" rows="2"></textarea></div>
      <button class="tp-submit" @click="saveTopic">Создать</button>
    </div></div></transition>

    <!-- Import Topics JSON -->
    <transition name="modal-fade"><div v-if="modal === 'importTopics'" class="modal-overlay" @click.self="modal = null"><div class="modal-card tp-modal">
      <button class="modal-close" @click="modal = null">×</button>
      <h2 class="modal-title">Импорт тем из JSON</h2>
      <div class="tp-import-row"><span>Скопируй промпт для AI</span><button class="tp-btn tp-btn--sm" @click="copyPrompt('topics')">Копировать</button></div>
      <textarea v-model="importTopicsJson" class="form-input tp-mono" rows="8" placeholder='[{"title":"Тема 1"},{"title":"Тема 2"}]'></textarea>
      <div v-if="importTopicsError" class="tp-err">{{ importTopicsError }}</div>
      <button class="tp-submit" @click="doImportTopics">Импортировать</button>
    </div></div></transition>

    <!-- Create Subtopic -->
    <transition name="modal-fade"><div v-if="modal === 'subtopic'" class="modal-overlay" @click.self="modal = null"><div class="modal-card tp-modal">
      <button class="modal-close" @click="modal = null">×</button>
      <h2 class="modal-title">Новая подтема</h2>
      <div class="tp-fg"><label>Название</label><input v-model="subtopicForm.title" class="form-input" @keyup.enter="saveSubtopic" /></div>
      <button class="tp-submit" @click="saveSubtopic">Создать</button>
    </div></div></transition>

    <!-- Create Question (dynamic by type) -->
    <transition name="modal-fade"><div v-if="modal === 'question'" class="modal-overlay" @click.self="modal = null"><div class="modal-card tp-modal tp-modal--wide">
      <button class="modal-close" @click="modal = null">×</button>
      <h2 class="modal-title">Новый вопрос</h2>
      <div class="tp-fg"><label>Тип</label>
        <select v-model="qForm.type" class="form-input"><option v-for="t in questionTypes" :key="t.v" :value="t.v">{{ t.l }}</option></select>
      </div>
      <div class="tp-fg"><label>Вопрос (Markdown)</label><textarea v-model="qForm.question" class="form-input" rows="3"></textarea></div>
      <div class="tp-fg"><label>URL картинки (необязательно)</label><input v-model="qForm.imageUrl" class="form-input" placeholder="https://..." /></div>

      <!-- Single choice / Image choice options -->
      <div v-if="['single_choice','image_choice'].includes(qForm.type)" class="tp-fg">
        <label>Варианты</label>
        <div v-for="(opt, i) in qForm.options" :key="i" class="tp-opt-row">
          <input type="radio" :name="'correct-sc'" :value="i" v-model="qForm.correctIdx" />
          <input v-model="opt.text" class="form-input" :placeholder="'Вариант ' + (i+1)" />
          <input v-if="qForm.type === 'image_choice'" v-model="opt.imageUrl" class="form-input" placeholder="URL картинки" style="width:200px" />
          <button class="tp-rm tp-rm--sm" @click="qForm.options.splice(i, 1)">✕</button>
        </div>
        <button class="tp-btn tp-btn--sm" @click="qForm.options.push({ text: '', imageUrl: '' })">+ Вариант</button>
      </div>

      <!-- Multiple choice -->
      <div v-if="qForm.type === 'multiple_choice'" class="tp-fg">
        <label>Варианты (отметь правильные)</label>
        <div v-for="(opt, i) in qForm.options" :key="i" class="tp-opt-row">
          <input type="checkbox" :value="i" v-model="qForm.correctIdxs" />
          <input v-model="opt.text" class="form-input" :placeholder="'Вариант ' + (i+1)" />
          <button class="tp-rm tp-rm--sm" @click="qForm.options.splice(i, 1)">✕</button>
        </div>
        <button class="tp-btn tp-btn--sm" @click="qForm.options.push({ text: '' })">+ Вариант</button>
      </div>

      <!-- True/False -->
      <div v-if="qForm.type === 'true_false'" class="tp-fg">
        <label>Правильный ответ</label>
        <select v-model="qForm.trueFalseAnswer" class="form-input"><option value="true">Верно</option><option value="false">Неверно</option></select>
      </div>

      <!-- Free text -->
      <div v-if="qForm.type === 'free_text'" class="tp-fg">
        <label>Ключевые слова (через запятую)</label>
        <input v-model="qForm.freeTextKeywords" class="form-input" placeholder="keyword1, keyword2" />
      </div>

      <!-- Code -->
      <div v-if="qForm.type === 'code_input'" class="tp-fg">
        <label>Язык</label><input v-model="qForm.codeLanguage" class="form-input" placeholder="sql, python, bash..." />
        <label style="margin-top:8px">Эталонный код</label><textarea v-model="qForm.codeExpected" class="form-input tp-mono" rows="4"></textarea>
      </div>

      <!-- Ordering -->
      <div v-if="qForm.type === 'ordering'" class="tp-fg">
        <label>Элементы (в правильном порядке)</label>
        <div v-for="(item, i) in qForm.orderItems" :key="i" class="tp-opt-row">
          <span class="tp-opt-num">{{ i + 1 }}</span>
          <input v-model="item.text" class="form-input" />
          <button class="tp-rm tp-rm--sm" @click="qForm.orderItems.splice(i, 1)">✕</button>
        </div>
        <button class="tp-btn tp-btn--sm" @click="qForm.orderItems.push({ text: '' })">+ Элемент</button>
      </div>

      <!-- Matching -->
      <div v-if="qForm.type === 'matching'" class="tp-fg">
        <label>Пары соответствий</label>
        <div v-for="(pair, i) in qForm.matchPairs" :key="i" class="tp-match-row">
          <input v-model="pair.left" class="form-input" placeholder="Левый" />
          <span>↔</span>
          <input v-model="pair.right" class="form-input" placeholder="Правый" />
          <button class="tp-rm tp-rm--sm" @click="qForm.matchPairs.splice(i, 1)">✕</button>
        </div>
        <button class="tp-btn tp-btn--sm" @click="qForm.matchPairs.push({ left: '', right: '' })">+ Пара</button>
      </div>

      <!-- Fill blanks -->
      <div v-if="qForm.type === 'fill_blanks'" class="tp-fg">
        <label>Пропуски</label>
        <div v-for="(b, i) in qForm.blanks" :key="i" class="tp-match-row">
          <input v-model="b.placeholder" class="form-input" placeholder="Placeholder (___)" style="width:120px" />
          <input v-model="b.answer" class="form-input" placeholder="Правильный ответ" />
          <button class="tp-rm tp-rm--sm" @click="qForm.blanks.splice(i, 1)">✕</button>
        </div>
        <button class="tp-btn tp-btn--sm" @click="qForm.blanks.push({ placeholder: '', answer: '' })">+ Пропуск</button>
      </div>

      <div class="tp-fg"><label>Объяснение</label><textarea v-model="qForm.explanation" class="form-input" rows="2" placeholder="Почему этот ответ правильный..."></textarea></div>
      <div class="tp-fg tp-fg-row">
        <div><label>Сложность</label><select v-model.number="qForm.difficulty" class="form-input"><option :value="1">Easy</option><option :value="2">Medium</option><option :value="3">Hard</option></select></div>
        <div><label>Теги</label><input v-model="qForm.tags" class="form-input" placeholder="tag1, tag2" /></div>
      </div>
      <button class="tp-submit" @click="saveQuestion">Создать вопрос</button>
    </div></div></transition>

    <!-- Import Questions JSON -->
    <transition name="modal-fade"><div v-if="modal === 'importQ'" class="modal-overlay" @click.self="modal = null"><div class="modal-card tp-modal">
      <button class="modal-close" @click="modal = null">×</button>
      <h2 class="modal-title">Импорт вопросов</h2>
      <div class="tp-import-row"><span>Скопируй промпт для AI</span><button class="tp-btn tp-btn--sm" @click="copyPrompt('questions')">Копировать</button></div>
      <textarea v-model="importJson" class="form-input tp-mono" rows="10" placeholder='{"questions":[...]}'></textarea>
      <div v-if="importError" class="tp-err">{{ importError }}</div>
      <button class="tp-submit" @click="doImportQuestions">Импортировать</button>
    </div></div></transition>

    <!-- Exam Setup -->
    <transition name="modal-fade"><div v-if="modal === 'examSetup'" class="modal-overlay" @click.self="modal = null"><div class="modal-card tp-modal tp-modal--wide">
      <button class="modal-close" @click="modal = null">×</button>
      <h2 class="modal-title">{{ examSetup.mode === 'learning' ? 'Настройки тестирования' : 'Настройки экзамена' }}</h2>

      <!-- Topic/Subtopic selection -->
      <div class="tp-fg">
        <label>Темы (выбери нужные, пусто = все)</label>
        <div class="tp-topic-select">
          <div v-for="topic in selectedSuite?.topics" :key="topic.id" class="tp-topic-check">
            <label class="tp-check-label">
              <input type="checkbox" :value="topic.id" v-model="examSetup.topicIds" />
              <span class="tp-check-title">{{ topic.title }}</span>
              <span class="tp-check-count">{{ topic.totalQuestions }} вопр.</span>
            </label>
          </div>
        </div>
      </div>

      <div class="tp-fg"><label>Режим</label>
        <select v-model="examSetup.mode" class="form-input">
          <option value="learning">Тестирование (с подсказками)</option>
          <option value="exam">Экзамен (результат в конце)</option>
        </select>
      </div>
      <div class="tp-fg"><label>Количество вопросов (0 = все)</label><input v-model.number="examSetup.questionCount" type="number" class="form-input" min="0" /></div>
      <div class="tp-fg"><label>Лимит (мин), пусто — без</label><input v-model.number="examSetup.timeLimitMin" type="number" class="form-input" min="1" /></div>
      <div class="tp-fg"><label><input type="checkbox" v-model="examSetup.shuffle" /> Перемешать вопросы</label></div>
      <button class="tp-submit" @click="startExam">{{ examSetup.mode === 'learning' ? 'Начать тестирование' : 'Начать экзамен' }}</button>
    </div></div></transition>

    <!-- Edit Suite -->
    <transition name="modal-fade"><div v-if="modal === 'editSuite'" class="modal-overlay" @click.self="modal = null"><div class="modal-card tp-modal">
      <button class="modal-close" @click="modal = null">×</button>
      <h2 class="modal-title">Редактировать тест</h2>
      <div class="tp-fg"><label>Иконка</label><input v-model="suiteForm.icon" class="form-input" maxlength="4" style="width:60px;font-size:24px;text-align:center" /></div>
      <div class="tp-fg"><label>Название</label><input v-model="suiteForm.title" class="form-input" /></div>
      <div class="tp-fg"><label>Описание</label><textarea v-model="suiteForm.description" class="form-input" rows="2"></textarea></div>
      <div class="tp-fg"><label>Проходной балл (%)</label><input v-model.number="suiteForm.passingScore" type="number" class="form-input" min="1" max="100" /></div>
      <button class="tp-submit" @click="saveEditSuite">Сохранить</button>
    </div></div></transition>

    <!-- Edit Topic -->
    <transition name="modal-fade"><div v-if="modal === 'editTopic'" class="modal-overlay" @click.self="modal = null"><div class="modal-card tp-modal">
      <button class="modal-close" @click="modal = null">×</button>
      <h2 class="modal-title">Редактировать тему</h2>
      <div class="tp-fg"><label>Название</label><input v-model="editTopicForm.title" class="form-input" /></div>
      <div class="tp-fg"><label>Описание</label><textarea v-model="editTopicForm.description" class="form-input" rows="2"></textarea></div>
      <button class="tp-submit" @click="saveEditTopic">Сохранить</button>
    </div></div></transition>

    <!-- Edit Subtopic -->
    <transition name="modal-fade"><div v-if="modal === 'editSubtopic'" class="modal-overlay" @click.self="modal = null"><div class="modal-card tp-modal">
      <button class="modal-close" @click="modal = null">×</button>
      <h2 class="modal-title">Редактировать подтему</h2>
      <div class="tp-fg"><label>Название</label><input v-model="editSubtopicForm.title" class="form-input" /></div>
      <button class="tp-submit" @click="saveEditSubtopic">Сохранить</button>
    </div></div></transition>
  </div>
</template>

<style scoped>
.tp { width: 100vw; height: 100vh; background: #0e1018; color: #e4e8ef; display: flex; flex-direction: column; overflow: hidden; }

.tp-head { display: flex; align-items: center; gap: 14px; padding: 14px 24px; background: rgba(8,10,18,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(100,140,255,0.08); flex-shrink: 0; }
.tp-back { background: rgba(23,103,253,0.1); border: 1px solid rgba(23,103,253,0.25); color: #fff; width: 36px; height: 36px; border-radius: 50%; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.tp-head-title { flex: 1; }
.tp-head-title h1 { font-size: 18px; font-weight: 700; }
.tp-head-actions { display: flex; gap: 6px; flex-shrink: 0; }

.tp-suite-skill-badge { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; padding: 3px 10px 3px 3px; border: 1px solid; border-radius: 8px; font-size: 12px; color: rgba(200,215,255,0.7); }
.tp-suite-skill-icon { width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; }
.tp-suite-grade-tag { background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 4px; font-size: 10px; }

.tp-body { flex: 1; overflow-y: auto; padding: 20px 24px; }

.tp-btn { background: rgba(23,103,253,0.08); border: 1px solid rgba(23,103,253,0.2); color: #6ea8ff; padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.tp-btn:hover { background: rgba(23,103,253,0.15); }
.tp-btn--primary { background: linear-gradient(135deg, #1767fd, #8b5cf6); border: none; color: #fff; }
.tp-btn--danger { color: #ff7b7b; border-color: rgba(248,113,113,0.2); background: rgba(248,113,113,0.06); }
.tp-btn--sm { padding: 4px 10px; font-size: 11px; }
.tp-btn:disabled { opacity: 0.3; }
.tp-rm { background: none; border: none; color: rgba(248,113,113,0.35); font-size: 16px; cursor: pointer; flex-shrink: 0; }
.tp-rm:hover { color: #ff6b6b; }
.tp-rm--sm { font-size: 13px; }

.tp-empty { text-align: center; padding: 60px 20px; }
.tp-empty-icon { font-size: 48px; margin-bottom: 12px; }
.tp-empty h3 { font-size: 18px; color: rgba(200,215,255,0.5); }
.tp-empty p { font-size: 13px; color: rgba(200,215,255,0.3); }
.tp-no-q { font-size: 12px; color: rgba(200,215,255,0.2); font-style: italic; padding: 8px 16px; }

/* Suite list */
.tp-list { display: flex; flex-direction: column; gap: 6px; }
.tp-suite-card { display: flex; align-items: center; gap: 14px; padding: 16px 18px; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; cursor: pointer; transition: all 0.15s; }
.tp-suite-card:hover { border-color: rgba(23,103,253,0.2); }
.tp-suite-icon { font-size: 28px; }
.tp-suite-info { flex: 1; }
.tp-suite-title { font-size: 16px; font-weight: 700; }
.tp-suite-meta { font-size: 12px; color: rgba(200,215,255,0.4); margin-top: 2px; }

/* Detail */
.tp-desc { font-size: 13px; color: rgba(200,215,255,0.5); margin-bottom: 12px; }
.tp-detail-stats { display: flex; gap: 16px; font-size: 13px; color: rgba(200,215,255,0.4); margin-bottom: 16px; }

.tp-topic { margin-bottom: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; overflow: hidden; }
.tp-topic-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; }
.tp-topic-head:hover { background: rgba(255,255,255,0.02); }
.tp-topic-num { width: 26px; height: 26px; border-radius: 50%; background: rgba(23,103,253,0.15); color: #6ea8ff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
.tp-topic-title { flex: 1; font-size: 15px; font-weight: 600; }
.tp-topic-count { font-size: 12px; color: rgba(200,215,255,0.4); }

.tp-subtopics { padding: 0 16px 8px; display: flex; flex-wrap: wrap; gap: 6px; }
.tp-sub { padding: 4px 10px; background: rgba(23,103,253,0.06); border: 1px solid rgba(23,103,253,0.12); border-radius: 6px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px; }
.tp-sub:hover { background: rgba(23,103,253,0.1); }
.tp-sub-n { color: rgba(200,215,255,0.35); }

.tp-topic-body { padding: 4px 16px 12px; }
.tp-topic-actions { display: flex; gap: 6px; margin-bottom: 8px; }

.tp-q-list { display: flex; flex-direction: column; gap: 3px; }
.tp-q { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 8px; background: rgba(255,255,255,0.015); }
.tp-q:hover { background: rgba(255,255,255,0.035); }
.tp-q-diff { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; color: #000; flex-shrink: 0; }
.tp-q-type { font-size: 10px; color: rgba(200,215,255,0.4); flex-shrink: 0; min-width: 60px; }
.tp-q-text { flex: 1; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Exam */
.tp-exam { max-width: 720px; margin: 0 auto; }
.tp-exam-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.tp-exam-counter { font-size: 14px; font-weight: 700; color: rgba(200,215,255,0.6); }
.tp-exam-track { flex: 1; height: 8px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; }
.tp-exam-fill { height: 100%; background: linear-gradient(90deg, #1767fd, #8b5cf6); border-radius: 4px; transition: width 0.3s; }

.tp-exam-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 24px; }
.tp-exam-q-meta { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.tp-exam-q-diff { padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; color: #000; }
.tp-exam-q-type { padding: 3px 10px; background: rgba(255,255,255,0.05); border-radius: 6px; font-size: 11px; color: rgba(200,215,255,0.5); }
.tp-exam-q-tags { font-size: 11px; color: rgba(200,215,255,0.3); }
.tp-exam-q-img { margin-bottom: 14px; border-radius: 10px; overflow: hidden; max-height: 250px; }
.tp-exam-q-img img { width: 100%; display: block; }
.tp-exam-q-text { font-size: 16px; line-height: 1.6; margin-bottom: 18px; color: #f0f3ff; }

.tp-opts { display: flex; flex-direction: column; gap: 8px; }
.tp-opt { text-align: left; padding: 14px 18px; background: rgba(255,255,255,0.03); border: 2px solid rgba(255,255,255,0.08); border-radius: 12px; color: #e0e6f4; font-size: 14px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 10px; }
.tp-opt:hover { border-color: rgba(23,103,253,0.3); }
.tp-opt.sel { border-color: #1767fd; background: rgba(23,103,253,0.1); }
.tp-opt-img { width: 60px; height: 60px; object-fit: cover; border-radius: 8px; }

.tp-text-input { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 12px; color: #fff; font-size: 14px; resize: vertical; outline: none; box-sizing: border-box; }
.tp-text-input.code { font-family: monospace; }
.tp-text-input:focus { border-color: rgba(23,103,253,0.4); }

.tp-explanation { margin-top: 14px; padding: 12px 16px; background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.2); border-radius: 10px; font-size: 13px; color: rgba(200,215,255,0.7); }

.tp-exam-nav { display: flex; justify-content: space-between; margin-top: 20px; }

/* Results */
.tp-results { max-width: 600px; margin: 0 auto; }
.tp-score { text-align: center; padding: 28px; background: rgba(248,113,113,0.06); border: 2px solid rgba(248,113,113,0.2); border-radius: 16px; margin-bottom: 16px; }
.tp-score.pass { background: rgba(74,222,128,0.06); border-color: rgba(74,222,128,0.25); }
.tp-score-pct { font-size: 48px; font-weight: 800; }
.tp-score.pass .tp-score-pct { color: #4ade80; }
.tp-score-detail { font-size: 16px; color: rgba(200,215,255,0.5); }
.tp-score-label { font-size: 14px; font-weight: 700; margin-top: 6px; text-transform: uppercase; letter-spacing: 1px; }
.tp-score.pass .tp-score-label { color: #4ade80; }
.tp-answers-list { display: flex; flex-direction: column; gap: 3px; }
.tp-answer-row { display: flex; align-items: center; gap: 10px; padding: 7px 12px; border-radius: 8px; }
.tp-answer-row.ok { background: rgba(74,222,128,0.04); }
.tp-answer-row.fail { background: rgba(248,113,113,0.04); }
.tp-answer-num { font-size: 12px; color: rgba(200,215,255,0.4); width: 24px; }
.tp-answer-icon { font-size: 16px; }
.tp-answer-row.ok .tp-answer-icon { color: #4ade80; }
.tp-answer-row.fail .tp-answer-icon { color: #f87171; }
.tp-answer-text { flex: 1; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Stats */
.tp-stats { max-width: 600px; margin: 0 auto; }
.tp-stats-cards { display: flex; gap: 12px; margin-bottom: 20px; }
.tp-sc { flex: 1; text-align: center; padding: 16px; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; }
.tp-sc-v { font-size: 28px; font-weight: 800; }
.tp-sc-l { font-size: 12px; color: rgba(200,215,255,0.4); margin-top: 4px; }
.tp-stats-section { margin-bottom: 16px; }
.tp-stats-section h3 { font-size: 14px; font-weight: 700; color: rgba(200,215,255,0.6); margin-bottom: 8px; }
.tp-stats-row { display: flex; align-items: center; gap: 10px; padding: 5px 0; }
.tp-stats-name { width: 140px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tp-stats-bar { flex: 1; height: 8px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; }
.tp-stats-fill { height: 100%; background: linear-gradient(90deg, #1767fd, #8b5cf6); border-radius: 4px; }
.tp-stats-pct { font-size: 13px; font-weight: 600; width: 40px; text-align: right; }

/* Modals */
.tp-modal { max-width: 480px; }
.tp-modal--wide { max-width: 560px; }
.tp-fg { margin-bottom: 12px; }
.tp-fg label { display: block; font-size: 12px; color: rgba(200,215,255,0.5); margin-bottom: 3px; }
.tp-fg-row { display: flex; gap: 12px; }
.tp-fg-row > div { flex: 1; }
.tp-submit { width: 100%; padding: 10px; background: linear-gradient(135deg, #1767fd, #8b5cf6); border: none; border-radius: 8px; color: #fff; font-weight: 600; cursor: pointer; }
.tp-submit:hover { filter: brightness(1.15); }
.tp-mono { font-family: monospace; font-size: 12px; }
.tp-err { color: #f87171; font-size: 12px; margin-top: 4px; }
.tp-import-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.tp-import-row span { font-size: 11px; color: rgba(200,215,255,0.4); }

/* Filter bar */
.tp-filter-bar { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
.tp-filter-btn { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: rgba(200,215,255,0.5); padding: 5px 12px; border-radius: 8px; font-size: 12px; cursor: pointer; }
.tp-filter-btn:hover { background: rgba(255,255,255,0.06); }
.tp-filter-btn.active { background: rgba(23,103,253,0.1); border-color: rgba(23,103,253,0.3); color: #6ea8ff; }

/* Practice result */
.tp-practice-result { margin-top: 16px; padding: 16px 20px; border-radius: 12px; }
.tp-practice-result.correct { background: rgba(74,222,128,0.08); border: 2px solid rgba(74,222,128,0.25); }
.tp-practice-result.wrong { background: rgba(248,113,113,0.08); border: 2px solid rgba(248,113,113,0.25); }
.tp-practice-verdict { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
.tp-practice-result.correct .tp-practice-verdict { color: #4ade80; }
.tp-practice-result.wrong .tp-practice-verdict { color: #f87171; }
.tp-practice-correct { font-size: 13px; color: rgba(200,215,255,0.6); margin-bottom: 6px; }
.tp-practice-explanation { font-size: 13px; color: rgba(200,215,255,0.5); line-height: 1.5; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; margin-top: 6px; }

.tp-history-mode { font-size: 11px; color: rgba(200,215,255,0.3); margin-left: auto; }

/* Topic selection in exam setup */
.tp-topic-select { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding: 4px 0; }
.tp-topic-check { padding: 2px 0; }
.tp-check-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: rgba(200,215,255,0.7); }
.tp-check-label input { accent-color: #1767fd; width: 16px; height: 16px; }
.tp-check-title { flex: 1; }
.tp-check-count { font-size: 11px; color: rgba(200,215,255,0.35); }

/* Question form rows */
.tp-opt-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.tp-opt-num { width: 20px; font-size: 12px; color: rgba(200,215,255,0.4); text-align: center; }
.tp-match-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.tp-match-row span { color: rgba(200,215,255,0.3); }
.tp-match-game { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.tp-order-list { display: flex; flex-direction: column; gap: 8px; }
.tp-order-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: rgba(23,103,253,0.06); border: 1px solid rgba(23,103,253,0.15); border-radius: 8px; }
.tp-order-num { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(23,103,253,0.2); font-size: 12px; font-weight: 600; flex-shrink: 0; }
.tp-order-text { flex: 1; font-size: 13px; }
.tp-order-btns { display: flex; gap: 4px; }
.tp-match-game-row { display: flex; align-items: center; gap: 12px; }
.tp-match-left { flex: 1; padding: 10px 14px; background: rgba(23,103,253,0.06); border: 1px solid rgba(23,103,253,0.15); border-radius: 8px; font-size: 13px; }
.tp-match-select { flex: 1; min-width: 0; }
</style>
