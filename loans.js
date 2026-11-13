// Loans page: calculator + tracker. The maths lives in loans-engine.js.
const { FREQUENCIES, METHODS, LOAN_TYPES } = LoanEngine;
const LOANS_KEY = "loans.v1"; // [{ id, name, type, ...loan params, history: [{ type, amountCents?, date }] }]

const $ = (id) => document.getElementById(id);
const form = $("calcForm");
const extraDialog = $("extraDialog"), extraForm = $("extraForm");

let loans = loadLoans();
let editingId = null;
let extraLoanId = null;
let scheduleView = "yearly";
let current = null; // the loan currently in the calculator

// ---------- helpers ----------
function loadLoans() {
    try { return JSON.parse(localStorage.getItem(LOANS_KEY)) || []; } catch (e) { return []; }
}
function persist() {
    try {
        localStorage.setItem(LOANS_KEY, JSON.stringify(loans));
    } catch (e) {
        alert("Couldn't save: this browser's storage is full or blocked.");
    }
    renderLoans();
}

function formatMoney(cents) {
    const abs = Math.abs(Math.round(cents));
    const whole = Math.floor(abs / 100).toLocaleString("en-US");
    const frac = abs % 100;
    return `${cents < 0 ? "-" : ""}Rs ${whole}.${String(frac).padStart(2, "0")}`;
}
const formatRs = (cents) => formatMoney(cents).replace(/\.00$/, "");

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

function termText(months) {
    const y = Math.floor(months / 12), m = months % 12;
    return [y && `${y} yr${y === 1 ? "" : "s"}`, m && `${m} mth${m === 1 ? "" : "s"}`].filter(Boolean).join(" ") || "0 mths";
}

// Repayments converted to a monthly figure, so weekly/fortnightly loans can be added up
const monthlyEquivalent = (loan, payment) => Math.round((payment * FREQUENCIES[loan.frequency].perYear) / 12);

function smallButton(text, onClick, extra = "") {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.className = "rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:border-neutral-700 dark:hover:bg-neutral-800 " + extra;
    b.addEventListener("click", onClick);
    return b;
}

// ---------- form setup ----------
for (const t of Object.keys(LOAN_TYPES)) form.elements.type.add(new Option(t, t));
for (const [k, label] of Object.entries(METHODS)) form.elements.method.add(new Option(label, k));
for (const [k, f] of Object.entries(FREQUENCIES)) form.elements.frequency.add(new Option(f.label, k));

function applyTypeDefaults() {
    const d = LOAN_TYPES[form.elements.type.value];
    form.elements.years.value = Math.floor(d.termMonths / 12);
    form.elements.months.value = d.termMonths % 12;
    form.elements.method.value = d.method;
}

function resetCalculator() {
    editingId = null;
    form.reset();
    form.elements.alreadyPaid.disabled = false;
    applyTypeDefaults();
    form.elements.frequency.value = "monthly";
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    form.elements.firstPaymentDate.value = isoDate(next);
    form.elements.alreadyPaid.value = 0;
    $("calcTitle").textContent = "Loan calculator";
    $("cancelEdit").classList.add("hidden");
    $("saveLoan").textContent = "Save to my loans";
    $("saveStatus").textContent = "";
    calculate();
}

form.elements.type.addEventListener("change", () => { applyTypeDefaults(); calculate(); });
form.addEventListener("input", calculate);
form.addEventListener("submit", (e) => e.preventDefault());

// Read the calculator. Returns { loan } or { error }.
function readForm() {
    const f = form.elements;
    const principalCents = inputToCents(f.amount.value);
    const annualRate = parseFloat(f.rate.value);
    const termMonths = (parseInt(f.years.value, 10) || 0) * 12 + (parseInt(f.months.value, 10) || 0);
    if (!(principalCents > 0)) return { error: "Enter the amount you're borrowing." };
    if (!(annualRate >= 0) || f.rate.value === "") return { error: "Enter the interest rate from your bank (0 if interest-free)." };
    if (annualRate > 100) return { error: "That interest rate looks too high. Enter it as a yearly % (e.g. 6.5)." };
    if (termMonths < 1) return { error: "Enter how long the loan lasts." };
    if (!f.firstPaymentDate.value) return { error: "Pick the date of the first repayment." };
    return {
        loan: {
            name: f.name.value.trim(),
            type: f.type.value,
            principalCents,
            annualRate,
            termMonths,
            method: f.method.value,
            frequency: f.frequency.value,
            firstPaymentDate: f.firstPaymentDate.value,
        },
        alreadyPaid: Math.max(0, parseInt(f.alreadyPaid.value, 10) || 0),
        extraCents: inputToCents(f.extra.value) || 0,
    };
}

