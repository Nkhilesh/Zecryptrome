// Subscription services and their plans, used by the Subscriptions page.
//
// Prices were checked in November 2026. Most services bill Mauritius in US dollars,
// so plans are listed in USD (`usd`) and converted at USD_TO_MUR, rounded UP to the
// next whole rupee. Plans billed in rupees use `rs` instead.
// `priceSource` says where the figures come from:
//   "mu" - the price charged in Mauritius
//   "mu-old" - the last Mauritius price published, but no recent confirmation
//   "us" - no Mauritius price was published, so this is the US price (yours may be lower)
//
// Optional service fields:
//   note       - extra text shown in the plan window (e.g. availability caveats)
//   editablePrice - the price box is shown so you can enter what you actually pay
// Optional plan field:
//   askPrice   - no listed price: the user must type theirs (needs editablePrice)
//   includedIn - this service comes free with another one; its card opens that
//                service's plans instead of adding a second charge
//
// Services you add yourself are stored in this browser under CUSTOM_SERVICES_KEY,
// in the final shape: { id, name, domain, color, group, category, plans: [{ name, amountCents, cycle }] }
const CUSTOM_SERVICES_KEY = "subscriptions.custom.v1";

// Mid-market rate, early November 2026. Update it to refresh every USD price.
const USD_TO_MUR = 47.3;
const PRICES_CHECKED = "November 2026";

// Whole rupees, rounded up, stored as cents
const priceCents = (plan) => (plan.rs != null ? plan.rs : Math.ceil(plan.usd * USD_TO_MUR - 1e-9)) * 100;

