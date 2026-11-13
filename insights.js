// Insights page. Reads data from the other pages:
//   income-store.js (income), expenses-store.js (expenses, subscriptions, scans, limits),
//   savings-store.js (savings), loans-engine.js + "loans.v1" (loan repayments).
// The analysis (buildInsights) is plain data in, plain data out; render() draws it.

const INS_LOANS_KEY = "loans.v1";
const STREAMING_RE = /netflix|disney|prime|youtube|canal|apple tv|hbo|spotify|deezer|apple music/i;
const SMALL_PURCHASE_CENTS = 20000; // under Rs 200 counts as a small purchase

// ---------- month helpers ----------
const mkOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
function shiftMk(mk, n) {
    const [y, m] = mk.split("-").map(Number);
    return mkOf(new Date(y, m - 1 + n, 1));
}
function daysIn(mk) {
    const [y, m] = mk.split("-").map(Number);
    return new Date(y, m, 0).getDate();
}
const monthLabel = (mk, opts = { month: "long", year: "numeric" }) =>
    new Date(mk + "-01T00:00").toLocaleString("en-US", opts);
const totalOf = (list) => list.reduce((s, e) => s + e.amountCents, 0);
const sumValues = (obj) => Object.values(obj).reduce((s, v) => s + v, 0);
const average = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
function median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const variableByCat = (list) => spentByCategory(list.filter((e) => !e.subscriptionId));
const fixedByCat = (list) => spentByCategory(list.filter((e) => e.subscriptionId));

// ---------- data ----------
function loadSources(today = new Date()) {
    const expData = loadExpenseData();
    if (syncSubscriptions(expData, expIsoDate(today)) > 0) {
        try { saveExpenseData(expData); } catch (e) {}
    }
    let loans = [];
    try { loans = JSON.parse(localStorage.getItem(INS_LOANS_KEY)) || []; } catch (e) {}
    return {
        today,
        incomeData: loadIncome(),
        expData,
        expenses: allExpenses(expData).filter((e) => e.date),
        savingsData: loadSavings(),
        loans,
    };
}

const hasAnyData = (src) =>
    src.expenses.length > 0 || hasIncomeData(src.incomeData) || src.savingsData.transactions.length > 0 || src.loans.length > 0;

function loanPaymentsIn(src, mk) {
    let sum = 0;
    for (const l of src.loans) {
        for (const r of LoanEngine.loanState(l, l.history || []).rows) if (r.date.startsWith(mk)) sum += r.payment;
    }
    return sum;
}

// Subscription charges still to come in month mk (after today), by category
function upcomingSubscriptionCharges(src, mk) {
    const out = {};
    for (const s of src.expData.subscriptions) {
        if (!s.active) continue;
        let d = s.nextDate, guard = 0;
        while (d.slice(0, 7) <= mk && guard++ < 60) {
            if (d.startsWith(mk)) out[s.category] = (out[s.category] || 0) + s.amountCents;
            d = nextBillingDate(d, s.cycle, s.day);
        }
    }
    return out;
}

const savingsBalanceAt = (src, isoDay) =>
    src.savingsData.transactions.filter((t) => t.date <= isoDay).reduce((s, t) => s + signedCents(t), 0);

function monthActual(src, mk) {
    const list = src.expenses.filter((e) => e.date.startsWith(mk));
    return {
        mk,
        list,
        byCat: spentByCategory(list),
        varByCat: variableByCat(list),
        fixedByCat: fixedByCat(list),
        spent: totalOf(list),
        income: sumCents(incomeForMonth(src.incomeData, mk)),
        loanPay: loanPaymentsIn(src, mk),
        savedNet: src.savingsData.transactions.filter((t) => t.date.startsWith(mk)).reduce((s, t) => s + signedCents(t), 0),
        projected: false,
    };
}

