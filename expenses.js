// Expenses page. Data helpers live in expenses-store.js.

const $ = (id) => document.getElementById(id);
const expenseDialog = $("expenseDialog"), expenseForm = $("expenseForm");
const subDialog = $("subDialog"), subForm = $("subForm");
const limitsDialog = $("limitsDialog"), limitsForm = $("limitsForm");
const quickDialog = $("quickDialog"), quickItemsForm = $("quickItemsForm");

let data = loadExpenseData();
if (syncSubscriptions(data) > 0) save(false); // post subscription charges that came due

let editingExpenseId = null;
let editingSubId = null;

const LEVEL_STYLES = {
    ok: { bar: "bg-teal-600", box: "" },
    near: { bar: "bg-amber-500", box: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200" },
    over: { bar: "bg-red-500", box: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200" },
};

// ---------- helpers ----------
function save(rerender = true) {
    try {
        saveExpenseData(data);
    } catch (e) {
        alert("Couldn't save: this browser's storage is full or blocked.");
    }
    if (rerender) render();
}

function formatMoney(cents) {
    const abs = Math.abs(Math.round(cents));
    const whole = Math.floor(abs / 100).toLocaleString("en-US");
    const frac = abs % 100;
    return `${cents < 0 ? "-" : ""}Rs ${whole}${frac ? "." + String(frac).padStart(2, "0") : ""}`;
}

// "45.5" or "45,5" -> 4550, parsed from the text so there's no floating-point error
function inputToCents(value) {
    const m = /^\s*(\d+)(?:[.,](\d*))?\s*$/.exec(String(value));
    if (!m) return NaN;
    const frac = m[2] || "";
    let cents = parseInt(m[1], 10) * 100 + parseInt((frac + "00").slice(0, 2), 10);
    if (frac.length > 2 && frac[2] >= "5") cents += 1;
    return cents;
}
const centsToInput = (c) => (c / 100).toFixed(2);

const prettyDate = (iso, opts = { day: "numeric", month: "short", year: "numeric" }) =>
    new Date(iso + "T00:00").toLocaleDateString("en-GB", opts);

function dayHeading(iso) {
    const today = expIsoDate();
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (iso === today) return "Today";
    if (iso === expIsoDate(y)) return "Yesterday";
    return prettyDate(iso, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function smallButton(text, onClick, extra = "") {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.className = "rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:border-neutral-700 dark:hover:bg-neutral-800 " + extra;
    b.addEventListener("click", onClick);
    return b;
}

function fillCategorySelect(select, selected) {
    select.innerHTML = "";
    for (const c of EXPENSE_CATEGORIES) select.add(new Option(c, c, false, c === selected));
}

let toastTimer = null;
function toast(message, undo = null) {
    $("toastText").textContent = message;
    const btn = $("toastUndo");
    btn.classList.toggle("hidden", !undo);
    btn.onclick = () => { undo(); hideToast(); };
    $("toast").classList.remove("hidden");
    $("toast").classList.add("flex");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 6000);
}
function hideToast() {
    $("toast").classList.add("hidden");
    $("toast").classList.remove("flex");
}

// ---------- month figures & limits ----------
function monthList(mk = expMonthKey()) {
    return allExpenses(data).filter((e) => e.date.startsWith(mk));
}

// Warning text for a category (and the total) if over 80% of its limit this month
function limitWarning(category) {
    const list = monthList();
    const byCat = spentByCategory(list);
    const total = list.reduce((s, e) => s + e.amountCents, 0);
    const msgs = [];
    const catLimit = data.limits.byCategory[category];
    const c = limitLevel(byCat[category] || 0, catLimit);
    if (c && c.level !== "ok") msgs.push(`${category} is at ${Math.round(c.pct)}% of its ${formatMoney(catLimit)} limit`);
    const t = limitLevel(total, data.limits.total);
    if (t && t.level !== "ok") msgs.push(`total spending is at ${Math.round(t.pct)}% of your ${formatMoney(data.limits.total)} limit`);
    return msgs.length ? capitalise(msgs.join(", and ")) + "." : "";
}

function addExpense(expense, label) {
    const entry = { id: newExpenseId(), note: "", ...expense };
    data.expenses.push(entry);
    save();
    const warning = limitWarning(entry.category);
    toast(`${label || "Added"} ${entry.description} · ${formatMoney(entry.amountCents)}.${warning ? " ⚠ " + warning : ""}`, () => {
        data.expenses = data.expenses.filter((e) => e.id !== entry.id);
        save();
    });
}

// ---------- render ----------
function render() {
    renderSummary();
    renderQuick();
    renderLimits();
    renderSubscriptions();
    renderHistory();
}

function renderSummary() {
    const now = new Date();
    const list = monthList();
    const spent = list.reduce((s, e) => s + e.amountCents, 0);
    const last = monthList(expMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))).reduce((s, e) => s + e.amountCents, 0);
    $("monthSpent").textContent = formatMoney(spent);
    $("monthCompare").textContent = last ? `Last month: ${formatMoney(last)}` : "";

    const t = limitLevel(spent, data.limits.total);
    $("totalLimitWrap").classList.toggle("hidden", !t);
    if (t) {
        const bar = $("totalLimitBar");
        bar.className = `h-2 rounded-full ${LEVEL_STYLES[t.level].bar}`;
        bar.style.width = Math.min(100, t.pct) + "%";
        const left = data.limits.total - spent;
        $("totalLimitText").textContent = `${Math.round(t.pct)}% of your ${formatMoney(data.limits.total)} limit · ` +
            (left >= 0 ? `${formatMoney(left)} left` : `${formatMoney(-left)} over`);
    }

    // Warnings for anything at 80% or more
    const alerts = $("alerts");
    alerts.innerHTML = "";
    const byCat = spentByCategory(list);
    const checks = [["Total spending", spent, data.limits.total], ...Object.entries(data.limits.byCategory).map(([c, l]) => [c, byCat[c] || 0, l])];
    for (const [label, s, limit] of checks) {
        const lv = limitLevel(s, limit);
        if (!lv || lv.level === "ok") continue;
        const div = document.createElement("div");
        div.className = `rounded-xl border p-3 text-sm ${LEVEL_STYLES[lv.level].box}`;
        div.textContent = lv.level === "over"
            ? `${label}: over your ${formatMoney(limit)} limit by ${formatMoney(s - limit)}.`
            : `${label}: ${Math.round(lv.pct)}% of your ${formatMoney(limit)} limit used, ${formatMoney(limit - s)} left.`;
        alerts.appendChild(div);
    }
}

function renderQuick() {
    const box = $("quickChips");
    box.innerHTML = "";
    for (const q of data.quickItems) {
        box.appendChild(smallButton(`${q.label} · ${formatMoney(q.amountCents)}`, () =>
            addExpense({ description: q.label, amountCents: q.amountCents, category: q.category, date: expIsoDate() })));
    }
}

function renderLimits() {
    const box = $("limitList");
    box.innerHTML = "";
    const entries = Object.entries(data.limits.byCategory);
    $("noLimits").classList.toggle("hidden", entries.length > 0 || data.limits.total);
    const byCat = spentByCategory(monthList());
    for (const [cat, limit] of entries) {
        const spent = byCat[cat] || 0;
        const lv = limitLevel(spent, limit);
        const left = limit - spent;
        const row = document.createElement("div");
        row.innerHTML = `
            <div class="mb-2 flex justify-between gap-2 text-sm"><span class="c font-medium"></span><span class="s"></span></div>
            <div class="h-2 rounded-full bg-slate-200 dark:bg-neutral-800">
              <div class="h-2 rounded-full ${LEVEL_STYLES[lv.level].bar}" style="width: ${Math.min(100, lv.pct)}%"></div>
            </div>
            <p class="l mt-1 text-xs ${lv.level === "over" ? "text-red-500" : "text-slate-500 dark:text-neutral-400"}"></p>`;
        row.querySelector(".c").textContent = cat;
        row.querySelector(".s").textContent = `${formatMoney(spent)} of ${formatMoney(limit)}`;
        row.querySelector(".l").textContent = left >= 0 ? `${formatMoney(left)} left this month` : `${formatMoney(-left)} over`;
        box.appendChild(row);
    }
}

function renderSubscriptions() {
    const ul = $("subList");
    ul.innerHTML = "";
    const active = data.subscriptions.filter((s) => s.active);
    const monthly = active.reduce((s, x) => s + subscriptionMonthly(x), 0);
    $("subTotal").textContent = data.subscriptions.length
        ? `${formatMoney(monthly)} a month · ${formatMoney(monthly * 12)} a year`
        : "Netflix, Spotify, gym… add them once and they're logged every time they renew.";

    const cycleWord = { weekly: "week", monthly: "month", yearly: "year" };
    for (const s of [...data.subscriptions].sort((a, b) => (b.active - a.active) || a.nextDate.localeCompare(b.nextDate))) {
        const li = document.createElement("li");
        li.className = "rounded-2xl border border-slate-200 p-4 dark:border-neutral-800" + (s.active ? "" : " opacity-60");
        li.innerHTML = `
            <div class="flex items-start justify-between gap-3">
              <div><p class="n font-medium"></p><p class="d text-xs text-slate-500 dark:text-neutral-400"></p></div>
              <span class="a font-semibold"></span>
            </div>
            <div class="actions mt-3 flex justify-end gap-2"></div>`;
        li.querySelector(".n").textContent = s.name;
        li.querySelector(".d").textContent = s.active
            ? `${s.category} · next charge ${prettyDate(s.nextDate)}`
            : `${s.category} · paused`;
        li.querySelector(".a").textContent = `${formatMoney(s.amountCents)} / ${cycleWord[s.cycle]}`;
        const actions = li.querySelector(".actions");
        actions.appendChild(smallButton(s.active ? "Pause" : "Resume", () => {
            s.active = !s.active;
            if (s.active) {
                // Don't back-charge the paused period: jump to the next upcoming date
                const today = expIsoDate();
                while (s.nextDate < today) s.nextDate = nextBillingDate(s.nextDate, s.cycle, s.day);
                syncSubscriptions(data);
            }
            save();
        }));
        actions.appendChild(smallButton("Edit", () => openSub(s)));
        ul.appendChild(li);
    }
}

// ---------- history ----------
function periodRange(p) {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    switch (p) {
        case "thisMonth": return [expIsoDate(new Date(y, m, 1)), expIsoDate(new Date(y, m + 1, 0))];
        case "lastMonth": return [expIsoDate(new Date(y, m - 1, 1)), expIsoDate(new Date(y, m, 0))];
        case "last3": return [expIsoDate(new Date(y, m - 2, 1)), expIsoDate(new Date(y, m + 1, 0))];
        case "thisYear": return [`${y}-01-01`, `${y}-12-31`];
        case "custom": return [$("fromDate").value || "0000-01-01", $("toDate").value || "9999-12-31"];
        default: return ["0000-01-01", "9999-12-31"];
    }
}

function renderHistory() {
    const q = $("search").value.trim().toLowerCase();
    const cat = $("filterCategory").value;
    const [from, to] = periodRange($("filterPeriod").value);

    const list = allExpenses(data)
        .filter((e) => e.date >= from && e.date <= to)
        .filter((e) => !cat || e.category === cat)
        .filter((e) => !q || [e.description, e.note, e.category, (e.amountCents / 100).toFixed(2)].join(" ").toLowerCase().includes(q))
        .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));

    const total = list.reduce((s, e) => s + e.amountCents, 0);
    $("filterTotal").innerHTML = "";
    $("filterTotal").append(`${list.length} expense${list.length === 1 ? "" : "s"} · `);
    const strong = document.createElement("span");
    strong.className = "font-semibold";
    strong.textContent = formatMoney(total);
    $("filterTotal").append(strong);

    const box = $("history");
    box.innerHTML = "";
    if (!list.length) {
        box.innerHTML = `<p class="text-sm text-slate-500 dark:text-neutral-400">Nothing found.</p>`;
        return;
    }
    let currentDay = null, ul = null;
    for (const e of list.slice(0, 500)) {
        if (e.date !== currentDay) {
            currentDay = e.date;
            const h = document.createElement("p");
            h.className = "mt-4 mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-neutral-400";
            h.textContent = dayHeading(e.date);
            box.appendChild(h);
            ul = document.createElement("ul");
            ul.className = "divide-y divide-slate-200 rounded-2xl border border-slate-200 dark:divide-neutral-800 dark:border-neutral-800";
            box.appendChild(ul);
        }
        const li = document.createElement("li");
        li.innerHTML = `
            <button type="button" class="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-neutral-900">
              <span><span class="d block font-medium"></span><span class="m block text-xs text-slate-500 dark:text-neutral-400"></span></span>
              <span class="a font-semibold tabular-nums"></span>
            </button>`;
        li.querySelector(".d").textContent = e.description;
        li.querySelector(".m").textContent = [e.category, e.subscriptionId && "subscription", e.note].filter(Boolean).join(" · ");
        li.querySelector(".a").textContent = formatMoney(e.amountCents);
        li.querySelector("button").addEventListener("click", () => {
            if (e.source === "scan") {
                if (confirm("This came from the Scan page. Open it there to edit?")) {
                    location.href = `scan.html?mode=${e.category === "Bills" ? "bills" : "groceries"}`;
                }
                return;
            }
            openExpense(e);
        });
        ul.appendChild(li);
    }
}

