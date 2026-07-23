# ТЗ — Защита серверных эндпоинтов ЦБ (таймауты + кеш + неблокирующий старт)

> Спек от архитектора (`docs/ai/architect.md`, §5, «полная задача»).
> Закрывает техдолг P0/P1: §8.1 (fetch без таймаута — 2 шт.), §8.2 (нет кеша у `/api/cbr-rates`),
> блокирующий `app.listen`. Механика 1-в-1 скопирована с уже работающего эталона — эндпоинта
> `/api/cbr-metals` (`server.js:117-155`), прошедшего ревью. **Новых зависимостей нет** (нативный
> `fetch` + `AbortController`).

---

## 🏗 Архитектурный разбор & Blast Radius

**Проблема.** Три точки уязвимости в `server.js`:

1. **`loadCbrKeyRate` (`server.js:18-34`)** — `fetch` к `https://www.cbr.ru/hd_base/KeyRate/`
   **без `AbortController`** (`server.js:20`). Если ЦБ не отвечает → `await` висит indefinitly.
2. **`/api/cbr-rates` (`server.js:55-94`)** — `fetch` к `XML_daily.asp` без таймаута (`server.js:67`)
   **и без кеша** → каждый клик «↻» в валютном калькуляторе = полный запрос к ЦБ. Риск блокировки
   IP + медленный ответ. Дефект §8.1 + §8.2 одновременно.
3. **`app.listen` (`server.js:176-179`)** — `await loadCbrKeyRate()` блокирует колбэк старта. Если
   ЦБ висит, сервер поднимается, но стартовое поведение/лог затягивается. Это следствие #1, но
   фиксится отдельно — старт не должен зависеть от внешнего сервиса.

**Blast radius (читано целиком):**
- `server.js` — единственный затрагиваемый файл. Все правки **локальные**: 3 функции + 1 колбэк.
- `public/script.js` — **только чтение/проверка контракта**:
  - `/api/cbr-key-rate` — фронт читает `data.rate` (`script.js:11`); вызывается с `?refresh=true`
    (`script.js:8`).
  - `/api/cbr-rates` — фронт читает `data.rates[code]` (`script.js:359`); вызывается без параметров
    (`script.js:353`).
  - **Других потребителей этих эндпоинтов нет** (проверено grep по `public/`).
  - **Контракт сохраняется**: поля `rate` и `date`+`rates` остаются; `cached`/`stale` —
    обратно-совместимое добавление (фронт их не обязан читать, см. ниже «Что НЕ делать»).
- `public/index.html`, `public/styles.css` — **не затрагиваются**.

**Решение.** Подтянуть `loadCbrKeyRate` и `/api/cbr-rates` к уровню `/api/cbr-metals`:
- таймаут через `AbortController` + `setTimeout(CBR_TIMEOUT_MS)` с очисткой в `finally`;
- кеш ответа с TTL=1ч + stale-fallback + `?refresh=true` (для `/api/cbr-rates`);
- парсинг HTML/XML вынести в чистые функции (число/строка → объект, без `req`/`res`);
- `app.listen` не ждёт `loadCbrKeyRate` — стартует мгновенно, загрузка ставки идёт в фоне.

**Ключевые отличия от metals-эталона** (кодер обязан понять, почему):
- `loadCbrKeyRate` вызывается **на старте** (фоновая подгрузка ставки) **и** по `?refresh=true` —
  это не HTTP-обработчик, а загрузчик в глобаль `cachedKeyRate`. Поэтому кеш тут = сама `cachedKeyRate`
  (как сейчас), TTL **не нужен** (ставка меняется редко, refresh-by-demand через `?refresh=true`).
  Нужно добавить **только таймаут** и чистый парсер.
- `/api/cbr-rates` — полноценный эндпоинт, механика кеша 1-в-1 как `/api/cbr-metals`.

**Сущностей в задаче: 5** (`loadCbrKeyRate`, `parseCbrKeyRateHtml`, `/api/cbr-rates`, `parseCbrXml`,
`app.listen`) → **> 4**, потому полный формат (§5).

