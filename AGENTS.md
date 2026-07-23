# AGENTS.md — Invest App

> **Единый источник правды (SSOT) для ИИ-агентов.** Если любой ролевой промпт
> (`docs/ai/*.md`) конфликтует с этим файлом — **главнее этот файл**.
> Все роли читают его целиком до начала работы.

---

## 1. Что за проект

Инвестиционный калькулятор: **банковский**, **розничный**, **валютный** и **драгметаллов**
(Au/Ag/Pt/Pd) калькуляторы с расчётом прибыли, доходности и НДФЛ (прогрессивные ставки).
**Vite + TypeScript** фронт (модульный `src/`) + Express-прокси на TypeScript к официальным
данным ЦБ РФ. Деплой — Docker (multi-stage).

Подробно: `README.md`, `project_overview.md`.

## 2. Стек (фактический, из `package.json` и исходников)

| Слой | Технологии |
|---|---|
| Фронт | **Vite 8 + TypeScript 7** (strict), модульная структура `src/`, no UI-фреймворк (vanilla DOM) |
| Бэк | **Node 22 + Express 4** на TypeScript (`server/server.ts`), компилируется в CJS `dist/server/server.js`, порт `process.env.PORT \|\| 7777` |
| Интеграции | ЦБ РФ: `https://www.cbr.ru/hd_base/KeyRate/` (HTML), `/scripts/XML_daily.asp` (валюты), `/scripts/XML_metall.asp` (металлы) |
| Дев-режим | `npm run dev` = Vite `:5173` (HMR) + `tsx watch server/server.ts`; Vite проксирует `/api/*` → Express `:7777` |
| Деплой | Docker multi-stage (`Dockerfile`), `docker-compose.yml`; runtime-образ = prod-deps + `dist/` |
| Дев-зависимости | `vite`, `typescript`, `tsx`, `concurrently`, `@types/node`, `@types/express` |

## 3. Структура репозитория

```
src/                          # TypeScript-исходники фронта (entrypoint: src/main.ts)
├── shared/                   # чистая логика: types.ts, format.ts, tax.ts, asset.ts
├── calculators/              # bank.ts, retail.ts, currency.ts, metals.ts
├── cbr.ts                    # fetchCbrRate (общий), CBR_RATE_INPUTS
├── init.ts                   # DOMContentLoaded: форматирование полей, синхр. ставки
└── main.ts                   # entrypoint: импорт модулей + window-реестр для onclick
server/
└── server.ts                 # Express на TS → компилируется в dist/server/server.js
index.html                    # корневой шаблон Vite (type=module src=/src/main.ts)
styles.css                    # стили (импортируется в main.ts)
vite.config.ts                # proxy /api → :7777, alias @shared/@calc
tsconfig.json                 # фронт: strict, DOM-libs, noUncheckedIndexedAccess
tsconfig.node.json            # сервер: NodeNext, компиляция в dist/
Dockerfile                    # multi-stage: builder (build) → runtime (dist/ + prod-deps)
docker-compose.yml
docs/                         # планы задач (plan-*.md) + docs/ai/ (ролевые промпты)
```

## 4. ⚠️ Чего в проекте НЕТ (не галлюцинируй эти инструменты)

Этого **нет**, и ссылки на это в промптах/ТЗ — критический дефект:

- UI-фреймворка (React/Vue/Svelte) — фронт vanilla-DOM на TS, без компонентов
- ORM, базы данных, миграций
- ESLint, Prettier (форматирование — ручное); `tsconfig` **есть**, но только для TS-компиляции
- Тест-раннера **любого** (`npm test` — это fail-stub, см. ниже); типизация = единственный статический контроль
- CI/CD (`.github/` отсутствует), Sonar, depcruise, Codegraph MCP
- `.env`, секретов, API-ключей (GEMINI и пр.) — **всё состояние публичное**
- i18n-фреймворка, логгера (Pino/Winston) — только голый `console.*`

> **Историческая справка:** до миграции (см. `docs/plan-vite-ts-migration.md`) проект был на
> vanilla-JS без сборщика. TS/Vite теперь **разрешены и активны** — не отвергай их на ревью.

