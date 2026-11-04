import { hex, mixRgb, makeCanvas } from "./noise.js";

// Спрайты героя и реквизита — матрицы символов палитры. Символ означает не
// цвет, а «роль» пикселя (капюшон, плащ, кожа, борода…), а цвет роли берётся
// из снаряжения и возраста. Так один набор поз носит все шесть свистков:
// у «колокольчика» длинный хвост плаща прозрачен, у «синего» ремни кожаные.
//
//  .  пусто          o  тёмный контур
//  s S  кожа         e  глаз           h H  волосы      b  борода (с 30 лет)
//  q Q  капюшон      c C  плащ         l L  хвост длинного плаща
//  n    кайма плаща  t T  туника       a A  доспех/кожаные накладки
//  m    застёжка     w  пояс           p P  штаны       f F  сапоги
//  y Y  лук          u  плечо длинного лука (у короткого лука его нет)
//  g    тетива       k  рукоять меча   i I  сталь (навершие, гарда)
//  r    оперение     z  артефакт (светится, только у чёрного и белого)

// --- Палитра ---

const BASE = {
  o: "#140f13",
  s: "#c08a64",
  S: "#83563d",
  e: "#120a0c",
  y: "#7d5230",
  Y: "#4b301b",
  u: "#7d5230",
  g: "#cfc6ad",
  k: "#3a2820",
  i: "#b4b6c0",
  I: "#6d6e7c",
  r: "#a33326",
  v: "#5a3a24",
  w: "#3b271a",
  p: "#3b3430",
  P: "#272220",
  f: "#3e2c20",
  F: "#251910",
};

// Снаряжение по свисткам: от простой туники до легендарного белого.
export const GEAR = {
  bell: {
    q: "#4f5b3b", Q: "#323a26",
    c: "#4f5b3b", C: "#323a26",
    l: null, L: null,
    n: "#323a26",
    t: "#7a6a4c", T: "#53472f",
    a: "#7a6a4c", A: "#53472f",
    m: "#6b4f33",
    longBow: false,
  },
  red: {
    q: "#6f2020", Q: "#441417",
    c: "#6f2020", C: "#441417",
    l: "#5e1b1c", L: "#3a1013",
    n: "#441417",
    t: "#5e4a37", T: "#3f3125",
    a: "#5e4a37", A: "#3f3125",
    m: "#a8823e",
    longBow: true,
  },
  blue: {
    q: "#2a3d63", Q: "#1a2743",
    c: "#2a3d63", C: "#1a2743",
    l: "#24365a", L: "#16213a",
    n: "#7c8aa8",
    t: "#4b423a", T: "#322c27",
    a: "#7a5434", A: "#4d331f",
    m: "#a7b0bc",
    longBow: true,
  },
  moon: {
    q: "#2f2a4d", Q: "#1d1a33",
    c: "#2f2a4d", C: "#1d1a33",
    l: "#2a2546", L: "#19162d",
    n: "#a8b0d4",
    t: "#3c3a4a", T: "#28262f",
    a: "#4e4060", A: "#332940",
    m: "#e8eefc",
    longBow: true,
  },
  black: {
    q: "#1d1b22", Q: "#110f15",
    c: "#1d1b22", C: "#110f15",
    l: "#1a1820", L: "#0e0d12",
    n: "#4a4e5c",
    t: "#2a282f", T: "#1b1a1f",
    a: "#555a68", A: "#33363f",
    m: "#8a909e",
    z: "#6ff2df",
    longBow: true,
  },
  white: {
    q: "#dcd6c8", Q: "#a39d8e",
    c: "#dcd6c8", C: "#a39d8e",
    l: "#d2ccbe", L: "#958f80",
    n: "#d9b25a",
    t: "#8c8678", T: "#625d52",
    a: "#c0c4ce", A: "#81858f",
    m: "#f0c860",
    z: "#ffe7a0",
    longBow: true,
  },
};

export const WHISTLES = Object.keys(GEAR);

// Волосы седеют после 50, белеют после 70. Борода — с 30: до 27 гладко
// выбрит, в 27–30 щетина (смесь кожи и волос).
function hairColor(age) {
  const dark = hex("#2b1e17");
  if (age < 45) return dark;
  if (age < 50) return mixRgb(dark, hex("#77716c"), 0.4);
  if (age < 70) return mixRgb(hex("#77716c"), hex("#a9a49e"), (age - 50) / 20);
  return hex("#cfcbc4");
}

