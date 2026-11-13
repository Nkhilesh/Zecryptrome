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

  renderCards(byCategory);

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

// ---------- category cards ----------
// Which cards show is chosen in the settings menu and remembered in this browser.
const CARDS_KEY = "home.cards.v1";
const DEFAULT_CARDS = ["Fuel", "Groceries", "Bills", "Savings"];
const icon = (paths) => `<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const CARD_ICONS = {
  Fuel: icon('<path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><path d="M6 17v2M18 17v2"/>'),
  Groceries: icon('<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>'),
  Bills: icon('<path d="M6 2v20l2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1Z"/><path d="M15 8h-6M15 12h-6M12 16H9"/>'),
  Savings: icon('<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/><path d="M16 11h.01"/>'),
  "Food & drinks": icon('<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 2v2M10 2v2M14 2v2"/>'),
  Transport: icon('<rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16M8 15h.01M16 15h.01M6 19v2M18 19v2"/>'),
  Subscriptions: icon('<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
  Shopping: icon('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>'),
  Entertainment: icon('<rect width="20" height="15" x="2" y="7" rx="2"/><path d="m17 2-5 5-5-5"/>'),
  Health: icon('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'),
  Other: icon('<circle cx="12" cy="12" r="10"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>'),
};
// Every card you can pick: the original four first, then the other expense categories
const CARD_CHOICES = [...DEFAULT_CARDS, ...EXPENSE_CATEGORIES.filter((c) => !DEFAULT_CARDS.includes(c))];

function loadCardChoice() {
  try {
    const saved = JSON.parse(localStorage.getItem(CARDS_KEY));
    if (Array.isArray(saved)) return saved.filter((c) => CARD_CHOICES.includes(c));
  } catch (e) {}
  return [...DEFAULT_CARDS];
}
let shownCards = loadCardChoice();
let lastByCategory = {};

function renderCards(byCategory = lastByCategory) {
  lastByCategory = byCategory;
  const box = document.getElementById("cat-cards");
  box.innerHTML = "";
  box.classList.toggle("hidden", shownCards.length === 0);
  // Cards follow the order of the settings list, not the order they were ticked
  for (const cat of CARD_CHOICES.filter((c) => shownCards.includes(c))) {
    // Savings shows your real savings balance once you've used the Savings page
    const amount = cat === "Savings" && hasSavingsData(savingsData)
      ? totalSaved(savingsData) / 100
      : byCategory[cat] || 0;
    const card = document.createElement("div");
    card.className = "rounded-2xl border border-slate-200 p-4 dark:border-neutral-800";
    card.innerHTML = `${CARD_ICONS[cat] || CARD_ICONS.Other}
      <p class="label mt-2 text-sm text-slate-600 dark:text-neutral-300"></p>
      <p class="amount mt-2 text-xl font-bold"></p>`;
    card.querySelector(".label").textContent = cat;
    card.querySelector(".amount").textContent = money(amount);
    box.appendChild(card);
  }
}

// ---------- settings menu ----------
const settingsBtn = document.getElementById("settings-btn");
const settingsMenu = document.getElementById("settings-menu");

function setMenuOpen(open) {
  settingsMenu.classList.toggle("hidden", !open);
  settingsBtn.setAttribute("aria-expanded", String(open));
  if (open) {
    renderThemeOptions();
    renderCardOptions();
  }
}
settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  setMenuOpen(settingsMenu.classList.contains("hidden"));
});
// Close when clicking outside the menu or pressing Escape
document.addEventListener("click", (e) => {
  if (!settingsMenu.contains(e.target) && !settingsBtn.contains(e.target)) setMenuOpen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !settingsMenu.classList.contains("hidden")) {
    setMenuOpen(false);
    settingsBtn.focus();
  }
});

// Theme: light, dark, or follow the device. "System" saves nothing, which every page
// already understands (their start-up script falls back to the device setting).
function savedTheme() {
  try { return localStorage.getItem("theme") || "system"; } catch (e) { return "system"; }
}
function applyTheme(choice) {
  const dark = choice === "system" ? matchMedia("(prefers-color-scheme: dark)").matches : choice === "dark";
  document.documentElement.classList.toggle("dark", dark);
}
function renderThemeOptions() {
  const current = savedTheme();
  for (const b of document.querySelectorAll("[data-theme-choice]")) {
    const on = b.dataset.themeChoice === current;
    b.setAttribute("aria-pressed", String(on));
    b.className = "rounded-lg px-2 py-1.5 " + (on
      ? "bg-white font-medium shadow-sm dark:bg-neutral-700"
      : "text-slate-600 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-neutral-100");
  }
}
for (const b of document.querySelectorAll("[data-theme-choice]")) {
  b.addEventListener("click", () => {
    const choice = b.dataset.themeChoice;
    try {
      if (choice === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", choice);
    } catch (e) {}
    applyTheme(choice);
    renderThemeOptions();
  });
}
// Follow the device's setting live while "System" is chosen
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (savedTheme() === "system") applyTheme("system");
});

// Cards
function saveCardChoice() {
  try { localStorage.setItem(CARDS_KEY, JSON.stringify(shownCards)); } catch (e) {}
  renderCards();
}
function renderCardOptions() {
  const box = document.getElementById("card-options");
  box.innerHTML = "";
  for (const cat of CARD_CHOICES) {
    const label = document.createElement("label");
    label.className = "flex cursor-pointer items-center gap-2";
    label.innerHTML = `<input type="checkbox" class="h-4 w-4 accent-teal-600"><span></span>`;
    const input = label.querySelector("input");
    input.checked = shownCards.includes(cat);
    label.querySelector("span").textContent = cat;
    input.addEventListener("change", () => {
      shownCards = input.checked ? [...shownCards, cat] : shownCards.filter((c) => c !== cat);
      saveCardChoice();
    });
    box.appendChild(label);
  }
}
document.getElementById("cards-reset").addEventListener("click", () => {
  shownCards = [...DEFAULT_CARDS];
  saveCardChoice();
  renderCardOptions();
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
