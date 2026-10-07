// ========================================
// BUDGETIN - APP.JS
// ========================================


// ========================================
// DATA & SECURITY HELPERS
// ========================================

function readStorageArray(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return Array.isArray(value) ? value : [];
    } catch (error) {
        console.warn(`Data ${key} tidak dapat dibaca dan diabaikan.`, error);
        return [];
    }
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    }[character]));
}

function normalizeBankId(value) {
    if (value === null || value === undefined || value === "") return null;
    const normalized = String(value).trim();
    return normalized || null;
}

function findBankById(banksList, searchId) {
    const target = normalizeBankId(searchId);
    if (!target || !Array.isArray(banksList)) return null;

    const exact = banksList.find(b => {
        if (!b) return false;
        return normalizeBankId(b.id) === target ||
               normalizeBankId(b.mysql_id) === target ||
               normalizeBankId(b.legacy_id) === target;
    });
    if (exact) return exact;

    const targetNum = Number(target);
    if (!Number.isNaN(targetNum)) {
        return banksList.find(b => {
            if (!b) return false;
            return Number(b.id) === targetNum ||
                   Number(b.mysql_id) === targetNum;
        }) || null;
    }

    return null;
}

if (typeof window !== "undefined") {
    window.BudgetinNormalizeBankId = normalizeBankId;
    window.BudgetinFindBankById = findBankById;
}

let goals = readStorageArray("budgetin_goals");
let banks = readStorageArray("budgetin_banks");
let transactions = readStorageArray("budgetin_transactions");
let investments = readStorageArray("budgetin_investments");

// ========================================
// INVESTMENT DATA
// ========================================

// ========================================
// MODAL INVESTASI
// ========================================

function openInvestmentModal() {

    const modal =
        document.getElementById("investmentModal");

    if (!modal) {
        return;
    }

    renderInvestmentBankOptions();

    modal.style.display = "flex";

}

function updateInvestmentType() {

    const type =
        document.getElementById("investmentType").value;

    const assetLabel =
        document.getElementById("investmentAssetLabel");

    const assetInput =
        document.getElementById("investmentAsset");

    const quantityLabel =
        document.getElementById("investmentQuantityLabel");

    const unit =
        document.getElementById("investmentUnit");


    // SAHAM
    if (type === "stock") {

        assetLabel.textContent = "Kode Saham";

        assetInput.placeholder = "Contoh: BBCA";

        quantityLabel.textContent = "Jumlah Saham";

        unit.innerHTML = '<option value="share">Lembar</option><option value="lot">Lot</option>';

    }


    // EMAS
    if (type === "gold") {

        assetLabel.textContent = "Jenis Emas";

        assetInput.placeholder = "Contoh: Emas Antam";

        quantityLabel.textContent = "Berat Emas";

        unit.innerHTML = '<option value="gram">Gram</option>';

    }


    // OBLIGASI
    if (type === "bond") {

        assetLabel.textContent = "Nama Obligasi";

        assetInput.placeholder = "Contoh: ORI025";

        quantityLabel.textContent = "Jumlah";

        unit.innerHTML = '<option value="unit">Unit</option>';

    }

}


function closeInvestmentModal() {

    const modal =
        document.getElementById("investmentModal");

    if (!modal) {
        return;
    }

    modal.style.display = "none";

}

function saveInvestments() {

    localStorage.setItem(
        "budgetin_investments",
        JSON.stringify(investments)
    );

}


// ========================================
// TOTAL NILAI INVESTASI
// ========================================

function getTotalInvestmentValue() {

    return investments.reduce(
        (total, investment) => {

            return total +
                calculateInvestmentValue(investment);

        },
        0
    );

}

// ========================================
// TOTAL PROFIT / LOSS
// ========================================

function getTotalInvestmentProfitLoss() {

    return investments.reduce(
        (total, investment) => {

            const currentValue =
                calculateInvestmentValue(investment);

            const buyValue = window.BudgetinMarket?.calculateCostBasis
                ? window.BudgetinMarket.calculateCostBasis(investment)
                : (Number(investment.quantity) || 0) * (Number(investment.buyPrice) || 0);

            return total +
                (currentValue - buyValue);

        },
        0
    );

}

// ========================================
// UPDATE INVESTMENT SUMMARY
// ========================================

function updateInvestmentSummary() {

    const totalValue =
        getTotalInvestmentValue();

    const profitLoss =
        getTotalInvestmentProfitLoss();

    const capital =
        totalValue - profitLoss;


    const totalElement =
        document.getElementById("totalInvestment");

    const capitalElement =
        document.getElementById("investmentCapital");

    const profitElement =
        document.getElementById("investmentProfit");


    if (totalElement) {

        totalElement.textContent =
            formatRupiah(totalValue);

    }


    if (capitalElement) {

        capitalElement.textContent =
            formatRupiah(capital);

    }


    if (profitElement) {

        profitElement.textContent =
            formatRupiah(profitLoss);

    }

}

// ========================================
// HITUNG NILAI INVESTASI
// ========================================

// Shared current-value helper for portfolio and financial reports.
// Existing records without currentPrice safely fall back to buyPrice.
function getInvestmentCurrentValue(investment) {

    if (window.BudgetinMarket && typeof window.BudgetinMarket.calculatePosition === "function") {
        return window.BudgetinMarket.calculatePosition(investment).marketValue;
    }

    return window.BudgetinMarket?.calculateCurrentValue
        ? window.BudgetinMarket.calculateCurrentValue(investment)
        : (Number(investment.quantity) || 0) * (Number(investment.currentPrice) || Number(investment.buyPrice) || 0);

}

function calculateInvestmentValue(investment) {

    return getInvestmentCurrentValue(investment);

}

// ========================================
// TOTAL PEMBELIAN INVESTASI (HARGA DIISI PENGGUNA)
// ========================================

function updateInvestmentPrice() {
    const quantity =
        Number(
            document.getElementById("investmentQuantity")?.value
        ) || 0;

    const currentPrice =
        Number(
            document.getElementById("investmentCurrentPrice")?.value
        ) || 0;

    const valueElement =
        document.getElementById("investmentEstimatedValue");

    if (!valueElement) {
        return;
    }

    const type = document.getElementById("investmentType")?.value;
    const unit = document.getElementById("investmentUnit")?.value;
    const pricingQuantity = type === "stock" && unit === "lot" ? quantity * 100 : quantity;
    const estimatedValue = pricingQuantity * currentPrice;

    valueElement.textContent =
        formatRupiah(estimatedValue);

}

// ========================================
// SIMPAN INVESTASI
// ========================================

function saveInvestment() {

    const type =
        document.getElementById("investmentType").value;

    const asset =
        document.getElementById("investmentAsset").value
            .trim()
            .toUpperCase();

    const quantity =
        Number(
            document.getElementById("investmentQuantity").value
        ) || 0;

    const currentPrice =
        Number(
            document.getElementById("investmentCurrentPrice").value
        ) || 0;

    const inputUnit = document.getElementById("investmentUnit")?.value || (type === "stock" ? "share" : type === "gold" ? "gram" : "unit");
    // Stock holdings are persisted canonically as shares. inputUnit is retained
    // only as entry metadata; it never creates a fractional-lot holding.
    const unit = type === "stock" ? "share" : inputUnit;

    const bankId =
        document.getElementById("investmentBank").value;


    // ==============================
    // VALIDASI
    // ==============================

    if (!asset) {

        alert("Isi nama atau kode investasi dulu.");

        return;

    }


    if (quantity <= 0) {

        alert("Jumlah investasi harus lebih dari 0.");

        return;

    }


    if (!bankId) {

        alert("Pilih rekening sumber dana.");

        return;

    }


    // ==============================
    if (currentPrice <= 0) {

        alert(
            "Masukkan harga beli per unit yang lebih dari 0."
        );

        return;

    }


    // ==============================
    // HITUNG TOTAL BELI
    // ==============================

    const pricingQuantity = type === "stock" && inputUnit === "lot" ? quantity * 100 : quantity;
    const totalPurchase = pricingQuantity * currentPrice;


    // ==============================
    // CARI REKENING
    // ==============================

    const bank =
        banks.find(
            b =>
                Number(b.id) ===
                Number(bankId)
        );


    if (!bank) {

        alert("Rekening tidak ditemukan.");

        return;

    }


    // ==============================
    // CEK SALDO
    // ==============================

    if (
        Number(bank.balance) <
        totalPurchase
    ) {

        alert(
            `Saldo ${bank.name} tidak cukup.\n\n` +
            `Butuh: ${formatRupiah(totalPurchase)}\n` +
            `Saldo: ${formatRupiah(bank.balance)}`
        );

        return;

    }


    // ==============================
    // KURANGI SALDO REKENING
    // ==============================

    bank.balance -=
        totalPurchase;


    // ==============================
    // BUAT INVESTASI
    // ==============================

    const investment = {

        id: Date.now(),

        type: type,

        asset: asset,

        quantity: type === "stock" ? pricingQuantity : quantity,

        unit: unit,

        inputUnit: inputUnit,

        shares: type === "stock" ? pricingQuantity : undefined,

        lots: type === "stock" ? pricingQuantity / 100 : undefined,

        buyPrice: currentPrice,

        currentPrice: currentPrice,

        costBasis: totalPurchase,

        remainingCostBasis: totalPurchase,

        bankId: Number(bankId),

        createdAt: new Date().toISOString()

    };


    // Add to the same holding when the asset and unit match. This preserves a
    // weighted average cost instead of replacing the earlier purchase price.
    const existingHolding = investments.find(item =>
        item.type === type && item.asset === asset &&
        (type === "stock" || (window.BudgetinMarket?.normalizeInvestment ? window.BudgetinMarket.normalizeInvestment(item).unit : item.unit) === unit)
    );

    if (existingHolding) {
        const oldCost = window.BudgetinMarket?.calculateCostBasis
            ? window.BudgetinMarket.calculateCostBasis(existingHolding)
            : (Number.isFinite(Number(existingHolding.remainingCostBasis ?? existingHolding.costBasis)) && Number(existingHolding.remainingCostBasis ?? existingHolding.costBasis) >= 0
                ? Number(existingHolding.remainingCostBasis ?? existingHolding.costBasis)
                : Number(existingHolding.quantity) * Number(existingHolding.buyPrice));

        if (type === "stock") {
            const oldShares = window.BudgetinMarket?.getStockShares
                ? window.BudgetinMarket.getStockShares(existingHolding)
                : (Number(existingHolding.shares) > 0
                    ? Number(existingHolding.shares)
                    : (String(existingHolding.unit || "").toLowerCase() === "lot"
                        ? (Number(existingHolding.quantity) || 0) * 100
                        : (Number(existingHolding.quantity) || 0)));

            const newSharesTotal = oldShares + pricingQuantity;
            const newCostBasis = oldCost + totalPurchase;

            existingHolding.unit = "share";
            existingHolding.quantity = newSharesTotal;
            existingHolding.shares = newSharesTotal;
            existingHolding.lots = newSharesTotal / 100;
            existingHolding.costBasis = newCostBasis;
            existingHolding.remainingCostBasis = newCostBasis;
            existingHolding.buyPrice = newSharesTotal > 0 ? newCostBasis / newSharesTotal : currentPrice;
            if (!(Number(existingHolding.currentPrice) > 0)) existingHolding.currentPrice = currentPrice;
        } else {
            const oldPricingQuantity = window.BudgetinMarket?.calculatePosition
                ? window.BudgetinMarket.calculatePosition(existingHolding).pricingQuantity
                : Number(existingHolding.quantity);
            existingHolding.quantity = Number(existingHolding.quantity) + quantity;
            existingHolding.costBasis = oldCost + totalPurchase;
            existingHolding.remainingCostBasis = existingHolding.costBasis;
            const newPricingQuantity = oldPricingQuantity + pricingQuantity;
            existingHolding.buyPrice = newPricingQuantity ? existingHolding.costBasis / newPricingQuantity : currentPrice;
            if (!(Number(existingHolding.currentPrice) > 0)) existingHolding.currentPrice = currentPrice;
        }
    } else {
        investments.push(investment);
    }

    const investmentHistory = readStorageArray("budgetin_investment_transactions");
    investmentHistory.push({ id: Date.now() + 1, type: "buy", asset, symbol: asset, investmentId: existingHolding?.id || investment.id, date: investment.createdAt, quantity, unit, pricingQuantity, price: currentPrice, total: totalPurchase, costBasis: totalPurchase, bankId: Number(bankId) });
    localStorage.setItem("budgetin_investment_transactions", JSON.stringify(investmentHistory));


    // ==============================
    // SIMPAN DATA
    // ==============================

    saveInvestments();

    renderInvestmentPortfolio();

    closeInvestmentModal();


    localStorage.setItem(
        "budgetin_banks",
        JSON.stringify(banks)
    );


    // ==============================
    // REFRESH PORTFOLIO
    // ==============================

    renderInvestmentPortfolio();


    // ==============================
    // TUTUP MODAL
    // ==============================

    closeInvestmentModal();


    // ==============================
    // RESET FORM
    // ==============================

    document.getElementById(
        "investmentAsset"
    ).value = "";

    document.getElementById(
        "investmentQuantity"
    ).value = "";

    document.getElementById(
        "investmentCurrentPrice"
    ).value = "";

    document.getElementById(
        "investmentEstimatedValue"
    ).textContent = "Rp0";


    alert(
        `${asset} berhasil ditambahkan ke portfolio 🚀`
    );

    updateInvestmentSummary();
    updateBalance();
    window.dispatchEvent(new CustomEvent("budgetin:datachange"));

}