---

## 📋 Детальное ТЗ

### 1. Константы (рядом с существующими, `server.js:12-16`)

Добавить **переиспользуя** уже существующие, новые не дублировать:
- `CBR_TIMEOUT_MS` — **уже есть** (`server.js:15`), использовать для всех трёх fetch.
- `let ratesCache = { data: null, ts: 0 };` — **новая** (рядом с `metalsCache`).
- `const RATES_TTL_MS = 60 * 60 * 1000;` — **новая** (рядом с `METALS_TTL_MS`).
- `const CBR_UA = 'Mozilla/5.0';` — **новая** (устраняет хардкод User-Agent в 3 местах, см. §6.4);
  заменить `'Mozilla/5.0'` в `loadCbrKeyRate`, `/api/cbr-rates`, `/api/cbr-metals`.

### 2. Чистая функция `parseCbrKeyRateHtml(html) -> number | null`

Вынести парсинг из `loadCbrKeyRate` (`server.js:25-29`):
- вход: строка HTML; алгоритм без изменений: `match = html.match(/<td>\d{2},\d{2}<\/td>/)`;
  если нет → `null`; иначе `parseFloat(match[0].replace(/[^\d.,]/g,'').replace(',','.'))`.
- **чистая**: не трогает `cachedKeyRate`, не пишет в кеш, не логирует. Возвращает число или `null`.
- Образец чистоты — `parseCbrMetallXml` (`server.js:97-115`).

### 3. `loadCbrKeyRate` (`server.js:18-34`) — добавить таймаут, упростить

- `fetch` с `signal: controller.signal` (контроллер + `setTimeout(CBR_TIMEOUT_MS)` + `clearTimeout`
  в `finally` — копия механики `server.js:126-144`).
- Тело: `const html = await cbrRes.text(); const rate = parseCbrKeyRateHtml(html);`
  если `rate !== null` → `cachedKeyRate = rate; console.log(...)`; иначе — тихий пропуск (как сейчас
  `if (match)`).
- try-catch остаётся с контекстным `console.error` (без изменения формата).
- **TTL и stale-fallback НЕ добавлять** — ставка живёт в `cachedKeyRate`, fallback = последнее
  значение (уже так и есть, `cachedKeyRate` мутабельна и переживает ошибку).

### 4. Чистая функция `parseCbrXml(xml) -> { date, rates }`

Вынести парсинг из `/api/cbr-rates` (`server.js:69-87`):
- вход: строка XML; алгоритм **без изменений** (регэкспы `CharCode`/`Value`/`Nominal`, цикл сборки
  `rates` с учётом `nominal`).
- **чистая**: не трогает `req`/`res`, не пишет в кеш. Образец — `parseCbrMetallXml`.
- Возвращает `{ date: '<dd.mm.yyyy>', rates: { USD: ..., EUR: ..., ... } }`.

### 5. `/api/cbr-rates` (`server.js:55-94`) — кеш + таймаут (механика 1-в-1 с metals)

- Логика обработчика — точная копия структуры `/api/cbr-metals` (`server.js:117-155`):
  ```
  if (refresh === 'true' || Date.now() - ratesCache.ts >= RATES_TTL_MS) {
      const url = `XML_daily.asp?date_req=${dd}/${mm}/${yyyy}`   // формат НЕ менять (/)
      controller + timer (CBR_TIMEOUT_MS)
      try:
          cbrRes = fetch(url, { signal, headers: { 'User-Agent': CBR_UA } })
          if (!cbrRes.ok) throw
          xml = await cbrRes.text()
          result = parseCbrXml(xml)
          if (Object.keys(result.rates).length === 0) throw 'Empty rates response'
          ratesCache = { data: result, ts: Date.now() }
          return res.json({ ...result, cached: false })
      finally: clearTimeout(timer)
  }
  res.json({ ...ratesCache.data, cached: true })
  ```
