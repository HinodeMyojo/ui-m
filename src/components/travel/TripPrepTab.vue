<script setup>
// Подготовка к поездке: этапы и сравнение вариантов.
//
// Смысл экрана — выбор: сравнить билеты и отели по цене, кэшбэку, пересадкам
// и удобству, отметить выбранный и увидеть, во что обойдётся поездка.
// Спецификация: docs/travel-module.md, раздел 2.4.
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  fetchTripPrep,
  seedPrepGroups,
  createPrepGroup,
  updatePrepGroup,
  deletePrepGroup,
  createPrepOption,
  updatePrepOption,
  deletePrepOption,
  selectPrepOption,
  createPrepSegment,
  updatePrepSegment,
  deletePrepSegment,
  createSideTrip,
  uploadPrepOptionFile,
  deletePrepOptionFile,
  fetchCountries,
} from "@/components/api.js";

const props = defineProps({
  trip: { type: Object, required: true },
});

const router = useRouter();

const prep = ref(null);
const loading = ref(true);
const error = ref("");
const countries = ref([]);

const groupEditing = ref(null);
const groupForm = ref(emptyGroup());
const optionEditing = ref(null);
const optionForm = ref(emptyOption());
const optionGroup = ref(null);
const segmentEditing = ref(null);
const segmentForm = ref(emptySegment());
const sideTripFor = ref(null);
const sideTripForm = ref({ countryId: "", title: "", includeInParentBudget: true });
const expanded = ref({});
const compareGroupId = ref("");
const fileInput = ref(null);
const fileTargetId = ref("");

const KINDS = [
  { key: "flight", label: "Перелёт", icon: "mdi-airplane" },
  { key: "stay", label: "Жильё", icon: "mdi-bed" },
  { key: "visa", label: "Виза", icon: "mdi-passport" },
  { key: "insurance", label: "Страховка", icon: "mdi-shield-check" },
  { key: "pass", label: "Пасс", icon: "mdi-ticket-percent" },
  { key: "car", label: "Авто", icon: "mdi-car-key" },
  { key: "tour", label: "Экскурсия", icon: "mdi-account-group" },
  { key: "sim", label: "Симка", icon: "mdi-sim" },
  { key: "other", label: "Другое", icon: "mdi-dots-horizontal" },
];

const STAY_TYPES = [
  { key: "hotel", label: "Отель" },
  { key: "airbnb", label: "Airbnb" },
  { key: "hostel", label: "Хостел" },
  { key: "ryokan", label: "Рёкан" },
  { key: "capsule", label: "Капсула" },
];

const STATUSES = [
  { key: "considering", label: "Рассматриваю", color: "#8b93a7" },
  { key: "favorite", label: "Фаворит", color: "#f59e0b" },
  { key: "selected", label: "Выбран", color: "#22c55e" },
  { key: "purchased", label: "Куплен", color: "#1767fd" },
  { key: "rejected", label: "Отклонён", color: "#e5484d" },
];

function emptyGroup() {
  return {
    title: "", kind: "other", note: "", fromDate: null, toDate: null,
    required: true, perPerson: false,
  };
}

function emptyOption() {
  return {
    title: "", url: "", status: "considering",
    priceAmount: 0, priceCurrency: "",
    cashbackPercent: null, cashbackAmount: null,
    rating: null, pros: "", cons: "", note: "",
    checkIn: null, checkOut: null, pricePerNight: null,
    stayType: "hotel", district: "", lat: null, lng: null, isAlsoPlace: false,
    participantIds: [],
  };
}

function emptySegment() {
  return {
    kind: "flight", carrier: "", number: "",
    fromCode: "", fromName: "", fromTerminal: "", fromTz: "Europe/Moscow", departAt: "",
    toCode: "", toName: "", toTerminal: "", toTz: "", arriveAt: "",
    baggage: "", note: "",
    layoverVisaRequired: false, layoverVisaNote: "",
    layoverAirportChange: false, layoverSelfTransfer: false, layoverNote: "",
  };
}

function kindOf(kind) {
  return KINDS.find((k) => k.key === kind) || KINDS[KINDS.length - 1];
}

function statusOf(key) {
  return STATUSES.find((s) => s.key === key) || STATUSES[0];
}

const compareGroup = computed(() =>
  prep.value?.groups.find((g) => g.id === compareGroupId.value) || null,
);

// Перелёты сравниваем по итогу вместе с мини-поездками: дешёвый билет
// с сутками в Шанхае — это ещё и день в Шанхае.
const sortedForCompare = computed(() => {
  const group = compareGroup.value;
  if (!group) return [];
  const key = group.kind === "flight" ? "totalWithSideTripsRub" : "netRub";
  return [...group.options].sort((a, b) => (a[key] || a.netRub) - (b[key] || b.netRub));
});

const participants = computed(() => props.trip.participants || []);

function toggleOptionParticipant(id) {
  const list = optionForm.value.participantIds || (optionForm.value.participantIds = []);
  const index = list.indexOf(id);
  if (index >= 0) list.splice(index, 1);
  else list.push(id);
}

function hm(minutes) {
  if (!minutes) return "";
  return `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, "0")} м`;
}

function rub(value) {
  return Math.round(value || 0).toLocaleString("ru");
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    prep.value = await fetchTripPrep(props.trip.id);
  } catch (e) {
    error.value = e.message || "не удалось загрузить подготовку";
  } finally {
    loading.value = false;
  }
}

async function seed() {
  await seedPrepGroups(props.trip.id);
  await load();
}

// --- Этапы ---

function openGroup(group) {
  groupEditing.value = group ? group.id : "new";
  groupForm.value = group ? { ...group } : emptyGroup();
}

async function saveGroup() {
  if (!groupForm.value.title.trim()) {
    error.value = "у этапа должно быть название";
    return;
  }
  try {
    if (groupEditing.value === "new") {
      await createPrepGroup(props.trip.id, groupForm.value);
    } else {
      await updatePrepGroup(groupEditing.value, groupForm.value);
    }
    groupEditing.value = null;
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить этап";
  }
}

