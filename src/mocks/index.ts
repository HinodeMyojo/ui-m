import type {
  SkillGroup,
  Skill,
  SkillPart,
  PetProject,
  SkillsSummary,
  StudySession,
  TaskLink,
} from "../types";

// Группы навыков
export const mockGroups: SkillGroup[] = [
  {
    id: "grp-ms",
    name: "Микросервисы",
    description:
      "Коммуникации, согласованность, паттерны распределенных систем",
  },
  {
    id: "grp-data",
    name: "Данные",
    description: "Хранилища, индексы, оптимизация запросов",
  },
  {
    id: "grp-frontend",
    name: "Frontend",
    description: "Vue, React, современные фреймворки",
  },
];

// Навыки
export const mockSkills: Skill[] = [
  {
    id: "sk-rmq",
    groupId: "grp-ms",
    name: "RabbitMQ",
    goalDescription:
      "Освоить очереди, DLX, publisher confirms для надежной доставки",
    expectedHours: 20,
    spentHours: 6,
    githubLink: "https://github.com/example/rabbitmq-learning",
    tags: ["MessageBroker", "Async", "Microservices"],
    createdAt: "2025-10-15T10:00:00Z",
    updatedAt: "2025-11-06T18:30:00Z",
  },
  {
    id: "sk-kfk",
    groupId: "grp-ms",
    name: "Kafka",
    goalDescription: "Топики, consumer groups, обработка событий, idempotency",
    expectedHours: 24,
    spentHours: 3,
    githubLink: "https://github.com/example/kafka-learning",
    tags: ["MessageBroker", "EventSourcing", "Microservices"],
    createdAt: "2025-10-20T12:00:00Z",
    updatedAt: "2025-11-05T15:00:00Z",
  },
  {
    id: "sk-postgres",
    groupId: "grp-data",
    name: "PostgreSQL Advanced",
    goalDescription: "Индексы, партиционирование, оптимизация сложных запросов",
    expectedHours: 30,
    spentHours: 12,
    githubLink: "",
    tags: ["Database", "SQL", "Performance"],
    createdAt: "2025-09-10T09:00:00Z",
    updatedAt: "2025-11-04T20:00:00Z",
  },
  {
    id: "sk-redis",
    groupId: "grp-data",
    name: "Redis",
    goalDescription: "Кеширование, pub/sub, структуры данных",
    expectedHours: 15,
    spentHours: 8,
    githubLink: "",
    tags: ["Cache", "NoSQL", "Performance"],
    createdAt: "2025-10-01T11:00:00Z",
    updatedAt: "2025-11-02T16:00:00Z",
  },
  {
    id: "sk-vue",
    groupId: "grp-frontend",
    name: "Vue 3 Composition API",
    goalDescription: "Реактивность, composables, TypeScript интеграция",
    expectedHours: 25,
    spentHours: 18,
    githubLink: "https://github.com/example/vue3-learning",
    tags: ["Frontend", "Vue", "TypeScript"],
    createdAt: "2025-08-15T08:00:00Z",
    updatedAt: "2025-11-06T19:00:00Z",
  },
];

