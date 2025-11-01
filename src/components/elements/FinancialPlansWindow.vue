<template>
  <div class="plans-window">
    <!-- Левая колонка: Мои планы -->
    <div class="column column-left">
      <div class="column-header">
        <h2 class="column-title">Мои планы</h2>
        <button class="btn-create-plan" @click="openPlanForm()">
          + Создать
        </button>
      </div>

      <div class="plans-list">
        <div
          v-for="plan in plans"
          :key="plan.id"
          :class="['plan-card', { active: selectedPlan?.id === plan.id }]"
          @click="selectPlan(plan)"
        >
          <div v-if="plan.imageUrl" class="plan-image">
            <img :src="plan.imageUrl" :alt="plan.title" />
          </div>
          <div class="plan-info">
            <div class="plan-title">{{ plan.title }}</div>
            <div class="plan-category">{{ plan.category }}</div>
            <div class="plan-price">
              <template v-if="plan.targetAmount">
                {{ formatCurrency(plan.targetAmount) }}
              </template>
              <template v-else-if="plan.minAmount && plan.maxAmount">
                {{ formatCurrency(plan.minAmount) }} -
                {{ formatCurrency(plan.maxAmount) }}
              </template>
            </div>
            <div v-if="plan.deadline" class="plan-deadline">
              До {{ getMonthName(plan.deadline.month) }}
              {{ plan.deadline.year }}
            </div>
          </div>
          <div class="plan-actions">
            <button class="btn-icon-small" @click.stop="openPlanForm(plan)">
              ✏️
            </button>
          </div>
        </div>

        <div v-if="plans.length === 0" class="no-data">
          Нет созданных планов. Создайте свой первый план!
        </div>
      </div>
    </div>

    <!-- Центральная колонка: Калькулятор (только inputs) -->
    <div class="column column-center">
      <div class="column-header">
        <h2 class="column-title">
          {{
            isPassiveIncome
              ? "Калькулятор пассивного дохода"
              : "Калькулятор накоплений"
          }}
        </h2>
      </div>

      <div v-if="!selectedPlan" class="no-plan-message">
        ← Выберите план из списка
      </div>

      <!-- Калькулятор накоплений -->
      <div v-else-if="!isPassiveIncome" class="calculator-inputs">
        <!-- Выбор рабочей цены -->
        <div
          v-if="selectedPlan.minAmount && selectedPlan.maxAmount"
          class="input-section"
        >
          <div class="input-label-with-tooltip">
            <label>Рабочая цена</label>
            <Tooltip
              text="Выберите стратегию определения цены из диапазона. Это значение будет использоваться в расчётах."
            />
          </div>
          <div class="strategy-buttons">
            <button
              v-for="strategy in priceStrategies"
              :key="strategy.value"
              :class="[
                'strategy-btn',
                { active: priceStrategy === strategy.value },
              ]"
              @click="changePriceStrategy(strategy.value)"
            >
              {{ strategy.label }}
            </button>
          </div>
          <div v-if="priceStrategy === 'custom'" class="custom-price-input">
            <input
              v-model.number="customPrice"
              type="number"
              :min="selectedPlan.minAmount"
              :max="selectedPlan.maxAmount"
              @input="debouncedRecalculate"
            />
          </div>
          <div class="price-display">{{ formatCurrency(workingPrice) }}</div>
        </div>

        <!-- Режим расчёта -->
        <div class="input-section">
          <div class="input-label-with-tooltip">
            <label>Режим расчёта</label>
            <Tooltip
              text="R1 (к дедлайну): рассчитать требуемый ежемесячный вклад для достижения цели к определённой дате. R2 (когда достигну): рассчитать дату достижения цели при текущем ежемесячном вкладе."
            />
          </div>
          <div class="mode-buttons">
            <button
              :class="['mode-btn', { active: calcMode === 'toDeadline' }]"
              @click="
                calcMode = 'toDeadline';
                debouncedRecalculate();
              "
            >
              R1: К дедлайну
            </button>
            <button
              :class="['mode-btn', { active: calcMode === 'whenReach' }]"
              @click="
                calcMode = 'whenReach';
                debouncedRecalculate();
              "
            >
              R2: Когда достигну
            </button>
          </div>
        </div>

        <!-- Стартовый взнос -->
        <div class="input-section">
          <div class="input-label-with-tooltip">
            <label>Стартовый взнос (₽)</label>
            <Tooltip
              text="Сумма, которую вы готовы внести сразу. Эта сумма будет участвовать в накоплении процентов с первого месяца."
            />
          </div>
          <input
            v-model.number="calc.initialLumpSum"
            type="number"
            min="0"
            step="1000"
            placeholder="0"
            @input="debouncedRecalculate"
          />
        </div>

        <!-- Ежемесячный вклад -->
        <div class="input-section">
          <div class="input-label-with-tooltip">
            <label>Ежемесячный вклад (₽)</label>
            <Tooltip
              text="Сумма, которую вы планируете откладывать каждый месяц. Может увеличиваться со временем (см. рост вклада)."
            />
          </div>
          <input
            v-model.number="calc.monthlyContribution"
            type="number"
            min="0"
            step="1000"
            placeholder="50000"
            @input="debouncedRecalculate"
          />
        </div>

        <!-- Дедлайн (только для режима R1) -->
        <div v-if="calcMode === 'toDeadline'" class="input-section">
          <div class="input-label-with-tooltip">
            <label>Дедлайн</label>
            <Tooltip
              text="Целевая дата, к которой вы хотите накопить нужную сумму. Калькулятор рассчитает требуемый ежемесячный вклад."
            />
          </div>
          <div class="date-input-group">
            <select
              v-model.number="calc.deadline.month"
              @change="debouncedRecalculate"
            >
              <option v-for="m in 12" :key="m" :value="m">
                {{ getMonthName(m) }}
              </option>
            </select>
            <input
              v-model.number="calc.deadline.year"
              type="number"
              min="2025"
              max="2050"
              @input="debouncedRecalculate"
            />
          </div>
        </div>

        <!-- Рост вклада -->
        <div class="input-section">
          <div class="input-label-with-tooltip">
            <label>Рост вклада</label>
            <Tooltip
              text="Как будет увеличиваться ваш ежемесячный вклад: без роста, ежегодная индексация (например, на уровень инфляции или роста зарплаты), или шаговые повышения через заданные интервалы."
            />
          </div>
          <select
            v-model="calc.contributionGrowth.type"
            @change="debouncedRecalculate"
          >
            <option value="none">Без роста</option>
            <option value="annual">Ежегодная индексация (%)</option>
            <option value="stepped">Шаговые повышения</option>
          </select>

          <div
            v-if="calc.contributionGrowth.type === 'annual'"
            class="sub-input"
          >
            <div class="input-label-with-tooltip">
              <label>Процент роста в год (%)</label>
              <Tooltip
                text="На сколько процентов будет увеличиваться ежемесячный вклад каждый год. Например, 5% означает, что через год вклад вырастет на 5%."
              />
            </div>
            <input
              v-model.number="calc.contributionGrowth.annualPercent"
              type="number"
              min="0"
              max="100"
              step="0.5"
              placeholder="5"
              @input="debouncedRecalculate"
            />
          </div>

          <div
            v-if="calc.contributionGrowth.type === 'stepped'"
            class="sub-inputs-row"
          >
            <div class="sub-input">
              <div class="input-label-with-tooltip">
                <label>Раз в N месяцев</label>
                <Tooltip
                  text="Интервал повышения вклада. Например, 6 означает повышение каждые полгода."
                />
              </div>
              <input
                v-model.number="calc.contributionGrowth.stepMonths"
                type="number"
                min="1"
                max="60"
                placeholder="6"
                @input="debouncedRecalculate"
              />
            </div>
            <div class="sub-input">
              <div class="input-label-with-tooltip">
                <label>Рост (%)</label>
                <Tooltip
                  text="На сколько процентов увеличивается вклад при каждом повышении."
                />
              </div>
              <input
                v-model.number="calc.contributionGrowth.stepPercent"
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="10"
                @input="debouncedRecalculate"
              />
            </div>
          </div>
        </div>

        <!-- Процентная ставка -->
        <div class="input-section">
          <label class="checkbox-label">
            <input
              v-model="calc.useInterest"
              type="checkbox"
              @change="debouncedRecalculate"
            />
            <span>Использовать проценты</span>
            <Tooltip
              text="Включите, если планируете хранить деньги на депозите или в инструментах с доходностью. Проценты увеличат итоговую сумму за счёт капитализации."
            />
          </label>
        </div>

        <div v-if="calc.useInterest" class="nested-section">
          <div class="input-section">
            <div class="input-label-with-tooltip">
              <label>Процентная ставка (% годовых)</label>
              <Tooltip
                text="Годовая процентная ставка по вашему инструменту (депозит, облигации, фонды). Например, 8% годовых."
              />
            </div>
            <input
              v-model.number="calc.interestRate"
              type="number"
              min="0"
              max="50"
              step="0.1"
              placeholder="8"
              @input="debouncedRecalculate"
            />
          </div>

          <div class="input-section">
            <div class="input-label-with-tooltip">
              <label>Капитализация</label>
              <Tooltip
                text="Как часто проценты добавляются к основной сумме и начинают приносить свои проценты. Чем чаще капитализация, тем больше итоговая доходность."
              />
            </div>
            <select
              v-model="calc.capitalization"
              @change="debouncedRecalculate"
            >
              <option value="monthly">Ежемесячная</option>
              <option value="quarterly">Ежеквартальная</option>
              <option value="annual">Ежегодная</option>
            </select>
          </div>
        </div>

        <!-- Инфляция -->
        <div class="input-section">
          <label class="checkbox-label">
            <input
              v-model="calc.useInflation"
              type="checkbox"
              @change="debouncedRecalculate"
            />
            <span>Учитывать инфляцию</span>
            <Tooltip
              text="Включите, чтобы увидеть реальную стоимость накоплений с учётом обесценивания денег. Калькулятор покажет номинальную и реальную (с учётом инфляции) стоимость."
            />
          </label>
        </div>

        <div v-if="calc.useInflation" class="nested-section">
          <div class="input-section">
            <div class="input-label-with-tooltip">
              <label>Инфляция (% в год)</label>
              <Tooltip
                text="Ожидаемый уровень инфляции. В России исторически ~4-6%. Влияет на реальную покупательную способность накопленных денег."
              />
            </div>
            <input
              v-model.number="calc.inflationRate"
              type="number"
              min="0"
              max="100"
              step="0.1"
              placeholder="4"
              @input="debouncedRecalculate"
            />
          </div>
        </div>

        <!-- Комиссии и налоги -->
        <div class="input-section">
          <label class="checkbox-label">
            <input
              v-model="calc.useFeesAndTaxes"
              type="checkbox"
              @change="debouncedRecalculate"
            />
            <span>Комиссии и налоги</span>
            <Tooltip
              text="Учитывайте налоги на доход от процентов (13% в РФ), комиссии за обслуживание счёта и разовые комиссии при покупке активов."
            />
          </label>
        </div>

        <div v-if="calc.useFeesAndTaxes" class="nested-section">
          <div class="input-section">
            <div class="input-label-with-tooltip">
              <label>Налог на доход от процентов (%)</label>
              <Tooltip
                text="В России стандартно 13% НДФЛ на процентный доход. Вычитается из начисленных процентов."
              />
            </div>
            <input
              v-model.number="calc.taxOnInterest"
              type="number"
              min="0"
              max="100"
              step="1"
              placeholder="13"
              @input="debouncedRecalculate"
            />
          </div>

          <div class="input-section">
            <div class="input-label-with-tooltip">
              <label>Комиссия за обслуживание (₽/мес)</label>
              <Tooltip
                text="Ежемесячная плата за обслуживание счёта или депозита. Обычно 0-500₽."
              />
            </div>
            <input
              v-model.number="calc.monthlyFee"
              type="number"
              min="0"
              step="10"
              placeholder="0"
              @input="debouncedRecalculate"
            />
          </div>

          <div class="input-section">
            <div class="input-label-with-tooltip">
              <label>Разовая комиссия при покупке (%)</label>
              <Tooltip
                text="Процент, который взимается при финальной покупке цели (например, при покупке недвижимости через риелтора)."
              />
            </div>
            <input
              v-model.number="calc.purchaseFeePercent"
              type="number"
              min="0"
              max="100"
              step="0.1"
              placeholder="0"
              @input="debouncedRecalculate"
            />
          </div>
        </div>

        <!-- Разовые поступления -->
        <div class="input-section">
          <div class="input-label-with-tooltip">
            <label>Разовые поступления</label>
            <Tooltip
              text="Добавьте ожидаемые единоразовые поступления: премии, бонусы, продажа активов и т.д. Укажите месяц и сумму."
            />
          </div>
          <button class="btn-add" @click="addOneTimeBonus">
            + Добавить поступление
          </button>

          <div v-if="calc.oneTimeBonuses.length > 0" class="bonuses-list">
            <div
              v-for="(bonus, index) in calc.oneTimeBonuses"
              :key="index"
              class="bonus-item"
            >
              <select
                v-model.number="bonus.month"
                @change="debouncedRecalculate"
              >
                <option v-for="m in 12" :key="m" :value="m">
                  {{ getMonthName(m) }}
                </option>
              </select>
              <input
                v-model.number="bonus.year"
                type="number"
                min="2025"
                max="2050"
                @input="debouncedRecalculate"
              />
              <input
                v-model.number="bonus.amount"
                type="number"
                min="0"
                step="1000"
                placeholder="Сумма (₽)"
                @input="debouncedRecalculate"
              />
              <button class="btn-remove-small" @click="removeBonus(index)">
                ×
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Калькулятор пассивного дохода -->
      <div v-else class="calculator-inputs">
        <div class="input-section">
          <div class="input-label-with-tooltip">
            <label>Целевая сумма пассивного дохода (₽/мес)</label>
            <Tooltip
              text="Сколько вы хотите получать ежемесячно от пассивных источников дохода (проценты, дивиденды, рента)."
            />
          </div>
          <input
            v-model.number="passiveCalc.targetMonthlyIncome"
            type="number"
            min="0"
            step="1000"
            placeholder="100000"
            @input="debouncedRecalculate"
          />
        </div>

        <div class="input-section">
          <div class="input-label-with-tooltip">
            <label>Текущие инструменты</label>
            <Tooltip
              text="Добавьте ваши текущие источники пассивного дохода: депозиты, облигации, акции с дивидендами, недвижимость."
            />
          </div>
          <button class="btn-add" @click="addInstrument">
            + Добавить инструмент
          </button>

          <div
            v-if="passiveCalc.instruments.length > 0"
            class="instruments-list"
          >
            <div
              v-for="(inst, index) in passiveCalc.instruments"
              :key="index"
              class="instrument-card"
            >
              <div class="instrument-header">
                <input
                  v-model="inst.name"
                  type="text"
                  placeholder="Название"
                  class="instrument-name-input"
                  @input="debouncedRecalculate"
                />
                <button
                  class="btn-remove-small"
                  @click="removeInstrument(index)"
                >
                  ×
                </button>
              </div>

              <div class="instrument-fields">
                <div class="field-row">
                  <div class="field-group">
                    <label>Остаток (₽)</label>
                    <input
                      v-model.number="inst.principal"
                      type="number"
                      min="0"
                      step="1000"
                      @input="debouncedRecalculate"
                    />
                  </div>
                  <div class="field-group">
                    <label>Ставка (% год)</label>
                    <input
                      v-model.number="inst.rate"
                      type="number"
                      min="0"
                      max="50"
                      step="0.1"
                      @input="debouncedRecalculate"
                    />
                  </div>
                </div>

                <div class="field-row">
                  <div class="field-group">
                    <label>Капитализация</label>
                    <select
                      v-model="inst.capitalization"
                      @change="debouncedRecalculate"
                    >
                      <option value="monthly">Месяц</option>
                      <option value="quarterly">Квартал</option>
                      <option value="annual">Год</option>
                    </select>
                  </div>
                  <div class="field-group">
                    <label>Режим</label>
                    <select
                      v-model="inst.payoutMode"
                      @change="debouncedRecalculate"
                    >
                      <option value="reinvest">Реинвест</option>
                      <option value="payout">Выплата</option>
                    </select>
                  </div>
                </div>

                <div class="field-row">
                  <div class="field-group">
                    <label>Действует до</label>
                    <div class="date-input-group-small">
                      <select
                        v-model.number="inst.until.month"
                        @change="debouncedRecalculate"
                      >
                        <option :value="null">∞</option>
                        <option v-for="m in 12" :key="m" :value="m">
                          {{ getMonthName(m) }}
                        </option>
                      </select>
                      <input
                        v-if="inst.until.month"
                        v-model.number="inst.until.year"
                        type="number"
                        min="2025"
                        max="2050"
                        @input="debouncedRecalculate"
                      />
                    </div>
                  </div>
                </div>

                <div class="field-checkbox">
                  <label class="checkbox-label-small">
                    <input
                      v-model="inst.useTax"
                      type="checkbox"
                      @change="debouncedRecalculate"
                    />
                    <span>Учитывать налог ({{ inst.tax }}%)</span>
                  </label>
                  <input
                    v-if="inst.useTax"
                    v-model.number="inst.tax"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    class="tax-input"
                    @input="debouncedRecalculate"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="input-section">
          <div class="input-label-with-tooltip">
            <label>Ежемесячные пополнения капитала (₽)</label>
            <Tooltip
              text="Сколько вы планируете добавлять к капиталу каждый месяц для увеличения базы и роста пассивного дохода."
            />
          </div>
          <input
            v-model.number="passiveCalc.monthlyAddition"
            type="number"
            min="0"
            step="1000"
            placeholder="50000"
            @input="debouncedRecalculate"
          />
        </div>

        <div class="input-section">
          <label class="checkbox-label">
            <input
              v-model="passiveCalc.useInflation"
              type="checkbox"
              @change="debouncedRecalculate"
            />
            <span>Учитывать инфляцию</span>
            <Tooltip
              text="Включите для учёта реальной покупательной способности пассивного дохода с учётом инфляции."
            />
          </label>
        </div>

        <div v-if="passiveCalc.useInflation" class="nested-section">
          <div class="input-section">
            <div class="input-label-with-tooltip">
              <label>Инфляция (% в год)</label>
              <Tooltip
                text="Ожидаемый уровень инфляции для корректировки реальной стоимости дохода."
              />
            </div>
            <input
              v-model.number="passiveCalc.inflationRate"
              type="number"
              min="0"
              max="100"
              step="0.1"
              placeholder="4"
              @input="debouncedRecalculate"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Правая колонка: Итоги (весь вывод) -->
    <div class="column column-right">
      <div class="column-header">
        <h2 class="column-title">Итоги</h2>
      </div>

      <div v-if="!selectedPlan" class="no-plan-message">
        Выберите план для просмотра итогов
      </div>

      <!-- Итоги калькулятора накоплений -->
      <div v-else-if="!isPassiveIncome" class="results-container">
        <!-- Основные результаты -->
        <div class="result-section">
          <h3 class="result-section-title">Основные показатели</h3>

          <div class="result-card primary">
            <div class="result-label-with-tooltip">
              <span class="result-label">
                {{
                  calcMode === "toDeadline"
                    ? "Требуемый ежемесячный вклад"
                    : "Дата достижения цели"
                }}
              </span>
              <Tooltip
                :text="
                  calcMode === 'toDeadline'
                    ? 'Сумма, которую нужно откладывать каждый месяц, чтобы достичь цели к указанному дедлайну.'
                    : 'Месяц и год, когда вы достигнете целевой суммы при текущем ежемесячном вкладе.'
                "
              />
            </div>
            <div class="result-value highlight">
              {{
                calcMode === "toDeadline"
                  ? formatCurrency(calcResults.requiredMonthly)
                  : `${getMonthName(calcResults.achievementDate.month)} ${
                      calcResults.achievementDate.year
                    }`
              }}
            </div>
          </div>

          <div class="result-card">
            <div class="result-label-with-tooltip">
              <span class="result-label">До цели осталось</span>
              <Tooltip
                text="Разница между целевой суммой и текущими накоплениями. В рублях — сколько ещё нужно накопить. В месяцах — ориентировочное время до достижения при текущем темпе."
              />
            </div>
            <div class="result-value">
              {{ formatCurrency(calcResults.remaining) }}
            </div>
            <div class="result-sublabel">
              ~{{ calcResults.remainingMonths }} мес. (ориентировочно)
            </div>
          </div>

          <div class="result-card">
            <div class="result-label-with-tooltip">
              <span class="result-label">Проценты заработано</span>
              <Tooltip
                text="Абсолютная сумма: разница между итоговыми накоплениями и чистыми взносами. Доля: процент дохода от процентов относительно всех накоплений. Формула: (накоплено_всего - взносы - стартовый_взнос) / накоплено_всего × 100%"
              />
            </div>
            <div class="result-value positive">
              {{ formatCurrency(calcResults.interestEarned) }}
            </div>
            <div class="result-sublabel">
              {{ calcResults.interestPercent }}% от общей суммы
            </div>
          </div>

          <div v-if="calc.useInflation" class="result-card inflation">
            <div class="result-label-with-tooltip">
              <span class="result-label">С учётом инфляции</span>
              <Tooltip
                text="Номинальная сумма — накопления в деньгах того времени. Реальная сумма — покупательная способность в текущих ценах с учётом обесценивания денег."
              />
            </div>
            <div class="inflation-values">
              <div class="inflation-row">
                <span>В текущих ценах:</span>
                <strong>{{ formatCurrency(calcResults.nominalAmount) }}</strong>
              </div>
              <div class="inflation-row">
                <span>В будущих ценах:</span>
                <strong>{{ formatCurrency(calcResults.realAmount) }}</strong>
              </div>
            </div>
          </div>

          <div v-if="calcResults.warning" class="warning-card">
            ⚠️ {{ calcResults.warning }}
          </div>
        </div>

        <!-- Анализ чувствительности -->
        <div class="result-section">
          <div class="result-section-header">
            <h3 class="result-section-title">Анализ чувствительности</h3>
            <Tooltip
              text="Показывает, как изменение ключевых параметров влияет на результат. Используйте для понимания рисков и возможностей оптимизации плана."
            />
          </div>

          <div class="scenarios-grid">
            <div class="scenario-card">
              <div class="scenario-title">📈 Изменение вклада</div>
              <div class="scenario-desc">
                Как изменится срок при росте/падении вклада
              </div>
              <div
                v-for="change in [-30, -20, -10, 10, 20, 30]"
                :key="change"
                class="scenario-item"
              >
                <span class="scenario-change"
                  >{{ change > 0 ? "+" : "" }}{{ change }}%</span
                >
                <span class="scenario-result">{{
                  getScenarioResult("contribution", change)
                }}</span>
              </div>
            </div>

            <div class="scenario-card">
              <div class="scenario-title">💰 Изменение ставки</div>
              <div class="scenario-desc">
                Влияние доходности на срок достижения
              </div>
              <div
                v-for="change in [-3, -2, -1, 1, 2, 3]"
                :key="change"
                class="scenario-item"
              >
                <span class="scenario-change"
                  >{{ change > 0 ? "+" : "" }}{{ change }} п.п.</span
                >
                <span class="scenario-result">{{
                  getScenarioResult("rate", change)
                }}</span>
              </div>
            </div>

            <div v-if="calc.useInflation" class="scenario-card">
              <div class="scenario-title">📉 Изменение инфляции</div>
              <div class="scenario-desc">
                Как инфляция влияет на реальную стоимость
              </div>
              <div
                v-for="change in [-2, -1, 1, 2]"
                :key="change"
                class="scenario-item"
              >
                <span class="scenario-change"
                  >{{ change > 0 ? "+" : "" }}{{ change }} п.п.</span
                >
                <span class="scenario-result">{{
                  getScenarioResult("inflation", change)
                }}</span>
              </div>
            </div>

            <div v-if="calcMode === 'toDeadline'" class="scenario-card">
              <div class="scenario-title">📅 Изменение дедлайна</div>
              <div class="scenario-desc">Как сдвиг срока влияет на вклад</div>
              <div
                v-for="change in [-12, -6, -3, 3, 6, 12]"
                :key="change"
                class="scenario-item"
              >
                <span class="scenario-change"
                  >{{ change > 0 ? "+" : "" }}{{ change }} мес.</span
                >
                <span class="scenario-result">{{
                  getScenarioResult("deadline", change)
                }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- График накоплений -->
        <div class="result-section">
          <div class="result-section-header">
            <h3 class="result-section-title">График накоплений</h3>
            <Tooltip
              text="Помесячная динамика накоплений. Синяя линия — с учётом процентов и капитализации. Серая линия — без процентов (только взносы). Зелёная пунктирная — целевая сумма."
            />
          </div>
          <div class="chart-wrapper">
            <Line :data="savingsChartData" :options="savingsChartOptions" />
          </div>
        </div>

        <!-- Summary -->
        <div class="result-section">
          <h3 class="result-section-title">Сводка по плану</h3>
          <div class="summary-grid">
            <div class="summary-row">
              <span>Цель:</span>
              <strong>{{ selectedPlan.title }}</strong>
            </div>
            <div class="summary-row">
              <span>Рабочая цена:</span>
              <strong>{{ formatCurrency(workingPrice) }}</strong>
            </div>
            <div class="summary-row">
              <span>Стратегия цены:</span>
              <strong>{{ getCurrentStrategyLabel }}</strong>
            </div>
            <div class="summary-row">
              <span>Текущий вклад:</span>
              <strong
                >{{ formatCurrency(calc.monthlyContribution) }}/мес</strong
              >
            </div>
            <div class="summary-row">
              <span>Стартовый взнос:</span>
              <strong>{{ formatCurrency(calc.initialLumpSum) }}</strong>
            </div>
            <div class="summary-row">
              <span>Процентная ставка:</span>
              <strong>{{
                calc.useInterest ? calc.interestRate + "%" : "Не используется"
              }}</strong>
            </div>
            <div class="summary-row">
              <span>Прогресс:</span>
              <strong>{{ calcResults.progressPercent }}%</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- Итоги калькулятора пассивного дохода -->
      <div v-else class="results-container">
        <div class="result-section">
          <h3 class="result-section-title">Текущий пассивный доход</h3>

          <div class="result-card primary">
            <div class="result-label-with-tooltip">
              <span class="result-label">Общий доход в месяц</span>
              <Tooltip
                text="Суммарный ежемесячный пассивный доход от всех инструментов при текущих условиях."
              />
            </div>
            <div class="result-value highlight">
              {{ formatCurrency(passiveResults.currentMonthlyIncome) }}
            </div>
          </div>

          <div class="result-card">
            <div class="result-label-with-tooltip">
              <span class="result-label">Требуемый капитал для цели</span>
              <Tooltip
                text="Сумма капитала, необходимая для получения целевого пассивного дохода при средней эффективной ставке."
              />
            </div>
            <div class="result-value">
              {{ formatCurrency(passiveResults.requiredCapital) }}
            </div>
          </div>

          <div class="result-card">
            <div class="result-label-with-tooltip">
              <span class="result-label">Дефицит капитала</span>
              <Tooltip
                text="Сколько ещё нужно накопить для достижения целевого пассивного дохода."
              />
            </div>
            <div class="result-value">
              {{ formatCurrency(passiveResults.capitalDeficit) }}
            </div>
          </div>

          <div class="result-card">
            <div class="result-label-with-tooltip">
              <span class="result-label">Достижение цели</span>
              <Tooltip
                text="При текущих пополнениях капитала — когда вы выйдете на целевой уровень пассивного дохода."
              />
            </div>
            <div class="result-value">
              {{
                passiveResults.achievementDate
                  ? `${getMonthName(passiveResults.achievementDate.month)} ${
                      passiveResults.achievementDate.year
                    }`
                  : "Требуется пополнение"
              }}
            </div>
          </div>
        </div>

        <!-- Разбивка по инструментам -->
        <div class="result-section">
          <h3 class="result-section-title">Разбивка по инструментам</h3>
          <div
            v-if="passiveResults.breakdown.length > 0"
            class="instruments-breakdown"
          >
            <div
              v-for="item in passiveResults.breakdown"
              :key="item.name"
              class="breakdown-row"
            >
              <div class="breakdown-name">{{ item.name }}</div>
              <div class="breakdown-value">
                {{ formatCurrency(item.monthlyIncome) }}/мес
              </div>
              <div class="breakdown-detail">
                Капитал: {{ formatCurrency(item.principal) }} | Ставка:
                {{ item.rate }}% |
                {{ item.payoutMode === "payout" ? "Выплата" : "Реинвест" }}
              </div>
            </div>
          </div>
          <div v-else class="no-data-small">
            Добавьте инструменты в калькуляторе
          </div>
        </div>

        <!-- Анализ чувствительности для пассивного дохода -->
        <div class="result-section">
          <div class="result-section-header">
            <h3 class="result-section-title">Анализ чувствительности</h3>
            <Tooltip
              text="Как изменение параметров влияет на срок достижения целевого пассивного дохода."
            />
          </div>

          <div class="scenarios-grid">
            <div class="scenario-card">
              <div class="scenario-title">💰 Ставка ±п.п.</div>
              <div
                v-for="change in [-2, -1, 1, 2]"
                :key="change"
                class="scenario-item"
              >
                <span class="scenario-change"
                  >{{ change > 0 ? "+" : "" }}{{ change }} п.п.</span
                >
                <span class="scenario-result">{{
                  getPassiveScenario("rate", change)
                }}</span>
              </div>
            </div>

            <div class="scenario-card">
              <div class="scenario-title">📈 Пополнение капитала</div>
              <div
                v-for="change in [-30, -20, -10, 10, 20, 30]"
                :key="change"
                class="scenario-item"
              >
                <span class="scenario-change"
                  >{{ change > 0 ? "+" : "" }}{{ change }}%</span
                >
                <span class="scenario-result">{{
                  getPassiveScenario("addition", change)
                }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- График роста пассивного дохода -->
        <div class="result-section">
          <h3 class="result-section-title">График роста дохода</h3>
          <div class="chart-wrapper">
            <Line :data="passiveChartData" :options="passiveChartOptions" />
          </div>
        </div>
      </div>
    </div>

    <!-- Модальное окно создания/редактирования плана -->
    <div
      v-if="showPlanModal"
      class="modal-overlay"
      @click="showPlanModal = false"
    >
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>{{ editingPlan ? "Редактировать план" : "Создать план" }}</h3>
          <button class="modal-close" @click="closePlanForm">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Название *</label>
            <input
              v-model="planForm.title"
              type="text"
              placeholder="Купить Toyota Camry"
            />
          </div>

          <div class="form-group">
            <label>Категория *</label>
            <select v-model="planForm.category">
              <option value="">Выберите категорию</option>
              <option value="Покупка">Покупка</option>
              <option value="Путешествие">Путешествие</option>
              <option value="Инвестиции">Инвестиции</option>
              <option value="Образование">Образование</option>
              <option value="Недвижимость">Недвижимость</option>
              <option value="Пассивный доход">Пассивный доход</option>
              <option value="Другое">Другое</option>
            </select>
          </div>

          <div class="form-group">
            <label>Описание</label>
            <textarea
              v-model="planForm.description"
              placeholder="Дополнительная информация о цели"
            ></textarea>
          </div>

          <div class="form-group">
            <label>URL изображения</label>
            <input
              v-model="planForm.imageUrl"
              type="url"
              placeholder="https://example.com/image.jpg"
            />
          </div>

          <div
            v-if="planForm.category !== 'Пассивный доход'"
            class="form-group"
          >
            <label>Стоимость</label>
            <div class="price-type-selector">
              <label class="radio-label">
                <input
                  v-model="planForm.priceType"
                  type="radio"
                  value="exact"
                />
                Точная цена
              </label>
              <label class="radio-label">
                <input
                  v-model="planForm.priceType"
                  type="radio"
                  value="range"
                />
                Диапазон
              </label>
            </div>
          </div>

          <div
            v-if="
              planForm.priceType === 'exact' &&
              planForm.category !== 'Пассивный доход'
            "
            class="form-group"
          >
            <label>Сумма (₽) *</label>
            <input
              v-model.number="planForm.targetAmount"
              type="number"
              min="0"
              placeholder="1500000"
            />
          </div>

          <div
            v-if="
              planForm.priceType === 'range' &&
              planForm.category !== 'Пассивный доход'
            "
            class="form-group-row"
          >
            <div class="form-group">
              <label>От (₽) *</label>
              <input
                v-model.number="planForm.minAmount"
                type="number"
                min="0"
                placeholder="1000000"
              />
            </div>
            <div class="form-group">
              <label>До (₽) *</label>
              <input
                v-model.number="planForm.maxAmount"
                type="number"
                min="0"
                placeholder="2000000"
              />
            </div>
          </div>

          <div v-if="planFormError" class="error-message">
            {{ planFormError }}
          </div>

          <div
            v-if="planForm.category !== 'Пассивный доход'"
            class="form-group"
          >
            <label class="checkbox-label">
              <input v-model="planForm.hasDeadline" type="checkbox" />
              Установить дедлайн
            </label>
          </div>

          <div
            v-if="
              planForm.hasDeadline && planForm.category !== 'Пассивный доход'
            "
            class="form-group-row"
          >
            <div class="form-group">
              <label>Месяц</label>
              <select v-model.number="planForm.deadline.month">
                <option v-for="m in 12" :key="m" :value="m">
                  {{ getMonthName(m) }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>Год</label>
              <input
                v-model.number="planForm.deadline.year"
                type="number"
                min="2025"
              />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button v-if="editingPlan" class="btn-delete" @click="deletePlan">
            Удалить
          </button>
          <button class="btn-cancel" @click="closePlanForm">Отмена</button>
          <button class="btn-save" @click="savePlan">Сохранить</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { Line } from "vue-chartjs";
import {
  Chart as ChartJS,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  CategoryScale,
} from "chart.js";

ChartJS.register(
  Title,
  ChartTooltip,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  CategoryScale
);

// Компонент Tooltip для подсказок
const Tooltip = {
  props: ["text"],
  template: `
    <span class="tooltip-icon" :title="text">ℹ️</span>
  `,
};

// Debounce функция
let debounceTimer = null;
const DEBOUNCE_DELAY = 1200; // 1.2 секунды

function debouncedRecalculate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    recalculate();
  }, DEBOUNCE_DELAY);
}

