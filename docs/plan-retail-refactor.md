# План: завершение рефакторинга retail-калькулятора

> Режим: Architect → ТЗ. Реализует Coder (`docs/ai/coder.md`).
> Дефект: незакоммиченный рефакторинг HTML retail-формы (новая модель
> «выручка/себестоимость/расходы») без соответствующей JS-логики → 8 битых id,
> retail-калькулятор нерабочий.

## Решения (согласованы с пользователем)
1. **Полная экономическая модель:** Прибыль = выручка − себестоимость − расходы.
2. **Вернуть поле ставки ЦБ** (`retail-cbr-rate`) в HTML retail-формы.

## 🏗 Blast Radius (читано целиком)
- `public/index.html:77-95` — retail-форма: поля `retail-revenue`, `retail-cost-price`,
  `retail-expenses`, `retail-period`. **Нет** поля ставки ЦБ → вернуть.
- `public/index.html:101-116` — блок результатов: id `retail-profit-amount`, `retail-markup`,
  `retail-margin`, `retail-roi`, `retail-yearly-yield`, `retail-detail-revenue`,
  `retail-detail-cost`, `retail-detail-expenses`, `retail-taxAmount`, `retail-finalDeposit`.
  **Нет** `retail-taxFreeLimit`/`retail-taxableAmount` (в старом UI были) → в новом UI
  показываем только `retail-taxAmount`, лимиты не восстанавливаем (out of scope).
- `public/script.js:246-295` — `calculateRetail()` полностью переписать под новые id/формулы.
- `public/script.js:460-472` — `clearRetailForm()` переписать под новые id.
- `public/script.js:474-496` — `DOMContentLoaded`: `amountInputs` ссылается на устаревшие
  `retail-initial`, `retail-rate` → заменить на `retail-revenue`, `retail-cost-price`,
  `retail-expenses`.
- `calculateTax(profitByYear, maxBalance, cbrRate)` — **не трогать**, переиспользовать.

## 📋 ТЗ (детальное)

### Формулы (полная модель)
```
прибыль   (profit)   = revenue − cost − expenses
наценка   (markup)   = cost > 0     ? profit / cost × 100            : 0
маржа     (margin)   = revenue > 0  ? profit / revenue × 100         : 0
ROI                  = (cost+exp) > 0 ? profit / (cost+expenses) × 100 : 0
годовая доходность   = period > 0   ? ROI × 12 / period              : 0
```

### Налог (переиспользовать `calculateTax`)
- `maxBalance` для retail = `cost + expenses` (вложенный капитал — аналог макс. остатка).
- `profitByYear` = `[Math.max(profit, 0)]` (убыток налогом не облагается; консистентно с
  `calculateCurrency`, который уже использует `Math.max(profit, 0)`).
- `cbrRate` — из поля `retail-cbr-rate` (после возврата в HTML), fallback `21`.
- `finalAmount = revenue − expenses (??? )` — НЕТ. `finalAmount = profit − taxResult.taxAmount`.
  (Прибыль за вычетом налога = то, что «на руках».)

### Контракт DOM-ID (HTML ↔ JS, точный список)
HTML (после правки): `retail-revenue`, `retail-cost-price`, `retail-expenses`, `retail-period`,
`retail-cbr-rate` (вернуть), `retail-profit-amount`, `retail-markup`, `retail-margin`,
`retail-roi`, `retail-yearly-yield`, `retail-detail-revenue`, `retail-detail-cost`,
`retail-detail-expenses`, `retail-taxAmount`, `retail-finalDeposit`. **Итого 15 id.**

### `public/script.js` — `calculateRetail()` (переписать)
Псевдокод:
1. Прочитать: revenue, cost, expenses (parseFormattedNumber), period (parseInt),
   cbrRate (parseFloat || 21) из соответствующих id.
2. Валидация: каждое из revenue/cost/expenses ≥ 0 и не NaN; period > 0. Сообщение в DOM
   (НЕ alert) — например, установка текста в `retail-profit-amount` вида «Введите корректные
   значения» и return. Сфокусировать первое невалидное поле.