// ---------- calculator ----------
function calculate() {
    const read = readForm();
    if (read.error) {
        current = null;
        $("results").classList.add("hidden");
        $("calcError").textContent = read.error;
        return;
    }
    $("calcError").textContent = "";
    $("results").classList.remove("hidden");
    const { loan, extraCents } = read;
    current = read;

    const freq = FREQUENCIES[loan.frequency];
    const rows = LoanEngine.schedule(loan);
    const sum = LoanEngine.summarise(rows);
    const pmt = LoanEngine.instalment(loan);

    $("pmtLabel").textContent = `${freq.label} repayment`;
    if (loan.method === "interestOnly") {
        $("pmt").textContent = formatMoney(pmt);
        $("pmtNote").textContent = `Interest only. The final repayment is ${formatMoney(rows[rows.length - 1].payment)}, which includes the full ${formatRs(loan.principalCents)}.`;
    } else {
        $("pmt").textContent = formatMoney(pmt);
        $("pmtNote").textContent = loan.frequency === "monthly"
            ? `Over ${termText(loan.termMonths)}`
            : `About ${formatMoney(monthlyEquivalent(loan, pmt))} a month · over ${termText(loan.termMonths)}`;
    }

    $("rInterest").textContent = formatMoney(sum.totalInterest);
    $("rTotal").textContent = formatMoney(sum.totalPaid);
    $("rCount").textContent = `${sum.count}`;
    $("rPayoff").textContent = prettyDate(sum.payoffDate, { month: "short", year: "numeric" });

    const pPct = sum.totalPaid ? (loan.principalCents / sum.totalPaid) * 100 : 100;
    $("barPrincipal").style.width = pPct + "%";
    $("barInterest").style.width = 100 - pPct + "%";
    $("legendPrincipal").textContent = `Borrowed ${formatRs(loan.principalCents)} (${Math.round(pPct)}%)`;
    $("legendInterest").textContent = `Interest ${formatRs(sum.totalInterest)} (${Math.round(100 - pPct)}%)`;

    $("effective").textContent = loan.method === "flat" && loan.annualRate > 0
        ? `A ${loan.annualRate}% flat rate costs the same as about ${LoanEngine.effectiveAnnualRate(loan).toFixed(2)}% on a reducing-balance loan, because interest is charged on the full amount for the whole term.`
        : "";

    // What if: extra on every instalment
    if (extraCents > 0) {
        const w = LoanEngine.summarise(LoanEngine.schedule(loan, { extraPerPeriod: extraCents }));
        const fewer = sum.count - w.count;
        $("whatIf").textContent =
            `Paying ${formatRs(extraCents)} extra each time saves ${formatMoney(sum.totalInterest - w.totalInterest)} in interest` +
            (fewer > 0 ? ` and finishes ${fewer} repayment${fewer === 1 ? "" : "s"} early (${prettyDate(w.payoffDate, { month: "short", year: "numeric" })}).` : ".");
    } else {
        $("whatIf").textContent = "";
    }

    renderSchedule(rows);
}