// The current month isn't over, so estimate month-end spending: blend the pace so far with
// the usual amount (pace counts more as the month goes on), then add scheduled subscriptions.
function monthView(src, mk) {
    const actual = monthActual(src, mk);
    if (mk !== mkOf(src.today)) return actual;

    const day = src.today.getDate(), dim = daysIn(mk), weight = day / dim;
    const prev = [1, 2, 3].map((i) => monthActual(src, shiftMk(mk, -i))).filter((m) => m.spent > 0);
    const upcoming = upcomingSubscriptionCharges(src, mk);
    const cats = new Set([...Object.keys(actual.byCat), ...Object.keys(upcoming), ...prev.flatMap((p) => Object.keys(p.varByCat))]);

    const varByCat = {}, fixed = {}, byCat = {};
    for (const c of cats) {
        const soFar = actual.varByCat[c] || 0;
        const pace = (soFar / day) * dim;
        const usual = prev.length ? average(prev.map((p) => p.varByCat[c] || 0)) : pace;
        // Estimates are rounded to whole rupees (no false precision)
        const v = Math.max(soFar, Math.round((pace * weight + usual * (1 - weight)) / 100) * 100);
        const f = (actual.fixedByCat[c] || 0) + (upcoming[c] || 0);
        if (v) varByCat[c] = v;
        if (f) fixed[c] = f;
        if (v + f) byCat[c] = v + f;
    }
    return { ...actual, byCat, varByCat, fixedByCat: fixed, spent: sumValues(byCat), actualSpent: actual.spent, projected: true };
}

// ---------- health score ----------
function healthScore(src, view, prevViews) {
    const parts = [];
    const income = view.income;
    const outflow = view.spent + view.loanPay;

    // 1. Savings rate (30): keeping 20%+ of income gets full marks
    if (income > 0) {
        const rate = (income - outflow) / income;
        parts.push({
            name: "Money left over", max: 30, points: clamp01(rate / 0.2) * 30,
            detail: rate >= 0 ? `${Math.round(rate * 100)}% of income left after spending and loans (aim for 20%+)` : `Spending is ${formatMoney(outflow - income)} more than income`,
        });
    } else {
        parts.push({ name: "Money left over", max: 30, points: 0, detail: "No income recorded for this month" });
    }

    // 2. Spending vs income (20): 70% or less is full marks, 100%+ is zero
    if (income > 0) {
        const ratio = view.spent / income;
        parts.push({
            name: "Spending vs income", max: 20, points: clamp01((1 - ratio) / 0.3) * 20,
            detail: `Spending is ${Math.round(ratio * 100)}% of income (aim for 70% or less)`,
        });
    } else {
        parts.push({ name: "Spending vs income", max: 20, points: 0, detail: "Add your income to measure this" });
    }

    // 3. Debt load (20): loan repayments 15% of income or less is full marks, 40%+ is zero
    if (view.loanPay === 0) {
        parts.push({ name: "Debt repayments", max: 20, points: 20, detail: "No loan repayments this month" });
    } else if (income > 0) {
        const ratio = view.loanPay / income;
        parts.push({
            name: "Debt repayments", max: 20, points: clamp01((0.4 - ratio) / 0.25) * 20,
            detail: `Loan repayments take ${Math.round(ratio * 100)}% of income (aim for 15% or less)`,
        });
    } else {
        parts.push({ name: "Debt repayments", max: 20, points: 0, detail: `${formatMoney(view.loanPay)} in repayments with no income recorded` });
    }

    // 4. Emergency fund (15): savings covering 3+ months of spending is full marks
    const saved = savingsBalanceAt(src, `${view.mk}-31`);
    const monthly = average([view, ...prevViews.slice(0, 2)].filter((m) => m.spent > 0).map((m) => m.spent + m.loanPay));
    const months = monthly ? saved / monthly : 0;
    parts.push({
        name: "Emergency fund", max: 15, points: monthly ? clamp01(months / 3) * 15 : saved > 0 ? 15 : 0,
        detail: saved > 0
            ? `Savings of ${formatMoney(saved)} cover about ${months.toFixed(1)} months of spending (aim for 3+)`
            : "No savings recorded yet",
    });

    // 5. Spending limits (15)
    const limits = src.expData.limits;
    const limitChecks = [[view.spent, limits.total], ...Object.entries(limits.byCategory).map(([c, l]) => [view.byCat[c] || 0, l])]
        .filter(([, l]) => l);
    if (!limitChecks.length) {
        parts.push({ name: "Spending limits", max: 15, points: 8, detail: "No limits set. Set some on the Expenses page" });
    } else {
        let pts = 15, over = 0, near = 0;
        for (const [s, l] of limitChecks) {
            const lv = limitLevel(s, l).level;
            if (lv === "over") { pts -= 5; over++; } else if (lv === "near") { pts -= 2; near++; }
        }
        parts.push({
            name: "Spending limits", max: 15, points: Math.max(0, pts),
            detail: over || near
                ? `${over ? `${over} over` : ""}${over && near ? ", " : ""}${near ? `${near} close to` : ""} the limit${view.projected ? " (projected)" : ""}`
                : `Within all ${limitChecks.length} limit${limitChecks.length === 1 ? "" : "s"}`,
        });
    }

    const score = Math.round(parts.reduce((s, p) => s + p.points, 0));
    const grade = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs attention";
    return { score, grade, parts };
}

