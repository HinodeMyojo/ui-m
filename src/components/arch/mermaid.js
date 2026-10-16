// Mermaid грузится один раз и только там, где есть схема: библиотека тяжёлая,
// а статусы и ER-схемы открывают реже диаграмм.
let ready = null;
let seq = 0;

function load() {
  if (!ready) {
    ready = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "strict",
        fontFamily: "inherit",
        themeVariables: { background: "#12141a" },
      });
      return mermaid;
    });
  }
  return ready;
}

// renderMermaid возвращает SVG строкой или бросает ошибку с текстом Mermaid.
export async function renderMermaid(code) {
  const mermaid = await load();
  const id = `ar-mmd-${++seq}`;
  try {
    const { svg } = await mermaid.render(id, code);
    return svg;
  } finally {
    // При ошибке Mermaid оставляет в body свой временный узел.
    document.getElementById("d" + id)?.remove();
  }
}