for (const c of EXPENSE_CATEGORIES) $("filterCategory").add(new Option(c, c));
for (const id of ["search", "filterCategory", "fromDate", "toDate"]) $(id).addEventListener("input", renderHistory);
$("filterPeriod").addEventListener("change", () => {
    const custom = $("filterPeriod").value === "custom";
    $("customRange").classList.toggle("hidden", !custom);
    $("customRange").classList.toggle("grid", custom);
    renderHistory();
});

// ---------- quick add ----------
// "soda 30", "coca cola 1.5L 75", "30 soda", "bus Rs 35.50"
function parseQuick(text) {
    const t = text.trim();
    let m = /^(.*?)\s*(?:rs\.?\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:rs)?$/i.exec(t);
    if (m && m[1].trim()) return { description: capitalise(m[1].trim()), amountCents: inputToCents(m[2]) };
    m = /^(?:rs\.?\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:rs)?\s+(.+)$/i.exec(t);
    if (m) return { description: capitalise(m[2].trim()), amountCents: inputToCents(m[1]) };
    return null;
}

$("quickForm").elements.text.addEventListener("input", (e) => {
    const p = parseQuick(e.target.value);
    $("quickHint").textContent = p && p.amountCents > 0
        ? `→ ${p.description} · ${formatMoney(p.amountCents)} · ${autoCategory(p.description)} · today`
        : e.target.value.trim() ? "Type what you bought and the price, e.g. soda 30" : "";
});