// ---------- main analysis ----------
function buildInsights(src, mk) {
    const view = monthView(src, mk);
    const prevViews = [1, 2, 3, 4, 5].map((i) => monthActual(src, shiftMk(mk, -i)));
    const last = prevViews[0];
    const prev3 = prevViews.slice(0, 3).filter((m) => m.spent > 0);

    // Highest spending categories, with change vs last month
    const top = Object.entries(view.byCat)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([cat, cents]) => ({
            cat, cents,
            share: view.spent ? cents / view.spent : 0,
            change: last.byCat[cat] ? (cents - last.byCat[cat]) / last.byCat[cat] : null,
        }));

    // Last 6 months
    const history = [view, ...prevViews].reverse().map((m) => ({
        mk: m.mk, income: m.income, spent: m.spent, actualSpent: m.projected ? m.actualSpent : m.spent, projected: m.projected,
    }));
    const avg3 = average(prev3.map((m) => m.spent));

    // Unusual spending
    const unusual = [];
    if (prev3.length >= 2) {
        for (const [cat, cents] of Object.entries(view.byCat)) {
            if (cat === "Subscriptions") continue; // covered by "Review subscriptions"
            const usual = average(prev3.map((m) => m.byCat[cat] || 0));
            if (usual > 0 && cents > usual * 1.3 && cents - usual >= 50000) {
                const usualR = Math.round(usual / 100) * 100;
                unusual.push({ kind: "category", cat, cents, usual: usualR, text: `${cat} is ${Math.round((cents / usual - 1) * 100)}% above usual: ${formatMoney(cents)} vs about ${formatMoney(usualR)}${view.projected ? " (projected)" : ""}.` });
            } else if (usual === 0 && cents >= 100000) {
                unusual.push({ kind: "new", cat, cents, text: `New spending on ${cat}: ${formatMoney(cents)}, where there was none in recent months.` });
            }
        }
    }
    // Single purchases far bigger than normal for their category
    const sixMonthsAgo = `${shiftMk(mk, -6)}-01`;
    for (const e of monthActual(src, mk).list) {
        const others = src.expenses.filter((x) => x.category === e.category && x.id !== e.id && x.date >= sixMonthsAgo).map((x) => x.amountCents);
        const typical = others.length ? median(others) : 0;
        if (others.length >= 3 && e.amountCents >= 100000 && e.amountCents >= typical * 3) {
            const ratio = e.amountCents / typical;
            const compare = ratio >= 10 ? `far above your typical ${e.category} purchase of ${formatMoney(typical)}` : `about ${Math.round(ratio)}× your typical ${e.category} purchase (${formatMoney(typical)})`;
            unusual.push({ kind: "purchase", cat: e.category, cents: e.amountCents, text: `"${e.description}" (${formatMoney(e.amountCents)}, ${e.date.slice(8)}/${e.date.slice(5, 7)}) is ${compare}.` });
        }
    }
    // On pace to go over a limit (current month only)
    if (view.projected) {
        const lim = src.expData.limits;
        const checks = [["Total spending", view.actualSpent, view.spent, lim.total],
            ...Object.entries(lim.byCategory).map(([c, l]) => [c, monthActual(src, mk).byCat[c] || 0, view.byCat[c] || 0, l])];
        for (const [label, now, proj, l] of checks) {
            if (l && now < l && proj > l) unusual.push({ kind: "pace", cat: label, cents: proj, text: `${label} is on pace to reach ${formatMoney(proj)}, over its ${formatMoney(l)} limit.` });
        }
    }

    // Forecast for next month: weighted average of the last 3 months (most recent counts most)
    // for everyday spending, plus subscriptions and loan repayments that are already scheduled.
    const nextMk = shiftMk(mk, 1);
    const base = [view, ...prevViews.slice(0, 2)].map((m, i) => ({ m, w: 3 - i })).filter(({ m }) => m.spent > 0);
    const wSum = base.reduce((s, b) => s + b.w, 0);
    const forecastByCat = {};
    if (wSum) {
        const cats = new Set(base.flatMap(({ m }) => Object.keys(m.varByCat)));
        for (const c of cats) {
            const v = Math.round(base.reduce((s, { m, w }) => s + (m.varByCat[c] || 0) * w, 0) / wSum / 100) * 100;
            if (v > 0) forecastByCat[c] = v;
        }
    }
    const subsNext = upcomingSubscriptionCharges(src, nextMk);
    const subsTotal = sumValues(subsNext);
    const loansNext = loanPaymentsIn(src, nextMk);
    const forecast = {
        mk: nextMk,
        rows: Object.entries(forecastByCat).sort((a, b) => b[1] - a[1]),
        subsTotal,
        loansNext,
        total: sumValues(forecastByCat) + subsTotal + loansNext,
        incomeExpected: sumCents(incomeForMonth(src.incomeData, nextMk)),
        monthsUsed: base.length,
    };

    // Ways to save
    const suggestions = [];
    const small = monthActual(src, mk).list.filter((e) => e.amountCents < SMALL_PURCHASE_CENTS && ["Food & drinks", "Other", "Entertainment"].includes(e.category));
    if (small.length >= 5) {
        const t = totalOf(small);
        suggestions.push({ monthly: Math.round(t / 2), title: "Small purchases add up", text: `${small.length} purchases under ${formatMoney(SMALL_PURCHASE_CENTS)} (snacks, drinks…) came to ${formatMoney(t)}. Halving them saves about ${formatMoney(t / 2)} a month, ${formatMoney(t * 6)} a year.` });
    }
    const subs = src.expData.subscriptions.filter((s) => s.active);
    if (subs.length) {
        const monthly = subs.reduce((s, x) => s + subscriptionMonthly(x), 0);
        const streaming = subs.filter((s) => STREAMING_RE.test(s.name));
        const biggest = [...subs].sort((a, b) => subscriptionMonthly(b) - subscriptionMonthly(a))[0];
        suggestions.push({
            monthly: streaming.length >= 2 ? subscriptionMonthly(streaming.sort((a, b) => subscriptionMonthly(a) - subscriptionMonthly(b))[0]) : subscriptionMonthly(biggest),
            title: "Review subscriptions",
            text: `${subs.length} subscription${subs.length === 1 ? "" : "s"} cost ${formatMoney(monthly)} a month (${formatMoney(monthly * 12)} a year).` +
                (streaming.length >= 2
                    ? ` You have ${streaming.length} streaming/music services (${streaming.map((s) => s.name).join(", ")}). Keeping one at a time and rotating could save ${formatMoney(subscriptionMonthly(streaming[0]))}+ a month.`
                    : ` Cancelling one you rarely use, like ${biggest.name}, saves ${formatMoney(subscriptionMonthly(biggest))} a month.`),
        });
    }
    for (const u of unusual.filter((x) => x.kind === "category")) {
        suggestions.push({ monthly: Math.round(u.cents - u.usual), title: `Bring ${u.cat} back to normal`, text: `Getting ${u.cat} back to its usual ${formatMoney(u.usual)} would save ${formatMoney(u.cents - u.usual)} this month.` });
    }
    for (const l of src.loans) {
        const st = LoanEngine.loanState(l, l.history || []);
        if (st.done || !st.next) continue;
        if (l.method === "flat" && l.annualRate > 0) {
            suggestions.push({ monthly: 0, title: `${l.name}: compare the real rate`, text: `This ${l.annualRate}% flat-rate loan costs about ${LoanEngine.effectiveAnnualRate(l).toFixed(1)}% a year in reality. If banks offer a lower reducing-balance rate, refinancing could cut the ${formatMoney(st.interestLeft)} interest still to pay.` });
        } else if (l.method === "reducing" && l.annualRate > 0) {
            // Re-run the rest of the loan from today's balance, with and without Rs 1,000 extra
            const perYear = LoanEngine.FREQUENCIES[l.frequency].perYear;
            const remaining = st.rows.length - st.paidCount;
            const rest = { ...l, principalCents: st.balance, termMonths: Math.max(1, Math.round((remaining / perYear) * 12)), firstPaymentDate: st.next.date };
            const base0 = LoanEngine.summarise(LoanEngine.schedule(rest));
            const extra = LoanEngine.summarise(LoanEngine.schedule(rest, { extraPerPeriod: 100000 }));
            const saved = base0.totalInterest - extra.totalInterest;
            if (saved > 0) {
                suggestions.push({ monthly: 0, lifetime: saved, title: `${l.name}: pay a little extra`, text: `Adding ${formatMoney(100000)} to each repayment saves about ${formatMoney(saved)} in interest and finishes ${base0.count - extra.count} repayments early.` });
            }
        }
    }
    const left = view.income - view.spent - view.loanPay;
    if (view.income > 0 && left / view.income < 0.1) {
        suggestions.push({ monthly: 0, title: "Pay yourself first", text: `Only ${Math.max(0, Math.round((left / view.income) * 100))}% of income is left over. Moving ${formatMoney(Math.round(view.income * 0.1))} (10%) into savings on payday makes it automatic.` });
    }
    suggestions.sort((a, b) => (b.monthly || 0) - (a.monthly || 0));

    return { mk, view, last, prevViews, avg3, top, history, unusual, forecast, suggestions, health: healthScore(src, view, prevViews) };
}

