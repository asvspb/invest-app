# ТЗ — Калькулятор драгметаллов (Au/Ag/Pt/Pd)

> Спек от архитектора (`docs/ai/architect.md`, §5, «полная задача»).
> Новая фича: 4-й калькулятор по аналогии с валютным; общая логика «купил→продал»
> вынесена в чистую переиспользуемую функцию. Источник котировок верифицирован напрямую
> (живой XML ЦБ РФ, не гадательно). Решения заказчика: отдельный блок; НДФЛ по ст. 214.2.

---

## 🏗 Архитектурный разбор & Blast Radius

**Задача.** Четвёртый калькулятор: инвестирование в драгметаллы (золото, серебро, платина,
палладий). Модель та же, что у валюты: трата ₽ → покупка актива по цене X → продажа по цене Y →
прибыль, доходность, спред к справочной цене ЦБ, НДФЛ. Котировки тянутся с ЦБ РФ.

**Верифицированный источник котировок** (архитектор получил живой ответ, см. «Источники»):
- URL: `https://www.cbr.ru/scripts/XML_metall.asp?date_req1=DD.MM.YYYY&date_req2=DD.MM.YYYY`
  (разделитель даты — **`.`**, параметры — `date_req1` / `date_req2`; НЕ `date1/date2`, НЕ `/`).
- Корень `<Metall FromDate="YYYYMMDD" ToDate="…" name="Precious metals quotations">`.
- Записи: `<Record Date="DD.MM.YYYY" Code="N"><Buy>10132,26</Buy><Sell>10132,26</Sell></Record>`.
- Коды: **1=Au, 2=Ag, 3=Pt, 4=Pd**; единица — **₽ за грамм**; десятичный разделитель — запятая.
- Кодировка ответа — windows-1251 (как у `XML_daily.asp`, который уже парсится в проекте).

**Blast radius (читано целиком):**
- `server.js` — добавить эндпоинт `/api/cbr-metals` по образцу `/api/cbr-rates` (`server.js:55-94`),
  но **сразу с таймаутом (`AbortController`) и кешем TTL=1ч** — не плодим новые дефекты §8.1/§8.2.
  Парсинг вынести в чистую функцию `parseCbrMetallXml(xml)` (параллель будущей `parseCbrXml`).
- `public/script.js` (факт = **591 строка**, в `AGENTS.md` §6.1 указано 567 — SSOT устарел):
  - новая чистая функция `calculateAssetRoundTrip({...})` — общее ядро для валюты и металлов;
  - `calculateCurrency()` (`script.js:350-428`) — **переподписать на общее ядро**, сохранив
    побитово текущий вывод (регрессия-нейтрально); глобаль `lastCbrExchangeRate` остаётся как есть;
  - новые `fetchCbrMetals()`, `calculateMetal()`, `clearMetalForm()`; обвязка в `DOMContentLoaded`;
  - **добавить `'metal-cbr-rate'` в массив `CBR_RATE_INPUTS`** (`script.js:1`) — иначе ключевая
    ставка не синхронизируется между 4 калькуляторами (критичное ребро DOM-ID контракта).
- `public/index.html` — новый блок `<div class="calculator-container">` с калькулятором металлов,
  вставляется **после** валютного (`index.html:127-193`), перед `<script src="script.js">`.
- `public/styles.css` — подавляющее большинство переиспользуется (`.calculator-container`,
  `.input-with-btn`, `.btn-fetch`, `.form-select`, `.result`, `.profit-positive/-negative`).
  Новых правил — ноль или почти ноль (если нужны — каждое обосновать).

**Решение по DRY.** Сегодня `calculateCurrency()` смешивает расчёт и DOM. Выносим «мозг» в чистую
функцию `calculateAssetRoundTrip()` (объект → объект, без `document.*` — образец `calculateTax`).
Оба калькулятора вызывают ядро и сами маппят результат в свои DOM-ID. Это:
  (а) убирает дублирование ~80 строк;
  (б) даёт чистую единицу для будущих ручных тестов;
  (в) частично компенсирует рост `script.js`.