// Мок данных - планы
const plans = ref([
  {
    id: 1,
    title: "Купить Toyota Camry",
    category: "Покупка",
    description: "Новая машина для семьи",
    targetAmount: 3500000,
    imageUrl:
      "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=400",
    deadline: { year: 2026, month: 6 },
  },
  {
    id: 2,
    title: "Путешествие в Японию",
    category: "Путешествие",
    minAmount: 300000,
    maxAmount: 500000,
    deadline: { year: 2025, month: 12 },
  },
  {
    id: 3,
    title: "Финансовая независимость",
    category: "Пассивный доход",
    targetAmount: 100000,
    description: "Достичь пассивного дохода 100к/мес",
  },
  {
    id: 4,
    title: "Дом на кавказе",
    category: "Покупка",
    targetAmount: 20000000,
    description: "",
  },
]);

const selectedPlan = ref(null);
const showPlanModal = ref(false);
const editingPlan = ref(null);
const planFormError = ref("");

// Computed - является ли план пассивным доходом
const isPassiveIncome = computed(() => {
  return selectedPlan.value?.category === "Пассивный доход";
});

// Форма плана
const planForm = ref({
  title: "",
  category: "",
  description: "",
  imageUrl: "",
  priceType: "exact",
  targetAmount: null,
  minAmount: null,
  maxAmount: null,
  hasDeadline: false,
  deadline: {
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear() + 1,
  },
});