// ---------- summary text ----------
function summaryParagraphs(ins, src) {
    const { view, last, avg3, top, health } = ins;
    const name = monthLabel(ins.mk);
    const p = [];
    const left = view.income - view.spent - view.loanPay;
    const spentText = view.projected ? `are on track to spend about ${formatMoney(view.spent)} (${formatMoney(view.actualSpent)} so far)` : `spent ${formatMoney(view.spent)}`;
    if (view.income > 0) {
        p.push(`In ${name} you earned ${formatMoney(view.income)} and ${spentText}` +
            (view.loanPay ? `, plus ${formatMoney(view.loanPay)} in loan repayments` : "") +
            (left >= 0 ? `. That leaves ${formatMoney(left)}, ${Math.round((left / view.income) * 100)}% of your income.` : `. That's ${formatMoney(-left)} more than you earned.`));
    } else {
        p.push(`In ${name} you ${spentText}` + (view.loanPay ? ` plus ${formatMoney(view.loanPay)} in loan repayments` : "") + `. No income is recorded for this month.`);
    }
    if (top.length) {
        const parts = top.slice(0, 3).map((t) => `${t.cat} (${formatMoney(t.cents)}, ${Math.round(t.share * 100)}%)`);
        p.push(`Your biggest costs were ${parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts.at(-1) : parts[0]}.`);
    }
    if (last.spent > 0) {
        const ch = (view.spent - last.spent) / last.spent;
        p.push(`That's ${Math.abs(Math.round(ch * 100))}% ${ch >= 0 ? "more" : "less"} than last month (${formatMoney(last.spent)})` +
            (avg3 ? ` and ${view.spent >= avg3 ? "above" : "below"} your 3-month average of ${formatMoney(avg3)}.` : "."));
    }
    const balance = savingsBalanceAt(src, `${ins.mk}-31`);
    if (view.savedNet || balance) {
        p.push((view.savedNet > 0 ? `You put ${formatMoney(view.savedNet)} into savings. ` : view.savedNet < 0 ? `You took ${formatMoney(-view.savedNet)} out of savings. ` : "") +
            `Total savings: ${formatMoney(balance)}` + (src.savingsData.goals.length ? ` across ${src.savingsData.goals.length} goal${src.savingsData.goals.length === 1 ? "" : "s"}.` : "."));
    }
    p.push(`Financial health score: ${health.score}/100 (${health.grade}).`);
    return p;
}

