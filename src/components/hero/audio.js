// Звук сцены без единого файла: треск костра, дождь, ветер и гром собраны
// из шума прямо в браузере. Каждый звук — короткий буфер, сгенерированный
// один раз и закольцованный: живой синтез каждую секунду грел бы процессор
// весь день, а проигрывание готового буфера почти бесплатно.
//
// AudioContext создаётся только после жеста пользователя — иначе браузер
// заглушит его и напишет предупреждение в консоль.

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Зацикленный буфер: последние fade секунд подмешиваются в начало, чтобы на
// стыке не было щелчка.
function loopBuffer(ctx, seconds, fill) {
  const rate = ctx.sampleRate;
  const len = Math.floor(seconds * rate);
  const fade = Math.floor(0.08 * rate);
  const raw = new Float32Array(len + fade);
  fill(raw, rate);
  const buf = ctx.createBuffer(1, len, rate);
  const out = buf.getChannelData(0);
  for (let i = 0; i < len; i++) out[i] = raw[i];
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = raw[i] * k + raw[len + i] * (1 - k);
  }
  return buf;
}

// Костёр: низкий гул (коричневый шум) и щелчки — короткие всплески шума
// с быстрым затуханием, изредка «выстрел» полена погромче.
function fireBuffer(ctx) {
  return loopBuffer(ctx, 7, (d, rate) => {
    const r = seeded(11);
    let brown = 0;
    for (let i = 0; i < d.length; i++) {
      brown = (brown + 0.02 * (r() * 2 - 1)) / 1.02;
      d[i] = brown * 1.6;
    }
    let t = 0;
    while (t < d.length) {
      t += Math.floor((0.02 + r() * 0.16) * rate);
      const pop = r() < 0.08;
      const amp = pop ? 0.6 + r() * 0.3 : 0.08 + r() * 0.3;
      const dur = Math.floor((pop ? 0.03 : 0.004 + r() * 0.01) * rate);
      let prev = 0;
      for (let k = 0; k < dur && t + k < d.length; k++) {
        const env = Math.exp((-k / dur) * 5);
        const w = r() * 2 - 1;
        // Простейший фильтр верхних частот: треск сухой, а не глухой.
        const hp = w - prev * 0.6;
        prev = w;
        d[t + k] += hp * amp * env;
      }
    }
  });
}

// Дождь: «розовый» шум без низов плюс редкие капли-щелчки.
function rainBuffer(ctx) {
  return loopBuffer(ctx, 5, (d, rate) => {
    const r = seeded(23);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let low = 0;
    for (let i = 0; i < d.length; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      const pink = (b0 + b1 + b2 + w * 0.1848) * 0.12;
      low += (pink - low) * 0.02;
      d[i] = pink - low;
    }
    let t = 0;
    while (t < d.length) {
      t += Math.floor((0.005 + r() * 0.04) * rate);
      const amp = 0.05 + r() * 0.15;
      const dur = Math.floor(0.003 * rate);
      for (let k = 0; k < dur && t + k < d.length; k++) d[t + k] += (r() * 2 - 1) * amp * (1 - k / dur);
    }
  });
}

function noiseBuffer(ctx, seconds, seed) {
  return loopBuffer(ctx, seconds, (d) => {
    const r = seeded(seed);
    let b0 = 0;
    let b1 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = r() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.05;
      b1 = 0.96 * b1 + w * 0.2;
      d[i] = (b0 + b1 + w * 0.1) * 0.8;
    }
  });
}

// Гром: коричневый шум с резкой атакой, долгим хвостом и парой перекатов.
function thunderBuffer(ctx, seed) {
  const rate = ctx.sampleRate;
  const len = Math.floor(4.5 * rate);
  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  const r = seeded(seed);
  const rolls = [0, 0.4 + r() * 0.5, 1.2 + r() * 0.8];
  let brown = 0;
  for (let i = 0; i < len; i++) {
    const t = i / rate;
    brown = (brown + 0.04 * (r() * 2 - 1)) / 1.04;
    let env = 0;
    for (const at of rolls) if (t >= at) env += Math.exp(-(t - at) * 1.6) * (at === 0 ? 1 : 0.6);
    env *= Math.min(1, t / 0.04);
    d[i] = brown * env * 3;
  }
  return buf;
}

