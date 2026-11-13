const CURRENCY = "Rs ";
const INCOME = 32000;

// Savings is money set aside, so it isn't counted as "spent".
const NOT_SPENDING = ["Savings"];

// Labels and bar colours for the spending breakdown
const CATEGORY_STYLE = {
  Groceries: { label: "Groceries", color: "bg-teal-600" },
  Bills: { label: "Bills & utilities", color: "bg-slate-500" },
  Fuel: { label: "Fuel", color: "bg-amber-500" },
  Other: { label: "Other", color: "bg-violet-500" },
};

// Hardcoded for now
let expenses = [
  { id: 1, description: "Supermarket", amount: 4150, category: "Groceries" },
  { id: 2, description: "Electricity & water", amount: 3700, category: "Bills" },
  { id: 3, description: "Petrol", amount: 3200, category: "Fuel" },
  { id: 4, description: "Dinner out", amount: 2500, category: "Other" },
  { id: 5, description: "Monthly savings", amount: 5000, category: "Savings" },
];

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

  // Recent expenses
  list.innerHTML = "";
  for (const e of [...expenses].reverse()) {
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

document.getElementById("add-btn").addEventListener("click", () => dialog.showModal());
document.getElementById("cancel-btn").addEventListener("click", () => dialog.close());

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  expenses.push({
    id: Date.now(),
    description: data.get("description"),
    amount: parseFloat(data.get("amount")),
    category: data.get("category"),
  });
  form.reset();
  dialog.close();
  render();
});

renderHeader();
render();
