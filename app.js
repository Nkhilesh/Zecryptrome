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

// Homepage card preferences are saved independently of expense data.
const CARD_PREFERENCES_KEY = "dashboard.categories.v1";
const DEFAULT_CARD_CATEGORIES = ["Fuel", "Groceries", "Bills", "Savings"];
const CARD_CATEGORIES = [...EXPENSE_CATEGORIES, "Savings"];
function loadCardCategories() {
  try {
    const saved = JSON.parse(AppStorage.getItem(CARD_PREFERENCES_KEY));
    if (Array.isArray(saved)) return [...new Set(saved.filter((c) => CARD_CATEGORIES.includes(c)))];
  } catch (e) {}
  return [...DEFAULT_CARD_CATEGORIES];
}
let cardCategories = loadCardCategories();

function renderCategoryCards(byCategory) {
  const container = document.getElementById("category-cards");
  container.replaceChildren();
  if (!cardCategories.length) {
    const note = document.createElement("p");
    note.className = "col-span-2 py-4 text-sm text-slate-500 dark:text-neutral-400";
    note.textContent = "No categories selected. Use Customize to add cards.";
    container.appendChild(note);
  }
  for (const category of cardCategories) {
    const card = document.createElement("div");
    card.className = "rounded-2xl border border-slate-200 p-4 dark:border-neutral-800";
    const style = CATEGORY_STYLE[category] || { label: category, color: "bg-teal-600" };
    card.innerHTML = `<span aria-hidden="true" class="block h-2 w-8 rounded-full ${style.color}"></span><p class="label mt-3 text-sm text-slate-600 dark:text-neutral-300"></p><p class="amount mt-2 text-xl font-bold"></p><p class="period mt-1 text-xs text-slate-500 dark:text-neutral-400"></p>`;
    card.querySelector(".label").textContent = style.label;
    const isSavings = category === "Savings";
    const amount = isSavings && hasSavingsData(savingsData) ? totalSaved(savingsData) / 100 : byCategory[category] || 0;
    card.querySelector(".amount").textContent = money(amount);
    card.querySelector(".period").textContent = isSavings ? "Saved balance" : "This month";
    container.appendChild(card);
  }
}

function saveCardCategories() {
  let message = "Preferences saved on this browser.";
  try { AppStorage.setItem(CARD_PREFERENCES_KEY, JSON.stringify(cardCategories)); }
  catch (e) { message = "Updated for now. Browser storage is unavailable, so preferences could not be saved."; }
  document.getElementById("card-save-status").textContent = message;
  render();
}

function setupCardOptions() {
  const options = document.getElementById("card-options");
  const toggle = document.getElementById("customize-cards");
  toggle.addEventListener("click", () => {
    options.hidden = !options.hidden;
    toggle.setAttribute("aria-expanded", String(!options.hidden));
  });
  const checkboxes = document.getElementById("card-checkboxes");
  for (const category of CARD_CATEGORIES) {
    const label = document.createElement("label");
    label.className = "flex cursor-pointer items-center gap-2 text-sm";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = category;
    input.checked = cardCategories.includes(category);
    input.className = "h-4 w-4 accent-teal-600";
    input.addEventListener("change", () => {
      cardCategories = input.checked ? [...cardCategories, category] : cardCategories.filter((c) => c !== category);
      saveCardCategories();
    });
    label.append(input, document.createTextNode(CATEGORY_STYLE[category]?.label || category));
    checkboxes.appendChild(label);
  }
  document.getElementById("reset-cards").addEventListener("click", () => {
    cardCategories = [...DEFAULT_CARD_CATEGORIES];
    for (const input of checkboxes.querySelectorAll("input")) input.checked = cardCategories.includes(input.value);
    saveCardCategories();
  });
}

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

  renderCategoryCards(byCategory);

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
  try { AppStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
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

setupCardOptions();
renderHeader();
render();