async function removeGroup(group) {
  if (!window.confirm(`Удалить этап «${group.title}» со всеми вариантами?`)) return;
  await deletePrepGroup(group.id);
  await load();
}

// --- Варианты ---

function openOption(group, option) {
  optionGroup.value = group;
  optionEditing.value = option ? option.id : "new";
  optionForm.value = option
    ? { ...option }
    : {
        ...emptyOption(),
        // Билеты, визу и страховку обычно платишь рублями, остальное — на месте.
        priceCurrency: ["flight", "visa", "insurance"].includes(group.kind)
          ? "RUB"
          : props.trip.localCurrency,
      };
}

async function saveOption() {
  if (!optionForm.value.title.trim()) {
    error.value = "у варианта должно быть название";
    return;
  }
  try {
    if (optionEditing.value === "new") {
      await createPrepOption(optionGroup.value.id, optionForm.value);
    } else {
      await updatePrepOption(optionEditing.value, optionForm.value);
    }
    optionEditing.value = null;
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить вариант";
  }
}

async function removeOption(option) {
  if (!window.confirm(`Удалить вариант «${option.title}»?`)) return;
  await deletePrepOption(option.id);
  await load();
}

async function select(option, purchased = false) {
  await selectPrepOption(option.id, purchased);
  await load();
}

// --- Плечи перелёта ---

function openSegment(option, segment) {
  optionGroup.value = option;
  segmentEditing.value = segment ? segment.id : "new";
  segmentForm.value = segment ? { ...segment } : emptySegment();
}

async function saveSegment() {
  try {
    if (segmentEditing.value === "new") {
      await createPrepSegment(optionGroup.value.id, segmentForm.value);
    } else {
      await updatePrepSegment(segmentEditing.value, segmentForm.value);
    }
    segmentEditing.value = null;
    await load();
  } catch (e) {
    error.value = e.message || "не удалось сохранить плечо";
  }
}

async function removeSegment(segment) {
  if (!window.confirm("Удалить это плечо?")) return;
  await deletePrepSegment(segment.id);
  await load();
}

// --- Мини-поездка на пересадке ---

async function openSideTrip(segment) {
  sideTripFor.value = segment;
  sideTripForm.value = {
    countryId: "",
    title: `Пересадка: ${segment.toName || segment.toCode}`,
    includeInParentBudget: true,
  };
  if (!countries.value.length) countries.value = await fetchCountries();
}

async function saveSideTrip() {
  if (!sideTripForm.value.countryId) {
    error.value = "выбери страну пересадки";
    return;
  }
  try {
    const created = await createSideTrip(sideTripFor.value.id, sideTripForm.value);
    sideTripFor.value = null;
    router.push(`/travel/trips/${created.id}`);
  } catch (e) {
    error.value = e.message || "не удалось создать мини-поездку";
  }
}

// --- Файлы ---

function pickFile(optionId) {
  fileTargetId.value = optionId;
  fileInput.value.click();
}

async function onFilePicked(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await uploadPrepOptionFile(fileTargetId.value, file);
    await load();
  } catch (e) {
    error.value = e.message || "не удалось загрузить файл";
  } finally {
    event.target.value = "";
  }
}

async function removeFile(file) {
  await deletePrepOptionFile(file.id);
  await load();
}

onMounted(load);
</script>