**⚠ Зафиксированный trade-off (эскалация techdebt).** Даже с DRY `script.js` уйдёт за ~660 строк —
это усугубляет §6.1/§8.6. Бандлить сюда полное дробление файла по калькуляторам **нельзя** —
раздувает blast radius и риск регрессии (см. `docs/plan-retail-refactor.md`). Дробление —
**отдельная задача**. Здесь кодер обязан минимизировать след за счёт DRY, архитектор трекает рост.

**Сущностей в задаче: 6** (`server.js`, `/api/cbr-metals`, `index.html`, `script.js`,
`calculateAssetRoundTrip`, `styles.css`) → **> 4**, потому полный формат (§5).

---

## 📋 Детальное ТЗ

### 1. `server.js` — эндпоинт `/api/cbr-metals`

1. Константы рядом с `cachedKeyRate` (`server.js:12`):
   - `let metalsCache = { data: null, ts: 0 };`
   - `const METALS_TTL_MS = 60 * 60 * 1000;` (1 час)
   - `const CBR_TIMEOUT_MS = 5_000;` (таймаут fetch)
   - `const METAL_CODES = { 1: 'Au', 2: 'Ag', 3: 'Pt', 4: 'Pd' };`
2. Чистая функция `parseCbrMetallXml(xml) -> { date, metals }`:
   - регэкспом `<Record Date="([^"]+)"\s+Code="(\d+)">\s*<Buy>([\d,]+)</Buy>\s*<Sell>([\d,]+)</Sell>`
     по `g`-флагу;
   - для каждой записи: `code = METAL_CODES[Code]` (пропустить неизвестный Code), цена =
     `parseFloat(Buy.replace(',', '.'))` (Buy — официальная учётная цена ЦБ; Buy/Sell у ЦБ
     совпадают, берём одно значение);
   - вернуть `{ date: <первая Date ответа>, metals: { Au: <цена>, Ag: …, Pt: …, Pd: … } }`.
   - **не трогает** `req`/`res` — чистая (образец `calculateTax`).
3. Хелпер `fetchCbrMetalls() -> { date, metals }` (или инлайн в обработчике):
   - URL с `date_req1 = date_req2 = сегодня` в формате `DD.MM.YYYY`;
   - `fetch(url, { signal, headers: { 'User-Agent': 'Mozilla/5.0' } })` через `AbortController`
     + `setTimeout(CBR_TIMEOUT_MS)` с очисткой таймера в `finally` (см. «Защита архитектуры»);
   - не-OK / пустое тело → throw.
4. Обработчик `app.get('/api/cbr-metals', ...)`:
   - если `req.query.refresh !== 'true'` **И** `Date.now() - metalsCache.ts < METALS_TTL_MS`
     → `res.json({ ...metalsCache.data, cached: true })`;
   - иначе `fetchCbrMetalls()` → `metalsCache = { data, ts: Date.now() }` →
     `res.json({ ...data, cached: false })`;
   - catch: если есть `metalsCache.data` → `res.json({ ...metalsCache.data, cached: true, stale: true })`,
     иначе `res.status(502).json({ error: 'CBR metals unavailable' })` + `console.error` с контекстом.
5. Объявление эндпоинта — **до** `app.listen` (рядом с `/api/cbr-rates`).

### 2. `public/script.js` — общее ядро и металлы

**2.1. Чистая функция `calculateAssetRoundTrip(params)`** (объект → объект, без `document.*`):
- Вход: `{ amount, buyPrice, sellPrice, refPrice, keyRate, holdPeriod }` (все числа; предусловие
  `amount>0, buyPrice>0, sellPrice>0, holdPeriod>0` — валидирует вызывающий).
