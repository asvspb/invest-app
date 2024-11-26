// Функция для форматирования чисел с пробелами между тысячами
function formatNumber(num) {
    return isNaN(num) ? '0' : Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// Банковский калькулятор
function calculate() {
    const initial = parseFloat(document.getElementById('initial').value) || 0;
    const periodMonths = parseInt(document.getElementById('period').value) || 0;
    const rate = (parseFloat(document.getElementById('rate').value) || 0) / 100;
    const reinvest = document.getElementById('reinvest').checked;

    let total, profit, monthlyProfit, yearlyProfit;

    if (initial > 0 && periodMonths > 0 && rate > 0) {
        const periodYears = periodMonths / 12;
        if (reinvest) {
            total = initial * Math.pow((1 + rate), periodYears);
            profit = total - initial;
        } else {
            yearlyProfit = initial * rate;
            total = initial + (yearlyProfit * periodYears);
            profit = total - initial;
        }

        monthlyProfit = profit / periodMonths;
        yearlyProfit = profit / periodYears;
    } else {
        total = profit = monthlyProfit = yearlyProfit = 0;
    }

    document.getElementById('profit').textContent = formatNumber(profit) + ' ₽';
    document.getElementById('monthlyProfit').textContent = formatNumber(monthlyProfit) + ' ₽';
    document.getElementById('yearlyProfit').textContent = formatNumber(yearlyProfit) + ' ₽';
    document.getElementById('total').textContent = formatNumber(total) + ' ₽';
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