<template>
  <div class="prep">
    <p v-if="error" class="prep-error" @click="error = ''">{{ error }}</p>
    <div v-if="loading" class="prep-empty">Загружаю…</div>

    <template v-else-if="prep">
      <!-- Итог -->
      <div class="prep-summary">
        <div class="prep-summary__main">
          <span class="prep-summary__label">Подготовка обойдётся</span>
          <span class="prep-summary__value">{{ rub(prep.totalRub) }} ₽</span>
        </div>
        <div class="prep-summary__extra">
          <span v-if="prep.cashbackRub">кэшбэк вернёт {{ rub(prep.cashbackRub) }} ₽</span>
          <span v-if="prep.sideTripsRub">мини-поездки {{ rub(prep.sideTripsRub) }} ₽</span>
          <span v-if="prep.incompleteIds.length" class="prep-summary__warn">
            не выбрано в {{ prep.incompleteIds.length }} этапах
          </span>
        </div>
        <button class="prep-primary" @click="openGroup(null)">
          <i class="mdi mdi-plus"></i> Этап
        </button>
      </div>

      <!-- Сколько выходит на каждого: билеты личные, жильё делится -->
      <div v-if="prep.byParticipant?.length" class="prep-people">
        <div v-for="p in prep.byParticipant" :key="p.participantId" class="prep-person">
          <span class="prep-person__dot" :style="{ background: p.color || '#1767fd' }"></span>
          <div class="prep-person__body">
            <b>{{ p.name }}</b>
            <span>лично {{ rub(p.personalRub) }} ₽ · доля общего {{ rub(p.sharedRub) }} ₽</span>
          </div>
          <b class="prep-person__total">{{ rub(p.totalRub) }} ₽</b>
        </div>
      </div>

      <div v-if="!prep.groups.length" class="prep-empty">
        <p>Этапов пока нет.</p>
        <p class="prep-hint">
          Этап — это и статья бюджета, и таблица сравнения: кладёшь внутрь варианты
          билетов или отелей и отмечаешь выбранный.
        </p>
        <button class="prep-primary" @click="seed">Разложить типовые этапы</button>
      </div>

      <!-- Этапы -->
      <section v-for="group in prep.groups" :key="group.id" class="prep-group">
        <header class="prep-group__head" @click="expanded[group.id] = !expanded[group.id]">
          <i class="mdi prep-group__icon" :class="kindOf(group.kind).icon"></i>
          <div class="prep-group__title">
            <h3>
              {{ group.title }}
              <span v-if="group.perPerson" class="prep-tag">на каждого</span>
            </h3>
            <span class="prep-group__meta">
              {{ group.options.length }} вариантов
              <template v-if="group.fromDate">· {{ group.fromDate }} — {{ group.toDate }}</template>
              <template v-if="group.missingFor?.length">
                · не выбрано для: {{ group.missingFor.join(", ") }}
              </template>
            </span>
          </div>
          <div class="prep-group__total">
            <template v-if="group.selectedOptionIds?.length">{{ rub(group.totalRub) }} ₽</template>
            <span v-else-if="group.incomplete" class="prep-group__warn">не выбрано</span>
            <span v-else class="prep-group__skip">не нужно</span>
          </div>
          <button class="prep-icon" title="Сравнить таблицей" @click.stop="compareGroupId = group.id">
            <i class="mdi mdi-table"></i>
          </button>
          <button class="prep-icon" @click.stop="openGroup(group)"><i class="mdi mdi-pencil"></i></button>
          <button class="prep-icon" @click.stop="removeGroup(group)"><i class="mdi mdi-delete"></i></button>
          <i class="mdi prep-group__chevron" :class="expanded[group.id] ? 'mdi-chevron-up' : 'mdi-chevron-down'"></i>
        </header>

        <div v-if="expanded[group.id]" class="prep-group__body">
          <article
            v-for="option in group.options"
            :key="option.id"
            class="prep-option"
            :class="{ 'prep-option--selected': ['selected', 'purchased'].includes(option.status) }"
          >
            <div class="prep-option__head">
              <span
                class="prep-option__status"
                :style="{ background: statusOf(option.status).color }"
                :title="statusOf(option.status).label"
              ></span>
              <a v-if="option.url" :href="option.url" target="_blank" rel="noopener" class="prep-option__title">
                {{ option.title }} <i class="mdi mdi-open-in-new"></i>
              </a>
              <span v-else class="prep-option__title">{{ option.title }}</span>

              <span v-if="option.participantNames?.length" class="prep-tag prep-tag--who">
                {{ option.participantNames.join(", ") }}
              </span>

              <span v-if="option.rating" class="prep-option__rating">
                <i v-for="n in option.rating" :key="n" class="mdi mdi-star"></i>
              </span>

              <div class="prep-option__price">
                <b>{{ rub(option.netRub) }} ₽</b>
                <em v-if="option.priceCurrency !== 'RUB'">
                  {{ option.priceAmount }} {{ option.priceCurrency }}
                </em>
                <em v-if="option.netRub !== option.priceRub">
                  было {{ rub(option.priceRub) }} ₽
                </em>
              </div>
            </div>

            <div v-if="option.nights" class="prep-option__stay">
              {{ option.checkIn }} — {{ option.checkOut }} · {{ option.nights }} ночей ·
              {{ Math.round(option.pricePerNight || 0) }} {{ option.priceCurrency }}/ночь
              <template v-if="option.district">· {{ option.district }}</template>
              <span v-if="option.isAlsoPlace" class="prep-tag">и место отдыха</span>
            </div>

            <!-- Плечи перелёта: реальная длительность и пересадки -->
            <div v-if="option.segments.length" class="prep-segments">
              <div class="prep-segments__total">
                <b>{{ option.stopsCount === 0 ? "прямой" : `пересадок: ${option.stopsCount}` }}</b>
                · дверь-в-дверь {{ hm(option.totalDoorToDoorMin) }}
                · в воздухе {{ hm(option.totalTravelMin) }}
                <template v-if="option.totalLayoverMin">
                  · ожидание {{ hm(option.totalLayoverMin) }}
                </template>
                <span v-if="option.needsTransitVisa" class="prep-flag prep-flag--danger">
                  <i class="mdi mdi-passport"></i> нужна транзитная виза
                </span>
                <span v-if="option.hasAirportChange" class="prep-flag prep-flag--warn">
                  <i class="mdi mdi-swap-horizontal"></i> смена аэропорта
                </span>
                <span v-if="option.hasSelfTransfer" class="prep-flag prep-flag--warn">
                  <i class="mdi mdi-bag-checked"></i> багаж получать самому
                </span>
              </div>

              <div v-for="segment in option.segments" :key="segment.id" class="prep-segment">
                <div class="prep-segment__row" @click="openSegment(option, segment)">
                  <span class="prep-segment__route">
                    {{ segment.fromCode }} → {{ segment.toCode }}
                  </span>
                  <span class="prep-segment__time">
                    {{ segment.departAt.slice(11) }} → {{ segment.arriveAt.slice(11) }}
                  </span>
                  <span class="prep-segment__dur">{{ hm(segment.durationMin) }}</span>
                  <span v-if="segment.tzShiftHours" class="prep-segment__tz">
                    {{ segment.tzShiftHours > 0 ? "+" : "" }}{{ segment.tzShiftHours }} ч
                  </span>
                  <span class="prep-segment__carrier">
                    {{ segment.carrier }} {{ segment.number }}
                    <template v-if="segment.fromTerminal || segment.toTerminal">
                      · терминал {{ segment.fromTerminal || "?" }} → {{ segment.toTerminal || "?" }}
                    </template>
                  </span>
                </div>

                <div v-if="segment.layoverMin" class="prep-layover">
                  <div class="prep-layover__head">
                    <i class="mdi mdi-timer-sand"></i>
                    пересадка <b>{{ hm(segment.layoverMin) }}</b>
                    в {{ segment.toName || segment.toCode }}
                  </div>

                  <div class="prep-layover__flags">
                    <span v-if="segment.layoverVisaRequired" class="prep-flag prep-flag--danger">
                      виза{{ segment.layoverVisaNote ? `: ${segment.layoverVisaNote}` : "" }}
                    </span>
                    <span v-if="segment.layoverAirportChange" class="prep-flag prep-flag--warn">
                      другой аэропорт
                    </span>
                    <span v-if="segment.layoverSelfTransfer" class="prep-flag prep-flag--warn">
                      багаж заново
                    </span>
                    <span v-if="segment.layoverNote" class="prep-layover__note">
                      {{ segment.layoverNote }}
                    </span>
                  </div>

                  <div class="prep-layover__actions">
                    <template v-if="segment.sideTripId">
                      <button class="prep-link" @click="router.push(`/travel/trips/${segment.sideTripId}`)">
                        открыть «{{ segment.sideTripTitle }}»
                      </button>
                      <span v-if="segment.sideTripRub" class="prep-layover__cost">
                        {{ rub(segment.sideTripRub) }} ₽
                        <em v-if="!segment.sideTripCounted">не в общем бюджете</em>
                      </span>
                    </template>
                    <button
                      v-else-if="segment.layoverIsLong"
                      class="prep-link"
                      @click="openSideTrip(segment)"
                    >
                      успеваю погулять — сделать мини-поездку
                    </button>
                  </div>
                </div>
              </div>
              <button class="prep-mini" @click="openSegment(option, null)">
                <i class="mdi mdi-plus"></i> плечо
              </button>
            </div>

            <div v-if="option.pros || option.cons" class="prep-option__proscons">
              <span v-if="option.pros" class="prep-pros"><i class="mdi mdi-plus-thick"></i>{{ option.pros }}</span>
              <span v-if="option.cons" class="prep-cons"><i class="mdi mdi-minus-thick"></i>{{ option.cons }}</span>
            </div>

            <div v-if="option.files.length" class="prep-files">
              <a v-for="file in option.files" :key="file.id" :href="file.url" target="_blank" rel="noopener">
                <i class="mdi mdi-paperclip"></i>{{ file.title || file.filename }}
                <button @click.prevent="removeFile(file)"><i class="mdi mdi-close"></i></button>
              </a>
            </div>

            <div class="prep-option__actions">
              <button
                v-if="!['selected', 'purchased'].includes(option.status)"
                class="prep-choose"
                @click="select(option)"
              >
                <i class="mdi mdi-check"></i> Выбрать
              </button>
              <button v-if="option.status === 'selected'" class="prep-choose" @click="select(option, true)">
                <i class="mdi mdi-cart-check"></i> Куплен
              </button>
              <button v-if="option.kind !== 'flight'" class="prep-mini" @click="openSegment(option, null)">
                <i class="mdi mdi-airplane"></i> плечо
              </button>
              <button class="prep-mini" @click="pickFile(option.id)"><i class="mdi mdi-upload"></i></button>
              <button class="prep-mini" @click="openOption(group, option)"><i class="mdi mdi-pencil"></i></button>
              <button class="prep-mini" @click="removeOption(option)"><i class="mdi mdi-delete"></i></button>
            </div>
          </article>

          <button class="prep-add" @click="openOption(group, null)">
            <i class="mdi mdi-plus"></i> Добавить вариант
          </button>
        </div>
      </section>
    </template>

    <input ref="fileInput" type="file" hidden @change="onFilePicked" />

    <!-- Таблица сравнения -->
    <div v-if="compareGroup" class="prep-modal-backdrop" @click.self="compareGroupId = ''">
      <div class="prep-modal prep-modal--wide">
        <h2>Сравнение: {{ compareGroup.title }}</h2>
        <div class="prep-table-wrap">
          <table class="prep-table">
            <thead>
              <tr>
                <th>Вариант</th>
                <th v-if="compareGroup.perPerson">Кому</th>
                <th>Итог, ₽</th>
                <th v-if="compareGroup.kind === 'flight'">С мини-поездкой</th>
                <th>Цена</th>
                <th>Кэшбэк</th>
                <th>★</th>
                <template v-if="compareGroup.kind === 'flight'">
                  <th>Пересадок</th>
                  <th>Дверь-в-дверь</th>
                  <th>В воздухе</th>
                  <th>Ожидание</th>
                  <th>Дольше всего</th>
                  <th>Виза</th>
                  <th>Аэропорт</th>
                  <th>Багаж</th>
                </template>
                <template v-if="compareGroup.kind === 'stay'">
                  <th>Ночей</th>
                  <th>За ночь</th>
                  <th>Район</th>
                </template>
                <th>Плюсы</th>
                <th>Минусы</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="option in sortedForCompare"
                :key="option.id"
                :class="{ 'prep-table__selected': ['selected', 'purchased'].includes(option.status) }"
              >
                <td>{{ option.title }}</td>
                <td v-if="compareGroup.perPerson">
                  {{ option.participantNames?.join(", ") || "все" }}
                </td>
                <td><b>{{ rub(option.netRub) }}</b></td>
                <td v-if="compareGroup.kind === 'flight'">
                  <b>{{ rub(option.totalWithSideTripsRub) }}</b>
                  <em v-if="option.sideTripsCount" class="prep-table__hint">
                    +{{ option.sideTripsCount }} поездк.
                  </em>
                </td>
                <td>{{ option.priceAmount }} {{ option.priceCurrency }}</td>
                <td>
                  <template v-if="option.cashbackPercent">{{ option.cashbackPercent }}%</template>
                  <template v-else-if="option.cashbackAmount">{{ option.cashbackAmount }}</template>
                  <template v-else>—</template>
                </td>
                <td>{{ option.rating || "—" }}</td>
                <template v-if="compareGroup.kind === 'flight'">
                  <td>{{ option.segments.length ? option.stopsCount : "—" }}</td>
                  <td>{{ hm(option.totalDoorToDoorMin) || "—" }}</td>
                  <td>{{ hm(option.totalTravelMin) || "—" }}</td>
                  <td>{{ hm(option.totalLayoverMin) || "—" }}</td>
                  <td>{{ hm(option.maxLayoverMin) || "—" }}</td>
                  <td>
                    <span v-if="option.needsTransitVisa" class="prep-flag prep-flag--danger">нужна</span>
                    <template v-else>—</template>
                  </td>
                  <td>
                    <span v-if="option.hasAirportChange" class="prep-flag prep-flag--warn">меняется</span>
                    <template v-else>—</template>
                  </td>
                  <td>
                    <span v-if="option.hasSelfTransfer" class="prep-flag prep-flag--warn">заново</span>
                    <template v-else>насквозь</template>
                  </td>
                </template>
                <template v-if="compareGroup.kind === 'stay'">
                  <td>{{ option.nights || "—" }}</td>
                  <td>{{ option.pricePerNight ? Math.round(option.pricePerNight) : "—" }}</td>
                  <td>{{ option.district || "—" }}</td>
                </template>
                <td class="prep-table__text">{{ option.pros }}</td>
                <td class="prep-table__text">{{ option.cons }}</td>
                <td>
                  <button
                    v-if="!['selected', 'purchased'].includes(option.status)"
                    class="prep-mini"
                    @click="select(option)"
                  >
                    выбрать
                  </button>
                  <i v-else class="mdi mdi-check-circle" style="color: #22c55e"></i>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="prep-modal__actions">
          <button class="prep-ghost" @click="compareGroupId = ''">Закрыть</button>
        </div>
      </div>
    </div>

    <!-- Этап -->
    <div v-if="groupEditing" class="prep-modal-backdrop" @click.self="groupEditing = null">
      <div class="prep-modal">
        <h2>{{ groupEditing === "new" ? "Новый этап" : "Этап" }}</h2>
        <label class="prep-field">
          Название
          <input v-model="groupForm.title" class="prep-input" type="text" placeholder="Перелёт Москва → Токио" />
        </label>
        <div class="prep-kinds">
          <button
            v-for="k in KINDS"
            :key="k.key"
            :class="{ active: groupForm.kind === k.key }"
            @click="groupForm.kind = k.key"
          >
            <i class="mdi" :class="k.icon"></i><span>{{ k.label }}</span>
          </button>
        </div>
        <div v-if="groupForm.kind === 'stay'" class="prep-row">
          <label class="prep-field">
            Ночи с
            <input v-model="groupForm.fromDate" class="prep-input" type="date" />
          </label>
          <label class="prep-field">
            по
            <input v-model="groupForm.toDate" class="prep-input" type="date" />
          </label>
        </div>
        <label class="prep-check">
          <input v-model="groupForm.required" type="checkbox" />
          обязательный — без выбора бюджет считается неполным
        </label>
        <label class="prep-check">
          <input v-model="groupForm.perPerson" type="checkbox" />
          у каждого свой — билет, страховка или симка берутся на человека,
          и выбранных вариантов будет несколько
        </label>
        <label class="prep-field">
          Заметка
          <textarea v-model="groupForm.note" class="prep-input prep-textarea" rows="3"></textarea>
        </label>
        <div class="prep-modal__actions">
          <button class="prep-ghost" @click="groupEditing = null">Отмена</button>
          <button class="prep-primary" @click="saveGroup">Сохранить</button>
        </div>
      </div>
    </div>

    <!-- Вариант -->
    <div v-if="optionEditing" class="prep-modal-backdrop" @click.self="optionEditing = null">
      <div class="prep-modal">
        <h2>{{ optionEditing === "new" ? "Новый вариант" : "Вариант" }}</h2>

        <label class="prep-field">
          Название
          <input v-model="optionForm.title" class="prep-input" type="text" placeholder="China Eastern через Шанхай" />
        </label>
        <label class="prep-field">
          Ссылка
          <input v-model="optionForm.url" class="prep-input" type="text" placeholder="https://" />
        </label>

        <!-- Два поля суммы: рубли без пересчёта, местная валюта — с пересчётом -->
        <div class="prep-row">
          <label class="prep-field">
            Цена, ₽
            <input
              class="prep-input"
              type="number"
              step="0.01"
              :value="optionForm.priceCurrency === 'RUB' ? optionForm.priceAmount : null"
              @input="
                optionForm.priceAmount = Number($event.target.value || 0);
                optionForm.priceCurrency = 'RUB';
              "
            />
          </label>
          <label class="prep-field">
            Цена, {{ trip.localCurrency }}
            <input
              class="prep-input"
              type="number"
              step="0.01"
              :value="optionForm.priceCurrency === trip.localCurrency ? optionForm.priceAmount : null"
              @input="
                optionForm.priceAmount = Number($event.target.value || 0);
                optionForm.priceCurrency = trip.localCurrency;
              "
            />
          </label>
        </div>

        <div class="prep-row">
          <label class="prep-field">
            Кэшбэк, %
            <input v-model.number="optionForm.cashbackPercent" class="prep-input" type="number" step="0.1" />
          </label>
          <label class="prep-field">
            Кэшбэк, сумма
            <input v-model.number="optionForm.cashbackAmount" class="prep-input" type="number" step="0.01" />
          </label>
        </div>

        <div v-if="participants.length" class="prep-field">
          На кого
          <div class="prep-who">
            <button
              v-for="p in participants"
              :key="p.id"
              :class="{ active: optionForm.participantIds?.includes(p.id) }"
              @click="toggleOptionParticipant(p.id)"
            >
              {{ p.name }}
            </button>
          </div>
          <p class="prep-hint">
            Никого не выбрал — вариант считается общим и делится на всех поровну.
          </p>
        </div>

        <label class="prep-field">
          Личная оценка
          <div class="prep-stars">
            <button
              v-for="n in 5"
              :key="n"
              :class="{ active: (optionForm.rating || 0) >= n }"
              @click="optionForm.rating = optionForm.rating === n ? null : n"
            >
              <i class="mdi mdi-star"></i>
            </button>
          </div>
        </label>

        <template v-if="optionGroup?.kind === 'stay'">
          <div class="prep-row">
            <label class="prep-field">
              Заезд
              <input v-model="optionForm.checkIn" class="prep-input" type="date" />
            </label>
            <label class="prep-field">
              Выезд
              <input v-model="optionForm.checkOut" class="prep-input" type="date" />
            </label>
          </div>
          <p class="prep-hint">
            Заполни либо общую цену, либо цену за ночь — второе досчитается само.
          </p>
          <div class="prep-row">
            <label class="prep-field">
              Цена за ночь
              <input v-model.number="optionForm.pricePerNight" class="prep-input" type="number" step="0.01" />
            </label>
            <label class="prep-field">
              Тип
              <select v-model="optionForm.stayType" class="prep-input">
                <option v-for="t in STAY_TYPES" :key="t.key" :value="t.key">{{ t.label }}</option>
              </select>
            </label>
          </div>
          <label class="prep-field">
            Район
            <input v-model="optionForm.district" class="prep-input" type="text" />
          </label>
          <div class="prep-row">
            <label class="prep-field">
              Широта
              <input v-model.number="optionForm.lat" class="prep-input" type="number" step="0.000001" />
            </label>
            <label class="prep-field">
              Долгота
              <input v-model.number="optionForm.lng" class="prep-input" type="number" step="0.000001" />
            </label>
          </div>
          <label class="prep-check">
            <input v-model="optionForm.isAlsoPlace" type="checkbox" />
            это ещё и место отдыха — онсэн, бассейн, вид
          </label>
        </template>

        <div class="prep-row">
          <label class="prep-field">
            Плюсы
            <textarea v-model="optionForm.pros" class="prep-input prep-textarea" rows="2"></textarea>
          </label>
          <label class="prep-field">
            Минусы
            <textarea v-model="optionForm.cons" class="prep-input prep-textarea" rows="2"></textarea>
          </label>
        </div>

        <label class="prep-field">
          Заметка
          <textarea v-model="optionForm.note" class="prep-input prep-textarea" rows="3"></textarea>
        </label>

        <div class="prep-modal__actions">
          <button class="prep-ghost" @click="optionEditing = null">Отмена</button>
          <button class="prep-primary" @click="saveOption">Сохранить</button>
        </div>
      </div>
    </div>

    <!-- Плечо перелёта -->
    <div v-if="segmentEditing" class="prep-modal-backdrop" @click.self="segmentEditing = null">
      <div class="prep-modal">
        <h2>Плечо перелёта</h2>
        <p class="prep-hint">
          Время указывай местное для каждого аэропорта — реальную длительность
          и пересадку посчитает сервер по часовым поясам.
        </p>

        <div class="prep-row">
          <label class="prep-field">
            Перевозчик
            <input v-model="segmentForm.carrier" class="prep-input" type="text" placeholder="China Eastern" />
          </label>
          <label class="prep-field">
            Номер рейса
            <input v-model="segmentForm.number" class="prep-input" type="text" placeholder="MU 592" />
          </label>
        </div>

        <div class="prep-row">
          <label class="prep-field">
            Откуда, код
            <input v-model="segmentForm.fromCode" class="prep-input" type="text" placeholder="SVO" />
          </label>
          <label class="prep-field">
            Часовой пояс
            <input v-model="segmentForm.fromTz" class="prep-input" type="text" placeholder="Europe/Moscow" />
          </label>
        </div>
        <div class="prep-row">
          <label class="prep-field">
            Название аэропорта
            <input v-model="segmentForm.fromName" class="prep-input" type="text" placeholder="Москва, Шереметьево" />
          </label>
          <label class="prep-field">
            Терминал
            <input v-model="segmentForm.fromTerminal" class="prep-input" type="text" placeholder="C" />
          </label>
        </div>
        <label class="prep-field">
          Вылет, местное время
          <input v-model="segmentForm.departAt" class="prep-input" type="datetime-local" />
        </label>

        <div class="prep-row">
          <label class="prep-field">
            Куда, код
            <input v-model="segmentForm.toCode" class="prep-input" type="text" placeholder="PVG" />
          </label>
          <label class="prep-field">
            Часовой пояс
            <input v-model="segmentForm.toTz" class="prep-input" type="text" placeholder="Asia/Shanghai" />
          </label>
        </div>
        <div class="prep-row">
          <label class="prep-field">
            Название аэропорта
            <input v-model="segmentForm.toName" class="prep-input" type="text" placeholder="Шанхай, Пудун" />
          </label>
          <label class="prep-field">
            Терминал
            <input v-model="segmentForm.toTerminal" class="prep-input" type="text" placeholder="2" />
          </label>
        </div>
        <label class="prep-field">
          Прилёт, местное время
          <input v-model="segmentForm.arriveAt" class="prep-input" type="datetime-local" />
        </label>

        <div class="prep-row">
          <label class="prep-field">
            Багаж
            <input v-model="segmentForm.baggage" class="prep-input" type="text" placeholder="23 кг + ручная" />
          </label>
          <label class="prep-field">
            Заметка
            <input v-model="segmentForm.note" class="prep-input" type="text" />
          </label>
        </div>

        <!-- Пересадка после этого плеча: часто именно она решает, годится ли вариант -->
        <div class="prep-layover-form">
          <div class="prep-layover-form__title">Пересадка после этого плеча</div>
          <label class="prep-check">
            <input v-model="segmentForm.layoverVisaRequired" type="checkbox" />
            нужна транзитная виза
          </label>
          <input
            v-if="segmentForm.layoverVisaRequired"
            v-model="segmentForm.layoverVisaNote"
            class="prep-input"
            type="text"
            placeholder="144-часовой безвиз при вылете в третью страну"
          />
          <label class="prep-check">
            <input v-model="segmentForm.layoverAirportChange" type="checkbox" />
            прилёт и вылет из разных аэропортов
          </label>
          <label class="prep-check">
            <input v-model="segmentForm.layoverSelfTransfer" type="checkbox" />
            багаж не летит насквозь — получать и сдавать заново
          </label>
          <input
            v-model="segmentForm.layoverNote"
            class="prep-input"
            type="text"
            placeholder="заметка про пересадку: где ждать, есть ли душ"
          />
        </div>

        <div class="prep-modal__actions">
          <button
            v-if="segmentEditing !== 'new'"
            class="prep-danger"
            @click="removeSegment({ id: segmentEditing }); segmentEditing = null"
          >
            Удалить
          </button>
          <div class="prep-spacer"></div>
          <button class="prep-ghost" @click="segmentEditing = null">Отмена</button>
          <button class="prep-primary" @click="saveSegment">Сохранить</button>
        </div>
      </div>
    </div>

    <!-- Мини-поездка на пересадке -->
    <div v-if="sideTripFor" class="prep-modal-backdrop" @click.self="sideTripFor = null">
      <div class="prep-modal">
        <h2>Погулять на пересадке</h2>
        <p class="prep-hint">
          Пересадка {{ hm(sideTripFor.layoverMin) }} в {{ sideTripFor.toName || sideTripFor.toCode }}.
          Заведём отдельную мини-поездку со своей картой и днём.
        </p>
        <label class="prep-field">
          Страна пересадки
          <select v-model="sideTripForm.countryId" class="prep-input">
            <option value="">— выбери —</option>
            <option v-for="c in countries" :key="c.id" :value="c.id">{{ c.emoji }} {{ c.name }}</option>
          </select>
        </label>
        <label class="prep-field">
          Название
          <input v-model="sideTripForm.title" class="prep-input" type="text" />
        </label>
        <label class="prep-check">
          <input v-model="sideTripForm.includeInParentBudget" type="checkbox" />
          считать её бюджет в общий бюджет поездки
        </label>
        <div class="prep-modal__actions">
          <button class="prep-ghost" @click="sideTripFor = null">Отмена</button>
          <button class="prep-primary" @click="saveSideTrip">Создать</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prep {
  flex: 1;
  padding: 16px 20px 60px;
  overflow-y: auto;
  color: #eaeef7;
}

