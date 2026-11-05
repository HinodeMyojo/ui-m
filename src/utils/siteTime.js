// Время сайта. «Сегодня», линия «сейчас», сроки и поля времени считаются по
// поясу сайта — по умолчанию UTC+3, как у сервера и ботов (сутки с 03:00
// по Москве), а не по системным часам компьютера: в поездке или на машине
// с европейским временем день и сроки иначе съезжали бы на пару часов.
// Пояс настраивается целыми часами и хранится в этом браузере.
import { ref, watch } from "vue";

const KEY = "siteUtcOffset";
const DEFAULT_OFFSET = 3;

function read() {
  const v = Number(localStorage.getItem(KEY));
  return localStorage.getItem(KEY) !== null && Number.isInteger(v) && v >= -12 && v <= 14 ? v : DEFAULT_OFFSET;
}

// Сдвиг от UTC в часах.
export const siteOffset = ref(read());
watch(siteOffset, (v) => localStorage.setItem(KEY, String(v)));

export const SITE_OFFSETS = Array.from({ length: 27 }, (_, i) => i - 12);
export const offsetLabel = (h) => (h === 0 ? "UTC" : `UTC${h > 0 ? "+" : "−"}${Math.abs(h)}`);

// Имя пояса для Intl. У Etc/GMT знак обратный: UTC+3 — это Etc/GMT-3.
export const siteZone = () => (siteOffset.value === 0 ? "UTC" : `Etc/GMT${siteOffset.value > 0 ? "-" : "+"}${Math.abs(siteOffset.value)}`);

// Момент, у которого UTC-поля показывают часы сайта.
const wall = (at) => new Date(new Date(at).getTime() + siteOffset.value * 3600000);

// Календарная дата момента по времени сайта: «ГГГГ-ММ-ДД».
export const siteYmd = (at = Date.now()) => wall(at).toISOString().slice(0, 10);

// Минуты от полуночи по времени сайта.
export function siteMinutes(at = Date.now()) {
  const w = wall(at);
  return w.getUTCHours() * 60 + w.getUTCMinutes();
}

// Значение для <input type="datetime-local"> и обратно.
export const toSiteInput = (at) => wall(at).toISOString().slice(0, 16);

// Момент по времени сайта: дата «ГГГГ-ММ-ДД» и минуты от полуночи (1440 —
// полночь следующих суток).
export const siteInstant = (ymd, minutes = 0) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + (minutes * 60 - siteOffset.value * 3600) * 1000);

export function fromSiteInput(value) {
  const [ymd, hm] = value.split("T");
  const [h, m] = hm.split(":").map(Number);
  return siteInstant(ymd, h * 60 + m);
}

// Подписи момента по времени сайта.
export const siteTime = (at) =>
  new Date(at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: siteZone() });
export const siteDate = (at, options) =>
  new Date(at).toLocaleDateString("ru-RU", { ...options, timeZone: siteZone() });
export const siteDateTime = (at, options) =>
  new Date(at).toLocaleString("ru-RU", { ...options, timeZone: siteZone() });
