<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Canvas as FabricCanvas,
  Rect,
  Circle,
  Line,
  IText,
  Path,
  PencilBrush,
  Polyline,
  Group,
  ActiveSelection,
  Control,
  Point,
  util as fabricUtil,
} from "fabric";
import { useCanvasStore } from "../../stores/canvas";
import type { CanvasToolType, CanvasElement, ConnectionPointPosition } from "../../types/canvas";
import { CANVAS_COLORS, BRUSH_SIZES, STICKY_COLORS } from "../../types/canvas";
import CanvasToolbar from "./CanvasToolbar.vue";
import TaskLinkModal from "./TaskLinkModal.vue";

const route = useRoute();
const router = useRouter();
const canvasStore = useCanvasStore();

const canvasEl = ref<HTMLCanvasElement | null>(null);
const containerEl = ref<HTMLDivElement | null>(null);
let fabricCanvas: FabricCanvas | null = null;

// State
const currentTool = ref<CanvasToolType>("select");
const currentColor = ref("#ffffff");
const currentStrokeWidth = ref(2);
const currentStickyColor = ref(STICKY_COLORS[0]);
const zoom = ref(1);
const canvasName = ref("");
const isSaving = ref(false);
const hasUnsavedChanges = ref(false);
const showTaskLinkModal = ref(false);
const selectedObjectId = ref<string | null>(null);
const isFullscreen = ref(false);
const isShiftPressed = ref(false);

// Undo/Redo history
const undoStack = ref<string[]>([]);
const redoStack = ref<string[]>([]);
const maxHistorySize = 50;

// Block connections tracking
interface BlockConnection {
  id: string;
  fromBlockId: string;
  fromPoint: ConnectionPointPosition;
  toBlockId: string;
  toPoint: ConnectionPointPosition;
  arrowId: string;
  labelId?: string;
}

// Block-text relationship tracking
interface BlockTextLink {
  blockId: string;
  rectId: string;
  headerTextId?: string;
  bodyTextId: string;
  headerBgId?: string;
  isHeaderBlock: boolean;
}

const connections = ref<BlockConnection[]>([]);
const blockTextLinks = ref<BlockTextLink[]>([]);

// Arrow/Connector state
const isDrawingArrow = ref(false);
const arrowStartPoint = ref<{ x: number; y: number } | null>(null);
const arrowStartBlock = ref<{ block: any; point: ConnectionPointPosition } | null>(null);
const tempArrowLine = ref<any>(null);
const connectionPointCircles = ref<any[]>([]);
const hoveredBlockId = ref<string | null>(null);

// Drag-to-create block state
const isDraggingBlock = ref(false);
const blockDragStart = ref<{ x: number; y: number } | null>(null);
const tempBlockRect = ref<any>(null);

// Flag to prevent showing connection points during object movement
const isMovingObject = ref(false);

// Context menu
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
});
const showColorMenu = ref(false);

const canvasId = computed(() => route.params.id as string);
const canUndo = computed(() => undoStack.value.length > 0);
const canRedo = computed(() => redoStack.value.length > 0);

// Block colors
const BLOCK_COLORS = {
  default: { bg: "rgba(255, 255, 255, 0.05)", border: "#6366f1" },
  header: { bg: "rgba(99, 102, 241, 0.15)", border: "#6366f1", headerBg: "#6366f1" },
};

// Initialize canvas
onMounted(async () => {
  await loadCanvas();
  initFabricCanvas();
  window.addEventListener("resize", handleResize);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  document.addEventListener("click", hideContextMenu);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
  document.removeEventListener("click", hideContextMenu);
  if (fabricCanvas) {
    fabricCanvas.dispose();
  }
});

// Watch for tool changes to update block selectability
watch(currentTool, (newTool) => {
  if (!fabricCanvas) return;

  const objects = fabricCanvas.getObjects();
  objects.forEach((obj: any) => {
    if (obj.isBlockRect) {
      // In arrow mode, blocks should not be selectable to allow clicking connection points
      // In select mode, blocks should be selectable for moving/resizing
      obj.set("selectable", newTool === "select");
      obj.set("evented", true); // Always keep evented true for hover events
    }
  });
  fabricCanvas.renderAll();
});

async function loadCanvas() {
  try {
    const canvas = await canvasStore.fetchCanvas(canvasId.value);
    canvasName.value = canvas.name;
    zoom.value = canvas.zoom || 1;
  } catch (e) {
    console.error("Failed to load canvas:", e);
    router.push("/canvas");
  }
}

function initFabricCanvas() {
  if (!canvasEl.value || !containerEl.value) return;

  const { width, height } = containerEl.value.getBoundingClientRect();

  fabricCanvas = new FabricCanvas(canvasEl.value, {
    width,
    height,
    backgroundColor: "#1a1b26",
    selection: true,
    preserveObjectStacking: true,
  });

  // Load existing elements
  const canvas = canvasStore.currentCanvas;
  if (canvas?.elements) {
    loadElements(canvas.elements);
  }

  // Event listeners
  fabricCanvas.on("object:modified", onObjectModified);
  fabricCanvas.on("object:moving", onObjectMoving);
  fabricCanvas.on("object:scaling", onObjectScaling);
  fabricCanvas.on("mouse:down", onMouseDown);
  fabricCanvas.on("mouse:move", onMouseMove);
  fabricCanvas.on("mouse:up", onMouseUp);
  fabricCanvas.on("mouse:dblclick", onDoubleClick);
  fabricCanvas.on("path:created", onPathCreated);
  fabricCanvas.on("selection:created", onSelectionChanged);
  fabricCanvas.on("selection:updated", onSelectionChanged);
  fabricCanvas.on("selection:cleared", onSelectionCleared);

  // Save history before transformations start
  fabricCanvas.on("before:transform", () => {
    saveToHistory();
  });

  // Right click handler
  fabricCanvas.on("mouse:down", (e) => {
    if (e.e.button === 2) {
      e.e.preventDefault();
      showContextMenuAt(e.e.clientX, e.e.clientY);
    }
  });

  canvasEl.value?.addEventListener("contextmenu", (e) => e.preventDefault());

  // Save initial state for undo
  saveToHistory();
  updateToolMode();
}

function loadElements(elements: CanvasElement[]) {
  if (!fabricCanvas) return;

  elements.forEach((el) => {
    try {
      if (el.fabricData) {
        const parsed = JSON.parse(el.fabricData);

        // Recreate blocks from saved data
        if (el.isBlock) {
          if (el.isHeaderBlock) {
            createHeaderBlock(
              parsed.left || el.left || 100,
              parsed.top || el.top || 100,
              parsed.width || 200,
              parsed.height || 100,
              el.headerText || "Заголовок",
              el.bodyText || "Текст",
              el.id
            );
          } else {
            createSimpleBlock(
              parsed.left || el.left || 100,
              parsed.top || el.top || 100,
              parsed.width || 160,
              parsed.height || 80,
              el.bodyText || "Блок",
              el.id
            );
          }
          return;
        }

        let obj: any = null;

        if (parsed.type === "rect") {
          obj = new Rect(parsed);
        } else if (parsed.type === "circle") {
          obj = new Circle(parsed);
        } else if (parsed.type === "line") {
          obj = new Line([parsed.x1, parsed.y1, parsed.x2, parsed.y2], parsed);
        } else if (parsed.type === "i-text" || parsed.type === "text") {
          obj = new IText(parsed.text || "", parsed);
        } else if (parsed.type === "path") {
          obj = new Path(parsed.path, parsed);
        } else if (parsed.type === "polyline") {
          obj = new Polyline(parsed.points, parsed);
        }

        if (obj) {
          obj.set("id", el.id);
          obj.set("linkedEntityId", el.linkedEntityId);
          obj.set("linkedEntityType", el.linkedEntityType);
          obj.set("linkedEntityName", el.linkedEntityName);
          obj.set("isConnector", el.isConnector);
          obj.set("connectedFromId", el.connectedFromId);
          obj.set("connectedToId", el.connectedToId);
          obj.set("isLocked", (parsed as any).isLocked);

          // Setup arrow controls if this is an arrow (polyline with isArrow or isConnector flag)
          if (parsed.type === "polyline" && el.isConnector) {
            obj.set("isArrow", true);
            setupArrowControls(obj as Polyline);
          }

          fabricCanvas?.add(obj);
        }
      }
    } catch (e) {
      console.error("Failed to load element:", e);
    }
  });

  fabricCanvas?.renderAll();
}

function handleResize() {
  if (!fabricCanvas || !containerEl.value) return;
  const { width, height } = containerEl.value.getBoundingClientRect();
  fabricCanvas.setDimensions({ width, height });
  fabricCanvas.renderAll();
}

