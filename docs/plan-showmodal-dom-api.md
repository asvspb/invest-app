# ТЗ — Устранение `innerHTML` в `showModal` через DOM API (§8.3)

> Спек от архитектора (`docs/ai/architect.md`, §5). Закрывает последний P0-долг §8.3: единственный
> `innerHTML` в проекте (`script.js:71`) — потенциальная XSS-поверхность. Подход: устранить **класс**
> уязвимости переводом на DOM API (`createElement` + `createTextNode`), а не латать конкретный
> случай через `escape()`. **Один файл, ноль новых зависимостей, ноль новых сущностей.**

---

## 🏗 Архитектурный разбор & Blast Radius

**Проблема.** `showModal(content)` (`script.js:68-86`) делает `detailsContainer.innerHTML = content`
(`script.js:71`). Контент — HTML-строка, собранная в `calculateBankProfit` (`script.js:181-218`) с
интерполяцией: `` `<p>Месяц ${i}:<br>Прибыль: ${formatDecimal(monthProfit)} ₽<br>...` ``.

**Анализ серьёзности (архитектор читал все источники данных):**
- Сегодня в `innerHTML` попадают: статический HTML (`<p>`, `<br>`, тексты) + `${i}` (целое из цикла)
  + `${formatDecimal(x)}` (вывод `num.toFixed(2)` — только цифры/точка/пробелы).
- `formatDecimal` (`script.js:63`) **гарантированно числовой** — `toFixed(2)` не может вернуть `<`,
  кавычки или пользовательский текст.
- **Вывод: сегодня XSS не эксплуатируется.** Все интерполяции числовые.

**Почему это всё равно P0:**
1. Это **хрупкая конструкция**. Шаблонная строка с интерполяцией = класс уязвимости. Любая будущая
   правка, добавляющая строковое поле (название вклада, комментарий, данные из ответа ЦБ), **автоматически
   станет XSS** — баг «по умолчанию».
2. §7 явно запрещает `innerHTML` с непроверенным контентом; текущий контент формально «не пользовательский»,
   но собирается тем же антипаттерном.
3. Класс не закрыт, а латан совпадением (все данные числовые).

**Blast radius (читано целиком):**
- `public/script.js` — **единственный затрагиваемый файл**, 2 функции:
  - `showModal(content)` (`script.js:68-86`) — переписать рендеринг.
  - `calculateBankProfit` (`script.js:181-218`) — изменить **только** сборку `calculationDetails`
    (строка → структура данных). **Расчётную логику не трогать.**
- `public/index.html` — **не затрагивается**: `calculationModal`, `calculationDetails`, `.close`
  остаются (контракт id сохранён).
- `public/styles.css` — **не затрагивается**: `#calculationDetails p`/`br` стили работают с DOM-узлами
  так же, как с innerHTML-разметкой.
- Бизнес-логика, эндпоинты, другие калькуляторы (`retail`/`metal`/`currency` не используют `showModal`) —
  **не затрагиваются**.

**Сущностей: 2** (`showModal`, `calculateBankProfit`-сборка). Задача < 4 сущностей, формат приведён
кратко ради edge-кейсов (security-задача).

---

## 📋 Детальное ТЗ

### Принцип решения
Перейти от «HTML-строка с интерполяцией» к «структура данных → DOM-рендер». Два шага:
1. Сборка: вместо `calculationDetails += '<p>...HTML...'` — собрать **массив абзацев**, каждый абзац =
   массив текстовых строк.
2. Рендер: `showModal` строит DOM через `createElement`/`createTextNode` — браузер сам экранирует текст.

### 1. Изменить сборку в `calculateBankProfit` (`script.js:181-218`)

**Было** (`calculationDetails` — HTML-строка):
```js
let calculationDetails = '';
// ...
if (showHow) {
    calculationDetails += `<p>Месяц ${i}:<br>`;
    calculationDetails += `Прибыль: ${formatDecimal(monthProfit)} ₽<br>`;
}
if (isReinvest) {
    totalAmount += monthProfit;
    if (showHow) {
        calculationDetails += `Реинвестировано: ${formatDecimal(monthProfit)} ₽<br>`;
    }
}
// ... monthlyDeposit, totalAmount аналогично ...
if (showHow) {
    calculationDetails += `Итого на конец месяца: ${formatDecimal(totalAmount)} ₽</p><br>`;
}
// ...
if (showHow) { showModal(calculationDetails); }
```

