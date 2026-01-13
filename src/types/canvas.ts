// Типы для Canvas редактора схем

export type CanvasToolType =
  | "select"
  | "draw"
  | "rectangle"
  | "circle"
  | "arrow"
  | "line"
  | "text"
  | "sticky"
  | "block"
  | "headerBlock";

export type LinkedEntityType = "task" | "skill" | "project" | "part";

// Типы точек соединения
export type ConnectionPointPosition = "top" | "right" | "bottom" | "left";

export interface ConnectionPoint {
  position: ConnectionPointPosition;
  x: number;
  y: number;
}

// Соединение между блоками
export interface BlockConnection {
  id: string;
  fromBlockId: string;
  fromPoint: ConnectionPointPosition;
  toBlockId: string;
  toPoint: ConnectionPointPosition;
  label?: string;
  arrowId: string;
}

export interface CanvasElement {
  id: string;
  type: string;
  left: number;
  top: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  // Связь с задачей/навыком/проектом
  linkedEntityId?: string;
  linkedEntityType?: LinkedEntityType;
  linkedEntityName?: string;
  // Блок-специфичные свойства
  isBlock?: boolean;
  isHeaderBlock?: boolean;
  headerText?: string;
  bodyText?: string;
  // Коннектор/стрелка свойства
  isConnector?: boolean;
  connectedFromId?: string;
  connectedFromPoint?: ConnectionPointPosition;
  connectedToId?: string;
  connectedToPoint?: ConnectionPointPosition;
  connectorLabel?: string;
  // Fabric.js сериализация
  fabricData: string;
}

export interface Canvas {
  id: string;
  name: string;
  description?: string;
  elements: CanvasElement[];
  thumbnail?: string;
  zoom: number;
  panX: number;
  panY: number;
  backgroundColor?: string;
  createdAt: string;
  updatedAt: string;
}

// API Request types
export interface CreateCanvasRequest {
  name: string;
  description?: string;
}

export interface UpdateCanvasRequest {
  name?: string;
  description?: string;
  elements?: CanvasElement[];
  thumbnail?: string;
  zoom?: number;
  panX?: number;
  panY?: number;
  backgroundColor?: string;
}

// Цветовая палитра для инструментов
export const CANVAS_COLORS = [
  "#ffffff",
  "#f87171", // red
  "#fb923c", // orange
  "#fbbf24", // amber
  "#a3e635", // lime
  "#4ade80", // green
  "#2dd4bf", // teal
  "#22d3ee", // cyan
  "#60a5fa", // blue
  "#818cf8", // indigo
  "#a78bfa", // violet
  "#e879f9", // fuchsia
  "#fb7185", // rose
] as const;

// Размеры кисти
export const BRUSH_SIZES = [2, 4, 6, 8, 12, 16, 24] as const;

// Стикеры цвета
export const STICKY_COLORS = [
  "#fef08a", // yellow
  "#bbf7d0", // green
  "#bfdbfe", // blue
  "#fbcfe8", // pink
  "#fed7aa", // orange
  "#e9d5ff", // purple
] as const;
