# ТЗ — SaaS-редизайн: табы, design tokens, light/dark

> Спек от архитектора (`docs/ai/architect.md`, §5, «полная задача»).
> Перевод UI из «4 колонки по 1350px» в современный финансовый SaaS: таб-навигация,
> дизайн-система на CSS custom properties, light/dark toggle, типографическая иерархия чисел.
> **Базируется на стабильной миграции Vite+TS** (коммит `c175118`). Решения заказчика:
> полный SaaS-редизайн + light/dark toggle.

---

## 🏗 Архитектурный разбор & Blast Radius

**Проблема.** Текущий UI (после миграции остался визуально прежним):
1. **4 `.calculator-container` в `body` без обёртки** (`index.html:11,75,127,195`), каждая
   `min-height: 1350px` (`styles.css:27`) → 4×1350px вертикального скролла, нет навигации между ними.
2. **Нет понимания «где я»** — пользователь не видит, сколько всего калькуляторов и какой активен.
3. **`id="result"` дублируется 3×** (`index.html:56,108,174`) — бомба: `getElementById` вернёт
   недетерминированный узел. Сейчас TS его не читает, но любой будущий контакт = тихая поломка.
4. **12 hardcoded цветов** (`#2d3748` ×10, `#4a5568` ×6, и т.д.) — невозможно поддерживать, нет темы.
5. **Палитра устаревшая** (Tailwind-gray ~2018), нет визуальной иерархии «прибыль/налог/итог».
6. `styles.css` = 443 строки (порог §6.1 = 300) — при редизайне дробить.

**Blast radius (читано целиком после миграции):**
- `index.html` — **главные правки**: обёртка `<div class="app">`, `<header>` с табами + toggle темы,
  каждый калькулятор в секцию `[data-tab]`. `onclick`/`id`/`invest-*` классы **сохранить**.
- `styles.css` → дробить на `src/styles/` (tokens, base, components, calculators) с импортом в `main.ts`.
- `src/main.ts` — **минимально**: добавить инициализацию табов + темы (новый модуль `src/ui/`).
- **Не трогать**: `src/shared/*`, `src/calculators/*`, `server/*`, бизнес-логику, эндпоинты, расчёты.

**JS↔CSS контракт (критично — НЕ ломать, аудит подтверждает):**
- `profit-positive` / `profit-negative` — ставятся в `currency.ts`/`metals.ts` (6 мест). Эти классы
  должны остаться и в новом CSS управлять цветом через токены.
- `loading` — `classList.add/remove('loading')` на кнопках fetch (4 файла). Сохранить селектор.
- `btn-fetch-cbr` — `querySelectorAll` в `cbr.ts`. Сохранить класс на кнопках ставки.
- `getComputedStyle` **не используется** → тема реализуется чисто через `[data-theme="dark"]` на
  `<html>`/`<body>` + CSS custom properties. JS только переключает атрибут.

**Сущностей: 5** (`index.html`, `src/styles/*`, `src/ui/tabs.ts`, `src/ui/theme.ts`, `main.ts`
-подключение) → **> 4**, полный формат (§5).

---

## 📋 Детальное ТЗ

### 1. Дизайн-система: `src/styles/` (дробление styles.css)

Разбить 443-строчный `styles.css` на модули (каждый < 300, §6.1). Структура:

```
src/styles/
├── tokens.css      # CSS custom properties: цвета, отступы, радиусы, тени, шрифты
├── base.css        # reset, body, типографика, базовые элементы (input, button, label)
├── layout.css      # .app, header, tabs, theme-toggle, сетка калькулятора
├── components.css   # .calculator-container, .form-group, .result, .btn, модалка
└── calculators.css # специфика bank/retail/currency/metals (если нужна)
```

Импорт в `src/main.ts` (порядок важен — tokens первым):
```ts
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/calculators.css";
```
Удалить старый `import "../styles.css"` и сам файл `styles.css` (после переноса).

### 2. Design tokens (`src/styles/tokens.css`)

CSS custom properties с light/dark вариантами через `[data-theme]`:

```css
:root, [data-theme="light"] {
  /* Поверхности */
  --color-bg: #f7f9fc;
  --color-surface: #ffffff;
  --color-surface-alt: #f1f5f9;

  /* Текст */
  --color-text: #1a202c;
  --color-text-muted: #64748b;
  --color-text-subtle: #94a3b8;

  /* Акценты (финансовый SaaS: индигo) */
  --color-accent: #4f46e5;
  --color-accent-hover: #4338ca;

  /* Семантика (сохраняет JS-контракт profit-positive/negative) */
  --color-profit: #059669;   /* profit-positive */
  --color-loss: #dc2626;     /* profit-negative */
  --color-tax: #dc2626;

  /* Границы/тени */
  --color-border: #e2e8f0;
  --shadow-card: 0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.02);
  --shadow-card-hover: 0 8px 25px rgba(0,0,0,0.1);

  /* Радиусы/отступы */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem; --space-6: 1.5rem;

  /* Типографика */
  --font-sans: 'Inter', 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
}

[data-theme="dark"] {
  --color-bg: #0f172a;
  --color-surface: #1e293b;
  --color-surface-alt: #334155;
  --color-text: #f1f5f9;
  --color-text-muted: #94a3b8;
  --color-text-subtle: #64748b;
  --color-accent: #818cf8;
  --color-accent-hover: #a5b4fc;
  --color-profit: #34d399;
  --color-loss: #f87171;
  --color-border: #334155;
  --shadow-card: 0 1px 3px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05);
}
```

