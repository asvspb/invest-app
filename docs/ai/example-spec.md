# Эталонный ТЗ (few-shot) — кеш `/api/cbr-rates`

> Образец вывода архитектора (`docs/ai/architect.md`, §5, «полная задача»).
> Реальный дефект №2 из `AGENTS.md` §8. Эталон для подражания: псевдокод, не готовый код;
> конкретные edge-кейсы; проверяемые кейсы; DoD из SSOT.

---

## 🏗 Архитектурный разбор & Blast Radius

**Проблема.** `server.js:54-94` — эндпоинт `/api/cbr-rates` на каждый запрос делает `fetch`
к `https://www.cbr.ru/scripts/XML_daily.asp`. Следствия: (а) медленно для пользователя,
(б) риск блокировки IP ЦБР при всплесках, (в) нет устойчивости к временному отказу ЦБ.

**Blast radius (читано целиком):**
- `server.js` — эндпоинт `/api/cbr-rates`; мутабельная глобаль `cachedKeyRate` рядом (образец
  кеширования на старте уже есть в `loadCbrKeyRate` — переиспользуем паттерн).
- `public/script.js:299-329` — `fetchCbrRates()` вызывает эндпоинт по клику; контракт не меняется.
- `public/index.html` — не затрагивается (DOM-ID `currency-*` стабильны).

**Решение.** Кеш ответа `/api/cbr-rates` в памяти процесса с **TTL = 1 час**; stale-фallback на
ошибку ЦБР (отдаём последний успешный результат с пометкой `stale: true`); параметр `?refresh=true`
форсирует обновление (как у `/api/cbr-key-rate`). Новых зависимостей — **нет** (нативный `fetch`).

**Сущностей в задаче: 2** (`server.js`, `public/script.js` — последний только на чтение).
→ Полный формат ниже избыточен, но приведён как эталон.

---

## 📋 Детальное ТЗ

### `server.js`
1. Завести модуль кеша курсов:
   - состояние: `let ratesCache = { data: null, ts: 0 };` и `const RATES_TTL_MS = 60 * 60 * 1000;`
     (вынести в именованные константы рядом с `cachedKeyRate`).
2. Вынести парсинг XML_daily в чистую функцию `parseCbrXml(xml) -> { date, rates }`
   (текущая логика регэкспами переезжает туда без изменений; число → объект, без `req`/`res`).
3. В обработчике `/api/cbr-rates`:
   - если `req.query.refresh !== 'true'` **и** `Date.now() - ratesCache.ts < RATES_TTL_MS`
     → `return res.json({ ...ratesCache.data, cached: true })`;
   - иначе: `fetch` с `AbortController` (таймаут **5 c**, константа); при таймауте/не-OK —
     если есть `ratesCache.data` → `res.json({ ...ratesCache.data, cached: true, stale: true })`,
     иначе → `res.status(502).json({ error: 'CBR rates unavailable' })`;
   - при успехе: `parseCbrXml(xml)` → запись в `ratesCache = { data, ts: Date.now() }` →
     `res.json({ ...data, cached: false })`.
4. Сохранить существующие поля ответа (`date`, `rates`), **добавив** `cached`, `stale` — это
   обратно-совместимое расширение контракта.

### `public/script.js` (только чтение/проверка)
- Контракт не меняется: `fetchCbrRates()` читает `data.rates[code]`. Изменения не нужны;
  при желании можно показать `cached`/`stale` в UI — **отдельной задачей**, не здесь.

### Edge-кейсы
- Сервер: таймаут ЦБР → stale-fallback; 5xx → stale-fallback или 502; пустое тело / нет
  `CharCode` → не падать, вернуть пустой `rates` и не калечить кеш; конкурентный `?refresh=true`
  (два запроса одновременно) → допустим двойной fetch, кеш перезапишется последним (приемлемо
  для справочных курсов; если критично — эскалируй как отдельный trade-off).

### DoD (из `AGENTS.md` §9)
- [ ] `node --check server.js` OK
- [ ] `node server.js` стартует; `curl localhost:7777/api/cbr-rates` → 200 и `{date, rates, cached:false}`
- [ ] повторный `curl` в течение часа → `cached:true` и **быстрее** первого (видно по времени)
- [ ] `curl "localhost:7777/api/cbr-rates?refresh=true"` → `cached:false`
- [ ] при отключённом интернете/недоступном ЦБ (эмуляция: временно неверный URL) → 200 со
      `stale:true`, если кеш есть; иначе 502
- [ ] `docker build .` succeeds (зависимости не трогались — должно остаться зелёным)
- [ ] DOM-ID контракт не затронут

---

## 🛡 Граничные случаи & Защита архитектуры
- `fetch` таймаут = `AbortController` + `setTimeout(5000)` с очисткой таймера в `finally`.
- `parseCbrXml` не вызывает `res.*` — чистая функция (легче ревью и будущие тесты).
- `stale` и `cached` флаги в ответе — единственный канал, которым фронт узнает о свежести.
- Никаких секретов; интеграция публичная — `public/` не затрагивается.

---

## 🧪 Проверочные кейсы (ручные, автотестов нет)

| Шаг | Ожидание |
|---|---|
| холодный старт, `GET /api/cbr-rates` | `cached:false`, `date` = сегодня, `rates.USD` > 0 |
| немедленный повторный `GET` | `cached:true`, те же значения, отклик < 50 мс |
| `GET ...?refresh=true` | `cached:false` |
| остановить сеть до ЦБ, `GET` (кеш есть) | `200`, `stale:true`, `cached:true` |
| остановить сеть, кеш пуст (перезапуск) | `502`, `{error}` |
| `node --check server.js` | exit 0 |

---

> После реализации кодер (`docs/ai/coder.md`) сдаёт результат по своему §4,
> архитектор проводит параноид-ревью по `architect.md` §4.