// ---------- rendering ----------
const $ = (id) => document.getElementById(id);

function formatMoney(cents) {
    const abs = Math.abs(Math.round(cents));
    const whole = Math.floor(abs / 100).toLocaleString("en-US");
    const frac = abs % 100;
    return `${cents < 0 ? "-" : ""}Rs ${whole}${frac ? "." + String(frac).padStart(2, "0") : ""}`;
}

const CAT_COLORS = {
    Groceries: "bg-teal-600", Bills: "bg-slate-500", Fuel: "bg-amber-500", "Food & drinks": "bg-orange-500",
    Transport: "bg-sky-500", Subscriptions: "bg-pink-500", Shopping: "bg-indigo-500", Entertainment: "bg-fuchsia-500",
    Health: "bg-emerald-500", Other: "bg-violet-500",
};

let src = null;
let viewMk = mkOf(new Date());

function render() {
    src = loadSources();
    const currentMk = mkOf(src.today);
    $("monthLabel").textContent = monthLabel(viewMk);
    $("nextMonth").disabled = viewMk >= currentMk;

    const empty = !hasAnyData(src);
    $("emptyState").classList.toggle("hidden", !empty);
    $("content").classList.toggle("hidden", empty);
    if (empty) { $("monthNote").textContent = ""; return; }

    const ins = buildInsights(src, viewMk);
    $("monthNote").textContent = ins.view.projected ? `Month in progress: day ${src.today.getDate()} of ${daysIn(viewMk)}, figures projected to month end` : "";

    renderHealth(ins.health);
    renderSummary(ins);
    renderTop(ins);
    renderHistory(ins);
    renderUnusual(ins);
    renderForecast(ins);
    renderSuggestions(ins);
}