.prep-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  margin-bottom: 16px;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 13px;
}

.prep-summary__main {
  display: flex;
  flex-direction: column;
}

.prep-summary__label {
  font-size: 11px;
  color: #6e7688;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.prep-summary__value {
  font-size: 22px;
  font-weight: 600;
}

.prep-summary__extra {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: #6e7688;
}

.prep-summary__warn {
  color: #ffd666;
}

.prep-group {
  margin-bottom: 10px;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 12px;
  overflow: hidden;
}

.prep-group__head {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 14px;
  cursor: pointer;
}

.prep-group__head:hover {
  background: #1f232e;
}

.prep-group__icon {
  font-size: 20px;
  color: #8b93a7;
}

.prep-group__title {
  flex: 1;
  min-width: 0;
}

.prep-group__title h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.prep-group__meta {
  font-size: 11px;
  color: #6e7688;
}

.prep-group__total {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.prep-group__warn {
  font-size: 12px;
  font-weight: 400;
  color: #ffd666;
}

.prep-group__skip {
  font-size: 12px;
  font-weight: 400;
  color: #4d5464;
}

.prep-group__chevron {
  color: #4d5464;
}

.prep-group__body {
  padding: 4px 12px 12px;
}

.prep-option {
  padding: 11px 13px;
  margin-bottom: 7px;
  background: #12141a;
  border: 1px solid #232733;
  border-radius: 11px;
}

.prep-option--selected {
  border-color: rgba(34, 197, 94, 0.5);
  background: rgba(34, 197, 94, 0.06);
}

.prep-option__head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.prep-option__status {
  flex-shrink: 0;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.prep-option__title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: #eaeef7;
  text-decoration: none;
}

.prep-option__title:hover {
  color: #1767fd;
}

.prep-option__rating {
  font-size: 12px;
  color: #ffd666;
}

.prep-option__price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 14px;
  white-space: nowrap;
}