export function heroPalette(whistle, age = 24) {
  const gear = GEAR[whistle] || GEAR.bell;
  const pal = {};
  for (const [k, v] of Object.entries(BASE)) pal[k] = hex(v);
  for (const [k, v] of Object.entries(gear)) {
    if (k.length !== 1) continue;
    pal[k] = v ? hex(v) : null;
  }
  if (!gear.longBow) pal.u = null;
  // Без артефакта его пиксель — просто пояс, и светиться нечему.
  pal.glow = !!gear.z;
  if (!gear.z) pal.z = pal.w;
  const hair = hairColor(age);
  pal.h = hair;
  pal.H = hair.map((v) => v * 0.65);
  if (age >= 30) pal.b = hair;
  else if (age >= 27) pal.b = mixRgb(pal.s, hair, 0.45);
  else pal.b = pal.s;
  return pal;
}

// Светящиеся роли: их пиксели дорисовываются поверх освещения, чтобы
// артефакт горел и в темноте.
export const EMISSIVE = new Set(["z"]);

// --- Позы ---
// anchor — точка опоры (середина стоп/седалища на земле).

const STAND_UPPER = [
  "................",
  "...i............",
  "..rk..ooo.......",
  "..rk.oqqqo......",
  "...kIqqqqqo.....",
  "....oqqQhso.....",
  "....oqqQses.....",
  "....oqQQsbo.....",
  "...ocQQQbo......",
  "..occcmtto......",
  ".yocccttTTo.....",
  ".yoCcctaTTo.....",
  ".yoCcctaaTo.....",
  ".yoCCcaaATo.....",
  ".yoCCczwmso.....",
  ".ylCCcpppPo.....",
];

const WALK_LEGS = [
  [
    ".ylLCcppPPo.....",
    ".ylLLpp.PPo.....",
    "..lLpp...PPo....",
    "..LLpp...PPo....",
    "...ff.....FFo...",
    "..offo....FFfo..",
  ],
  [
    ".ylLCcppPo......",
    ".ylLLcpPPo......",
    "..lLLcpPo.......",
    "..LLLpPPo.......",
    "...LLfFFo.......",
    "....offFfo......",
  ],
  [
    ".ylLCcpPPo......",
    ".ylLLpP.pp......",
    "..lLPP...pp.....",
    "..LLPP...pp.....",
    "...FF.....ff....",
    "..oFFo....offo..",
  ],
  [
    ".ylLCcpPPo......",
    ".ylLLcPpPo......",
    "..lLLcPpo.......",
    "..LLLPppo.......",
    "...LLFffo.......",
    "....oFFfo.......",
  ],
];

const STAND_LEGS = [
  ".ylLCcppPPo.....",
  ".ylLLcpp.PPo....",
  "..lLLcpp.PPo....",
  "..LLLLpp.PPo....",
  "...LLLff.FFo....",
  "....offfoFFfo...",
];

const SIT = [
  "...i............",
  "..rk..ooo.......",
  "..rk.oqqqo......",
  "...kIqqqqqo.....",
  "....oqqQhso.....",
  "....oqqQses.....",
  "....oqQQsbo.....",
  "...ocQQQbo......",
  "..occcmtto......",
  ".yocccttTTo.....",
  ".yoCcctaTTo.....",
  ".yoCcctaTTsso...",
  ".yoCCczwmppppPo.",
  "yllCCcppppPPPPo.",
  "lLLCCo.....oPPo.",
  "LLLLo......oPPo.",
  "LLLL.......oFFfo",
  "...........offfo",
];

// Сидит прямо: спина вертикальна, голова выше — «сильный» день.
const SIT_STRONG = [
  "...i............",
  "..rk..ooo.......",
  "..rk.oqqqo......",
  "...kIqqqqqo.....",
  "....oqqQhso.....",
  "....oqqQses.....",
  "....oqQQsbo.....",
  "...ocQQQbo......",
  "..occcmttTo.....",
  ".yocccttTTo.....",
  ".yoCcctaaTo.....",
  ".yoCcctaaTsso...",
  ".yoCCczwmppppPo.",
  "yllCCcppppPPPPo.",
  "lLLCCo.....oPPo.",
  "LLLLo......oPPo.",
  "LLLL.......oFFfo",
  "...........offfo",
];