**Ключевое правило:** все цвета в компонентах — только через `var(--color-*)`. Ни одного
хардкода `#xxxxxx` вне `tokens.css`. JS-контракт сохраняется: `.profit-positive { color: var(--color-profit) }`.

### 3. Layout: табы + header (`index.html` + `src/styles/layout.css`)

**Новая структура `index.html`** (обёртка + header + секции):
```html
<body>
  <div class="app">
    <header class="app-header">
      <div class="app-brand">💰 Invest</div>
      <nav class="tabs" role="tablist">
        <button class="tab tab--active" data-tab-target="bank">Банк</button>
        <button class="tab" data-tab-target="retail">Ретейл</button>
        <button class="tab" data-tab-target="currency">Валюта</button>
        <button class="tab" data-tab-target="metal">Металлы</button>
      </nav>
      <button class="theme-toggle" id="theme-toggle" aria-label="Сменить тему">◐</button>
    </header>
    <main class="app-main">
      <section class="tab-panel tab-panel--active" data-tab="bank">
        <div class="invest-bank"> ... существующая форма банка ... </div>
      </section>
      <section class="tab-panel" data-tab="retail" hidden> ... </section>
      <section class="tab-panel" data-tab="currency" hidden> ... </section>
      <section class="tab-panel" data-tab="metal" hidden> ... </section>
    </main>
  </div>
  <div id="calculationModal" class="modal"> ... (без изменений) ... </div>
</body>
```

**Правила перестройки (точно):**
- Каждый `.calculator-container` оборачивается в `<section class="tab-panel" data-tab="X" hidden>`.
  Активный — `tab-panel--active`, без `hidden`.
- **Сохранить внутри**: все `invest-bank`/`invest-retail`/`invest-currency`/`invest-metal` классы,
  все `id`, все `onclick`. Формы не трогать, только обернуть.
- **`id="result"` переименовать** → убрать id (класс `.result` достаточно); либо дать уникальные
  `bank-result`/`retail-result`/`currency-result`. Это **обязательная** правка (бомба).
- `.calculator-container` больше не имеет `min-height: 1350px` — теперь `max-width: 480px; margin: auto`.

### 4. JS: табы и тема (`src/ui/`)

**`src/ui/tabs.ts`** (новый, чистая DOM-логика):
```ts
export function initTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".tab");
  const panels = document.querySelectorAll<HTMLElement>(".tab-panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tabTarget;
      if (!target) return;
      tabs.forEach((t) => t.classList.toggle("tab--active", t === tab));
      panels.forEach((p) => {
        const isActive = p.dataset.tab === target;
        p.classList.toggle("tab-panel--active", isActive);
        p.hidden = !isActive;
      });
    });
  });
}
```

**`src/ui/theme.ts`** (новый):
```ts
const STORAGE_KEY = "invest-theme";

export function initTheme(): void {
  const saved = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved ?? (prefersDark ? "dark" : "light");
  document.documentElement.dataset.theme = theme;

  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme;
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem(STORAGE_KEY, next);
    });
  }
}
```

**`src/main.ts`** — добавить импорт стилей (вместо `../styles.css`) и вызов init:
```ts
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/calculators.css";
import { initTabs } from "./ui/tabs";
import { initTheme } from "./ui/theme";
// ... в конце init():
initTheme();
initTabs();
```

### 5. Типографика чисел (визуальная иерархия)

В `components.css` — числовые `.result` span'ы получают моноширинный шрифт для выравнивания:
```css
.result span, .deposit-highlight span, .tax-highlight span {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
```
Главное число («ИТОГО на руках» `.final-deposit`) — увеличенный кегль + жирность (акцент).

---

## 🛡 Граничные случаи & Защита архитектуры

**Контракт (критично):**
- **Все 11 `onclick` сохраняются.** Табы не заменяют onclick расчётчиков — они только переключают
  видимость секций. `calculateBankProfit()` и т.д. вызываются как раньше.
- **Все `id` сохраняются** (кроме `result` — переименовать/убрать). `metal-*`, `currency-*`,
  `retail-*`, `profit` — на месте. `byId()` в калькуляторах бросает при пропуске →
  после сборки `npm run build`/typecheck ничего не сообщит о пропуске, поэтому **обязательна
  ручная проверка** всех 4 калькуляторов в браузере.
- **`profit-positive`/`profit-negative`/`loading`/`btn-fetch-cbr`** — классы в новом CSS
  работают через токены: `.profit-positive { color: var(--color-profit) }`.