- Алгоритм (псевдокод):
  ```
  units       = amount / buyPrice
  rubAfterSell = units * sellPrice
  profit      = rubAfterSell - amount
  // спред к справочной цене ЦБ (refPrice); при refPrice<=0 спреды/маржи = 0
  spreadBuy   = refPrice>0 ? buyPrice - refPrice        : 0   // переплата при покупке
  spreadSell  = refPrice>0 ? refPrice - sellPrice       : 0   // уступка при продаже
  totalSpread = spreadBuy + spreadSell
  marginBuy   = refPrice>0 ? spreadBuy  / refPrice*100  : 0
  marginSell  = refPrice>0 ? spreadSell / refPrice*100  : 0
  marginTotal = refPrice>0 ? totalSpread/ refPrice*100  : 0
  periodYield = profit/amount*100
  yearlyYield = periodYield * (365/holdPeriod)
  tax = calculateTax([max(profit,0)], amount, keyRate)
  finalAmount = rubAfterSell - tax.taxAmount
  return { units, rubAfterSell, profit, periodYield, yearlyYield,
           spreadBuy, spreadSell, totalSpread, marginBuy, marginSell, marginTotal,
           tax, finalAmount }
  ```

**2.2. Переподписать `calculateCurrency()` (`script.js:350-428`) на ядро — побитово идентичный вывод:**
- рассчитать ядром: `buyPrice = sellRate`, `sellPrice = buyRate`, `refPrice = lastCbrExchangeRate || 0`,
  `keyRate = cbrRate`, `holdPeriod = holdPeriod`;
- **сохранить существующие валидации** (amount/sellRate/buyRate) и их `alert` (как есть — другая
  задача §8.5; не трогать в этой);
- маппинг в DOM-ID **строго по текущему поведению** (важно — не «исправлять»):
  - `currency-bought`        ← `units`
  - `currency-sold-rub`      ← `rubAfterSell`
  - `currency-result`        ← `profit` (со знаком/классом как сейчас)
  - `currency-period-yield`  ← `periodYield` (класс по знаку)
  - `currency-yearly-yield`  ← `yearlyYield` (класс по знаку)
  - `currency-spread-sell`   ← `spreadBuy`   (HTML-подпись «Спред покупки» — НЕ МЕНЯТЬ)
  - `currency-margin-sell`   ← `marginBuy`
  - `currency-spread-buy`    ← `spreadSell`  (HTML-подпись «Спред продажи» — НЕ МЕНЯТЬ)
  - `currency-margin-buy`    ← `marginSell`
  - `currency-spread`        ← `totalSpread`
  - `currency-margin`        ← `marginTotal`
  - `currency-taxFreeLimit`/`currency-taxableAmount`/`currency-taxAmount`/`currency-finalDeposit`
    ← из `tax`/`finalAmount`
- **Регрессия-критерий:** для тех же входных чисел до и после рефакторинга все 17 `<span>` валюты
  должны совпасть до копейки/сотой. Проверочные кейсы — ниже.

**2.3. `fetchCbrMetals()`** — по образцу `fetchCbrRates()` (`script.js:318-348`):
- читает `metal-type` (значение `Au`/`Ag`/`Pt`/`Pd`), пишет цену в `metal-buy-price`, `metal-sell-price`
  (по умолчанию цена ЦБ подставляется в оба поля — пользователь правит под свой банк), в
  `metal-cbr-price` (справочно); модульная глобаль `let lastCbrMetalPrice = null;` (для спред-расчёта);
- кнопка `metal-fetch-btn` получает класс `loading`/`↻` как `fetch-cbr-rates-btn`;
- ошибка — **inline-сообщение в DOM** (записать в `metal-cbr-price` текст «нет данных» или отдельный
  `metal-error` span), **НЕ** `alert` (§7; здесь исправляем унаследованный антипаттерн для нового кода);
- `fetch` на фронте оставить как есть (без AbortController — фронтовые fetch к своему серверу;
  таймаут живёт на сервере). Тихих `.catch(()=>{})` — не делать (§7).

**2.4. `calculateMetal()`** — по образцу `calculateCurrency()`, через ядро:
- чтение: `metal-amount`, `metal-buy-price`, `metal-sell-price`, `metal-cbr-rate`, `metal-hold-period`;
  `refPrice = lastCbrMetalPrice || 0`;