const RAW_CATALOG = [
    // Video
    { id: "netflix", name: "Netflix", domain: "netflix.com", color: "#E50914", group: "Video", priceSource: "mu", plans: [
        { name: "Mobile", usd: 2.99, cycle: "monthly" },
        { name: "Basic", usd: 3.99, cycle: "monthly" },
        { name: "Standard", usd: 7.99, cycle: "monthly" },
        { name: "Premium", usd: 9.99, cycle: "monthly" },
    ] },
    { id: "disneyplus", name: "Disney+", domain: "disneyplus.com", color: "#0E3D8C", group: "Video", priceSource: "us",
      note: "Disney+ isn't officially offered in Mauritius.", plans: [
        { name: "Basic (with ads)", usd: 12.49, cycle: "monthly" },
        { name: "Premium", usd: 21.49, cycle: "monthly" },
        { name: "Premium (yearly)", usd: 214.99, cycle: "yearly" },
    ] },
    // Since September 2026 Apple TV isn't sold on its own in Mauritius: it comes with every iCloud+ plan
    { id: "appletv", name: "Apple TV", domain: "tv.apple.com", color: "#000000", group: "Video", includedIn: "icloud",
      note: "In Mauritius, Apple TV and Apple Arcade are included with every iCloud+ plan and are no longer sold separately. Pick your iCloud+ plan.", plans: [] },
    // TV providers: `multi` lets you tick several packs (e.g. Sport + Ciné). Each ticked
    // pack is saved as its own subscription. `section` groups the list in the plan window.
    { id: "canalplus", name: "Canal+ Maurice", domain: "canalplus.com", color: "#000000", group: "TV", priceSource: "mu", multi: true, plans: [
        { section: "Packs", name: "100% Digital (no decoder)", rs: 250, cycle: "monthly" },
        { section: "Packs", name: "Sport", rs: 500, cycle: "monthly" },
        { section: "Packs", name: "Ciné & Séries Max", rs: 500, cycle: "monthly" },
        { section: "Packs", name: "Famille", rs: 500, cycle: "monthly" },
        { section: "Packs", name: "Totale Ciné & Séries", rs: 625, cycle: "monthly" },
        { section: "Packs", name: "Tout CANAL+", rs: 2075, cycle: "monthly" },
        { section: "Options", name: "Ciné+ OCS", rs: 350, cycle: "monthly" },
        { section: "Options", name: "HBO", rs: 500, cycle: "monthly" },
        { section: "Options", name: "Bollywood", rs: 250, cycle: "monthly" },
        { section: "Options", name: "Découverte", rs: 250, cycle: "monthly" },
        { section: "Options", name: "Kids", rs: 250, cycle: "monthly" },
        { section: "Options", name: "Divertissement Max", rs: 250, cycle: "monthly" },
        { section: "Options", name: "DStv English Plus", rs: 400, cycle: "monthly" },
        { section: "Options", name: "Netflix Essentiel", rs: 190, cycle: "monthly" },
        { section: "Options", name: "Netflix Standard", rs: 370, cycle: "monthly" },
        { section: "Options", name: "Netflix Premium", rs: 460, cycle: "monthly" },
        { section: "Options", name: "2nd TV", rs: 400, cycle: "monthly" },
    ] },
    { id: "primevideo", name: "Prime Video", domain: "primevideo.com", color: "#00A8E1", group: "Video", priceSource: "mu-old", plans: [
        { name: "Monthly", usd: 5.99, cycle: "monthly" },
    ] },
    { id: "youtube", name: "YouTube Premium", domain: "youtube.com", color: "#FF0000", group: "Video", priceSource: "us", plans: [
        { name: "Individual", usd: 15.99, cycle: "monthly" },
        { name: "Family", usd: 26.99, cycle: "monthly" },
        { name: "Student", usd: 8.99, cycle: "monthly" },
    ] },
    { id: "crunchyroll", name: "Crunchyroll", domain: "crunchyroll.com", color: "#F47521", group: "Video", priceSource: "us", plans: [
        { name: "Fan", usd: 9.99, cycle: "monthly" },
        { name: "Mega Fan", usd: 13.99, cycle: "monthly" },
        { name: "Fan (yearly)", usd: 99.99, cycle: "yearly" },
        { name: "Mega Fan (yearly)", usd: 139.99, cycle: "yearly" },
        { name: "Ultimate Fan", usd: 17.99, cycle: "monthly" },
        { name: "Ultimate Fan (yearly)", usd: 179.99, cycle: "yearly" },
    ] },

    // Music
    { id: "spotify", name: "Spotify", domain: "spotify.com", color: "#1DB954", group: "Music", priceSource: "mu", plans: [
        { name: "Individual", usd: 3.29, cycle: "monthly" },
        { name: "Student", usd: 1.69, cycle: "monthly" },
        { name: "Duo", usd: 4.49, cycle: "monthly" },
        { name: "Family", usd: 5.79, cycle: "monthly" },
    ] },
    { id: "applemusic", name: "Apple Music", domain: "music.apple.com", color: "#FA243C", group: "Music", priceSource: "us",
      note: "The \"with iCloud+\" prices are Apple's Mauritius rates for people who also pay for iCloud+.", plans: [
        { name: "Individual", usd: 11.99, cycle: "monthly" },
        { name: "Student", usd: 6.99, cycle: "monthly" },
        { name: "Family", usd: 19.99, cycle: "monthly" },
        { name: "Individual (with iCloud+)", usd: 1.99, cycle: "monthly" },
        { name: "Family (with iCloud+)", usd: 3.49, cycle: "monthly" },
    ] },
    { id: "youtubemusic", name: "YouTube Music", domain: "music.youtube.com", color: "#FF0000", group: "Music", priceSource: "us", plans: [
        { name: "Individual", usd: 11.99, cycle: "monthly" },
        { name: "Individual (yearly)", usd: 119.99, cycle: "yearly" },
        { name: "Family", usd: 18.99, cycle: "monthly" },
        { name: "Student", usd: 5.99, cycle: "monthly" },
    ] },
    { id: "deezer", name: "Deezer", domain: "deezer.com", color: "#A238FF", group: "Music", priceSource: "mu", plans: [
        { name: "Premium", usd: 11.99, cycle: "monthly" },
        { name: "Family", usd: 19.99, cycle: "monthly" },
    ] },

    // Cloud storage
    { id: "icloud", name: "iCloud+", domain: "icloud.com", color: "#3693F3", group: "Cloud", priceSource: "mu", plans: [
        { name: "50 GB", usd: 1.19, cycle: "monthly" },
        { name: "200 GB", usd: 3.49, cycle: "monthly" },
        { name: "2 TB", usd: 11.99, cycle: "monthly" },
        { name: "6 TB", usd: 34.99, cycle: "monthly" },
        { name: "12 TB", usd: 69.99, cycle: "monthly" },
    ] },
    { id: "googleone", name: "Google One", domain: "one.google.com", color: "#4285F4", group: "Cloud", priceSource: "us", plans: [
        { name: "Basic 100 GB", usd: 1.99, cycle: "monthly" },
        { name: "Basic 100 GB (yearly)", usd: 19.99, cycle: "yearly" },
        { name: "AI Plus 2 TB", usd: 9.99, cycle: "monthly" },
        { name: "AI Plus 2 TB (yearly)", usd: 99.99, cycle: "yearly" },
        { name: "AI Pro", usd: 19.99, cycle: "monthly" },
        { name: "AI Pro (yearly)", usd: 199.99, cycle: "yearly" },
    ] },

    // AI tools
    { id: "chatgpt", name: "ChatGPT", domain: "chatgpt.com", color: "#10A37F", group: "AI", priceSource: "us", plans: [
        { name: "Go", usd: 8, cycle: "monthly" },
        { name: "Plus", usd: 20, cycle: "monthly" },
        { name: "Pro 100", usd: 100, cycle: "monthly" },
        { name: "Pro 200", usd: 200, cycle: "monthly" },
        { name: "Pro 500", usd: 500, cycle: "monthly" },
    ] },
    { id: "claude", name: "Claude", domain: "claude.ai", color: "#D97757", group: "AI", priceSource: "us", plans: [
        { name: "Pro", usd: 20, cycle: "monthly" },
        { name: "Pro (yearly)", usd: 200, cycle: "yearly" },
        { name: "Max 5x", usd: 100, cycle: "monthly" },
        { name: "Max 20x / Ultra", usd: 200, cycle: "monthly" },
    ] },

    // Gaming
    { id: "xbox", name: "Xbox Game Pass", domain: "xbox.com", color: "#107C10", group: "Gaming", category: "Entertainment", priceSource: "us", plans: [
        { name: "Essential", usd: 9.99, cycle: "monthly" },
        { name: "Premium", usd: 14.99, cycle: "monthly" },
        { name: "PC Game Pass", usd: 13.99, cycle: "monthly" },
        { name: "Ultimate", usd: 22.99, cycle: "monthly" },
    ] },
    { id: "psplus", name: "PlayStation Plus", domain: "playstation.com", color: "#0070D1", group: "Gaming", category: "Entertainment", priceSource: "us", plans: [
        { name: "Essential", usd: 10.99, cycle: "monthly" },
        { name: "Extra", usd: 16.99, cycle: "monthly" },
        { name: "Premium", usd: 19.99, cycle: "monthly" },
        { name: "Essential (yearly)", usd: 79.99, cycle: "yearly" },
        { name: "Extra (yearly)", usd: 134.99, cycle: "yearly" },
        { name: "Premium (yearly)", usd: 159.99, cycle: "yearly" },
    ] },

    // Productivity
    { id: "microsoft365", name: "Microsoft 365", domain: "microsoft.com", color: "#D83B01", group: "Productivity", priceSource: "us", plans: [
        { name: "Basic", usd: 1.99, cycle: "monthly" },
        { name: "Basic (yearly)", usd: 19.99, cycle: "yearly" },
        { name: "Personal", usd: 9.99, cycle: "monthly" },
        { name: "Personal (yearly)", usd: 99.99, cycle: "yearly" },
        { name: "Family", usd: 12.99, cycle: "monthly" },
        { name: "Family (yearly)", usd: 129.99, cycle: "yearly" },
    ] },
    { id: "canva", name: "Canva Pro", domain: "canva.com", color: "#00C4CC", group: "Productivity", priceSource: "us", plans: [
        { name: "Monthly", usd: 18, cycle: "monthly" },
        { name: "Yearly", usd: 144, cycle: "yearly" },
    ] },
    { id: "duolingo", name: "Duolingo Super", domain: "duolingo.com", color: "#58CC02", group: "Productivity", priceSource: "us", plans: [
        { name: "Monthly", usd: 12.99, cycle: "monthly" },
        { name: "Yearly", usd: 84.99, cycle: "yearly" },
    ] },
    { id: "adobe", name: "Adobe Creative Cloud", domain: "adobe.com", color: "#FA0F00", group: "Productivity", priceSource: "us",
      note: "Prices are for a yearly commitment paid monthly. Paying month to month costs more.", plans: [
        { name: "Creative Cloud Pro (all apps)", usd: 69.99, cycle: "monthly" },
        { name: "Creative Cloud Standard", usd: 54.99, cycle: "monthly" },
        { name: "Photography (Photoshop + Lightroom)", usd: 19.99, cycle: "monthly" },
        { name: "Acrobat Pro", usd: 19.99, cycle: "monthly" },
        { name: "Acrobat Standard", usd: 14.99, cycle: "monthly" },
    ] },

    // Health & fitness
    { id: "gym", name: "Gym membership", color: "#0d9488", group: "Fitness", category: "Health", priceSource: "mu", editablePrice: true,
      note: "Prices differ between gyms and offers, so change the price to what you pay. Joining fees aren't included (SPARC charges Rs 3,500).", plans: [
        { section: "MoGym 24/7", name: "MoGym Core", rs: 999, cycle: "monthly" },
        { section: "MoGym 24/7", name: "MoGym Basic", rs: 1099, cycle: "monthly" },
        { section: "MoGym 24/7", name: "MoGym Premium", rs: 1990, cycle: "monthly" },
        { section: "SPARC", name: "SPARC Off-peak", rs: 1500, cycle: "monthly" },
        { section: "SPARC", name: "SPARC Basic", rs: 2400, cycle: "monthly" },
        { section: "SPARC", name: "SPARC Premium", rs: 3600, cycle: "monthly" },
        { section: "Other", name: "Other gym", rs: 0, cycle: "monthly", askPrice: true },
    ] },
];