$("quickForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = parseQuick(e.target.elements.text.value);
    if (!p || !(p.amountCents > 0)) {
        $("quickHint").textContent = "Type what you bought and the price, e.g. soda 30";
        return;
    }
    addExpense({ ...p, category: autoCategory(p.description), date: expIsoDate() });
    e.target.reset();
    $("quickHint").textContent = "";
});

// ---------- expense dialog ----------
function openExpense(expense = null) {
    editingExpenseId = expense ? expense.id : null;
    expenseForm.reset();
    const f = expenseForm.elements;
    fillCategorySelect(f.category, expense ? expense.category : "Other");
    f.category.dataset.touched = expense ? "1" : "";
    f.description.value = expense?.description || "";
    f.amount.value = expense ? centsToInput(expense.amountCents) : "";
    f.date.value = expense?.date || expIsoDate();
    f.note.value = expense?.note || "";
    $("expenseTitle").textContent = expense ? "Edit expense" : "Add expense";
    $("expenseDelete").classList.toggle("hidden", !expense);
    $("expenseError").textContent = "";
    expenseDialog.showModal();
}

// Pick the category from the description while typing, until the user chooses one
expenseForm.elements.description.addEventListener("input", (e) => {
    const sel = expenseForm.elements.category;
    if (!sel.dataset.touched) sel.value = autoCategory(e.target.value);
});
expenseForm.elements.category.addEventListener("change", (e) => { e.target.dataset.touched = "1"; });

