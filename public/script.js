// Функция для форматирования чисел с пробелами между тысячами
function formatNumber(num) {
    return isNaN(num) ? '0' : Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
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

    const initialAmount = parseFloat(initialAmountInput.value);
    const period = parseInt(periodInput.value);
    const annualPercent = parseFloat(annualPercentInput.value);
    const isReinvest = document.getElementById('reinvest').checked;
    const monthlyDeposit = parseFloat(monthlyDepositInput.value) || 0;
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

    const initial = parseFloat(initialInput.value) || 0;
    const period = parseInt(periodInput.value) || 0;
    const profit = parseFloat(profitInput.value) || 0;

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
    calculate();
    calculateRetail();
});
