// Распознавание текста на сканах — tesseract.js прямо в браузере, как в
// японском разделе (JpScanTab), только русский с английским.
//
// Зачем редактору: у PDF-фотографии текста нет вовсе, есть картинка. После
// распознавания «Править текст» знает, где какая строка, — замазывает её цветом
// бумаги и кладёт поверх правку тем же кеглем. Тот же текст при сохранении
// ложится невидимым слоем под картинку, и в файле начинает работать поиск и
// копирование.

let worker = null;
let workerPromise = null;
let onProgress = null;

async function getWorker() {
  if (worker) return worker;
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    // Библиотека и словари (около 15 МБ на два языка) грузятся только по кнопке:
    // большинство открытых файлов распознавать не нужно.
    const { createWorker } = await import("tesseract.js");
    const w = await createWorker(["rus", "eng"], 1, {
      logger: (m) => {
        if (!onProgress) return;
        const stage = m.status === "recognizing text" ? "распознаю" : "загружаю распознаватель";
        onProgress({ stage, progress: typeof m.progress === "number" ? m.progress : 0 });
      },
    });
    worker = w;
    return w;
  })();
  try {
    return await workerPromise;
  } finally {
    workerPromise = null;
  }
}

// recognize — строки и слова страницы в её координатах. canvas нарисован в
// масштабе scale (пикселей на точку).
export async function recognize(canvas, scale, progress) {
  onProgress = progress;
  try {
    const w = await getWorker();
    const { data } = await w.recognize(canvas, {}, { blocks: true, text: true });
    const lines = [];
    const box = (b) => ({ x: b.x0 / scale, y: b.y0 / scale, w: (b.x1 - b.x0) / scale, h: (b.y1 - b.y0) / scale });
    for (const block of data.blocks || []) {
      for (const para of block.paragraphs || []) {
        for (const line of para.lines || []) {
          const text = (line.text || "").replace(/\s+/g, " ").trim();
          // Ниже 30% уверенности tesseract обычно «читает» пятна и рамки.
          if (!text || line.confidence < 30) continue;
          const words = (line.words || [])
            .filter((wd) => wd.text && wd.text.trim() && wd.confidence >= 20)
            .map((wd) => ({ text: wd.text.trim(), ...box(wd.bbox) }));
          lines.push({ text, ...box(line.bbox), words });
        }
      }
    }
    return { lines, text: (data.text || "").trim() };
  } finally {
    onProgress = null;
  }
}

export async function terminateOcr() {
  const w = worker;
  worker = null;
  if (w) await w.terminate();
}
