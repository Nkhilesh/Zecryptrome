// Expenses data, shared by the Expenses page and the home dashboard.
// Stored in this browser's localStorage. Money is in whole cents.
//
// Shape: {
//   expenses:      [{ id, description, amountCents, category, date: "YYYY-MM-DD", note, subscriptionId? }]
//   subscriptions: [{ id, name, amountCents, category, cycle: "weekly"|"monthly"|"yearly",
//                     day, nextDate: "YYYY-MM-DD", active }]
//   limits:        { total: cents | null, byCategory: { [category]: cents } }
//   quickItems:    [{ label, amountCents, category }]      one-tap small purchases
// }
// Grocery receipts and bills saved on the Scan page are included (read-only) via allExpenses().
const EXPENSES_KEY = "expenses.v1";

const EXPENSE_CATEGORIES = [
    "Groceries", "Food & drinks", "Fuel", "Transport", "Bills", "Subscriptions",
    "Shopping", "Entertainment", "Health", "Other",
];

// Starting quick-add buttons. Prices are examples: edit them to match what you pay.
const DEFAULT_QUICK_ITEMS = [
    { label: "Soda", amountCents: 3000, category: "Food & drinks" },
    { label: "Coffee", amountCents: 5000, category: "Food & drinks" },
    { label: "Snack", amountCents: 4000, category: "Food & drinks" },
    { label: "Lunch", amountCents: 15000, category: "Food & drinks" },
    { label: "Bus fare", amountCents: 3500, category: "Transport" },
    { label: "Parking", amountCents: 3000, category: "Transport" },
];

// Description keyword -> category (English, French, Mauritian)
const CATEGORY_RULES = [
    ["Subscriptions", /netflix|spotify|disney|youtube|prime video|amazon prime|icloud|google one|apple music|deezer|canal|gym|subscription|abonnement|chatgpt|claude/i],
    ["Fuel", /petrol|diesel|fuel|essence|gasoil|shell|engen|total ?energies|indian ?oil|vivo energy/i],
    ["Bills", /\bceb\b|\bcwa\b|electric|water bill|internet|my\.?t\b|emtel|mtml|phone bill|mobile|airtime|recharge|rent|loyer|insurance|assurance|\bbill\b/i],
    ["Groceries", /winners|intermart|super ?u\b|jumbo|shoprite|dreamprice|london way|spar\b|grocer|supermarket|bazar|market|vegetable|legume|fruit/i],
    ["Food & drinks", /soda|coke|coca|pepsi|sprite|fanta|juice|\bjus\b|water bottle|coffee|cafe|caf[eé]|\btea\b|snack|chips|chocolate|biscuit|lunch|dinner|breakfast|restaurant|resto|takeaway|kfc|mcdo|mcdonald|burger|pizza|dholl ?puri|farata|roti|briani|biryani|gateau piment|samoussa|boulette|mine frit|ice ?cream|bakery|boulangerie|pastry|beer|biere|phoenix|drink/i],
    ["Transport", /\bbus\b|taxi|metro|parking|toll|uber|yango|train|ferry|car wash/i],
    ["Health", /pharmac|doctor|clinic|clinique|medicine|medic|dentist|hospital|optician|lab test/i],
    ["Entertainment", /cinema|movie|film|concert|game|playstation|xbox|steam|bowling|club|party|bar\b|ticket/i],
    ["Shopping", /clothes|shirt|shoes|dress|amazon|shein|temu|aliexpress|mall|bagatelle|cascavelle|electronics|gift|cadeau/i],
];

function autoCategory(description) {
    for (const [category, re] of CATEGORY_RULES) if (re.test(description)) return category;
    return "Other";
}

function expIsoDate(d = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const expMonthKey = (d = new Date()) => expIsoDate(d).slice(0, 7);

let idCounter = 0;
const newExpenseId = () => Date.now() * 1000 + (idCounter++ % 1000);

function loadExpenseData() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(EXPENSES_KEY)); } catch (e) {}
    data = data || {};
    return {
        expenses: data.expenses || [],
        subscriptions: data.subscriptions || [],
        limits: { total: data.limits?.total ?? null, byCategory: data.limits?.byCategory || {} },
        quickItems: data.quickItems || DEFAULT_QUICK_ITEMS.map((q) => ({ ...q })),
    };
}

// Throws if storage is full or blocked
function saveExpenseData(data) {
    localStorage.setItem(EXPENSES_KEY, JSON.stringify(data));
}

const hasExpenseData = (data) => data.expenses.length > 0 || data.subscriptions.length > 0;

// Next billing date after `iso` for a subscription. Monthly/yearly keep the original day
// (moved earlier in short months, e.g. the 31st becomes the 30th or 28th).
function nextBillingDate(iso, cycle, day) {
    const [y, m, d] = iso.split("-").map(Number);
    if (cycle === "weekly") return expIsoDate(new Date(y, m - 1, d + 7));
    const months = cycle === "yearly" ? 12 : 1;
    const t = new Date(y, m - 1 + months, 1);
    const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(day || d, dim));
    return expIsoDate(t);
}

// Post every subscription charge that has come due (up to today) as a normal expense.
// Returns how many were added; save the data afterwards if > 0.
function syncSubscriptions(data, today = expIsoDate()) {
    let added = 0;
    for (const s of data.subscriptions) {
        let guard = 0;
        while (s.active && s.nextDate <= today && guard++ < 500) {
            data.expenses.push({
                id: newExpenseId(), description: s.name, amountCents: s.amountCents,
                category: s.category, date: s.nextDate, note: "", subscriptionId: s.id,
            });
            s.nextDate = nextBillingDate(s.nextDate, s.cycle, s.day);
            added++;
        }
    }
    return added;
}

// Subscription cost as a monthly figure
function subscriptionMonthly(s) {
    if (s.cycle === "weekly") return Math.round((s.amountCents * 52) / 12);
    if (s.cycle === "yearly") return Math.round(s.amountCents / 12);
    return s.amountCents;
}

// Grocery receipts and bills from the Scan page, shaped like expenses (read-only here)
function scannedExpenses() {
    let history = [];
    try { history = JSON.parse(localStorage.getItem("scan.history.v1")) || []; } catch (e) {}
    const out = [];
    for (const r of history) {
        if (r.kind === "grocery") {
            out.push({ id: `scan-${r.id}`, description: r.store || "Grocery receipt", amountCents: r.totalCents, category: "Groceries", date: r.date, note: `${r.items?.length || 0} items (scanned)`, source: "scan" });
        } else if (r.kind === "bill") {
            out.push({ id: `scan-${r.id}`, description: `${r.provider || r.type} bill`, amountCents: r.amountCents, category: "Bills", date: r.billDate || r.dueDate, note: r.paid ? "Paid (scanned)" : "Unpaid (scanned)", source: "scan" });
        }
    }
    return out.filter((e) => e.date);
}

const allExpenses = (data) => [...data.expenses, ...scannedExpenses()];

function spentByCategory(list) {
    const out = {};
    for (const e of list) out[e.category] = (out[e.category] || 0) + e.amountCents;
    return out;
}

// "near" from 80% of a limit, "over" from 100%
function limitLevel(spent, limit) {
    if (!limit) return null;
    const pct = (spent / limit) * 100;
    return { pct, level: pct >= 100 ? "over" : pct >= 80 ? "near" : "ok" };
}