**Стало** (`calculationDetails` — массив массивов строк; расчётная логика — **без изменений**):
```js
const details = [];   // массив абзацев; каждый абзац = массив строк
// ...
if (showHow) {
    const lines = [
        `Месяц ${i}:`,
        `Прибыль: ${formatDecimal(monthProfit)} ₽`
    ];
    if (isReinvest) lines.push(`Реинвестировано: ${formatDecimal(monthProfit)} ₽`);
    // (isReinvest-расчёт totalAmount += monthProfit — ОСТАЁТСЯ ВНЕ этого блока, как сейчас)
    if (monthlyDeposit > 0) lines.push(`Пополнение: ${formatDecimal(monthlyDeposit)} ₽`);
    lines.push(`Итого на конец месяца: ${formatDecimal(totalAmount)} ₽`);
    details.push(lines);
}
// ...
if (showHow) { showModal(details); }
```

⚠ **Критично сохранить расчётную логику побитово**: `totalAmount += monthProfit` (реинвест) и
`totalAmount += monthlyDeposit` должны выполняться в той же последовательности, что и сейчас
(`script.js:200-208`). Меняется **только** формат накопления текста (строка → массив), не порядок
математики. Расчётный результат (`totalProfit`, `profit`, `taxResult`) не должен измениться ни на копейку.

### 2. Переписать `showModal` (`script.js:68-86`)

**Было:**
```js
function showModal(content) {
    const modal = document.getElementById('calculationModal');
    const detailsContainer = document.getElementById('calculationDetails');
    detailsContainer.innerHTML = content;
    modal.style.display = "block";
    const span = document.getElementsByClassName("close")[0];
    span.onclick = function () { modal.style.display = "none"; }
    window.onclick = function (event) { if (event.target == modal) { modal.style.display = "none"; } }
}
```

**Стало** (DOM-рендер; обработчики закрытия — без изменений):
```js
function showModal(paragraphs) {
    const modal = document.getElementById('calculationModal');
    const detailsContainer = document.getElementById('calculationDetails');

    // Очищаем и собираем через DOM API (НЕ innerHTML)
    detailsContainer.replaceChildren();
    for (const lines of paragraphs) {
        const p = document.createElement('p');
        lines.forEach((line, idx) => {
            if (idx > 0) p.appendChild(document.createElement('br'));
            p.appendChild(document.createTextNode(line));
        });
        detailsContainer.appendChild(p);
    }

    modal.style.display = "block";
    const span = document.getElementsByClassName("close")[0];
    span.onclick = function () { modal.style.display = "none"; }
    window.onclick = function (event) { if (event.target == modal) { modal.style.display = "none"; } }
}
```

**Ключевые точки решения:**
- `replaceChildren()` — современный API (Chrome 86+/FF 78+/Safari 14+, на 2026 — везде), очищает
  контейнер за один вызов (заменяет `detailsContainer.innerHTML = ''`).
- `createTextNode(line)` — **браузер сам экранирует** текст; даже если `line` содержит `<script>`,
  он отрендерится как видимый текст, а не исполнится. Это и есть закрытие класса уязвимости.
- `<br>` между строками внутри абзаца — сохраняет визуальный формат оригинала.
- Обработчики закрытия (`close`, `window.onclick`) — **без изменений**, копировать как есть.

---

## 🛡 Граничные случаи & Защита архитектуры

**Безопасность (главное):**
- После правки **любой** текст, попавший в `details`, отрендерится как видимый текст, не как HTML.
  Даже если будущая правка добавит строковое поле — XSS невозможен по построению.
- `createTextNode` — единственный канал попадания данных в DOM; `innerHTML` в проекте — **0**
  (после правки).
- Проверка: `grep -c "innerHTML" public/script.js` → должно быть **0**.

**Визуальная идентичность (регрессия):**
- Структура `<p>...<br>...<br>...</p>` воспроизводится точно: абзац = `<p>`, строки внутри разделены
  `<br>`. CSS `#calculationDetails p`/`br` работают с DOM-узлами идентично innerHTML-разметке.
- Порядок строк в каждом абзаце — тот же: Месяц → Прибыль → Реинвест (если вкл.) → Пополнение (если >0)
  → Итого.

**Расчётная логика (регрессия — критично):**
- `totalAmount`, `totalProfit`, `monthlyDeposit`-накопление, `profitByYear` — **не должны измениться**.
  Меняется только то, что попадает в `details` (текст), не математика.
- Проверка: для одинаковых входов до/после правки — `profit`, `totalDeposit`, `taxAmount` в банке
  совпадают побитово (кейсы ниже).

**Поведение modal:**
- Открытие: `modal.style.display = "block"` — без изменений.
- Закрытие: крестик `.close` + клик вне modal — без изменений.
- Повторное открытие: `replaceChildren()` очищает старый контент перед новой сборкой — не накапливается.

**Edge-данные:**
- `formatDecimal(NaN)` → `"NaN"` (toFixed на NaN). Не крашит createTextNode, отрендерится как текст "NaN".
  (Такое и сейчас возможно; не регрессия.)