function handleKeyDown(e: KeyboardEvent) {
  if (!fabricCanvas) return;

  // Track Shift key for straight lines
  if (e.key === "Shift") {
    isShiftPressed.value = true;
  }

  // Ignore if typing in text
  const activeObj = fabricCanvas.getActiveObject();
  if (activeObj && activeObj.type === "i-text" && (activeObj as IText).isEditing) {
    return;
  }

  // Delete selected objects
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    deleteSelected();
  }

  // Ctrl+Z - Undo
  if (e.ctrlKey && !e.shiftKey && e.key === "z") {
    e.preventDefault();
    undo();
  }

  // Ctrl+Shift+Z or Ctrl+Y - Redo
  if ((e.ctrlKey && e.shiftKey && e.key === "Z") || (e.ctrlKey && e.key === "y")) {
    e.preventDefault();
    redo();
  }

  // Ctrl+S to save
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    saveCanvas();
  }

  // Ctrl+D - Duplicate
  if (e.ctrlKey && e.key === "d") {
    e.preventDefault();
    duplicateSelected();
  }

  // Ctrl+G - Group
  if (e.ctrlKey && !e.shiftKey && e.key === "g") {
    e.preventDefault();
    groupSelected();
  }

  // Ctrl+Shift+G - Ungroup
  if (e.ctrlKey && e.shiftKey && e.key === "G") {
    e.preventDefault();
    ungroupSelected();
  }

  // F11 - Fullscreen
  if (e.key === "F11") {
    e.preventDefault();
    toggleFullscreen();
  }

  // Escape
  if (e.key === "Escape") {
    cancelCurrentOperation();
  }

  // Tool shortcuts
  if (e.key === "v") currentTool.value = "select";
  if (e.key === "b") currentTool.value = "block";
  if (e.key === "h" && !e.ctrlKey) currentTool.value = "headerBlock";
  if (e.key === "p") currentTool.value = "draw";
  if (e.key === "r") currentTool.value = "rectangle";
  if (e.key === "c" && !e.ctrlKey) currentTool.value = "circle";
  if (e.key === "l") currentTool.value = "line";
  if (e.key === "a" && !e.ctrlKey) currentTool.value = "arrow";
  if (e.key === "t" && !e.ctrlKey) currentTool.value = "text";
  if (e.key === "s" && !e.ctrlKey) currentTool.value = "sticky";
}

function handleKeyUp(e: KeyboardEvent) {
  if (e.key === "Shift") {
    isShiftPressed.value = false;
  }
}

function cancelCurrentOperation() {
  if (isDrawingArrow.value) {
    cancelArrowDrawing();
  } else if (isDraggingBlock.value) {
    cancelBlockDragging();
  } else if (isFullscreen.value) {
    exitFullscreen();
  } else {
    fabricCanvas?.discardActiveObject();
    fabricCanvas?.renderAll();
    hideContextMenu();
  }
  clearConnectionPoints();
}

// ========== SMART BLOCKS (Separate Objects) ==========

function createSimpleBlock(
  x: number,
  y: number,
  width: number = 160,
  height: number = 80,
  text: string = "Блок",
  existingId?: string
): string {
  if (!fabricCanvas) return "";

  const id = existingId || generateId();
  const rectId = `${id}-rect`;
  const textId = `${id}-text`;

  // Background rectangle
  const rect = new Rect({
    left: x,
    top: y,
    width: width,
    height: height,
    fill: BLOCK_COLORS.default.bg,
    stroke: BLOCK_COLORS.default.border,
    strokeWidth: 2,
    rx: 10,
    ry: 10,
    selectable: currentTool.value === "select",
    evented: true,
  });
  rect.set("id", rectId);
  rect.set("isBlockRect", true);
  rect.set("blockId", id);

  // Text (centered, doesn't scale with block)
  const textObj = new IText(text, {
    left: x + width / 2,
    top: y + height / 2,
    fontSize: 16,
    fill: "#ffffff",
    fontFamily: "Inter, sans-serif",
    textAlign: "center",
    originX: "center",
    originY: "center",
    selectable: true,
    evented: true,
    hasControls: false,
    hasBorders: false,
    lockMovementX: true,
    lockMovementY: true,
  });
  textObj.set("id", textId);
  textObj.set("isBlockText", true);
  textObj.set("blockId", id);

  fabricCanvas.add(rect);
  fabricCanvas.add(textObj);

  // Track block-text relationship
  blockTextLinks.value.push({
    blockId: id,
    rectId: rectId,
    bodyTextId: textId,
    isHeaderBlock: false,
  });

  fabricCanvas.renderAll();
  markUnsaved();

  return id;
}

function createHeaderBlock(
  x: number,
  y: number,
  width: number = 200,
  height: number = 100,
  headerText: string = "Заголовок",
  bodyText: string = "Содержимое",
  existingId?: string
): string {
  if (!fabricCanvas) return "";

  const id = existingId || generateId();
  const rectId = `${id}-rect`;
  const headerBgId = `${id}-headerBg`;
  const headerTextId = `${id}-headerText`;
  const bodyTextId = `${id}-bodyText`;
  const headerHeight = 32;

  // Main background
  const rect = new Rect({
    left: x,
    top: y,
    width: width,
    height: height,
    fill: BLOCK_COLORS.header.bg,
    stroke: BLOCK_COLORS.header.border,
    strokeWidth: 2,
    rx: 10,
    ry: 10,
    selectable: currentTool.value === "select",
    evented: true,
  });
  rect.set("id", rectId);
  rect.set("isBlockRect", true);
  rect.set("isHeaderBlock", true);
  rect.set("blockId", id);

  // Header background
  const headerBg = new Rect({
    left: x + 2,
    top: y + 2,
    width: width - 4,
    height: headerHeight,
    fill: BLOCK_COLORS.header.headerBg,
    rx: 8,
    ry: 8,
    selectable: false,
    evented: false,
  });
  headerBg.set("id", headerBgId);
  headerBg.set("isBlockHeaderBg", true);
  headerBg.set("blockId", id);

  // Header text
  const headerTextObj = new IText(headerText, {
    left: x + width / 2,
    top: y + headerHeight / 2 + 2,
    fontSize: 14,
    fontWeight: "600",
    fill: "#ffffff",
    fontFamily: "Inter, sans-serif",
    originX: "center",
    originY: "center",
    selectable: true,
    evented: true,
    hasControls: false,
    hasBorders: false,
    lockMovementX: true,
    lockMovementY: true,
  });
  headerTextObj.set("id", headerTextId);
  headerTextObj.set("isBlockText", true);
  headerTextObj.set("isBlockHeaderText", true);
  headerTextObj.set("blockId", id);

  // Body text
  const bodyTextObj = new IText(bodyText, {
    left: x + width / 2,
    top: y + headerHeight + (height - headerHeight) / 2,
    fontSize: 14,
    fill: "rgba(255,255,255,0.8)",
    fontFamily: "Inter, sans-serif",
    originX: "center",
    originY: "center",
    selectable: true,
    evented: true,
    hasControls: false,
    hasBorders: false,
    lockMovementX: true,
    lockMovementY: true,
  });
  bodyTextObj.set("id", bodyTextId);
  bodyTextObj.set("isBlockText", true);
  bodyTextObj.set("blockId", id);

  fabricCanvas.add(rect);
  fabricCanvas.add(headerBg);
  fabricCanvas.add(headerTextObj);
  fabricCanvas.add(bodyTextObj);

  // Track block-text relationship
  blockTextLinks.value.push({
    blockId: id,
    rectId: rectId,
    headerBgId: headerBgId,
    headerTextId: headerTextId,
    bodyTextId: bodyTextId,
    isHeaderBlock: true,
  });

  fabricCanvas.renderAll();
  markUnsaved();

  return id;
}

// Update text positions when block rect is moved/resized
function updateBlockTextPositions(rectObj: any) {
  if (!fabricCanvas || !rectObj?.blockId) return;

  const link = blockTextLinks.value.find(l => l.rectId === rectObj.id);
  if (!link) return;

  const x = rectObj.left;
  const y = rectObj.top;
  const width = rectObj.width * (rectObj.scaleX || 1);
  const height = rectObj.height * (rectObj.scaleY || 1);

  if (link.isHeaderBlock) {
    const headerHeight = 32;

    // Update header background
    const headerBg = fabricCanvas.getObjects().find((o: any) => o.id === link.headerBgId);
    if (headerBg) {
      headerBg.set({
        left: x + 2,
        top: y + 2,
        width: width - 4,
      });
    }

    // Update header text
    const headerText = fabricCanvas.getObjects().find((o: any) => o.id === link.headerTextId);
    if (headerText) {
      headerText.set({
        left: x + width / 2,
        top: y + headerHeight / 2 + 2,
      });
    }

    // Update body text
    const bodyText = fabricCanvas.getObjects().find((o: any) => o.id === link.bodyTextId);
    if (bodyText) {
      bodyText.set({
        left: x + width / 2,
        top: y + headerHeight + (height - headerHeight) / 2,
      });
    }
  } else {
    // Simple block - just center the text
    const bodyText = fabricCanvas.getObjects().find((o: any) => o.id === link.bodyTextId);
    if (bodyText) {
      bodyText.set({
        left: x + width / 2,
        top: y + height / 2,
      });
    }
  }

  fabricCanvas.renderAll();
}

// ========== CONNECTION POINTS ==========