// Слабый день: сгорбился и закутался в плащ с головой, видны только колени.
const SIT_WEAK = [
  "................",
  "................",
  "...i............",
  "..rk..ooo.......",
  "..rkoqqqqo......",
  "...oqqqqqqo.....",
  "...oqqqQhso.....",
  "..ocqqQQSSo.....",
  "..occqQQQbo.....",
  ".yocccCcco......",
  ".yoccCccCco.....",
  ".yoCccCcccCo....",
  ".yoCCcCcccccPo..",
  "yllCCCccccPPPo..",
  "lLLCCCCCCcoPPo..",
  "LLLLCCCCo..oPPo.",
  "LLLL.......oFFfo",
  "...........offfo",
];

const READ = [
  "...i............",
  "..rk..ooo.......",
  "..rk.oqqqo......",
  "...kIqqqqqo.....",
  "....oqqQhso.....",
  "....oqqQsSs.....",
  "....oqQQsbo.....",
  "...ocQQQbo......",
  "..occcmtto......",
  ".yocccttTTo.....",
  ".yoCcctaTTso....",
  ".yoCcctaTTsso...",
  ".yoCCczwmppppPo.",
  "yllCCcppppPPPPo.",
  "lLLCCo.....oPPo.",
  "LLLLo......oPPo.",
  "LLLL.......oFFfo",
  "...........offfo",
];

// Медитация: сидит по-турецки, руки на коленях, глаза закрыты.
const MEDITATE = [
  "...i............",
  "..rk..ooo.......",
  "..rk.oqqqo......",
  "...kIqqqqqo.....",
  "....oqqQhso.....",
  "....oqqQsSs.....",
  "....oqQQsbo.....",
  "...ocQQQbo......",
  "..occcmttTo.....",
  ".yoccctttTTo....",
  ".yoCcctaaTTo....",
  ".yoCcsctaaTso...",
  "yloCCczwmwwPo...",
  "llCCcppppppPPo..",
  "LLoffpppPPPPFFo.",
  ".LLoooooooooooo.",
];

// Спит на боку, укрытый плащом; голова справа — к огню.
const LIE = [
  "................oo....",
  "..............ooqqo...",
  "........ooooooqqqqQo..",
  ".....oooccccccqqQhsso.",
  "...ooccccccccccqQSssoo",
  ".ofoCCcccccccccQQSbo..",
  "offCCCCCCCCcccCCQQoo..",
  ".ooooooooooooooooo....",
];

// Стойка лучника и мечника: руки рисуются в матрице, лук и меч — линиями
// в рендерере, чтобы тетива честно тянулась к руке, а клинок шёл по дуге.
const ARCHER_UPPER = [
  "................",
  "..r.............",
  "..r....ooo......",
  "..rr..oqqqo.....",
  "...v.oqqqqqo....",
  "...v.oqqQhso....",
  "...v.oqqQses....",
  "...v.oqQQsbo....",
  "....ocQQQbo.....",
  "...occcmttTo....",
  "..occcttTTTTssoo",
  "..oCcctaaTo.....",
  "..oCcctaaTo.....",
  "..oCCcaaATo.....",
  "..oCCczwmwo.....",
  "..lCCcpppPo.....",
];

const ARCHER_DRAW = [
  "................",
  "..r.............",
  "..r....ooo......",
  "..rr..oqqqo.....",
  "...v.oqqqqqo....",
  "...v.oqqQhso....",
  "...v.oqqQses....",
  "...v.oqQQsso....",
  "....ocQQQbo.....",
  "...occcmTTsTo...",
  "..occcttTTTTssoo",
  "..oCcctaaTo.....",
  "..oCcctaaTo.....",
  "..oCCcaaATo.....",
  "..oCCczwmwo.....",
  "..lCCcpppPo.....",
];

const SWORD_UPPER = [
  "................",
  "..r.............",
  "..r....ooo......",
  "..rr..oqqqo.....",
  "...v.oqqqqqo....",
  "...v.oqqQhso....",
  "...v.oqqQses....",
  "...v.oqQQsbo....",
  "...yocQQQbo.....",
  "..yocccmttTo....",
  "..yocccttTTso...",
  "..yoCcctaaTsso..",
  "..yoCcctaaTo....",
  "..yoCCcaaATo....",
  "..yoCCczwmwo....",
  "..ylCCcpppPo....",
];

const SWORD_RAISED = [
  "................",
  "..r.............",
  "..r....ooo...so.",
  "..rr..oqqqo.sTo.",
  "...v.oqqqqqosTo.",
  "...v.oqqQhsoTo..",
  "...v.oqqQsesTo..",
  "...v.oqQQsbTo...",
  "...yocQQQbTTo...",
  "..yocccmtTTo....",
  "..yocccttTo.....",
  "..yoCcctaaTo....",
  "..yoCcctaaTo....",
  "..yoCCcaaATo....",
  "..yoCCczwmwo....",
  "..ylCCcpppPo....",
];

