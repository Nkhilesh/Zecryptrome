// Subscriptions page: browse services, pick a plan, and add it to your spending.
// Chosen plans are saved as subscriptions in expenses-store.js, so each charge is
// posted as an expense on its due date (and shows on the home page, calendar and insights).
// The service list and logos live in subscriptions-catalog.js.

const $ = (id) => document.getElementById(id);
const planDialog = $("planDialog"), planForm = $("planForm");
const serviceDialog = $("serviceDialog"), serviceForm = $("serviceForm");

const CYCLE_WORD = { weekly: "week", monthly: "month", yearly: "year" };
const CYCLE_LABEL = { monthly: "Every month", yearly: "Every year", weekly: "Every week" };

let data = loadExpenseData();
let customServices = loadCustomServices();
let activeGroup = "All";
let planContext = null;     // { service, sub }
let editingServiceId = null;

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
const centsToInput = (c) => (c / 100).toFixed(2).replace(/\.00$/, "");
const prettyDate = (iso) => new Date(iso + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const services = () => [...SUBSCRIPTION_CATALOG, ...customServices];
const subsFor = (service) => data.subscriptions.filter((s) => serviceForSubscription(s, services())?.id === service.id);

function save(message) {
    const posted = syncSubscriptions(data);
    try {
        saveExpenseData(data);
    } catch (e) {
        alert("Couldn't save: this browser's storage is full or blocked.");
    }
    render();
    if (message) toast(message + (posted ? ` ${posted} charge${posted === 1 ? "" : "s"} added to your spending.` : ""));
}

function saveCustom() {
    try {
        saveCustomServices(customServices);
    } catch (e) {
        alert("Couldn't save: this browser's storage is full or blocked.");
    }
}

let toastTimer = null;
function toast(text) {
    const el = $("toast");
    el.textContent = text;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}

function smallButton(text, onClick, extra = "") {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.className = "rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:border-neutral-700 dark:hover:bg-neutral-800 " + extra;
    b.addEventListener("click", onClick);
    return b;
}

// ---------- render ----------
function render() {
    renderTotals();
    renderMySubs();
    renderGroups();
    renderCatalog();
}

function renderTotals() {
    const active = data.subscriptions.filter((s) => s.active);
    const monthly = active.reduce((sum, s) => sum + subscriptionMonthly(s), 0);
    $("monthly").firstChild.textContent = formatMoney(monthly) + " ";
    $("yearly").textContent = active.length
        ? `${formatMoney(monthly * 12)} a year · ${active.length} active subscription${active.length === 1 ? "" : "s"}`
        : "No active subscriptions.";
}

function renderMySubs() {
    const ul = $("mySubs");
    ul.innerHTML = "";
    $("noSubs").classList.toggle("hidden", data.subscriptions.length > 0);
    const all = services();
    const sorted = [...data.subscriptions].sort((a, b) => (b.active - a.active) || a.nextDate.localeCompare(b.nextDate));
    for (const s of sorted) {
        const service = serviceForSubscription(s, all);
        const li = document.createElement("li");
        li.className = "rounded-2xl border border-slate-200 p-4 dark:border-neutral-800" + (s.active ? "" : " opacity-60");
        li.innerHTML = `
            <div class="flex items-center gap-3">
              <div class="logo"></div>
              <div class="min-w-0 flex-1"><p class="n truncate font-medium"></p><p class="d text-xs text-slate-500 dark:text-neutral-400"></p></div>
              <span class="a whitespace-nowrap text-right font-semibold"></span>
            </div>
            <div class="actions mt-3 flex flex-wrap justify-end gap-2"></div>`;
        li.querySelector(".logo").replaceWith(serviceLogo(service || { name: s.name }));
        li.querySelector(".n").textContent = s.name;
        li.querySelector(".d").textContent = s.active ? `${s.category} · next charge ${prettyDate(s.nextDate)}` : `${s.category} · paused`;
        li.querySelector(".a").textContent = `${formatMoney(s.amountCents)} / ${CYCLE_WORD[s.cycle]}`;

        const actions = li.querySelector(".actions");
        if (service) actions.appendChild(smallButton("Change plan", () => openPlan(service, s)));
        else {
            const a = document.createElement("a");
            a.href = "expenses.html";
            a.textContent = "Edit on Expenses";
            a.className = "rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:border-neutral-700 dark:hover:bg-neutral-800";
            actions.appendChild(a);
        }
        actions.appendChild(smallButton(s.active ? "Pause" : "Resume", () => {
            s.active = !s.active;
            if (s.active) {
                // Don't back-charge the paused period: jump to the next upcoming date
                const today = expIsoDate();
                while (s.nextDate < today) s.nextDate = nextBillingDate(s.nextDate, s.cycle, s.day);
            }
            save(s.active ? `${s.name} resumed.` : `${s.name} paused.`);
        }));
        actions.appendChild(smallButton("Stop", () => stopSubscription(s), "text-red-500 border-red-300 dark:border-red-900"));
        ul.appendChild(li);
    }
}

function renderGroups() {
    const box = $("groups");
    box.innerHTML = "";
    const groups = ["All", ...new Set(services().map((s) => s.group))];
    if (!groups.includes(activeGroup)) activeGroup = "All";
    for (const g of groups) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = g;
        b.className = "rounded-full border px-3 py-1 text-xs font-medium " + (g === activeGroup
            ? "border-teal-600 bg-teal-600 text-white"
            : "border-slate-300 hover:bg-slate-100 dark:border-neutral-700 dark:hover:bg-neutral-800");
        b.addEventListener("click", () => { activeGroup = g; renderGroups(); renderCatalog(); });
        box.appendChild(b);
    }
}