.prep-option__price em {
  font-size: 11px;
  font-style: normal;
  color: #6e7688;
}

.prep-option__stay {
  margin-top: 6px;
  font-size: 12px;
  color: #8b93a7;
}

.prep-tag {
  padding: 2px 7px;
  margin-left: 6px;
  font-size: 11px;
  color: #06b6d4;
  background: rgba(6, 182, 212, 0.12);
  border-radius: 999px;
}

.prep-segments {
  padding: 8px 0 0;
  margin-top: 8px;
  border-top: 1px dashed #232733;
}

.prep-segments__total {
  margin-bottom: 5px;
  font-size: 11px;
  color: #8b93a7;
}

.prep-segment__row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 5px 7px;
  font-size: 12px;
  border-radius: 7px;
  cursor: pointer;
}

.prep-segment__row:hover {
  background: #1b1e27;
}

.prep-segment__route {
  min-width: 92px;
  font-weight: 600;
}

.prep-segment__time {
  color: #1767fd;
}

.prep-segment__dur {
  color: #b9c0cf;
}

.prep-segment__tz {
  font-size: 11px;
  color: #a855f7;
}

.prep-segment__carrier {
  font-size: 11px;
  color: #6e7688;
}

.prep-layover {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
  padding: 4px 7px 4px 22px;
  font-size: 11px;
  color: #ffd666;
}

