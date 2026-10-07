/* =====================================================
   BUDGETIN REPORT ANALYTICS
   Additive period analysis; reads existing transaction storage only.
===================================================== */
(function () {
    "use strict";
    const $ = id => document.getElementById(id);
    const money = value => typeof formatRupiah === "function" ? formatRupiah(value) : `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
    const raw = () => typeof readStorageArray === "function" ? readStorageArray("budgetin_transactions") : [];
    const day = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate()); };
    const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const escape = value => { const span = document.createElement("span"); span.textContent = String(value); return span.innerHTML; };

    function range() {
        const now = new Date(), mode = $("reportPeriod") ? $("reportPeriod").value : "this-month";
        let start, end;
        if (mode === "custom") {
            start = day($("reportStartDate") ? $("reportStartDate").value : null);
            end = day($("reportEndDate") ? $("reportEndDate").value : null);
            return start && end && start <= end ? { start, end, mode } : null;
        }
        if (mode === "last-month") {
            start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            end = new Date(now.getFullYear(), now.getMonth(), 0);
        } else if (mode === "3-months") {
            start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        } else if (mode === "6-months") {
            start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        } else if (mode === "this-year") {
            start = new Date(now.getFullYear(), 0, 1);
            end = new Date(now.getFullYear(), 11, 31);
        } else {
            // "this-month" default: covers entire current month
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }
        return { start, end, mode };
    }

    function previous(current) {
        if (!current) return null;
        const mode = current.mode || ($("reportPeriod") ? $("reportPeriod").value : "this-month");
        if (mode === "this-month") {
            // Full calendar previous month
            const start = new Date(current.start.getFullYear(), current.start.getMonth() - 1, 1);
            const end = new Date(current.start.getFullYear(), current.start.getMonth(), 0);
            return { start, end };
        }
        if (mode === "last-month") {
            // 2 months ago
            const start = new Date(current.start.getFullYear(), current.start.getMonth() - 1, 1);
            const end = new Date(current.start.getFullYear(), current.start.getMonth(), 0);
            return { start, end };
        }
        if (mode === "3-months") {
            const start = new Date(current.start.getFullYear(), current.start.getMonth() - 3, 1);
            const end = new Date(current.start.getFullYear(), current.start.getMonth(), 0);
            return { start, end };
        }
        if (mode === "6-months") {
            const start = new Date(current.start.getFullYear(), current.start.getMonth() - 6, 1);
            const end = new Date(current.start.getFullYear(), current.start.getMonth(), 0);
            return { start, end };
        }
        if (mode === "this-year") {
            const start = new Date(current.start.getFullYear() - 1, 0, 1);
            const end = new Date(current.start.getFullYear() - 1, 11, 31);
            return { start, end };
        }
        // Custom date range: shift backward by duration in days
        const duration = Math.round((current.end - current.start) / 86400000) + 1;
        const end = new Date(current.start);
        end.setDate(end.getDate() - 1);
        const start = new Date(end);
        start.setDate(start.getDate() - duration + 1);
        return { start, end };
    }

    function portfolioTotal() {
        const investments = typeof readStorageArray === "function" ? readStorageArray("budgetin_investments") : [];
        return investments.reduce((sum, investment) => {
            return sum + (typeof getInvestmentCurrentValue === "function" ? getInvestmentCurrentValue(investment) : (Number(investment.quantity) || 0) * (Number(investment.currentPrice) || Number(investment.buyPrice) || 0));
        }, 0);
    }

    function change(current, prior) {
        if (!prior && !current) return { text: "Stabil", kind: "neutral" };
        if (!prior || prior === 0) return current === 0 ? { text: "Stabil", kind: "neutral" } : { text: "↑ Data baru", kind: "up" };
        const percent = (current - prior) / prior * 100;
        if (Math.abs(percent) < 1) return { text: "• Stabil dibanding periode sebelumnya", kind: "neutral" };
        return {
            text: `${percent > 0 ? "↑" : "↓"} ${Math.abs(percent).toLocaleString("id-ID", { maximumFractionDigits: 1 })}% dibanding periode sebelumnya`,
            kind: percent > 0 ? "up" : "down"
        };
    }

    function setChange(id, current, prior) {
        const result = change(current, prior);
        const element = $(id);
        if (element) {
            element.textContent = result.text;
            element.className = `report-change ${result.kind}`;
        }
    }

    function renderChart(data) {
        const categories = (data && data.categories) || {};
        const labels = Object.keys(categories);
        const amounts = Object.values(categories);
        const empty = $("expenseChartEmpty");
        const canvas = $("expenseReportChart");
        const chart = window.expenseChart || (typeof expenseChart !== "undefined" ? expenseChart : null);

        if (empty) empty.hidden = amounts.length > 0;
        if (canvas && canvas.parentElement) canvas.parentElement.hidden = amounts.length === 0;

        if (!chart) return;
        chart.data.labels = labels;
        chart.data.datasets[0].data = amounts;
        chart.data.datasets[0].backgroundColor = [
            "#e85d4a", "#e9a23b", "#36a576", "#5684d6", "#8c6bd1", "#de6eaa", "#6b859d"
        ];
        chart.update();
    }

    function renderCategories(data, prior) {
        const categories = (data && data.categories) || {};
        const priorCategories = (prior && prior.categories) || {};
        const rows = Object.entries(categories).sort((a, b) => b[1] - a[1]);
        const total = (data && data.expense) || 0;

        if ($("topExpenseCategory")) {
            $("topExpenseCategory").textContent = rows.length
                ? `${rows[0][0]} • ${money(rows[0][1])} (${total ? Math.round(rows[0][1] / total * 100) : 0}%)`
                : "Belum ada pengeluaran pada periode ini.";
        }

        if ($("expenseCategoryDetails")) {
            $("expenseCategoryDetails").innerHTML = rows.map(([name, amount]) =>
                `<div><span>${escape(name)}</span><strong>${money(amount)}</strong><small>${total ? Math.round(amount / total * 100) : 0}% dari total</small></div>`
            ).join("");
        }

        const all = new Set([...Object.keys(categories), ...Object.keys(priorCategories)]);
        const compared = [...all].map(name => ({
            name,
            current: categories[name] || 0,
            prior: priorCategories[name] || 0
        })).sort((a, b) => Math.abs(b.current - b.prior) - Math.abs(a.current - a.prior) || b.current - a.current);

        if ($("expenseComparison")) {
            $("expenseComparison").innerHTML = compared.length
                ? compared.map(item => {
                    const result = change(item.current, item.prior);
                    return `<article><strong>${escape(item.name)}</strong><span>Periode ini: ${money(item.current)} · Sebelumnya: ${money(item.prior)}</span><b class="${result.kind}">${result.text}</b></article>`;
                }).join("")
                : "<div class=\"report-empty-state\">Belum ada pengeluaran untuk dibandingkan.</div>";
        }
    }

    function update() {
        const current = range();
        const custom = $("reportPeriod") && $("reportPeriod").value === "custom";
        if ($("customReportDates")) $("customReportDates").hidden = !custom;
        const legacyMonth = $("reportMonth");
        if (legacyMonth) {
            const container = legacyMonth.closest("select") || legacyMonth;
            container.hidden = true;
        }

        if (!current) {
            if ($("expenseChartEmpty")) {
                $("expenseChartEmpty").hidden = false;
                $("expenseChartEmpty").textContent = "Pilih tanggal mulai dan akhir yang valid.";
            }
            return;
        }

        const category = $("reportCategory") ? $("reportCategory").value : "";
        const priorPeriod = previous(current);

        const currentSummary = window.BudgetinCashFlow ? window.BudgetinCashFlow.calculatePeriod({
            start: current.start,
            end: current.end,
            category
        }) : { income: 0, expense: 0, investmentBuy: 0, investmentSell: 0, netCashFlow: 0, categories: {} };

        const priorSummary = window.BudgetinCashFlow ? window.BudgetinCashFlow.calculatePeriod({
            start: priorPeriod.start,
            end: priorPeriod.end,
            category
        }) : { income: 0, expense: 0, investmentBuy: 0, investmentSell: 0, netCashFlow: 0, categories: {} };

        // Card 3 displays current portfolio valuation (wealth), but is NEVER subtracted from Cash Flow
        const currentPortfolioValue = portfolioTotal();

        if ($("reportIncome")) $("reportIncome").textContent = money(currentSummary.income);
        if ($("reportExpense")) $("reportExpense").textContent = money(currentSummary.expense);
        if ($("reportInvestment")) $("reportInvestment").textContent = money(currentPortfolioValue);
        if ($("reportBalance")) $("reportBalance").textContent = money(currentSummary.netCashFlow);
        if ($("reportNetCashFlow")) $("reportNetCashFlow").textContent = money(currentSummary.netCashFlow);
        if ($("reportSavingsRate")) {
            $("reportSavingsRate").textContent = currentSummary.income
                ? `${((currentSummary.netCashFlow / currentSummary.income) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`
                : "Belum tersedia";
        }

        setChange("reportIncomeChange", currentSummary.income, priorSummary.income);
        setChange("reportExpenseChange", currentSummary.expense, priorSummary.expense);
        if ($("reportInvestmentChange")) {
            $("reportInvestmentChange").textContent = "Nilai portfolio saat ini";
            $("reportInvestmentChange").className = "report-change neutral";
        }
        setChange("reportBalanceChange", currentSummary.netCashFlow, priorSummary.netCashFlow);

        renderChart({ categories: currentSummary.categories, expense: currentSummary.expense });
        renderCategories(
            { categories: currentSummary.categories, expense: currentSummary.expense },
            { categories: priorSummary.categories, expense: priorSummary.expense }
        );
    }

    ["reportPeriod", "reportCategory", "reportStartDate", "reportEndDate"].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener("change", update);
    });

    document.addEventListener("DOMContentLoaded", () => {
        const now = new Date();
        if ($("reportStartDate") && !$("reportStartDate").value) $("reportStartDate").value = key(new Date(now.getFullYear(), now.getMonth(), 1));
        if ($("reportEndDate") && !$("reportEndDate").value) $("reportEndDate").value = key(now);
        if (typeof populateReportCategories === "function") populateReportCategories();
        update();
    });

    window.addEventListener("budgetin:marketpricechange", update);
    window.addEventListener("budgetin:datachange", () => {
        if (typeof populateReportCategories === "function") populateReportCategories();
        update();
    });

    window.BudgetinReportAnalytics = { getCurrentRange: range, update, previous };
})();