## 5. Команды (только РЕАЛЬНО работающие)

| Действие | Команда | Что проверяет |
|---|---|---|
| Дев | `npm run dev` | Vite `:5173` (HMR) + tsx-watch сервер `:7777`; `/api` проксируется |
| Сборка | `npm run build` | `vite build` (фронт → `dist/`) + `tsc` (сервер → `dist/server/`) |
| Запуск (прод) | `npm start` (=`node dist/server/server.js`) | сервер на :7777, раздаёт `dist/` + `/api/*` |
| Проверка типов | `npm run typecheck` / `npm run typecheck:node` | TS strict на фронте / сервере — **главный статический шлюз** |
| Сборка образа | `docker build .` | multi-stage деплой-тест |
| Smoke эндпоинтов | `curl -s localhost:7777/api/cbr-key-rate` и `/api/cbr-rates`, `/api/cbr-metals` | ручная проверка прокси |
| id-контракт | `grep -nE "byId\('[^']+'\)" src/calculators/*.ts` ↔ `id="..."` в `index.html` | синхронизация DOM-ID (теперь через хелпер `byId`) |

`npm test` = `echo "Error: no test specified" && exit 1`. **Не запускай** как проверку — он всегда падает.
Тестов нет → критические расчёты проверяются **ручными кейсами** (входные числа → ожидаемые суммы)
и `npm run typecheck` (строгие типы ловят часть регрессий).

## 6. Конвенции кода (Hard rules)

1. **Размер:** новый/изменённый файл **< 300 строк**, функция **< 80 строк** — иначе реджект.
   Все модули `src/` < 300 строк (крупнейший `calculators/bank.ts` ≈ 188).
2. **Чистая бизнес-логика.** Функции-расчётчики (`calculateTax`, `calculateAssetRoundTrip`,
   `calculateRetailMetrics`) принимают число/объект, возвращают типизированный объект и **не трогают**
   `document.*`. Образец — `src/shared/tax.ts`, `src/shared/asset.ts`. DOM читается/пишется
   только в модулях `src/calculators/*` через хелпер `byId(id)`.
3. **DOM-ID — контракт HTML↔TS.** Фронт завязан на `byId(...)` (бросает при пропущенном id —
   нет тихих `null`). При любой правке форм/результатов синхронизируй `index.html` и соответствующий
   `src/calculators/*.ts`; пропуск id = явная ошибка в runtime.
4. **Магические числа → именованные константы** вверху модуля. Образец: `TAX_FREE_MAX = 1_000_000`,
   `RATE_13 = 0.13` (`src/shared/tax.ts`). Дефолты сервера (`DEFAULT_PORT = 7777`, `cachedKeyRate = 21`,
   `CBR_UA`, `CBR_TIMEOUT_MS`) — то же самое (`server/server.ts`).
5. **Типы — контракт.** Все данные между слоями (server↔client, shared↔calculators) описаны
   интерфейсами в `src/shared/types.ts` (`TaxResult`, `AssetRoundTripResult`, `CbrMetalsResponse` и др.).
   Запрещены `as any` / `@ts-ignore` — реджект на ревью.
6. **UI-текст без хардкода вразброс** — единый объект `const UI_TEXT = {...}` (без i18n-фреймворка;
   сейчас строки локализованы inline, централизация — future task).

## 7. Запреты (редижект на ревью)

- `alert()` в продакшен-путях (валидация форм) → заменить на inline-сообщение в DOM.
- `element.innerHTML = ...` с непроверенным/пользовательским/внешним контентом.
- `fetch(...)` без `AbortController`/таймаута — внешние вызовы могут зависнуть.
- Тихие `.catch(() => {})` — всегда контекст или пользовательское сообщение.
- `console.log` пользовательских данных (PII).
- Секреты/env в `public/` — попадут в браузер. (Сейчас секретов нет — не заведи.)

## 8. Известные дефекты / техдолг (по приоритету)

> История закрытия: §8.1/§8.2/§8.5/§8.3 и §8.6 закрыты миграцией на Vite+TS + предшествующими задачами.

1. ✅ ~~`fetch` к ЦБ без `AbortController`/таймаута~~ — закрыто: все 3 fetch защищены через
   `fetchWithTimeout()` (`server/server.ts`).