$("add-btn").addEventListener("click", () => openExpense());
$("expenseCancel").addEventListener("click", () => expenseDialog.close());

expenseForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = expenseForm.elements;
    const amountCents = inputToCents(f.amount.value);
    if (!(amountCents > 0)) { $("expenseError").textContent = "Enter an amount above zero."; return; }
    const fields = {
        description: f.description.value.trim(),
        amountCents,
        category: f.category.value,
        date: f.date.value,
        note: f.note.value.trim(),
    };
    expenseDialog.close();
    if (editingExpenseId != null) {
        Object.assign(data.expenses.find((x) => x.id === editingExpenseId), fields);
        save();
        const warning = limitWarning(fields.category);
        toast(`Saved changes.${warning ? " ⚠ " + warning : ""}`);
    } else {
        addExpense(fields);
    }
});

$("expenseDelete").addEventListener("click", () => {
    const i = data.expenses.findIndex((x) => x.id === editingExpenseId);
    if (i < 0) return;
    const [removed] = data.expenses.splice(i, 1);
    expenseDialog.close();
    save();
    toast(`Deleted ${removed.description}.`, () => {
        data.expenses.push(removed);
        save();
    });
});

// ---------- subscription dialog ----------
function openSub(sub = null) {
    editingSubId = sub ? sub.id : null;
    subForm.reset();
    const f = subForm.elements;
    fillCategorySelect(f.category, sub ? sub.category : "Subscriptions");
    f.name.value = sub?.name || "";
    f.amount.value = sub ? centsToInput(sub.amountCents) : "";
    f.cycle.value = sub?.cycle || "monthly";
    f.nextDate.value = sub?.nextDate || expIsoDate();
    $("subTitle").textContent = sub ? "Edit subscription" : "Add subscription";
    $("subDelete").classList.toggle("hidden", !sub);
    $("subError").textContent = "";
    subDialog.showModal();
}
$("addSub").addEventListener("click", () => openSub());
$("subCancel").addEventListener("click", () => subDialog.close());

subForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = subForm.elements;
    const amountCents = inputToCents(f.amount.value);
    if (!(amountCents > 0)) { $("subError").textContent = "Enter a price above zero."; return; }
    const fields = {
        name: f.name.value.trim(),
        amountCents,
        cycle: f.cycle.value,
        category: f.category.value,
        nextDate: f.nextDate.value,
        day: Number(f.nextDate.value.slice(8, 10)),
    };
    if (editingSubId != null) Object.assign(data.subscriptions.find((s) => s.id === editingSubId), fields);
    else data.subscriptions.push({ id: newExpenseId(), active: true, ...fields });
    const posted = syncSubscriptions(data);
    subDialog.close();
    save();
    toast(`Saved ${fields.name}.` + (posted ? ` ${posted} charge${posted === 1 ? "" : "s"} added to expenses.` : ""));
});

$("subDelete").addEventListener("click", () => {
    const s = data.subscriptions.find((x) => x.id === editingSubId);
    if (!confirm(`Delete "${s.name}"? Past charges stay in your history.`)) return;
    data.subscriptions = data.subscriptions.filter((x) => x.id !== editingSubId);
    subDialog.close();
    save();
});

// ---------- limits dialog ----------
$("editLimits").addEventListener("click", () => {
    limitsForm.elements.total.value = data.limits.total ? centsToInput(data.limits.total) : "";
    const box = $("limitInputs");
    box.innerHTML = "";
    for (const c of EXPENSE_CATEGORIES) {
        const label = document.createElement("label");
        label.className = "block text-xs text-slate-600 dark:text-neutral-300";
        label.textContent = c;
        const input = document.createElement("input");
        input.type = "number"; input.step = "0.01"; input.min = "0"; input.placeholder = "No limit";
        input.dataset.category = c;
        input.className = "mt-1 w-full rounded-lg border p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
        if (data.limits.byCategory[c]) input.value = centsToInput(data.limits.byCategory[c]);
        label.appendChild(input);
        box.appendChild(label);
    }
    limitsDialog.showModal();
});
$("limitsCancel").addEventListener("click", () => limitsDialog.close());
limitsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const total = inputToCents(limitsForm.elements.total.value);
    data.limits.total = total > 0 ? total : null;
    data.limits.byCategory = {};
    for (const input of $("limitInputs").querySelectorAll("input")) {
        const c = inputToCents(input.value);
        if (c > 0) data.limits.byCategory[input.dataset.category] = c;
    }
    limitsDialog.close();
    save();
});

// ---------- quick buttons dialog ----------
function quickRow(item = { label: "", amountCents: null, category: "Food & drinks" }) {
    const row = document.createElement("div");
    row.className = "flex gap-2";
    const cls = "rounded-lg border p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
    const label = Object.assign(document.createElement("input"), { value: item.label, placeholder: "Item", className: `${cls} min-w-0 flex-1` });
    label.dataset.f = "label";
    const amount = Object.assign(document.createElement("input"), { type: "number", step: "0.01", min: "0", placeholder: "Rs", className: `${cls} w-20` });
    amount.dataset.f = "amount";
    if (item.amountCents != null) amount.value = centsToInput(item.amountCents);
    const cat = document.createElement("select");
    cat.className = `${cls} w-28`;
    cat.dataset.f = "category";
    fillCategorySelect(cat, item.category);
    label.addEventListener("change", () => { if (label.value) cat.value = autoCategory(label.value); });
    const del = Object.assign(document.createElement("button"), { type: "button", textContent: "✕", className: "px-1 text-slate-400 hover:text-red-500" });
    del.setAttribute("aria-label", "Remove");
    del.addEventListener("click", () => row.remove());
    row.append(label, amount, cat, del);
    $("quickRows").appendChild(row);
}
$("editQuick").addEventListener("click", () => {
    $("quickRows").innerHTML = "";
    data.quickItems.forEach(quickRow);
    quickDialog.showModal();
});
$("addQuickRow").addEventListener("click", () => quickRow());
$("quickCancel").addEventListener("click", () => quickDialog.close());
quickItemsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    data.quickItems = [...$("quickRows").children]
        .map((row) => ({
            label: row.querySelector('[data-f="label"]').value.trim(),
            amountCents: inputToCents(row.querySelector('[data-f="amount"]').value),
            category: row.querySelector('[data-f="category"]').value,
        }))
        .filter((q) => q.label && q.amountCents > 0);
    quickDialog.close();
    save();
});

render();