// ========================================
// RENDER PORTFOLIO
// ========================================

// ========================================
// RENDER PORTFOLIO
// ========================================

function renderInvestmentPortfolio() {

    const container =
        document.getElementById("investmentPortfolio");

    if (!container) {
        console.log("investmentPortfolio tidak ditemukan");
        return;
    }


    // BELUM ADA INVESTASI
    if (investments.length === 0) {

        container.innerHTML = `
            <div class="investment-empty">

                <div class="investment-empty-icon">
                    📊
                </div>

                <strong>Belum ada investasi</strong>

                <p>
                    Yuk mulai bangun portfolio lu 🚀
                </p>

            </div>
        `;

        return;
    }


    // ADA INVESTASI
    container.innerHTML = "";


    investments.forEach(function (investment) {

        const value =
            calculateInvestmentValue(investment);

        const position = window.BudgetinMarket && typeof window.BudgetinMarket.calculatePosition === "function"
            ? window.BudgetinMarket.calculatePosition(investment)
            : null;


        let icon = "📊";
        let unitText = "";


        // SAHAM
        if (investment.type === "stock") {

            icon = "📈";

            const normalized = window.BudgetinMarket?.normalizeInvestment ? window.BudgetinMarket.normalizeInvestment(investment) : investment;
            const wholeLots = Number.isInteger(normalized.shares / 100);
            unitText = wholeLots && normalized.shares >= 100
                ? `${normalized.shares / 100} Lot · ${normalized.shares} Lembar`
                : `${normalized.shares} Lembar`;

        }


        // EMAS
        else if (investment.type === "gold") {

            icon = "🪙";

            unitText =
                `${investment.quantity} Gram`;

        }


        // OBLIGASI
        else if (investment.type === "bond") {

            icon = "🏦";

            unitText =
                `${investment.quantity} Unit`;

        }


        const card =
            document.createElement("div");


        card.className =
            "investment-card";


        card.innerHTML = `

            <div class="investment-icon">
                ${icon}
            </div>


            <div class="investment-info">

                <strong>
                    ${escapeHtml(investment.asset || "Investasi")}
                </strong>

                <small>
                    ${unitText}
                </small>

            </div>


            <div class="investment-value">

                <strong>
                    ${formatRupiah(value)}
                </strong>

                <small>
                    Nilai pasar saat ini
                </small>

            </div>

            ${position ? `
                <div class="investment-market-detail">
                    <small>Harga beli ${formatRupiah(position.averageCost || position.costPrice)}${position.type === "stock" ? "/lembar" : position.type === "gold" ? "/gram" : ""} · Harga pasar ${position.marketPrice ? formatRupiah(position.marketPrice) : "Tidak tersedia"}${position.type === "stock" ? "/lembar" : position.type === "gold" ? "/gram" : ""}</small>
                    <strong class="${position.unrealizedPnL === null ? "" : position.unrealizedPnL >= 0 ? "positive" : "negative"}">${position.unrealizedPnL === null ? "Market price belum tersedia" : `${position.unrealizedPnL >= 0 ? "+" : "-"}${formatRupiah(Math.abs(position.unrealizedPnL))} · ${position.returnPercent >= 0 ? "+" : ""}${position.returnPercent.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`}</strong>
                    <small>${position.priceUpdatedAt ? `Harga terakhir: ${new Date(position.priceUpdatedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}` : position.marketPrice ? "Menggunakan harga terakhir yang tersimpan." : "Menggunakan harga pembelian terakhir."}</small>
                </div>
            ` : ""}

            <button type="button" class="investment-sell-btn" onclick="openSellInvestmentModal(${Number(investment.id)})">Jual aset</button>

        `;


        container.appendChild(card);

    });

}

// ========================================
// FORMAT RUPIAH
// ========================================

function formatRupiah(number) {

    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(Number(number) || 0);

}


// ========================================
// FILTER TRANSAKSI
// ========================================

let transactionFilter = {
    startDate: "",
    endDate: "",
    category: ""
};

// ========================================
// FORMAT TANGGAL TRANSAKSI
// ========================================

function getTransactionDateKey(transaction) {

    const date = new Date(transaction.date);

    const year =
        date.getFullYear();

    const month =
        String(date.getMonth() + 1)
            .padStart(2, "0");

    const day =
        String(date.getDate())
            .padStart(2, "0");

    return `${year}-${month}-${day}`;

}


// ========================================
// MODAL TARGET
// ========================================

function openModal() {

    const modal =
        document.getElementById("goalModal");

    if (!modal) {
        return;
    }

    renderGoalBankOptions();

    modal.style.display = "flex";

}


function closeModal() {

    const modal =
        document.getElementById("goalModal");

    if (modal) {
        modal.style.display = "none";
    }

}


// ========================================
// DROPDOWN BANK TARGET
// ========================================

function renderGoalBankOptions() {

    const select =
        document.getElementById("goalBank");

    if (!select) {
        return;
    }

    select.innerHTML = `
        <option value="">
            Pilih Rekening
        </option>
    `;

    banks.forEach(bank => {

        if (bank.active === false) {
            return;
        }

        const option =
            document.createElement("option");

        option.value =
            bank.id;

        option.textContent =
            `${bank.name} - ${formatRupiah(bank.balance)}`;

        select.appendChild(option);

    });

}


// ========================================
// SIMPAN TARGET
// ========================================

function saveGoal() {

    const name =
        document
            .getElementById("goalName")
            .value
            .trim();

    const rawBankValue =
        document
            .getElementById("goalBank")
            ?.value || "";

    const bankId =
        normalizeBankId(rawBankValue);

    const target =
        Number(
            document
                .getElementById("goalTarget")
                .value
        );

    const current =
        Number(
            document
                .getElementById("goalCurrent")
                .value
        ) || 0;

    const date =
        document
            .getElementById("goalDate")
            .value;

    const monthlyContribution =
        Number(
            document
                .getElementById("goalMonthlyContribution")
                .value
        ) || 0;


    // VALIDASI

    if (!name) {

        alert(
            "Nama target wajib diisi."
        );

        return;
    }


    if (!bankId) {

        alert(
            "Pilih rekening terlebih dahulu."
        );

        return;
    }


    if (!target || target <= 0) {

        alert(
            "Target nominal tidak valid."
        );

        return;
    }


    if (!date) {

        alert(
            "Tanggal target wajib diisi."
        );

        return;
    }


    const bank =
        findBankById(banks, bankId);


    if (!bank) {

        alert(
            "Rekening tidak ditemukan."
        );

        return;
    }


    // SETORAN AWAL TIDAK BOLEH
    // MELEBIHI SALDO BANK

    if (current > bank.balance) {

        alert(
            "Saldo rekening tidak cukup!\n\n" +
            "Saldo tersedia: " +
            formatRupiah(bank.balance)
        );

        return;
    }


    const goal = {

        id: Date.now(),

        name: name,

        bankId: bank.id,

        bank: bank.name,

        target: target,

        current: current,

        date: date,

        monthlyContribution: monthlyContribution,

        deposits: []

    };


    // CATAT SETORAN AWAL

    if (current > 0) {

        goal.deposits.push({

            id:
                Date.now() + 1,

            amount:
                current,

            date:
                new Date().toISOString()

        });


        // KURANGI SALDO BANK

        bank.balance -=
            current;

    }


    goals.push(goal);


    localStorage.setItem(
        "budgetin_goals",
        JSON.stringify(goals)
    );


    localStorage.setItem(
        "budgetin_banks",
        JSON.stringify(banks)
    );


    // RESET FORM

    document.getElementById(
        "goalName"
    ).value = "";

    document.getElementById(
        "goalTarget"
    ).value = "";

    document.getElementById(
        "goalCurrent"
    ).value = "";

    document.getElementById(
        "goalDate"
    ).value = "";

    document.getElementById(
        "goalMonthlyContribution"
    ).value = "";


    closeModal();

    renderGoals();

    renderBanks();

    renderGoalBankOptions();

    updateBalance();

}


// ========================================
// RENDER TARGET
// ========================================

function renderGoals() {

    const goalList =
        document.getElementById("goalList");

    if (!goalList) {
        return;
    }

    goalList.innerHTML = "";

    if (goals.length === 0) {

        goalList.innerHTML = `
            <div class="empty-state">
                Belum ada target tabungan.
                <br>
                Yuk buat target pertama lu 🚀
            </div>
        `;

        return;
    }

    // Cek apakah sedang di HOME
    const isDashboard =
        document.querySelector(".dashboard-goals");

    goals.forEach(goal => {

        let progress = 0;

        if (goal.target > 0) {
            progress =
                (goal.current / goal.target) * 100;
        }

        progress =
            Math.min(progress, 100);

        const remainder = Math.max(0, Number(goal.target) - Number(goal.current));
        const monthlyContribution = Number(goal.monthlyContribution) || 0;
        const estimate = monthlyContribution > 0
            ? `· Estimasi ${Math.ceil(remainder / monthlyContribution)} bulan lagi`
            : "";


        const card =
            document.createElement("div");

        card.className = "goal-card";


        // ====================================
        // HOME — VERSI RINGKAS
        // ====================================

        if (isDashboard) {

            card.innerHTML = `

                <div class="goal-icon">
                    🎯
                </div>

                <div class="goal-content">

                    <div class="goal-header">

                        <strong>
                            ${escapeHtml(goal.name)}
                        </strong>

                        <span>
                            ${Math.round(progress)}%
                        </span>

                    </div>


                    <div class="progress">

                        <div
                            style="width: ${progress}%">
                        </div>

                    </div>


                    <p>
                        ${formatRupiah(goal.current)}

                        <span>
                            / ${formatRupiah(goal.target)}
                        </span>
                    </p>

                </div>
            `;

        }

        // ====================================
        // MENU TARGET — VERSI LENGKAP
        // ====================================

        else {

            card.innerHTML = `

                <div class="goal-icon">
                    🎯
                </div>

                <div class="goal-content">

                    <div class="goal-header">

                        <strong>
                            ${escapeHtml(goal.name)}
                        </strong>

                        <span>
                            ${Math.round(progress)}%
                        </span>

                    </div>


                    <div class="progress">

                        <div
                            style="width: ${progress}%">
                        </div>

                    </div>


                    <p>
                        ${formatRupiah(goal.current)}

                        <span>
                            / ${formatRupiah(goal.target)}
                        </span>
                    </p>


                    <small>
                        🏦 ${escapeHtml(goal.bank || "Belum dipilih")}
                        ${estimate}
                    </small>


                    <button
                        class="deposit-btn"
                        onclick="addDeposit(${goal.id})">

                        + Tambah Setoran

                    </button>


                    <button
                        class="detail-btn"
                        onclick="showGoalDetail(${goal.id})">

                        Lihat Detail

                    </button>


                    <button
                        class="delete-btn"
                        onclick="deleteGoal(${goal.id})">

                        🗑 Hapus Target

                    </button>

                </div>
            `;
        }


        goalList.appendChild(card);

    });

}


// ========================================
// TAMBAH SETORAN TARGET
// ========================================