- Пустой массив `paragraphs` (если `showHow` ни разу не сработал) — `replaceChildren()` без цикла,
  modal откроется пустым. Но `showHow` блок выполнится хотя бы раз при `period >= 1` (валидация
  `calculateBankProfit` гарантирует `period > 0`). Не падает.

---

## 🧪 Проверочные кейсы (ручные — автотестов нет, AGENTS.md §5)

**A. XSS-невозможность (главный критерий §8.3):**

| Проверка | Ожидание |
|---|---|
| `grep -c "innerHTML" public/script.js` | **0** |
| Симулировать: вручную вызвать `showModal([['<script>alert(1)</script>','<img src=x onerror=alert(1)>']])` в консоли | текст отрендерится **видимым**, скрипт **НЕ** исполнится, `alert` **НЕ** всплывёт |

**B. Функциональность банка (регрессия — расчёт не сломан):**

| Вход | Ожидание (как до правок) |
|---|---|
| amount=100000, period=12, percent=10, reinvest=on, show-how=on | modal открывается, 12 абзацев «Месяц N:», формат как раньше |
| amount=100000, period=12, percent=10, monthly=5000, show-how=on | в каждом абзаце есть «Пополнение: 5 000 ₽» |
| amount=100000, period=3, percent=0, reinvest=off, show-how=off | modal **НЕ** открывается (show-how off); `profit`=0 |

**C. Побитовая идентичность расчёта (критично — DRY-инвариант):**

| Вход | Сверить до и после правки |
|---|---|
| amount=100000, period=12, percent=10, monthly=0, reinvest=on | `profit`, `totalDeposit`, `taxAmount` — **идентичны** до копейки |

Снять значения ДО правки (текущий код) и сравнить ПОСЛЕ — числа должны совпасть. Если хоть одно
отличается — нарушена расчётная логика (реджект).

**D. DOM-ID контракт:**

| Проверка | Ожидание |
|---|---|
| `getElementById('calculationModal')`, `getElementById('calculationDetails')` | работают (id не тронуты) |
| `.close` — кликабельный крестик | закрывает modal |
| `grep -n "id=\"calculationDetails\"\|id=\"calculationModal\"" index.html` | на месте |

---

## Definition of Done (AGENTS.md §9, целиком)

- [ ] `node --check server.js && node --check public/script.js` — синтаксис OK
- [ ] `node server.js` стартует; `GET /` и `GET /api/cbr-key-rate` отвечают (ручная smoke)
- [ ] `docker build .` succeeds — **не трогаем** `Dockerfile`/`package.json` (условно-зелёный)
- [ ] все 4 калькулятора пересчитывают; **модалка «Показать вычисление» открывается** (критерий этой задачи)
- [ ] DOM-ID контракт не сломан (`calculationModal`, `calculationDetails`, `.close` — на месте)
- [ ] секреты остались вне `public/` (секретов нет — не заведи)
- [ ] правок расчётной логики нет — кейсы B/C пройдены (побитовая идентичность чисел банка)
- [ ] **`grep -c "innerHTML" public/script.js` → 0** (главный критерий закрытия §8.3)
- [ ] XSS-кейс A: `<script>` в данных не исполняется

---

## ⚠ Что НЕ делать (anti-scope, реджект на ревью)

- **Не вводить `escapeHtml()`** и не оставлять `innerHTML` — это латает случай, не класс. Только DOM API.
- **Не трогать расчётную логику** `calculateBankProfit` (цикл, `totalAmount`, `totalProfit`,
  `profitByYear`, `calculateTax`). Меняется **только** накопление текста.
- **Не трогать** `calculateRetail`/`calculateMetal`/`calculateCurrency` (они не используют `showModal`).
- **Не менять** структуру modal в `index.html` (id, классы, `.close`).
- **Не трогать** `server.js`, эндпоинты, стили.
- **Не «улучшать»** modal (анимации, новый дизайн) — это в `plan-design-saas.md`.

---

## 📐 Эталоны для кодера (читать перед реализацией)

- **Текущая сборка** — `calculateBankProfit` `script.js:181-218` (что именно переписать).
- **Текущий showModal** — `script.js:68-86` (что именно переписать).
- **`formatDecimal`** — `script.js:63` (гарантированно числовой; данные безопасны, но подход меняем).
- **`replaceChildren()`** — стандартный DOM API; замена `container.innerHTML = ''` + ручного цикла.

---

> Кодер (`docs/ai/coder.md`) реализует строго по этому спеку. Архитектор проводит параноид-ревью по
> `architect.md` §4: сам перезапускает smoke, проверяет `grep -c "innerHTML" == 0`, гоняет XSS-кейс A
> (симуляция `<script>` через консоль), сверяет побитовую идентичность расчёта банка (кейс C) до и после.
