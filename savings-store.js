// Savings data, shared by the Savings page and the home dashboard.
// Stored in this browser's localStorage. Money is in whole cents.
//
// Shape: {
//   goals:        [{ id, name, kind, targetCents, targetDate: "YYYY-MM-DD", createdAt: "YYYY-MM-DD" }]
//   transactions: [{ id, goalId: number | null, type: "deposit" | "withdrawal",
//                    amountCents, date: "YYYY-MM-DD", note }]
// }
// A transaction with goalId null belongs to "General savings" (not set aside for a goal).
const SAVINGS_KEY = "savings.v1";
const GOAL_KINDS = ["Car", "Wedding", "House", "Holiday", "Emergency fund", "Education", "Other"];

function loadSavings() {
    try {
        const data = JSON.parse(localStorage.getItem(SAVINGS_KEY));
        if (data) return { goals: data.goals || [], transactions: data.transactions || [] };
    } catch (e) {}
    return { goals: [], transactions: [] };
}

// Throws if storage is full or blocked
function saveSavings(data) {
    localStorage.setItem(SAVINGS_KEY, JSON.stringify(data));
}

const hasSavingsData = (data) => data.goals.length > 0 || data.transactions.length > 0;

const signedCents = (t) => (t.type === "deposit" ? t.amountCents : -t.amountCents);

// Balance of one goal, or of General savings when goalId is null
function balanceOf(data, goalId) {
    return data.transactions
        .filter((t) => (t.goalId ?? null) === goalId)
        .reduce((sum, t) => sum + signedCents(t), 0);
}

// Everything saved, across all goals and General savings
function totalSaved(data) {
    return data.transactions.reduce((sum, t) => sum + signedCents(t), 0);
}