function renderHealth(h) {
    const ring = $("scoreRing");
    const color = h.score >= 60 ? "stroke-teal-500" : h.score >= 40 ? "stroke-amber-500" : "stroke-red-500";
    ring.setAttribute("class", `${color} transition-all duration-700`);
    ring.setAttribute("stroke-dashoffset", String(326.7 * (1 - h.score / 100)));
    $("scoreValue").textContent = h.score;
    $("scoreGrade").textContent = h.grade;
    const weakest = [...h.parts].sort((a, b) => a.points / a.max - b.points / b.max)[0];
    $("scoreSummary").textContent = weakest.points / weakest.max < 0.99 ? `Biggest room to improve: ${weakest.name.toLowerCase()}.` : "Everything looks healthy.";

    const ul = $("scoreParts");
    ul.innerHTML = "";
    for (const part of h.parts) {
        const pct = (part.points / part.max) * 100;
        const li = document.createElement("li");
        li.innerHTML = `
            <div class="flex justify-between text-sm"><span class="n font-medium"></span><span class="p tabular-nums"></span></div>
            <div class="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-neutral-800">
              <div class="h-1.5 rounded-full ${pct >= 75 ? "bg-teal-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500"}" style="width: ${pct}%"></div>
            </div>
            <p class="d mt-1 text-xs text-slate-500 dark:text-neutral-400"></p>`;
        li.querySelector(".n").textContent = part.name;
        li.querySelector(".p").textContent = `${Math.round(part.points)} / ${part.max}`;
        li.querySelector(".d").textContent = part.detail;
        ul.appendChild(li);
    }
}

