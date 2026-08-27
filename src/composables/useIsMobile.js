import { ref } from "vue";

// Один matchMedia на всё приложение. Слушателя вешаем ровно один раз, при
// загрузке модуля: подписка на каждый вызов композабла — это сотни листенеров
// на длинной сессии и ровно ноль пользы, ширина-то у всех одна.
//
// 768px — та же граница, что уже стоит в существующих @media по проекту.
// Меняешь здесь — меняй и там, иначе появится полоса ширин, где мобильная
// вёрстка уже включилась, а мобильный слой ещё нет.
export const MOBILE_QUERY = "(max-width: 768px)";

const mq = window.matchMedia(MOBILE_QUERY);
export const isMobile = ref(mq.matches);

const onChange = (e) => {
  isMobile.value = e.matches;
};

// addEventListener у MediaQueryList Safari научился только в 14-й версии.
// Наш случай — читалка должна работать на всём, что вообще открывает сайт.
if (mq.addEventListener) mq.addEventListener("change", onChange);
else mq.addListener(onChange);

export function useIsMobile() {
  return isMobile;
}
