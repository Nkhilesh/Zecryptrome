// Subscription services and their plans, used by the Subscriptions page.
// Prices are typical figures in rupees (many services bill in USD, so your bank's
// rate changes the exact amount). The price can be edited before a plan is added.
//
// Services you add yourself are stored in this browser under CUSTOM_SERVICES_KEY,
// in the same shape: { id, name, domain, color, group, category, plans: [{ name, amountCents, cycle }] }
const CUSTOM_SERVICES_KEY = "subscriptions.custom.v1";

const rs = (n) => Math.round(n * 100);

const SUBSCRIPTION_CATALOG = [
    // Video
    { id: "netflix", name: "Netflix", domain: "netflix.com", color: "#E50914", group: "Video", category: "Subscriptions", plans: [
        { name: "Basic", amountCents: rs(299), cycle: "monthly" },
        { name: "Standard", amountCents: rs(449), cycle: "monthly" },
        { name: "Premium", amountCents: rs(599), cycle: "monthly" },
    ] },
    { id: "disneyplus", name: "Disney+", domain: "disneyplus.com", color: "#0E3D8C", group: "Video", category: "Subscriptions", plans: [
        { name: "Standard", amountCents: rs(399), cycle: "monthly" },
        { name: "Premium", amountCents: rs(549), cycle: "monthly" },
        { name: "Premium (yearly)", amountCents: rs(5490), cycle: "yearly" },
    ] },
    { id: "primevideo", name: "Prime Video", domain: "primevideo.com", color: "#00A8E1", group: "Video", category: "Subscriptions", plans: [
        { name: "Monthly", amountCents: rs(275), cycle: "monthly" },
    ] },
    { id: "youtube", name: "YouTube Premium", domain: "youtube.com", color: "#FF0000", group: "Video", category: "Subscriptions", plans: [
        { name: "Individual", amountCents: rs(359), cycle: "monthly" },
        { name: "Family", amountCents: rs(689), cycle: "monthly" },
        { name: "Student", amountCents: rs(229), cycle: "monthly" },
    ] },
    { id: "crunchyroll", name: "Crunchyroll", domain: "crunchyroll.com", color: "#F47521", group: "Video", category: "Subscriptions", plans: [
        { name: "Fan", amountCents: rs(365), cycle: "monthly" },
        { name: "Mega Fan", amountCents: rs(550), cycle: "monthly" },
    ] },
    { id: "canalplus", name: "Canal+", domain: "canalplus.com", color: "#000000", group: "Video", category: "Subscriptions", plans: [
        { name: "Essentiel", amountCents: rs(450), cycle: "monthly" },
        { name: "Évasion", amountCents: rs(990), cycle: "monthly" },
        { name: "Tout Canal+", amountCents: rs(1990), cycle: "monthly" },
    ] },

    // Music
    { id: "spotify", name: "Spotify", domain: "spotify.com", color: "#1DB954", group: "Music", category: "Subscriptions", plans: [
        { name: "Individual", amountCents: rs(279), cycle: "monthly" },
        { name: "Student", amountCents: rs(139), cycle: "monthly" },
        { name: "Duo", amountCents: rs(369), cycle: "monthly" },
        { name: "Family", amountCents: rs(459), cycle: "monthly" },
    ] },
    { id: "applemusic", name: "Apple Music", domain: "music.apple.com", color: "#FA243C", group: "Music", category: "Subscriptions", plans: [
        { name: "Individual", amountCents: rs(249), cycle: "monthly" },
        { name: "Student", amountCents: rs(149), cycle: "monthly" },
        { name: "Family", amountCents: rs(399), cycle: "monthly" },
    ] },
    { id: "deezer", name: "Deezer", domain: "deezer.com", color: "#A238FF", group: "Music", category: "Subscriptions", plans: [
        { name: "Premium", amountCents: rs(275), cycle: "monthly" },
        { name: "Student", amountCents: rs(139), cycle: "monthly" },
        { name: "Family", amountCents: rs(459), cycle: "monthly" },
    ] },

    // Cloud storage
    { id: "icloud", name: "iCloud+", domain: "icloud.com", color: "#3693F3", group: "Cloud", category: "Subscriptions", plans: [
        { name: "50 GB", amountCents: rs(45), cycle: "monthly" },
        { name: "200 GB", amountCents: rs(135), cycle: "monthly" },
        { name: "2 TB", amountCents: rs(455), cycle: "monthly" },
        { name: "6 TB", amountCents: rs(1380), cycle: "monthly" },
    ] },
    { id: "googleone", name: "Google One", domain: "one.google.com", color: "#4285F4", group: "Cloud", category: "Subscriptions", plans: [
        { name: "100 GB", amountCents: rs(90), cycle: "monthly" },
        { name: "2 TB", amountCents: rs(460), cycle: "monthly" },
        { name: "2 TB (yearly)", amountCents: rs(4600), cycle: "yearly" },
    ] },

    // AI tools
    { id: "chatgpt", name: "ChatGPT", domain: "chatgpt.com", color: "#10A37F", group: "AI", category: "Subscriptions", plans: [
        { name: "Plus", amountCents: rs(920), cycle: "monthly" },
        { name: "Pro", amountCents: rs(9200), cycle: "monthly" },
    ] },
    { id: "claude", name: "Claude", domain: "claude.ai", color: "#D97757", group: "AI", category: "Subscriptions", plans: [
        { name: "Pro", amountCents: rs(920), cycle: "monthly" },
        { name: "Pro (yearly)", amountCents: rs(9380), cycle: "yearly" },
        { name: "Max 5x", amountCents: rs(4600), cycle: "monthly" },
        { name: "Max 20x", amountCents: rs(9200), cycle: "monthly" },
    ] },

    // Gaming
    { id: "xbox", name: "Xbox Game Pass", domain: "xbox.com", color: "#107C10", group: "Gaming", category: "Entertainment", plans: [
        { name: "Core", amountCents: rs(460), cycle: "monthly" },
        { name: "Standard", amountCents: rs(690), cycle: "monthly" },
        { name: "Ultimate", amountCents: rs(1380), cycle: "monthly" },
    ] },
    { id: "psplus", name: "PlayStation Plus", domain: "playstation.com", color: "#0070D1", group: "Gaming", category: "Entertainment", plans: [
        { name: "Essential", amountCents: rs(460), cycle: "monthly" },
        { name: "Extra", amountCents: rs(690), cycle: "monthly" },
        { name: "Premium", amountCents: rs(825), cycle: "monthly" },
        { name: "Essential (yearly)", amountCents: rs(3680), cycle: "yearly" },
    ] },

    // Productivity
    { id: "microsoft365", name: "Microsoft 365", domain: "microsoft.com", color: "#D83B01", group: "Productivity", category: "Subscriptions", plans: [
        { name: "Basic (yearly)", amountCents: rs(920), cycle: "yearly" },
        { name: "Personal (yearly)", amountCents: rs(4600), cycle: "yearly" },
        { name: "Family (yearly)", amountCents: rs(5980), cycle: "yearly" },
    ] },
    { id: "canva", name: "Canva Pro", domain: "canva.com", color: "#00C4CC", group: "Productivity", category: "Subscriptions", plans: [
        { name: "Monthly", amountCents: rs(690), cycle: "monthly" },
        { name: "Yearly", amountCents: rs(5520), cycle: "yearly" },
    ] },
    { id: "duolingo", name: "Duolingo Super", domain: "duolingo.com", color: "#58CC02", group: "Productivity", category: "Subscriptions", plans: [
        { name: "Monthly", amountCents: rs(599), cycle: "monthly" },
        { name: "Yearly", amountCents: rs(3910), cycle: "yearly" },
    ] },
];

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