function getBlockConnectionPoints(blockId: string): { position: ConnectionPointPosition; x: number; y: number }[] {
  if (!fabricCanvas) return [];

  const link = blockTextLinks.value.find(l => l.blockId === blockId);
  if (!link) return [];

  const rect = fabricCanvas.getObjects().find((o: any) => o.id === link.rectId);
  if (!rect) return [];

  const left = rect.left || 0;
  const top = rect.top || 0;
  const width = (rect.width || 160) * (rect.scaleX || 1);
  const height = (rect.height || 80) * (rect.scaleY || 1);

  return [
    { position: "top", x: left + width / 2, y: top },
    { position: "right", x: left + width, y: top + height / 2 },
    { position: "bottom", x: left + width / 2, y: top + height },
    { position: "left", x: left, y: top + height / 2 },
  ];
}

function showBlockConnectionPoints(blockId: string) {
  if (!fabricCanvas) return;

  // Don't show again if already showing for this block
  if (hoveredBlockId.value === blockId && connectionPointCircles.value.length === 4) {
    // Verify circles still exist on canvas
    const allExist = connectionPointCircles.value.every(c => fabricCanvas?.getObjects().includes(c));

    if (allExist) {
      // Update positions of existing points
      const points = getBlockConnectionPoints(blockId);
      connectionPointCircles.value.forEach((circle, i) => {
        if (points[i]) {
          circle.set({
            left: points[i].x - 8,
            top: points[i].y - 8,
          });
        }
      });
      fabricCanvas.renderAll();
      return;
    } else {
      // Circles were removed, clear and recreate
      connectionPointCircles.value = [];
    }
  }

  clearConnectionPoints();
  hoveredBlockId.value = blockId;

  const points = getBlockConnectionPoints(blockId);

  points.forEach((p) => {
    const circle = new Circle({
      left: p.x - 8,
      top: p.y - 8,
      radius: 8,
      fill: "#6366f1",
      stroke: "#ffffff",
      strokeWidth: 2,
      selectable: false,
      evented: true,
      hoverCursor: "crosshair",
    });
    circle.set("isConnectionPoint", true);
    circle.set("connectionPosition", p.position);
    circle.set("parentBlockId", blockId);
    connectionPointCircles.value.push(circle);
    fabricCanvas?.add(circle);
  });

  fabricCanvas.renderAll();
}

function clearConnectionPoints() {
  if (!fabricCanvas) return;

  // Remove from array
  connectionPointCircles.value.forEach((c) => {
    fabricCanvas?.remove(c);
  });
  connectionPointCircles.value = [];

  // Force cleanup: remove ALL connection point objects from canvas
  const allObjects = fabricCanvas.getObjects();
  allObjects.forEach((obj: any) => {
    if (obj.isConnectionPoint) {
      fabricCanvas?.remove(obj);
    }
  });

  hoveredBlockId.value = null;
  fabricCanvas?.renderAll();
}

function findNearestConnectionPoint(x: number, y: number, excludeBlockId?: string): { blockId: string; point: ConnectionPointPosition; x: number; y: number } | null {
  let nearest: { blockId: string; point: ConnectionPointPosition; x: number; y: number; distance: number } | null = null;

  blockTextLinks.value.forEach((link) => {
    if (link.blockId === excludeBlockId) return;

    const points = getBlockConnectionPoints(link.blockId);
    points.forEach((p) => {
      const distance = Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2));
      if (distance < 30 && (!nearest || distance < nearest.distance)) {
        nearest = { blockId: link.blockId, point: p.position, x: p.x, y: p.y, distance };
      }
    });
  });

  return nearest ? { blockId: nearest.blockId, point: nearest.point, x: nearest.x, y: nearest.y } : null;
}

// ========== UNIFIED ARROW TOOL ==========

function startArrowDrawing(x: number, y: number) {
  if (!fabricCanvas) return;

  isDrawingArrow.value = true;
  arrowStartPoint.value = { x, y };

  // Check if starting from a block connection point
  const nearPoint = findNearestConnectionPoint(x, y);
  if (nearPoint) {
    arrowStartBlock.value = {
      block: { id: nearPoint.blockId },
      point: nearPoint.point,
    };
    arrowStartPoint.value = { x: nearPoint.x, y: nearPoint.y };
  }

  // Create temporary arrow line
  tempArrowLine.value = new Polyline(
    [{ x: arrowStartPoint.value.x, y: arrowStartPoint.value.y }],
    {
      stroke: currentColor.value,
      strokeWidth: currentStrokeWidth.value,
      fill: "transparent",
      selectable: false,
      evented: false,
    }
  );
  fabricCanvas.add(tempArrowLine.value);
}

function updateArrowDrawing(x: number, y: number) {
  if (!tempArrowLine.value || !arrowStartPoint.value || !fabricCanvas) return;

  let endX = x;
  let endY = y;

  // Check for snap to connection point
  const nearPoint = findNearestConnectionPoint(x, y, arrowStartBlock.value?.block?.id);
  if (nearPoint) {
    endX = nearPoint.x;
    endY = nearPoint.y;
    showBlockConnectionPoints(nearPoint.blockId);
  } else {
    clearConnectionPoints();
  }

  // Shift constraint for straight lines
  if (isShiftPressed.value) {
    const dx = endX - arrowStartPoint.value.x;
    const dy = endY - arrowStartPoint.value.y;
    const angle = Math.atan2(dy, dx);
    const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const distance = Math.sqrt(dx * dx + dy * dy);
    endX = arrowStartPoint.value.x + distance * Math.cos(snappedAngle);
    endY = arrowStartPoint.value.y + distance * Math.sin(snappedAngle);
  }

  // Update arrow with arrowhead
  const startX = arrowStartPoint.value.x;
  const startY = arrowStartPoint.value.y;
  const angle = Math.atan2(endY - startY, endX - startX);
  const headLength = 12;

  const arrowPoints = [
    { x: startX, y: startY },
    { x: endX, y: endY },
    { x: endX - headLength * Math.cos(angle - Math.PI / 6), y: endY - headLength * Math.sin(angle - Math.PI / 6) },
    { x: endX, y: endY },
    { x: endX - headLength * Math.cos(angle + Math.PI / 6), y: endY - headLength * Math.sin(angle + Math.PI / 6) },
  ];

  fabricCanvas.remove(tempArrowLine.value);
  tempArrowLine.value = new Polyline(arrowPoints, {
    stroke: currentColor.value,
    strokeWidth: currentStrokeWidth.value,
    fill: "transparent",
    selectable: false,
    evented: false,
  });
  fabricCanvas.add(tempArrowLine.value);
  fabricCanvas.renderAll();
}

function finishArrowDrawing(x: number, y: number) {
  if (!fabricCanvas || !arrowStartPoint.value) return;

  let endX = x;
  let endY = y;
  let endBlock: { blockId: string; point: ConnectionPointPosition } | null = null;

  // Check for snap to connection point
  const nearPoint = findNearestConnectionPoint(x, y, arrowStartBlock.value?.block?.id);
  if (nearPoint) {
    endX = nearPoint.x;
    endY = nearPoint.y;
    endBlock = { blockId: nearPoint.blockId, point: nearPoint.point };
  }

  // Shift constraint
  if (isShiftPressed.value && !endBlock) {
    const dx = endX - arrowStartPoint.value.x;
    const dy = endY - arrowStartPoint.value.y;
    const angle = Math.atan2(dy, dx);
    const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const distance = Math.sqrt(dx * dx + dy * dy);
    endX = arrowStartPoint.value.x + distance * Math.cos(snappedAngle);
    endY = arrowStartPoint.value.y + distance * Math.sin(snappedAngle);
  }

  // Remove temp line
  if (tempArrowLine.value) {
    fabricCanvas.remove(tempArrowLine.value);
    tempArrowLine.value = null;
  }

  // Don't create if too small
  const dx = endX - arrowStartPoint.value.x;
  const dy = endY - arrowStartPoint.value.y;
  if (Math.sqrt(dx * dx + dy * dy) < 10) {
    cancelArrowDrawing();
    return;
  }

  saveToHistory();

  // Create final arrow
  const startX = arrowStartPoint.value.x;
  const startY = arrowStartPoint.value.y;
  const angle = Math.atan2(endY - startY, endX - startX);
  const headLength = 12;
  const arrowId = generateId();

  const arrowPoints = [
    { x: startX, y: startY },
    { x: endX, y: endY },
    { x: endX - headLength * Math.cos(angle - Math.PI / 6), y: endY - headLength * Math.sin(angle - Math.PI / 6) },
    { x: endX, y: endY },
    { x: endX - headLength * Math.cos(angle + Math.PI / 6), y: endY - headLength * Math.sin(angle + Math.PI / 6) },
  ];

  const arrow = new Polyline(arrowPoints, {
    stroke: currentColor.value,
    strokeWidth: currentStrokeWidth.value,
    fill: "transparent",
    selectable: true,
    objectCaching: false,
    hasBorders: false,
    hasControls: false,
    lockRotation: true,
    lockScalingX: true,
    lockScalingY: true,
  });
  arrow.set("id", arrowId);
  arrow.set("isArrow", true);

  // If connected to blocks, store connection
  if (arrowStartBlock.value && endBlock) {
    arrow.set("isConnector", true);
    arrow.set("connectedFromId", arrowStartBlock.value.block.id);
    arrow.set("connectedFromPoint", arrowStartBlock.value.point);
    arrow.set("connectedToId", endBlock.blockId);
    arrow.set("connectedToPoint", endBlock.point);

    connections.value.push({
      id: generateId(),
      fromBlockId: arrowStartBlock.value.block.id,
      fromPoint: arrowStartBlock.value.point,
      toBlockId: endBlock.blockId,
      toPoint: endBlock.point,
      arrowId: arrowId,
    });
  }

  fabricCanvas.add(arrow);

  // Setup custom controls for editing arrow endpoints
  setupArrowControls(arrow);

  fabricCanvas.renderAll();
  markUnsaved();

  cancelArrowDrawing();
}

