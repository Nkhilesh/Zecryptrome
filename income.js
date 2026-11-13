// Income page. Data helpers live in income-store.js.

const TYPE_COLORS = {
    Salary: "bg-teal-600",
    "Part-time": "bg-sky-500",
    Freelance: "bg-violet-500",
    Commission: "bg-amber-500",
    Other: "bg-slate-400",
};
const SOURCE_HINTS = {
    Salary: "Employer",
    "Part-time": "Where you work",
    Freelance: "Client or project",
    Commission: "Company or sale",
    Other: "Description",
};

const $ = (id) => document.getElementById(id);
const dialog = $("add-dialog");
const form = $("add-form");

let data = loadIncome();
let viewMonth = new Date();
viewMonth.setDate(1);

// ---------- helpers ----------
function formatMoney(cents) {
    const abs = Math.abs(Math.round(cents));
    const whole = Math.floor(abs / 100).toLocaleString("en-US");
    const frac = abs % 100;
    return `${cents < 0 ? "-" : ""}Rs ${whole}${frac ? "." + String(frac).padStart(2, "0") : ""}`;
}

// "45.5" -> 4550, parsed from the text so there's no floating-point error
function inputToCents(value) {
    const m = /^\s*(\d+)(?:\.(\d*))?\s*$/.exec(String(value));
    if (!m) return NaN;
    const frac = m[2] || "";
    let cents = parseInt(m[1], 10) * 100 + parseInt((frac + "00").slice(0, 2), 10);
    if (frac.length > 2 && frac[2] >= "5") cents += 1;
    return cents;
}

function isoDate(d = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const monthName = (d, opts = { month: "long", year: "numeric" }) => d.toLocaleString("en-US", opts);

function persist() {
    try {
        saveIncome(data);
    } catch (e) {
        alert("Couldn't save: this browser's storage is full or blocked.");
    }
    render();
}

function smallButton(text, onClick, extra = "") {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.className = "rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:border-neutral-700 dark:hover:bg-neutral-800 " + extra;
    b.addEventListener("click", onClick);
    return b;
}

// ---------- render ----------
function render() {
    const mk = incomeMonthKey(viewMonth);
    const prevMk = incomeMonthKey(addMonths(viewMonth, -1));
    $("monthLabel").textContent = monthName(viewMonth);

    const entries = incomeForMonth(data, mk);
    const total = sumCents(entries);
    const prevTotal = sumCents(incomeForMonth(data, prevMk));

    // Summary
    $("totalIncome").textContent = formatMoney(total);
    if (prevTotal) {
        const pct = Math.round(((total - prevTotal) / prevTotal) * 100);
        $("incomeCompare").textContent = pct === 0
            ? "Same as last month"
            : `${Math.abs(pct)}% ${pct > 0 ? "more" : "less"} than last month`;
    } else {
        $("incomeCompare").textContent = total ? "Nothing recorded last month" : "";
    }

    const expenses = recordedExpensesForMonth(mk);
    const remaining = total - expenses.total;
    $("remaining").textContent = formatMoney(remaining);
    $("remaining").classList.toggle("text-red-500", remaining < 0);
    $("expensesNote").textContent = expenses.total
        ? `After ${formatMoney(expenses.total)} recorded (groceries ${formatMoney(expenses.groceries)}, bills ${formatMoney(expenses.bills)})`
        : "No scanned receipts or bills this month yet";

    renderByType(entries, total);
    renderEntries(entries, mk);
    renderHistory();
}

function renderByType(entries, total) {
    const box = $("byType");
    box.innerHTML = "";
    const byType = {};
    for (const e of entries) byType[e.type] = (byType[e.type] || 0) + e.amountCents;
    const rows = Object.entries(byType).sort((a, b) => b[1] - a[1]);
    if (!rows.length) {
        box.innerHTML = `<p class="text-sm text-slate-500 dark:text-neutral-400">Nothing yet.</p>`;
        return;
    }
    for (const [type, cents] of rows) {
        const pct = Math.round((cents / total) * 100);
        const row = document.createElement("div");
        row.innerHTML = `
            <div class="mb-2 flex justify-between text-sm"><span class="t"></span><span class="a"></span></div>
            <div class="h-2 rounded-full bg-slate-200 dark:bg-neutral-800">
              <div class="h-2 rounded-full ${TYPE_COLORS[type] || "bg-slate-400"}" style="width: ${pct}%"></div>
            </div>`;
        row.querySelector(".t").textContent = type;
        row.querySelector(".a").textContent = `${formatMoney(cents)} · ${pct}%`;
        box.appendChild(row);
    }
}

function renderEntries(entries, mk) {
    const ul = $("entryList");
    ul.innerHTML = "";

    // Recurring entries skipped this month, so they can be restored
    const skipped = data.recurring.filter((r) => recurringActiveIn(r, mk) && (r.skips || []).includes(mk));

    $("empty").textContent = entries.length || skipped.length
        ? ""
        : "No income recorded for this month. Tap + to add your salary or other earnings.";

    for (const e of entries) {
        const li = document.createElement("li");
        li.className = "rounded-2xl border border-slate-200 p-4 dark:border-neutral-800";
        li.innerHTML = `
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="flex items-center gap-2 font-medium"><span class="s"></span></p>
                <p class="m text-xs text-slate-500 dark:text-neutral-400"></p>
              </div>
              <span class="a font-semibold text-teal-700 dark:text-teal-400"></span>
            </div>
            <div class="actions mt-3 flex flex-wrap justify-end gap-2"></div>`;
        li.querySelector(".s").textContent = e.source;
        if (e.recurring) {
            const badge = document.createElement("span");
            badge.className = "rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800 dark:bg-teal-900/50 dark:text-teal-300";
            badge.textContent = "Monthly";
            li.querySelector("p").appendChild(badge);
        }
        const day = new Date(e.date + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        li.querySelector(".m").textContent = `${e.type} · ${day}`;
        li.querySelector(".a").textContent = "+" + formatMoney(e.amountCents);

        const actions = li.querySelector(".actions");
        if (e.recurring) {
            const r = data.recurring.find((x) => x.id === e.id);
            actions.appendChild(smallButton("Skip this month", () => {
                r.skips = [...(r.skips || []), mk];
                persist();
            }));
            actions.appendChild(smallButton("Stop from this month", () => {
                if (!confirm(`Stop "${r.source}" from ${monthName(viewMonth)} onwards? Earlier months are kept.`)) return;
                const prev = incomeMonthKey(addMonths(viewMonth, -1));
                if (prev < r.startMonth) data.recurring = data.recurring.filter((x) => x.id !== r.id);
                else r.endMonth = prev;
                persist();
            }));
            actions.appendChild(smallButton("Delete", () => {
                if (!confirm(`Delete "${r.source}" from every month?`)) return;
                data.recurring = data.recurring.filter((x) => x.id !== r.id);
                persist();
            }, "text-red-500"));
        } else {
            actions.appendChild(smallButton("Delete", () => {
                if (!confirm(`Delete "${e.source}"?`)) return;
                data.entries = data.entries.filter((x) => x.id !== e.id);
                persist();
            }, "text-red-500"));
        }
        ul.appendChild(li);
    }

    for (const r of skipped) {
        const li = document.createElement("li");
        li.className = "flex items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-300 p-4 text-slate-500 dark:border-neutral-700 dark:text-neutral-400";
        li.innerHTML = `<div><p class="s font-medium line-through"></p><p class="text-xs">Skipped this month</p></div>`;
        li.querySelector(".s").textContent = `${r.source} · ${formatMoney(r.amountCents)}`;
        li.appendChild(smallButton("Restore", () => {
            r.skips = r.skips.filter((s) => s !== mk);
            persist();
        }));
        ul.appendChild(li);
    }
}

function renderHistory() {
    const box = $("history");
    box.innerHTML = "";
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = addMonths(viewMonth, -i);
        const mk = incomeMonthKey(d);
        months.push({ d, income: sumCents(incomeForMonth(data, mk)), expenses: recordedExpensesForMonth(mk).total });
    }
    const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expenses]));
    for (const m of months) {
        const row = document.createElement("div");
        row.className = "grid grid-cols-[3.5rem_1fr] items-center gap-3 text-sm";
        row.innerHTML = `
            <span class="text-slate-600 dark:text-neutral-300"></span>
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <div class="h-2 rounded-full bg-teal-600" style="width: ${(m.income / max) * 100}%"></div>
                <span class="i whitespace-nowrap text-xs"></span>
              </div>
              <div class="flex items-center gap-2">
                <div class="h-2 rounded-full bg-slate-400 dark:bg-neutral-500" style="width: ${(m.expenses / max) * 100}%"></div>
                <span class="e whitespace-nowrap text-xs text-slate-500 dark:text-neutral-400"></span>
              </div>
            </div>`;
        row.querySelector("span").textContent = monthName(m.d, { month: "short" });
        row.querySelector(".i").textContent = formatMoney(m.income);
        row.querySelector(".e").textContent = formatMoney(m.expenses);
        box.appendChild(row);
    }
}