function renderSchedule(rows) {
    const yearly = scheduleView === "yearly";
    for (const [btn, on] of [[$("viewYearly"), yearly], [$("viewAll"), !yearly]]) {
        btn.className = "flex-1 rounded-md p-1.5 " + (on ? "bg-white font-medium shadow dark:bg-neutral-800" : "text-slate-500 dark:text-neutral-400");
    }
    $("schedHead").innerHTML = `<tr><th class="p-1.5 text-left font-normal">${yearly ? "Year" : "#"}</th>${yearly ? "" : '<th class="p-1.5 text-left font-normal">Date</th>'}<th class="p-1.5 font-normal">Paid</th><th class="p-1.5 font-normal">Interest</th><th class="p-1.5 font-normal">Principal</th><th class="p-1.5 font-normal">Balance</th></tr>`;

    let lines = rows;
    if (yearly) {
        const byYear = new Map();
        for (const r of rows) {
            const y = r.date.slice(0, 4);
            const acc = byYear.get(y) || { label: y, payment: 0, interest: 0, principal: 0, balance: 0 };
            acc.payment += r.payment; acc.interest += r.interest; acc.principal += r.principal; acc.balance = r.balance;
            byYear.set(y, acc);
        }
        lines = [...byYear.values()];
    }
    const body = $("schedBody");
    body.innerHTML = "";
    for (const r of lines) {
        const tr = document.createElement("tr");
        const cells = yearly ? [r.label] : [r.k, prettyDate(r.date)];
        cells.push(formatRs(r.payment), formatRs(r.interest), formatRs(r.principal), formatRs(r.balance));
        cells.forEach((c, i) => {
            const td = document.createElement("td");
            td.className = "p-1.5" + (i < (yearly ? 1 : 2) ? " text-left" : "");
            td.textContent = c;
            tr.appendChild(td);
        });
        body.appendChild(tr);
    }
}
$("viewYearly").addEventListener("click", () => { scheduleView = "yearly"; calculate(); });
$("viewAll").addEventListener("click", () => { scheduleView = "all"; calculate(); });

// ---------- save / edit ----------
$("saveLoan").addEventListener("click", () => {
    if (!current) return;
    const { loan, alreadyPaid } = current;
    const name = loan.name || loan.type;
    if (editingId != null) {
        const existing = loans.find((l) => l.id === editingId);
        Object.assign(existing, loan, { name });
        $("saveStatus").textContent = `Updated "${name}".`;
    } else {
        // Instalments already paid are recorded on their scheduled dates
        const total = LoanEngine.numPayments(loan);
        const history = [];
        for (let k = 1; k <= Math.min(alreadyPaid, total); k++) {
            history.push({ type: "payment", date: LoanEngine.paymentDate(loan, k) });
        }
        loans.push({ id: Date.now(), ...loan, name, history });
        $("saveStatus").textContent = `Saved "${name}" to My loans.`;
    }
    persist();
    if (editingId != null) setTimeout(resetCalculator, 1200);
    $("loanList").scrollIntoView({ behavior: "smooth", block: "start" });
});

function editLoan(l) {
    editingId = l.id;
    const f = form.elements;
    f.type.value = l.type;
    f.name.value = l.name;
    f.amount.value = (l.principalCents / 100).toFixed(2);
    f.rate.value = l.annualRate;
    f.method.value = l.method;
    f.years.value = Math.floor(l.termMonths / 12);
    f.months.value = l.termMonths % 12;
    f.frequency.value = l.frequency;
    f.firstPaymentDate.value = l.firstPaymentDate;
    f.alreadyPaid.value = l.history.filter((h) => h.type === "payment").length;
    f.alreadyPaid.disabled = true; // payments are tracked on the loan card
    f.extra.value = "";
    $("calcTitle").textContent = `Editing: ${l.name}`;
    $("cancelEdit").classList.remove("hidden");
    $("saveLoan").textContent = "Update loan";
    $("saveStatus").textContent = "";
    calculate();
    $("calculator").scrollIntoView({ behavior: "smooth", block: "start" });
}
$("cancelEdit").addEventListener("click", resetCalculator);

