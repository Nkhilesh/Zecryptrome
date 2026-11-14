// Mauritius insights: compares the user's month with the national Household Budget Survey 2023
// and gives an overall rating of their money situation.
// Loaded before insights.js. Uses its helpers (monthView, savingsBalanceAt, formatMoney, src, viewMk)
// at call time; mauritiusRating() itself is plain data in, plain data out.
//
// Source: Statistics Mauritius, "Household Budget Survey 2023 – Preliminary results" (30 April 2024),
// https://statsmauritius.govmu.org/Pages/Statistics/ESI/Household_Surveys/HBS_2023.aspx
// Amounts are monthly, per household, in 2023 rupees (not adjusted for inflation since).

const HBS_2023 = {
    householdSize: 3.2,
    earners: 2.1,
    avgIncome: 55600,          // average monthly household disposable income
    medianIncome: 45000,
    avgSpending: 41870,        // average monthly household consumption expenditure
    wageShare: 0.62,           // wages and salaries, share of gross income
    transferShare: 0.25,       // pensions, CSG income allowance, other benefits
    over40kShare: 0.567,       // households with disposable income above Rs 40,000
    // Table 4: % of households by monthly disposable income band [from, to, %]
    incomeBands: [
        [0, 10000, 0.7], [10000, 12000, 3.0], [12000, 14000, 3.2], [14000, 16000, 2.3],
        [16000, 18000, 2.1], [18000, 20000, 2.0], [20000, 25000, 6.3], [25000, 30000, 8.5],
        [30000, 35000, 7.8], [35000, 40000, 7.4], [40000, 45000, 6.6], [45000, 50000, 6.6],
        [50000, 60000, 10.5], [60000, 70000, 8.1], [70000, 80000, 6.5], [80000, 90000, 4.5],
        [90000, 100000, 3.3], [100000, 200000, 10.6], // top band is open-ended; spread to Rs 200,000
    ],
    // Table 6, regrouped to match this app's expense categories (sums to Rs 41,870)
    groups: [
        { label: "Groceries", cats: ["Groceries"], rs: 10480, note: "Food and non-alcoholic beverages" },
        { label: "Transport & fuel", cats: ["Fuel", "Transport"], rs: 6630, note: "Transport" },
        { label: "Bills, phone & internet", cats: ["Bills", "Subscriptions"], rs: 7120, note: "Housing, water, electricity, gas + information and communication" },
        { label: "Eating out & snacks", cats: ["Food & drinks"], rs: 2190, note: "Restaurants and accommodation services" },
        { label: "Health", cats: ["Health"], rs: 2050, note: "Health" },
        { label: "Clothes & household", cats: ["Shopping"], rs: 3730, note: "Clothing and footwear + furnishings and household equipment" },
        { label: "Entertainment", cats: ["Entertainment"], rs: 820, note: "Recreation, sport and culture" },
        { label: "Other", cats: ["Other"], rs: 8850, note: "Alcohol and tobacco, education, insurance, personal care" },
    ],
    // Spending the household can't easily cut: food, housing and utilities, transport, communication, health
    essentialCats: ["Groceries", "Bills", "Fuel", "Transport", "Health"],
    essentialRs: 10480 + 4180 + 6630 + 2940 + 2050,
};
HBS_2023.savingsRate = (HBS_2023.avgIncome - HBS_2023.avgSpending) / HBS_2023.avgIncome;   // ≈ 24.7%
HBS_2023.essentialShare = HBS_2023.essentialRs / HBS_2023.avgIncome;                       // ≈ 47.3%

const MU_SIZE_KEY = "mauritius.householdSize";
const MU_GRADES = [
    [80, "A", "Very comfortable"],
    [65, "B", "Comfortable"],
    [50, "C", "Getting by"],
    [35, "D", "Stretched"],
    [0, "E", "Under pressure"],
];

// Share of Mauritian households whose disposable income is below `rupees` (0–100)
function hbsIncomePercentile(rupees) {
    let below = 0;
    for (const [from, to, pct] of HBS_2023.incomeBands) {
        if (rupees >= to) { below += pct; continue; }
        if (rupees > from) below += pct * (rupees - from) / (to - from);
        break;
    }
    return Math.min(99, below);
}

// What this income would be for a household of the national average size, using the
// square-root equivalence scale (a bigger household needs more, but not proportionally more).
const equivalentHouseholdIncome = (rupees, size) => rupees * Math.sqrt(HBS_2023.householdSize / size);