function renderSummary(ins) {
    const v = ins.view;
    const stats = [
        ["Income", formatMoney(v.income)],
        [v.projected ? "Spent (projected)" : "Spent", formatMoney(v.spent)],
        ["Loan repayments", formatMoney(v.loanPay)],
        ["Left over", formatMoney(v.income - v.spent - v.loanPay)],
    ];
    const dl = $("summaryStats");
    dl.innerHTML = "";
    for (const [k, val] of stats) {
        const div = document.createElement("div");
        div.innerHTML = `<dt class="text-slate-500 dark:text-neutral-400"></dt><dd class="font-semibold"></dd>`;
        div.querySelector("dt").textContent = k;
        div.querySelector("dd").textContent = val;
        dl.appendChild(div);
    }
    const paras = summaryParagraphs(ins, src);
    const box = $("summaryText");
    box.innerHTML = "";
    for (const t of paras) {
        const p = document.createElement("p");
        p.textContent = t;
        box.appendChild(p);
    }
    $("copySummary").onclick = async () => {
        const text = `${monthLabel(ins.mk)} summary\n\n` + stats.map(([k, val]) => `${k}: ${val}`).join("\n") + "\n\n" + paras.join("\n\n");
        try {
            await navigator.clipboard.writeText(text);
            $("copySummary").textContent = "Copied";
        } catch (e) {
            $("copySummary").textContent = "Couldn't copy";
        }
        setTimeout(() => { $("copySummary").textContent = "Copy"; }, 1500);
    };
}

function renderTop(ins) {
    const box = $("topCategories");
    box.innerHTML = "";
    if (!ins.top.length) {
        box.innerHTML = `<p class="text-sm text-slate-500 dark:text-neutral-400">No spending recorded this month.</p>`;
        return;
    }
    for (const t of ins.top) {
        const row = document.createElement("div");
        const changeCls = t.change == null ? "text-slate-500 dark:text-neutral-400" : t.change > 0 ? "text-red-500" : "text-teal-700 dark:text-teal-400";
        row.innerHTML = `
            <div class="mb-2 flex justify-between gap-2 text-sm">
              <span class="c font-medium"></span>
              <span><span class="a"></span> <span class="ch text-xs ${changeCls}"></span></span>
            </div>
            <div class="h-2 rounded-full bg-slate-200 dark:bg-neutral-800">
              <div class="h-2 rounded-full ${CAT_COLORS[t.cat] || "bg-slate-400"}" style="width: ${t.share * 100}%"></div>
            </div>`;
        row.querySelector(".c").textContent = t.cat;
        row.querySelector(".a").textContent = `${formatMoney(t.cents)} · ${Math.round(t.share * 100)}%`;
        row.querySelector(".ch").textContent = t.change == null ? "new" : `${t.change > 0 ? "▲" : "▼"} ${Math.abs(Math.round(t.change * 100))}%`;
        box.appendChild(row);
    }
}

function renderHistory(ins) {
    const box = $("history");
    box.innerHTML = "";
    const max = Math.max(1, ...ins.history.flatMap((m) => [m.income, m.spent]));
    for (const m of ins.history) {
        const row = document.createElement("div");
        row.className = "grid grid-cols-[3.5rem_1fr] items-center gap-3 text-sm";
        const solid = (m.actualSpent / max) * 100;
        const extra = ((m.spent - m.actualSpent) / max) * 100;
        row.innerHTML = `
            <span class="text-slate-600 dark:text-neutral-300"></span>
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <div class="h-2 rounded-full bg-teal-600" style="width: ${(m.income / max) * 100}%"></div>
                <span class="i whitespace-nowrap text-xs"></span>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex h-2" style="width: ${solid + extra}%">
                  <div class="h-2 rounded-l-full bg-slate-500 ${extra ? "" : "rounded-r-full"}" style="width: ${solid + extra ? (solid / (solid + extra)) * 100 : 0}%"></div>
                  <div class="h-2 rounded-r-full bg-slate-500/40" style="width: ${solid + extra ? (extra / (solid + extra)) * 100 : 0}%"></div>
                </div>
                <span class="s whitespace-nowrap text-xs text-slate-500 dark:text-neutral-400"></span>
              </div>
            </div>`;
        row.querySelector("span").textContent = monthLabel(m.mk, { month: "short" });
        row.querySelector(".i").textContent = formatMoney(m.income);
        row.querySelector(".s").textContent = formatMoney(m.spent) + (m.projected ? " (proj.)" : "");
        box.appendChild(row);
    }
    const v = ins.view;
    $("historyNote").textContent = ins.avg3
        ? `${v.projected ? "Projected spending" : "Spending"} is ${Math.abs(Math.round((v.spent / ins.avg3 - 1) * 100))}% ${v.spent >= ins.avg3 ? "above" : "below"} your 3-month average of ${formatMoney(ins.avg3)}.`
        : "Track a few months to see comparisons.";
}

