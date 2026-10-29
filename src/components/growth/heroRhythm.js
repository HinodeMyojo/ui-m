// Ритм героя: что он делает сейчас. docs/me-module.md (back-m)
//
// По приоритету:
//   1. кнопка, нажатая человеком (держится до actionUntil, обычно 2 часа);
//   2. сон по окну сна из профиля;
//   3. рабочие дни и часы — герой в пути;
//   4. слабый день — сидит у костра, как ни крути;
//   5. время суток: утро — тренировка, вечер — чтение, поздний вечер —
//      медитация, остальное — костёр.

function minutesOf(hhmm, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return fallback;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Окно может переходить через полночь (сон 02:00–09:00 или 23:00–07:00).
function inWindow(now, from, to) {
  return from <= to ? now >= from && now < to : now >= from || now < to;
}

export function heroAction(profile, now = new Date(), dayState = "good") {
  if (profile?.action && profile.actionUntil && new Date(profile.actionUntil) > now) {
    return profile.action;
  }
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (inWindow(minutes, minutesOf(profile?.sleepFrom, 120), minutesOf(profile?.sleepTo, 540))) {
    return "sleep";
  }
  const weekday = now.getDay() === 0 ? 7 : now.getDay();
  const workDays = (profile?.workDays || "1,2,3,4,5").split(",").map(Number);
  if (
    workDays.includes(weekday) &&
    inWindow(minutes, minutesOf(profile?.workFrom, 600), minutesOf(profile?.workTo, 1140))
  ) {
    return "travel";
  }
  if (dayState === "weak") return "campfire";
  const hour = now.getHours();
  if (hour >= 6 && hour < 10) return "train";
  if (hour >= 19 && hour < 22) return "read";
  if (hour >= 22 || hour < 2) return "meditate";
  return "campfire";
}

// Где он: у костра и в покое — пещера, в пути — лес и горы по очереди,
// тренировка — руины.
export function heroLocation(action, now = new Date()) {
  if (action === "travel") return now.getHours() % 2 === 0 ? "forest" : "mountains";
  if (action === "train") return "ruins";
  return "cave";
}

export const HERO_ACTIONS = [
  { key: "campfire", icon: "🔥", title: "У костра" },
  { key: "travel", icon: "🧭", title: "В путь" },
  { key: "read", icon: "📖", title: "Читает" },
  { key: "train", icon: "🏹", title: "Тренируется" },
  { key: "meditate", icon: "🧘", title: "Медитирует" },
  { key: "sleep", icon: "💤", title: "Спит" },
];

// Костёр — стрик дисциплины. Цвет — уровень дня: сегодняшний, если он уже
// закрыт, иначе вчерашний, пока стрик жив. Стрик оборвался — угли.
export function heroFire(month, today) {
  const level = { min: 1, mid: 2, max: 3 };
  const days = month?.days || [];
  const streak = month?.summary?.globalStreak || 0;
  const idx = days.findIndex((d) => d.date === today);
  const todayStatus = idx >= 0 ? days[idx].status : null;
  if (level[todayStatus]) return { fire: level[todayStatus], streak };
  if (streak <= 0) return { fire: 0, streak };
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (level[days[i].status]) return { fire: level[days[i].status], streak };
    if (days[i].status !== "rest") break;
  }
  return { fire: 1, streak };
}

// Аура 0..4: тело, золото и костёр поровну.
export function heroAura(aura, fireStreak) {
  const fire = Math.min(1, (fireStreak || 0) / 30);
  const body = aura?.body || 0;
  const gold = aura?.gold || 0;
  const mean = (body + gold + fire) / 3;
  return { level: Math.round(mean * 4), body, gold, fire };
}

// Возраст «24 года · 5 мес · 28 дн» от даты рождения.
export function heroAge(birthDate, now = new Date()) {
  const birth = birthDate ? new Date(`${birthDate}T00:00:00`) : new Date(2002, 4, 2);
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

export function yearsWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "год";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "года";
  return "лет";
}