// Стратегии выбора цены
const priceStrategies = [
  { label: "Минимум", value: "min" },
  { label: "Средняя", value: "avg" },
  { label: "Максимум", value: "max" },
  { label: "Своя", value: "custom" },
];

const priceStrategy = ref("avg");
const customPrice = ref(0);

// Режим калькулятора накоплений
const calcMode = ref("whenReach");

// Параметры калькулятора накоплений
const calc = ref({
  initialLumpSum: 0,
  monthlyContribution: 50000,
  deadline: {
    month: 6,
    year: 2026,
  },
  contributionGrowth: {
    type: "none",
    annualPercent: 5,
    stepMonths: 6,
    stepPercent: 10,
  },
  useInterest: true,
  interestRate: 8,
  capitalization: "monthly",
  useInflation: true,
  inflationRate: 4,
  useFeesAndTaxes: false,
  taxOnInterest: 13,
  monthlyFee: 0,
  purchaseFeePercent: 0,
  oneTimeBonuses: [],
});

// Результаты калькулятора накоплений
const calcResults = ref({
  requiredMonthly: 0,
  achievementDate: { month: 1, year: 2026 },
  interestEarned: 0,
  interestPercent: 0,
  remaining: 0,
  remainingMonths: 0,
  nominalAmount: 0,
  realAmount: 0,
  progressPercent: 0,
  warning: "",
});