function renderCatalog() {
    const grid = $("catalog");
    grid.innerHTML = "";
    const q = $("search").value.trim().toLowerCase();
    const list = services().filter((s) =>
        (activeGroup === "All" || s.group === activeGroup) &&
        (!q || s.name.toLowerCase().includes(q) || s.plans.some((p) => p.name.toLowerCase().includes(q))));
    $("noResults").classList.toggle("hidden", list.length > 0);

    for (const service of list) {
        const cheapest = Math.min(...service.plans.map((p) => subscriptionMonthly(p)));
        const subscribed = subsFor(service).some((s) => s.active);
        const card = document.createElement("button");
        card.type = "button";
        card.className = "relative flex flex-col items-start rounded-2xl border border-slate-200 p-4 text-left hover:bg-slate-50 dark:border-neutral-800 dark:hover:bg-neutral-900";
        card.innerHTML = `
            <div class="logo"></div>
            <p class="n mt-3 text-sm font-medium"></p>
            <p class="p mt-0.5 text-xs text-slate-500 dark:text-neutral-400"></p>`;
        card.querySelector(".logo").replaceWith(serviceLogo(service));
        card.querySelector(".n").textContent = service.name;
        card.querySelector(".p").textContent = `${service.plans.length} plan${service.plans.length === 1 ? "" : "s"} · from ${formatMoney(cheapest)}/mo`;
        if (subscribed) {
            const badge = document.createElement("span");
            badge.className = "absolute right-3 top-3 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-800 dark:bg-teal-900/50 dark:text-teal-300";
            badge.textContent = "Subscribed";
            card.appendChild(badge);
        }
        card.addEventListener("click", () => openPlan(service));
        grid.appendChild(card);
    }
}

// ---------- choose a plan ----------
function fillCategorySelect(select, value) {
    select.innerHTML = "";
    for (const c of EXPENSE_CATEGORIES) select.add(new Option(c, c));
    select.value = value;
}

function selectedPlan() {
    const checked = planForm.querySelector('input[name="plan"]:checked');
    return checked ? planContext.service.plans[Number(checked.value)] : null;
}

function updatePlanNote() {
    const plan = selectedPlan();
    const f = planForm.elements;
    const cents = inputToCents(f.amount.value);
    $("planNote").textContent = plan && cents > 0 && f.nextDate.value
        ? `${formatMoney(cents)} is added to your spending on ${prettyDate(f.nextDate.value)}, then every ${CYCLE_WORD[plan.cycle]}.`
        : "";
}

