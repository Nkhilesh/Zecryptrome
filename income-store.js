// Income data, shared by the Income page and the home dashboard.
// Stored through AppStorage (Supabase with a per-account local cache). Money is in whole cents.
//
// Shape: {
//   entries:   [{ id, type, source, amountCents, date: "YYYY-MM-DD" }]          one-off income
//   recurring: [{ id, type, source, amountCents, day, startMonth: "YYYY-MM",
//                 endMonth: "YYYY-MM" | null, skips: ["YYYY-MM"] }]          e.g. monthly salary
// }
const INCOME_KEY = "income.v1";
const INCOME_TYPES = ["Salary", "Part-time", "Freelance", "Commission", "Other"];

function incomeMonthKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function loadIncome() {
    try {
        const data = JSON.parse(AppStorage.getItem(INCOME_KEY));
        if (data) return { entries: data.entries || [], recurring: data.recurring || [] };
    } catch (e) {}
    return { entries: [], recurring: [] };
}

// Throws if storage is full or blocked
function saveIncome(data) {
    AppStorage.setItem(INCOME_KEY, JSON.stringify(data));
}

const hasIncomeData = (data) => data.entries.length > 0 || data.recurring.length > 0;

// Is a recurring entry running in month `mk` (ignoring skips)?
const recurringActiveIn = (r, mk) => r.startMonth <= mk && (!r.endMonth || r.endMonth >= mk);

// All income for one month: one-off entries plus recurring ones (skipped months left out)
function incomeForMonth(data, mk) {
    const list = data.entries
        .filter((e) => e.date.startsWith(mk))
        .map((e) => ({ ...e, recurring: false }));
    const [y, m] = mk.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    for (const r of data.recurring) {
        if (!recurringActiveIn(r, mk) || (r.skips || []).includes(mk)) continue;
        const day = String(Math.min(r.day, daysInMonth)).padStart(2, "0");
        list.push({ id: r.id, type: r.type, source: r.source, amountCents: r.amountCents, date: `${mk}-${day}`, recurring: true });
    }
    return list.sort((a, b) => a.date.localeCompare(b.date));
}

const sumCents = (list) => list.reduce((s, e) => s + e.amountCents, 0);

// Expenses recorded through the Scan page (grocery receipts + bills) for one month
function recordedExpensesForMonth(mk) {
    let history = [];
    try { history = JSON.parse(AppStorage.getItem("scan.history.v1")) || []; } catch (e) {}
    let groceries = 0, bills = 0;
    for (const r of history) {
        if (r.kind === "grocery" && (r.date || "").startsWith(mk)) groceries += r.totalCents;
        if (r.kind === "bill" && (r.billDate || r.dueDate || "").startsWith(mk)) bills += r.amountCents;
    }
    return { groceries, bills, total: groceries + bills };
}