// Plain data in, plain data out. All money in cents, as elsewhere in the app.
// { income, spent, loanPay, byCat: {category: cents}, savingsBalance, hasSavings, householdSize }
function mauritiusRating(input) {
    const size = Math.max(1, input.householdSize || 1);
    const incomeRs = input.income / 100;
    const spentRs = input.spent / 100;
    const outflowRs = (input.spent + (input.loanPay || 0)) / 100;

    const groups = HBS_2023.groups.map((g) => ({ ...g, nationalShare: g.rs / HBS_2023.avgSpending, cents: 0 }));
    const other = groups.find((g) => g.label === "Other");
    for (const [cat, cents] of Object.entries(input.byCat || {})) {
        (groups.find((g) => g.cats.includes(cat)) || other).cents += cents;
    }
    for (const g of groups) g.share = input.spent ? g.cents / input.spent : 0;

    const base = {
        size, groups,
        incomePerPerson: incomeRs / size,
        spentPerPerson: spentRs / size,
        nationalIncomePerPerson: HBS_2023.avgIncome / HBS_2023.householdSize,
        nationalSpentPerPerson: HBS_2023.avgSpending / HBS_2023.householdSize,
    };
    if (input.income <= 0) return { ...base, ready: false, reason: "Add your income for this month to get a rating." };
    if (input.spent <= 0) return { ...base, ready: false, reason: "Record your expenses for this month to get a rating." };

    const equivIncome = equivalentHouseholdIncome(incomeRs, size);
    const percentile = hbsIncomePercentile(equivIncome);
    const savingsRate = (incomeRs - outflowRs) / incomeRs;
    const essentialRs = HBS_2023.essentialCats.reduce((s, c) => s + (input.byCat[c] || 0), 0) / 100;
    const essentialShare = essentialRs / incomeRs;
    const cushionMonths = outflowRs > 0 ? Math.max(0, input.savingsBalance / 100) / outflowRs : 0;
    const pct = (x) => `${Math.round(x * 100)}%`;
    const clamp = (x) => Math.max(0, Math.min(1, x));

    const parts = [
        {
            name: "Income level", max: 30,
            points: 30 * clamp(percentile / 90),        // full marks in the top 10%
            detail: `Higher than about ${Math.round(percentile)}% of Mauritian households` +
                (size === HBS_2023.householdSize ? "." : ` (adjusted for a household of ${size}).`),
        },
        {
            name: "Money left over", max: 30,
            points: 30 * clamp(savingsRate / 0.35),      // full marks keeping 35%; national average ≈ 25%
            detail: savingsRate >= 0
                ? `You keep ${pct(savingsRate)} of your income. The average household keeps ${pct(HBS_2023.savingsRate)}.`
                : `You spend ${pct(-savingsRate)} more than you earn. The average household keeps ${pct(HBS_2023.savingsRate)}.`,
        },
        {
            name: "Cost of essentials", max: 20,
            points: 20 * clamp((0.9 - essentialShare) / (0.9 - 0.35)), // full marks at 35% of income; national ≈ 47%
            detail: `Groceries, bills, transport and health take ${pct(essentialShare)} of your income (national average: ${pct(HBS_2023.essentialShare)}).`,
        },
        {
            name: "Safety cushion", max: 20,
            points: 20 * clamp(cushionMonths / 6),      // full marks at six months of spending
            detail: input.hasSavings
                ? `Your savings would cover ${cushionMonths < 10 ? cushionMonths.toFixed(1) : Math.round(cushionMonths)} months of spending. Aim for at least three, ideally six.`
                : "No savings recorded yet. Aim for at least three months of spending, ideally six.",
        },
    ];
    const score = Math.round(parts.reduce((s, p) => s + p.points, 0));
    const [, grade, label] = MU_GRADES.find(([min]) => score >= min);

    const keep = savingsRate >= 0 ? `keep ${pct(savingsRate)} of it` : `spend ${pct(-savingsRate)} more than you earn`;
    const summary = `Your income is higher than about ${Math.round(percentile)}% of Mauritian households, and you ${keep} (average household: ${pct(HBS_2023.savingsRate)}).`;

    return { ...base, ready: true, score, grade, label, parts, summary, percentile, equivIncome, savingsRate, essentialShare, cushionMonths };
}

// ---------- rendering ----------
let muLastIns = null;

function muHouseholdSize() {
    try { return Math.min(8, Math.max(1, parseInt(AppStorage.getItem(MU_SIZE_KEY), 10) || 1)); } catch (e) { return 1; }
}

function muRatingFor(ins) {
    const v = ins.view;
    let balance = 0;
    try { balance = savingsBalanceAt(src, `${v.mk}-31`); } catch (e) {}
    return mauritiusRating({
        income: v.income, spent: v.spent, loanPay: v.loanPay, byCat: v.byCat,
        savingsBalance: balance, hasSavings: src.savingsData.transactions.length > 0,
        householdSize: muHouseholdSize(),
    });
}

const MU_GRADE_STYLE = {
    A: "bg-teal-600 text-white", B: "bg-teal-500 text-white", C: "bg-amber-500 text-white",
    D: "bg-orange-500 text-white", E: "bg-red-600 text-white",
};

