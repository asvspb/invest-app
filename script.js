// Функция для форматирования чисел с пробелами между тысячами
function formatNumber(num) {
    return isNaN(num) ? '0' : Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
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

// Функция для форматирования чисел с двумя десятичными знаками
function formatDecimal(num) {
    return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// Банковский калькулятор
function calculateBankProfit() {
    const initialAmount = parseFloat(document.getElementById('amount').value);
    const period = parseInt(document.getElementById('period').value);
    const annualPercent = parseFloat(document.getElementById('percent').value);
    const isReinvest = document.getElementById('reinvest').checked;
    const monthlyDeposit = parseFloat(document.getElementById('monthly-deposit').value) || 0;
    const showHow = document.getElementById('show-how').checked;

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
            calculationDetails += `Итого на конец месяца: ${formatDecimal(totalAmount)} ₽</p>`;
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
    const initial = parseFloat(document.getElementById('retail-initial').value) || 0;
    const period = parseInt(document.getElementById('retail-period').value) || 0;
    const profit = parseFloat(document.getElementById('retail-rate').value) || 0;

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
