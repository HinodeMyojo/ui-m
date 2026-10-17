// Диаграмма LikeC4 — это React-компонент, а сайт на Vue. Компонент живёт
// здесь островом: Vue отдаёт ему узел DOM и пропсы, а сам React больше нигде
// не появляется. JSX не нужен — хватает createElement.
import { createElement as h, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  LikeC4ModelProvider,
  ReactLikeC4,
  LikeC4EditorProvider,
  createLikeC4Editor,
} from "@likec4/diagram";
import { LikeC4Model } from "@likec4/core/model";

// isSnapshot — похоже ли на разложенную диаграмму, которую отдал LikeC4.
function isSnapshot(s) {
  return !!s && s._stage === "layouted" && Array.isArray(s.nodes) && Array.isArray(s.edges) && !!s.bounds;
}

function Diagram(props) {
  const { dump, layouts, viewId, editable, variant, onNavigate, onNodeClick, onEdgeClick, onChange } =
    props;

  // Ручные раскладки едут внутрь модели: LikeC4 сам выбирает между ручной и
  // автоматической и сам показывает, если ручная устарела. Битый снимок
  // валит создание модели целиком — тогда рисуем без ручных раскладок.
  const model = useMemo(() => {
    const manual = {};
    for (const [id, snap] of Object.entries(layouts || {})) {
      if (isSnapshot(snap)) manual[id] = snap;
    }
    try {
      return LikeC4Model.create({ ...dump, manualLayouts: manual });
    } catch (err) {
      console.warn("[arch] ручные раскладки не подошли, рисую автоматические:", err);
      return LikeC4Model.create({ ...dump, manualLayouts: {} });
    }
  }, [dump, layouts]);

  // Редактор создаётся один раз, а свежие модель и обработчик берёт из ref:
  // новый объект на каждый рендер пересоздавал бы очередь правок LikeC4.
  const latest = useRef({ model, onChange });
  latest.current = { model, onChange };
  const editor = useMemo(() => {
    if (!editable) return null;
    return createLikeC4Editor({
      fetchView(id, layout) {
        const view = latest.current.model.view(id);
        return layout === "auto" ? view.$view : view.$layouted;
      },
      async handleChange(id, change) {
        await latest.current.onChange?.(id, change);
        return { waitForViewSync: false };
      },
    });
  }, [editable]);

  if (!model.findView(viewId)) return null;

  const diagram = h(ReactLikeC4, {
    key: viewId + ":" + (variant || ""),
    viewId,
    colorScheme: "dark",
    style: { width: "100%", height: "100%" },
    background: "dots",
    controls: true,
    fitView: true,
    // Свой поиск у проекта (Ctrl+K) ищет и документы с терминами, а метки на
    // блоках вели в непонятное «Select view» — их смысл в карточке справа.
    enableSearch: false,
    enableFocusMode: true,
    enableElementDetails: true,
    enableRelationshipDetails: true,
    enableRelationshipBrowser: true,
    enableDynamicViewWalkthrough: true,
    enableElementTags: false,
    enableNotations: true,
    enableNotes: true,
    enableCompareWithLatest: !!editable,
    dynamicViewVariant: variant || undefined,
    showNavigationButtons: true,
    onNavigateTo: (to) => onNavigate?.(to),
    onNodeClick: (node) => onNodeClick?.(node),
    onEdgeClick: (edge) => onEdgeClick?.(edge),
  });
  const tree = editor ? h(LikeC4EditorProvider, { editor }, diagram) : diagram;
  return h(LikeC4ModelProvider, { likec4model: model }, tree);
}

// mountDiagram вешает диаграмму в el. update — новые пропсы, unmount — снять.
export function mountDiagram(el, props) {
  const root = createRoot(el);
  root.render(h(Diagram, props));
  return {
    update: (next) => root.render(h(Diagram, next)),
    unmount: () => root.unmount(),
  };
}