// ---------- my loans ----------
function renderLoans() {
    const ul = $("loanList");
    ul.innerHTML = "";
    $("noLoans").classList.toggle("hidden", loans.length > 0);

    let owed = 0, monthly = 0, soonest = null;
    const today = isoDate();

    for (const l of loans) {
        const st = LoanEngine.loanState(l, l.history);
        owed += st.balance;
        if (st.next) {
            monthly += monthlyEquivalent(l, st.next.payment);
            if (!soonest || st.next.date < soonest.date) soonest = { date: st.next.date, name: l.name };
        }

        const pct = Math.floor((st.principalRepaid / l.principalCents) * 100);
        const li = document.createElement("li");
        li.className = "rounded-2xl border border-slate-200 p-4 dark:border-neutral-800";
        li.innerHTML = `
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="n font-medium"></p>
                <p class="d text-xs text-slate-500 dark:text-neutral-400"></p>
              </div>
              <div class="text-right">
                <p class="b font-semibold"></p>
                <p class="text-xs text-slate-500 dark:text-neutral-400">left to pay</p>
              </div>
            </div>
            <div class="mt-3 h-2 rounded-full bg-slate-200 dark:bg-neutral-800">
              <div class="h-2 rounded-full bg-teal-600" style="width: ${pct}%"></div>
            </div>
            <div class="mt-1 flex justify-between text-xs text-slate-500 dark:text-neutral-400">
              <span class="p"></span><span class="c"></span>
            </div>
            <p class="nx mt-3 text-sm"></p>
            <p class="i mt-1 text-xs text-slate-500 dark:text-neutral-400"></p>
            <div class="actions mt-3 flex flex-wrap justify-end gap-2"></div>`;
        li.querySelector(".n").textContent = l.name;
        li.querySelector(".d").textContent =
            `${l.type} · ${formatRs(l.principalCents)} at ${l.annualRate}%${l.method === "flat" ? " flat" : ""} · ${termText(l.termMonths)} · ${FREQUENCIES[l.frequency].label.toLowerCase()}`;
        li.querySelector(".b").textContent = formatMoney(st.balance);
        li.querySelector(".p").textContent = `${pct}% repaid`;
        li.querySelector(".c").textContent = `${st.paidCount} of ${st.rows.length} repayments`;

        const nx = li.querySelector(".nx");
        if (st.done) {
            nx.textContent = "Paid off!";
            nx.className = "nx mt-3 text-sm font-medium text-teal-700 dark:text-teal-400";
        } else {
            const late = st.next.date < today;
            nx.textContent = `${late ? "Overdue" : "Next"}: ${formatMoney(st.next.payment)} on ${prettyDate(st.next.date)} · paid off ${prettyDate(st.rows[st.rows.length - 1].date, { month: "short", year: "numeric" })}`;
            nx.className = "nx mt-3 text-sm " + (late ? "font-medium text-red-500" : "");
        }
        li.querySelector(".i").textContent =
            `Interest paid so far ${formatRs(st.interestPaid)} · still to pay ${formatRs(st.interestLeft)}` +
            (st.extrasTotal ? ` · extra repayments ${formatRs(st.extrasTotal)}` : "");

        const actions = li.querySelector(".actions");
        if (!st.done) {
            actions.appendChild(smallButton("Record repayment", () => {
                l.history.push({ type: "payment", date: isoDate() });
                persist();
            }, "border-teal-600 text-teal-700 dark:text-teal-400"));
            actions.appendChild(smallButton("Extra repayment", () => openExtra(l, st.balance)));
        }
        if (l.history.length) {
            actions.appendChild(smallButton("Undo last", () => {
                const last = l.history[l.history.length - 1];
                const what = last.type === "payment" ? "repayment" : `extra repayment of ${formatRs(last.amountCents)}`;
                if (!confirm(`Undo the last ${what} (${prettyDate(last.date)})?`)) return;
                l.history.pop();
                persist();
            }));
        }
        actions.appendChild(smallButton("Edit", () => editLoan(l)));
        actions.appendChild(smallButton("Delete", () => {
            if (!confirm(`Delete "${l.name}" and its repayment history?`)) return;
            loans = loans.filter((x) => x.id !== l.id);
            persist();
        }, "text-red-500"));
        ul.appendChild(li);
    }

    $("summary").classList.toggle("hidden", loans.length === 0);
    $("totalOwed").textContent = formatMoney(owed);
    $("monthlyTotal").textContent = formatMoney(monthly);
    $("nextDue").textContent = soonest ? `Next due ${prettyDate(soonest.date)} (${soonest.name})` : "Nothing due";
}

// ---------- extra repayment ----------
function openExtra(loan, balance) {
    extraLoanId = loan.id;
    extraForm.reset();
    extraForm.elements.date.value = isoDate();
    extraForm.elements.amount.max = (balance / 100).toFixed(2);
    $("extraError").textContent = "";
    extraDialog.showModal();
}
$("extraCancel").addEventListener("click", () => extraDialog.close());
extraForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const loan = loans.find((l) => l.id === extraLoanId);
    const amountCents = inputToCents(extraForm.elements.amount.value);
    const balance = LoanEngine.loanState(loan, loan.history).balance;
    if (!(amountCents > 0)) { $("extraError").textContent = "Enter an amount above zero."; return; }
    if (amountCents > balance) { $("extraError").textContent = `The balance is only ${formatMoney(balance)}.`; return; }
    loan.history.push({ type: "extra", amountCents, date: extraForm.elements.date.value });
    extraDialog.close();
    persist();
});

resetCalculator();
renderLoans();