// Параметры калькулятора пассивного дохода
const passiveCalc = ref({
  targetMonthlyIncome: 100000,
  instruments: [],
  monthlyAddition: 50000,
  useInflation: true,
  inflationRate: 4,
});

// Результаты калькулятора пассивного дохода
const passiveResults = ref({
  currentMonthlyIncome: 0,
  requiredCapital: 0,
  capitalDeficit: 0,
  achievementDate: null,
  breakdown: [],
});

// Computed - рабочая цена
const workingPrice = computed(() => {
  if (!selectedPlan.value || isPassiveIncome.value) return 0;

  if (selectedPlan.value.targetAmount) {
    return selectedPlan.value.targetAmount;
  }

  if (!selectedPlan.value.minAmount || !selectedPlan.value.maxAmount) return 0;

  const min = selectedPlan.value.minAmount;
  const max = selectedPlan.value.maxAmount;

  switch (priceStrategy.value) {
    case "min":
      return min;
    case "max":
      return max;
    case "avg":
      return Math.round((min + max) / 2);
    case "custom":
      return customPrice.value || Math.round((min + max) / 2);
    default:
      return Math.round((min + max) / 2);
  }
});

// Computed - текущая стратегия
const getCurrentStrategyLabel = computed(() => {
  const strategy = priceStrategies.find((s) => s.value === priceStrategy.value);
  return strategy ? strategy.label : "Средняя";
});