// Card on the Insights page (called by insights.js render())
function renderMauritiusComparison(ins) {
    muLastIns = ins;
    const r = muRatingFor(ins);
    const chip = document.getElementById("muGradeChip");
    const headline = document.getElementById("mauritiusComparison");
    const detail = document.getElementById("mauritiusDetail");
    if (r.ready) {
        chip.className = `flex h-10 w-10 flex-none items-center justify-center rounded-full text-lg font-bold ${MU_GRADE_STYLE[r.grade]}`;
        chip.textContent = r.grade;
        chip.setAttribute("aria-label", `Grade ${r.grade}`);
        chip.hidden = false;
        headline.textContent = `${r.label} · ${r.score}/100`;
        detail.textContent = r.summary + (ins.view.projected ? " Based on this month's projected spending." : "");
    } else {
        chip.hidden = true;
        headline.textContent = "Not enough data for a rating yet";
        detail.textContent = r.reason;
    }
    if (document.getElementById("mauritiusDialog").open) renderMauritiusDialog();
    if (location.hash === "#mauritius" && !muOpenedFromHash) { muOpenedFromHash = true; openMauritiusDialog(); }
}
let muOpenedFromHash = false;

function openMauritiusDialog() {
    renderMauritiusDialog();
    const d = document.getElementById("mauritiusDialog");
    if (!d.open) d.showModal();
}

function muBar(widthPct, cls) {
    return `<div class="h-1.5 rounded-full bg-slate-200 dark:bg-neutral-800"><div class="h-1.5 rounded-full ${cls}" style="width:${Math.max(0, Math.min(100, widthPct))}%"></div></div>`;
}

