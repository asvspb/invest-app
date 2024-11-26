function calculate() {
    const initial = parseFloat(document.querySelector('.invest-bank #initial').value);
    const period = parseFloat(document.querySelector('.invest-bank #period').value);
    const rate = parseFloat(document.querySelector('.invest-bank #rate').value);
    const reinvest = document.querySelector('.invest-bank #reinvest').checked;

    if (!initial || !period || !rate) {
        return;
    }

    const yearlyRate = rate / 100;
    let totalProfit;
    let total;

    if (reinvest) {
        total = initial * Math.pow(1 + yearlyRate, period);
        totalProfit = total - initial;
    } else {
        const yearlyProfit = initial * yearlyRate;
        totalProfit = yearlyProfit * period;
        total = initial + totalProfit;
    }

    const monthlyProfit = totalProfit / (period * 12);
    const yearlyProfit = totalProfit / period;

    document.querySelector('.invest-bank #profit').textContent = totalProfit.toLocaleString('ru-RU') + ' ₽';
    document.querySelector('.invest-bank #monthlyProfit').textContent = monthlyProfit.toLocaleString('ru-RU') + ' ₽';
    document.querySelector('.invest-bank #yearlyProfit').textContent = yearlyProfit.toLocaleString('ru-RU') + ' ₽';
    document.querySelector('.invest-bank #total').textContent = total.toLocaleString('ru-RU') + ' ₽';
}
