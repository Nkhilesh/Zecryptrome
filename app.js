const CURRENCY = "Rs ";
// This month's income from the Income page (income-store.js).
// Until any income is recorded there, a sample figure is shown.
const incomeData = loadIncome();
const savingsData = loadSavings(); // savings-store.js
const INCOME = hasIncomeData(incomeData)
  ? sumCents(incomeForMonth(incomeData, incomeMonthKey())) / 100
  : 32000;

// Savings is money set aside, so it isn't counted as "spent".
const NOT_SPENDING = ["Savings"];

// Labels and bar colours for the spending breakdown
const CATEGORY_STYLE = {
  Groceries: { label: "Groceries", color: "bg-teal-600" },
  Bills: { label: "Bills & utilities", color: "bg-slate-500" },
  Fuel: { label: "Fuel", color: "bg-amber-500" },
  "Food & drinks": { label: "Food & drinks", color: "bg-orange-500" },
  Transport: { label: "Transport", color: "bg-sky-500" },
  Subscriptions: { label: "Subscriptions", color: "bg-pink-500" },
  Shopping: { label: "Shopping", color: "bg-indigo-500" },
  Entertainment: { label: "Entertainment", color: "bg-fuchsia-500" },
  Health: { label: "Health", color: "bg-emerald-500" },
  Other: { label: "Other", color: "bg-violet-500" },
};

// Expenses come from the Expenses page (expenses-store.js), including subscription
// charges and scanned receipts/bills. Until you record any, sample data is shown.
const expenseData = loadExpenseData();
if (syncSubscriptions(expenseData) > 0) {
  try { saveExpenseData(expenseData); } catch (e) {}
}
const SAMPLE_EXPENSES = [
  { id: 1, description: "Supermarket", amount: 4150, category: "Groceries" },
  { id: 2, description: "Electricity & water", amount: 3700, category: "Bills" },
  { id: 3, description: "Petrol", amount: 3200, category: "Fuel" },
  { id: 4, description: "Dinner out", amount: 2500, category: "Other" },
  { id: 5, description: "Monthly savings", amount: 5000, category: "Savings" },
];
let expenses = [];

// This month's expenses in the shape the dashboard uses (amount in rupees)
function loadDashboardExpenses() {
  if (!hasExpenseData(expenseData) && !scannedExpenses().length) return SAMPLE_EXPENSES;
  const mk = expMonthKey();
  return allExpenses(expenseData)
    .filter((e) => e.date.startsWith(mk))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
    .map((e) => ({ id: e.id, description: e.description, amount: e.amountCents / 100, category: e.category }));
}
expenses = loadDashboardExpenses();

const list = document.getElementById("expense-list");
const breakdown = document.getElementById("breakdown");
const dialog = document.getElementById("add-dialog");
const form = document.getElementById("add-form");

const money = (n) =>
  CURRENCY + n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function renderHeader() {
  const now = new Date();
  const h = now.getHours();
  document.getElementById("greeting").textContent =
    h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  document.getElementById("period").textContent =
    now.toLocaleString("en-US", { month: "long", year: "numeric" }) + " overview";
}

function render() {
  const byCategory = {};
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  }
  const spent = expenses
    .filter((e) => !NOT_SPENDING.includes(e.category))
    .reduce((sum, e) => sum + e.amount, 0);

  document.getElementById("balance").textContent = money(INCOME - spent);
  document.getElementById("income").textContent = money(INCOME);
  document.getElementById("spent").textContent = money(spent);

  for (const el of document.querySelectorAll("[data-cat]")) {
    el.textContent = money(byCategory[el.dataset.cat] || 0);
  }
  // Savings card shows your real savings balance once you've used the Savings page
  if (hasSavingsData(savingsData)) {
    document.querySelector('[data-cat="Savings"]').textContent = money(totalSaved(savingsData) / 100);
  }

  // Spending breakdown, largest first
  breakdown.innerHTML = "";
  const rows = Object.entries(byCategory)
    .filter(([cat]) => !NOT_SPENDING.includes(cat))
    .sort((a, b) => b[1] - a[1]);
  for (const [cat, amount] of rows) {
    const style = CATEGORY_STYLE[cat] || { label: cat, color: "bg-slate-400" };
    const pct = spent ? Math.round((amount / spent) * 100) : 0;
    const row = document.createElement("div");
    row.innerHTML = `
      <div class="mb-2 flex justify-between text-sm">
        <span class="label"></span><span>${pct}%</span>
      </div>
      <div class="h-2 rounded-full bg-slate-200 dark:bg-neutral-800">
        <div class="h-2 rounded-full ${style.color}" style="width: ${pct}%"></div>
      </div>`;
    row.querySelector(".label").textContent = style.label;
    breakdown.appendChild(row);
  }

  // Recent expenses (latest 10; the Expenses page has the full history)
  list.innerHTML = "";
  for (const e of [...expenses].reverse().slice(0, 10)) {
    const li = document.createElement("li");
    li.className =
      "flex items-center justify-between rounded-2xl border border-slate-200 p-4 dark:border-neutral-800";
    li.innerHTML = `
      <div>
        <p class="desc font-medium"></p>
        <p class="cat text-xs text-slate-500 dark:text-neutral-400"></p>
      </div>
      <span class="amt font-semibold"></span>`;
    li.querySelector(".desc").textContent = e.description;
    li.querySelector(".cat").textContent = e.category;
    li.querySelector(".amt").textContent = money(e.amount);
    list.appendChild(li);
  }
}

document.getElementById("theme-btn").addEventListener("click", () => {
  const dark = document.documentElement.classList.toggle("dark");
  try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
});

// Category list and auto-categorise from the description (expenses-store.js)
for (const c of EXPENSE_CATEGORIES) form.elements.category.add(new Option(c, c));
form.elements.description.addEventListener("input", (e) => {
  if (!form.elements.category.dataset.touched) form.elements.category.value = autoCategory(e.target.value);
});
form.elements.category.addEventListener("change", (e) => { e.target.dataset.touched = "1"; });

document.getElementById("add-btn").addEventListener("click", () => {
  form.reset();
  form.elements.category.value = "Other";
  form.elements.category.dataset.touched = "";
  dialog.showModal();
});
document.getElementById("cancel-btn").addEventListener("click", () => dialog.close());

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  // Parse the amount as text into cents (no floating-point error)
  const m = /^\s*(\d+)(?:[.,](\d{0,2}))?\d*\s*$/.exec(String(data.get("amount")));
  if (!m) return;
  const amountCents = parseInt(m[1], 10) * 100 + parseInt(((m[2] || "") + "00").slice(0, 2), 10);
  if (!(amountCents > 0)) return;
  expenseData.expenses.push({
    id: newExpenseId(),
    description: String(data.get("description")).trim(),
    amountCents,
    category: data.get("category"),
    date: expIsoDate(),
    note: "",
  });
  try {
    saveExpenseData(expenseData);
  } catch (e) {
    alert("Couldn't save: this browser's storage is full or blocked.");
  }
  expenses = loadDashboardExpenses();
  form.reset();
  dialog.close();
  render();
});

renderHeader();
render();