- валидация — **inline в DOM** (образец `calculateRetail`, `script.js:273-293`), НЕ `alert`;
- вызов ядра, маппинг (id ниже в контракте).

**2.5. `clearMetalForm()`** — сброс полей и всех `<span>` в `0`/`0 ₽`/`0 %` по образцу
  `clearCurrencyForm()` (`script.js:430-454`).

**2.6. Обвязка `DOMContentLoaded` (`script.js:497-591`):**
- в массив `amountInputs` (`script.js:499-506`) добавить `getElementById('metal-amount')`;
- в массив percent-входов (`script.js:522`) добавить `metal-buy-price`, `metal-sell-price`, `metal-cbr-rate`;
- дефолты: `metal-amount`='0', `metal-buy-price`/`metal-sell-price`='0', `metal-cbr-rate`='21',
  `metal-hold-period`='365' (реалистичный горизонт для металлов; у валюты было 1 — там спекуляции,
  у металлов — инвестиция в год+).
- **`CBR_RATE_INPUTS` (`script.js:1`) — ДОБАВИТЬ `'metal-cbr-rate'`** (синхронизация ставки ЦБ
  между всеми 4 калькуляторами; без этого четвёртый живёт отдельно — тихий UX-баг).

### 3. `public/index.html` — новый блок (после валютного, `index.html:193`)

DOM-ID контракт (префикс `metal-`):

| id | тип | описание |
|---|---|---|
| `metal-type` | `<select>` | Au/Ag/Pt/Pd (value = код) |
| `metal-fetch-btn` | `<button>` | ↻ — тянет цену ЦБ в поля |
| `metal-cbr-price` | `<span>` | справочная цена ЦБ ₽/г (hint) |
| `metal-amount` | input text | сумма в ₽ |
| `metal-buy-price` | input text | цена покупки ₽/г |
| `metal-sell-price` | input text | цена продажи ₽/г |
| `metal-cbr-rate` | input text | ключевая ставка ЦБ % |
| `metal-hold-period` | input number | период владения, дни (default 365) |
| `metal-result` | `<span>` | прибыль (profit-positive/-negative) |
| `metal-bought` | `<span>` | куплено грамм |
| `metal-sold-rub` | `<span>` | получено ₽ при продаже |
| `metal-period-yield` | `<span>` | доходность за период % |
| `metal-yearly-yield` | `<span>` | годовая доходность % |
| `metal-spread-buy` | `<span>` | спред при покупке ₽ (`spreadBuy`) |
| `metal-margin-buy` | `<span>` | маржа при покупке % (`marginBuy`) |
| `metal-spread-sell` | `<span>` | спред при продаже ₽ (`spreadSell`) |
| `metal-margin-sell` | `<span>` | маржа при продаже % (`marginSell`) |
| `metal-spread` | `<span>` | общий спред ₽ |
| `metal-margin` | `<span>` | общая маржа % |
| `metal-taxFreeLimit` | `<span>` | необлагаемый лимит ₽/год |
| `metal-taxableAmount` | `<span>` | облагаемая сумма ₽ |
| `metal-taxAmount` | `<span>` | НДФЛ ₽ |
| `metal-finalDeposit` | `<span>` | ИТОГО на руках ₽ |

- Структура/классы — копия валютного блока: `calculator-container` > `invest-currency`-аналог
  (напр. `invest-metal`), те же `.form-group`, `.input-with-btn`, `.field-hint`, `.result`,
  `.result-divider`, `.deposit-title`, `.tax-title`, `.tax-info`, `.tax-highlight`,
  `.final-deposit`, `.spread-pct`. Заголовок «Калькулятор драгметаллов».
- Кнопки: `onclick="calculateMetal()"` / `onclick="clearMetalForm()"` / `onclick="fetchCbrMetals()"`.
- ⚠ **Контракт HTML↔JS (AGENTS.md §6.3):** каждый id выше обязан присутствовать **одновременно**
  в `index.html` и быть прочитанным/записанным в `script.js`. Пропуск = тихая поломка. После
  реализации сверить: `grep -nE "getElementById\('metal-[^']+'\)" public/script.js` vs id в HTML.