function openPlan(service, sub = null) {
    sub = sub || subsFor(service)[0] || null;
    planContext = { service, sub };
    planForm.reset();
    const f = planForm.elements;

    const logo = serviceLogo(service, "h-12 w-12");
    logo.id = "planLogo";
    $("planLogo").replaceWith(logo);
    $("planTitle").textContent = service.name;
    $("planSubtitle").textContent = sub
        ? `Current: ${formatMoney(sub.amountCents)} / ${CYCLE_WORD[sub.cycle]}${sub.active ? "" : " (paused)"}`
        : service.group;

    // Pre-select the plan you're on, else the first one
    let current = 0;
    if (sub) {
        const byName = service.plans.findIndex((p) => p.name === sub.plan);
        const byPrice = service.plans.findIndex((p) => p.amountCents === sub.amountCents && p.cycle === sub.cycle);
        current = byName >= 0 ? byName : byPrice >= 0 ? byPrice : 0;
    }
    const box = $("planOptions");
    box.innerHTML = "";
    service.plans.forEach((p, i) => {
        const label = document.createElement("label");
        label.className = "flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50 dark:border-neutral-800 dark:has-[:checked]:bg-teal-900/30";
        label.innerHTML = `
            <span class="flex items-center gap-2">
              <input type="radio" name="plan" class="h-4 w-4 accent-teal-600">
              <span class="pn text-sm font-medium"></span>
            </span>
            <span class="pp text-sm"></span>`;
        const radio = label.querySelector("input");
        radio.value = i;
        radio.checked = i === current;
        label.querySelector(".pn").textContent = p.name;
        label.querySelector(".pp").textContent = `${formatMoney(p.amountCents)} / ${CYCLE_WORD[p.cycle]}`;
        radio.addEventListener("change", () => { f.amount.value = centsToInput(p.amountCents); updatePlanNote(); });
        box.appendChild(label);
    });

    // Keep what you actually pay for an existing subscription; otherwise the plan's price
    f.amount.value = centsToInput(sub ? sub.amountCents : service.plans[current].amountCents);
    f.nextDate.value = sub ? sub.nextDate : expIsoDate();
    fillCategorySelect(f.category, sub ? sub.category : service.category || "Subscriptions");
    $("dateLabel").textContent = sub ? "Next charge date" : "First charge date";
    $("planSubmit").textContent = sub ? "Update plan" : "Add to spending";
    $("planStop").classList.toggle("hidden", !sub);
    $("serviceEdit").classList.toggle("hidden", !customServices.some((c) => c.id === service.id));
    $("planError").textContent = "";
    updatePlanNote();
    planDialog.showModal();
}

planForm.elements.amount.addEventListener("input", updatePlanNote);
planForm.elements.nextDate.addEventListener("input", updatePlanNote);
$("planCancel").addEventListener("click", () => planDialog.close());

planForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const { service, sub } = planContext;
    const plan = selectedPlan();
    const f = planForm.elements;
    const amountCents = inputToCents(f.amount.value);
    if (!plan) { $("planError").textContent = "Choose a plan."; return; }
    if (!(amountCents > 0)) { $("planError").textContent = "Enter a price above zero."; return; }
    if (!f.nextDate.value) { $("planError").textContent = "Choose a date."; return; }

    const onlyPlan = service.plans.length === 1;
    const fields = {
        name: onlyPlan ? service.name : `${service.name} (${plan.name})`,
        serviceId: service.id,
        plan: plan.name,
        amountCents,
        cycle: plan.cycle,
        category: f.category.value,
        nextDate: f.nextDate.value,
        day: Number(f.nextDate.value.slice(8, 10)),
    };
    if (sub) Object.assign(sub, fields);
    else data.subscriptions.push({ id: newExpenseId(), active: true, ...fields });
    planDialog.close();
    save(sub ? `${fields.name} updated.` : `${fields.name} added.`);
});

function stopSubscription(s) {
    if (!confirm(`Stop "${s.name}"? Charges already added stay in your spending history.`)) return false;
    data.subscriptions = data.subscriptions.filter((x) => x.id !== s.id);
    save(`${s.name} stopped.`);
    return true;
}
$("planStop").addEventListener("click", () => {
    if (stopSubscription(planContext.sub)) planDialog.close();
});
$("serviceEdit").addEventListener("click", () => {
    planDialog.close();
    openService(planContext.service);
});

