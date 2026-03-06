// Типы для редактора диаграмм

export type NodeType =
  | "service"      // Микросервис / сервис
  | "database"     // База данных
  | "queue"        // Очередь / брокер сообщений
  | "client"       // Клиент / браузер
  | "gateway"      // API Gateway
  | "cache"        // Кэш (Redis и т.п.)
  | "storage"      // Файловое хранилище
  | "external"     // Внешняя система
  | "group"        // Группа / зона (кластер, сеть)
  | "note"         // Заметка / аннотация
  | "process"      // Процесс / функция
  | "decision";    // Решение / условие (ромб)

export type EdgeType =
  | "arrow"        // Обычная стрелка
  | "dashed"       // Пунктирная (зависимость)
  | "bidirectional" // Двунаправленная
  | "thick";       // Толстая (высокий трафик)

export type NodeStatus =
  | "active"
  | "deprecated"
  | "planned"
  | "failed";

export interface DiagramNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  description?: string;
  technology?: string;   // "Go", "PostgreSQL", "Redis", etc.
  status?: NodeStatus;
  color?: string;        // кастомный цвет (если не по умолчанию)
  icon?: string;         // emoji или built-in icon key
  tags?: string[];
  meta?: Record<string, string>; // доп. поля: url, version, owner...
  groupId?: string;      // если внутри группы
  zIndex?: number;
}

export interface DiagramEdge {
  id: string;
  fromId: string;
  toId: string;
  type: EdgeType;
  label?: string;
  description?: string;
  protocol?: string;     // "HTTP", "gRPC", "AMQP", etc.
  color?: string;
}

export interface DiagramViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Diagram {
  id: string;
  name: string;
  description?: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  viewport: DiagramViewport;
  createdAt: string;
  updatedAt: string;
}

// API request types
export interface CreateDiagramRequest {
  name: string;
  description?: string;
}

export interface UpdateDiagramRequest {
  name?: string;
  description?: string;
  nodes?: DiagramNode[];
  edges?: DiagramEdge[];
  viewport?: DiagramViewport;
}