**Тема:**
- `data-theme` на `<html>` — единственный источник. CSS каскадно подхватывает.
- `localStorage` сохраняет выбор; дефолт — `prefers-color-scheme`.
- Нет `getComputedStyle` в JS — тема не зависит от чтения стилей.

**Доступность:**
- `role="tablist"`/`tab`/`tabpanel` — семантика ARIA (по возможности; минимум — `aria-label`
  на theme-toggle).
- Контраст цветов в обеих темах — проверить WCAG AA (минимум 4.5:1 для текста).

**Edge:**
- Таб по умолчанию — банк (`tab--active`, без `hidden`). Остальные `hidden`.
- Модалка `#calculationModal` остаётся вне `.app` (поверх всего, z-index).
- Мобильный вид: табы скроллятся по горизонтали (`overflow-x: auto`), форма — одна колонка.

---

## 🧪 Проверочные кейсы (ручные — автотестов нет, AGENTS.md §5)

**A. Табы:**
| Действие | Ожидание |
|---|---|
| Загрузка `/` | активен таб «Банк», видна только форма банка |
| Клик «Металлы» | банк скрыт, видна форма металлов, таб «Металлы» активен |
| Внутри каждого таба — «Рассчитать» | расчёт работает (onclick не сломан) |

**B. Тема:**
| Действие | Ожидание |
|---|---|
| Клик ◐ | тема переключается, фон/текст меняются |
| Перезагрузка | выбор сохранён (localStorage) |
| Первая загрузка (нет сохранения) | тема = системная (prefers-color-scheme) |

**C. Контракт JS↔CSS:**
| Проверка | Ожидание |
|---|---|
| прибыль > 0 в валюте | `currency-result` зелёный (`.profit-positive` → `--color-profit`) |
| убыток | красный (`.profit-loss` → `--color-loss`) |
| кнопка ↻ ставки | получает `loading` (серая/нечёткая), возвращает ↻ |

**D. Регрессия расчётов (критично):**
| Вход | Ожидание (как до редизайна) |
|---|---|
| банк 100000/12мес/10%/реинвест | profit=2 521 ₽, final=102 521 ₽ (эталон из ревью) |
| валюта 100000/95/92/ref90/21/30 | profit=−3 157 ₽ |
| металлы Au 100000/10000/10200/ref10100/365 | profit=+2 000 ₽ |

Числа не должны измениться — редизайн **только визуальный**.

**E. DOM-контракт:**
- `grep -oE 'id="[^"]+"' index.html | sort | uniq -d` → нет дублей `id` (главное — `result`).
- `byId('...')` в `src/calculators/*.ts` не бросает в runtime (все id на месте).

---

## Definition of Done (AGENTS.md §9, под новый стек)

- [ ] `npm run typecheck` **и** `npm run typecheck:node` — exit 0
- [ ] `npm run build` succeeds → `dist/` создан
- [ ] `npm start`/`npm run dev` — `GET /` отдаёт UI с табами
- [ ] `docker build .` succeeds (если трогал Dockerfile — здесь не трогаем)
- [ ] **все 4 калькулятора пересчитывают**; табы переключаются; тема toggle работает
- [ ] DOM-ID контракт не сломан (`byId` ↔ `id`); дублей `id` нет
- [ ] `grep "#[0-9a-fA-F]\{6\}" src/styles/components.css src/styles/calculators.css` → 0
      (хардкод цветов только в `tokens.css`)
- [ ] `as any`/`@ts-ignore` → 0
- [ ] регрессия чисел (кейсы D) — те же результаты

---

## ⚠ Что НЕ делать (anti-scope, реджект на ревью)

- **Не трогать** `src/shared/*`, `src/calculators/*` бизнес-логику, `server/*`, эндпоинты.
- **Не менять** 11 `onclick` и существующие `id` (кроме `result`-дублей — переименовать).
- **Не вводить** Tailwind/CSS-in-JS/UI-фреймворк (стек — vanilla CSS + custom properties).
- **Не менять** расчётную логику — редизайн **строго визуальный**.
- **Не вводить** новую npm-зависимость ради анимаций/иконок (SVG inline или CSS).

---

## 📐 Эталоны для кодера

- **JS↔CSS контракт** (аудит): `profit-positive`/`profit-negative` ставятся в
  `src/calculators/currency.ts:112,120,122` и `metals.ts:115,123,125`. `loading` — `cbr.ts`,
  `currency.ts`, `metals.ts`. `btn-fetch-cbr` — `cbr.ts`.
- **Текущая структура** — `index.html`: 4 `.calculator-container` в `body`, `invest-*` классы внутри.
- **CSS custom properties** — единственный канал темизации; `data-theme` на `<html>`.

---

> Кодер (`docs/ai/coder.md`) реализует строго по этому спеку. Архитектор проводит параноид-ревью
> по `architect.md` §4: сам прогоняет `npm run dev`, проверяет табы/тему/контракт, сверяет
> регрессию чисел (кейсы D), убеждается что хардкод-цветов только в `tokens.css`.
