// Формат опроса и всё, что про него знают и редактор, и прохождение.
// Сервер разбирает то же самое терпимее (синонимы типов, варианты строками),
// здесь — уже нормализованный вид, который он возвращает.

export const QUESTION_TYPES = [
  { value: "single", label: "Один ответ", icon: "◉" },
  { value: "multi", label: "Несколько", icon: "☑" },
  { value: "text", label: "Свой текст", icon: "✎" },
  { value: "scale", label: "Шкала", icon: "▁▃▅" },
];

// plural(5, "вопрос", "вопроса", "вопросов") → "5 вопросов".
export function plural(n, one, few, many) {
  const tail = n % 100;
  const last = n % 10;
  let word = many;
  if (tail < 11 || tail > 14) {
    if (last === 1) word = one;
    else if (last >= 2 && last <= 4) word = few;
  }
  return `${n} ${word}`;
}

export function typeLabel(type) {
  return QUESTION_TYPES.find((t) => t.value === type)?.label || type;
}

// Все вопросы подряд, с разделом и сквозным номером — так их видит отвечающий.
export function flatQuestions(definition) {
  const list = [];
  for (const section of definition?.sections || []) {
    for (const question of section.questions || []) {
      list.push({ question, section, number: list.length + 1 });
    }
  }
  return list;
}

export function isAnswered(answer) {
  if (!answer) return false;
  return (
    (answer.options && answer.options.length > 0) ||
    !!(answer.other && answer.other.trim()) ||
    !!(answer.text && answer.text.trim()) ||
    answer.value !== undefined && answer.value !== null
  );
}

export function scaleRange(question) {
  const min = question.min ?? 1;
  const max = question.max ?? 10;
  const list = [];
  for (let v = min; v <= max; v++) list.push(v);
  return list;
}

// Новые элементы конструктора. id не ставим: его выдаст сервер при сохранении.
export function blankQuestion(type = "single") {
  const q = { type, text: "" };
  if (type === "single" || type === "multi") q.options = [{ text: "" }, { text: "" }];
  if (type === "scale") Object.assign(q, { min: 1, max: 10 });
  return q;
}

export function blankSection() {
  return { title: "", questions: [blankQuestion()] };
}

export const EXAMPLE_SURVEY = {
  title: "Узнаём друг друга",
  description: "Отвечай как есть — правильных ответов нет 🙂",
  thanks: "Спасибо! Посмотрю ответы вечером 💌",
  sections: [
    {
      title: "Еда",
      questions: [
        {
          type: "single",
          text: "Идеальный ужин — это…",
          options: ["Паста", "Суши", "Бургер", "Что-то домашнее"],
          allowOther: true,
        },
        {
          type: "multi",
          text: "Что точно возьмём в кино?",
          options: ["Попкорн сладкий", "Попкорн солёный", "Начос", "Ничего"],
          maxChoices: 2,
        },
      ],
    },
    {
      title: "Отдых",
      questions: [
        {
          type: "scale",
          text: "Насколько хочется на море прямо сейчас?",
          min: 1,
          max: 10,
          minLabel: "совсем нет",
          maxLabel: "уже собираю чемодан",
        },
        {
          type: "text",
          text: "Опиши идеальные выходные",
          hint: "Можно в двух словах",
        },
      ],
    },
  ],
};

// Инструкция, которую копируют в ИИ вместе с надиктованным текстом.
export const AI_INSTRUCTION = `Собери из моего текста опрос в JSON строго такого формата (только JSON, без пояснений):

{
  "title": "Название опроса",
  "description": "Короткое вступление (необязательно)",
  "thanks": "Что показать после отправки (необязательно)",
  "sections": [
    {
      "title": "Название категории",
      "questions": [
        { "type": "single", "text": "Вопрос с одним ответом", "options": ["Вариант 1", "Вариант 2"], "allowOther": true },
        { "type": "multi", "text": "Вопрос с несколькими ответами", "options": ["А", "Б", "В"], "minChoices": 1, "maxChoices": 2 },
        { "type": "text", "text": "Вопрос со свободным ответом", "hint": "Подсказка под вопросом" },
        { "type": "scale", "text": "Оцени от 1 до 10", "min": 1, "max": 10, "minLabel": "плохо", "maxLabel": "отлично" }
      ]
    }
  ]
}

Правила:
- type: single — один вариант; multi — несколько; text — свой текст; scale — число на шкале.
- "allowOther": true добавляет вариант «Свой вариант» с полем для текста.
- "required": true — без ответа на вопрос опрос не отправить. По умолчанию вопросы необязательные.
- Если категорий нет, вместо "sections" можно дать просто "questions": [...].
- Картинки я добавлю сам, поле "image" не заполняй.
- Если я говорю «можно выбрать несколько» — это multi, «свой вариант» / «другое» — allowOther.

Мой текст:
`;