### 4. `public/styles.css`
- По умолчанию **новых правил нет** — всё переиспользуется. Добавлять только если визуально
  разваливается; каждое новое правило — с комментарием-обоснованием (AGENTS.md §6.4 — никаких
  магических чисел/цветов вразброс; класть рядом с аналогами).
- При необходимости класс-обёртка `.invest-metal { padding-top: 0.5rem; }` по образцу
  `.invest-currency` (`styles.css:399-401`).

---

## 🛡 Граничные случаи & Защита архитектуры

**Фронт:**
- Пустой ввод / `NaN` в любом поле → inline-сообщение в DOM, `return` (не `alert`, не падать).
- `metal-amount <= 0`, `buy-price <= 0`, `sell-price <= 0` → сообщение + `focus`.
- `holdPeriod <= 0` → сообщение (защита деления `365/holdPeriod`).
- Цена ЦБ ещё не получена (`refPrice = 0`) → спреды/маржи = 0 (не `NaN`, не `Infinity`); в
  `metal-cbr-price` держать «—» до успешного fetch.
- Частичный/ошибочный ответ сервера (нет нужного металла) → inline-сообщение, поля не калечить.
- Курсор после форматирования числа — переиспользуется `formatInputNumber` (уже корректно
  восстанавливает позицию, `script.js:39-60`); для `metal-amount` подключить в обвязке.

**Сервер:**
- Таймаут ЦБ (5 c) / 5xx / пустое тело → stale-fallback из кеша; если кеша нет — 502.
- Невалидный XML / нет `<Record>` → `parseCbrMetallXml` возвращает `{ date: null, metals: {} }`;
  не падать, не калечить кеш успешными данными.
- Неизвестный `Code` (не 1–4) → пропустить (не уронить парсинг остальных).
- Конкурентный `?refresh=true` → допустим двойной fetch, кеш перезапишется последним (приемлемо
  для справочных цен; как §8.4 — отдельный trade-off, не здесь).
- `fetch` с `AbortController` + `setTimeout`; **обязательно** `clearTimeout` в `finally` — иначе
  утечка таймера (AGENTS.md §7 — fetch без таймаута запрещён; новый код не должен плодить §8.1).

**Безопасность:**
- `metal-cbr-price`/`metal-result`/`metal-error` пишутся через `textContent` (НЕ `innerHTML`) —
  ответ сервера в DOM не льётся (AGENTS.md §7, §8.3). `showModal`/`innerHTML` в этой задаче **не
  трогать и не использовать**.
- Секретов нет; `public/` публичный — ничего нового не заносим.
- Ответ ЦБ — внешний контент; в `console.error` пишем только `.message`/контекст, не тело целиком.

---

## 🧪 Проверочные кейсы (ручные — автотестов нет, AGENTS.md §5)

**A. Регрессия валюты (критично — рефакторинг на ядро не должен ничего поменять):**

| Вход (валюта) | Ожидание (до = после) |
|---|---|
| amount=100000, sellRate=95, buyRate=92, cbrExchangeRate=90, cbrRate=21, hold=30 | bought≈1052,63; sold-rub=96840 ₽; profit=−3160 ₽; periodYield=−3,16 % |
| amount=100000, sellRate=90, buyRate=95, cbrExchangeRate=92, cbrRate=21, hold=365 | bought≈1111,11; sold-rub=105555,56 ₽; profit≈+5555,56 ₽ |
| refPrice=0 (курс ЦБ не получен) | spread/margin все = 0 (не NaN); profit считается |

→ Кодер снимает значения ДО рефакторинга и сверяет ПОСЛЕ побитово по всем 17 span.

**B. Металлы (расчётная логика):**