// Computed - данные для графика накоплений
const savingsChartData = computed(() => {
  if (isPassiveIncome.value) return { labels: [], datasets: [] };

  const chartData = calculateSavingsChart();
  return {
    labels: chartData.labels,
    datasets: [
      {
        label: "Без процентов",
        data: chartData.withoutInterest,
        borderColor: "#666",
        backgroundColor: "transparent",
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
      },
      {
        label: "С процентами",
        data: chartData.withInterest,
        borderColor: "#1767FD",
        backgroundColor: "rgba(23, 103, 253, 0.1)",
        tension: 0.3,
        fill: true,
        pointRadius: 3,
        borderWidth: 2,
      },
      {
        label: "Цель",
        data: chartData.target,
        borderColor: "#4ade80",
        backgroundColor: "transparent",
        tension: 0,
        pointRadius: 0,
        borderDash: [5, 5],
        borderWidth: 2,
      },
    ],
  };
});

const savingsChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: "index",
    intersect: false,
  },
  plugins: {
    legend: {
      display: true,
      labels: {
        color: "#fff",
        font: { size: 11 },
        usePointStyle: true,
      },
    },
    tooltip: {
      callbacks: {
        title: (context) => {
          return context[0].label;
        },
        afterBody: (context) => {
          const index = context[0].dataIndex;
          // Можно добавить дополнительную информацию о месяце
          return "";
        },
      },
    },
  },
  scales: {
    x: {
      ticks: { color: "#999", font: { size: 10 } },
      grid: { color: "rgba(255,255,255,0.05)" },
    },
    y: {
      ticks: {
        color: "#999",
        font: { size: 10 },
        callback: (value) => formatCurrency(value),
      },
      grid: { color: "rgba(255,255,255,0.05)" },
    },
  },
};

// Computed - данные для графика пассивного дохода
const passiveChartData = computed(() => {
  if (!isPassiveIncome.value) return { labels: [], datasets: [] };

  const chartData = calculatePassiveIncomeChart();
  return {
    labels: chartData.labels,
    datasets: [
      {
        label: "Пассивный доход (₽/мес)",
        data: chartData.income,
        borderColor: "#4ade80",
        backgroundColor: "rgba(74, 222, 128, 0.1)",
        tension: 0.3,
        fill: true,
        pointRadius: 3,
        borderWidth: 2,
      },
      {
        label: "Цель",
        data: chartData.target,
        borderColor: "#1767FD",
        backgroundColor: "transparent",
        tension: 0,
        pointRadius: 0,
        borderDash: [5, 5],
        borderWidth: 2,
      },
    ],
  };
});

const passiveChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      labels: {
        color: "#fff",
        font: { size: 11 },
      },
    },
  },
  scales: {
    x: {
      ticks: { color: "#999", font: { size: 10 } },
      grid: { color: "rgba(255,255,255,0.05)" },
    },
    y: {
      ticks: {
        color: "#999",
        font: { size: 10 },
        callback: (value) => formatCurrency(value),
      },
      grid: { color: "rgba(255,255,255,0.05)" },
    },
  },
};