const SUBSCRIPTION_CATALOG = RAW_CATALOG.map((s) => ({
    category: "Subscriptions",
    ...s,
    plans: s.plans.map((p) => ({ name: p.name, section: p.section, cycle: p.cycle, amountCents: priceCents(p), askPrice: p.askPrice })),
}));

function loadCustomServices() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_SERVICES_KEY)) || []; } catch (e) { return []; }
}

// Throws if storage is full or blocked
function saveCustomServices(list) {
    localStorage.setItem(CUSTOM_SERVICES_KEY, JSON.stringify(list));
}

const allServices = () => [...SUBSCRIPTION_CATALOG, ...loadCustomServices()];

// The service a saved subscription belongs to. Subscriptions added on the Expenses
// page have no serviceId, so fall back to matching the name.
function serviceForSubscription(sub, services = allServices()) {
    if (sub.serviceId) {
        const s = services.find((x) => x.id === sub.serviceId);
        if (s) return s;
    }
    const n = sub.name.toLowerCase();
    return services.find((x) => n.startsWith(x.name.toLowerCase()) || n.startsWith(x.id)) || null;
}

// Logo tile: the service's site icon, or its first letter on its brand colour when
// the icon can't be loaded (offline, unknown site, or no website given).
function serviceLogo(service, sizeClass = "h-10 w-10") {
    const name = service?.name || "?";
    const wrap = document.createElement("div");
    wrap.className = `${sizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-xl text-lg font-bold text-white`;
    const showLetter = () => {
        wrap.innerHTML = "";
        wrap.classList.remove("border", "border-slate-200", "bg-white", "dark:border-neutral-700");
        wrap.style.background = service?.color || "#64748b";
        wrap.textContent = name.trim().charAt(0).toUpperCase();
    };
    if (!service?.domain) { showLetter(); return wrap; }

    wrap.classList.add("border", "border-slate-200", "bg-white", "dark:border-neutral-700");
    const img = new Image();
    img.alt = `${name} logo`;
    img.className = "h-full w-full object-contain p-1.5";
    img.referrerPolicy = "no-referrer";
    img.onerror = showLetter;
    // Unknown sites come back as a tiny generic globe; use the letter instead
    img.onload = () => { if (img.naturalWidth < 32) showLetter(); };
    img.src = `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(service.domain)}`;
    wrap.appendChild(img);
    return wrap;
}
