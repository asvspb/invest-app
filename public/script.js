const CBR_RATE_INPUTS = ['cbr-rate', 'retail-cbr-rate', 'currency-cbr-rate', 'metal-cbr-rate'];

async function fetchCbrRate() {
    const allBtns = document.querySelectorAll('.btn-fetch-cbr');
    allBtns.forEach(b => { b.classList.add('loading'); b.textContent = '...'; });

    try {
        const resp = await fetch('/api/cbr-key-rate?refresh=true');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const rate = parseFloat(data.rate);
        if (!isNaN(rate)) {
            CBR_RATE_INPUTS.forEach(id => {
                const input = document.getElementById(id);
                if (input) input.value = rate.toFixed(1);
            });
        } else {
            throw new Error('Invalid rate value');
        }
    } catch (err) {
        console.error('Failed to fetch CBR rate:', err);
    } finally {
        allBtns.forEach(b => { b.classList.remove('loading'); b.textContent = '↻'; });
    }
}

// Функция для форматирования чисел с пробелами между тысячами
function formatNumber(num) {
    return isNaN(num) ? '0' : Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// Функция для очистки строки от всех символов кроме цифр
function parseFormattedNumber(str) {
    return parseInt(str.replace(/\s/g, '')) || 0;
}

// Функция для форматирования ввода в поле
function formatInputNumber(input) {
    const cursorPosition = input.selectionStart;
    const value = input.value.replace(/\s/g, '');

    if (value === '') {
        input.value = '';
        return;
    }

    if (!/^\d+$/.test(value)) {
        input.value = input.value.replace(/[^\d]/g, '');
        return;
    }

    const formatted = formatNumber(parseInt(value));
    input.value = formatted;

    // Восстанавливаем позицию курсора с учетом добавленных пробелов
    const addedSpaces = formatted.length - value.length;
    const newPosition = cursorPosition + addedSpaces;
    input.setSelectionRange(newPosition, newPosition);
}


// Функция для форматирования чисел с двумя десятичными знаками
function formatDecimal(num) {
    return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// Функция для отображения модального окна
function showModal(paragraphs) {
    const modal = document.getElementById('calculationModal');
    const detailsContainer = document.getElementById('calculationDetails');

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
    span.onclick = function () {
        modal.style.display = "none";
    }

    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }
}


// Банковский калькулятор
function calculateTax(profitByYear, maxBalance, cbrRate) {
    const TAX_FREE_MAX = 1_000_000;
    const MIN_CBR_RATE = 0.13;
    const THRESHOLD_13_PCT = 5_000_000;
    const RATE_13 = 0.13;
    const RATE_15 = 0.15;

    const effectiveRate = Math.max(cbrRate, MIN_CBR_RATE) / 100;
    const taxFreeBase = Math.max(maxBalance, TAX_FREE_MAX);
    const yearlyTaxFree = taxFreeBase * effectiveRate;

    let totalTax = 0;
    let totalTaxable = 0;
    let totalTaxFreeUsed = 0;

    for (const yearProfit of profitByYear) {
        if (yearProfit <= yearlyTaxFree) {
            totalTaxFreeUsed += yearProfit;
            continue;
        }

        const taxableForYear = yearProfit - yearlyTaxFree;
        totalTaxable += taxableForYear;
        totalTaxFreeUsed += yearlyTaxFree;

        if (totalTaxable <= THRESHOLD_13_PCT) {
            totalTax += taxableForYear * RATE_13;
        } else {
            const remainingAt13 = Math.max(THRESHOLD_13_PCT - (totalTaxable - taxableForYear), 0);
            totalTax += remainingAt13 * RATE_13 + Math.max(taxableForYear - remainingAt13, 0) * RATE_15;
        }
    }

    return {
        yearlyLimit: yearlyTaxFree,
        taxableIncome: totalTaxable,
        taxAmount: totalTax,
        taxFreeUsed: totalTaxFreeUsed
    };
}

function calculateBankProfit() {
    const messageEl = document.getElementById('profit');
    const initialAmountInput = document.getElementById('amount');
    const periodInput = document.getElementById('period');
    const annualPercentInput = document.getElementById('percent');
    const monthlyDepositInput = document.getElementById('monthly-deposit');
    const cbrRateInput = document.getElementById('cbr-rate');

    const initialAmount = parseFormattedNumber(initialAmountInput.value);
    const period = parseInt(periodInput.value);
    const annualPercent = parseFloat(annualPercentInput.value);
    const cbrRate = parseFloat(cbrRateInput.value) || 21;
    const isReinvest = document.getElementById('reinvest').checked;
    const monthlyDeposit = parseFormattedNumber(monthlyDepositInput.value);
    const showHow = document.getElementById('show-how').checked;

    if (isNaN(initialAmount) || initialAmount <= 0) {
        messageEl.textContent = 'Введите корректную сумму';
        initialAmountInput.focus();
        return;
    }

    if (isNaN(period) || period <= 0) {
        messageEl.textContent = 'Введите корректный период';
        periodInput.focus();
        return;
    }

    if (isNaN(annualPercent) || annualPercent < 0) {
        messageEl.textContent = 'Введите корректный годовой процент';
        annualPercentInput.focus();
        return;
    }

    if (isNaN(monthlyDeposit) || monthlyDeposit < 0) {
        messageEl.textContent = 'Введите корректное пополнение';
        monthlyDepositInput.focus();
        return;
    }

    let totalAmount = initialAmount;
    let totalProfit = 0;
    let totalDepositsSum = 0;
    let maxBalance = initialAmount;
    const monthlyPercent = annualPercent / 12 / 100;

    const profitByYear = [];
    let currentYearProfit = 0;
    let monthInYear = 0;

    const details = [];

    for (let i = 1; i <= period; i++) {
        const monthProfit = totalAmount * monthlyPercent;
        totalProfit += monthProfit;
        currentYearProfit += monthProfit;
        monthInYear++;

        if (monthInYear === 12 || i === period) {
            profitByYear.push(currentYearProfit);
            currentYearProfit = 0;
            monthInYear = 0;
        }

        if (isReinvest) {
            totalAmount += monthProfit;
        }

        totalAmount += monthlyDeposit;
        totalDepositsSum += monthlyDeposit;
        maxBalance = Math.max(maxBalance, totalAmount);

        if (showHow) {
            const lines = [
                `Месяц ${i}:`,
                `Прибыль: ${formatDecimal(monthProfit)} ₽`
            ];
            if (isReinvest) lines.push(`Реинвестировано: ${formatDecimal(monthProfit)} ₽`);
            if (monthlyDeposit > 0) lines.push(`Пополнение: ${formatDecimal(monthlyDeposit)} ₽`);
            lines.push(`Итого на конец месяца: ${formatDecimal(totalAmount)} ₽`);
            details.push(lines);
        }
    }

    const taxResult = calculateTax(profitByYear, maxBalance, cbrRate);

    const finalAmount = initialAmount + totalDepositsSum + totalProfit - taxResult.taxAmount;
    const yearlyProfit = (totalProfit / period) * 12;
    const monthlyProfit = totalProfit / period;

    document.getElementById('profit').textContent = formatNumber(totalProfit) + ' ₽';
    document.getElementById('monthlyProfit').textContent = formatNumber(monthlyProfit) + ' ₽';
    document.getElementById('yearlyProfit').textContent = formatNumber(yearlyProfit) + ' ₽';

    document.getElementById('totalDeposit').textContent = formatNumber(initialAmount + totalDepositsSum + totalProfit) + ' ₽';
    document.getElementById('initialDeposit').textContent = formatNumber(initialAmount) + ' ₽';
    document.getElementById('totalDeposits').textContent = formatNumber(totalDepositsSum) + ' ₽';
    document.getElementById('totalInterest').textContent = formatNumber(totalProfit) + ' ₽';

    document.getElementById('taxFreeLimit').textContent = formatNumber(taxResult.yearlyLimit) + ' ₽/год';
    document.getElementById('taxableAmount').textContent = formatNumber(taxResult.taxableIncome) + ' ₽';
    document.getElementById('taxAmount').textContent = formatNumber(taxResult.taxAmount) + ' ₽';
    document.getElementById('finalDeposit').textContent = formatNumber(finalAmount) + ' ₽';

    if (showHow) {
        showModal(details);
    }
}

// Ретейл калькулятор

// Чистая функция метрик: число → число, без document.* (AGENTS.md §6.2).
// Полная экономическая модель: прибыль = выручка − себестоимость − расходы.
function calculateRetailMetrics(revenue, cost, expenses, period) {
    const profit = revenue - cost - expenses;
    const invested = cost + expenses;
    const markup = cost > 0 ? (profit / cost) * 100 : 0;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const roi = invested > 0 ? (profit / invested) * 100 : 0;
    const yearlyYield = period > 0 ? roi * 12 / period : 0;
    return { profit, invested, markup, margin, roi, yearlyYield };
}

function calculateRetail() {
    const revenueInput = document.getElementById('retail-revenue');
    const costInput = document.getElementById('retail-cost-price');
    const expensesInput = document.getElementById('retail-expenses');
    const periodInput = document.getElementById('retail-period');
    const cbrRateInput = document.getElementById('retail-cbr-rate');
    const messageEl = document.getElementById('retail-profit-amount');

    const revenue = parseFormattedNumber(revenueInput.value);
    const cost = parseFormattedNumber(costInput.value);
    const expenses = parseFormattedNumber(expensesInput.value);
    const period = parseInt(periodInput.value) || 0;
    const cbrRate = parseFloat(cbrRateInput.value) || 21;

    // Валидация с сообщением в DOM (не alert — AGENTS.md §7).
    if (isNaN(revenue) || revenue < 0) {
        messageEl.textContent = 'Введите корректную выручку';
        revenueInput.focus();
        return;
    }
    if (isNaN(cost) || cost < 0) {
        messageEl.textContent = 'Введите корректную себестоимость';
        costInput.focus();
        return;
    }
    if (isNaN(expenses) || expenses < 0) {
        messageEl.textContent = 'Введите корректные расходы';
        expensesInput.focus();
        return;
    }
    if (isNaN(period) || period <= 0) {
        messageEl.textContent = 'Введите корректный период';
        periodInput.focus();
        return;
    }

    const { profit, markup, margin, roi, yearlyYield } =
        calculateRetailMetrics(revenue, cost, expenses, period);

    // Убыток налогом не облагается (Math.max). maxBalance = вложенный капитал.
    const taxResult = calculateTax([Math.max(profit, 0)], cost + expenses, cbrRate);
    const finalAmount = profit - taxResult.taxAmount;

    document.getElementById('retail-profit-amount').textContent = formatNumber(profit) + ' ₽';
    document.getElementById('retail-markup').textContent = formatDecimal(markup) + ' %';
    document.getElementById('retail-margin').textContent = formatDecimal(margin) + ' %';
    document.getElementById('retail-roi').textContent = formatDecimal(roi) + ' %';
    document.getElementById('retail-yearly-yield').textContent = formatDecimal(yearlyYield) + ' %';

    document.getElementById('retail-detail-revenue').textContent = formatNumber(revenue) + ' ₽';
    document.getElementById('retail-detail-cost').textContent = formatNumber(cost) + ' ₽';
    document.getElementById('retail-detail-expenses').textContent = formatNumber(expenses) + ' ₽';

    document.getElementById('retail-taxAmount').textContent = formatNumber(taxResult.taxAmount) + ' ₽';
    document.getElementById('retail-finalDeposit').textContent = formatNumber(finalAmount) + ' ₽';
}

let lastCbrExchangeRate = null;
let lastCbrMetalPrice = null;

function calculateAssetRoundTrip(params) {
    const { amount, buyPrice, sellPrice, refPrice, keyRate, holdPeriod } = params;

    const units = amount / buyPrice;
    const rubAfterSell = units * sellPrice;
    const profit = rubAfterSell - amount;

    const spreadBuy = refPrice > 0 ? buyPrice - refPrice : 0;
    const spreadSell = refPrice > 0 ? refPrice - sellPrice : 0;
    const totalSpread = spreadBuy + spreadSell;
    const marginBuy = refPrice > 0 ? (spreadBuy / refPrice) * 100 : 0;
    const marginSell = refPrice > 0 ? (spreadSell / refPrice) * 100 : 0;
    const marginTotal = refPrice > 0 ? (totalSpread / refPrice) * 100 : 0;

    const periodYield = (profit / amount) * 100;
    const yearlyYield = periodYield * (365 / holdPeriod);

    const tax = calculateTax([Math.max(profit, 0)], amount, keyRate);
    const finalAmount = rubAfterSell - tax.taxAmount;

    return { units, rubAfterSell, profit, periodYield, yearlyYield,
             spreadBuy, spreadSell, totalSpread, marginBuy, marginSell, marginTotal,
             tax, finalAmount };
}

function fetchCbrRates() {
    const btn = document.getElementById('fetch-cbr-rates-btn');
    const code = document.getElementById('currency-code').value;
    const sellInput = document.getElementById('currency-sell-rate');
    const buyInput = document.getElementById('currency-buy-rate');

    btn.classList.add('loading');
    btn.textContent = '...';

    fetch('/api/cbr-rates')
        .then(resp => {
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return resp.json();
        })
        .then(data => {
            const rate = data.rates[code];
            if (!rate) throw new Error(`Валюта ${code} не найдена`);
            lastCbrExchangeRate = rate;
            sellInput.value = rate.toFixed(2);
            buyInput.value = rate.toFixed(2);
            document.getElementById('currency-cbr-exchange-rate').textContent = rate.toFixed(2);
        })
        .catch(err => {
            console.error('Failed to fetch CBR rates:', err);
            document.getElementById('currency-cbr-exchange-rate').textContent = 'нет данных';
        })
        .finally(() => {
            btn.classList.remove('loading');
            btn.textContent = '↻';
        });
}

function calculateCurrency() {
    const messageEl = document.getElementById('currency-result');
    const amountInput = document.getElementById('currency-amount');
    const sellRateInput = document.getElementById('currency-sell-rate');
    const buyRateInput = document.getElementById('currency-buy-rate');
    const cbrRateInput = document.getElementById('currency-cbr-rate');
    const holdPeriodInput = document.getElementById('currency-hold-period');

    const amount = parseFormattedNumber(amountInput.value);
    const sellRate = parseFloat(sellRateInput.value);
    const buyRate = parseFloat(buyRateInput.value);
    const cbrRate = parseFloat(cbrRateInput.value) || 21;
    const holdPeriod = parseInt(holdPeriodInput.value) || 1;

    if (isNaN(amount) || amount <= 0) {
        messageEl.textContent = 'Введите корректную сумму';
        amountInput.focus();
        return;
    }

    if (isNaN(sellRate) || sellRate <= 0) {
        messageEl.textContent = 'Введите корректный курс покупки';
        sellRateInput.focus();
        return;
    }

    if (isNaN(buyRate) || buyRate <= 0) {
        messageEl.textContent = 'Введите корректный курс продажи';
        buyRateInput.focus();
        return;
    }

    const r = calculateAssetRoundTrip({
        amount,
        buyPrice: sellRate,
        sellPrice: buyRate,
        refPrice: lastCbrExchangeRate || 0,
        keyRate: cbrRate,
        holdPeriod
    });

    const resultEl = document.getElementById('currency-result');
    resultEl.textContent = (r.profit >= 0 ? '+' : '') + formatNumber(r.profit) + ' ₽';
    resultEl.className = r.profit >= 0 ? 'profit-positive' : 'profit-negative';

    document.getElementById('currency-bought').textContent = formatDecimal(r.units);
    document.getElementById('currency-sold-rub').textContent = formatNumber(r.rubAfterSell) + ' ₽';

    const periodYieldEl = document.getElementById('currency-period-yield');
    const yearlyYieldEl = document.getElementById('currency-yearly-yield');
    periodYieldEl.textContent = formatDecimal(r.periodYield) + ' %';
    periodYieldEl.className = r.periodYield >= 0 ? 'profit-positive' : 'profit-negative';
    yearlyYieldEl.textContent = formatDecimal(r.yearlyYield) + ' %';
    yearlyYieldEl.className = r.yearlyYield >= 0 ? 'profit-positive' : 'profit-negative';

    document.getElementById('currency-spread-sell').textContent = (r.spreadBuy >= 0 ? '+' : '') + formatDecimal(r.spreadBuy) + ' ₽';
    document.getElementById('currency-margin-sell').textContent = formatDecimal(r.marginBuy) + ' %';
    document.getElementById('currency-spread-buy').textContent = (r.spreadSell >= 0 ? '+' : '') + formatDecimal(r.spreadSell) + ' ₽';
    document.getElementById('currency-margin-buy').textContent = formatDecimal(r.marginSell) + ' %';
    document.getElementById('currency-spread').textContent = formatDecimal(r.totalSpread) + ' ₽';
    document.getElementById('currency-margin').textContent = formatDecimal(r.marginTotal) + ' %';

    document.getElementById('currency-taxFreeLimit').textContent = formatNumber(r.tax.yearlyLimit) + ' ₽/год';
    document.getElementById('currency-taxableAmount').textContent = formatNumber(r.tax.taxableIncome) + ' ₽';
    document.getElementById('currency-taxAmount').textContent = formatNumber(r.tax.taxAmount) + ' ₽';
    document.getElementById('currency-finalDeposit').textContent = formatNumber(r.finalAmount) + ' ₽';
}

function clearCurrencyForm() {
    document.getElementById('currency-amount').value = '0';
    document.getElementById('currency-sell-rate').value = '0';
    document.getElementById('currency-buy-rate').value = '0';
    document.getElementById('currency-cbr-rate').value = '21';
    document.getElementById('currency-hold-period').value = '1';
    document.getElementById('currency-result').textContent = '0 ₽';
    document.getElementById('currency-result').className = '';
    document.getElementById('currency-bought').textContent = '0';
    document.getElementById('currency-sold-rub').textContent = '0 ₽';
    document.getElementById('currency-period-yield').textContent = '0 %';
    document.getElementById('currency-period-yield').className = '';
    document.getElementById('currency-yearly-yield').textContent = '0 %';
    document.getElementById('currency-yearly-yield').className = '';
    document.getElementById('currency-spread-sell').textContent = '0 ₽';
    document.getElementById('currency-margin-sell').textContent = '0 %';
    document.getElementById('currency-spread-buy').textContent = '0 ₽';
    document.getElementById('currency-margin-buy').textContent = '0 %';
    document.getElementById('currency-spread').textContent = '0 ₽';
    document.getElementById('currency-margin').textContent = '0 %';
    document.getElementById('currency-taxFreeLimit').textContent = '0 ₽/год';
    document.getElementById('currency-taxableAmount').textContent = '0 ₽';
    document.getElementById('currency-taxAmount').textContent = '0 ₽';
    document.getElementById('currency-finalDeposit').textContent = '0 ₽';
}

function fetchCbrMetals() {
    const btn = document.getElementById('metal-fetch-btn');
    const metalType = document.getElementById('metal-type').value;
    const buyInput = document.getElementById('metal-buy-price');
    const sellInput = document.getElementById('metal-sell-price');
    const cbrPriceSpan = document.getElementById('metal-cbr-price');

    btn.classList.add('loading');
    btn.textContent = '...';

    fetch('/api/cbr-metals')
        .then(resp => {
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return resp.json();
        })
        .then(data => {
            const price = data.metals[metalType];
            if (!price) throw new Error(`Металл ${metalType} не найден`);
            lastCbrMetalPrice = price;
            buyInput.value = price.toFixed(2);
            sellInput.value = price.toFixed(2);
            cbrPriceSpan.textContent = price.toFixed(2);
        })
        .catch(err => {
            console.error('Failed to fetch CBR metals:', err);
            cbrPriceSpan.textContent = 'нет данных';
        })
        .finally(() => {
            btn.classList.remove('loading');
            btn.textContent = '↻';
        });
}

function calculateMetal() {
    const amountInput = document.getElementById('metal-amount');
    const buyPriceInput = document.getElementById('metal-buy-price');
    const sellPriceInput = document.getElementById('metal-sell-price');
    const cbrRateInput = document.getElementById('metal-cbr-rate');
    const holdPeriodInput = document.getElementById('metal-hold-period');
    const messageEl = document.getElementById('metal-result');

    const amount = parseFormattedNumber(amountInput.value);
    const buyPrice = parseFloat(buyPriceInput.value);
    const sellPrice = parseFloat(sellPriceInput.value);
    const cbrRate = parseFloat(cbrRateInput.value) || 21;
    const holdPeriod = parseInt(holdPeriodInput.value) || 0;

    if (isNaN(amount) || amount <= 0) {
        messageEl.textContent = 'Введите корректную сумму';
        amountInput.focus();
        return;
    }
    if (isNaN(buyPrice) || buyPrice <= 0) {
        messageEl.textContent = 'Введите корректную цену покупки';
        buyPriceInput.focus();
        return;
    }
    if (isNaN(sellPrice) || sellPrice <= 0) {
        messageEl.textContent = 'Введите корректную цену продажи';
        sellPriceInput.focus();
        return;
    }
    if (isNaN(holdPeriod) || holdPeriod <= 0) {
        messageEl.textContent = 'Введите корректный период владения';
        holdPeriodInput.focus();
        return;
    }

    const r = calculateAssetRoundTrip({
        amount,
        buyPrice,
        sellPrice,
        refPrice: lastCbrMetalPrice || 0,
        keyRate: cbrRate,
        holdPeriod
    });

    const resultEl = document.getElementById('metal-result');
    resultEl.textContent = (r.profit >= 0 ? '+' : '') + formatNumber(r.profit) + ' ₽';
    resultEl.className = r.profit >= 0 ? 'profit-positive' : 'profit-negative';

    document.getElementById('metal-bought').textContent = formatDecimal(r.units);
    document.getElementById('metal-sold-rub').textContent = formatNumber(r.rubAfterSell) + ' ₽';

    const periodYieldEl = document.getElementById('metal-period-yield');
    const yearlyYieldEl = document.getElementById('metal-yearly-yield');
    periodYieldEl.textContent = formatDecimal(r.periodYield) + ' %';
    periodYieldEl.className = r.periodYield >= 0 ? 'profit-positive' : 'profit-negative';
    yearlyYieldEl.textContent = formatDecimal(r.yearlyYield) + ' %';
    yearlyYieldEl.className = r.yearlyYield >= 0 ? 'profit-positive' : 'profit-negative';

    document.getElementById('metal-spread-buy').textContent = formatDecimal(r.spreadBuy) + ' ₽';
    document.getElementById('metal-margin-buy').textContent = formatDecimal(r.marginBuy) + ' %';
    document.getElementById('metal-spread-sell').textContent = formatDecimal(r.spreadSell) + ' ₽';
    document.getElementById('metal-margin-sell').textContent = formatDecimal(r.marginSell) + ' %';
    document.getElementById('metal-spread').textContent = formatDecimal(r.totalSpread) + ' ₽';
    document.getElementById('metal-margin').textContent = formatDecimal(r.marginTotal) + ' %';

    document.getElementById('metal-taxFreeLimit').textContent = formatNumber(r.tax.yearlyLimit) + ' ₽/год';
    document.getElementById('metal-taxableAmount').textContent = formatNumber(r.tax.taxableIncome) + ' ₽';
    document.getElementById('metal-taxAmount').textContent = formatNumber(r.tax.taxAmount) + ' ₽';
    document.getElementById('metal-finalDeposit').textContent = formatNumber(r.finalAmount) + ' ₽';
}

function clearMetalForm() {
    document.getElementById('metal-amount').value = '0';
    document.getElementById('metal-buy-price').value = '0';
    document.getElementById('metal-sell-price').value = '0';
    document.getElementById('metal-cbr-rate').value = '21';
    document.getElementById('metal-hold-period').value = '365';
    document.getElementById('metal-result').textContent = '0 ₽';
    document.getElementById('metal-result').className = '';
    document.getElementById('metal-bought').textContent = '0';
    document.getElementById('metal-sold-rub').textContent = '0 ₽';
    document.getElementById('metal-period-yield').textContent = '0 %';
    document.getElementById('metal-period-yield').className = '';
    document.getElementById('metal-yearly-yield').textContent = '0 %';
    document.getElementById('metal-yearly-yield').className = '';
    document.getElementById('metal-spread-buy').textContent = '0 ₽';
    document.getElementById('metal-margin-buy').textContent = '0 %';
    document.getElementById('metal-spread-sell').textContent = '0 ₽';
    document.getElementById('metal-margin-sell').textContent = '0 %';
    document.getElementById('metal-spread').textContent = '0 ₽';
    document.getElementById('metal-margin').textContent = '0 %';
    document.getElementById('metal-taxFreeLimit').textContent = '0 ₽/год';
    document.getElementById('metal-taxableAmount').textContent = '0 ₽';
    document.getElementById('metal-taxAmount').textContent = '0 ₽';
    document.getElementById('metal-finalDeposit').textContent = '0 ₽';
}

// Инициализация калькуляторов при загрузке страницы
// Функции очистки форм
function clearBankForm() {
    document.getElementById('amount').value = '0';
    document.getElementById('period').value = '12';
    document.getElementById('percent').value = '10';
    document.getElementById('cbr-rate').value = '21';
    document.getElementById('monthly-deposit').value = '0';
    document.getElementById('reinvest').checked = false;
    document.getElementById('show-how').checked = false;
    document.getElementById('profit').textContent = '0 ₽';
    document.getElementById('monthlyProfit').textContent = '0 ₽';
    document.getElementById('yearlyProfit').textContent = '0 ₽';
    document.getElementById('totalDeposit').textContent = '0 ₽';
    document.getElementById('initialDeposit').textContent = '0 ₽';
    document.getElementById('totalDeposits').textContent = '0 ₽';
    document.getElementById('totalInterest').textContent = '0 ₽';
    document.getElementById('taxFreeLimit').textContent = '0 ₽/год';
    document.getElementById('taxableAmount').textContent = '0 ₽';
    document.getElementById('taxAmount').textContent = '0 ₽';
    document.getElementById('finalDeposit').textContent = '0 ₽';
}

function clearRetailForm() {
    document.getElementById('retail-revenue').value = '0';
    document.getElementById('retail-cost-price').value = '0';
    document.getElementById('retail-expenses').value = '0';
    document.getElementById('retail-period').value = '1';
    document.getElementById('retail-cbr-rate').value = '21';
    document.getElementById('retail-profit-amount').textContent = '0 ₽';
    document.getElementById('retail-markup').textContent = '0 %';
    document.getElementById('retail-margin').textContent = '0 %';
    document.getElementById('retail-roi').textContent = '0 %';
    document.getElementById('retail-yearly-yield').textContent = '0 %';
    document.getElementById('retail-detail-revenue').textContent = '0 ₽';
    document.getElementById('retail-detail-cost').textContent = '0 ₽';
    document.getElementById('retail-detail-expenses').textContent = '0 ₽';
    document.getElementById('retail-taxAmount').textContent = '0 ₽';
    document.getElementById('retail-finalDeposit').textContent = '0 ₽';
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize input fields with default values
    const amountInputs = [
        document.getElementById('amount'),
        document.getElementById('retail-revenue'),
        document.getElementById('retail-cost-price'),
        document.getElementById('retail-expenses'),
        document.getElementById('monthly-deposit'),
        document.getElementById('currency-amount'),
        document.getElementById('metal-amount')
    ];

    // Set default values and add input formatting
    amountInputs.forEach(input => {
        if (input) {
            input.value = '0';
            input.addEventListener('input', () => formatInputNumber(input));
            input.addEventListener('blur', () => {
                if (input.value === '') {
                    input.value = '0';
                }
            });
        }
    });

    // Special handling for percent inputs (percent + cbr-rate)
    [document.getElementById('percent'), document.getElementById('cbr-rate'), document.getElementById('retail-cbr-rate'), document.getElementById('currency-sell-rate'), document.getElementById('currency-buy-rate'), document.getElementById('currency-cbr-rate'), document.getElementById('metal-buy-price'), document.getElementById('metal-sell-price'), document.getElementById('metal-cbr-rate')].forEach(percentInput => {
        if (percentInput) {
            const isCbr = percentInput.id.includes('cbr-rate');
            const isMetalPrice = percentInput.id === 'metal-buy-price' || percentInput.id === 'metal-sell-price';
            percentInput.value = isCbr ? '21' : isMetalPrice ? '0' : (percentInput.id === 'cbr-rate' ? '21' : '10');

            percentInput.addEventListener('input', (e) => {
                let value = e.target.value.replace(',', '.');
                value = value.replace(/[^\d.]/g, '');
                const parts = value.split('.');
                if (parts.length > 2) {
                    value = parts[0] + '.' + parts.slice(1).join('');
                }
                e.target.value = value;
            });

            percentInput.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const step = parseFloat(percentInput.dataset.step) || 0.1;
                    const min = parseFloat(percentInput.dataset.min) || 0;
                    let currentValue = parseFloat(percentInput.value) || 0;

                    if (e.key === 'ArrowUp') {
                        currentValue += step;
                    } else {
                        currentValue = Math.max(min, currentValue - step);
                    }

                    percentInput.value = currentValue.toFixed(1);
                }
            });

            percentInput.addEventListener('blur', () => {
                if (percentInput.value === '' || percentInput.value === '.') {
                    percentInput.value = isCbr ? '21' : '0';
                }
            });
        }
    });

    // Initialize other inputs with defaults
    const defaultInputs = [
        { id: 'retail-period', value: '1' },
        { id: 'retail-rate', value: '0' },
        { id: 'metal-hold-period', value: '365' }
    ];

    defaultInputs.forEach(({ id, value }) => {
        const input = document.getElementById(id);
        if (input) {
            input.value = value;
        }
    });

    CBR_RATE_INPUTS.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                const val = input.value;
                CBR_RATE_INPUTS.forEach(otherId => {
                    if (otherId !== id) {
                        const other = document.getElementById(otherId);
                        if (other) other.value = val;
                    }
                });
            });
        }
    });

    fetchCbrRate();
});