// Части навыков
export const mockParts: Record<string, SkillPart[]> = {
  "sk-rmq": [
    {
      id: "p-rmq-1",
      skillId: "sk-rmq",
      title: "Основы RabbitMQ",
      content: "Exchanges, queues, bindings, routing keys",
      status: "done",
      expectedHours: 4,
      spentHours: 4,
    },
    {
      id: "p-rmq-2",
      skillId: "sk-rmq",
      title: "DLX и Retry механизмы",
      content: "Dead Letter Exchange, retry patterns, TTL",
      status: "in-progress",
      expectedHours: 8,
      spentHours: 2,
    },
    {
      id: "p-rmq-3",
      skillId: "sk-rmq",
      title: "Publisher Confirms",
      content: "Гарантии доставки, acknowledgments",
      status: "not-started",
      expectedHours: 8,
      spentHours: 0,
    },
  ],
  "sk-kfk": [
    {
      id: "p-kfk-1",
      skillId: "sk-kfk",
      title: "Основы Kafka",
      content: "Topics, partitions, producers, consumers",
      status: "done",
      expectedHours: 6,
      spentHours: 3,
    },
    {
      id: "p-kfk-2",
      skillId: "sk-kfk",
      title: "Consumer Groups",
      content: "Балансировка нагрузки, rebalancing",
      status: "not-started",
      expectedHours: 6,
      spentHours: 0,
    },
    {
      id: "p-kfk-3",
      skillId: "sk-kfk",
      title: "Idempotency",
      content: "Дедупликация, exactly-once семантика",
      status: "not-started",
      expectedHours: 12,
      spentHours: 0,
    },
  ],
  "sk-postgres": [
    {
      id: "p-pg-1",
      skillId: "sk-postgres",
      title: "Типы индексов",
      content: "B-tree, Hash, GiST, GIN, BRIN",
      status: "done",
      expectedHours: 8,
      spentHours: 8,
    },
    {
      id: "p-pg-2",
      skillId: "sk-postgres",
      title: "Query optimization",
      content: "EXPLAIN, планы выполнения, статистика",
      status: "in-progress",
      expectedHours: 10,
      spentHours: 4,
    },
    {
      id: "p-pg-3",
      skillId: "sk-postgres",
      title: "Партиционирование",
      content: "Range, List, Hash partitioning",
      status: "not-started",
      expectedHours: 12,
      spentHours: 0,
    },
  ],
  "sk-redis": [
    {
      id: "p-rd-1",
      skillId: "sk-redis",
      title: "Структуры данных",
      content: "Strings, Lists, Sets, Hashes, Sorted Sets",
      status: "done",
      expectedHours: 5,
      spentHours: 5,
    },
    {
      id: "p-rd-2",
      skillId: "sk-redis",
      title: "Стратегии кеширования",
      content: "Cache-aside, Write-through, TTL",
      status: "in-progress",
      expectedHours: 5,
      spentHours: 3,
    },
    {
      id: "p-rd-3",
      skillId: "sk-redis",
      title: "Pub/Sub",
      content: "Паттерны подписки, каналы",
      status: "not-started",
      expectedHours: 5,
      spentHours: 0,
    },
  ],
  "sk-vue": [
    {
      id: "p-vue-1",
      skillId: "sk-vue",
      title: "Reactivity System",
      content: "ref, reactive, computed, watch",
      status: "done",
      expectedHours: 8,
      spentHours: 8,
    },
    {
      id: "p-vue-2",
      skillId: "sk-vue",
      title: "Composables",
      content: "Переиспользуемая логика, custom hooks",
      status: "in-progress",
      expectedHours: 10,
      spentHours: 7,
    },
    {
      id: "p-vue-3",
      skillId: "sk-vue",
      title: "TypeScript Integration",
      content: "Типизация компонентов, props, emits",
      status: "in-progress",
      expectedHours: 7,
      spentHours: 3,
    },
  ],
};