function renderUnusual(ins) {
    const ul = $("unusual");
    ul.innerHTML = "";
    if (!ins.unusual.length) {
        const prevMonths = ins.prevViews.slice(0, 3).filter((m) => m.spent > 0).length;
        ul.innerHTML = `<li class="text-sm text-slate-500 dark:text-neutral-400"></li>`;
        ul.firstChild.textContent = prevMonths >= 2 ? "Nothing unusual. Spending is in line with recent months." : "Needs at least 2 previous months of expenses to spot unusual spending.";
        return;
    }
    for (const u of ins.unusual) {
        const li = document.createElement("li");
        li.className = "rounded-xl border p-3 text-sm " + (u.kind === "pace"
            ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
            : "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200");
        li.textContent = u.text;
        ul.appendChild(li);
    }
}

function renderForecast(ins) {
    const f = ins.forecast;
    $("forecastTitle").textContent = `${monthLabel(f.mk)} forecast`;
    $("forecastTotal").textContent = f.total ? formatMoney(f.total) : "–";
    $("forecastNote").textContent = f.monthsUsed
        ? `Based on ${f.monthsUsed} month${f.monthsUsed === 1 ? "" : "s"} of spending (recent months count more), plus scheduled subscriptions and loan repayments.` +
          (f.incomeExpected ? ` Expected income: ${formatMoney(f.incomeExpected)}, leaving about ${formatMoney(f.incomeExpected - f.total)}.` : "")
        : "Record some expenses to get a forecast.";
    const body = $("forecastRows");
    body.innerHTML = "";
    const rows = [...f.rows.map(([c, v]) => [c, v, ""]),
        ...(f.subsTotal ? [["Subscriptions (scheduled)", f.subsTotal, "exact"]] : []),
        ...(f.loansNext ? [["Loan repayments (scheduled)", f.loansNext, "exact"]] : [])];
    for (const [label, cents, tag] of rows) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="py-2"></td><td class="py-2 text-right tabular-nums"></td>`;
        tr.cells[0].textContent = label;
        tr.cells[1].textContent = (tag ? "" : "~") + formatMoney(cents);
        body.appendChild(tr);
    }
}

function renderSuggestions(ins) {
    const ul = $("suggestions");
    ul.innerHTML = "";
    if (!ins.suggestions.length) {
        ul.innerHTML = `<li class="text-sm text-slate-500 dark:text-neutral-400">No suggestions right now. Keep tracking and check back.</li>`;
        return;
    }
    for (const s of ins.suggestions) {
        const li = document.createElement("li");
        li.className = "rounded-xl bg-slate-50 p-3 dark:bg-neutral-900";
        li.innerHTML = `<div class="flex items-start justify-between gap-3"><p class="t font-medium"></p><span class="m whitespace-nowrap text-sm font-semibold text-teal-700 dark:text-teal-400"></span></div><p class="x mt-1 text-sm text-slate-600 dark:text-neutral-300"></p>`;
        li.querySelector(".t").textContent = s.title;
        li.querySelector(".m").textContent = s.monthly ? `~${formatMoney(s.monthly)}/mo` : s.lifetime ? `~${formatMoney(s.lifetime)}` : "";
        li.querySelector(".x").textContent = s.text;
        ul.appendChild(li);
    }
}

$("prevMonth").addEventListener("click", () => { viewMk = shiftMk(viewMk, -1); render(); });
$("nextMonth").addEventListener("click", () => { viewMk = shiftMk(viewMk, 1); render(); });

if (typeof document !== "undefined" && document.getElementById("content")) render();
