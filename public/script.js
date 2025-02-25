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
function calculateBankProfit() {
    const initialAmountInput = document.getElementById('amount');
    const periodInput = document.getElementById('period');
    const annualPercentInput = document.getElementById('percent');
    const monthlyDepositInput = document.getElementById('monthly-deposit');

    const initialAmount = parseFormattedNumber(initialAmountInput.value);
    const period = parseInt(periodInput.value);
    const annualPercent = parseFloat(annualPercentInput.value);
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
    const monthlyPercent = annualPercent / 12 / 100;

    let calculationDetails = '';

    for (let i = 1; i <= period; i++) {
        const monthProfit = totalAmount * monthlyPercent;
        totalProfit += monthProfit;

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
        if (showHow && monthlyDeposit > 0) {
            calculationDetails += `Пополнение: ${formatDecimal(monthlyDeposit)} ₽<br>`;
        }

        if (showHow) {
            calculationDetails += `Итого на конец месяца: ${formatDecimal(totalAmount)} ₽</p><br>`;
        }
    }

    const yearlyProfit = (totalProfit / period) * 12;
    const monthlyProfit = totalProfit / period;

    document.getElementById('profit').textContent = formatNumber(totalProfit) + ' ₽';
    document.getElementById('monthlyProfit').textContent = formatNumber(monthlyProfit) + ' ₽';
    document.getElementById('yearlyProfit').textContent = formatNumber(yearlyProfit) + ' ₽';
    document.getElementById('total').textContent = formatNumber(totalAmount) + ' ₽';

    if (showHow) {
        showModal(calculationDetails);
    }
}

// Ретейл калькулятор
function calculateRetail() {
    const initialInput = document.getElementById('retail-initial');
    const periodInput = document.getElementById('retail-period');
    const profitInput = document.getElementById('retail-rate');

    const initial = parseFormattedNumber(initialInput.value);
    const period = parseInt(periodInput.value) || 0;
    const profit = parseFormattedNumber(profitInput.value);

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

    document.getElementById('retail-profit').textContent = formatNumber(yearlyProfit) + ' %';
    document.getElementById('retail-yearlyProfit').textContent = formatNumber(profit) + ' ₽';
    document.getElementById('retail-total').textContent = formatNumber(total) + ' ₽';
}

// Инициализация калькуляторов при загрузке страницы
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

    // Initialize other inputs with defaults
    const defaultInputs = [
        { id: 'period', value: '12' },
        { id: 'percent', value: '10' },
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
