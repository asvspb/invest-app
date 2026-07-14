async function fetchCbrRate(targetId) {
    const id = targetId || 'cbr-rate';
    const btn = document.getElementById(id).parentElement.querySelector('.btn-fetch');
    const input = document.getElementById(id);

    if (btn) {
        btn.classList.add('loading');
        btn.textContent = '...';
    }

    try {
        const resp = await fetch('/api/cbr-key-rate');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const rate = parseFloat(data.rate);
        if (!isNaN(rate)) {
            input.value = rate.toFixed(1);
        } else {
            throw new Error('Invalid rate value');
        }
    } catch (err) {
        console.error('Failed to fetch CBR rate:', err);
        alert('Не удалось получить ставку ЦБ. Проверьте подключение к интернету.');
    } finally {
        if (btn) {
            btn.classList.remove('loading');
            btn.textContent = '↻';
        }
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
function showModal(content) {
    const modal = document.getElementById('calculationModal');
    const detailsContainer = document.getElementById('calculationDetails');
    detailsContainer.innerHTML = content;
    modal.style.display = "block";

    // Закрытие модального окна при клике на крестик
    const span = document.getElementsByClassName("close")[0];
    span.onclick = function () {
        modal.style.display = "none";
    }

    // Закрытие модального окна при клике вне его
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
        alert('Пожалуйста, введите корректную сумму инвестирования.');
        initialAmountInput.focus();
        return;
    }

    if (isNaN(period) || period <= 0) {
        alert('Пожалуйста, введите корректный период.');
        periodInput.focus();
        return;
    }

    if (isNaN(annualPercent) || annualPercent < 0) {
        alert('Пожалуйста, введите корректный годовой процент.');
        annualPercentInput.focus();
        return;
    }

    if (isNaN(monthlyDeposit) || monthlyDeposit < 0) {
        alert('Пожалуйста, введите корректное пополнение вклада.');
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

    let calculationDetails = '';

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

        totalAmount += monthlyDeposit;
        totalDepositsSum += monthlyDeposit;
        maxBalance = Math.max(maxBalance, totalAmount);

        if (showHow && monthlyDeposit > 0) {
            calculationDetails += `Пополнение: ${formatDecimal(monthlyDeposit)} ₽<br>`;
        }

        if (showHow) {
            calculationDetails += `Итого на конец месяца: ${formatDecimal(totalAmount)} ₽</p><br>`;
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
        showModal(calculationDetails);
    }
}

// Ретейл калькулятор
function calculateRetail() {
    const initialInput = document.getElementById('retail-initial');
    const periodInput = document.getElementById('retail-period');
    const profitInput = document.getElementById('retail-rate');
    const cbrRateInput = document.getElementById('retail-cbr-rate');

    const initial = parseFormattedNumber(initialInput.value);
    const period = parseInt(periodInput.value) || 0;
    const profit = parseFormattedNumber(profitInput.value);
    const cbrRate = parseFloat(cbrRateInput.value) || 21;

    if (isNaN(initial) || initial < 0) {
        alert('Пожалуйста, введите корректную сумму инвестирования.');
        initialInput.focus();
        return;
    }

    if (isNaN(period) || period <= 0) {
        alert('Пожалуйста, введите корректный период.');
        periodInput.focus();
        return;
    }

    if (isNaN(profit) || profit < 0) {
        alert('Пожалуйста, введите корректную прибыль.');
        profitInput.focus();
        return;
    }

    let total, yearlyProfit;

    if (initial > 0 && period > 0) {
        total = initial + profit;
        yearlyProfit = (profit / initial) * (12 / period) * 100;
    } else {
        total = yearlyProfit = 0;
    }

    const taxResult = calculateTax([profit], initial, cbrRate);
    const finalAmount = total - taxResult.taxAmount;

    document.getElementById('retail-profit').textContent = formatNumber(yearlyProfit) + ' %';
    document.getElementById('retail-yearlyProfit').textContent = formatNumber(profit) + ' ₽';
    document.getElementById('retail-total').textContent = formatNumber(total) + ' ₽';

    document.getElementById('retail-taxFreeLimit').textContent = formatNumber(taxResult.yearlyLimit) + ' ₽/год';
    document.getElementById('retail-taxableAmount').textContent = formatNumber(taxResult.taxableIncome) + ' ₽';
    document.getElementById('retail-taxAmount').textContent = formatNumber(taxResult.taxAmount) + ' ₽';
    document.getElementById('retail-finalDeposit').textContent = formatNumber(finalAmount) + ' ₽';
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
    document.getElementById('retail-initial').value = '0';
    document.getElementById('retail-period').value = '1';
    document.getElementById('retail-rate').value = '0';
    document.getElementById('retail-cbr-rate').value = '21';
    document.getElementById('retail-profit').textContent = '0 %';
    document.getElementById('retail-yearlyProfit').textContent = '0 ₽';
    document.getElementById('retail-total').textContent = '0 ₽';
    document.getElementById('retail-taxFreeLimit').textContent = '0 ₽/год';
    document.getElementById('retail-taxableAmount').textContent = '0 ₽';
    document.getElementById('retail-taxAmount').textContent = '0 ₽';
    document.getElementById('retail-finalDeposit').textContent = '0 ₽';
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize input fields with default values
    const amountInputs = [
        document.getElementById('amount'),
        document.getElementById('retail-initial'),
        document.getElementById('monthly-deposit'),
        document.getElementById('retail-rate')
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
    [document.getElementById('percent'), document.getElementById('cbr-rate'), document.getElementById('retail-cbr-rate')].forEach(percentInput => {
        if (percentInput) {
            const isCbr = percentInput.id.includes('cbr-rate');
            percentInput.value = isCbr ? '21' : (percentInput.id === 'cbr-rate' ? '21' : '10');

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
        { id: 'retail-rate', value: '0' }
    ];

    defaultInputs.forEach(({ id, value }) => {
        const input = document.getElementById(id);
        if (input) {
            input.value = value;
        }
    });
});