2. ✅ ~~`/api/cbr-rates` бьёт ЦБ на каждый запрос (нет кеша)~~ — закрыто: TTL-кеш + stale-fallback.
3. ✅ ~~`showModal()` льёт строку в `innerHTML`~~ — закрыто: DOM API (`createTextNode`), XSS невозможен по построению.
4. ⬜ Гонка `?refresh=true` на `cachedKeyRate`/`ratesCache`/`metalsCache` (параллельные запросы) —
   low-risk для справочных данных; in-flight Promise-dedup как future task.
5. ✅ ~~Валидация форм через `alert()`~~ — закрыто: inline-сообщения в DOM (`messageEl.textContent`).
6. ✅ ~~`script.js` 741 строка — дробить~~ — закрыто: разбит на 11 модулей `src/` (все < 300 строк).

**Открытые (не из §8):**
- `onclick="..."` → `addEventListener`: HTML всё ещё использует inline-обработчики, экспонируемые
  через `window`-реестр в `src/main.ts`. Чище убрать, но +риск — future task.
- `project_overview.md` / `README.md` описывают старый стек (vanilla-JS) — требуют обновления.

## 9. Definition of Done (обязательно для исполнителя)

- [ ] `npm run typecheck` **и** `npm run typecheck:node` — exit 0 (главный статический шлюз)
- [ ] `npm run build` succeeds → `dist/` (фронт) + `dist/server/server.js` созданы
- [ ] `npm start` (=`node dist/server/server.js`) стартует; `GET /` и `GET /api/*` отвечают (ручная smoke)
- [ ] `docker build .` succeeds — если трогал `Dockerfile`/`package.json`/`tsconfig*.json`
- [ ] все 4 калькулятора пересчитывают; модалка «Показать вычисление» открывается
- [ ] DOM-ID контракт не сломан (`byId('...')` в `src/calculators/*.ts` ↔ `id="..."` в `index.html`)
- [ ] `grep -rn "as any\|@ts-ignore" src/ server/` → 0 (нет заглушек типов)
- [ ] секретов нет и не заведено (env только `PORT`)
- [ ] для правок **расчётной логики** — ручные кейсы «входные числа → ожидаемые суммы»

## 10. Роли (см. `docs/ai/`)

| Роль | Файл | Зона |
|---|---|---|
| Architect & TechLead | `docs/ai/architect.md` | анализ, blast radius, ТЗ, параноид-ревью. **Кода не пишет.** |
| Coder (исполнитель) | `docs/ai/coder.md` | пишет код строго по ТЗ архитектора. **Архитектуру не ломает.** |

Эталонный ТЗ (few-shot): `docs/ai/example-spec.md`.

## 11. Migration notes (Vite + TypeScript)

> Проект мигрирован с vanilla-JS на Vite 8 + TypeScript 7 (см. `docs/plan-vite-ts-migration.md`).
> Этот раздел — для агентов, которые могут помнить старую структуру.

- **Больше нет `public/script.js` / `public/index.html` / `public/styles.css`.** Фронт теперь в
  корневых `index.html` + `styles.css` + модульном `src/`. `public/` пуста.
- **Бэк теперь `server/server.ts`** (был `server.js` в корне). Компилируется в `dist/server/server.js`.
- **Dev = 2 процесса:** `npm run dev` поднимает Vite (`:5173`, фронт) и `tsx watch` (сервер `:7777`).
  Vite проксирует `/api/*` на Express (см. `vite.config.ts`, `server.proxy`).
- **Prod = 1 процесс:** `npm run build` собирает `dist/`, затем `npm start` запускает Express,
  который раздаёт `dist/` (статику) + `/api/*` (прокси к ЦБ).
- **onclick-контракт сохранён** через `window`-реестр в `src/main.ts` (11 функций). Это осознанный
  компромисс миграции — не переделывать HTML на `addEventListener`, чтобы минимизировать регрессию.
- **`type="module"` = CORS на `file://`** — фронт работает только через dev-server или собранный `dist/`,
  не через прямой `file://`-доступ. Документируй это при отладке.
