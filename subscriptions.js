// Subscriptions page: browse services, pick a plan, and add it to your spending.
// Chosen plans are saved as subscriptions in expenses-store.js, so each charge is
// posted as an expense on its due date (and shows on the home page, calendar and insights).
// The service list and logos live in subscriptions-catalog.js.

const $ = (id) => document.getElementById(id);
const planDialog = $("planDialog"), planForm = $("planForm");
const serviceDialog = $("serviceDialog"), serviceForm = $("serviceForm");

const CYCLE_WORD = { weekly: "week", monthly: "month", yearly: "year" };

let data = loadExpenseData();
let customServices = loadCustomServices();
let activeGroup = "All";
let planContext = null;     // { service, sub, existing } for the open plan window
let editingServiceId = null;

// ---------- helpers ----------
// Whole rupees, rounded up (Rs 141.43 shows as Rs 142)
function formatMoney(cents) {
    return `Rs ${Math.ceil(Math.round(cents) / 100).toLocaleString("en-US")}`;
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

// The state a change can be undone back to. Take it before changing anything.
const snapshot = () => JSON.stringify({ expenses: data.expenses, subscriptions: data.subscriptions });

// Saves and redraws. Pass `undo` (a snapshot() from before the change) to offer Undo in the toast.
// Returns false, and reports it, if the browser wouldn't store the data.
function save(message, undo = null) {
    const posted = syncSubscriptions(data);
    try {
        saveExpenseData(data);
    } catch (e) {
        // Nothing was stored, so show what is really saved instead of pretending it worked
        data = loadExpenseData();
        render();
        alert("Couldn't save: this browser's storage is full or blocked.");
        return false;
    }
    render();
    if (message) toast(message + (posted ? ` ${posted} charge${posted === 1 ? "" : "s"} added to your spending.` : ""), undo);
    return true;
}

// Returns false, and reports it, if the browser wouldn't store the list
function saveCustom() {
    try {
        saveCustomServices(customServices);
        return true;
    } catch (e) {
        customServices = loadCustomServices(); // back to what is really saved
        render();
        alert("Couldn't save: this browser's storage is full or blocked.");
        return false;
    }
}

let toastTimer = null;
let toastUndo = null; // snapshot to go back to if Undo is pressed
function toast(text, undo = null) {
    $("toastText").textContent = text;
    toastUndo = undo;
    $("toastUndo").classList.toggle("hidden", !undo);
    $("toast").classList.replace("hidden", "flex");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 8000 : 3500);
}
function hideToast() {
    $("toast").classList.replace("flex", "hidden");
    toastUndo = null;
}
$("toastUndo").addEventListener("click", () => {
    const state = toastUndo;
    hideToast();
    if (!state) return;
    Object.assign(data, JSON.parse(state));
    save("Undone.");
});

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
        if (service) actions.appendChild(smallButton(service.multi ? "Change packs" : "Change plan", () => openPlan(service, s)));
        else {
            const a = document.createElement("a");
            a.href = "expenses.html";
            a.textContent = "Edit on Expenses";
            a.className = "rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:border-neutral-700 dark:hover:bg-neutral-800";
            actions.appendChild(a);
        }
        actions.appendChild(smallButton(s.active ? "Pause" : "Resume", () => {
            const before = snapshot();
            s.active = !s.active;
            if (s.active) {
                // Don't back-charge the paused period: jump to the next upcoming date
                const today = expIsoDate();
                while (s.nextDate < today) s.nextDate = nextBillingDate(s.nextDate, s.cycle, s.day);
            }
            save(s.active ? `${s.name} resumed.` : `${s.name} paused.`, before);
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
        const cheapest = Math.min(...service.plans.filter((p) => !p.askPrice).map((p) => subscriptionMonthly(p)));
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
// Most services: pick one plan (radio buttons).
// TV providers with `multi` (Canal+): tick any number of packs. Each one is its
// own subscription, so ticking adds it to spending and unticking stops it.
const checkedPlans = () =>
    [...planForm.querySelectorAll('input[name="plan"]:checked')].map((i) => planContext.service.plans[Number(i.value)]);
const planSubName = (service, plan) => (service.plans.length === 1 ? service.name : `${service.name} (${plan.name})`);

// What you'll be charged for a plan: the typed price for services with editablePrice
// (whole rupees, rounded up), otherwise the listed price. NaN if the typed price is invalid.
function chargeFor(plan) {
    if (!planContext.service.editablePrice) return plan.amountCents;
    const cents = inputToCents($("priceInput").value);
    return cents > 0 ? Math.ceil(cents / 100) * 100 : NaN;
}

// Fill the price box with the price for this plan (what you already pay if it's your current plan)
function fillPrice(plan, focus = false) {
    const { sub } = planContext;
    const input = $("priceInput");
    const yours = sub && sub.plan === plan.name;
    if (plan.askPrice && !yours) {
        input.value = "";
        input.placeholder = "Enter the price you pay";
        $("priceLabel").textContent = `How much does your gym cost? (Rs per ${CYCLE_WORD[plan.cycle]})`;
        if (focus) input.focus();
        return;
    }
    input.placeholder = "";
    input.value = String(Math.ceil((yours ? sub.amountCents : plan.amountCents) / 100));
    $("priceLabel").textContent = `Price you pay (Rs per ${CYCLE_WORD[plan.cycle]})`;
}

function updatePlanNote() {
    const { service, sub } = planContext;
    const plans = checkedPlans();
    let text = "";
    if (service.multi) {
        const monthly = plans.reduce((sum, p) => sum + subscriptionMonthly(p), 0);
        text = plans.length
            ? `${plans.length} selected · ${formatMoney(monthly)} a month in total. New packs are added to your spending today, then every month.`
            : "Tick every pack you pay for.";
    } else if (plans[0]) {
        const cents = chargeFor(plans[0]);
        text = !(cents > 0) ? ""
            : sub
                ? `From your next charge on ${prettyDate(sub.nextDate)}, ${formatMoney(cents)} is added to your spending every ${CYCLE_WORD[plans[0].cycle]}.`
                : `${formatMoney(cents)} is added to your spending today, then every ${CYCLE_WORD[plans[0].cycle]}.`;
    }
    $("planNote").textContent = text;
}

function openPlan(service, sub = null) {
    const existing = subsFor(service);
    if (service.multi) sub = null;
    else sub = sub || existing[0] || null;
    planContext = { service, sub, existing };
    planForm.reset();

    const logo = serviceLogo(service, "h-12 w-12");
    logo.id = "planLogo";
    $("planLogo").replaceWith(logo);
    $("planTitle").textContent = service.name;
    const existingMonthly = existing.filter((s) => s.active).reduce((sum, s) => sum + subscriptionMonthly(s), 0);
    $("planSubtitle").textContent = service.multi
        ? (existing.length ? `Current: ${existing.length} pack${existing.length === 1 ? "" : "s"} · ${formatMoney(existingMonthly)} / month` : service.group)
        : sub ? `Current: ${formatMoney(sub.amountCents)} / ${CYCLE_WORD[sub.cycle]}${sub.active ? "" : " (paused)"}` : service.group;
    $("planLegend").textContent = service.multi ? "Choose your packs (tick as many as you have)" : "Choose your plan";
    $("planSource").textContent =
        service.priceSource === "mu" ? `Mauritius prices, checked ${PRICES_CHECKED}.`
        : service.priceSource === "mu-old" ? "Last published Mauritius price. It couldn't be confirmed recently, so check your bill."
        : service.priceSource === "us" ? `No Mauritius price is published, so these are US prices (checked ${PRICES_CHECKED}). Yours may be lower.`
        : "";
    if (service.sourceText) $("planSource").textContent = `${service.sourceText} Checked ${PRICES_CHECKED}.`;
    if (service.note) $("planSource").textContent = `${service.note} ${$("planSource").textContent}`.trim();

    // Which plans start ticked: every pack you have (multi), else the plan you're on or the first
    let isChecked;
    if (service.multi) {
        const have = new Set(existing.map((s) => s.plan));
        isChecked = (p) => have.has(p.name);
    } else {
        let current = 0;
        if (sub) {
            const byName = service.plans.findIndex((p) => p.name === sub.plan);
            const byPrice = service.plans.findIndex((p) => p.amountCents === sub.amountCents && p.cycle === sub.cycle);
            current = byName >= 0 ? byName : byPrice >= 0 ? byPrice : 0;
        }
        isChecked = (p, i) => i === current;
    }

    const box = $("planOptions");
    box.innerHTML = "";
    let lastSection;
    service.plans.forEach((p, i) => {
        if (p.section && p.section !== lastSection) {
            const h = document.createElement("p");
            h.className = "pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400";
            h.textContent = p.section;
            box.appendChild(h);
            lastSection = p.section;
        }
        const label = document.createElement("label");
        label.className = "flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50 dark:border-neutral-800 dark:has-[:checked]:bg-teal-900/30";
        label.innerHTML = `
            <span class="flex items-center gap-2">
              <input name="plan" class="h-4 w-4 accent-teal-600">
              <span class="pn text-sm font-medium"></span>
            </span>
            <span class="pp whitespace-nowrap text-sm font-semibold"></span>`;
        const input = label.querySelector("input");
        input.type = service.multi ? "checkbox" : "radio";
        input.value = i;
        input.checked = isChecked(p, i);
        label.querySelector(".pn").textContent = p.name;
        label.querySelector(".pp").textContent = p.askPrice ? "Enter your price" : `${formatMoney(p.amountCents)} / ${CYCLE_WORD[p.cycle]}`;
        input.addEventListener("change", () => {
            if (service.editablePrice) fillPrice(p, true);
            updatePlanNote();
        });
        box.appendChild(label);
    });

    $("priceWrap").classList.toggle("hidden", !service.editablePrice);
    if (service.editablePrice && checkedPlans()[0]) fillPrice(checkedPlans()[0]);

    $("planSubmit").textContent = service.multi ? (existing.length ? "Update packs" : "Add to spending") : sub ? "Update plan" : "Add to spending";
    $("planStop").textContent = service.multi ? "Stop all packs" : "Stop this subscription";
    $("planStop").classList.toggle("hidden", service.multi ? !existing.length : !sub);
    $("serviceEdit").classList.toggle("hidden", !customServices.some((c) => c.id === service.id));
    $("planError").textContent = "";
    updatePlanNote();
    planDialog.showModal();
}

$("planCancel").addEventListener("click", () => planDialog.close());
$("priceInput").addEventListener("input", updatePlanNote);

function newSubscription(service, plan, amountCents = plan.amountCents) {
    const today = expIsoDate();
    return {
        id: newExpenseId(), active: true,
        name: planSubName(service, plan), serviceId: service.id, plan: plan.name,
        amountCents, cycle: plan.cycle,
        category: service.category || "Subscriptions",
        nextDate: today, day: Number(today.slice(8, 10)),
    };
}

// Adds a subscription. If the same thing was stopped earlier today, the charge already
// posted today is reused instead of charging twice. Returns true when that happened.
function addSubscription(service, plan, amountCents = plan.amountCents) {
    const sub = newSubscription(service, plan, amountCents);
    const live = new Set(data.subscriptions.map((s) => s.id));
    const paidToday = data.expenses.find((x) =>
        x.subscriptionId != null && !live.has(x.subscriptionId) &&
        x.date === sub.nextDate && x.description === sub.name && x.amountCents === sub.amountCents);
    if (paidToday) {
        paidToday.subscriptionId = sub.id;
        sub.nextDate = nextBillingDate(sub.nextDate, sub.cycle, sub.day);
    }
    data.subscriptions.push(sub);
    return Boolean(paidToday);
}
const ALREADY_CHARGED = " Today's charge was already in your spending.";

planForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const { service, sub, existing } = planContext;
    const plans = checkedPlans();
    const before = snapshot();

    if (service.multi) {
        if (!plans.length && !existing.length) { $("planError").textContent = "Tick at least one pack."; return; }
        const wanted = new Set(plans.map((p) => p.name));
        // Unticked packs are stopped (subscriptions that don't match a listed pack are left alone)
        const removed = existing.filter((s) => service.plans.some((p) => p.name === s.plan) && !wanted.has(s.plan));
        if (removed.length && !confirm(`Stop ${removed.map((s) => s.plan).join(", ")}? Charges already added stay in your spending history.`)) return;
        data.subscriptions = data.subscriptions.filter((s) => !removed.includes(s));
        const have = new Set(existing.map((s) => s.plan));
        const added = plans.filter((p) => !have.has(p.name));
        let reused = false;
        for (const p of added) reused = addSubscription(service, p) || reused;
        planDialog.close();
        if (!added.length && !removed.length) return; // nothing changed
        const parts = [];
        if (added.length) parts.push(`Added ${added.map((p) => p.name).join(", ")}.`);
        if (removed.length) parts.push(`Stopped ${removed.map((s) => s.plan).join(", ")}.`);
        save(parts.join(" ") + (reused ? ALREADY_CHARGED : ""), before);
        return;
    }

    const plan = plans[0];
    if (!plan) { $("planError").textContent = "Choose a plan."; return; }
    const amountCents = chargeFor(plan);
    if (!(amountCents > 0)) { $("planError").textContent = plan.askPrice ? "Enter the price you pay." : "Enter a price above zero."; return; }
    const name = planSubName(service, plan);
    let reused = false;
    if (sub) {
        if (sub.name === name && sub.plan === plan.name && sub.amountCents === amountCents && sub.cycle === plan.cycle) {
            planDialog.close(); // same plan, same price: nothing to update
            return;
        }
        // Keeps its category and next charge date
        Object.assign(sub, { name, serviceId: service.id, plan: plan.name, amountCents, cycle: plan.cycle });
        delete sub.viaId; // left over from the removed Apple TV card
    } else reused = addSubscription(service, plan, amountCents);
    planDialog.close();
    save(`${name} ${sub ? "updated" : "added"}.` + (reused ? ALREADY_CHARGED : ""), before);
});

function stopSubscription(s) {
    if (!confirm(`Stop "${s.name}"? Charges already added stay in your spending history.`)) return false;
    const before = snapshot();
    data.subscriptions = data.subscriptions.filter((x) => x.id !== s.id);
    save(`${s.name} stopped.`, before);
    return true;
}
$("planStop").addEventListener("click", () => {
    const { service, sub, existing } = planContext;
    if (!service.multi) {
        if (stopSubscription(sub)) planDialog.close();
        return;
    }
    if (!confirm(`Stop all ${existing.length} ${service.name} pack${existing.length === 1 ? "" : "s"}? Charges already added stay in your spending history.`)) return;
    const before = snapshot();
    data.subscriptions = data.subscriptions.filter((s) => !existing.includes(s));
    planDialog.close();
    save(`${service.name} stopped.`, before);
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
        <input name="pname" aria-label="Plan name" placeholder="Plan name" class="min-w-0 rounded-lg border p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
        <input name="pprice" aria-label="Price in rupees" type="number" step="any" min="0" placeholder="Rs" class="min-w-0 rounded-lg border p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
        <select name="pcycle" aria-label="How often it's charged" class="rounded-lg border p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
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

// ---------- category of your own services ----------
// The categories are the filter tabs on the page. "Other" lets you type any category,
// which then becomes a tab of its own and appears in this list next time.
const OTHER_GROUP = "__other__";
// Where each category's charges go in your spending (anything else counts as Subscriptions)
const GROUP_SPENDING = { Gaming: "Entertainment", Fitness: "Health" };

function fillGroupSelect(current) {
    const select = $("serviceGroup");
    select.innerHTML = "";
    // "Other" itself is covered by the "Other (type your own)" entry, left blank
    const groups = [...new Set(services().map((s) => s.group))].filter((g) => g !== "Other");
    if (current && current !== "Other" && !groups.includes(current)) groups.push(current);
    select.add(new Option("Choose a category…", ""));
    for (const g of groups) select.add(new Option(g, g));
    select.add(new Option("Other (type your own)", OTHER_GROUP));
    select.value = current === "Other" ? OTHER_GROUP : current || "";
    $("serviceGroupOther").value = "";
    $("serviceGroupOther").classList.toggle("hidden", current !== "Other");
}
$("serviceGroup").addEventListener("change", () => {
    const other = $("serviceGroup").value === OTHER_GROUP;
    $("serviceGroupOther").classList.toggle("hidden", !other);
    if (other) $("serviceGroupOther").focus();
});

function openService(service = null) {
    editingServiceId = service ? service.id : null;
    serviceForm.reset();
    const f = serviceForm.elements;
    f.name.value = service?.name || "";
    f.domain.value = service?.domain || "";
    f.color.value = service?.color || "#0d9488";
    fillGroupSelect(service?.group);
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
        const amountCents = Math.ceil(inputToCents(price) / 100) * 100; // whole rupees, rounded up
        if (!pname || !(amountCents > 0)) { $("serviceError").textContent = "Each plan needs a name and a price above zero."; return; }
        plans.push({ name: pname, amountCents, cycle: row.querySelector('[name="pcycle"]').value });
    }
    if (!name) { $("serviceError").textContent = "Enter a name."; return; }
    const choice = $("serviceGroup").value;
    if (!choice) { $("serviceError").textContent = "Choose a category."; return; }
    // "Other": use what was typed (matching an existing category regardless of case),
    // or file it under "Other" if nothing was typed
    let group = choice;
    if (choice === OTHER_GROUP) {
        const typed = $("serviceGroupOther").value.trim().replace(/\s+/g, " ") || "Other";
        group = services().map((s) => s.group).find((g) => g.toLowerCase() === typed.toLowerCase())
            || typed.charAt(0).toUpperCase() + typed.slice(1);
    }
    if (!plans.length) { $("serviceError").textContent = "Add at least one plan."; return; }
    if (new Set(plans.map((p) => p.name.toLowerCase())).size !== plans.length) {
        $("serviceError").textContent = "Give each plan a different name.";
        return;
    }

    const fields = { name, domain: cleanDomain(f.domain.value), color: f.color.value, group, category: GROUP_SPENDING[group] || "Subscriptions", plans };
    let service;
    if (editingServiceId) {
        service = customServices.find((s) => s.id === editingServiceId);
        Object.assign(service, fields);
    } else {
        service = { id: `custom-${Date.now()}`, ...fields };
        customServices.push(service);
    }
    if (!saveCustom()) return;
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
$("priceInfo").textContent = `Prices checked ${PRICES_CHECKED}. Services billed in US dollars are converted at Rs ${USD_TO_MUR} per $1 and rounded up to the next rupee; your bank's rate may differ slightly.`;

// Clicking outside a pop-up (on the dimmed background) closes it, like Cancel.
// Both the press and the release must be outside, so dragging out of a text box doesn't close it.
for (const dialog of [planDialog, serviceDialog]) {
    const isOutside = (e) => {
        if (e.target !== dialog) return false; // clicked something inside the window
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    dialog.addEventListener("pointerdown", (e) => { pressedOutside = isOutside(e); });
    dialog.addEventListener("click", (e) => {
        if (pressedOutside && isOutside(e)) dialog.close();
        pressedOutside = false;
    });
}

// Post any charges that came due since the last visit
function postDueCharges() {
    if (syncSubscriptions(data) > 0) {
        try { saveExpenseData(data); } catch (e) {}
    }
}

// This page keeps its own copy of your data. If another tab or page changed it (or you
// came back with the browser's Back button), reload it first: saving the old copy
// would wipe out what the other page added.
function reloadFromStorage() {
    if (planDialog.open) planDialog.close();
    if (serviceDialog.open) serviceDialog.close();
    hideToast();
    data = loadExpenseData();
    customServices = loadCustomServices();
    postDueCharges();
    render();
}
window.addEventListener("storage", (e) => {
    if (e.key === null || e.key === EXPENSES_KEY || e.key === CUSTOM_SERVICES_KEY) reloadFromStorage();
});
window.addEventListener("pageshow", (e) => { if (e.persisted) reloadFromStorage(); });

postDueCharges();
render();