function cancelArrowDrawing() {
  if (tempArrowLine.value && fabricCanvas) {
    fabricCanvas.remove(tempArrowLine.value);
    tempArrowLine.value = null;
  }
  isDrawingArrow.value = false;
  arrowStartPoint.value = null;
  arrowStartBlock.value = null;
  clearConnectionPoints();
}

// Setup custom controls for editing arrow endpoints
function setupArrowControls(arrow: Polyline) {
  if (!arrow.points || arrow.points.length < 2) return;

  // Control for start point
  const startPointControl = new Control({
    x: -0.5,
    y: -0.5,
    offsetX: 0,
    offsetY: 0,
    cursorStyle: 'pointer',
    mouseUpHandler: () => true,
    actionHandler: (eventData: any, transform: any) => {
      const arrow = transform.target as Polyline;
      const points = arrow.points || [];
      if (points.length < 2) return false;

      // Get pointer in object space
      const pointer = arrow.canvas?.getViewportPoint(eventData.e);
      if (!pointer) return false;

      // Update first point
      const matrix = arrow.calcTransformMatrix();
      const invertedMatrix = fabricUtil.invertTransform(matrix);
      const localPointer = fabricUtil.transformPoint(pointer, invertedMatrix);

      points[0].x = localPointer.x;
      points[0].y = localPointer.y;

      arrow.set({ points, dirty: true });
      arrow.setCoords();
      return true;
    },
    render: (ctx: CanvasRenderingContext2D, left: number, top: number) => {
      ctx.save();
      ctx.fillStyle = '#6366f1';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(left, top, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },
    positionHandler: (_dim: any, finalMatrix: any, fabricObject: any) => {
      const arrow = fabricObject as Polyline;
      const points = arrow.points || [];
      if (points.length < 2) return new Point(0, 0);

      const point = new Point(points[0].x, points[0].y);
      return fabricUtil.transformPoint(point, finalMatrix);
    },
  });

  // Control for end point
  const endPointControl = new Control({
    x: 0.5,
    y: 0.5,
    offsetX: 0,
    offsetY: 0,
    cursorStyle: 'pointer',
    mouseUpHandler: () => true,
    actionHandler: (eventData: any, transform: any) => {
      const arrow = transform.target as Polyline;
      const points = arrow.points || [];
      if (points.length < 2) return false;

      const pointer = arrow.canvas?.getViewportPoint(eventData.e);
      if (!pointer) return false;

      const matrix = arrow.calcTransformMatrix();
      const invertedMatrix = fabricUtil.invertTransform(matrix);
      const localPointer = fabricUtil.transformPoint(pointer, invertedMatrix);

      // Update end point (index 1, the actual end before arrowhead points)
      points[1].x = localPointer.x;
      points[1].y = localPointer.y;

      // Recalculate arrowhead
      const angle = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
      const headLength = 12;

      points[2] = {
        x: points[1].x - headLength * Math.cos(angle - Math.PI / 6),
        y: points[1].y - headLength * Math.sin(angle - Math.PI / 6),
      };
      points[3] = { x: points[1].x, y: points[1].y };
      points[4] = {
        x: points[1].x - headLength * Math.cos(angle + Math.PI / 6),
        y: points[1].y - headLength * Math.sin(angle + Math.PI / 6),
      };

      arrow.set({ points, dirty: true });
      arrow.setCoords();
      return true;
    },
    render: (ctx: CanvasRenderingContext2D, left: number, top: number) => {
      ctx.save();
      ctx.fillStyle = '#6366f1';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(left, top, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },
    positionHandler: (_dim: any, finalMatrix: any, fabricObject: any) => {
      const arrow = fabricObject as Polyline;
      const points = arrow.points || [];
      if (points.length < 2) return new Point(0, 0);

      const point = new Point(points[1].x, points[1].y);
      return fabricUtil.transformPoint(point, finalMatrix);
    },
  });

  arrow.controls = {
    start: startPointControl,
    end: endPointControl,
  };
}

// Update connected arrows when blocks move
function updateBlockConnections(blockId: string) {
  if (!fabricCanvas) return;

  connections.value.forEach((conn) => {
    if (conn.fromBlockId === blockId || conn.toBlockId === blockId) {
      const arrow = fabricCanvas?.getObjects().find((o: any) => o.id === conn.arrowId);
      if (!arrow) return;

      const fromPoints = getBlockConnectionPoints(conn.fromBlockId);
      const toPoints = getBlockConnectionPoints(conn.toBlockId);
      const from = fromPoints.find(p => p.position === conn.fromPoint);
      const to = toPoints.find(p => p.position === conn.toPoint);

      if (from && to) {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const headLength = 12;

        const newPoints = [
          { x: from.x, y: from.y },
          { x: to.x, y: to.y },
          { x: to.x - headLength * Math.cos(angle - Math.PI / 6), y: to.y - headLength * Math.sin(angle - Math.PI / 6) },
          { x: to.x, y: to.y },
          { x: to.x - headLength * Math.cos(angle + Math.PI / 6), y: to.y - headLength * Math.sin(angle + Math.PI / 6) },
        ];

        fabricCanvas?.remove(arrow);
        const newArrow = new Polyline(newPoints, {
          stroke: (arrow as any).stroke || currentColor.value,
          strokeWidth: (arrow as any).strokeWidth || 2,
          fill: "transparent",
          selectable: true,
        });
        newArrow.set("id", conn.arrowId);
        newArrow.set("isArrow", true);
        newArrow.set("isConnector", true);
        newArrow.set("connectedFromId", conn.fromBlockId);
        newArrow.set("connectedFromPoint", conn.fromPoint);
        newArrow.set("connectedToId", conn.toBlockId);
        newArrow.set("connectedToPoint", conn.toPoint);
        fabricCanvas?.add(newArrow);

        // Update label position if exists
        if (conn.labelId) {
          const label = fabricCanvas?.getObjects().find((o: any) => o.id === conn.labelId);
          if (label) {
            label.set({
              left: (from.x + to.x) / 2,
              top: (from.y + to.y) / 2 - 15,
            });
          }
        }
      }
    }
  });

  fabricCanvas?.renderAll();
}

// ========== DRAG-TO-CREATE BLOCKS ==========

function startBlockDragging(x: number, y: number) {
  if (!fabricCanvas) return;

  isDraggingBlock.value = true;
  blockDragStart.value = { x, y };

  const isHeader = currentTool.value === "headerBlock";

  tempBlockRect.value = new Rect({
    left: x,
    top: y,
    width: 0,
    height: 0,
    fill: isHeader ? BLOCK_COLORS.header.bg : BLOCK_COLORS.default.bg,
    stroke: isHeader ? BLOCK_COLORS.header.border : BLOCK_COLORS.default.border,
    strokeWidth: 2,
    strokeDashArray: [5, 5],
    rx: 10,
    ry: 10,
    selectable: false,
    evented: false,
  });
  fabricCanvas.add(tempBlockRect.value);
}

function updateBlockDragging(x: number, y: number) {
  if (!tempBlockRect.value || !blockDragStart.value || !fabricCanvas) return;

  const width = x - blockDragStart.value.x;
  const height = y - blockDragStart.value.y;

  tempBlockRect.value.set({
    width: Math.abs(width),
    height: Math.abs(height),
    left: width < 0 ? x : blockDragStart.value.x,
    top: height < 0 ? y : blockDragStart.value.y,
  });

  fabricCanvas.renderAll();
}

function finishBlockDragging(x: number, y: number) {
  if (!fabricCanvas || !blockDragStart.value) return;

  // Calculate dimensions
  let left = Math.min(blockDragStart.value.x, x);
  let top = Math.min(blockDragStart.value.y, y);
  let width = Math.abs(x - blockDragStart.value.x);
  let height = Math.abs(y - blockDragStart.value.y);

  // Remove temp rect
  if (tempBlockRect.value) {
    fabricCanvas.remove(tempBlockRect.value);
    tempBlockRect.value = null;
  }

  // Minimum size check - if too small, use default size
  const isHeader = currentTool.value === "headerBlock";
  const minWidth = isHeader ? 120 : 100;
  const minHeight = isHeader ? 60 : 50;

  if (width < minWidth || height < minHeight) {
    // Create with default size at click position
    width = isHeader ? 200 : 160;
    height = isHeader ? 100 : 80;
    left = blockDragStart.value.x;
    top = blockDragStart.value.y;
  }

  saveToHistory();

  if (isHeader) {
    createHeaderBlock(left, top, width, height);
  } else {
    createSimpleBlock(left, top, width, height);
  }

  cancelBlockDragging();
  // Don't auto-switch to select mode - let user continue with current tool
}

function cancelBlockDragging() {
  if (tempBlockRect.value && fabricCanvas) {
    fabricCanvas.remove(tempBlockRect.value);
    tempBlockRect.value = null;
  }
  isDraggingBlock.value = false;
  blockDragStart.value = null;
}

// ========== EVENT HANDLERS ==========

function updateConnectionPointPositions(blockId: string) {
  if (!fabricCanvas || connectionPointCircles.value.length !== 4) return;
  if (hoveredBlockId.value !== blockId) return;

  const points = getBlockConnectionPoints(blockId);
  connectionPointCircles.value.forEach((circle, i) => {
    if (points[i]) {
      circle.set({
        left: points[i].x - 8,
        top: points[i].y - 8,
      });
    }
  });
}

function onObjectMoving(e: any) {
  const obj = e.target;

  // Set flag to prevent showing connection points on hover during movement
  isMovingObject.value = true;

  // If moving a block rect, update its text positions and connections
  if (obj?.isBlockRect) {
    updateBlockTextPositions(obj);
    updateBlockConnections(obj.blockId);
    // Update connection points positions while moving (don't clear them)
    updateConnectionPointPositions(obj.blockId);
  }

  // If moving block text, move the whole block instead
  if (obj?.isBlockText && obj?.blockId) {
    const link = blockTextLinks.value.find(l => l.blockId === obj.blockId);
    if (link) {
      const rect = fabricCanvas?.getObjects().find((o: any) => o.id === link.rectId) as any;
      if (rect) {
        // Calculate offset and move rect instead
        const deltaX = obj.left - (rect.left + (rect.width * (rect.scaleX || 1)) / 2);
        const deltaY = obj.top - (rect.top + (rect.height * (rect.scaleY || 1)) / 2);
        rect.set({
          left: rect.left + deltaX,
          top: rect.top + deltaY,
        });
        updateBlockTextPositions(rect);
        updateBlockConnections(rect.blockId);
        fabricCanvas?.renderAll();
      }
    }
  }
}

function onObjectScaling(e: any) {
  const obj = e.target;

  // When scaling block rect, keep text at original size but reposition
  if (obj?.isBlockRect) {
    updateBlockTextPositions(obj);
    updateConnectionPointPositions(obj.blockId);
  }
}

function onObjectModified() {
  markUnsaved();
  // Reset flag when object movement is finished
  isMovingObject.value = false;
}

function onPathCreated() {
  markUnsaved();
}

function onSelectionChanged(e: any) {
  const selected = e.selected;
  if (!selected || selected.length === 0) return;

  // If block text is selected and is in editing mode - allow it
  const firstObj = selected[0] as any;
  if (firstObj?.isBlockText && (firstObj as IText).isEditing) {
    return; // Allow editing
  }

  // If block is selected, show connection points
  if (firstObj?.isBlockRect && firstObj?.blockId) {
    showBlockConnectionPoints(firstObj.blockId);
  }

  // If block text is selected (but not editing), we allow it for double-click to work
  // Don't force selection to rect anymore
}

function onSelectionCleared() {
  clearConnectionPoints();
}

// Shape drawing state
let startX = 0;
let startY = 0;
let isDrawingShape = false;
let tempShape: any = null;

function onMouseDown(e: any) {
  if (!fabricCanvas) return;

  const pointer = fabricCanvas.getViewportPoint(e.e);

  // Check for right click (context menu) - handled separately
  if (e.e.button === 2) return;

  const target = fabricCanvas.findTarget(e.e) as any;

  // If clicking on a connection point - start arrow drawing regardless of current tool
  if (target?.isConnectionPoint) {
    e.e.preventDefault();
    e.e.stopPropagation();
    fabricCanvas.discardActiveObject();

    const blockId = target.parentBlockId;
    const position = target.connectionPosition;
    const points = getBlockConnectionPoints(blockId);
    const point = points.find(p => p.position === position);

    if (point) {
      saveToHistory();
      arrowStartBlock.value = { block: { id: blockId }, point: position };
      arrowStartPoint.value = { x: point.x, y: point.y };
      isDrawingArrow.value = true;

      // Create temp arrow
      tempArrowLine.value = new Polyline(
        [{ x: point.x, y: point.y }],
        {
          stroke: currentColor.value,
          strokeWidth: currentStrokeWidth.value,
          fill: "transparent",
          selectable: false,
          evented: false,
        }
      );
      fabricCanvas.add(tempArrowLine.value);
    }
    return;
  }

  // Arrow tool
  if (currentTool.value === "arrow") {
    saveToHistory();
    startArrowDrawing(pointer.x, pointer.y);
    return;
  }

  // Block tools - drag to create
  if (currentTool.value === "block" || currentTool.value === "headerBlock") {
    startBlockDragging(pointer.x, pointer.y);
    return;
  }

  // Free drawing - save history before path starts
  if (currentTool.value === "draw") {
    saveToHistory();
    return;
  }

  if (currentTool.value === "select") {
    // Show connection points when clicking on blocks in select mode
    if (target?.isBlockRect) {
      showBlockConnectionPoints(target.blockId);
    } else if (!target?.isConnectionPoint) {
      clearConnectionPoints();
    }
    return;
  }

  startX = pointer.x;
  startY = pointer.y;
  isDrawingShape = true;

  saveToHistory();

  if (currentTool.value === "text") {
    addText(pointer.x, pointer.y);
    isDrawingShape = false;
    return;
  }

  if (currentTool.value === "sticky") {
    addSticky(pointer.x, pointer.y);
    isDrawingShape = false;
    return;
  }

  // Create temporary shapes for rectangle, circle, line
  if (currentTool.value === "rectangle") {
    tempShape = new Rect({
      left: startX,
      top: startY,
      width: 0,
      height: 0,
      fill: "transparent",
      stroke: currentColor.value,
      strokeWidth: currentStrokeWidth.value,
    });
    tempShape.set("id", generateId());
    fabricCanvas.add(tempShape);
  } else if (currentTool.value === "circle") {
    tempShape = new Circle({
      left: startX,
      top: startY,
      radius: 0,
      fill: "transparent",
      stroke: currentColor.value,
      strokeWidth: currentStrokeWidth.value,
    });
    tempShape.set("id", generateId());
    fabricCanvas.add(tempShape);
  } else if (currentTool.value === "line") {
    tempShape = new Line([startX, startY, startX, startY], {
      stroke: currentColor.value,
      strokeWidth: currentStrokeWidth.value,
    });
    tempShape.set("id", generateId());
    fabricCanvas.add(tempShape);
  }
}

function onMouseMove(e: any) {
  if (!fabricCanvas) return;

  const pointer = fabricCanvas.getViewportPoint(e.e);

  // Arrow drawing - update arrow AND show connection points on hover
  if (isDrawingArrow.value) {
    updateArrowDrawing(pointer.x, pointer.y);

    // Show connection points when hovering blocks while drawing arrow
    if (!isMovingObject.value) {
      const target = fabricCanvas.findTarget(e.e) as any;
      if (target?.isBlockRect && target.blockId !== hoveredBlockId.value) {
        showBlockConnectionPoints(target.blockId);
      } else if (!target?.isBlockRect && !target?.isConnectionPoint && hoveredBlockId.value) {
        clearConnectionPoints();
      }
    }
    return;
  }

  // Block dragging
  if (isDraggingBlock.value) {
    updateBlockDragging(pointer.x, pointer.y);
    return;
  }

  // Show connection points when hovering blocks with arrow tool
  if (currentTool.value === "arrow" && !isMovingObject.value) {
    const target = fabricCanvas.findTarget(e.e) as any;
    if (target?.isBlockRect && target.blockId !== hoveredBlockId.value) {
      showBlockConnectionPoints(target.blockId);
    } else if (!target?.isBlockRect && !target?.isConnectionPoint && hoveredBlockId.value) {
      clearConnectionPoints();
    }
    return;
  }

  // Shape drawing
  if (!isDrawingShape || !tempShape) return;

  let endX = pointer.x;
  let endY = pointer.y;

  // Shift constraint for shapes
  if (isShiftPressed.value) {
    if (currentTool.value === "line") {
      const dx = endX - startX;
      const dy = endY - startY;
      const angle = Math.atan2(dy, dx);
      const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const distance = Math.sqrt(dx * dx + dy * dy);
      endX = startX + distance * Math.cos(snappedAngle);
      endY = startY + distance * Math.sin(snappedAngle);
    } else if (currentTool.value === "rectangle" || currentTool.value === "circle") {
      // Make square/circle
      const size = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));
      endX = startX + (endX > startX ? size : -size);
      endY = startY + (endY > startY ? size : -size);
    }
  }

  const width = endX - startX;
  const height = endY - startY;

  if (currentTool.value === "rectangle") {
    tempShape.set({
      width: Math.abs(width),
      height: Math.abs(height),
      left: width < 0 ? endX : startX,
      top: height < 0 ? endY : startY,
    });
  } else if (currentTool.value === "circle") {
    const radius = Math.sqrt(width * width + height * height) / 2;
    tempShape.set({
      radius,
      left: startX - radius,
      top: startY - radius,
    });
  } else if (currentTool.value === "line") {
    tempShape.set({ x2: endX, y2: endY });
  }

  fabricCanvas.renderAll();
}

