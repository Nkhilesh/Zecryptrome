// Savings goals page. Data helpers live in savings-store.js.

const KIND_COLORS = {
    Car: "bg-amber-500",
    Wedding: "bg-pink-500",
    House: "bg-sky-500",
    Holiday: "bg-violet-500",
    "Emergency fund": "bg-teal-600",
    Education: "bg-indigo-500",
    Other: "bg-slate-400",
};
const STATUS_STYLES = {
    Reached: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300",
    "On track": "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300",
    Behind: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
    Overdue: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

const $ = (id) => document.getElementById(id);
const goalDialog = $("goalDialog"), goalForm = $("goalForm");
const txDialog = $("txDialog"), txForm = $("txForm");

let data = loadSavings();
let editingGoalId = null;
let txContext = null; // { goalId, type }

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
const prettyDate = (iso, opts = { day: "numeric", month: "short", year: "numeric" }) =>
    new Date(iso + "T00:00").toLocaleDateString("en-GB", opts);
const goalName = (goalId) => (goalId == null ? "General savings" : data.goals.find((g) => g.id === goalId)?.name || "Deleted goal");

function persist() {
    try {
        saveSavings(data);
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

// ---------- the maths ----------
// How much to save per month to reach the goal on time, and whether you're on track.
// "On track" compares what you've saved with a straight line from the day the goal
// was created to its target date.
function goalPlan(goal, saved, today = new Date()) {
    const remaining = Math.max(0, goal.targetCents - saved);
    const now = new Date(isoDate(today) + "T00:00");
    const target = new Date(goal.targetDate + "T00:00");
    const daysLeft = Math.round((target - now) / 86400000);

    if (remaining === 0) return { status: "Reached", remaining, daysLeft };
    if (daysLeft < 0) return { status: "Overdue", remaining, daysLeft };

    const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30.44));
    // Rounded up to the next rupee so you never fall short
    const perMonth = Math.ceil(remaining / monthsLeft / 100) * 100;

    const start = new Date(goal.createdAt + "T00:00");
    const span = target - start;
    const elapsed = span > 0 ? Math.min(1, Math.max(0, (now - start) / span)) : 1;
    const expected = Math.round(goal.targetCents * elapsed);
    const status = saved >= expected * 0.95 ? "On track" : "Behind";

    return { status, remaining, daysLeft, monthsLeft, perMonth, expected };
}

function timeLeftText(plan) {
    if (plan.daysLeft < 0) return `${-plan.daysLeft} days past the target date`;
    if (plan.daysLeft < 31) return `${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"} left`;
    return `${plan.monthsLeft} months left`;
}

// ---------- render ----------
function render() {
    const total = totalSaved(data);
    const general = balanceOf(data, null);
    $("total").textContent = formatMoney(total);
    $("totalSplit").textContent = data.goals.length
        ? `${formatMoney(total - general)} in goals · ${formatMoney(general)} in General savings`
        : "";

    const mk = isoDate().slice(0, 7);
    // Moves between General savings and goals cancel out, so this is new money only
    const net = data.transactions.filter((t) => t.date.startsWith(mk)).reduce((s, t) => s + signedCents(t), 0);
    const monthNet = $("monthNet");
    monthNet.textContent = net ? `${net > 0 ? "+" : ""}${formatMoney(net)} this month` : "";
    monthNet.className = "mt-1 text-sm " + (net >= 0 ? "text-teal-700 dark:text-teal-400" : "text-red-500");

    $("openingForm").classList.toggle("hidden", data.transactions.length > 0);
    $("generalBalance").textContent = formatMoney(general);
    const ga = $("generalActions");
    ga.innerHTML = "";
    ga.appendChild(smallButton("Deposit", () => openTx(null, "deposit")));
    if (general > 0) ga.appendChild(smallButton("Withdraw", () => openTx(null, "withdrawal")));

    renderGoals();
    renderActivity();
}

function renderGoals() {
    const ul = $("goalList");
    ul.innerHTML = "";
    $("noGoals").classList.toggle("hidden", data.goals.length > 0);

    // Unfinished goals first, soonest target first
    const goals = [...data.goals].map((g) => ({ g, saved: balanceOf(data, g.id) }));
    goals.sort((a, b) => {
        const doneA = a.saved >= a.g.targetCents, doneB = b.saved >= b.g.targetCents;
        return doneA !== doneB ? (doneA ? 1 : -1) : a.g.targetDate.localeCompare(b.g.targetDate);
    });

    for (const { g, saved } of goals) {
        const plan = goalPlan(g, saved);
        const pct = Math.min(100, Math.floor((saved / g.targetCents) * 100));
        const li = document.createElement("li");
        li.className = "rounded-2xl border border-slate-200 p-4 dark:border-neutral-800";
        li.innerHTML = `
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="n font-medium"></p>
                <p class="k text-xs text-slate-500 dark:text-neutral-400"></p>
              </div>
              <span class="st rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[plan.status]}"></span>
            </div>
            <div class="mt-3 flex items-baseline justify-between text-sm">
              <span><span class="sv font-semibold"></span> <span class="tg text-slate-500 dark:text-neutral-400"></span></span>
              <span class="pc font-medium"></span>
            </div>
            <div class="mt-2 h-2 rounded-full bg-slate-200 dark:bg-neutral-800">
              <div class="h-2 rounded-full ${KIND_COLORS[g.kind] || "bg-slate-400"}" style="width: ${pct}%"></div>
            </div>
            <p class="plan mt-3 text-sm"></p>
            <div class="actions mt-3 flex flex-wrap justify-end gap-2"></div>
            <ul class="hist mt-3 hidden divide-y divide-slate-200 text-sm dark:divide-neutral-800"></ul>`;
        li.querySelector(".n").textContent = g.name;
        li.querySelector(".k").textContent = `${g.kind} · by ${prettyDate(g.targetDate)} · ${timeLeftText(plan)}`;
        li.querySelector(".st").textContent = plan.status;
        li.querySelector(".sv").textContent = formatMoney(saved);
        li.querySelector(".tg").textContent = `of ${formatMoney(g.targetCents)}`;
        li.querySelector(".pc").textContent = `${pct}%`;

        const planEl = li.querySelector(".plan");
        if (plan.status === "Reached") {
            planEl.textContent = "Goal reached!";
        } else if (plan.status === "Overdue") {
            planEl.textContent = `${formatMoney(plan.remaining)} still to go. Move the target date to get a new monthly amount.`;
        } else {
            planEl.innerHTML = `Save <span class="font-semibold"></span> a month to reach it on time <span class="text-slate-500 dark:text-neutral-400"></span>`;
            planEl.querySelector(".font-semibold").textContent = formatMoney(plan.perMonth);
            planEl.querySelector("span:last-child").textContent =
                `(${formatMoney(plan.remaining)} over ${plan.monthsLeft} month${plan.monthsLeft === 1 ? "" : "s"})`;
            if (plan.status === "Behind") {
                const note = document.createElement("span");
                note.className = "mt-1 block text-xs text-amber-700 dark:text-amber-400";
                note.textContent = `You'd normally have about ${formatMoney(plan.expected)} saved by now.`;
                planEl.appendChild(note);
            }
        }

        const actions = li.querySelector(".actions");
        actions.appendChild(smallButton("Deposit", () => openTx(g.id, "deposit")));
        if (saved > 0) actions.appendChild(smallButton("Withdraw", () => openTx(g.id, "withdrawal")));
        const hist = li.querySelector(".hist");
        const txs = data.transactions.filter((t) => t.goalId === g.id);
        if (txs.length) {
            actions.appendChild(smallButton("History", () => hist.classList.toggle("hidden")));
            for (const t of [...txs].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)) hist.appendChild(activityRow(t, false));
        }
        actions.appendChild(smallButton("Edit", () => openGoal(g)));
        actions.appendChild(smallButton("Delete", () => {
            const msg = saved > 0
                ? `Delete "${g.name}"? Its ${formatMoney(saved)} moves to General savings.`
                : `Delete "${g.name}"?`;
            if (!confirm(msg)) return;
            for (const t of data.transactions) if (t.goalId === g.id) t.goalId = null;
            data.goals = data.goals.filter((x) => x.id !== g.id);
            persist();
        }, "text-red-500"));

        ul.appendChild(li);
    }
}