.prep-link {
  padding: 2px 8px;
  font-size: 11px;
  color: #1767fd;
  background: rgba(23, 103, 253, 0.12);
  border: none;
  border-radius: 999px;
  cursor: pointer;
}

.prep-option__proscons {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 7px;
  font-size: 12px;
}

.prep-pros {
  color: #86d68b;
}

.prep-cons {
  color: #ff9d9f;
}

.prep-pros i,
.prep-cons i {
  margin-right: 4px;
  font-size: 11px;
}

.prep-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 7px;
}

.prep-files a {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  font-size: 11px;
  color: #b9c0cf;
  text-decoration: none;
  background: #1b1e27;
  border-radius: 999px;
}

.prep-files button {
  padding: 0 0 0 3px;
  color: #6e7688;
  background: transparent;
  border: none;
  cursor: pointer;
}

.prep-option__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 9px;
}

.prep-choose {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  font-size: 12px;
  color: #fff;
  background: #22c55e;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.prep-mini {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  font-size: 12px;
  color: #b9c0cf;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 8px;
  cursor: pointer;
}

.prep-mini:hover {
  color: #fff;
  border-color: #3d4353;
}

.prep-add {
  width: 100%;
  padding: 9px;
  font-size: 12px;
  color: #6e7688;
  background: transparent;
  border: 1px dashed #2c313d;
  border-radius: 10px;
  cursor: pointer;
}