const STANCE_LEGS = [
  "..lLCcppPPo.....",
  "..lLLcpp.PPo....",
  "..lLLpp...PPo...",
  "..LLLpp...PPo...",
  "...LLff....FFo..",
  "...offo....FFfo.",
];

function stack(...parts) {
  return [].concat(...parts);
}

// Выдох: всё выше строки split опускается на пиксель, строка над поясом
// уходит под грудь. Ниже split — на месте, поэтому ноги не «прыгают».
export function breathe(rows, split) {
  const out = rows.slice();
  for (let y = split - 1; y >= 1; y--) out[y] = rows[y - 1];
  out[0] = ".".repeat(rows[0].length);
  return out;
}

const STAND = stack(STAND_UPPER, STAND_LEGS);

export const POSES = {
  stand: { rows: STAND, anchor: [7, STAND.length - 1], head: [8, 6], breath: 15 },
  walk: {
    frames: WALK_LEGS.map((legs) => stack(STAND_UPPER, legs)),
    anchor: [7, 21],
    head: [8, 6],
  },
  sit: { rows: SIT, anchor: [6, 17], head: [8, 4], breath: 12, hand: [12, 11] },
  sitStrong: { rows: SIT_STRONG, anchor: [6, 17], head: [8, 4], breath: 12 },
  sitWeak: { rows: SIT_WEAK, anchor: [6, 17], head: [8, 6], breath: 12 },
  read: { rows: READ, anchor: [6, 17], head: [8, 4], breath: 12, hand: [11, 10] },
  meditate: { rows: MEDITATE, anchor: [7, 15], head: [8, 4], breath: 12 },
  lie: { rows: LIE, anchor: [10, 7], head: [17, 4] },
  archer: { rows: stack(ARCHER_UPPER, STANCE_LEGS), anchor: [7, 21], head: [8, 6], hand: [14, 10], pull: [11, 10] },
  archerDraw: { rows: stack(ARCHER_DRAW, STANCE_LEGS), anchor: [7, 21], head: [8, 6], hand: [14, 10], pull: [10, 9] },
  sword: { rows: stack(SWORD_UPPER, STANCE_LEGS), anchor: [7, 21], head: [8, 6], hand: [12, 11] },
  swordRaised: { rows: stack(SWORD_RAISED, STANCE_LEGS), anchor: [7, 21], head: [8, 6], hand: [13, 2] },
};

// --- Реквизит ---

export const PROP_PALETTE = {
  o: "#140f13",
  // бревно и камни костра
  b: "#5b3e28",
  B: "#3a2717",
  d: "#7a5636",
  c: "#2a1c13",
  r: "#5d5a60",
  R: "#3c3a42",
  h: "#7d7a82",
  // книга
  k: "#5a2a22",
  K: "#3a1a16",
  p: "#d8ccb0",
  P: "#a89a7c",
  g: "#b08a3c",
  // скатка
  e: "#6a5440",
  E: "#47382a",
  f: "#8a6e52",
  // мишень
  s: "#b89a58",
  S: "#86703c",
  t: "#9c2a22",
  T: "#e0d0a0",
  w: "#5a4028",
  W: "#3b2918",
  // угли
  x: "#ff7a2a",
  X: "#c23a12",
};

export const PROPS = {
  // Каменный круг с поленьями. Пламя рисуется отдельно, процедурно.
  campfire: [
    "...bd..db....",
    "..bBdbbdBb...",
    ".rbBBdBdBbRr.",
    "hrRccxXxccRRr",
    ".RRrRRrRRrRR.",
  ],
  // Угли на месте погасшего костра: x и X светятся.
  embers: [
    "..b..xd.b....",
    "..BbXbBxBb...",
    ".rbxBcXBcbRr.",
    "hrRcXcxcXcRRr",
    ".RRrRRrRRrRR.",
  ],
  // Бревно-сиденье.
  log: [
    ".dbbbbbbbbo",
    "dBBbBBbBBbBo",
    "obBBBbBBBBbo",
    ".ooooooooooo",
  ],
  // Скатка, на которой спит герой.
  bedroll: [
    ".ffeeeeeeeeeeeeeeeefo..",
    "feEEeEEeeEEeeEEeEEeEEo.",
    "oEEEEEEEEEEEEEEEEEEEEEo",
  ],
  // Книга: три кадра перелистывания.
  book: [
    ["kppPppk", "kpPpPpK", "KKKgKKK"],
    ["kppp.Pk", "kpPp.PK", "KKKgKKK"],
    ["kp.pppk", "kP.pPpK", "KKKgKKK"],
  ],
  // Соломенная мишень на треноге.
  target: [
    "..oSSSo..",
    ".oSsssSo.",
    "oSsTTTsSo",
    "oSTtttTSo",
    "oStTtTtSo",
    "oSTtttTSo",
    "oSsTTTsSo",
    ".oSsssSo.",
    "..oSSSo..",
    "...w.w...",
    "..w...w..",
    ".w..W..w.",
    "w...W...w",
  ],
};