// ---------- month navigation ----------
$("prevMonth").addEventListener("click", () => { viewMonth = addMonths(viewMonth, -1); render(); });
$("nextMonth").addEventListener("click", () => { viewMonth = addMonths(viewMonth, 1); render(); });

// ---------- add income ----------
for (const t of INCOME_TYPES) form.elements.type.add(new Option(t, t));

function syncTypeHints() {
    const type = form.elements.type.value;
    form.elements.source.placeholder = SOURCE_HINTS[type];
    form.elements.repeat.checked = type === "Salary"; // salary usually repeats
}
form.elements.type.addEventListener("change", syncTypeHints);

$("add-btn").addEventListener("click", () => {
    form.reset();
    $("formError").textContent = "";
    syncTypeHints();
    // Default to today, or the 1st of the month being viewed
    const today = new Date();
    form.elements.date.value = incomeMonthKey(today) === incomeMonthKey(viewMonth) ? isoDate(today) : `${incomeMonthKey(viewMonth)}-01`;
    dialog.showModal();
});
$("cancel-btn").addEventListener("click", () => dialog.close());

form.addEventListener("submit", (event) => {
    event.preventDefault();
    const f = form.elements;
    const amountCents = inputToCents(f.amount.value);
    if (!(amountCents > 0)) {
        $("formError").textContent = "Enter an amount above zero.";
        return;
    }
    const base = { id: Date.now(), type: f.type.value, source: f.source.value.trim(), amountCents };
    if (f.repeat.checked) {
        data.recurring.push({
            ...base,
            day: Number(f.date.value.slice(8, 10)),
            startMonth: f.date.value.slice(0, 7),
            endMonth: null,
            skips: [],
        });
    } else {
        data.entries.push({ ...base, date: f.date.value });
    }
    dialog.close();
    persist();
});

render();