// ---------- add / edit your own service ----------
function addPlanRow(plan = null) {
    const row = document.createElement("div");
    row.className = "plan-row grid grid-cols-[1fr_6rem_auto_auto] gap-2";
    row.innerHTML = `
        <input name="pname" placeholder="Plan name" class="min-w-0 rounded-lg border p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
        <input name="pprice" type="number" step="0.01" min="0.01" placeholder="Rs" class="min-w-0 rounded-lg border p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
        <select name="pcycle" class="rounded-lg border p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
          <option value="monthly">/ month</option><option value="yearly">/ year</option><option value="weekly">/ week</option>
        </select>
        <button type="button" aria-label="Remove plan" class="rounded-lg px-2 text-slate-400 hover:text-red-500">✕</button>`;
    row.querySelector('[name="pname"]').value = plan?.name || "";
    row.querySelector('[name="pprice"]').value = plan ? centsToInput(plan.amountCents) : "";
    row.querySelector('[name="pcycle"]').value = plan?.cycle || "monthly";
    row.querySelector("button").addEventListener("click", () => {
        if ($("planRows").children.length > 1) row.remove();
    });
    $("planRows").appendChild(row);
}

function cleanDomain(value) {
    return String(value).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0];
}

function updateServicePreview() {
    const f = serviceForm.elements;
    const logo = serviceLogo({ name: f.name.value || "?", domain: cleanDomain(f.domain.value), color: f.color.value });
    logo.id = "servicePreview";
    $("servicePreview").replaceWith(logo);
}

function openService(service = null) {
    editingServiceId = service ? service.id : null;
    serviceForm.reset();
    const f = serviceForm.elements;
    f.name.value = service?.name || "";
    f.domain.value = service?.domain || "";
    f.color.value = service?.color || "#0d9488";
    fillCategorySelect(f.category, service?.category || "Subscriptions");
    $("planRows").innerHTML = "";
    (service?.plans || [null]).forEach(addPlanRow);
    $("serviceTitle").textContent = service ? "Edit subscription service" : "Add new subscription";
    $("serviceDelete").classList.toggle("hidden", !service);
    $("serviceError").textContent = "";
    updateServicePreview();
    serviceDialog.showModal();
}

$("newService").addEventListener("click", () => openService());
$("add-btn").addEventListener("click", () => openService());
$("addPlanRow").addEventListener("click", () => addPlanRow());
$("serviceCancel").addEventListener("click", () => serviceDialog.close());
let previewTimer = null;
for (const name of ["name", "domain", "color"]) {
    serviceForm.elements[name].addEventListener("input", () => {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(updateServicePreview, 300);
    });
}

serviceForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = serviceForm.elements;
    const name = f.name.value.trim();
    const plans = [];
    for (const row of $("planRows").querySelectorAll(".plan-row")) {
        const pname = row.querySelector('[name="pname"]').value.trim();
        const price = row.querySelector('[name="pprice"]').value;
        if (!pname && !price) continue; // empty row
        const amountCents = inputToCents(price);
        if (!pname || !(amountCents > 0)) { $("serviceError").textContent = "Each plan needs a name and a price above zero."; return; }
        plans.push({ name: pname, amountCents, cycle: row.querySelector('[name="pcycle"]').value });
    }
    if (!name) { $("serviceError").textContent = "Enter a name."; return; }
    if (!plans.length) { $("serviceError").textContent = "Add at least one plan."; return; }

    const fields = { name, domain: cleanDomain(f.domain.value), color: f.color.value, group: "My services", category: f.category.value, plans };
    let service;
    if (editingServiceId) {
        service = customServices.find((s) => s.id === editingServiceId);
        Object.assign(service, fields);
    } else {
        service = { id: `custom-${Date.now()}`, ...fields };
        customServices.push(service);
    }
    saveCustom();
    serviceDialog.close();
    render();
    openPlan(service);
});

$("serviceDelete").addEventListener("click", () => {
    const service = customServices.find((s) => s.id === editingServiceId);
    const using = subsFor(service).length;
    if (!confirm(`Remove "${service.name}" from the list?` + (using ? " Your subscription to it stays; stop it separately if you no longer pay for it." : ""))) return;
    customServices = customServices.filter((s) => s.id !== editingServiceId);
    saveCustom();
    serviceDialog.close();
    render();
});

$("search").addEventListener("input", renderCatalog);

// Post any charges that came due since the last visit
if (syncSubscriptions(data) > 0) {
    try { saveExpenseData(data); } catch (e) {}
}
render();