3. profit = revenue − cost − expenses.
4. markup/margin/ROI/yearlyYield по формулам выше (с защитой от деления на 0).
5. taxResult = calculateTax([Math.max(profit,0)], cost+expenses, cbrRate).
6. finalAmount = profit − taxResult.taxAmount.
7. Записать результаты: profit-amount, markup, margin, roi, yearly-yield, detail-revenue,
   detail-cost, detail-expenses, taxAmount, finalDeposit. Использовать formatNumber (₽) /
   formatDecimal (%).
8. **Чистая функция (опц., если вписывается в <80 строк):** вынести расчёт метрик в
   `calculateRetailMetrics(revenue, cost, expenses, period) -> {profit, markup, margin, roi, yearlyYield}`,
   не трогающий document.* (соответствие AGENTS.md §6.2). Если не помещается — оставить inline
   с пометкой для будущего рефакторинга.

### `public/script.js` — `clearRetailForm()` (переписать)
Сбросить: revenue/cost/expenses → '0', period → '1', cbr-rate → '21', все span-результаты → '0 ₽'/'0 %'.

### `public/script.js` — `DOMContentLoaded` amountInputs (правка)
Заменить `getElementById('retail-initial')` → `retail-revenue`, `getElementById('retail-rate')`
→ `retail-cost-price`, **добавить** `retail-expenses`. (Эти поля получают форматирование чисел
с разделителями — как было у старых полей.)

### `public/index.html` — вернуть поле ставки ЦБ
В retail-форму (`public/index.html:77-95`), после блока `retail-expenses` и перед `retail-period`,
добавить блок «Ключевая ставка ЦБ» по образцу bank-формы (с кнопкой fetch, id `retail-cbr-rate`).
**NB:** кнопка fetch в retail — `.btn-fetch-cbr` (общий класс для всех трёх калькуляторов;
`fetchCbrRate()` уже обновляет `CBR_RATE_INPUTS = ['cbr-rate','retail-cbr-rate','currency-cbr-rate']`).

### Edge-кейсы (обязательно обработать)
- cost = 0 → markup = 0 (защита деления).
- revenue = 0 → margin = 0.
- cost + expenses = 0 → ROI = 0.
- profit < 0 (убыток): налог = 0 (через Math.max), yearly-yield/ROI могут быть отрицательными
  (показывать с минусом, формат допускает).
- period ≤ 0 → guard, не делить.

## 🛡 Защита
- Налог через чистую `calculateTax` (без изменений).
- Убыток → налог 0 (Math.max).
- Сообщения об ошибках в DOM, не alert (AGENTS.md §7).
- Никаких `innerHTML` с вводом — только `textContent` и formatNumber/formatDecimal.

## 🧪 Проверочные кейсы (ручные, автотестов нет)
| Вход (revenue/cost/expenses/period/cbr) | Ожидание |
|---|---|
| 200000 / 100000 / 20000 / 6 / 21 | profit=80000, markup=80%, margin=40%, ROI≈66.67%, yearly≈133.33% |
| 100000 / 100000 / 0 / 12 / 21 | profit=0, markup=0, margin=0, ROI=0, tax=0, final=0 |
| 50000 / 80000 / 0 / 1 / 21 | profit=−30000 (убыток), tax=0, final=−30000 |
| 0 / 0 / 0 / 1 / 21 | profit=0, без деления на 0 |

## DoD (AGENTS.md §9)
- [ ] `node --check server.js && node --check public/script.js` OK
- [ ] `node server.js` стартует; `GET /` отвечает
- [ ] retail-калькулятор пересчитывает по всем 4 кейсам выше (проверить в браузере/curl)
- [ ] DOM-ID контракт: `grep getElementById('retail-...')` ↔ `id="retail-..."` сходится (0 расхождений)
- [ ] `clearRetailForm` сбрасывает все retail-поля
- [ ] поле ставки ЦБ синхронизируется между тремя калькуляторами (ввод в одном → меняется в других)
