// Построчное сравнение двух текстов для «Истории». LCS по строкам: файлы
// модели — сотни строк, квадрат здесь дешевле, чем тащить библиотеку.
// Слишком большой файл сравнивается грубо: «было целиком / стало целиком».
const LIMIT = 4_000_000;

export function lineDiff(before, after) {
  const a = (before || "").split("\n");
  const b = (after || "").split("\n");
  if (a.length * b.length > LIMIT) {
    return [...a.map((text) => ({ type: "del", text })), ...b.map((text) => ({ type: "add", text }))];
  }
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: a[i++] });
    } else {
      out.push({ type: "add", text: b[j++] });
    }
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}

// collapse прячет длинные неизменённые куски, оставляя по context строк вокруг правок.
export function collapse(lines, context = 3) {
  const keep = new Array(lines.length).fill(false);
  lines.forEach((l, idx) => {
    if (l.type === "same") return;
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) keep[k] = true;
  });
  const out = [];
  let skipped = 0;
  lines.forEach((l, idx) => {
    if (keep[idx]) {
      if (skipped) out.push({ type: "skip", text: `… без изменений: ${skipped} строк` });
      skipped = 0;
      out.push(l);
    } else skipped++;
  });
  if (skipped) out.push({ type: "skip", text: `… без изменений: ${skipped} строк` });
  return out;
}
