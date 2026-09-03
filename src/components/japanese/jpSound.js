// Звуки сессии: щипок кото на верный ответ, деревянный щелчок на ошибку,
// колокол в конце.
//
// Синтез в браузере, а не файлы: звуки нужны короткие и их пять штук, а
// каждый файл — это лишние килобайты в сборке, ещё одна загрузка на телефоне
// и вопрос о лицензии на сэмпл. Web Audio всё это снимает, а «японскость»
// даёт не тембр, а строй: ноты берутся из пентатоники ё (ре, ми, соль, ля,
// си), на которой звучит вся традиционная музыка. Мажорная, а не хирадзёси:
// хирадзёси красивее, но на верном ответе звучит печально.
//
// Громкость намеренно небольшая: это отметка о результате, а не музыка.

const KEY = "jp-sound";
const MASTER = 0.22;

// Пентатоника ё от ре второй октавы.
const D5 = 587.33;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880.0;
const B5 = 987.77;
const A4 = 440.0;
const D4 = 293.66;
const D3 = 146.83;

let ctx = null;
let noise = null;
let enabled = null;

export function jpSoundEnabled() {
  if (enabled === null) {
    try {
      enabled = localStorage.getItem(KEY) !== "off";
    } catch {
      enabled = true; // приватный режим и запрет хранилища — не повод молчать
    }
  }
  return enabled;
}

export function setJpSoundEnabled(value) {
  enabled = !!value;
  try {
    localStorage.setItem(KEY, enabled ? "on" : "off");
  } catch {
    // настройка не переживёт перезагрузку — не беда, звук уже переключён
  }
}

// Контекст создаётся при первом звуке, а не при загрузке: до жеста
// пользователя браузер всё равно держит его заглушенным, а на iOS запуск без
// жеста оставляет контекст навсегда в suspended.
function audio() {
  if (ctx) return ctx;
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

function noiseBuffer(ac) {
  if (noise) return noise;
  const frames = Math.floor(ac.sampleRate * 0.3);
  noise = ac.createBuffer(1, frames, ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

// Щипок струны: быстрая атака, длинный спад, обертон сверху и короткий шум в
// самом начале — от него звук слышится щипком, а не гудком.
function pluck(ac, at, freq, gain = 1, dur = 1.1) {
  tone(ac, at, freq, "triangle", gain * 0.5, dur, freq * 5);
  tone(ac, at, freq * 2, "sine", gain * 0.16, dur * 0.45, freq * 6);

  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq * 3;
  bp.Q.value = 1.2;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain * 0.12 * MASTER, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(at);
  src.stop(at + 0.06);
}

function tone(ac, at, freq, type, gain, dur, cutoff) {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;

  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = cutoff;

  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(gain * MASTER, 0.0002), at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  osc.connect(lp).connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

// Колокол рин: обертоны негармонические, поэтому и слышится колоколом, а не
// нотой. Спад длинный — это конец занятия, ему можно отзвенеть.
function bell(ac, at, freq, dur = 2.6) {
  [
    [1, 0.5, dur],
    [2.76, 0.22, dur * 0.7],
    [5.4, 0.1, dur * 0.4],
  ].forEach(([ratio, gain, len]) => {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain * MASTER, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(g).connect(ac.destination);
    osc.start(at);
    osc.stop(at + len + 0.05);
  });
}

// Деревянный щелчок: два бруска друг о друга. Короткий и сухой — ошибка не
// должна звучать обиднее, чем она есть.
function clack(ac, at) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1400;
  bp.Q.value = 3;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.5 * MASTER, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(at);
  src.stop(at + 0.1);
}

// Что звучит на что. Верный ответ — восходящий щипок в три ноты, «почти» —
// две ровные, ошибка — щелчок с низкой нотой, конец сессии — колокол.
const VOICES = {
  right: (ac, t) => {
    pluck(ac, t, D5);
    pluck(ac, t + 0.075, G5, 0.9);
    pluck(ac, t + 0.15, B5, 0.85, 1.4);
  },
  close: (ac, t) => {
    pluck(ac, t, A4, 0.9);
    pluck(ac, t + 0.09, D5, 0.8, 1.2);
  },
  wrong: (ac, t) => {
    clack(ac, t);
    pluck(ac, t + 0.02, D3, 0.7, 0.5);
  },
  done: (ac, t) => {
    bell(ac, t, A4);
    pluck(ac, t + 0.28, D4, 0.6, 1.6);
    pluck(ac, t + 0.5, A5, 0.5, 1.8);
  },
};

// jpPlay проигрывает звук по имени. Молча ничего не делает, если звук
// выключен или браузер не умеет Web Audio: звук — это украшение, ронять из-за
// него сессию нельзя.
export function jpPlay(kind) {
  if (!jpSoundEnabled()) return;
  const voice = VOICES[kind];
  if (!voice) return;
  try {
    const ac = audio();
    if (!ac) return;
    // Контекст мог остаться заглушенным с прошлой вкладки — будим и играем
    // уже после: до resume время в контексте не идёт.
    if (ac.state === "suspended") {
      ac.resume().then(() => voice(ac, ac.currentTime + 0.02));
      return;
    }
    voice(ac, ac.currentTime + 0.02);
  } catch {
    // ничего: сессия важнее звука
  }
}