function addDeposit(goalId) {

    const goal =
        goals.find(
            g =>
                Number(g.id) ===
                Number(goalId)
        );


    if (!goal) {

        alert(
            "Target tidak ditemukan."
        );

        return;
    }


    const bank =
        findBankById(banks, goal.bankId);


    if (!bank) {

        alert(
            "Rekening target tidak ditemukan."
        );

        return;
    }


    const input =
        prompt(
            "Masukkan nominal setoran:"
        );


    if (input === null) {
        return;
    }


    const deposit =
        Number(input);


    if (
        isNaN(deposit) ||
        deposit <= 0
    ) {

        alert(
            "Nominal setoran tidak valid."
        );

        return;
    }


    // CEK SALDO BANK

    if (
        deposit >
        Number(bank.balance)
    ) {

        alert(
            "Saldo rekening tidak cukup!\n\n" +
            "Saldo tersedia: " +
            formatRupiah(
                bank.balance
            )
        );

        return;
    }


    // CEK SISA TARGET

    const remaining =
        Number(goal.target) -
        Number(goal.current);


    if (
        deposit >
        remaining
    ) {

        alert(
            "Setoran melebihi sisa target!\n\n" +
            "Sisa target: " +
            formatRupiah(
                remaining
            )
        );

        return;
    }


    // KURANGI SALDO BANK

    bank.balance -=
        deposit;


    // TAMBAHKAN SETORAN

    if (!goal.deposits) {
        goal.deposits = [];
    }


    goal.deposits.push({

        id: Date.now(),

        amount:
            deposit,

        date:
            new Date().toISOString()

    });


    goal.current =
        Number(goal.current) +
        deposit;


    // SIMPAN

    localStorage.setItem(
        "budgetin_goals",
        JSON.stringify(goals)
    );


    localStorage.setItem(
        "budgetin_banks",
        JSON.stringify(banks)
    );


    // REFRESH

    renderGoals();

    renderBanks();

    renderGoalBankOptions();

    renderBankOptions();

    updateBalance();

    // Perbarui ringkasan finansial setelah setoran target mengubah saldo rekening.
    if (window.BudgetinFinance && typeof window.BudgetinFinance.refresh === "function") {
        window.BudgetinFinance.refresh();
    }


    alert(
        "Setoran berhasil!\n\n" +
        formatRupiah(deposit) +
        " masuk ke target " +
        goal.name
    );

}


// ========================================
// HAPUS TARGET
// ========================================

function deleteGoal(goalId) {

    const goal =
        goals.find(
            g =>
                Number(g.id) ===
                Number(goalId)
        );


    if (!goal) {
        return;
    }


    const confirmDelete =
        confirm(
            `Yakin mau menghapus target "${goal.name}"?\n\n` +
            `Saldo yang sudah dialokasikan akan dikembalikan ke rekening.`
        );


    if (!confirmDelete) {
        return;
    }


    // KEMBALIKAN DANA TARGET
    // KE REKENING

    const bank =
        findBankById(banks, goal.bankId);


    if (bank) {

        bank.balance +=
            Number(goal.current) || 0;

    }


    goals =
        goals.filter(
            g =>
                Number(g.id) !==
                Number(goalId)
        );


    localStorage.setItem(
        "budgetin_goals",
        JSON.stringify(goals)
    );


    localStorage.setItem(
        "budgetin_banks",
        JSON.stringify(banks)
    );


    renderGoals();

    renderBanks();

    updateBalance();


    alert(
        `Target "${goal.name}" berhasil dihapus.`
    );

}


// ========================================
// DETAIL TARGET
// ========================================

function showGoalDetail(goalId) {

    const goal =
        goals.find(
            g =>
                Number(g.id) ===
                Number(goalId)
        );


    if (!goal) {
        return;
    }


    if (!goal.deposits) {
        goal.deposits = [];
    }


    let progress = 0;


    if (
        Number(goal.target) > 0
    ) {

        progress =
            (
                Number(goal.current) /
                Number(goal.target)
            ) * 100;

    }


    progress =
        Math.min(
            progress,
            100
        );

    const remaining = Math.max(0, Number(goal.target) - Number(goal.current));
    const monthlyContribution = Number(goal.monthlyContribution) || 0;
    const achievementEstimate = monthlyContribution > 0
        ? `≈ ${Math.ceil(remaining / monthlyContribution)} bulan lagi`
        : "Tambahkan rencana kontribusi bulanan pada target baru";


    let historyHTML = "";


    if (
        goal.deposits.length === 0
    ) {

        historyHTML = `
            <p class="empty-history">
                Belum ada riwayat setoran.
            </p>
        `;

    } else {

        historyHTML =
            goal.deposits
                .slice()
                .reverse()
                .map(deposit => {

                    const date =
                        new Date(
                            deposit.date
                        );


                    return `

                        <div class="history-item">

                            <span>

                                ${date.toLocaleDateString(
                                    "id-ID",
                                    {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric"
                                    }
                                )}

                            </span>


                            <strong>

                                + ${formatRupiah(
                                    deposit.amount
                                )}

                            </strong>

                        </div>

                    `;

                })
                .join("");

    }


    const detailHTML = `

        <div class="detail-page">

            <button
                class="back-btn"
                onclick="closeDetail()">

                ← Kembali

            </button>


            <h2>
                ${escapeHtml(goal.name)}
            </h2>


            <div class="detail-balance">

                <small>
                    Saldo Saat Ini
                </small>

                <h1>
                    ${formatRupiah(
                        goal.current
                    )}
                </h1>

                <p>
                    dari ${formatRupiah(
                        goal.target
                    )}
                </p>

            </div>


            <div class="detail-progress">

                <div class="progress">

                    <div
                        style="width: ${progress}%">
                    </div>

                </div>

                <strong>
                    ${Math.round(progress)}%
                </strong>

            </div>


            <div class="detail-info">

                <p>
                    🏦 ${escapeHtml(goal.bank)}
                </p>

                <p>
                    📅 Target ${goal.date}
                </p>

                <p>
                    💰 Sisa ${formatRupiah(remaining)} · ${achievementEstimate}
                </p>

            </div>


            <button
                class="deposit-btn detail-deposit"
                onclick="addDeposit(${goal.id})">

                + Tambah Setoran

            </button>


            <h3>
                Riwayat Setoran
            </h3>


            <div class="history-list">

                ${historyHTML}

            </div>

        </div>
    `;


    const oldDetail =
        document.getElementById(
            "goalDetail"
        );


    if (oldDetail) {
        oldDetail.remove();
    }


    const detailContainer =
        document.createElement(
            "div"
        );


    detailContainer.id =
        "goalDetail";


    detailContainer.innerHTML =
        detailHTML;


    document.body.appendChild(
        detailContainer
    );

}


function closeDetail() {

    const detail =
        document.getElementById(
            "goalDetail"
        );


    if (detail) {
        detail.remove();
    }

}


// ========================================
// MODAL TRANSAKSI
// ========================================

function openTransactionModal() {

    const modal =
        document.getElementById("transactionModal");

    if (!modal) {
        return;
    }


    // Isi dropdown rekening
    renderBankOptions();


    // Pastikan mode tambah
    modal.removeAttribute("data-edit-id");
    modal.setAttribute("data-source", "manual");


    // Judul
    const title =
        modal.querySelector(".modal-header h2");

    if (title) {
        title.textContent = "Tambah Transaksi";
    }


    // Tombol simpan
    const saveButton =
        modal.querySelector(".save-btn");

    if (saveButton) {
        saveButton.textContent = "Simpan Transaksi";
    }


    // ==============================
    // RESET FORM
    // ==============================

    const type =
        document.getElementById("transactionType");

    const category =
        document.getElementById("transactionCategory");

    const description =
        document.getElementById("transactionDescription");

    const amount =
        document.getElementById("transactionAmount");

    const bank =
        document.getElementById("transactionBank");

    const date =
        document.getElementById("transactionDate");

    const note =
        document.getElementById("transactionNote");

    const paymentMethod =
        document.getElementById("transactionPaymentMethod");


    if (type) {
        type.value = "income";
    }

    if (category) {
        category.value = "";
    }

    if (description) {
        description.value = "";
    }

    if (amount) {
        amount.value = "";
    }

    if (bank) {
        bank.value = "";
    }

    if (date) {
        date.value = new Date().toISOString().slice(0, 10);
    }

    if (note) {
        note.value = "";
    }

    if (paymentMethod) {
        paymentMethod.value = "";
    }

    const scanDetails = document.getElementById("receiptScanDetails");
    const scanStatus = document.getElementById("receiptScanStatus");
    if (scanDetails) scanDetails.hidden = true;
    if (scanStatus) scanStatus.textContent = "";


    // ==============================
    // UPDATE KATEGORI
    // ==============================

    updateTransactionCategoryVisibility();


    // ==============================
    // BUKA MODAL
    // ==============================

    modal.style.display = "flex";
}

function updateTransactionCategoryVisibility() {

    const type =
        document.getElementById("transactionType");


    const wrappers =
        document.querySelectorAll(
            "#transactionCategoryWrapper"
        );


    const category =
        document.getElementById(
            "transactionCategory"
        );


    if (!type) {
        return;
    }


    const isExpense =
        type.value === "expense";


    wrappers.forEach(wrapper => {

        wrapper.style.display =
            isExpense
                ? "block"
                : "none";

    });


    if (!isExpense && category) {

        category.value = "";

    }

}

// ========================================
// JUAL INVESTASI (PARTIAL SELL SUPPORTED)
// ========================================

function openSellInvestmentModal(investmentId) {
    const investment = investments.find(item => Number(item.id) === Number(investmentId));
    if (!investment) return;
    const position = window.BudgetinMarket?.calculatePosition ? window.BudgetinMarket.calculatePosition(investment) : investment;
    const unitLabel = position.type === "stock" ? "Lembar" : position.unit === "gram" ? "Gram" : "Unit";
    const maximumQuantity = position.type === "stock" ? position.shares : Number(investment.quantity) || 0;
    let modal = document.getElementById("investmentSellModal");
    if (!modal) { modal = document.createElement("div"); modal.id = "investmentSellModal"; modal.className = "modal"; document.body.appendChild(modal); }
    modal.innerHTML = `<div class="modal-content finance-modal"><div class="modal-header"><h2>Jual ${escapeHtml(investment.asset || "aset")}</h2><button type="button" onclick="closeSellInvestmentModal()">×</button></div><label>Jumlah dijual (maks. ${maximumQuantity} ${unitLabel})</label><input id="sellInvestmentQuantity" type="number" min="0.01" max="${maximumQuantity}" step="0.01"><label>Harga jual per ${position.type === "stock" ? "lembar" : unitLabel.toLowerCase()}</label><input id="sellInvestmentPrice" type="number" min="1" value="${position.marketPrice || Number(investment.currentPrice) || Number(investment.buyPrice) || ""}"><label>Rekening tujuan</label><select id="sellInvestmentBank"><option value="">Pilih rekening</option>${banks.filter(bank => bank.active !== false).map(bank => `<option value="${bank.id}" ${Number(bank.id) === Number(investment.bankId) ? "selected" : ""}>${escapeHtml(bank.name)}</option>`).join("")}</select><button type="button" class="save-btn" onclick="sellInvestment(${Number(investment.id)})">Simpan Penjualan</button></div>`;
    modal.style.display = "flex";
}

function closeSellInvestmentModal() { const modal = document.getElementById("investmentSellModal"); if (modal) modal.style.display = "none"; }

function sellInvestment(investmentId) {
    const investment = investments.find(item => Number(item.id) === Number(investmentId));
    const quantity = Number(document.getElementById("sellInvestmentQuantity")?.value) || 0;
    const price = Number(document.getElementById("sellInvestmentPrice")?.value) || 0;
    const bank = banks.find(item => Number(item.id) === Number(document.getElementById("sellInvestmentBank")?.value));
    if (!investment || quantity <= 0 || price <= 0 || !bank) { alert("Lengkapi jumlah jual, harga, dan rekening tujuan."); return; }
    const position = window.BudgetinMarket?.calculatePosition ? window.BudgetinMarket.calculatePosition(investment) : investment;
    const availableQuantity = position.type === "stock" ? position.shares : Number(investment.quantity);
    if (quantity > availableQuantity) { alert("Jumlah jual melebihi kepemilikan."); return; }
    const quantityForPrice = quantity;
    const remainingCost = window.BudgetinMarket?.calculateCostBasis ? window.BudgetinMarket.calculateCostBasis(investment) : Number(investment.quantity) * Number(investment.buyPrice);
    const soldRatio = quantity / availableQuantity;
    const costBasis = remainingCost * soldRatio, proceeds = quantityForPrice * price;
    bank.balance += proceeds;
    const remainingQuantity = availableQuantity - quantity;
    investment.quantity = remainingQuantity;
    if (position.type === "stock") { investment.unit = "share"; investment.shares = remainingQuantity; investment.lots = remainingQuantity / 100; }
    investment.remainingCostBasis = Math.max(0, remainingCost - costBasis);
    const history = readStorageArray("budgetin_investment_transactions");
    history.push({ id: Date.now(), type: "sell", asset: investment.asset, symbol: investment.asset, investmentId: investment.id, date: new Date().toISOString(), quantity, unit: position.type === "stock" ? "share" : position.unit, pricingQuantity: quantityForPrice, price, total: proceeds, costBasis, realizedPnL: proceeds - costBasis, bankId: bank.id });
    investments = investments.filter(item => Number(item.quantity) > 0); saveInvestments(); localStorage.setItem("budgetin_investment_transactions", JSON.stringify(history)); localStorage.setItem("budgetin_banks", JSON.stringify(banks));
    closeSellInvestmentModal(); renderInvestmentPortfolio(); updateInvestmentSummary(); renderBanks(); updateBalance(); window.dispatchEvent(new CustomEvent("budgetin:datachange"));
}