function onMouseUp(e: any) {
  if (!fabricCanvas) return;

  const pointer = fabricCanvas.getViewportPoint(e.e);

  // Arrow drawing
  if (isDrawingArrow.value) {
    finishArrowDrawing(pointer.x, pointer.y);
    return;
  }

  // Block dragging
  if (isDraggingBlock.value) {
    finishBlockDragging(pointer.x, pointer.y);
    return;
  }

  // Shape drawing
  isDrawingShape = false;
  if (tempShape) {
    tempShape = null;
    markUnsaved();
  }
}

function onDoubleClick(e: any) {
  if (!fabricCanvas) return;

  const target = e.target;

  // Double click on block text to edit
  if (target?.isBlockText) {
    // Make sure text is selectable for editing
    target.set("selectable", true);
    target.set("evented", true);
    fabricCanvas.setActiveObject(target);
    setTimeout(() => {
      (target as IText).enterEditing();
      (target as IText).selectAll();
      fabricCanvas?.renderAll();
    }, 10);
    return;
  }

  // Double click on block rect to edit text
  if (target?.isBlockRect) {
    const link = blockTextLinks.value.find(l => l.rectId === target.id);
    if (link) {
      // For header blocks, check if click is in header area
      let textToEdit: IText | null = null;

      if (link.isHeaderBlock && link.headerTextId) {
        const pointer = fabricCanvas.getViewportPoint(e.e);
        const headerHeight = 32;
        const blockTop = target.top || 0;

        // If click is in header area, edit header text
        if (pointer.y < blockTop + headerHeight + 5) {
          textToEdit = fabricCanvas.getObjects().find((o: any) => o.id === link.headerTextId) as IText;
        } else {
          textToEdit = fabricCanvas.getObjects().find((o: any) => o.id === link.bodyTextId) as IText;
        }
      } else {
        textToEdit = fabricCanvas.getObjects().find((o: any) => o.id === link.bodyTextId) as IText;
      }

      if (textToEdit) {
        textToEdit.set("selectable", true);
        textToEdit.set("evented", true);
        fabricCanvas.setActiveObject(textToEdit);
        setTimeout(() => {
          textToEdit!.enterEditing();
          textToEdit!.selectAll();
          fabricCanvas?.renderAll();
        }, 10);
      }
    }
    return;
  }

  // Double click on arrow/connector to add/edit label
  if (target?.isArrow || target?.isConnector) {
    editConnectorLabel(target);
    return;
  }

  // Navigate to linked entity
  if (target?.linkedEntityId) {
    navigateToLinkedEntity(target);
  }
}

