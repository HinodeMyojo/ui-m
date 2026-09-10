// Конфетти — вкусняшка, и выключать её нужно в одном месте, а не в семи.
//
// Экраны зовут `confetti(...)` в десятке мест: за закрытую карточку, за подход,
// за прочитанную страницу. Поэтому выключатель стоит не у каждого вызова, а
// здесь: файлы меняют только строку импорта, а салют молча становится пустым
// действием, когда его выключили в админке.

import confetti from "canvas-confetti";
import { isOn } from "./useFeatures.js";

export default function celebrate(...args) {
  if (!isOn("layer.confetti")) return undefined;
  return confetti(...args);
}