// ========================================
// OCR STRUK - HASIL DARI APK ANDROID
// ========================================

function scanReceipt() {

    const status = document.getElementById("receiptScanStatus");

    if (!window.BudgetinNative || !window.BudgetinNative.scanReceipt) {
        if (status) {
            status.textContent = "Scan OCR tersedia pada APK Budgetin."
        }
        return;
    }

    if (status) {
        status.textContent = "Pilih foto atau screenshot struk…";
    }

    window.BudgetinNative.scanReceipt();
}

function startManualTransaction() {
    const modal = document.getElementById("transactionModal");
    const status = document.getElementById("receiptScanStatus");
    if (modal) modal.setAttribute("data-source", "manual");
    if (status) status.textContent = "Mode input manual. Isi data transaksi di bawah ini.";
}

function receiveReceiptText(receiptText) {

    const status = document.getElementById("receiptScanStatus");
    const text = String(receiptText || "").replace(/\r/g, "").trim();

    if (!text) {
        if (status) status.textContent = "Teks pada struk belum terbaca. Coba gunakan foto yang lebih jelas.";
        return;
    }

    const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
    const detectedAmount = detectReceiptAmount(text);

    const merchant = lines.find(line =>
        !/^(rp|total|grand\s*total|jumlah|tunai|cash|kembalian|tanggal|date|invoice|no\.?\s*struk)/i.test(line) &&
        !/^\d+[.,\d]*$/.test(line)
    ) || "Pembelian dari struk";

    const normalizedText = text.toLowerCase();
    const detectedType = detectReceiptType(normalizedText);
    const category = getReceiptCategory(normalizedText);
    const receiptDate = getReceiptDate(text);
    const paymentMethod = detectPaymentMethod(normalizedText);
    const matchedBank = banks.find(bank =>
        normalizedText.includes(String(bank.name || "").toLowerCase())
    );

    const type = document.getElementById("transactionType");
    const descriptionInput = document.getElementById("transactionDescription");
    const amountInput = document.getElementById("transactionAmount");
    const dateInput = document.getElementById("transactionDate");
    const categoryInput = document.getElementById("transactionCategory");
    const bankInput = document.getElementById("transactionBank");
    const noteInput = document.getElementById("transactionNote");
    const paymentMethodInput = document.getElementById("transactionPaymentMethod");
    const modal = document.getElementById("transactionModal");

    if (type) {
        type.value = detectedType;
        updateTransactionCategoryVisibility();
    }

    if (descriptionInput) descriptionInput.value = merchant.slice(0, 120);
    if (amountInput && detectedAmount > 0) amountInput.value = detectedAmount;
    if (dateInput && receiptDate) dateInput.value = receiptDate;
    if (categoryInput && category) categoryInput.value = category;
    if (bankInput && matchedBank) bankInput.value = matchedBank.id;
    if (noteInput) noteInput.value = text.slice(0, 500);
    if (paymentMethodInput) paymentMethodInput.value = paymentMethod;
    if (modal) modal.setAttribute("data-source", "scan");

    const modalTitle = modal && modal.querySelector(".modal-header h2");
    if (modalTitle) modalTitle.textContent = "Konfirmasi Transaksi";

    setReceiptDetail("receiptDateDetected", receiptDate || "Tidak terbaca");
    setReceiptDetail("receiptMerchantDetected", merchant);
    setReceiptDetail("receiptAmountDetected", detectedAmount > 0 ? formatRupiah(detectedAmount) : "Tidak terbaca");
    setReceiptDetail("receiptCategoryDetected", category || "Perlu dipilih");
    setReceiptDetail("receiptBankDetected", matchedBank ? matchedBank.name : "Tidak terdeteksi — pilih manual");
    setReceiptDetail("receiptNoteDetected", text.slice(0, 120) + (text.length > 120 ? "…" : ""));

    const details = document.getElementById("receiptScanDetails");
    if (details) details.hidden = false;

    if (status) {
        status.textContent = detectedAmount > 0
            ? `Konfirmasi Transaksi: terdeteksi sebagai ${detectedType === "income" ? "pemasukan" : "pengeluaran"}. Periksa kembali nominal sebelum menyimpan.`
            : "Nominal belum terdeteksi. Silakan masukkan nominal secara manual.";
    }
}

function setReceiptDetail(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function detectReceiptType(text) {
    return /transfer\s+masuk|incoming|\bcredit\b|\bcr\b|received|dana\s+masuk|pembayaran\s+diterima|setoran|gaji\b/.test(text)
        ? "income"
        : "expense";
}

function detectReceiptAmount(text) {
    const prioritized = /(?:grand\s*total|total\s*bayar|total|jumlah|amount|nominal|transfer)\s*[:=\-]?\s*(?:rp\.?\s*)?([\d.,\s]+)/gi;
    const candidates = [];
    let match;

    while ((match = prioritized.exec(text)) !== null) {
        const value = parseReceiptAmount(match[1]);
        if (value > 0) candidates.push(value);
    }

    if (candidates.length) return Math.max(...candidates);

    (text.match(/(?:rp\.?\s*)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?/gi) || [])
        .map(parseReceiptAmount)
        .filter(value => value > 0 && value < 1000000000)
        .forEach(value => candidates.push(value));

    return candidates.length ? Math.max(...candidates) : 0;
}

function parseReceiptAmount(value) {
    const raw = String(value || "").replace(/\s/g, "").replace(/[^\d.,]/g, "");
    if (!raw) return 0;
    const parts = raw.split(/[.,]/);
    if (parts.length > 1 && parts[parts.length - 1].length === 2) parts.pop();
    return Number(parts.join("")) || 0;
}

function detectPaymentMethod(text) {
    if (/qris|qr\s*code/.test(text)) return "QRIS";
    if (/transfer/.test(text)) return "Transfer";
    if (/debit/.test(text)) return "Kartu Debit";
    if (/kredit|credit card/.test(text)) return "Kartu Kredit";
    if (/tunai|cash/.test(text)) return "Tunai";
    if (/gopay|ovo|dana|shopeepay/.test(text)) return "Dompet Digital";
    return "";
}

function getReceiptCategory(text) {
    const categories = [
        ["Makanan & Minuman", /resto|restaurant|cafe|kopi|makan|bakery|mart|supermarket|indomaret|alfamart/],
        ["Transportasi", /grab|gojek|gocar|goride|parkir|tol|bensin|pertamina|kereta|taksi/],
        ["Tagihan", /pln|listrik|pdam|internet|wifi|telkom|pascabayar|tagihan/],
        ["Kesehatan", /apotek|klinik|rumah sakit|dokter|medical/],
        ["Pendidikan", /sekolah|kampus|buku|kursus|les/],
        ["Hiburan", /bioskop|cinema|netflix|spotify|game/]
    ];

    const match = categories.find(([, pattern]) => pattern.test(text));
    return match ? match[0] : "Lainnya";
}

function getReceiptDate(text) {
    const isoMatch = text.match(/\b(20\d{2})[\/.\-](0?[1-9]|1[0-2])[\/.\-](0?[1-9]|[12]\d|3[01])\b/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;

    const numericMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-](20\d{2})\b/);
    if (numericMatch) return `${numericMatch[3]}-${numericMatch[2].padStart(2, "0")}-${numericMatch[1].padStart(2, "0")}`;

    const monthNames = "januari februari maret april mei juni juli agustus september oktober november desember".split(" ");
    const namedMatch = text.toLowerCase().match(/\b(0?[1-9]|[12]\d|3[01])\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(20\d{2})\b/);
    if (namedMatch) return `${namedMatch[3]}-${String(monthNames.indexOf(namedMatch[2]) + 1).padStart(2, "0")}-${namedMatch[1].padStart(2, "0")}`;

    return "";
}

function receiveReceiptError(message) {

    const status = document.getElementById("receiptScanStatus");

    if (status) {
        status.textContent = String(message || "Struk tidak dapat dipindai. Coba gambar yang lebih jelas.");
    }
}


function closeTransactionModal() {

    const modal =
        document.getElementById(
            "transactionModal"
        );


    if (!modal) {
        return;
    }


    modal.style.display =
        "none";


    modal.removeAttribute(
        "data-edit-id"
    );


    const title =
        modal.querySelector(
            ".modal-header h2"
        );


    if (title) {

        title.textContent =
            "Tambah Transaksi";

    }


    const saveButton =
        modal.querySelector(
            ".save-btn"
        );


    if (saveButton) {

        saveButton.textContent =
            "Simpan Transaksi";

    }


    const description =
        document.getElementById(
            "transactionDescription"
        );


    const amount =
        document.getElementById(
            "transactionAmount"
        );


    const bank =
        document.getElementById(
            "transactionBank"
        );


    if (description) {
        description.value = "";
    }


    if (amount) {
        amount.value = "";
    }


    if (bank) {
        bank.value = "";
    }


    const type =
        document.getElementById(
            "transactionType"
        );


    if (type) {
        type.value = "income";
    }

}


// ========================================
// SIMPAN TRANSAKSI
// ========================================