// Pet-проекты
export const mockProjects: PetProject[] = [
  {
    id: "pp-retry",
    name: "Message Retry Service",
    description:
      "Микросервис с DLX/Retry механизмом и publisher confirms для RabbitMQ",
    githubLink: "https://github.com/example/retry-service",
    image: "/assets/projects/retry-circuit.svg",
    expectedHours: 12,
    spentHours: 5,
    status: "in-progress",
    createdAt: "2025-10-25T10:00:00Z",
    updatedAt: "2025-11-06T19:30:00Z",
    skills: [mockSkills[0], mockSkills[1]], // RabbitMQ, Kafka
    parts: [
      mockParts["sk-rmq"][1], // DLX/Retry
      mockParts["sk-rmq"][2], // Publisher Confirms
      mockParts["sk-kfk"][0], // Основы Kafka
    ],
    progress: {
      byParts: 33, // 1/3 done
      byTime: 41.7, // 5/12
    },
  },
  {
    id: "pp-cache",
    name: "Smart Cache Layer",
    description: "Продвинутый кеширующий слой с Redis и различными стратегиями",
    githubLink: "https://github.com/example/smart-cache",
    image: "/assets/projects/cache-chip.svg",
    expectedHours: 10,
    spentHours: 7,
    status: "in-progress",
    createdAt: "2025-10-20T14:00:00Z",
    updatedAt: "2025-11-05T17:00:00Z",
    skills: [mockSkills[3]], // Redis
    parts: [
      mockParts["sk-redis"][0], // Структуры данных
      mockParts["sk-redis"][1], // Стратегии кеширования
    ],
    progress: {
      byParts: 75, // 1.5/2
      byTime: 70, // 7/10
    },
  },
  {
    id: "pp-dashboard",
    name: "Analytics Dashboard",
    description: "Интерактивный дашборд с Vue 3 и real-time обновлениями",
    githubLink: "https://github.com/example/analytics-dashboard",
    image: "/assets/projects/dashboard-circuit.svg",
    expectedHours: 20,
    spentHours: 15,
    status: "in-progress",
    createdAt: "2025-09-15T09:00:00Z",
    updatedAt: "2025-11-06T20:00:00Z",
    skills: [mockSkills[4], mockSkills[3]], // Vue, Redis
    parts: [
      mockParts["sk-vue"][0], // Reactivity
      mockParts["sk-vue"][1], // Composables
      mockParts["sk-redis"][2], // Pub/Sub
    ],
    progress: {
      byParts: 66, // 2/3
      byTime: 75, // 15/20
    },
  },
];

// Сессии изучения
export const mockSessions: StudySession[] = [
  {
    id: "sess-1",
    entityType: "part",
    entityId: "p-rmq-2",
    startedAt: "2025-11-06T18:00:00Z",
    durationMin: 90,
    note: "Изучал DLX механизмы",
  },
  {
    id: "sess-2",
    entityType: "project",
    entityId: "pp-retry",
    startedAt: "2025-11-06T10:00:00Z",
    durationMin: 120,
    note: "Реализация retry logic",
  },
  {
    id: "sess-3",
    entityType: "skill",
    entityId: "sk-vue",
    startedAt: "2025-11-05T19:00:00Z",
    durationMin: 60,
    note: "Практика composables",
  },
];

// Суммарная информация
export const mockSummary: SkillsSummary = {
  totalHours: 47, // сумма всех spentHours
  todayHours: 3.5, // сегодня
  monthHours: 18, // за ноябрь
  progressPercent: 42, // общий прогресс
  topSkills: [
    { skillId: "sk-vue", name: "Vue 3 Composition API", hours: 18 },
    { skillId: "sk-postgres", name: "PostgreSQL Advanced", hours: 12 },
    { skillId: "sk-redis", name: "Redis", hours: 8 },
  ],
};

// Вспомогательные функции для работы с моками
export function getAllParts(): SkillPart[] {
  return Object.values(mockParts).flat();
}

export function getPartsBySkillId(skillId: string): SkillPart[] {
  return mockParts[skillId] || [];
}

export function getSkillById(id: string): Skill | undefined {
  return mockSkills.find((s) => s.id === id);
}

export function getProjectById(id: string): PetProject | undefined {
  return mockProjects.find((p) => p.id === id);
}

export function calculateSkillProgress(skillId: string): number {
  const parts = getPartsBySkillId(skillId);
  if (parts.length === 0) return 0;

  const statusWeights = {
    "not-started": 0,
    "in-progress": 0.5,
    done: 1,
  };

  const totalWeight = parts.reduce(
    (sum, part) => sum + statusWeights[part.status],
    0
  );
  return Math.round((totalWeight / parts.length) * 100);
}

// Добавляем прогресс к навыкам
export function getSkillsWithProgress(): Skill[] {
  return mockSkills.map((skill) => ({
    ...skill,
    progress: calculateSkillProgress(skill.id),
  }));
}