export function createAudio() {
  let ctx = null;
  let master = null;
  const ch = {};
  let wanted = { fire: 1, kind: "clear", wind: 0.15, intensity: 0, indoor: true };
  let on = false;

  function looped(buffer, ...chain) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    let node = src;
    for (const n of chain) {
      node.connect(n);
      node = n;
    }
    node.connect(master);
    // Разные точки старта: иначе все петли совпадают по фазе.
    src.start(0, Math.random() * buffer.duration);
    return src;
  }

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    ch.fireGain = ctx.createGain();
    ch.fireGain.gain.value = 0;
    looped(fireBuffer(ctx), ch.fireGain);

    ch.rainGain = ctx.createGain();
    ch.rainGain.gain.value = 0;
    // Под сводом пещеры дождь глуше: срезаем верха.
    ch.rainFilter = ctx.createBiquadFilter();
    ch.rainFilter.type = "lowpass";
    ch.rainFilter.frequency.value = 6000;
    looped(rainBuffer(ctx), ch.rainFilter, ch.rainGain);

    ch.windGain = ctx.createGain();
    ch.windGain.gain.value = 0;
    ch.windFilter = ctx.createBiquadFilter();
    ch.windFilter.type = "bandpass";
    ch.windFilter.frequency.value = 420;
    ch.windFilter.Q.value = 0.8;
    // Порывы: медленный генератор качает частоту фильтра — ветер «завывает».
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 260;
    lfo.connect(lfoDepth);
    lfoDepth.connect(ch.windFilter.frequency);
    lfo.start();
    looped(noiseBuffer(ctx, 6, 37), ch.windFilter, ch.windGain);

    ch.thunder = [thunderBuffer(ctx, 41), thunderBuffer(ctx, 53)];
    return true;
  }

  function apply() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const w = wanted;
    const fire = w.fire < 0 ? 0 : [0.22, 0.5, 0.55, 0.62][w.fire] ?? 0.5;
    const wet = w.kind === "rain" || w.kind === "storm" ? 0.25 + 0.45 * (w.intensity || 0.6) : 0;
    const wind = Math.min(0.5, (w.wind || 0) * 0.45 + (w.kind === "storm" ? 0.15 : 0) + (w.kind === "snow" ? 0.05 : 0));
    ch.fireGain.gain.setTargetAtTime(fire, now, 0.6);
    ch.rainGain.gain.setTargetAtTime(wet * (w.indoor ? 0.6 : 1), now, 0.8);
    ch.rainFilter.frequency.setTargetAtTime(w.indoor ? 1600 : 6000, now, 0.5);
    ch.windGain.gain.setTargetAtTime(wind * (w.indoor ? 0.6 : 1), now, 1.2);
    master.gain.setTargetAtTime(on ? 0.55 : 0, now, 0.4);
  }

  // Вызывать только из обработчика жеста (клик, клавиша).
  function start() {
    on = true;
    if (!ctx && !build()) return false;
    if (ctx.state === "suspended") ctx.resume();
    apply();
    return true;
  }

  function stop() {
    on = false;
    if (!ctx) return;
    apply();
    // После затухания — пауза контекста: петли не крутятся впустую.
    const c = ctx;
    setTimeout(() => {
      if (!on && c.state === "running") c.suspend();
    }, 1500);
  }

  function update(state) {
    wanted = { ...wanted, ...state };
    apply();
  }

  function thunder(delay = 1) {
    if (!ctx || !on || ctx.state !== "running") return;
    const src = ctx.createBufferSource();
    src.buffer = ch.thunder[Math.random() < 0.5 ? 0 : 1];
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = wanted.indoor ? 160 : 260;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    src.connect(lp);
    lp.connect(g);
    g.connect(master);
    src.start(ctx.currentTime + delay);
  }

  function destroy() {
    on = false;
    if (ctx) ctx.close().catch(() => {});
    ctx = null;
  }

  return {
    start,
    stop,
    update,
    thunder,
    destroy,
    get running() {
      return !!ctx && ctx.state === "running" && on;
    },
  };
}