function saveTransaction() {

    const typeElement =
        document.getElementById(
            "transactionType"
        );


    const categoryElement =
        document.getElementById(
            "transactionCategory"
        );


    const descriptionElement =
        document.getElementById(
            "transactionDescription"
        );


    const amountElement =
        document.getElementById(
            "transactionAmount"
        );


    const bankElement =
        document.getElementById(
            "transactionBank"
        );

    const dateElement =
        document.getElementById(
            "transactionDate"
        );

    const noteElement =
        document.getElementById(
            "transactionNote"
        );

    const paymentMethodElement =
        document.getElementById(
            "transactionPaymentMethod"
        );


    if (
        !typeElement ||
        !descriptionElement ||
        !amountElement ||
        !bankElement
    ) {

        alert(
            "Form transaksi tidak lengkap."
        );

        return;

    }


    const type =
        typeElement.value;


    const category =
        categoryElement
            ? categoryElement.value.trim()
            : "";


    const description =
        descriptionElement.value.trim();


    const amount =
        Number(amountElement.value);


    const rawBankValue = bankElement ? bankElement.value : "";
    const bankId = normalizeBankId(rawBankValue);

    const transactionDate = dateElement && dateElement.value
        ? new Date(`${dateElement.value}T12:00:00`).toISOString()
        : new Date().toISOString();

    const note = noteElement
        ? noteElement.value.trim()
        : "";

    const paymentMethod = paymentMethodElement
        ? paymentMethodElement.value.trim()
        : "";


    // ==============================
    // VALIDASI KETERANGAN
    // ==============================

    if (!description) {

        alert(
            "Keterangan transaksi wajib diisi."
        );

        descriptionElement.focus();

        return;

    }


    // ==============================
    // VALIDASI KATEGORI
    // ==============================

    if (
        type === "expense" &&
        !category
    ) {

        alert(
            "Pilih kategori pengeluaran terlebih dahulu."
        );

        if (categoryElement) {
            categoryElement.focus();
        }

        return;

    }


    // ==============================
    // VALIDASI NOMINAL
    // ==============================

    if (
        !amount ||
        amount <= 0
    ) {

        alert(
            "Nominal transaksi tidak valid."
        );

        amountElement.focus();

        return;

    }


    // ==============================
    // VALIDASI REKENING
    // ==============================

    if (!bankId) {

        alert(
            "Pilih rekening terlebih dahulu."
        );

        bankElement.focus();

        return;

    }


    // ==============================
    // CARI REKENING
    // ==============================

    const bank =
        findBankById(banks, bankId);


    if (!bank) {

        alert(
            "Rekening tidak ditemukan."
        );

        return;

    }


    // ==============================
    // MODAL
    // ==============================

    const modal =
        document.getElementById(
            "transactionModal"
        );


    const editId =
        modal
            ? Number(
                modal.getAttribute(
                    "data-edit-id"
                )
            )
            : 0;

    const source = modal && modal.getAttribute("data-source") === "scan"
        ? "scan"
        : "manual";


    // ==================================================
    // MODE EDIT
    // ==================================================

    if (editId) {

        const oldTransaction =
            transactions.find(
                t =>
                    Number(t.id) ===
                    editId
            );


        if (!oldTransaction) {

            alert(
                "Transaksi tidak ditemukan."
            );

            return;

        }


        const oldBank =
            findBankById(banks, oldTransaction.bankId);


        if (!oldBank) {

            alert(
                "Rekening transaksi lama tidak ditemukan."
            );

            return;

        }


        // ==============================
        // KEMBALIKAN SALDO LAMA
        // ==============================

        if (
            oldTransaction.type ===
            "income"
        ) {

            oldBank.balance -=
                Number(
                    oldTransaction.amount
                );

        } else {

            oldBank.balance +=
                Number(
                    oldTransaction.amount
                );

        }


        // ==============================
        // CEK SALDO TRANSAKSI BARU
        // ==============================

        if (
            type === "expense" &&
            Number(bank.balance) <
                amount
        ) {

            // rollback
            if (
                oldTransaction.type ===
                "income"
            ) {

                oldBank.balance +=
                    Number(
                        oldTransaction.amount
                    );

            } else {

                oldBank.balance -=
                    Number(
                        oldTransaction.amount
                    );

            }


            alert(
                `Saldo ${bank.name} tidak cukup.\n\n` +
                `Saldo tersedia: ${formatRupiah(bank.balance)}\n` +
                `Dibutuhkan: ${formatRupiah(amount)}`
            );

            return;

        }


        // ==============================
        // TERAPKAN TRANSAKSI BARU
        // ==============================

        if (
            type === "income"
        ) {

            bank.balance +=
                amount;

        } else {

            bank.balance -=
                amount;

        }


        // ==============================
        // UPDATE DATA
        // ==============================

        oldTransaction.type =
            type;


        oldTransaction.category =
            type === "expense"
                ? category
                : "";


        oldTransaction.description =
            description;


        oldTransaction.amount =
            amount;


        oldTransaction.bankId =
            bank.id;


        oldTransaction.bankName =
            bank.name;

        oldTransaction.date =
            transactionDate;

        oldTransaction.note =
            note;

        oldTransaction.paymentMethod = paymentMethod;


        // ==============================
        // SIMPAN
        // ==============================

        localStorage.setItem(
            "budgetin_transactions",
            JSON.stringify(
                transactions
            )
        );


        localStorage.setItem(
            "budgetin_banks",
            JSON.stringify(
                banks
            )
        );


        // ==============================
        // REFRESH
        // ==============================

        closeTransactionModal();

        renderTransactions();

        renderBanks();

        renderBankOptions();

        updateBalance();


        alert(
            "Transaksi berhasil diperbarui."
        );

        return;
    }


    // ==================================================
    // MODE TAMBAH
    // ==================================================

    if (source === "scan") {
        const dateKey = transactionDate.slice(0, 10);
        const normalizedDescription = description.toLowerCase().replace(/\s+/g, " ");
        const duplicate = transactions.some(item =>
            item.type === type &&
            Number(item.amount) === amount &&
            String(item.date || "").slice(0, 10) === dateKey &&
            String(item.description || "").toLowerCase().replace(/\s+/g, " ") === normalizedDescription
        );

        if (duplicate && !confirm("Transaksi serupa sudah ada. Tetap simpan?")) {
            return;
        }
    }

    if (
        type === "expense" &&
        Number(bank.balance) <
            amount
    ) {

        alert(
            `Saldo ${bank.name} tidak cukup.\n\n` +
            `Saldo tersedia: ${formatRupiah(bank.balance)}\n` +
            `Dibutuhkan: ${formatRupiah(amount)}`
        );

        return;

    }


    // ==============================
    // UPDATE SALDO
    // ==============================

    if (
        type === "income"
    ) {

        bank.balance +=
            amount;

    } else {

        bank.balance -=
            amount;

    }


    // ==============================
    // BUAT TRANSAKSI
    // ==============================

    const transaction = {

        id:
            Date.now(),

        type:
            type,

        category:
            type === "expense"
                ? category
                : "",

        description:
            description,

        amount:
            amount,

        bankId:
            bank.id,

        bankName:
            bank.name,

        note:
            note,

        paymentMethod:
            paymentMethod,

        source:
            source,

        createdAt:
            new Date().toISOString(),

        date:
            transactionDate

    };


    transactions.push(
        transaction
    );


    // ==============================
    // SIMPAN
    // ==============================

    localStorage.setItem(
        "budgetin_transactions",
        JSON.stringify(
            transactions
        )
    );


    localStorage.setItem(
        "budgetin_banks",
        JSON.stringify(
            banks
        )
    );


    // ==============================
    // REFRESH
    // ==============================

    closeTransactionModal();

    renderTransactions();

    renderBanks();

    renderBankOptions();

    updateBalance();


    alert(
        "Transaksi berhasil disimpan!\n\n" +
        bank.name +
        "\n" +
        (
            type === "income"
                ? "+ "
                : "- "
        ) +
        formatRupiah(amount)
    );

}
// ========================================
// EDIT TRANSAKSI
// ========================================

function editTransaction(
    transactionId
) {

    const transaction =
        transactions.find(
            t =>
                Number(t.id) ===
                Number(transactionId)
        );


    if (!transaction) {

        alert(
            "Transaksi tidak ditemukan."
        );

        return;

    }


    const modal =
        document.getElementById(
            "transactionModal"
        );


    if (!modal) {
        return;
    }


    modal.setAttribute(
        "data-edit-id",
        transaction.id
    );
    modal.setAttribute("data-source", transaction.source || "manual");


    // ==============================
    // TYPE
    // ==============================

    const type =
        document.getElementById(
            "transactionType"
        );


    if (type) {

        type.value =
            transaction.type;

    }


    // ==============================
    // CATEGORY
    // ==============================

    const category =
        document.getElementById(
            "transactionCategory"
        );


    if (category) {

        category.value =
            transaction.category || "";

    }


    // ==============================
    // DESCRIPTION
    // ==============================

    const description =
        document.getElementById(
            "transactionDescription"
        );


    if (description) {

        description.value =
            transaction.description || "";

    }

    const note =
        document.getElementById(
            "transactionNote"
        );

    if (note) {
        note.value =
            transaction.note || "";
    }

    const paymentMethod = document.getElementById("transactionPaymentMethod");
    if (paymentMethod) {
        paymentMethod.value = transaction.paymentMethod || "";
    }

    const date =
        document.getElementById(
            "transactionDate"
        );

    if (date && transaction.date) {
        date.value = new Date(transaction.date).toISOString().slice(0, 10);
    }


    // ==============================
    // AMOUNT
    // ==============================

    const amount =
        document.getElementById(
            "transactionAmount"
        );


    if (amount) {

        amount.value =
            transaction.amount;

    }


    // ==============================
    // BANK
    // ==============================

    renderBankOptions();


    const bankSelect =
        document.getElementById(
            "transactionBank"
        );


    if (!bankSelect) {
        return;
    }


    // Cek rekening lama
    const bankExists =
        Array.from(
            bankSelect.options
        ).some(
            option =>
                Number(option.value) ===
                Number(
                    transaction.bankId
                )
        );


    // Kalau rekening nonaktif,
    // tambahkan sementara
    if (!bankExists) {

        const oldBank =
            banks.find(
                b =>
                    Number(b.id) ===
                    Number(
                        transaction.bankId
                    )
            );


        if (oldBank) {

            const option =
                document.createElement(
                    "option"
                );


            option.value =
                oldBank.id;


            option.textContent =
                `${oldBank.name} - ${formatRupiah(oldBank.balance)} (Nonaktif)`;


            bankSelect.appendChild(
                option
            );

        }

    }


    bankSelect.value =
        transaction.bankId;


    // ==============================
    // UPDATE CATEGORY VISIBILITY
    // ==============================

    updateTransactionCategoryVisibility();


    // ==============================
    // JUDUL
    // ==============================

    const title =
        modal.querySelector(
            ".modal-header h2"
        );


    if (title) {

        title.textContent =
            "Edit Transaksi";

    }


    // ==============================
    // BUTTON
    // ==============================

    const saveButton =
        modal.querySelector(
            ".save-btn"
        );


    if (saveButton) {

        saveButton.textContent =
            "Simpan Perubahan";

    }


    // ==============================
    // BUKA MODAL
    // ==============================

    modal.style.display =
        "flex";

}


// ========================================
// HAPUS TRANSAKSI
// ========================================

function deleteTransaction(
    transactionId
) {

    const transaction =
        transactions.find(
            t =>
                Number(t.id) ===
                Number(transactionId)
        );


    if (!transaction) {
        return;
    }


    const confirmDelete =
        confirm(
            `Hapus transaksi "${transaction.description}"?\n\n` +
            `Saldo rekening akan otomatis dikembalikan.`
        );


    if (!confirmDelete) {
        return;
    }


    const bank =
        findBankById(banks, transaction.bankId);


    if (bank) {

        if (
            transaction.type ===
            "income"
        ) {

            bank.balance -=
                Number(
                    transaction.amount
                );

        } else {

            bank.balance +=
                Number(
                    transaction.amount
                );

        }

    }


    transactions =
        transactions.filter(
            t =>
                Number(t.id) !==
                Number(transactionId)
        );


    localStorage.setItem(
        "budgetin_transactions",
        JSON.stringify(
            transactions
        )
    );


    localStorage.setItem(
        "budgetin_banks",
        JSON.stringify(
            banks
        )
    );


    renderTransactions();

    renderBanks();

    renderBankOptions();

    updateBalance();

    // Forecast harus langsung membaca transaksi dan saldo yang sudah diperbarui.
    if (window.BudgetinFinance && typeof window.BudgetinFinance.refresh === "function") {
        window.BudgetinFinance.refresh();
    }


    alert(
        "Transaksi berhasil dihapus."
    );

}


// ========================================
// RENDER TRANSAKSI
// ========================================

function renderTransactions() {

    const list =
        document.getElementById(
            "transactionList"
        );


    if (!list) {
        return;
    }


    list.innerHTML = "";


    // ==============================
    // FILTER DATA
    // ==============================

    let filteredTransactions =
        transactions.slice();


    // FILTER TANGGAL AWAL
    if (
        transactionFilter.startDate
    ) {

        filteredTransactions =
            filteredTransactions.filter(
                transaction =>
                    getTransactionDateKey(
                        transaction
                    ) >=
                    transactionFilter.startDate
            );

    }


    // FILTER TANGGAL AKHIR
    if (
        transactionFilter.endDate
    ) {

        filteredTransactions =
            filteredTransactions.filter(
                transaction =>
                    getTransactionDateKey(
                        transaction
                    ) <=
                    transactionFilter.endDate
            );

    }


    // ==============================
    // FILTER KATEGORI
    // ==============================

    if (
        transactionFilter.category
    ) {

        const selectedCategory =
            transactionFilter.category
                .trim()
                .toLowerCase();


        filteredTransactions =
            filteredTransactions.filter(
                transaction => {

                    const transactionCategory =
                        String(
                            transaction.category || ""
                        )
                            .trim()
                            .toLowerCase();


                    return (
                        transactionCategory ===
                        selectedCategory
                    );

                }
            );

    }


    // ==============================
    // INFO FILTER
    // ==============================

    const filterInfo =
        document.getElementById(
            "filterResultInfo"
        );


    if (filterInfo) {

        const hasDateFilter =
            transactionFilter.startDate ||
            transactionFilter.endDate;


        const hasCategoryFilter =
            transactionFilter.category;


        if (
            hasDateFilter ||
            hasCategoryFilter
        ) {

            let text =
                "Menampilkan";


            if (
                transactionFilter.startDate ||
                transactionFilter.endDate
            ) {

                const start =
                    transactionFilter.startDate ||
                    "...";


                const end =
                    transactionFilter.endDate ||
                    "...";


                text +=
                    ` ${start} s/d ${end}`;

            }


            if (
                transactionFilter.category
            ) {

                text +=
                    ` • ${transactionFilter.category}`;

            }


            filterInfo.textContent =
                text;

        } else {

            filterInfo.textContent =
                "Menampilkan semua transaksi";

        }

    }


    // ==============================
    // EMPTY
    // ==============================

    if (
        filteredTransactions.length ===
        0
    ) {

        list.innerHTML = `

            <div class="empty-state">

                Tidak ada transaksi
                yang sesuai filter.

                <br>

                Coba ubah tanggal
                atau kategori. 📊

            </div>

        `;


        updateTransactionSummary();

        return;

    }


    // ==============================
    // TERBARU DI ATAS
    // ==============================

    const sortedTransactions =
        filteredTransactions
            .slice()
            .reverse();


    // ==============================
    // RENDER
    // ==============================

    sortedTransactions.forEach(
        transaction => {

            const isIncome =
                transaction.type ===
                "income";


            const sign =
                isIncome
                    ? "+"
                    : "-";


            const date =
                new Date(
                    transaction.date
                );


            const formattedDate =
                date.toLocaleDateString(
                    "id-ID",
                    {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                    }
                );


            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "transaction-item";


            item.innerHTML = `

                <div class="transaction-icon">

                    ${
                        isIncome
                            ? "↑"
                            : "↓"
                    }

                </div>


                <div class="transaction-info">

                    <strong>
                        ${escapeHtml(transaction.description)}
                    </strong>


                    <small>

                        ${formattedDate}

                        ${
                            transaction.bankName
                                ? " • " +
                                  escapeHtml(transaction.bankName)
                                : ""
                        }

                    </small>


                    ${
                        transaction.category
                            ? `
                                <span
                                    class="transaction-category"
                                >
                                    ${escapeHtml(transaction.category)}
                                </span>
                              `
                            : ""
                    }


                    <div
                        class="transaction-actions"
                    >

                        <button
                            type="button"
                            onclick="editTransaction(${transaction.id})"
                        >
                            Edit
                        </button>


                        <button
                            type="button"
                            onclick="deleteTransaction(${transaction.id})"
                        >
                            Hapus
                        </button>

                    </div>

                </div>


                <strong
                    class="${
                        isIncome
                            ? "income-text"
                            : "expense-text"
                    }"
                >

                    ${sign}
                    ${formatRupiah(
                        transaction.amount
                    )}

                </strong>

            `;


            list.appendChild(
                item
            );

        }
    );


    updateTransactionSummary();

}