| Вход (металл) | Ожидание |
|---|---|
| amount=100000, Au buy=10000 ₽/г, sell=10200, refPrice(CBR)=10100, keyRate=21, hold=365 | bought=10 г; sold-rub=102000 ₽; profit=+2000 ₽; periodYield=2,0 %; spreadBuy=−100 (выгодно купили); spreadSell=−100; totalSpread=−200 (отрицательный = в плюс пользователю) |
| amount=100000, Au buy=10200, sell=10000, refPrice=10100, hold=365 | profit=−1960,78 ₽; periodYield≈−1,96 % |
| refPrice=0 | все спреды/маржи = 0; profit/yield считаются корректно |
| hold=0 → отклонить | inline-сообщение, расчёт не запускается |
| amount=0 → отклонить | inline-сообщение + focus |

**C. Серверный эндпоинт (smoke, как в example-spec):**

| Команда | Ожидание |
|---|---|
| `node --check server.js` | exit 0 |
| `node server.js &`; `curl -s localhost:7777/api/cbr-metals` | 200; `{date, metals:{Au,Ag,Pt,Pd}, cached:false}`; все цены > 0 |
| повторный curl в течение часа | `cached:true`, отклик < 50 мс, те же значения |
| `curl ".../api/cbr-metals?refresh=true"` | `cached:false` |
| сеть до ЦБ отключена, кеш есть | 200, `stale:true, cached:true` |
| сеть отключена, кеш пуст (перезапуск) | 502, `{error}` |

**D. Контракт DOM-ID (после реализации):**
- `grep -nE "getElementById\('metal-[^']+'\)" public/script.js | wc -l` — должно совпадать с
  числом `metal-*` id в `index.html` (см. таблицу контракта выше).
- `'metal-cbr-rate'` присутствует в `CBR_RATE_INPUTS` — ставка синхронизируется по 4 калькуляторам.

---

## Definition of Done (AGENTS.md §9, целиком)

- [ ] `node --check server.js && node --check public/script.js` — синтаксис OK
- [ ] `node server.js` стартует; `GET /` и `GET /api/cbr-key-rate` отвечают (ручная smoke)
- [ ] `GET /api/cbr-metals` отвечает 200 с `{date, metals:{Au,Ag,Pt,Pd}}`; кеш и `?refresh=true` работают
- [ ] `docker build .` succeeds — если трогал `Dockerfile`/`package.json` (здесь — не трогаем)
- [ ] все 4 калькулятора + currency пересчитывают; модалка «Показать вычисление» открывается
      (банк/валюта не сломаны рефакторингом ядра — см. кейсы A)
- [ ] **DOM-ID контракт не сломан** (`grep` по `getElementById` сходится с `id="..."` в HTML),
      включая `'metal-cbr-rate'` в `CBR_RATE_INPUTS`
- [ ] секреты остались вне `public/` (секретов нет — не заведи)
- [ ] правок расчётной логики — ручные кейсы A/B/C «входные числа → ожидаемые суммы» пройдены
- [ ] `fetch` к ЦБ с `AbortController`/таймаутом; таймер очищается в `finally`
- [ ] нет `alert()` в новом коде металлов; нет `innerHTML` с внешним контентом

---

## Источники (верифицировано архитектором напрямую)

- CBR metals XML: `https://www.cbr.ru/scripts/XML_metall.asp?date_req1=DD.MM.YYYY&date_req2=DD.MM.YYYY`
  — живой ответ: `<Metall FromDate/ToDate/name>` > `<Record Date Code><Buy>…</Buy><Sell>…</Sell></Record>`;
  коды 1=Au, 2=Ag, 3=Pt, 4=Pd; ₽/г; запятая.
- CBR SXML docs: https://www.cbr.ru/development/sxml/
- CBR metals base (HTML-аналог): https://www.cbr.ru/hd_base/metall/metall_base_new/

---

> Кодер (`docs/ai/coder.md`) реализует строго по этому спеку. Архитектор проводит параноид-ревью
> по `architect.md` §4: сам перезапускает smoke, сверяет кейсы A (регрессия валюты), проверяет рост
> `script.js` и контракт DOM-ID.