// --- Огонь ---

// Шкалы пламени: от холодного края к раскалённой сердцевине.
// 1 — жёлтое (минимум), 2 — синее (средний), 3 — багровое (максимум).
export const FIRE = {
  1: {
    ramp: ["#7a1e0a", "#c2410f", "#ec7a1c", "#f7b73a", "#ffe38a", "#fff7d6"],
    light: [1.0, 0.66, 0.36],
    spark: ["#ffcf6a", "#ff8a2a"],
  },
  2: {
    ramp: ["#141c6a", "#1f3fae", "#2f78dc", "#53b4f4", "#a6e6ff", "#effcff"],
    light: [0.55, 0.74, 1.0],
    spark: ["#9fe0ff", "#4a9aff"],
  },
  3: {
    ramp: ["#3c0410", "#7e0c1c", "#bd1d30", "#ec4a48", "#ff9a7a", "#ffe2cc"],
    light: [1.0, 0.36, 0.3],
    spark: ["#ff8a6a", "#e02a3a"],
  },
  0: {
    ramp: ["#3a0c06", "#6e1a08", "#a8320c", "#d8581a", "#f08a3a", "#ffc070"],
    light: [0.95, 0.38, 0.14],
    spark: ["#ff7a2a", "#a02a0a"],
  },
};

// Маленькое пламя из четырёх кадров для блуждающего огонька в пути.
// Цифры — индексы шкалы FIRE[n].ramp.
export const WISP_FRAMES = [
  ["..1..", ".121.", "12321", "13431", "23432", ".344.", "..4.."],
  ["...1.", ".121.", "12321", "13431", "13442", ".344.", "..4.."],
  [".1...", ".121.", "12321", "13431", "24432", ".343.", "..4.."],
  ["..1..", "..21.", "12331", "13441", "23432", ".344.", "..4.."],
];

// --- Сборка спрайта в канвас ---

const cache = new Map();

export function compile(rows, palette, key, emissiveOnly = false) {
  if (emissiveOnly && !palette.glow) return null;
  const ck = key && `${key}|${emissiveOnly ? 1 : 0}`;
  if (ck && cache.has(ck)) return cache.get(ck);
  const h = rows.length;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  let any = false;
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      if (emissiveOnly && !EMISSIVE.has(ch)) continue;
      const col = palette[ch];
      if (!col) continue;
      const i = (y * w + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      // 254, а не 255: так проход света отличает спрайт от статичного фона
      // и не гасит на нём свет костра «по глубине».
      img.data[i + 3] = 254;
      any = true;
    }
  }
  ctx.putImageData(img, 0, 0);
  const out = emissiveOnly && !any ? null : c;
  if (ck) {
    if (cache.size > 400) cache.clear();
    cache.set(ck, out);
  }
  return out;
}

// Силуэт спрайта, раздутый на пиксель, минус сам спрайт — контур свечения.
export function outline(sprite, key) {
  const ck = `outline|${key}`;
  if (cache.has(ck)) return cache.get(ck);
  const w = sprite.width + 2;
  const h = sprite.height + 2;
  const src = sprite.getContext("2d").getImageData(0, 0, sprite.width, sprite.height).data;
  const has = (x, y) => x >= 0 && y >= 0 && x < sprite.width && y < sprite.height && src[(y * sprite.width + x) * 4 + 3] > 0;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x - 1;
      const sy = y - 1;
      if (has(sx, sy)) continue;
      if (has(sx - 1, sy) || has(sx + 1, sy) || has(sx, sy - 1) || has(sx, sy + 1)) {
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.set(ck, c);
  return c;
}

export function propPalette() {
  const pal = {};
  for (const [k, v] of Object.entries(PROP_PALETTE)) pal[k] = hex(v);
  return pal;
}