function editConnectorLabel(connector: any) {
  if (!fabricCanvas) return;

  const connectorId = connector.id;
  const connection = connections.value.find((c) => c.arrowId === connectorId);

  if (connection?.labelId) {
    const labelObj = fabricCanvas.getObjects().find((o: any) => o.id === connection.labelId) as IText;
    if (labelObj) {
      fabricCanvas.setActiveObject(labelObj);
      labelObj.enterEditing();
      labelObj.selectAll();
    }
  } else {
    const label = prompt("Введите текст для стрелки:");
    if (label) {
      // Get arrow midpoint
      const points = (connector as any).points || [];
      if (points.length >= 2) {
        const midX = (points[0].x + points[1].x) / 2;
        const midY = (points[0].y + points[1].y) / 2;

        const labelObj = new IText(label, {
          left: midX,
          top: midY - 15,
          fontSize: 12,
          fill: "#ffffff",
          backgroundColor: "rgba(26, 27, 38, 0.9)",
          fontFamily: "Inter, sans-serif",
          originX: "center",
          originY: "center",
          padding: 4,
        });
        const labelId = generateId();
        labelObj.set("id", labelId);
        labelObj.set("isConnectorLabel", true);
        labelObj.set("connectorId", connectorId);

        fabricCanvas.add(labelObj);

        if (connection) {
          connection.labelId = labelId;
        }

        fabricCanvas.renderAll();
        markUnsaved();
      }
    }
  }
}

function navigateToLinkedEntity(obj: any) {
  const entityType = obj.linkedEntityType;
  const entityId = obj.linkedEntityId;

  if (entityType === "skill") {
    router.push(`/skills?highlight=${entityId}`);
  } else if (entityType === "project") {
    router.push(`/skills?tab=projects&highlight=${entityId}`);
  }
}

// ========== UNDO/REDO ==========

function saveToHistory() {
  if (!fabricCanvas) return;

  // Filter out connection points from history
  const objects = fabricCanvas.getObjects().filter((obj: any) => !obj.isConnectionPoint);
  const tempCanvas = fabricCanvas;

  // Temporarily remove connection points before saving
  const connectionPoints = fabricCanvas.getObjects().filter((obj: any) => obj.isConnectionPoint);
  connectionPoints.forEach(cp => fabricCanvas?.remove(cp));

  const json = JSON.stringify(fabricCanvas.toJSON());

  // Re-add connection points
  connectionPoints.forEach(cp => fabricCanvas?.add(cp));

  undoStack.value.push(json);
  if (undoStack.value.length > maxHistorySize) {
    undoStack.value.shift();
  }
  redoStack.value = [];
}

function undo() {
  if (!fabricCanvas || undoStack.value.length === 0) return;

  const currentJson = JSON.stringify(fabricCanvas.toJSON());
  redoStack.value.push(currentJson);

  const prevState = undoStack.value.pop();
  if (prevState) {
    fabricCanvas.loadFromJSON(JSON.parse(prevState)).then(() => {
      clearConnectionPoints();
      fabricCanvas?.renderAll();
      markUnsaved();
    });
  }
}

function redo() {
  if (!fabricCanvas || redoStack.value.length === 0) return;

  const currentJson = JSON.stringify(fabricCanvas.toJSON());
  undoStack.value.push(currentJson);

  const nextState = redoStack.value.pop();
  if (nextState) {
    fabricCanvas.loadFromJSON(JSON.parse(nextState)).then(() => {
      clearConnectionPoints();
      fabricCanvas?.renderAll();
      markUnsaved();
    });
  }
}

// ========== FULLSCREEN ==========

function toggleFullscreen() {
  if (isFullscreen.value) {
    exitFullscreen();
  } else {
    enterFullscreen();
  }
}

function enterFullscreen() {
  const elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  }
  isFullscreen.value = true;
}

function exitFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  }
  isFullscreen.value = false;
}

// ========== QUICK ADD FUNCTIONS ==========

function addText(x: number, y: number) {
  if (!fabricCanvas) return;

  const text = new IText("Текст", {
    left: x,
    top: y,
    fontSize: 20,
    fill: currentColor.value,
    fontFamily: "Inter, sans-serif",
  });
  text.set("id", generateId());

  fabricCanvas.add(text);
  fabricCanvas.setActiveObject(text);
  text.enterEditing();
  markUnsaved();
}

function addSticky(x: number, y: number) {
  if (!fabricCanvas) return;

  const sticky = new Rect({
    left: x,
    top: y,
    width: 200,
    height: 150,
    fill: currentStickyColor.value,
    rx: 8,
    ry: 8,
    shadow: {
      color: "rgba(0,0,0,0.3)",
      blur: 10,
      offsetX: 2,
      offsetY: 2,
    },
  });
  sticky.set("id", generateId());

  const stickyText = new IText("Заметка", {
    left: x + 15,
    top: y + 15,
    fontSize: 16,
    fill: "#1a1b26",
    fontFamily: "Inter, sans-serif",
    width: 170,
  });
  stickyText.set("id", generateId());

  fabricCanvas.add(sticky);
  fabricCanvas.add(stickyText);
  fabricCanvas.setActiveObject(stickyText);
  stickyText.enterEditing();
  markUnsaved();
}

// ========== TOOL MODE ==========

watch(currentTool, updateToolMode);

function updateToolMode() {
  if (!fabricCanvas) return;

  fabricCanvas.isDrawingMode = false;
  fabricCanvas.selection = true;
  fabricCanvas.defaultCursor = "default";
  fabricCanvas.hoverCursor = "move";

  clearConnectionPoints();

  if (currentTool.value === "draw") {
    fabricCanvas.isDrawingMode = true;
    fabricCanvas.freeDrawingBrush = new PencilBrush(fabricCanvas);
    fabricCanvas.freeDrawingBrush.color = currentColor.value;
    fabricCanvas.freeDrawingBrush.width = currentStrokeWidth.value;
  } else if (currentTool.value === "select") {
    fabricCanvas.selection = true;
  } else {
    fabricCanvas.selection = false;
    fabricCanvas.defaultCursor = "crosshair";
    fabricCanvas.hoverCursor = "crosshair";
  }
}