.prep-add:hover {
  color: #eaeef7;
  border-color: #3d4353;
}

.prep-icon {
  padding: 5px;
  color: #6e7688;
  background: transparent;
  border: none;
  cursor: pointer;
}

.prep-icon:hover {
  color: #eaeef7;
}

.prep-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 15px;
  font-size: 13px;
  color: #fff;
  white-space: nowrap;
  background: #1767fd;
  border: none;
  border-radius: 9px;
  cursor: pointer;
}

.prep-ghost {
  padding: 9px 15px;
  font-size: 13px;
  color: #b9c0cf;
  background: transparent;
  border: 1px solid #2c313d;
  border-radius: 9px;
  cursor: pointer;
}

.prep-danger {
  padding: 9px 15px;
  font-size: 13px;
  color: #ff9d9f;
  background: transparent;
  border: 1px solid rgba(229, 72, 77, 0.4);
  border-radius: 9px;
  cursor: pointer;
}

.prep-spacer {
  flex: 1;
}

.prep-error {
  padding: 9px 14px;
  margin: 0 0 12px;
  font-size: 13px;
  color: #ff9d9f;
  cursor: pointer;
  background: rgba(229, 72, 77, 0.14);
  border-radius: 9px;
}

.prep-empty {
  padding: 40px 20px;
  color: #6e7688;
  text-align: center;
}