// ========================================
// FILTER TRANSAKSI
// ========================================

function filterTransactions() {

    const startDate =
        document.getElementById(
            "filterStartDate"
        )?.value || "";


    const endDate =
        document.getElementById(
            "filterEndDate"
        )?.value || "";


    const category =
        document.getElementById(
            "filterCategory"
        )?.value || "";


    // ==============================
    // MINIMAL SATU FILTER
    // ==============================

    if (
        !startDate &&
        !endDate &&
        !category
    ) {

        alert(
            "Pilih tanggal atau kategori terlebih dahulu."
        );

        return;

    }


    // ==============================
    // VALIDASI TANGGAL
    // ==============================

    if (
        startDate &&
        endDate &&
        startDate > endDate
    ) {

        alert(
            "Tanggal awal tidak boleh lebih besar dari tanggal akhir."
        );

        return;

    }


    // ==============================
    // SIMPAN FILTER
    // ==============================

    transactionFilter.startDate =
        startDate;


    transactionFilter.endDate =
        endDate;


    transactionFilter.category =
        category;


    // ==============================
    // RENDER
    // ==============================

    renderTransactions();

}


// ========================================
// RESET FILTER
// ========================================

function resetTransactionFilter() {

    transactionFilter.startDate =
        "";

    transactionFilter.endDate =
        "";

    transactionFilter.category =
        "";


    const startInput =
        document.getElementById(
            "filterStartDate"
        );


    const endInput =
        document.getElementById(
            "filterEndDate"
        );


    const categoryInput =
        document.getElementById(
            "filterCategory"
        );


    if (startInput) {

        startInput.value =
            "";

    }


    if (endInput) {

        endInput.value =
            "";

    }


    if (categoryInput) {

        categoryInput.value =
            "";

    }


    renderTransactions();

}


// ========================================
// RINGKASAN TRANSAKSI
// ========================================

function updateTransactionSummary() {

    let filteredTransactions =
        transactions.slice();


    // ==============================
    // FILTER TANGGAL AWAL
    // ==============================

    if (
        transactionFilter.startDate
    ) {

        filteredTransactions =
            filteredTransactions.filter(
                transaction =>
                    getTransactionDateKey(
                        transaction
                    ) >=
                    transactionFilter.startDate
            );

    }


    // ==============================
    // FILTER TANGGAL AKHIR
    // ==============================

    if (
        transactionFilter.endDate
    ) {

        filteredTransactions =
            filteredTransactions.filter(
                transaction =>
                    getTransactionDateKey(
                        transaction
                    ) <=
                    transactionFilter.endDate
            );

    }


    // ==============================
    // FILTER KATEGORI
    // ==============================

    if (
        transactionFilter.category
    ) {

        const selectedCategory =
            transactionFilter.category
                .trim()
                .toLowerCase();


        filteredTransactions =
            filteredTransactions.filter(
                transaction =>
                    String(
                        transaction.category || ""
                    )
                        .trim()
                        .toLowerCase() ===
                    selectedCategory
            );

    }


    // ==============================
    // HITUNG
    // ==============================

    let income = 0;

    let expense = 0;


    filteredTransactions.forEach(
        transaction => {

            const amount =
                Number(
                    transaction.amount
                ) || 0;


            if (
                transaction.type ===
                "income"
            ) {

                income +=
                    amount;

            }


            if (
                transaction.type ===
                "expense"
            ) {

                expense +=
                    amount;

            }

        }
    );


    // ==============================
    // TAMPILKAN
    // ==============================

    const incomeElement =
        document.getElementById(
            "transactionIncome"
        );


    const expenseElement =
        document.getElementById(
            "transactionExpense"
        );


    if (incomeElement) {

        incomeElement.textContent =
            formatRupiah(
                income
            );

    }


    if (expenseElement) {

        expenseElement.textContent =
            formatRupiah(
                expense
            );

    }

}


// ========================================
// UPDATE DASHBOARD
// ========================================