watch(currentColor, (color) => {
  if (fabricCanvas?.freeDrawingBrush) {
    fabricCanvas.freeDrawingBrush.color = color;
  }
});

watch(currentStrokeWidth, (width) => {
  if (fabricCanvas?.freeDrawingBrush) {
    fabricCanvas.freeDrawingBrush.width = width;
  }
});

// ========== CONTEXT MENU ==========

function showContextMenuAt(x: number, y: number) {
  const activeObject = fabricCanvas?.getActiveObject();
  if (activeObject) {
    selectedObjectId.value = (activeObject as any).id || null;
    contextMenu.value = { show: true, x, y };
    showColorMenu.value = false;
  }
}

function hideContextMenu() {
  contextMenu.value.show = false;
  showColorMenu.value = false;
}

function deleteSelected() {
  if (!fabricCanvas) return;
  saveToHistory();

  const activeObjects = fabricCanvas.getActiveObjects();

  activeObjects.forEach((obj: any) => {
    // If it's a block rect, also delete associated elements
    if (obj.isBlockRect && obj.blockId) {
      const link = blockTextLinks.value.find(l => l.blockId === obj.blockId);
      if (link) {
        // Remove all block parts
        const partsToRemove = fabricCanvas?.getObjects().filter((o: any) => o.blockId === obj.blockId);
        partsToRemove?.forEach(p => fabricCanvas?.remove(p));

        // Remove block-text link
        blockTextLinks.value = blockTextLinks.value.filter(l => l.blockId !== obj.blockId);

        // Remove connected arrows
        const relatedConnections = connections.value.filter(
          c => c.fromBlockId === obj.blockId || c.toBlockId === obj.blockId
        );
        relatedConnections.forEach(conn => {
          const arrow = fabricCanvas?.getObjects().find((o: any) => o.id === conn.arrowId);
          if (arrow) fabricCanvas?.remove(arrow);
          const label = fabricCanvas?.getObjects().find((o: any) => o.id === conn.labelId);
          if (label) fabricCanvas?.remove(label);
        });
        connections.value = connections.value.filter(
          c => c.fromBlockId !== obj.blockId && c.toBlockId !== obj.blockId
        );
      }
    } else {
      fabricCanvas?.remove(obj);
    }
  });

  fabricCanvas.discardActiveObject();
  fabricCanvas.renderAll();
  hideContextMenu();
  markUnsaved();
}

function duplicateSelected() {
  if (!fabricCanvas) return;
  const activeObject = fabricCanvas.getActiveObject();
  if (!activeObject) return;

  saveToHistory();

  // For blocks, duplicate the whole block
  if ((activeObject as any).isBlockRect && (activeObject as any).blockId) {
    const blockId = (activeObject as any).blockId;
    const link = blockTextLinks.value.find(l => l.blockId === blockId);
    if (link) {
      const rect = fabricCanvas.getObjects().find((o: any) => o.id === link.rectId);
      if (rect) {
        const x = (rect.left || 0) + 20;
        const y = (rect.top || 0) + 20;
        const width = (rect.width || 160) * (rect.scaleX || 1);
        const height = (rect.height || 80) * (rect.scaleY || 1);

        if (link.isHeaderBlock) {
          const headerText = fabricCanvas.getObjects().find((o: any) => o.id === link.headerTextId) as IText;
          const bodyText = fabricCanvas.getObjects().find((o: any) => o.id === link.bodyTextId) as IText;
          createHeaderBlock(x, y, width, height, headerText?.text || "Заголовок", bodyText?.text || "Текст");
        } else {
          const bodyText = fabricCanvas.getObjects().find((o: any) => o.id === link.bodyTextId) as IText;
          createSimpleBlock(x, y, width, height, bodyText?.text || "Блок");
        }
      }
    }
  } else {
    activeObject.clone().then((cloned: any) => {
      cloned.set({
        left: (cloned.left || 0) + 20,
        top: (cloned.top || 0) + 20,
        id: generateId(),
      });
      fabricCanvas?.add(cloned);
      fabricCanvas?.setActiveObject(cloned);
      fabricCanvas?.renderAll();
      markUnsaved();
    });
  }

  hideContextMenu();
}

function changeObjectColor(color: string) {
  if (!fabricCanvas) return;
  const activeObject = fabricCanvas.getActiveObject();
  if (!activeObject) return;

  saveToHistory();

  if ((activeObject as any).isBlockRect) {
    activeObject.set("stroke", color);
  } else if (activeObject.type === "i-text") {
    (activeObject as IText).set("fill", color);
  } else {
    activeObject.set("stroke", color);
  }

  fabricCanvas.renderAll();
  markUnsaved();
  hideContextMenu();
}

function toggleLock() {
  if (!fabricCanvas) return;
  const activeObject = fabricCanvas.getActiveObject();
  if (!activeObject) return;

  const isLocked = (activeObject as any).isLocked;

  activeObject.set("selectable", isLocked);
  activeObject.set("evented", isLocked);
  activeObject.set("hasControls", isLocked);
  (activeObject as any).isLocked = !isLocked;

  // Visual indicator
  if (!isLocked) {
    activeObject.set("opacity", 0.7);
  } else {
    activeObject.set("opacity", 1);
  }

  fabricCanvas.discardActiveObject();
  fabricCanvas.renderAll();
  markUnsaved();
  hideContextMenu();
}

function groupSelected() {
  if (!fabricCanvas) return;

  const activeObject = fabricCanvas.getActiveObject();
  if (!activeObject || activeObject.type !== "activeselection") return;

  saveToHistory();

  // Get all selected objects
  const objects = (activeObject as ActiveSelection).getObjects();
  if (objects.length < 2) return;

  // Remove objects from canvas
  objects.forEach(obj => fabricCanvas?.remove(obj));

  // Create group
  const group = new Group(objects, {
    left: activeObject.left,
    top: activeObject.top,
  });
  group.set("id", generateId());

  fabricCanvas.add(group);
  fabricCanvas.setActiveObject(group);
  fabricCanvas.discardActiveObject();
  fabricCanvas.renderAll();
  markUnsaved();
  hideContextMenu();
}

function ungroupSelected() {
  if (!fabricCanvas) return;

  const activeObject = fabricCanvas.getActiveObject();
  if (!activeObject || activeObject.type !== "group") return;

  saveToHistory();

  const group = activeObject as Group;
  const items = group.getObjects();
  const groupLeft = group.left || 0;
  const groupTop = group.top || 0;

  // Remove the group
  fabricCanvas.remove(group);

  // Add individual items back
  items.forEach((item) => {
    // Calculate absolute position
    item.set({
      left: groupLeft + (item.left || 0),
      top: groupTop + (item.top || 0),
    });
    fabricCanvas?.add(item);
  });

  fabricCanvas.renderAll();
  markUnsaved();
  hideContextMenu();
}

const canGroup = computed(() => {
  if (!fabricCanvas) return false;
  const activeObject = fabricCanvas.getActiveObject();
  return activeObject?.type === "activeselection";
});

const canUngroup = computed(() => {
  if (!fabricCanvas) return false;
  const activeObject = fabricCanvas.getActiveObject();
  return activeObject?.type === "group";
});

function openLinkModal() {
  showTaskLinkModal.value = true;
  hideContextMenu();
}

function onLinkTask(entity: { id: string; type: string; name: string }) {
  if (!fabricCanvas) return;
  const activeObject = fabricCanvas.getActiveObject();
  if (activeObject) {
    (activeObject as any).linkedEntityId = entity.id;
    (activeObject as any).linkedEntityType = entity.type;
    (activeObject as any).linkedEntityName = entity.name;

    activeObject.set("stroke", "#6366f1");
    activeObject.set("strokeWidth", 2);
    fabricCanvas.renderAll();
    markUnsaved();
  }
  showTaskLinkModal.value = false;
}

// ========== SAVE ==========

async function saveCanvas() {
  if (!fabricCanvas || isSaving.value) return;

  isSaving.value = true;
  try {
    const elements = serializeElements();
    await canvasStore.saveElements(canvasId.value, elements);
    hasUnsavedChanges.value = false;
  } catch (e) {
    console.error("Failed to save:", e);
  } finally {
    isSaving.value = false;
  }
}