.prep-hint {
  font-size: 12px;
  color: #6e7688;
}

.prep-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(8, 9, 13, 0.72);
}

.prep-modal {
  width: 100%;
  max-width: 520px;
  max-height: 92vh;
  padding: 20px;
  overflow-y: auto;
  background: #1b1e27;
  border: 1px solid #2c313d;
  border-radius: 16px;
}

.prep-modal--wide {
  max-width: 1100px;
}

.prep-modal h2 {
  margin: 0 0 10px;
  font-size: 18px;
}

.prep-modal__actions {
  display: flex;
  gap: 8px;
  margin-top: 18px;
}

.prep-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  color: #eaeef7;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 9px;
  outline: none;
}

.prep-input:focus {
  border-color: #1767fd;
}

.prep-textarea {
  font-family: inherit;
  resize: vertical;
}

.prep-field {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  color: #8b93a7;
}

.prep-field .prep-input {
  margin-top: 4px;
}

.prep-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.prep-check {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  font-size: 12px;
  color: #b9c0cf;
  cursor: pointer;
}

.prep-kinds {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 5px;
  margin-top: 10px;
}

.prep-kinds button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 4px;
  font-size: 11px;
  color: #b9c0cf;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 9px;
  cursor: pointer;
}

.prep-kinds button.active {
  color: #fff;
  background: #1767fd;
  border-color: #1767fd;
}

.prep-stars {
  display: flex;
  gap: 3px;
  margin-top: 4px;
}

.prep-stars button {
  padding: 4px;
  font-size: 18px;
  color: #2c313d;
  background: transparent;
  border: none;
  cursor: pointer;
}

.prep-stars button.active {
  color: #ffd666;
}

.prep-people {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.prep-person {
  display: flex;
  gap: 9px;
  align-items: center;
  padding: 10px 14px;
  background: #1b1e27;
  border: 1px solid #262b36;
  border-radius: 11px;
}

.prep-person__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.prep-person__body {
  display: flex;
  flex-direction: column;
}

.prep-person__body b {
  font-size: 13px;
}

.prep-person__body span {
  font-size: 11px;
  color: #6e7688;
}

.prep-person__total {
  margin-left: 10px;
  font-size: 15px;
}

.prep-tag--who {
  color: #86d68b;
  background: rgba(34, 197, 94, 0.13);
}

.prep-flag {
  padding: 2px 8px;
  font-size: 11px;
  white-space: nowrap;
  border-radius: 999px;
}

.prep-flag--danger {
  color: #ff9d9f;
  background: rgba(229, 72, 77, 0.16);
}

.prep-flag--warn {
  color: #ffd666;
  background: rgba(255, 214, 102, 0.14);
}

.prep-segments__total {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
}

.prep-layover {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px 6px 22px;
  margin: 3px 0;
  background: rgba(255, 214, 102, 0.05);
  border-left: 2px dashed rgba(255, 214, 102, 0.4);
  border-radius: 0 8px 8px 0;
}

.prep-layover__head {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  color: #ffd666;
}

.prep-layover__flags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}

.prep-layover__note {
  font-size: 11px;
  color: #8b93a7;
}

.prep-layover__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.prep-layover__cost {
  font-size: 11px;
  color: #b9c0cf;
}

.prep-layover__cost em {
  font-style: normal;
  color: #6e7688;
}

.prep-layover-form {
  padding: 12px 14px;
  margin-top: 14px;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 11px;
}

.prep-layover-form__title {
  margin-bottom: 6px;
  font-size: 11px;
  color: #6e7688;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.prep-layover-form .prep-input {
  margin-top: 6px;
}

.prep-who {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 5px;
}

.prep-who button {
  padding: 6px 12px;
  font-size: 12px;
  color: #b9c0cf;
  background: #12141a;
  border: 1px solid #2c313d;
  border-radius: 999px;
  cursor: pointer;
}

.prep-who button.active {
  color: #fff;
  background: #22c55e;
  border-color: #22c55e;
}

.prep-table__hint {
  margin-left: 4px;
  font-size: 10px;
  font-style: normal;
  color: #6e7688;
}

.prep-table-wrap {
  overflow-x: auto;
}

.prep-table {
  width: 100%;
  font-size: 12px;
  border-collapse: collapse;
}

.prep-table th {
  padding: 8px 10px;
  color: #6e7688;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid #2c313d;
}

.prep-table td {
  padding: 9px 10px;
  border-bottom: 1px solid #1f232e;
}

.prep-table__selected {
  background: rgba(34, 197, 94, 0.07);
}

.prep-table__text {
  max-width: 200px;
  color: #8b93a7;
}

@media (max-width: 900px) {
  .prep {
    padding: 12px 12px 60px;
  }

  .prep-summary {
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px;
  }

  .prep-summary .prep-primary {
    width: 100%;
    justify-content: center;
  }

  .prep-row {
    grid-template-columns: 1fr;
  }

  .prep-option__head {
    flex-wrap: wrap;
  }

  .prep-option__price {
    align-items: flex-start;
  }

  .prep-option__actions button {
    padding: 9px 12px;
  }

  .prep-modal {
    padding: 14px;
  }
}
</style>