- catch: если `ratesCache.data` → `res.json({ ...ratesCache.data, cached: true, stale: true })`;
  иначе `res.status(502).json({ error: 'CBR rates unavailable' })` + `console.error` с контекстом.
- ⚠ **URL формат** `XML_daily.asp?date_req=${dd}/${mm}/${yyyy}` — разделитель **`/`** (как сейчас,
  `server.js:61`). НЕ путать с metals, где `.`. Это разные API ЦБ, оба валидны для своих эндпоинтов.
- Поля ответа: `{ date, rates }` сохраняются; **добавляются** `cached`, `stale` — обратно-совместимо.

### 6. `app.listen` (`server.js:176-179`) — не блокировать старт

- Убрать `await` перед `loadCbrKeyRate()`; запустить её в фоне **без await**:
  ```
  app.listen(port, () => {
    loadCbrKeyRate();   // fire-and-forget; она сама логирует успех внутри
    console.log(`Investment calculator running at http://localhost:${port}`);
  });
  ```
- `console.log('running...')` теперь выводится **сразу**, а не после (возможно зависшего) ответа ЦБ.
- `loadCbrKeyRate` async, ошибки ловит внутри себя —`unhandledRejection` не возникнет.

---

## 🛡 Граничные случаи & Защита архитектуры

**Сервер:**
- Таймаут ЦБ (5 c) / 5xx / пустое тело / обрыв соединения → для `/api/cbr-rates`: stale-fallback или
  502; для `loadCbrKeyRate`: тихо (ставка остаётся прежней в `cachedKeyRate`).
- Невалидный XML (нет `<CharCode>`) → `parseCbrXml` возвращает `{ date, rates: {} }`; обработчик
  кидает 'Empty rates response' → stale/502; **кеш не калечится** пустым результатом.
- Конкурентный `?refresh=true` (два запроса сразу) → допустим двойной fetch, кеш перезапишется
  последним (приемлемо для справочных курсов; гонка §8.4 — отдельный trade-off, не здесь).
- `AbortController.abort()` бросает `AbortError` — ловится общим catch, попадает в stale/502 ветку.
- **Утечка таймера**: `clearTimeout(timer)` обязан быть в `finally` (без него при успешном быстром
  ответе таймер всё равно сработает через 5с и вызовет `abort()` уже завершённого fetch — безвредно,
  но мусорно и запрещено §8.1-паттерном).
- `CBR_UA` — единая константа; убирает хардкод `'Mozilla/5.0'` в 3 местах (§6.4).

**Безопасность:**
- Никаких секретов; `public/` не затрагивается.
- В `console.error` пишем `.message`/контекст, не тело ответа ЦБ целиком (может быть большим).
- Контракт фронта (`data.rate`, `data.rates[code]`) **не ломается** — поля на месте.

---

## 🧪 Проверочные кейсы (ручные — автотестов нет, AGENTS.md §5)

**A. Синтаксис и старт:**

| Команда | Ожидание |
|---|---|
| `node --check server.js` | exit 0 |
| `node server.js` | `running at...` выводится **мгновенно** (< 100мс), НЕ ждёт ЦБ |
| `node server.js` (при живом ЦБ) | позже: `CBR key rate loaded: NN.NN%` (асинхронно, после running) |

**B. `/api/cbr-key-rate` (контракт сохранён):**

| Команда | Ожидание |
|---|---|
| `curl localhost:7777/api/cbr-key-rate` | 200, `{rate: <число>}` (как раньше) |
| `curl "…?refresh=true"` | 200, `{rate}`; в фоне дёрнут `loadCbrKeyRate` с таймаутом |

**C. `/api/cbr-rates` (новое поведение):**

| Команда | Ожидание |
|---|---|
| холодный старт, `GET /api/cbr-rates` | 200, `{date, rates:{USD,...}, cached:false}`; отклик 0.1–1с |
| немедленный повтор | `cached:true`, **отклик < 50 мс**, те же значения |
| `GET ...?refresh=true` | `cached:false` |
| сеть до ЦБ отключена, кеш есть | 200, `stale:true, cached:true` |
| сеть отключена, кеш пуст | 502, `{error}` |
| невалидный XML (эмуляция: вернуть пустое тело) | не падает; stale/502; кеш не испорчен |

**D. Регрессия валюты (фронт, контракт `data.rates[code]`):**

| Вход | Ожидание (как до правок) |
|---|---|
| фронт `fetch('/api/cbr-rates')`, code='USD' | `data.rates.USD` — число > 0; заполняются `currency-sell-rate`/`buy-rate`/`cbr-exchange-rate` |
| code='KZT' (тенге, nominal=100) | корректный пересчёт по номиналу (не сырой Value) |

**E. Контракт / таймаут:**

| Проверка | Ожидание |
|---|---|
| `grep -n "setTimeout" server.js` | 3 вхождения (keyRate + rates + metals — все с `clearTimeout` в `finally`) |
| `grep -n "'Mozilla/5.0'" server.js` | 0 (заменено на `CBR_UA`) |
| `grep -n "await loadCbrKeyRate" server.js` | 0 в `app.listen` (вызов без await) |
| `fetch` без `signal` в обработчиках ЦБ | 0 (все 3 — keyRate/rates/metals — с `signal`) |

---

## Definition of Done (AGENTS.md §9, целиком)

- [ ] `node --check server.js && node --check public/script.js` — синтаксис OK
      (`script.js` не трогается, но проверка остаётся частью шлюза)
- [ ] `node server.js` стартует; `GET /` и `GET /api/cbr-key-rate` отвечают (ручная smoke)
- [ ] `GET /api/cbr-rates` отвечает 200 с `{date, rates}`; кеш и `?refresh=true` работают
- [ ] `docker build .` succeeds — **не трогаем** `Dockerfile`/`package.json` (DoD-пункт условно-зелёный)
- [ ] все 4 калькулятора пересчитывают; модалка «Показать вычисление» открывается (валюта не сломана)
- [ ] **DOM-ID контракт не сломан** (`public/index.html` не затрагивается — зелёный по определению)
- [ ] секреты остались вне `public/` (секретов нет — не заведи)
- [ ] правок расчётной логики нет — это **инфра-задача**; кейсы B/C/D пройдены
- [ ] `fetch` к ЦБ с `AbortController`/таймаутом во всех 3 точках; таймер очищается в `finally`
- [ ] `app.listen` не блокируется `loadCbrKeyRate`

---

## ⚠ Что НЕ делать (anti-scope, реджект на ревью)

- **Не вводить `helmet`/`cors`/`rate-limiter`** и любые новые npm-зависимости (§2.4 — отдельное ТЗ).
- **Не чинить гонку `?refresh=true`** (§8.4 — отдельный trade-off, здесь намеренно упрощаем).
- **Не трогать `public/script.js`** — даже чтобы показать `cached`/`stale` в UI (отдельная UX-задача).
- **Не менять URL форматы** (`XML_daily.asp` с `/`, `XML_metall.asp` с `.` — оба валидны для своих API).
- **Не добавлять TTL/stale в `loadCbrKeyRate`** — ставка живёт в `cachedKeyRate`, fallback уже работает.

---

## 📐 Эталоны для кодера (читать перед реализацией)

- **Структура эндпоинта с кешем** — `/api/cbr-metals` (`server.js:117-155`). Копировать механику.
- **Чистый парсер** — `parseCbrMetallXml` (`server.js:97-115`). Образец «строка → объект, без `res`».
- **AbortController-паттерн** — `server.js:126-144` (`controller` + `timer` + `clearTimeout` в `finally`).

---

> Кодер (`docs/ai/coder.md`) реализует строго по этому спеку. Архитектор проводит параноид-ревью по
> `architect.md` §4: сам перезапускает smoke, сверяет кейсы B/C (кеш + stale), проверяет таймаут
> эмуляцией обрыва, убеждается что `app.listen` стартует мгновенно, и что регрессия валюты (D) отсутствует.