function activityRow(t, showGoal = true) {
    const li = document.createElement("li");
    li.className = "flex items-center justify-between gap-3 py-2";
    li.innerHTML = `<div><p class="w"></p><p class="d text-xs text-slate-500 dark:text-neutral-400"></p></div><span class="a font-medium tabular-nums"></span>`;
    li.querySelector(".w").textContent = showGoal ? goalName(t.goalId) : (t.note || (t.type === "deposit" ? "Deposit" : "Withdrawal"));
    li.querySelector(".d").textContent = [prettyDate(t.date), showGoal && t.note].filter(Boolean).join(" · ");
    const a = li.querySelector(".a");
    a.textContent = (t.type === "deposit" ? "+" : "−") + formatMoney(t.amountCents);
    a.classList.add(...(t.type === "deposit" ? ["text-teal-700", "dark:text-teal-400"] : ["text-red-500"]));
    return li;
}

function renderActivity() {
    const ul = $("activity");
    ul.innerHTML = "";
    $("noActivity").classList.toggle("hidden", data.transactions.length > 0);
    const recent = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 15);
    for (const t of recent) ul.appendChild(activityRow(t));
}

// ---------- opening balance ----------
$("openingForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const cents = inputToCents(e.target.elements.amount.value);
    if (!(cents > 0)) return;
    data.transactions.push({ id: Date.now(), goalId: null, type: "deposit", amountCents: cents, date: isoDate(), note: "Opening balance" });
    persist();
});

// ---------- goal dialog ----------
for (const k of GOAL_KINDS) goalForm.elements.kind.add(new Option(k, k));