function renderMauritiusDialog() {
    if (!muLastIns) return;
    const v = muLastIns.view;
    const r = muRatingFor(muLastIns);
    const body = document.getElementById("muBody");
    const rs = (rupees) => formatMoney(Math.round(rupees) * 100);
    const pct = (x) => `${Math.round(x * 100)}%`;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    const sizeOptions = [1, 2, 3, 4, 5, 6, 7, 8]
        .map((n) => `<option value="${n}"${n === r.size ? " selected" : ""}>${n === 8 ? "8 or more" : n} ${n === 1 ? "person" : "people"}</option>`).join("");

    const rating = r.ready ? `
        <div class="flex items-center gap-4">
          <div class="flex h-20 w-20 flex-none flex-col items-center justify-center rounded-2xl ${MU_GRADE_STYLE[r.grade]}">
            <span class="text-4xl font-bold leading-none">${r.grade}</span>
            <span class="mt-1 text-xs font-medium opacity-90">${r.score}/100</span>
          </div>
          <div>
            <p class="text-lg font-semibold">${r.label}</p>
            <p class="mt-1 text-sm text-slate-600 dark:text-neutral-300">${esc(r.summary)}</p>
          </div>
        </div>
        <div class="mt-3 flex gap-1" aria-hidden="true">
          ${MU_GRADES.slice().reverse().map(([, g, l]) => `<div class="flex-1 text-center"><div class="h-1.5 rounded-full ${g === r.grade ? MU_GRADE_STYLE[g].split(" ")[0] : "bg-slate-200 dark:bg-neutral-800"}"></div><span class="mt-1 block text-[10px] ${g === r.grade ? "font-semibold" : "text-slate-500 dark:text-neutral-400"}">${g} · ${l}</span></div>`).join("")}
        </div>
        <ul class="mt-5 space-y-4">
          ${r.parts.map((p) => {
              const share = p.points / p.max * 100;
              return `<li>
                <div class="flex justify-between text-sm"><span class="font-medium">${p.name}</span><span class="tabular-nums">${Math.round(p.points)} / ${p.max}</span></div>
                <div class="mt-1.5">${muBar(share, share >= 75 ? "bg-teal-500" : share >= 40 ? "bg-amber-500" : "bg-red-500")}</div>
                <p class="mt-1 text-xs text-slate-500 dark:text-neutral-400">${esc(p.detail)}</p>
              </li>`;
          }).join("")}
        </ul>`
        : `<p class="rounded-xl bg-slate-50 p-4 text-sm dark:bg-neutral-900">${esc(r.reason)}</p>`;

    const stat = (label, yours, theirs) => `
        <div class="rounded-xl bg-slate-50 p-3 dark:bg-neutral-900">
          <dt class="text-xs text-slate-500 dark:text-neutral-400">${label}</dt>
          <dd class="mt-1 font-semibold tabular-nums">${yours}</dd>
          <dd class="text-xs text-slate-500 dark:text-neutral-400">Mauritius: ${theirs}</dd>
        </div>`;

    const maxShare = Math.max(...r.groups.map((g) => Math.max(g.share, g.nationalShare)), 0.01);
    const categories = v.spent > 0 ? `
        <section class="mt-6">
          <h3 class="font-semibold">Where the money goes</h3>
          <p class="mt-1 text-xs text-slate-500 dark:text-neutral-400">Share of total spending. Shares can be compared whatever your household size.</p>
          <div class="mt-2 flex gap-4 text-xs text-slate-500 dark:text-neutral-400">
            <span class="flex items-center gap-1.5"><span class="h-2 w-3 rounded-full bg-teal-600"></span>You</span>
            <span class="flex items-center gap-1.5"><span class="h-2 w-3 rounded-full bg-slate-400 dark:bg-neutral-500"></span>Average household</span>
          </div>
          <ul class="mt-3 space-y-3">
            ${r.groups.map((g) => `<li title="${esc(g.note)}">
              <div class="flex justify-between gap-2 text-sm"><span>${g.label}</span><span class="tabular-nums text-slate-600 dark:text-neutral-300">${pct(g.share)} <span class="text-slate-400">vs</span> ${pct(g.nationalShare)}</span></div>
              <div class="mt-1 space-y-1">${muBar(g.share / maxShare * 100, "bg-teal-600")}${muBar(g.nationalShare / maxShare * 100, "bg-slate-400 dark:bg-neutral-500")}</div>
            </li>`).join("")}
          </ul>
        </section>` : "";

    body.innerHTML = `
        <p class="text-sm text-slate-500 dark:text-neutral-400">${monthLabel(v.mk)}${v.projected ? " (projected to month end)" : ""}</p>
        <label class="mt-3 flex items-center justify-between gap-3 text-sm">
          <span>People in your household</span>
          <select id="muSize" class="rounded-lg border p-1.5 dark:border-neutral-700 dark:bg-neutral-900">${sizeOptions}</select>
        </label>

        <section class="mt-5">${rating}</section>

        <section class="mt-6">
          <h3 class="font-semibold">You vs the average Mauritian</h3>
          <dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
            ${stat("Income per person", rs(r.incomePerPerson), rs(r.nationalIncomePerPerson))}
            ${stat("Spending per person", rs(r.spentPerPerson), rs(r.nationalSpentPerPerson))}
            ${stat("Household income", formatMoney(v.income), `${rs(HBS_2023.avgIncome)} avg`)}
            ${stat("Share of income kept", r.ready ? pct(r.savingsRate) : "–", pct(HBS_2023.savingsRate))}
          </dl>
        </section>
        ${categories}

        <section class="mt-6">
          <h3 class="font-semibold">Mauritius in numbers (2023)</h3>
          <ul class="mt-2 space-y-1.5 text-sm text-slate-600 dark:text-neutral-300">
            <li>Average household disposable income: <strong>${rs(HBS_2023.avgIncome)}</strong> a month (median ${rs(HBS_2023.medianIncome)}), up 51% since 2017.</li>
            <li>Average household spending: <strong>${rs(HBS_2023.avgSpending)}</strong> a month, up 46% since 2017.</li>
            <li>The average household has ${HBS_2023.householdSize} people and ${HBS_2023.earners} earners.</li>
            <li>${pct(HBS_2023.over40kShare)} of households take home more than Rs 40,000 a month.</li>
            <li>Wages make up ${pct(HBS_2023.wageShare)} of household income; pensions and benefits ${pct(HBS_2023.transferShare)}.</li>
            <li>Food is the biggest expense (25%), then transport (16%). Health spending rose the fastest: +88% since 2017.</li>
          </ul>
        </section>

        <p class="mt-6 text-xs leading-relaxed text-slate-500 dark:text-neutral-400">
          This is a rough guide, not financial advice. It uses only the income, expenses and savings recorded in this app.
          National figures are household take-home (disposable) income and spending in 2023 prices, not adjusted for inflation since.
          Your income is compared with households of the average size (${HBS_2023.householdSize} people) using a square-root scale, and loan repayments count as spending.
        </p>
        <a class="mt-2 inline-block text-xs text-teal-700 underline dark:text-teal-400" href="https://statsmauritius.govmu.org/Pages/Statistics/ESI/Household_Surveys/HBS_2023.aspx" target="_blank" rel="noopener noreferrer">Source: Statistics Mauritius, Household Budget Survey 2023 (April 2024)</a>`;

    body.querySelector("#muSize").addEventListener("change", (e) => {
        try { AppStorage.setItem(MU_SIZE_KEY, e.target.value); } catch (err) {}
        renderMauritiusComparison(muLastIns);
    });
}

if (typeof document !== "undefined" && document.getElementById("mauritiusDialog")) {
    document.getElementById("openMauritius").addEventListener("click", openMauritiusDialog);
    document.getElementById("muClose").addEventListener("click", () => document.getElementById("mauritiusDialog").close());
}