// Methods
function formatCurrency(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function getMonthName(month) {
  const months = [
    "Янв",
    "Фев",
    "Мар",
    "Апр",
    "Май",
    "Июн",
    "Июл",
    "Авг",
    "Сен",
    "Окт",
    "Ноя",
    "Дек",
  ];
  return months[month - 1] || "";
}

function selectPlan(plan) {
  selectedPlan.value = plan;

  if (plan.deadline) {
    calc.value.deadline = { ...plan.deadline };
  }

  // Инициализируем кастомную цену для диапазона
  if (plan.minAmount && plan.maxAmount) {
    customPrice.value = Math.round((plan.minAmount + plan.maxAmount) / 2);
  }

  recalculate();
}

function changePriceStrategy(strategy) {
  priceStrategy.value = strategy;
  debouncedRecalculate();
}

function validateCustomPrice() {
  if (!selectedPlan.value) return;

  const min = selectedPlan.value.minAmount || 0;
  const max = selectedPlan.value.maxAmount || Infinity;

  if (customPrice.value < min) customPrice.value = min;
  if (customPrice.value > max) customPrice.value = max;
}

function recalculate() {
  if (!selectedPlan.value) return;

  if (isPassiveIncome.value) {
    calculatePassiveIncome();
  } else {
    if (calcMode.value === "toDeadline") {
      calculateToDeadline();
    } else {
      calculateWhenReach();
    }
  }
}

function calculateToDeadline() {
  const target = workingPrice.value;
  const now = new Date();
  const deadlineDate = new Date(
    calc.value.deadline.year,
    calc.value.deadline.month - 1
  );
  const monthsToDeadline =
    (deadlineDate.getFullYear() - now.getFullYear()) * 12 +
    (deadlineDate.getMonth() - now.getMonth());

  if (monthsToDeadline <= 0) {
    calcResults.value.warning =
      "Дедлайн уже прошёл или слишком близко. Установите дату в будущем.";
    return;
  }

  const simulation = simulateSavings(target, monthsToDeadline, null);

  calcResults.value = {
    requiredMonthly: simulation.requiredMonthly,
    achievementDate: calc.value.deadline,
    interestEarned: simulation.interestEarned,
    interestPercent: simulation.interestPercent,
    remaining: simulation.remaining,
    remainingMonths: monthsToDeadline,
    nominalAmount: simulation.nominalAmount,
    realAmount: simulation.realAmount,
    progressPercent: simulation.progressPercent,
    warning: simulation.warning,
  };
}

function calculateWhenReach() {
  const target = workingPrice.value;
  const simulation = simulateSavings(
    target,
    null,
    calc.value.monthlyContribution
  );

  calcResults.value = {
    requiredMonthly: calc.value.monthlyContribution,
    achievementDate: simulation.achievementDate,
    interestEarned: simulation.interestEarned,
    interestPercent: simulation.interestPercent,
    remaining: simulation.remaining,
    remainingMonths: simulation.remainingMonths,
    nominalAmount: simulation.nominalAmount,
    realAmount: simulation.realAmount,
    progressPercent: simulation.progressPercent,
    warning: simulation.warning,
  };
}

function simulateSavings(target, maxMonths, fixedMonthly) {
  let balance = calc.value.initialLumpSum;
  let monthlyContribution = fixedMonthly || calc.value.monthlyContribution;
  let totalInterest = 0;
  let totalContributions = calc.value.initialLumpSum;
  let month = 0;
  const maxIterations = maxMonths || 600;

  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth() + 1;

  while (balance < target && month < maxIterations) {
    month++;

    // Рост вклада
    if (calc.value.contributionGrowth.type === "annual" && month % 12 === 0) {
      monthlyContribution *=
        1 + calc.value.contributionGrowth.annualPercent / 100;
    } else if (
      calc.value.contributionGrowth.type === "stepped" &&
      calc.value.contributionGrowth.stepMonths > 0 &&
      month % calc.value.contributionGrowth.stepMonths === 0
    ) {
      monthlyContribution *=
        1 + calc.value.contributionGrowth.stepPercent / 100;
    }

    // Разовые бонусы
    const bonus = calc.value.oneTimeBonuses.find((b) => {
      const bonusDate = new Date(b.year, b.month - 1);
      const currentDate = new Date(currentYear, currentMonth - 1);
      return bonusDate.getTime() === currentDate.getTime();
    });

    if (bonus) {
      balance += bonus.amount;
      totalContributions += bonus.amount;
    }

    // Ежемесячный вклад
    balance += monthlyContribution;
    totalContributions += monthlyContribution;

    // Комиссии
    if (calc.value.useFeesAndTaxes) {
      balance -= calc.value.monthlyFee;
    }

    // Проценты
    if (calc.value.useInterest) {
      let shouldCapitalize = false;

      switch (calc.value.capitalization) {
        case "monthly":
          shouldCapitalize = true;
          break;
        case "quarterly":
          shouldCapitalize = month % 3 === 0;
          break;
        case "annual":
          shouldCapitalize = month % 12 === 0;
          break;
      }

      if (shouldCapitalize) {
        const periodsPerYear =
          calc.value.capitalization === "monthly"
            ? 12
            : calc.value.capitalization === "quarterly"
            ? 4
            : 1;
        const periodRate = calc.value.interestRate / 100 / periodsPerYear;
        const interest = balance * periodRate;

        const taxedInterest = calc.value.useFeesAndTaxes
          ? interest * (1 - calc.value.taxOnInterest / 100)
          : interest;

        totalInterest += taxedInterest;
        balance += taxedInterest;
      }
    }

    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  // Комиссия при покупке
  if (calc.value.useFeesAndTaxes && calc.value.purchaseFeePercent > 0) {
    balance -= target * (calc.value.purchaseFeePercent / 100);
  }

  const achievementDate = { year: currentYear, month: currentMonth };
  const remaining = Math.max(0, target - balance);
  const remainingMonths =
    remaining > 0 ? Math.ceil(remaining / monthlyContribution) : 0;

  let nominalAmount = balance;
  let realAmount = balance;

  if (calc.value.useInflation) {
    const years = month / 12;
    const inflationMultiplier = Math.pow(
      1 + calc.value.inflationRate / 100,
      years
    );
    realAmount = balance / inflationMultiplier;
  }

  const interestPercent =
    balance > 0 ? Math.round((totalInterest / balance) * 100) : 0;
  const progressPercent = Math.min(100, Math.round((balance / target) * 100));

  let warning = "";
  if (maxMonths && month >= maxMonths && balance < target) {
    const deficit = target - balance;
    const newRequired = Math.ceil(
      (target - calc.value.initialLumpSum) / maxMonths
    );
    warning = `При текущем темпе вы не успеете к дедлайну. Не хватает ${formatCurrency(
      deficit
    )}. Необходимо увеличить вклад до ${formatCurrency(
      newRequired
    )}/мес или сдвинуть дедлайн на ${Math.ceil(remainingMonths)} мес.`;
  } else if (month >= maxIterations) {
    warning =
      "Слишком долгий срок накопления (>50 лет). Увеличьте ежемесячный вклад.";
  }

  let requiredMonthly = monthlyContribution;
  if (maxMonths) {
    // Упрощенный расчет требуемого вклада
    const totalNeeded = target - calc.value.initialLumpSum;
    requiredMonthly = Math.ceil(totalNeeded / maxMonths);
  }

  return {
    requiredMonthly,
    achievementDate,
    interestEarned: Math.round(totalInterest),
    interestPercent,
    remaining: Math.round(remaining),
    remainingMonths,
    nominalAmount: Math.round(nominalAmount),
    realAmount: Math.round(realAmount),
    progressPercent,
    warning,
  };
}

function calculateSavingsChart() {
  const target = workingPrice.value;
  const months =
    calcMode.value === "toDeadline"
      ? getMonthsToDeadline()
      : Math.min(calcResults.value.remainingMonths + 12, 120);

  const labels = [];
  const withoutInterest = [];
  const withInterest = [];
  const targetLine = [];

  let balanceNoInterest = calc.value.initialLumpSum;
  let balanceWithInterest = calc.value.initialLumpSum;
  let monthlyContribution = calc.value.monthlyContribution;

  for (let m = 0; m <= months; m++) {
    if (m % 3 === 0) {
      const date = new Date();
      date.setMonth(date.getMonth() + m);
      labels.push(`${getMonthName(date.getMonth() + 1)} ${date.getFullYear()}`);

      withoutInterest.push(balanceNoInterest);
      withInterest.push(balanceWithInterest);
      targetLine.push(target);
    }

    if (m > 0) {
      // Рост вклада
      if (calc.value.contributionGrowth.type === "annual" && m % 12 === 0) {
        monthlyContribution *=
          1 + calc.value.contributionGrowth.annualPercent / 100;
      } else if (
        calc.value.contributionGrowth.type === "stepped" &&
        calc.value.contributionGrowth.stepMonths > 0 &&
        m % calc.value.contributionGrowth.stepMonths === 0
      ) {
        monthlyContribution *=
          1 + calc.value.contributionGrowth.stepPercent / 100;
      }

      balanceNoInterest += monthlyContribution;
      balanceWithInterest += monthlyContribution;

      // Проценты
      if (calc.value.useInterest) {
        const shouldCapitalize =
          calc.value.capitalization === "monthly"
            ? true
            : calc.value.capitalization === "quarterly"
            ? m % 3 === 0
            : m % 12 === 0;

        if (shouldCapitalize) {
          const periodsPerYear =
            calc.value.capitalization === "monthly"
              ? 12
              : calc.value.capitalization === "quarterly"
              ? 4
              : 1;
          const periodRate = calc.value.interestRate / 100 / periodsPerYear;
          balanceWithInterest += balanceWithInterest * periodRate;
        }
      }
    }
  }

  return { labels, withoutInterest, withInterest, target: targetLine };
}

function getMonthsToDeadline() {
  const now = new Date();
  const deadline = new Date(
    calc.value.deadline.year,
    calc.value.deadline.month - 1
  );
  return (
    (deadline.getFullYear() - now.getFullYear()) * 12 +
    (deadline.getMonth() - now.getMonth())
  );
}

function getScenarioResult(type, change) {
  const originalCalc = JSON.parse(JSON.stringify(calc.value));

  switch (type) {
    case "contribution":
      calc.value.monthlyContribution *= 1 + change / 100;
      break;
    case "rate":
      calc.value.interestRate += change;
      break;
    case "inflation":
      calc.value.inflationRate += change;
      break;
    case "deadline":
      const deadline = new Date(
        calc.value.deadline.year,
        calc.value.deadline.month - 1
      );
      deadline.setMonth(deadline.getMonth() + change);
      calc.value.deadline = {
        year: deadline.getFullYear(),
        month: deadline.getMonth() + 1,
      };
      break;
  }

  const simulation = simulateSavings(
    workingPrice.value,
    calcMode.value === "toDeadline" ? getMonthsToDeadline() : null,
    calcMode.value === "whenReach" ? calc.value.monthlyContribution : null
  );

  calc.value = originalCalc;

  if (calcMode.value === "whenReach") {
    const monthsDiff =
      (simulation.achievementDate.year -
        calcResults.value.achievementDate.year) *
        12 +
      (simulation.achievementDate.month -
        calcResults.value.achievementDate.month);
    if (monthsDiff === 0) return "без изменений";
    return monthsDiff > 0
      ? `+${monthsDiff} мес. позже`
      : `${Math.abs(monthsDiff)} мес. раньше`;
  } else {
    const diff = simulation.requiredMonthly - calcResults.value.requiredMonthly;
    if (Math.abs(diff) < 100) return "~без изменений";
    return diff > 0
      ? `+${formatCurrency(diff)}`
      : `${formatCurrency(Math.abs(diff))} меньше`;
  }
}

// Пассивный доход

function calculatePassiveIncome() {
  let totalMonthlyIncome = 0;
  let totalCapital = 0;
  const breakdown = [];

  passiveCalc.value.instruments.forEach((inst) => {
    const monthlyRate = inst.rate / 100 / 12;
    let monthlyIncome = 0;

    if (inst.payoutMode === "payout") {
      // Выплата процентов
      monthlyIncome = inst.principal * monthlyRate;
      if (inst.useTax) {
        monthlyIncome *= 1 - inst.tax / 100;
      }
    } else {
      // Реинвест - показываем потенциальный доход
      monthlyIncome = inst.principal * monthlyRate;
      if (inst.useTax) {
        monthlyIncome *= 1 - inst.tax / 100;
      }
    }

    totalMonthlyIncome += monthlyIncome;
    totalCapital += inst.principal;

    breakdown.push({
      name: inst.name,
      principal: inst.principal,
      rate: inst.rate,
      monthlyIncome: Math.round(monthlyIncome),
      payoutMode: inst.payoutMode,
    });
  });

  // Требуемый капитал
  const avgRate =
    passiveCalc.value.instruments.length > 0
      ? passiveCalc.value.instruments.reduce(
          (sum, inst) => sum + inst.rate,
          0
        ) / passiveCalc.value.instruments.length
      : 8;

  const requiredCapital =
    (passiveCalc.value.targetMonthlyIncome * 12) / (avgRate / 100);
  const capitalDeficit = Math.max(0, requiredCapital - totalCapital);

  // Дата достижения цели
  let achievementDate = null;
  if (passiveCalc.value.monthlyAddition > 0 && capitalDeficit > 0) {
    const monthsToGoal = Math.ceil(
      capitalDeficit / passiveCalc.value.monthlyAddition
    );
    const now = new Date();
    const targetDate = new Date(
      now.getFullYear(),
      now.getMonth() + monthsToGoal
    );
    achievementDate = {
      month: targetDate.getMonth() + 1,
      year: targetDate.getFullYear(),
    };
  } else if (capitalDeficit === 0) {
    const now = new Date();
    achievementDate = {
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    };
  }

  passiveResults.value = {
    currentMonthlyIncome: Math.round(totalMonthlyIncome),
    requiredCapital: Math.round(requiredCapital),
    capitalDeficit: Math.round(capitalDeficit),
    achievementDate,
    breakdown,
  };
}

function calculatePassiveIncomeChart() {
  const labels = [];
  const income = [];
  const target = [];
  const targetValue = passiveCalc.value.targetMonthlyIncome;

  let capital = passiveCalc.value.instruments.reduce(
    (sum, inst) => sum + inst.principal,
    0
  );
  const avgRate =
    passiveCalc.value.instruments.length > 0
      ? passiveCalc.value.instruments.reduce(
          (sum, inst) => sum + inst.rate,
          0
        ) / passiveCalc.value.instruments.length
      : 8;

  const now = new Date();
  const months = 60; // 5 лет прогноза

  for (let m = 0; m <= months; m += 3) {
    const date = new Date(now.getFullYear(), now.getMonth() + m);
    labels.push(`${getMonthName(date.getMonth() + 1)} ${date.getFullYear()}`);

    const monthlyIncome = (capital * (avgRate / 100)) / 12;
    income.push(Math.round(monthlyIncome));
    target.push(targetValue);

    // Добавляем капитал за 3 месяца
    if (m < months) {
      capital += passiveCalc.value.monthlyAddition * 3;
    }
  }

  return { labels, income, target };
}

function getPassiveScenario(type, change) {
  const avgRate =
    passiveCalc.value.instruments.length > 0
      ? passiveCalc.value.instruments.reduce(
          (sum, inst) => sum + inst.rate,
          0
        ) / passiveCalc.value.instruments.length
      : 8;

  const totalCapital = passiveCalc.value.instruments.reduce(
    (sum, inst) => sum + inst.principal,
    0
  );

  let newRate = avgRate;
  let newAddition = passiveCalc.value.monthlyAddition;

  if (type === "rate") {
    newRate += change;
  } else if (type === "addition") {
    newAddition *= 1 + change / 100;
  }

  const requiredCapital =
    (passiveCalc.value.targetMonthlyIncome * 12) / (newRate / 100);
  const deficit = Math.max(0, requiredCapital - totalCapital);

  if (newAddition === 0 || deficit === 0) {
    return "нет изменений";
  }

  const monthsToGoal = Math.ceil(deficit / newAddition);
  const originalMonths = passiveResults.value.achievementDate
    ? (passiveResults.value.achievementDate.year - new Date().getFullYear()) *
        12 +
      (passiveResults.value.achievementDate.month - new Date().getMonth() - 1)
    : 0;

  const diff = monthsToGoal - originalMonths;

  if (Math.abs(diff) < 1) return "~без изменений";
  return diff > 0 ? `+${diff} мес.` : `${Math.abs(diff)} мес. раньше`;
}

function addOneTimeBonus() {
  const now = new Date();
  calc.value.oneTimeBonuses.push({
    month: now.getMonth() + 1,
    year: now.getFullYear() + 1,
    amount: 0,
  });
}

function removeBonus(index) {
  calc.value.oneTimeBonuses.splice(index, 1);
  debouncedRecalculate();
}

function addInstrument() {
  passiveCalc.value.instruments.push({
    name: `Инструмент ${passiveCalc.value.instruments.length + 1}`,
    principal: 0,
    rate: 8,
    capitalization: "monthly",
    payoutMode: "payout",
    until: { month: null, year: null },
    useTax: true,
    tax: 13,
  });
}

function removeInstrument(index) {
  passiveCalc.value.instruments.splice(index, 1);
  debouncedRecalculate();
}

// CRUD планов
function openPlanForm(plan = null) {
  editingPlan.value = plan;
  planFormError.value = "";

  if (plan) {
    planForm.value = {
      title: plan.title,
      category: plan.category,
      description: plan.description || "",
      imageUrl: plan.imageUrl || "",
      priceType: plan.targetAmount ? "exact" : "range",
      targetAmount: plan.targetAmount || null,
      minAmount: plan.minAmount || null,
      maxAmount: plan.maxAmount || null,
      hasDeadline: !!plan.deadline,
      deadline: plan.deadline || {
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear() + 1,
      },
    };
  } else {
    planForm.value = {
      title: "",
      category: "",
      description: "",
      imageUrl: "",
      priceType: "exact",
      targetAmount: null,
      minAmount: null,
      maxAmount: null,
      hasDeadline: false,
      deadline: {
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear() + 1,
      },
    };
  }

  showPlanModal.value = true;
}

function closePlanForm() {
  showPlanModal.value = false;
  editingPlan.value = null;
  planFormError.value = "";
}

function savePlan() {
  planFormError.value = "";

  if (!planForm.value.title || !planForm.value.category) {
    planFormError.value = "Заполните название и категорию";
    return;
  }

  if (planForm.value.category !== "Пассивный доход") {
    if (planForm.value.priceType === "exact" && !planForm.value.targetAmount) {
      planFormError.value = "Укажите целевую сумму";
      return;
    }

    if (planForm.value.priceType === "range") {
      if (!planForm.value.minAmount || !planForm.value.maxAmount) {
        planFormError.value = "Укажите диапазон цен";
        return;
      }

      if (planForm.value.minAmount >= planForm.value.maxAmount) {
        planFormError.value =
          "Минимальная цена должна быть меньше максимальной";
        return;
      }

      const rangeDiff = planForm.value.maxAmount - planForm.value.minAmount;
      const rangePercent = (rangeDiff / planForm.value.minAmount) * 100;

      if (rangePercent > 100) {
        planFormError.value =
          "Диапазон слишком широкий (разница >100%). Уточните цену или используйте точное значение.";
        return;
      }
    }
  }

  const newPlan = {
    id: editingPlan.value?.id || Date.now(),
    title: planForm.value.title,
    category: planForm.value.category,
    description: planForm.value.description,
    imageUrl: planForm.value.imageUrl,
  };

  if (planForm.value.category !== "Пассивный доход") {
    if (planForm.value.priceType === "exact") {
      newPlan.targetAmount = planForm.value.targetAmount;
    } else {
      newPlan.minAmount = planForm.value.minAmount;
      newPlan.maxAmount = planForm.value.maxAmount;
    }

    if (planForm.value.hasDeadline) {
      newPlan.deadline = { ...planForm.value.deadline };
    }
  } else {
    newPlan.targetAmount = planForm.value.targetAmount || 100000;
  }

  if (editingPlan.value) {
    const index = plans.value.findIndex((p) => p.id === editingPlan.value.id);
    plans.value[index] = newPlan;

    if (selectedPlan.value?.id === editingPlan.value.id) {
      selectedPlan.value = newPlan;
    }
  } else {
    plans.value.push(newPlan);
    selectedPlan.value = newPlan;
  }

  closePlanForm();
  recalculate();
}

function deletePlan() {
  if (!confirm("Вы уверены, что хотите удалить этот план?")) return;

  plans.value = plans.value.filter((p) => p.id !== editingPlan.value.id);

  if (selectedPlan.value?.id === editingPlan.value.id) {
    selectedPlan.value = plans.value[0] || null;
  }

  closePlanForm();
}

// Watchers
watch(
  () => selectedPlan.value,
  (newPlan) => {
    if (newPlan?.minAmount && newPlan?.maxAmount) {
      customPrice.value = Math.round(
        (newPlan.minAmount + newPlan.maxAmount) / 2
      );
    }

    // Сброс или инициализация калькулятора при смене плана
    if (
      newPlan?.category === "Пассивный доход" &&
      passiveCalc.value.targetMonthlyIncome !== newPlan.targetAmount
    ) {
      passiveCalc.value.targetMonthlyIncome = newPlan.targetAmount || 100000;
    }

    recalculate();
  }
);

watch(calcMode, () => {
  debouncedRecalculate();
});
</script>

<style scoped>
.plans-window {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  gap: 1px;
  background-color: #0a0a0a;
}

.column {
  display: flex;
  flex-direction: column;
  background-color: #111;
  overflow-y: auto;
}

.column-left {
  width: 300px;
  flex-shrink: 0;
  flex: 1;
  border-right: 1px solid #fff1;
}

.column-center {
  flex: 1;
  min-width: 350px;
  max-width: 500px;
  border-right: 1px solid #fff1;
}

.column-right {
  flex: 1.5;
  min-width: 400px;
}

.column-header {
  padding: 16px 20px;
  border-bottom: 1px solid #fff1;
  background-color: #0a0a0a;
  position: sticky;
  top: 0;
  z-index: 10;
}

.column-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

/* Левая колонка - планы */
.plans-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
}

.btn-create-plan {
  padding: 6px 12px;
  background-color: #1767fd;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn-create-plan:hover {
  background-color: #1557dd;
}

.plans-list {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.plan-card {
  background-color: #1a1a1a;
  border: 1px solid #fff1;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  gap: 10px;
}

.plan-card:hover {
  border-color: #fff3;
  transform: translateX(3px);
}

.plan-card.active {
  border-color: #1767fd;
  background-color: #1767fd10;
}

.plan-image {
  width: 50px;
  height: 50px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.plan-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.plan-info {
  flex: 1;
  min-width: 0;
}

.plan-title {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plan-category {
  font-size: 10px;
  color: #999;
  margin-bottom: 4px;
}

.plan-price {
  font-size: 12px;
  font-weight: 600;
  color: #1767fd;
  margin-bottom: 2px;
}

.plan-deadline {
  font-size: 10px;
  color: #666;
}

.plan-actions {
  display: flex;
  align-items: center;
}

.btn-icon-small {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  font-size: 12px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.btn-icon-small:hover {
  background-color: #2a2a2a;
  color: #fff;
}

/* Центральная колонка - калькулятор */
.calculator-inputs {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.input-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-label-with-tooltip {
  display: flex;
  align-items: center;
  gap: 6px;
}

.input-label-with-tooltip label {
  font-size: 13px;
  color: #bbb;
  font-weight: 500;
}

.tooltip-icon {
  font-size: 14px;
  cursor: help;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.tooltip-icon:hover {
  opacity: 1;
}

.input-section input[type="number"],
.input-section input[type="text"],
.input-section select,
.input-section textarea {
  padding: 10px 12px;
  background-color: #0a0a0a;
  border: 1px solid #fff2;
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  transition: border-color 0.2s;
}

.input-section input:focus,
.input-section select:focus,
.input-section textarea:focus {
  outline: none;
  border-color: #1767fd;
}

.strategy-buttons,
.mode-buttons {
  display: flex;
  gap: 6px;
}

.strategy-btn,
.mode-btn {
  flex: 1;
  padding: 8px;
  background-color: #0a0a0a;
  border: 1px solid #fff2;
  border-radius: 6px;
  color: #999;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
}

.strategy-btn:hover,
.mode-btn:hover {
  border-color: #fff3;
  color: #fff;
}

.strategy-btn.active,
.mode-btn.active {
  background-color: #1767fd;
  border-color: #1767fd;
  color: #fff;
}

.custom-price-input {
  margin-top: 8px;
}

.price-display {
  padding: 10px;
  background-color: #1767fd15;
  border-radius: 6px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: #1767fd;
}

.date-input-group {
  display: flex;
  gap: 8px;
}

.date-input-group select {
  flex: 1;
}

.date-input-group input {
  width: 80px;
}

.date-input-group-small {
  display: flex;
  gap: 6px;
}

.date-input-group-small select {
  flex: 1;
  min-width: 0;
}

.date-input-group-small input {
  width: 70px;
  flex-shrink: 0;
}

.sub-input {
  margin-top: 8px;
}

.sub-inputs-row {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.sub-inputs-row .sub-input {
  flex: 1;
  margin-top: 0;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #fff;
}

.checkbox-label input[type="checkbox"] {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

.checkbox-label-small {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #bbb;
}

.nested-section {
  padding: 12px;
  background-color: #0a0a0a50;
  border-radius: 6px;
  border: 1px solid #fff1;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.btn-add {
  padding: 8px 12px;
  background-color: #0a0a0a;
  border: 1px solid #fff2;
  border-radius: 6px;
  color: #999;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
}

.btn-add:hover {
  border-color: #1767fd;
  color: #1767fd;
}

.bonuses-list,
.instruments-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.bonus-item {
  display: flex;
  gap: 6px;
  align-items: center;
}

.bonus-item select,
.bonus-item input {
  padding: 6px 8px;
  background-color: #0a0a0a;
  border: 1px solid #fff2;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
}

.bonus-item select {
  flex: 1;
}

.bonus-item input[type="number"] {
  flex: 1.5;
}

.btn-remove-small {
  width: 28px;
  height: 28px;
  border: none;
  background-color: #ff4444;
  color: #fff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.btn-remove-small:hover {
  background-color: #dd3333;
}

/* Инструменты пассивного дохода */
.instrument-card {
  background-color: #0a0a0a;
  border: 1px solid #fff2;
  border-radius: 8px;
  padding: 12px;
}

.instrument-header {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.instrument-name-input {
  flex: 1;
  padding: 6px 10px;
  background-color: #1a1a1a;
  border: 1px solid #fff2;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.instrument-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field-row {
  display: flex;
  gap: 10px;
}

.field-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-group label {
  font-size: 11px;
  color: #999;
}

.field-group input,
.field-group select {
  padding: 6px 8px;
  background-color: #1a1a1a;
  border: 1px solid #fff2;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
}

.field-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tax-input {
  width: 60px;
  padding: 4px 6px;
  background-color: #1a1a1a;
  border: 1px solid #fff2;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
}

/* Правая колонка - итоги */
.results-container {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.result-section {
  background-color: #1a1a1a;
  border: 1px solid #fff1;
  border-radius: 10px;
  padding: 16px;
}

.result-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.result-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 16px 0;
}

.result-card {
  padding: 14px;
  background-color: #0a0a0a;
  border-radius: 8px;
  border: 1px solid #fff1;
  margin-bottom: 12px;
}

.result-card:last-child {
  margin-bottom: 0;
}

.result-card.primary {
  border-color: #1767fd;
  background-color: #1767fd10;
}

.result-card.inflation {
  background-color: #ff990010;
  border-color: #ff990030;
}

.result-label-with-tooltip {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.result-label {
  font-size: 11px;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.result-value {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
}

.result-value.highlight {
  color: #1767fd;
}

.result-value.positive {
  color: #4ade80;
}

.result-sublabel {
  font-size: 11px;
  color: #666;
  margin-top: 4px;
}

.inflation-values {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.inflation-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #bbb;
}

.inflation-row strong {
  color: #fff;
}

.warning-card {
  padding: 12px;
  background-color: rgba(255, 68, 68, 0.1);
  border: 1px solid rgba(255, 68, 68, 0.3);
  border-radius: 6px;
  color: #ff6666;
  font-size: 12px;
  line-height: 1.5;
}

/* Сценарии */
.scenarios-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.scenario-card {
  background-color: #0a0a0a;
  border: 1px solid #fff1;
  border-radius: 8px;
  padding: 12px;
}

.scenario-title {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
}

.scenario-desc {
  font-size: 10px;
  color: #666;
  margin-bottom: 10px;
  line-height: 1.3;
}

.scenario-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 11px;
  border-bottom: 1px solid #fff1;
}

.scenario-item:last-child {
  border-bottom: none;
}

.scenario-change {
  color: #999;
  font-weight: 500;
}

.scenario-result {
  color: #fff;
  font-weight: 600;
}

/* График */
.chart-wrapper {
  height: 250px;
  background-color: #0a0a0a;
  border-radius: 8px;
  padding: 12px;
}

/* Summary */
.summary-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 12px;
  background-color: #0a0a0a;
  border-radius: 6px;
  font-size: 12px;
}

.summary-row span {
  color: #999;
}

.summary-row strong {
  color: #fff;
}

/* Пассивный доход - разбивка */
.instruments-breakdown {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.breakdown-row {
  padding: 12px;
  background-color: #0a0a0a;
  border-radius: 6px;
  border-left: 3px solid #4ade80;
}

.breakdown-name {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
}

.breakdown-value {
  font-size: 15px;
  font-weight: 700;
  color: #4ade80;
  margin-bottom: 4px;
}

.breakdown-detail {
  font-size: 10px;
  color: #666;
}

/* Общие */
.no-plan-message,
.no-data,
.no-data-small {
  text-align: center;
  color: #666;
  font-size: 13px;
  padding: 40px 20px;
}

.no-data-small {
  padding: 20px;
  font-size: 12px;
}

/* Модальные окна */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}

.modal {
  background-color: #1a1a1a;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  border: 1px solid #fff2;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #fff1;
  position: sticky;
  top: 0;
  background-color: #1a1a1a;
  z-index: 1;
}

.modal-header h3 {
  margin: 0;
  color: #fff;
  font-size: 18px;
}

.modal-close {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background-color: #2a2a2a;
  color: #fff;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s ease;
}

.modal-close:hover {
  background-color: #ff4444;
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  color: #999;
  font-size: 13px;
  margin-bottom: 6px;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  background-color: #0a0a0a;
  border: 1px solid #fff2;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-family: inherit;
}

.form-group textarea {
  min-height: 80px;
  resize: vertical;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #1767fd;
}

.form-group-row {
  display: flex;
  gap: 12px;
}

.form-group-row .form-group {
  flex: 1;
}

.price-type-selector {
  display: flex;
  gap: 16px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #fff;
  font-size: 14px;
}

.radio-label input[type="radio"] {
  cursor: pointer;
}

.error-message {
  color: #ff4444;
  font-size: 13px;
  padding: 10px 12px;
  background-color: rgba(255, 68, 68, 0.1);
  border-radius: 6px;
  border: 1px solid rgba(255, 68, 68, 0.3);
  margin-top: 8px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px;
  border-top: 1px solid #fff1;
  position: sticky;
  bottom: 0;
  background-color: #1a1a1a;
}

.btn-cancel,
.btn-save,
.btn-delete {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn-cancel {
  background-color: #2a2a2a;
  color: #fff;
}

.btn-cancel:hover {
  background-color: #3a3a3a;
}

.btn-save {
  background-color: #1767fd;
  color: #fff;
}

.btn-save:hover {
  background-color: #1557dd;
}

.btn-delete {
  background-color: #ff4444;
  color: #fff;
  margin-right: auto;
}

.btn-delete:hover {
  background-color: #dd3333;
}

/* Scrollbar */
.column::-webkit-scrollbar,
.modal::-webkit-scrollbar {
  width: 6px;
}

.column::-webkit-scrollbar-track,
.modal::-webkit-scrollbar-track {
  background: transparent;
}

.column::-webkit-scrollbar-thumb,
.modal::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}

.column::-webkit-scrollbar-thumb:hover,
.modal::-webkit-scrollbar-thumb:hover {
  background: #444;
}
</style>