function serializeElements(): CanvasElement[] {
  if (!fabricCanvas) return [];

  const objects = fabricCanvas.getObjects();
  const serialized: CanvasElement[] = [];

  // Serialize blocks as single elements
  const processedBlockIds = new Set<string>();

  objects
    .filter((obj: any) => !obj.isConnectionPoint)
    .forEach((obj: any) => {
      // Skip block parts that will be serialized with their parent
      if (obj.isBlockText || obj.isBlockHeaderBg) return;

      if (obj.isBlockRect && obj.blockId && !processedBlockIds.has(obj.blockId)) {
        processedBlockIds.add(obj.blockId);

        const link = blockTextLinks.value.find(l => l.blockId === obj.blockId);
        if (link) {
          const bodyText = fabricCanvas?.getObjects().find((o: any) => o.id === link.bodyTextId) as IText;
          const headerText = link.headerTextId
            ? fabricCanvas?.getObjects().find((o: any) => o.id === link.headerTextId) as IText
            : null;

          serialized.push({
            id: obj.blockId,
            type: "block",
            left: obj.left || 0,
            top: obj.top || 0,
            width: (obj.width || 160) * (obj.scaleX || 1),
            height: (obj.height || 80) * (obj.scaleY || 1),
            isBlock: true,
            isHeaderBlock: link.isHeaderBlock,
            headerText: headerText?.text,
            bodyText: bodyText?.text || "",
            linkedEntityId: obj.linkedEntityId,
            linkedEntityType: obj.linkedEntityType,
            linkedEntityName: obj.linkedEntityName,
            fabricData: JSON.stringify({
              left: obj.left,
              top: obj.top,
              width: obj.width * (obj.scaleX || 1),
              height: obj.height * (obj.scaleY || 1),
            }),
          });
        }
        return;
      }

      if (obj.blockId) return; // Skip other block parts

      const json = obj.toJSON();
      serialized.push({
        id: obj.id || generateId(),
        type: json.type,
        left: obj.left || 0,
        top: obj.top || 0,
        width: obj.width,
        height: obj.height,
        fill: json.fill,
        stroke: json.stroke,
        strokeWidth: json.strokeWidth,
        linkedEntityId: obj.linkedEntityId,
        linkedEntityType: obj.linkedEntityType,
        linkedEntityName: obj.linkedEntityName,
        isConnector: obj.isConnector,
        connectedFromId: obj.connectedFromId,
        connectedToId: obj.connectedToId,
        fabricData: JSON.stringify({ ...json, isLocked: obj.isLocked }),
      });
    });

  return serialized;
}

function generateId() {
  return `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function markUnsaved() {
  hasUnsavedChanges.value = true;
}

// ========== ZOOM ==========

function handleZoom(delta: number) {
  if (!fabricCanvas) return;

  let newZoom = zoom.value + delta;
  newZoom = Math.max(0.1, Math.min(3, newZoom));
  zoom.value = newZoom;

  fabricCanvas.setZoom(newZoom);
  fabricCanvas.renderAll();
}

function resetZoom() {
  zoom.value = 1;
  if (fabricCanvas) {
    fabricCanvas.setZoom(1);
    fabricCanvas.renderAll();
  }
}

function goBack() {
  if (hasUnsavedChanges.value) {
    if (confirm("У вас есть несохраненные изменения. Сохранить перед выходом?")) {
      saveCanvas().then(() => router.push("/canvas"));
      return;
    }
  }
  router.push("/canvas");
}
</script>

<template>
  <div class="canvas-editor">
    <!-- Header -->
    <header class="editor-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1>{{ canvasName }}</h1>
        <span v-if="hasUnsavedChanges" class="unsaved-badge">Несохранено</span>
      </div>

      <div class="header-center">
        <!-- Undo/Redo -->
        <div class="history-controls">
          <button @click="undo" :disabled="!canUndo" title="Отменить (Ctrl+Z)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 7v6h6"/>
              <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
            </svg>
          </button>
          <button @click="redo" :disabled="!canRedo" title="Повторить (Ctrl+Y)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 7v6h-6"/>
              <path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/>
            </svg>
          </button>
        </div>

        <div class="divider"></div>

        <!-- Zoom controls -->
        <div class="zoom-controls">
          <button @click="handleZoom(-0.1)" title="Уменьшить">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="M8 11h6M21 21l-4.35-4.35"/>
            </svg>
          </button>
          <span class="zoom-value" @click="resetZoom">{{ Math.round(zoom * 100) }}%</span>
          <button @click="handleZoom(0.1)" title="Увеличить">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="M11 8v6M8 11h6M21 21l-4.35-4.35"/>
            </svg>
          </button>
        </div>

        <div class="divider"></div>

        <!-- Fullscreen -->
        <button class="fullscreen-btn" @click="toggleFullscreen" title="На весь экран (F11)">
          <svg v-if="!isFullscreen" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/>
          </svg>
        </button>
      </div>

      <div class="header-right">
        <button class="save-btn" @click="saveCanvas" :disabled="isSaving || !hasUnsavedChanges">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17,21 17,13 7,13 7,21"/>
            <polyline points="7,3 7,8 15,8"/>
          </svg>
          {{ isSaving ? "Сохранение..." : "Сохранить" }}
        </button>
      </div>
    </header>

    <!-- Main content -->
    <div class="editor-content">
      <!-- Toolbar -->
      <CanvasToolbar
        v-model:tool="currentTool"
        v-model:color="currentColor"
        v-model:strokeWidth="currentStrokeWidth"
        v-model:stickyColor="currentStickyColor"
        :colors="CANVAS_COLORS"
        :brush-sizes="BRUSH_SIZES"
        :sticky-colors="STICKY_COLORS"
      />

      <!-- Canvas container -->
      <div ref="containerEl" class="canvas-container">
        <canvas ref="canvasEl"></canvas>
        <div class="grid-overlay"></div>

        <!-- Arrow drawing hint -->
        <div v-if="isDrawingArrow" class="drawing-hint">
          Отпустите для создания стрелки. Shift — для прямых линий.
        </div>

        <!-- Block drawing hint -->
        <div v-if="isDraggingBlock" class="drawing-hint">
          Отпустите для создания блока. Перетащите для нужного размера.
        </div>
      </div>
    </div>

    <!-- Context menu -->
    <div v-if="contextMenu.show" class="context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
      <button @click="duplicateSelected">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
        Дублировать
      </button>

      <button @click="groupSelected" title="Ctrl+G">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
        </svg>
        Сгруппировать
      </button>

      <button @click="ungroupSelected" title="Ctrl+Shift+G">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
          <line x1="1" y1="23" x2="23" y2="1" stroke-width="3"/>
        </svg>
        Разгруппировать
      </button>

      <!-- Color submenu -->
      <div class="menu-item-with-submenu">
        <button @click="showColorMenu = !showColorMenu">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 2a10 10 0 0110 10"/>
          </svg>
          Цвет
          <svg class="chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
        <div v-if="showColorMenu" class="color-submenu">
          <button
            v-for="c in CANVAS_COLORS"
            :key="c"
            class="color-swatch"
            :style="{ background: c }"
            @click="changeObjectColor(c)"
          ></button>
        </div>
      </div>

      <button @click="toggleLock">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
        Заблокировать
      </button>

      <button @click="openLinkModal">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
        </svg>
        Привязать к задаче
      </button>

      <div class="menu-divider"></div>

      <button class="danger" @click="deleteSelected">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
        Удалить
      </button>
    </div>

    <!-- Task Link Modal -->
    <TaskLinkModal
      v-if="showTaskLinkModal"
      @close="showTaskLinkModal = false"
      @select="onLinkTask"
    />
  </div>
</template>

<style scoped>
.canvas-editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  background: #0f0f1a;
  overflow: hidden;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: rgba(26, 27, 38, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-left h1 {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.back-btn {
  padding: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.unsaved-badge {
  padding: 4px 10px;
  background: rgba(251, 191, 36, 0.2);
  border-radius: 12px;
  font-size: 12px;
  color: #fbbf24;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 8px;
}

.history-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.history-controls button {
  padding: 8px;
  background: none;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.history-controls button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.history-controls button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.divider {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 4px;
}

.fullscreen-btn {
  padding: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fullscreen-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.zoom-controls button {
  padding: 4px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: color 0.2s;
}

.zoom-controls button:hover {
  color: #fff;
}

.zoom-value {
  min-width: 50px;
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
}

.zoom-value:hover {
  color: #6366f1;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.save-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.save-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.editor-content {
  display: flex;
  width: 100%;
  flex: 1;
  overflow: hidden;
}

.canvas-container {
  flex: 1;
  width: 100%;
  position: relative;
  overflow: hidden;
}

.canvas-container canvas {
  display: block;
  width: 100%;
}

.grid-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 40px 40px;
  opacity: 0.5;
}

.drawing-hint {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  background: rgba(99, 102, 241, 0.9);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  pointer-events: none;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* Context Menu */
.context-menu {
  position: fixed;
  min-width: 180px;
  background: rgba(26, 27, 38, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 6px;
  z-index: 1000;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
}

.context-menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: none;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.context-menu button:hover {
  background: rgba(255, 255, 255, 0.08);
}

.context-menu button.danger {
  color: #f87171;
}

.context-menu button.danger:hover {
  background: rgba(248, 113, 113, 0.15);
}

.menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 6px 0;
}

.menu-item-with-submenu {
  position: relative;
}

.menu-item-with-submenu button {
  justify-content: flex-start;
}

.menu-item-with-submenu .chevron {
  margin-left: auto;
}

.color-submenu {
  position: absolute;
  left: 100%;
  top: 0;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  padding: 8px;
  background: rgba(26, 27, 38, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  margin-left: 4px;
}

.color-swatch {
  width: 24px !important;
  height: 24px !important;
  min-width: 24px;
  padding: 0 !important;
  border-radius: 4px !important;
  border: 2px solid transparent !important;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}

.color-swatch:hover {
  transform: scale(1.15);
  border-color: #fff !important;
}
</style>
