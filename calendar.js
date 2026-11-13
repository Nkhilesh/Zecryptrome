// Money calendar: income and payments for every day, from all the other pages.
//   income-store.js   income (one-off + recurring)
//   expenses-store.js expenses, subscription charges (past + scheduled), scanned receipts
//   "scan.history.v1" bills (shown on their due date)
//   loans-engine.js + "loans.v1"  loan repayments (paid + scheduled)
//   savings-store.js  savings deposits/withdrawals (shown, not counted as spending)

const KINDS = {
    income: { label: "Income", dot: "bg-teal-500", href: "income.html", sign: 1 },
    expense: { label: "Expenses", dot: "bg-slate-500", href: "expenses.html", sign: -1 },
    bill: { label: "Bills", dot: "bg-amber-500", href: "scan.html?mode=bills", sign: -1 },
    subscription: { label: "Subscriptions", dot: "bg-pink-500", href: "expenses.html", sign: -1 },
    loan: { label: "Loans", dot: "bg-indigo-500", href: "loans.html", sign: -1 },
    savings: { label: "Savings", dot: "bg-sky-500", href: "savings.html", sign: 0 },
};
const STATUS = {
    done: { text: "", cls: "" },
    upcoming: { text: "Upcoming", cls: "bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-neutral-300" },
    overdue: { text: "Overdue", cls: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" },
    paid: { text: "Paid", cls: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300" },
};
const FILTER_KEY = "calendar.filters";

const $ = (id) => document.getElementById(id);

// ---------- helpers ----------
function calIso(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const calMk = (d) => calIso(d).slice(0, 7);
function shiftMonth(mk, n) {
    const [y, m] = mk.split("-").map(Number);
    return calMk(new Date(y, m - 1 + n, 1));
}
const monthEnd = (mk) => { const [y, m] = mk.split("-").map(Number); return calIso(new Date(y, m, 0)); };

function formatMoney(cents) {
    const abs = Math.abs(Math.round(cents));
    const whole = Math.floor(abs / 100).toLocaleString("en-US");
    const frac = abs % 100;
    return `${cents < 0 ? "-" : ""}Rs ${whole}${frac ? "." + String(frac).padStart(2, "0") : ""}`;
}
// Short amounts for the small day cells: 35000 -> "35k", 1250 -> "1.3k", 450 -> "450"
function compact(cents) {
    const r = Math.abs(cents) / 100;
    if (r >= 10000) return Math.round(r / 1000) + "k";
    if (r >= 1000) return (r / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(Math.round(r));
}
const longDate = (iso) => new Date(iso + "T00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDate = (iso) => new Date(iso + "T00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

// ---------- data ----------
function loadAll() {
    const expData = loadExpenseData();
    if (syncSubscriptions(expData) > 0) {
        try { saveExpenseData(expData); } catch (e) {}
    }
    let loans = [], scans = [];
    try { loans = JSON.parse(AppStorage.getItem("loans.v1")) || []; } catch (e) {}
    try { scans = JSON.parse(AppStorage.getItem("scan.history.v1")) || []; } catch (e) {}
    return { expData, incomeData: loadIncome(), savingsData: loadSavings(), loans, scans };
}

// Every event in month mk, as { date, kind, title, detail, cents, status }
function eventsForMonth(src, mk, today) {
    const out = [];
    const inMonth = (d) => d && d.startsWith(mk);
    const end = monthEnd(mk);

    for (const e of incomeForMonth(src.incomeData, mk)) {
        out.push({ date: e.date, kind: "income", title: e.source, detail: e.type + (e.recurring ? " · monthly" : ""), cents: e.amountCents, status: e.date <= today ? "done" : "upcoming" });
    }

    for (const e of src.expData.expenses) {
        if (!inMonth(e.date)) continue;
        out.push({ date: e.date, kind: e.subscriptionId ? "subscription" : "expense", title: e.description, detail: e.category + (e.note ? ` · ${e.note}` : ""), cents: e.amountCents, status: "done" });
    }
    // Scheduled subscription charges that haven't happened yet
    for (const s of src.expData.subscriptions) {
        if (!s.active) continue;
        let d = s.nextDate, guard = 0;
        while (d <= end && guard++ < 400) {
            if (inMonth(d)) out.push({ date: d, kind: "subscription", title: s.name, detail: `${s.category} · renews ${s.cycle}`, cents: s.amountCents, status: "upcoming" });
            d = nextBillingDate(d, s.cycle, s.day);
        }
    }

    for (const r of src.scans) {
        if (r.kind === "grocery" && inMonth(r.date)) {
            out.push({ date: r.date, kind: "expense", title: r.store || "Grocery receipt", detail: `Groceries · ${r.items?.length || 0} items (scanned)`, cents: r.totalCents, status: "done" });
        }
        if (r.kind === "bill") {
            const d = r.dueDate || r.billDate;
            if (!inMonth(d)) continue;
            out.push({ date: d, kind: "bill", title: `${r.provider || r.type} bill`, detail: r.type + (r.account ? ` · acc ${r.account}` : ""), cents: r.amountCents, status: r.paid ? "paid" : d < today ? "overdue" : "upcoming" });
        }
    }

    for (const l of src.loans) {
        const st = LoanEngine.loanState(l, l.history || []);
        st.rows.forEach((row, i) => {
            if (!inMonth(row.date)) return;
            const status = i < st.paidCount ? "paid" : row.date < today ? "overdue" : "upcoming";
            out.push({ date: row.date, kind: "loan", title: l.name, detail: `Repayment ${row.k} of ${st.rows.length}`, cents: row.payment, status });
        });
    }

    const goals = new Map(src.savingsData.goals.map((g) => [g.id, g.name]));
    for (const t of src.savingsData.transactions) {
        if (!inMonth(t.date)) continue;
        const where = t.goalId == null ? "General savings" : goals.get(t.goalId) || "Savings";
        out.push({ date: t.date, kind: "savings", title: t.type === "deposit" ? `Saved to ${where}` : `Withdrew from ${where}`, detail: t.note || "", cents: t.type === "deposit" ? t.amountCents : -t.amountCents, status: "done" });
    }
    return out;
}

function groupByDay(events) {
    const map = new Map();
    for (const e of events) {
        if (!map.has(e.date)) map.set(e.date, []);
        map.get(e.date).push(e);
    }
    return map;
}

function dayTotals(events) {
    let inC = 0, outC = 0, saved = 0, allUpcoming = true;
    for (const e of events) {
        const sign = KINDS[e.kind].sign;
        if (sign > 0) inC += e.cents;
        else if (sign < 0) outC += e.cents;
        else saved += e.cents;
        if (sign < 0 && e.status === "done") allUpcoming = false;
        if (sign < 0 && e.status === "paid") allUpcoming = false;
    }
    return { inC, outC, saved, allUpcoming };
}

// ---------- state ----------
let src = null;
const todayIso = calIso(new Date());
let viewMk = calMk(new Date());
let selected = todayIso;
let enabled = new Set(Object.keys(KINDS));
try {
    const saved = JSON.parse(AppStorage.getItem(FILTER_KEY));
    if (Array.isArray(saved)) enabled = new Set(saved.filter((k) => KINDS[k]));
} catch (e) {}

const visible = (events) => events.filter((e) => enabled.has(e.kind));

// ---------- render ----------
function render() {
    src = loadAll();
    $("monthLabel").textContent = new Date(viewMk + "-01T00:00").toLocaleString("en-US", { month: "long", year: "numeric" });
    const events = visible(eventsForMonth(src, viewMk, todayIso));
    const byDay = groupByDay(events);

    renderTotals(events);
    renderFilters();
    renderGrid(byDay);
    renderDay(byDay.get(selected) || []);
    renderUpcoming();
}

function renderTotals(events) {
    const t = dayTotals(events);
    $("totIn").textContent = formatMoney(t.inC);
    $("totOut").textContent = formatMoney(t.outC);
    const net = t.inC - t.outC;
    $("totNet").textContent = formatMoney(net);
    $("totNet").className = "font-semibold " + (net < 0 ? "text-red-500" : "");
    const due = events.filter((e) => KINDS[e.kind].sign < 0 && (e.status === "upcoming" || e.status === "overdue"));
    const overdue = due.filter((e) => e.status === "overdue");
    $("totNote").textContent = [
        due.length ? `${formatMoney(due.reduce((s, e) => s + e.cents, 0))} still to pay this month` : "",
        overdue.length ? `${overdue.length} overdue` : "",
        t.saved ? `${formatMoney(t.saved)} moved to savings` : "",
    ].filter(Boolean).join(" · ");
}

function renderFilters() {
    const box = $("filters");
    box.innerHTML = "";
    for (const [kind, k] of Object.entries(KINDS)) {
        const on = enabled.has(kind);
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("aria-pressed", on);
        b.className = "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium " +
            (on ? "border-slate-300 dark:border-neutral-700" : "border-dashed border-slate-300 text-slate-400 dark:border-neutral-700 dark:text-neutral-500");
        b.innerHTML = `<span class="h-2 w-2 rounded-full ${on ? k.dot : "bg-slate-300 dark:bg-neutral-700"}"></span>`;
        b.append(k.label);
        b.addEventListener("click", () => {
            if (on) enabled.delete(kind); else enabled.add(kind);
            try { AppStorage.setItem(FILTER_KEY, JSON.stringify([...enabled])); } catch (e) {}
            render();
        });
        box.appendChild(b);
    }
}

function renderGrid(byDay) {
    const grid = $("grid");
    grid.innerHTML = "";
    const [y, m] = viewMk.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const days = new Date(y, m, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // Monday first

    for (let i = 0; i < offset; i++) grid.appendChild(document.createElement("div"));

    for (let d = 1; d <= days; d++) {
        const iso = `${viewMk}-${String(d).padStart(2, "0")}`;
        const evs = byDay.get(iso) || [];
        const t = dayTotals(evs);
        const isToday = iso === todayIso, isSel = iso === selected;
        const hasOverdue = evs.some((e) => e.status === "overdue");

        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "flex min-h-[4.5rem] flex-col items-stretch rounded-lg border p-1 text-left transition sm:min-h-[5.5rem] sm:p-1.5 " +
            (isSel ? "border-teal-600 ring-1 ring-teal-600 " : "border-slate-200 dark:border-neutral-800 ") +
            (iso < todayIso ? "bg-slate-50/60 dark:bg-neutral-950 " : "") +
            "hover:bg-slate-50 dark:hover:bg-neutral-900";
        cell.setAttribute("aria-label", `${longDate(iso)}: ${evs.length} item${evs.length === 1 ? "" : "s"}`);

        const num = document.createElement("span");
        num.className = "flex h-5 w-5 items-center justify-center rounded-full text-xs " +
            (isToday ? "bg-teal-600 font-semibold text-white" : "text-slate-600 dark:text-neutral-300");
        num.textContent = d;
        cell.appendChild(num);

        const amounts = document.createElement("div");
        amounts.className = "mt-auto space-y-0.5 text-[10px] font-semibold leading-tight tabular-nums sm:text-xs";
        if (t.inC) amounts.insertAdjacentHTML("beforeend", `<p class="text-teal-700 dark:text-teal-400">+${compact(t.inC)}</p>`);
        if (t.outC) amounts.insertAdjacentHTML("beforeend", `<p class="${hasOverdue ? "text-red-600 underline decoration-dotted" : "text-red-500"} ${t.allUpcoming && !hasOverdue ? "opacity-60" : ""}">−${compact(t.outC)}</p>`);
        cell.appendChild(amounts);

        const kinds = [...new Set(evs.map((e) => e.kind))];
        if (kinds.length) {
            const dots = document.createElement("div");
            dots.className = "mt-1 flex flex-wrap gap-0.5";
            for (const k of kinds) dots.insertAdjacentHTML("beforeend", `<span class="h-1.5 w-1.5 rounded-full ${KINDS[k].dot}"></span>`);
            cell.appendChild(dots);
        }

        cell.addEventListener("click", () => { selected = iso; render(); });
        grid.appendChild(cell);
    }
}

function eventRow(e, showDate = false) {
    const k = KINDS[e.kind];
    const st = STATUS[e.status];
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = k.href;
    a.className = "flex items-center justify-between gap-3 p-3 hover:bg-slate-50 dark:hover:bg-neutral-900";
    a.innerHTML = `
        <span class="flex min-w-0 items-start gap-2.5">
          <span class="mt-1.5 h-2 w-2 flex-none rounded-full ${k.dot}"></span>
          <span class="min-w-0">
            <span class="t block truncate font-medium"></span>
            <span class="d block truncate text-xs text-slate-500 dark:text-neutral-400"></span>
          </span>
        </span>
        <span class="flex flex-none flex-col items-end gap-1">
          <span class="amt font-semibold tabular-nums"></span>
          ${st.text ? `<span class="rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}">${st.text}</span>` : ""}
        </span>`;
    a.querySelector(".t").textContent = e.title;
    a.querySelector(".d").textContent = [showDate && shortDate(e.date), k.label, e.detail].filter(Boolean).join(" · ");
    const amt = a.querySelector(".amt");
    if (k.sign > 0) { amt.textContent = "+" + formatMoney(e.cents); amt.classList.add("text-teal-700", "dark:text-teal-400"); }
    else if (k.sign < 0) { amt.textContent = "−" + formatMoney(e.cents); amt.classList.add("text-red-500"); }
    else { amt.textContent = (e.cents >= 0 ? "→ " : "← ") + formatMoney(Math.abs(e.cents)); amt.classList.add("text-sky-600", "dark:text-sky-400"); }
    li.appendChild(a);
    return li;
}

function renderDay(events) {
    $("dayTitle").textContent = selected.startsWith(viewMk) ? longDate(selected) : "Pick a day";
    const ul = $("dayList");
    ul.innerHTML = "";
    const t = dayTotals(events);
    const net = t.inC - t.outC;
    $("dayNet").textContent = events.length ? (net >= 0 ? "+" : "−") + formatMoney(Math.abs(net)) : "";
    $("dayNet").className = "text-sm font-semibold " + (net < 0 ? "text-red-500" : "text-teal-700 dark:text-teal-400");
    if (!events.length) {
        ul.innerHTML = `<li class="py-2 text-sm text-slate-500 dark:text-neutral-400">Nothing on this day.</li>`;
        return;
    }
    // Money in first, then out (largest first), then savings
    const order = (e) => (KINDS[e.kind].sign > 0 ? 0 : KINDS[e.kind].sign < 0 ? 1 : 2);
    for (const e of [...events].sort((a, b) => order(a) - order(b) || b.cents - a.cents)) ul.appendChild(eventRow(e));
}

// Payments and income due from today to 30 days ahead (plus anything overdue), whatever month is shown
function renderUpcoming() {
    const limit = calIso(new Date(Date.now() + 30 * 86400000));
    const thisMk = calMk(new Date());
    const months = [shiftMonth(thisMk, -1), thisMk, shiftMonth(thisMk, 1), shiftMonth(thisMk, 2)];
    const events = visible(months.flatMap((mk) => eventsForMonth(src, mk, todayIso)))
        .filter((e) => (e.status === "upcoming" && e.date >= todayIso && e.date <= limit) || e.status === "overdue")
        .sort((a, b) => a.date.localeCompare(b.date));

    const ul = $("upcoming");
    ul.innerHTML = "";
    const outTotal = events.filter((e) => KINDS[e.kind].sign < 0).reduce((s, e) => s + e.cents, 0);
    const inTotal = events.filter((e) => KINDS[e.kind].sign > 0).reduce((s, e) => s + e.cents, 0);
    $("upcomingTotal").textContent = events.length
        ? `${formatMoney(outTotal)} to pay${inTotal ? ` · ${formatMoney(inTotal)} coming in` : ""}`
        : "";
    if (!events.length) {
        ul.innerHTML = `<li class="p-3 text-sm text-slate-500 dark:text-neutral-400">Nothing scheduled. Recurring income, subscriptions, bills and loans show up here.</li>`;
        return;
    }
    for (const e of events.slice(0, 25)) ul.appendChild(eventRow(e, true));
}

// ---------- navigation ----------
function goToMonth(mk) {
    viewMk = mk;
    selected = mk === calMk(new Date()) ? todayIso : `${mk}-01`;
    render();
}
$("prevMonth").addEventListener("click", () => goToMonth(shiftMonth(viewMk, -1)));
$("nextMonth").addEventListener("click", () => goToMonth(shiftMonth(viewMk, 1)));
$("todayBtn").addEventListener("click", () => goToMonth(calMk(new Date())));

render();