// =====================================================
// BUDGETIN CENTRAL CASH FLOW ENGINE
// Single source of truth for Dashboard, Report, and PDF.
// Cash Flow = Actual Money Movement in the period.
// Unrealized P/L and Total Portfolio Value are NOT cash flow.
// =====================================================
window.BudgetinCashFlow = (function () {
    "use strict";

    function parseLocalDate(value) {
        if (!value) return null;
        if (value instanceof Date) {
            return isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
        }
        const str = String(value).trim();
        if (!str) return null;
        if (str.includes("T")) {
            const d = new Date(str);
            return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
        }
        const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (match) {
            return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
        }
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    function isWithinRange(dateValue, start, end) {
        const d = parseLocalDate(dateValue);
        if (!d) return false;
        const s = parseLocalDate(start);
        const e = parseLocalDate(end);
        if (s && d < s) return false;
        if (e && d > e) return false;
        return true;
    }

    function readArray(key) {
        try {
            const raw = localStorage.getItem(key);
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function calculatePeriod(options = {}) {
        const {
            start,
            end,
            category = "",
            transactions: customTransactions,
            investmentTransactions: customInvTransactions,
            investments: customInvestments
        } = options;

        const allTransactions = customTransactions || (typeof readStorageArray === "function" ? readStorageArray("budgetin_transactions") : readArray("budgetin_transactions"));
        const allInvTransactions = customInvTransactions || (typeof readStorageArray === "function" ? readStorageArray("budgetin_investment_transactions") : readArray("budgetin_investment_transactions"));
        const allInvestments = customInvestments || (typeof readStorageArray === "function" ? readStorageArray("budgetin_investments") : readArray("budgetin_investments"));

        let income = 0;
        let expense = 0;
        let investmentBuy = 0;
        let investmentSell = 0;
        const categories = {};
        const periodTransactions = [];

        // 1. Process operational transactions (budgetin_transactions)
        allTransactions.forEach(item => {
            if (!item || !item.date) return;
            if (!isWithinRange(item.date, start, end)) return;

            // Internal transfers must not affect cash flow
            const isInternalTransfer = item.type === "transfer" ||
                item.isTransfer === true ||
                (item.category === "Transfer" && !item.type);
            if (isInternalTransfer) return;

            // Category filter check
            const itemCategory = item.category || "__uncategorized";
            if (category && category !== "" && itemCategory !== category) return;

            const amount = Number(item.amount) || 0;
            if (amount <= 0) return;

            if (item.type === "income") {
                income += amount;
                periodTransactions.push(item);
            } else if (item.type === "expense") {
                expense += amount;
                const catName = item.category || "Lainnya";
                categories[catName] = (categories[catName] || 0) + amount;
                periodTransactions.push(item);
            }
        });

        // 2. Process actual investment money movements (budgetin_investment_transactions)
        const includeInvestments = !category || category === "" || category.toLowerCase() === "investasi";
        const processedInvIds = new Set();

        if (includeInvestments) {
            allInvTransactions.forEach(invItem => {
                if (!invItem || !invItem.date) return;
                if (!isWithinRange(invItem.date, start, end)) return;

                const amount = Number(invItem.total ?? invItem.amount) || 0;
                if (amount <= 0) return;

                if (invItem.investmentId) {
                    processedInvIds.add(String(invItem.investmentId));
                }
                if (invItem.id) {
                    processedInvIds.add(String(invItem.id));
                }

                if (invItem.type === "buy") {
                    investmentBuy += amount;
                    periodTransactions.push({
                        ...invItem,
                        isInvestment: true,
                        category: "Investasi",
                        description: `Beli ${invItem.asset || "Investasi"}`,
                        amount
                    });
                } else if (invItem.type === "sell") {
                    investmentSell += amount;
                    periodTransactions.push({
                        ...invItem,
                        isInvestment: true,
                        category: "Investasi",
                        description: `Jual ${invItem.asset || "Investasi"}`,
                        amount
                    });
                }
            });

            // Fallback for legacy holdings without ledger records (Double-count protected)
            allInvestments.forEach(holding => {
                if (!holding || !holding.createdAt) return;
                if (holding.id && processedInvIds.has(String(holding.id))) return;
                if (!isWithinRange(holding.createdAt, start, end)) return;

                const costBasis = window.BudgetinMarket?.calculateCostBasis
                    ? window.BudgetinMarket.calculateCostBasis(holding)
                    : (Number(holding.quantity) || 0) * (Number(holding.buyPrice) || 0);

                if (costBasis > 0) {
                    investmentBuy += costBasis;
                    periodTransactions.push({
                        ...holding,
                        type: "buy",
                        isInvestment: true,
                        category: "Investasi",
                        description: `Beli ${holding.asset || "Investasi"} (Legacy)`,
                        amount: costBasis
                    });
                }
            });
        }

        // 3. Cash flow calculation: Inflows - Outflows
        const netCashFlow = (income + investmentSell) - (expense + investmentBuy);
        const netInvestment = investmentBuy - investmentSell;

        return {
            income,
            expense,
            investmentBuy,
            investmentSell,
            netInvestment,
            netCashFlow,
            categories,
            transactions: periodTransactions
        };
    }

    return {
        parseLocalDate,
        isWithinRange,
        calculatePeriod
    };
})();

// ========================================
// UPDATE DASHBOARD HOME
// ========================================

function updateBalance() {

    // ================================
    // TOTAL SALDO REKENING
    // ================================

    let totalBankBalance = 0;

    banks.forEach(bank => {

        totalBankBalance +=
            Number(bank.balance) || 0;

    });


    // ================================
    // TOTAL SALDO TARGET TABUNGAN
    // ================================

    let totalGoalBalance = 0;

    goals.forEach(goal => {

        totalGoalBalance +=
            Number(goal.current) || 0;

    });


    // ================================
    // INVESTASI
    // ================================

    // Nilai portfolio terkini (termasuk harga cache market bila tersedia).
    const totalInvestment = getTotalInvestmentValue();


    // ================================
    // TOTAL KEKAYAAN
    // ================================

    const totalWealth =
        totalBankBalance +
        totalGoalBalance +
        totalInvestment;


    // ================================
    // CASH FLOW BULAN INI (CENTRAL ENGINE)
    // ================================

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const periodSummary = window.BudgetinCashFlow.calculatePeriod({
        start: startOfMonth,
        end: endOfMonth
    });

    const monthlyIncome = periodSummary.income;
    const monthlyExpense = periodSummary.expense;
    const monthlyBalance = periodSummary.netCashFlow;


    // ================================
    // TAMPILKAN KE HOME
    // ================================

    const wealthElement =
        document.getElementById(
            "totalWealth"
        );

    const bankElement =
        document.getElementById(
            "totalBankBalance"
        );

    const goalElement =
        document.getElementById(
            "totalGoalBalance"
        );

    const investmentElement =
        document.getElementById(
            "totalInvestment"
        );

    const incomeElement =
        document.getElementById(
            "totalIncome"
        );

    const expenseElement =
        document.getElementById(
            "totalExpense"
        );

    const monthlyElement =
        document.getElementById(
            "monthlyBalance"
        );


    if (wealthElement) {

        wealthElement.textContent =
            formatRupiah(totalWealth);

    }


    if (bankElement) {

        bankElement.textContent =
            formatRupiah(totalBankBalance);

    }


    if (goalElement) {

        goalElement.textContent =
            formatRupiah(totalGoalBalance);

    }


    if (investmentElement) {

        investmentElement.textContent =
            formatRupiah(totalInvestment);

    }


    if (incomeElement) {

        incomeElement.textContent =
            formatRupiah(monthlyIncome);

    }


    if (expenseElement) {

        expenseElement.textContent =
            formatRupiah(monthlyExpense);

    }


    if (monthlyElement) {

        monthlyElement.textContent =
            formatRupiah(monthlyBalance);

    }


    // Update grafik
    if (
        typeof renderCashflowChart ===
        "function"
    ) {

        renderCashflowChart();

    }

}

// ========================================
// BANK MODAL
// ========================================

function openBankModal() {

    const modal =
        document.getElementById(
            "bankModal"
        );


    if (modal) {

        modal.style.display =
            "flex";

    }

}


function closeBankModal() {

    const modal =
        document.getElementById(
            "bankModal"
        );


    if (modal) {

        modal.style.display =
            "none";

    }

}


// ========================================
// SIMPAN BANK
// ========================================

function saveBank() {

    const name =
        document
            .getElementById(
                "bankName"
            )
            .value
            .trim();


    const balance =
        Number(
            document.getElementById(
                "bankBalance"
            ).value
        );


    if (!name) {

        alert(
            "Nama rekening wajib diisi."
        );

        return;
    }


    if (
        isNaN(balance) ||
        balance < 0
    ) {

        alert(
            "Saldo awal tidak valid."
        );

        return;
    }


    const duplicate =
        banks.some(
            bank =>
                bank.name
                    .toLowerCase() ===
                name.toLowerCase()
        );


    if (duplicate) {

        alert(
            `Rekening "${name}" sudah ada.`
        );

        return;
    }


    const bank = {

        id:
            Date.now(),

        name:
            name,

        balance:
            balance,

        active:
            true

    };


    banks.push(
        bank
    );


    localStorage.setItem(
        "budgetin_banks",
        JSON.stringify(
            banks
        )
    );


    document.getElementById(
        "bankName"
    ).value = "";


    document.getElementById(
        "bankBalance"
    ).value = "";


    closeBankModal();


    renderBanks();

    renderBankOptions();

    renderGoalBankOptions();

    updateBalance();

}


// ========================================
// RENDER BANK
// ========================================

function renderBanks() {

    const list =
        document.getElementById(
            "bankList"
        );


    if (!list) {
        return;
    }


    list.innerHTML = "";


    if (banks.length === 0) {

        list.innerHTML = `
            <div class="empty-state">

                Belum ada rekening.

                <br>

                Tambahkan rekening pertama lu 🏦

            </div>
        `;


        updateBankTotal();

        return;
    }


    banks.forEach(
        bank => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "bank-card";


            const isActive =
                bank.active !== false;


            card.innerHTML = `

                <div class="bank-icon">
                    🏦
                </div>


                <div class="bank-info">

                    <strong>
                        ${escapeHtml(bank.name)}
                    </strong>


                    <small>

                        ${
                            isActive
                                ? "Rekening aktif"
                                : "Rekening nonaktif"
                        }

                    </small>

                </div>


                <div class="bank-right">

                    <strong
                        class="bank-balance">

                        ${formatRupiah(
                            bank.balance
                        )}

                    </strong>


                    <div
                        class="bank-actions">

                        <button
                            class="bank-action-btn"
                            onclick="renameBank(${bank.id})">

                            Edit

                        </button>


                        <button
                            class="bank-action-btn"
                            onclick="toggleBankStatus(${bank.id})">

                            ${
                                isActive
                                    ? "Nonaktifkan"
                                    : "Aktifkan"
                            }

                        </button>


                        <button
                            class="bank-action-btn delete-bank-btn"
                            onclick="deleteBank(${bank.id})">

                            Hapus

                        </button>

                    </div>

                </div>

            `;


            list.appendChild(
                card
            );

        }
    );


    updateBankTotal();

}


// ========================================
// TOTAL SALDO BANK
// ========================================

function updateBankTotal() {

    let total = 0;


    banks.forEach(
        bank => {

            total +=
                Number(
                    bank.balance
                ) || 0;

        }
    );


    const element =
        document.getElementById(
            "bankTotalBalance"
        );


    if (element) {

        element.textContent =
            formatRupiah(
                total
            );

    }

}


// ========================================
// RENAME BANK
// ========================================

function renameBank(bankId) {

    const bank =
        banks.find(
            b =>
                Number(b.id) ===
                Number(bankId)
        );


    if (!bank) {

        alert(
            "Rekening tidak ditemukan."
        );

        return;
    }


    const newName =
        prompt(
            "Masukkan nama rekening baru:",
            bank.name
        );


    if (newName === null) {
        return;
    }


    const name =
        newName.trim();


    if (!name) {

        alert(
            "Nama rekening tidak boleh kosong."
        );

        return;
    }


    const duplicate =
        banks.some(
            b =>
                Number(b.id) !==
                    Number(bankId) &&
                b.name
                    .toLowerCase() ===
                    name.toLowerCase()
        );


    if (duplicate) {

        alert(
            "Nama rekening tersebut sudah digunakan."
        );

        return;
    }


    bank.name =
        name;


    // UPDATE NAMA
    // DI TRANSAKSI LAMA

    transactions.forEach(
        transaction => {

            if (
                Number(transaction.bankId) ===
                Number(bankId)
            ) {

                transaction.bankName =
                    name;

            }

        }
    );


    // UPDATE NAMA
    // DI TARGET

    goals.forEach(
        goal => {

            if (
                Number(goal.bankId) ===
                Number(bankId)
            ) {

                goal.bank =
                    name;

            }

        }
    );


    localStorage.setItem(
        "budgetin_banks",
        JSON.stringify(
            banks
        )
    );


    localStorage.setItem(
        "budgetin_transactions",
        JSON.stringify(
            transactions
        )
    );


    localStorage.setItem(
        "budgetin_goals",
        JSON.stringify(
            goals
        )
    );


    renderBanks();

    renderBankOptions();

    renderGoalBankOptions();

    renderTransactions();

    renderGoals();

}


// ========================================
// AKTIF / NONAKTIF BANK
// ========================================

function toggleBankStatus(
    bankId
) {

    const bank =
        banks.find(
            b =>
                Number(b.id) ===
                Number(bankId)
        );


    if (!bank) {
        return;
    }


    const isActive =
        bank.active !== false;


    if (isActive) {

        const confirmDisable =
            confirm(
                `Nonaktifkan rekening "${bank.name}"?\n\n` +
                `Rekening tidak akan muncul saat membuat transaksi baru.`
            );


        if (!confirmDisable) {
            return;
        }

    }


    bank.active =
        !isActive;


    localStorage.setItem(
        "budgetin_banks",
        JSON.stringify(
            banks
        )
    );


    renderBanks();

    renderBankOptions();

    renderGoalBankOptions();


    alert(
        bank.name +
        (
            bank.active
                ? " berhasil diaktifkan."
                : " berhasil dinonaktifkan."
        )
    );

}


// ========================================
// HAPUS BANK
// ========================================

function deleteBank(
    bankId
) {

    const bank =
        banks.find(
            b =>
                Number(b.id) ===
                Number(bankId)
        );


    if (!bank) {

        alert(
            "Rekening tidak ditemukan."
        );

        return;
    }


    const linkedTransactions = transactions.filter(
        transaction => Number(transaction.bankId) === Number(bankId)
    );

    const linkedGoals = goals.filter(
        goal => Number(goal.bankId) === Number(bankId)
    );

    const linkedDataNotice = linkedTransactions.length || linkedGoals.length
        ? `\n\nTindakan ini juga akan menghapus ${linkedTransactions.length} transaksi dan ${linkedGoals.length} target yang terkait.`
        : "";


    const confirmDelete =
        confirm(
            `Hapus rekening "${bank.name}"?${linkedDataNotice}`
        );


    if (!confirmDelete) {
        return;
    }


    banks =
        banks.filter(
            b =>
                Number(b.id) !==
                Number(bankId)
        );

    transactions = transactions.filter(
        transaction => Number(transaction.bankId) !== Number(bankId)
    );

    goals = goals.filter(
        goal => Number(goal.bankId) !== Number(bankId)
    );


    localStorage.setItem(
        "budgetin_banks",
        JSON.stringify(
            banks
        )
    );

    localStorage.setItem("budgetin_transactions", JSON.stringify(transactions));
    localStorage.setItem("budgetin_goals", JSON.stringify(goals));


    renderBanks();

    renderBankOptions();

    renderGoalBankOptions();

    updateBalance();

}


// ========================================
// DROPDOWN BANK TRANSAKSI
// ========================================

function renderBankOptions() {

    const select =
        document.getElementById(
            "transactionBank"
        );


    if (!select) {
        return;
    }


    select.innerHTML = `

        <option value="">
            Pilih Rekening
        </option>

    `;


    banks.forEach(
        bank => {

            // BANK NONAKTIF
            // TIDAK MUNCUL
            // DI TRANSAKSI BARU

            if (
                bank.active === false
            ) {

                return;

            }


            const option =
                document.createElement(
                    "option"
                );


            option.value =
                bank.id;


            option.textContent =
                `${bank.name} - ${formatRupiah(
                    bank.balance
                )}`;


            select.appendChild(
                option
            );

        }
    );

}

// ========================================
// DROPDOWN REKENING INVESTASI
// ========================================

function renderInvestmentBankOptions() {

    const select =
        document.getElementById("investmentBank");

    if (!select) {
        return;
    }

    select.innerHTML = `
        <option value="">
            Pilih rekening
        </option>
    `;

    banks.forEach(bank => {

        // Rekening nonaktif tidak bisa dipilih
        if (bank.active === false) {
            return;
        }

        const option =
            document.createElement("option");

        option.value = bank.id;

        option.textContent =
            `${bank.name} - ${formatRupiah(bank.balance)}`;

        select.appendChild(option);

    });

}

// ========================================
// GRAFIK CASH FLOW
// ========================================

let cashflowChart = null;

function renderCashflowChart() {

    const canvas =
        document.getElementById("cashflowChart");

    if (!canvas || typeof Chart === "undefined") {
        return;
    }

    const periodElement =
        document.getElementById("chartPeriod");

    const period =
        periodElement
            ? periodElement.value
            : "month";

    const now = new Date();

    let labels = [];
    let incomeData = [];
    let expenseData = [];

    // ====================================
    // 7 HARI TERAKHIR
    // ====================================

    if (period === "7days") {

        for (let i = 6; i >= 0; i--) {

            const date = new Date(now);

            date.setHours(0, 0, 0, 0);
            date.setDate(
                date.getDate() - i
            );

            labels.push(
                date.toLocaleDateString(
                    "id-ID",
                    {
                        day: "numeric",
                        month: "short"
                    }
                )
            );

            let income = 0;
            let expense = 0;

            transactions.forEach(transaction => {

                const transactionDate =
                    new Date(transaction.date);

                if (
                    transactionDate.getFullYear() ===
                        date.getFullYear() &&

                    transactionDate.getMonth() ===
                        date.getMonth() &&

                    transactionDate.getDate() ===
                        date.getDate()
                ) {

                    const amount =
                        Number(transaction.amount) || 0;

                    if (
                        transaction.type ===
                        "income"
                    ) {
                        income += amount;
                    }

                    if (
                        transaction.type ===
                        "expense"
                    ) {
                        expense += amount;
                    }

                }

            });

            incomeData.push(income);
            expenseData.push(expense);
        }
    }


    // ====================================
    // BULAN INI
    // ====================================

    if (period === "month") {

        const year =
            now.getFullYear();

        const month =
            now.getMonth();

        const daysInMonth =
            new Date(
                year,
                month + 1,
                0
            ).getDate();

        for (
            let day = 1;
            day <= daysInMonth;
            day++
        ) {

            labels.push(day);

            let income = 0;
            let expense = 0;

            transactions.forEach(transaction => {

                const date =
                    new Date(transaction.date);

                if (
                    date.getFullYear() === year &&
                    date.getMonth() === month &&
                    date.getDate() === day
                ) {

                    const amount =
                        Number(transaction.amount) || 0;

                    if (
                        transaction.type ===
                        "income"
                    ) {
                        income += amount;
                    }

                    if (
                        transaction.type ===
                        "expense"
                    ) {
                        expense += amount;
                    }
                }

            });

            incomeData.push(income);
            expenseData.push(expense);
        }
    }


    // ====================================
    // 6 BULAN
    // ====================================

    if (period === "6months") {

        for (let i = 5; i >= 0; i--) {

            const date = new Date(
                now.getFullYear(),
                now.getMonth() - i,
                1
            );

            const year =
                date.getFullYear();

            const month =
                date.getMonth();

            labels.push(
                date.toLocaleDateString(
                    "id-ID",
                    {
                        month: "short"
                    }
                )
            );

            let income = 0;
            let expense = 0;

            transactions.forEach(transaction => {

                const transactionDate =
                    new Date(transaction.date);

                if (
                    transactionDate.getFullYear() ===
                        year &&

                    transactionDate.getMonth() ===
                        month
                ) {

                    const amount =
                        Number(transaction.amount) || 0;

                    if (
                        transaction.type ===
                        "income"
                    ) {
                        income += amount;
                    }

                    if (
                        transaction.type ===
                        "expense"
                    ) {
                        expense += amount;
                    }
                }

            });

            incomeData.push(income);
            expenseData.push(expense);
        }
    }


    // ====================================
    // DESTROY CHART LAMA
    // ====================================

    if (cashflowChart) {
        cashflowChart.destroy();
    }


    // ====================================
    // CREATE CHART
    // ====================================

    cashflowChart = new Chart(
        canvas,
        {

            type: "bar",

            data: {

                labels: labels,

                datasets: [

                    {
                        label: "Pemasukan",
                        data: incomeData,

                        borderRadius: 5,

                        barPercentage: 0.7,

                        categoryPercentage: 0.7
                    },

                    {
                        label: "Pengeluaran",
                        data: expenseData,

                        borderRadius: 5,

                        barPercentage: 0.7,

                        categoryPercentage: 0.7
                    }

                ]
            },

            options: {options: {

    responsive: true,

    maintainAspectRatio: false,

    interaction: {
        mode: "index",
        intersect: false
    },

    plugins: {

        legend: {
            position: "top",

            align: "start",

            labels: {
                boxWidth: 10,
                boxHeight: 10,
                padding: 12,
                usePointStyle: true,
                font: {
                    size: 9
                }
            }
        },

        tooltip: {

            backgroundColor: "#111111",

            titleFont: {
                size: 10
            },

            bodyFont: {
                size: 10
            },

            padding: 10,

            cornerRadius: 10,

            displayColors: true,

            callbacks: {

                label: function(context) {

                    return (
                        context.dataset.label +
                        ": " +
                        formatRupiah(context.raw)
                    );

                }

            }

        }

    },

    scales: {

        x: {

            grid: {
                display: false
            },

            ticks: {

                maxRotation: 0,

                minRotation: 0,

                font: {
                    size: 8
                },

                autoSkip: true,

                maxTicksLimit: 7
            }

        },

        y: {

            beginAtZero: true,

            border: {
                display: false
            },

            grid: {
                color: "#f0f0f0"
            },

            ticks: {

                font: {
                    size: 8
                },

                padding: 5,

                callback: function(value) {

                    if (value >= 1000000) {

                        return (
                            "Rp " +
                            (value / 1000000) +
                            "jt"
                        );

                    }

                    if (value >= 1000) {

                        return (
                            "Rp " +
                            (value / 1000) +
                            "rb"
                        );

                    }

                    return "Rp " + value;

                }

            }

        }

    }
}
}
        }
    );
}

// ========================================
// REKENING PREVIEW - HOME
// ========================================

function renderHomeBanks() {

    const list =
        document.getElementById("homeBankList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    if (banks.length === 0) {

        list.innerHTML = `
            <div class="home-empty-bank">
                Belum ada rekening 🏦
            </div>
        `;

        return;
    }

    // Tampilkan maksimal 3 rekening
    const previewBanks =
        banks.slice(0, 3);

    previewBanks.forEach(bank => {

        const card =
            document.createElement("div");

        card.className =
            "home-bank-card";

        card.innerHTML = `

            <div class="home-bank-left">

                <div class="home-bank-icon">
                    🏦
                </div>

                <div>
                    <strong>
                    ${escapeHtml(bank.name)}
                    </strong>

                    <small>
                        Rekening aktif
                    </small>
                </div>

            </div>

            <strong class="home-bank-balance">
                ${formatRupiah(bank.balance)}
            </strong>

        `;

        list.appendChild(card);

    });

}

document.addEventListener("DOMContentLoaded", function () {

    renderInvestmentPortfolio();

    updateInvestmentSummary();

});

// Harga pasar disimpan di cache; perubahan harga bukan transaksi cash flow.
window.addEventListener("budgetin:marketpricechange", function () {
    renderInvestmentPortfolio();
    updateInvestmentSummary();
    updateBalance();
    if (window.BudgetinPortfolioReport) window.BudgetinPortfolioReport.render();
});

document.addEventListener("DOMContentLoaded", function () {
    const refreshButton = document.getElementById("refreshMarketPrices");
    const status = document.getElementById("marketPriceStatus");
    if (!refreshButton || !window.BudgetinMarket) return;
    const setStatus = (message, type = "") => { if (status) { status.textContent = message; status.className = `market-price-status ${type}`; } };
    let cooldownTimer;
    const finishCooldown = () => {
        clearInterval(cooldownTimer);
        refreshButton.disabled = false;
        refreshButton.textContent = "↻ Update Harga";
    };
    const startCooldown = (milliseconds, prefix = "", type = "") => {
        clearInterval(cooldownTimer);
        const update = () => {
            const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
            if (seconds <= 0) return finishCooldown();
            refreshButton.disabled = true;
            refreshButton.textContent = `Update ${seconds} dtk`;
            setStatus(`${prefix}⏳ Update harga tersedia dalam ${seconds} detik.`, type);
            milliseconds -= 1000;
        };
        update();
        cooldownTimer = setInterval(update, 1000);
    };
    const timeWib = value => new Date(value || Date.now()).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) + " WIB";
    refreshButton.addEventListener("click", async function () {
        const waiting = window.BudgetinMarket.cooldownRemaining?.() || 0;
        if (waiting > 0) { startCooldown(waiting); return; }
        refreshButton.disabled = true;
        refreshButton.textContent = "Memperbarui harga…";
        setStatus("Memperbarui harga pasar…");
        const result = await window.BudgetinMarket.refreshPrices(investments, true);
        if (result.status === "success") startCooldown(result.cooldownRemaining || 0, `✓ Harga pasar diperbarui • ${timeWib(result.updatedAt)}. `, "success");
        else if (result.status === "partial") startCooldown(result.cooldownRemaining || 0, "✓ Sebagian harga berhasil diperbarui. Beberapa aset menggunakan harga terakhir. ", "success");
        else if (result.status === "cooldown") startCooldown(result.cooldownRemaining || 0);
        else {
            const messages = { rate_limit: "⚠ Batas API hari ini tercapai. Harga terakhir tetap digunakan.", no_data: "⚠ Data harga untuk beberapa aset belum tersedia.", fallback: "⚠ Harga terbaru belum tersedia. Menampilkan harga terakhir.", api_error: "⚠ Gagal mengambil harga pasar. Harga terakhir tetap digunakan." };
            const message = messages[result.status] || `⚠ ${result.message || "Harga terakhir tetap digunakan."}`;
            setStatus(message, "error");
            startCooldown(result.cooldownRemaining || 0, `${message} `, "error");
        }
    });
    // Deliberately do not fetch here: opening or re-rendering the page must use
    // cached/fallback values only and must never spend provider quota.
});

document.addEventListener("DOMContentLoaded", function () {

    renderInvestmentPortfolio();

});

document.addEventListener("DOMContentLoaded", function () {

    const type =
        document.getElementById("investmentType");

    const asset =
        document.getElementById("investmentAsset");

    const quantity =
        document.getElementById("investmentQuantity");

    const price =
        document.getElementById("investmentCurrentPrice");

    const investmentUnit =
        document.getElementById("investmentUnit");


    if (type) {

        type.addEventListener(
            "change",
            function () {

                updateInvestmentType();
                updateInvestmentPrice();

            }
        );

    }


    if (quantity) {

        quantity.addEventListener(
            "input",
            updateInvestmentPrice
        );

    }

    if (price) {

        price.addEventListener(
            "input",
            updateInvestmentPrice
        );

    }

    if (investmentUnit) {
        investmentUnit.addEventListener("change", updateInvestmentPrice);
    }

});

// ========================================
// LOGOUT BUDGETIN
// ========================================

function logoutBudgetin() {

    const confirmLogout = confirm(
        "Yakin mau keluar dari Budgetin?"
    );

    if (!confirmLogout) {
        return;
    }

    // Hapus sesi login dari perangkat ini
    localStorage.removeItem("budgetin_session");
    sessionStorage.removeItem("budgetin_session");
    localStorage.removeItem("budgetin_user_email");

    // Kembali ke halaman login
    window.location.href = "login.html";
}

/* =====================================================
   BUDGETIN SIDEBAR COLLAPSE
===================================================== */

(function initSidebarToggle() {

    function setupSidebarToggle() {

        const header = document.querySelector("header");

        if (!header) return;

        /* Jangan bikin tombol dua kali */
        if (document.querySelector(".sidebar-toggle")) return;

        const toggleButton = document.createElement("button");

        toggleButton.className = "sidebar-toggle";

        toggleButton.type = "button";

        toggleButton.setAttribute(
            "aria-label",
            "Toggle Sidebar"
        );

        toggleButton.innerHTML = "☰";


        /* Masukkan tombol ke bagian kiri header */

        const headerLeft = header.children[0];

        if (headerLeft) {

            headerLeft.style.display = "flex";
            headerLeft.style.alignItems = "center";
            headerLeft.style.gap = "12px";

            headerLeft.prepend(toggleButton);

        } else {

            header.prepend(toggleButton);

        }


        /* ================================
           RESTORE STATE
        ================================= */

        const sidebarState =
            localStorage.getItem("budgetinSidebar");

        if (sidebarState === "collapsed") {

            document.body.classList.add(
                "sidebar-collapsed"
            );

            toggleButton.innerHTML = "☰";

        }


        /* ================================
           TOGGLE
        ================================= */

        toggleButton.addEventListener(
            "click",
            function () {

                document.body.classList.toggle(
                    "sidebar-collapsed"
                );

                const collapsed =
                    document.body.classList.contains(
                        "sidebar-collapsed"
                    );


                localStorage.setItem(
                    "budgetinSidebar",
                    collapsed
                        ? "collapsed"
                        : "open"
                );


                toggleButton.innerHTML =
                    collapsed
                        ? "☰"
                        : "☰";

            }
        );

    }


    /* Tunggu DOM selesai */

    if (document.readyState === "loading") {

        document.addEventListener(
            "DOMContentLoaded",
            setupSidebarToggle
        );

    } else {

        setupSidebarToggle();

    }

})();

/* =====================================================
   SIDEBAR TOGGLE (DESKTOP & MOBILE RESPONSIVE)
   ===================================================== */

function toggleSidebar() {
    if (window.matchMedia("(max-width: 768px)").matches) {
        document.body.classList.toggle("mobile-sidebar-open");
        return;
    }

    const app = document.querySelector(".app");
    const isCollapsed = document.body.classList.toggle("sidebar-collapsed");
    if (app) {
        app.classList.toggle("sidebar-collapsed", isCollapsed);
    }

    localStorage.setItem(
        "budgetin_sidebar_collapsed",
        isCollapsed ? "true" : "false"
    );
}

function closeMobileSidebar() {
    document.body.classList.remove("mobile-sidebar-open");
}

/* Close mobile sidebar on link click or outside backdrop tap */
document.addEventListener("click", function (e) {
    if (!document.body.classList.contains("mobile-sidebar-open")) return;

    const sidebar = document.querySelector(".desktop-sidebar");
    const toggle = document.getElementById("sidebarToggle") || document.querySelector(".sidebar-toggle");

    // If click was on toggle button, toggleSidebar handled it
    if (toggle && toggle.contains(e.target)) return;

    // If click was outside sidebar
    if (sidebar && !sidebar.contains(e.target)) {
        closeMobileSidebar();
        return;
    }

    // If click was on a link inside sidebar
    if (e.target.closest(".sidebar-item") || e.target.closest(".sidebar-logout")) {
        closeMobileSidebar();
    }
});

/* Restore sidebar state on desktop */
document.addEventListener("DOMContentLoaded", function () {
    const collapsed = localStorage.getItem("budgetin_sidebar_collapsed") === "true";
    if (collapsed && window.matchMedia("(min-width: 769px)").matches) {
        document.body.classList.add("sidebar-collapsed");
        const app = document.querySelector(".app");
        if (app) app.classList.add("sidebar-collapsed");
    }
});

// ========================================
// START APP
// ========================================

renderGoals();

renderTransactions();

renderBanks();

renderBankOptions();

renderGoalBankOptions();

updateBalance();

renderHomeBanks();