function openGoal(goal = null) {
    editingGoalId = goal ? goal.id : null;
    goalForm.reset();
    $("goalError").textContent = "";
    $("goalTitle").textContent = goal ? "Edit goal" : "New goal";
    $("startingWrap").classList.toggle("hidden", Boolean(goal));
    const f = goalForm.elements;
    if (goal) {
        f.name.value = goal.name;
        f.kind.value = goal.kind;
        f.target.value = (goal.targetCents / 100).toFixed(2);
        f.targetDate.value = goal.targetDate;
    } else {
        const inAYear = new Date();
        inAYear.setFullYear(inAYear.getFullYear() + 1);
        f.targetDate.value = isoDate(inAYear);
    }
    updateGoalPreview();
    goalDialog.showModal();
}

// Live "you'd need Rs X a month" while filling in the goal
function updateGoalPreview() {
    const f = goalForm.elements;
    const target = inputToCents(f.target.value);
    const already = editingGoalId != null ? balanceOf(data, editingGoalId) : (inputToCents(f.starting.value) || 0);
    if (!(target > 0) || !f.targetDate.value) { $("goalPreview").textContent = ""; return; }
    const plan = goalPlan({ targetCents: target, targetDate: f.targetDate.value, createdAt: isoDate() }, already);
    $("goalPreview").textContent =
        plan.status === "Reached" ? "Already reached with what's saved."
            : plan.status === "Overdue" ? "Pick a date in the future."
                : `That's ${formatMoney(plan.perMonth)} a month for ${plan.monthsLeft} month${plan.monthsLeft === 1 ? "" : "s"}.`;
}
goalForm.addEventListener("input", updateGoalPreview);

$("newGoal").addEventListener("click", () => openGoal());
$("goalCancel").addEventListener("click", () => goalDialog.close());

goalForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = goalForm.elements;
    const targetCents = inputToCents(f.target.value);
    if (!(targetCents > 0)) { $("goalError").textContent = "Enter a target amount above zero."; return; }
    if (f.targetDate.value <= isoDate()) { $("goalError").textContent = "Pick a target date in the future."; return; }

    if (editingGoalId != null) {
        Object.assign(data.goals.find((g) => g.id === editingGoalId), {
            name: f.name.value.trim(), kind: f.kind.value, targetCents, targetDate: f.targetDate.value,
        });
    } else {
        const id = Date.now();
        data.goals.push({ id, name: f.name.value.trim(), kind: f.kind.value, targetCents, targetDate: f.targetDate.value, createdAt: isoDate() });
        const starting = inputToCents(f.starting.value);
        if (starting > 0) {
            data.transactions.push({ id: id + 1, goalId: id, type: "deposit", amountCents: starting, date: isoDate(), note: "Starting amount" });
        }
    }
    goalDialog.close();
    persist();
});

// ---------- deposit / withdraw ----------
function openTx(goalId, type) {
    txContext = { goalId, type };
    txForm.reset();
    $("txError").textContent = "";
    const name = goalName(goalId);
    $("txTitle").textContent = `${type === "deposit" ? "Deposit to" : "Withdraw from"} ${name}`;
    $("txBalance").textContent = `Balance: ${formatMoney(balanceOf(data, goalId))}`;
    // Moving money from General savings into a goal only makes sense for goal deposits
    const general = balanceOf(data, null);
    const canMove = type === "deposit" && goalId != null && general > 0;
    $("fromGeneralWrap").classList.toggle("hidden", !canMove);
    if (canMove) $("fromGeneralWrap").querySelector("span").firstChild.textContent = `Move from General savings (${formatMoney(general)} available)`;
    txForm.elements.date.value = isoDate();
    txDialog.showModal();
}
$("txCancel").addEventListener("click", () => txDialog.close());

txForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = txForm.elements;
    const amountCents = inputToCents(f.amount.value);
    if (!(amountCents > 0)) { $("txError").textContent = "Enter an amount above zero."; return; }
    const { goalId, type } = txContext;
    const note = f.note.value.trim();
    const id = Date.now();

    if (type === "withdrawal" && amountCents > balanceOf(data, goalId)) {
        $("txError").textContent = `You can withdraw at most ${formatMoney(balanceOf(data, goalId))}.`;
        return;
    }
    const fromGeneral = type === "deposit" && goalId != null && f.fromGeneral.checked;
    if (fromGeneral && amountCents > balanceOf(data, null)) {
        $("txError").textContent = `General savings only has ${formatMoney(balanceOf(data, null))}.`;
        return;
    }

    data.transactions.push({ id, goalId, type, amountCents, date: f.date.value, note: note || (fromGeneral ? "Moved from General savings" : "") });
    if (fromGeneral) {
        data.transactions.push({ id: id + 1, goalId: null, type: "withdrawal", amountCents, date: f.date.value, note: `Moved to ${goalName(goalId)}` });
    }
    txDialog.close();
    persist();
});

render();
