// Mobile app shell, shared by every page (styles in mobile.css):
// bottom tab bar, sticky page headers, tap-outside-to-close for pop-ups.
(() => {
  const icon = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICONS = {
    home: icon('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>'),
    expenses: icon('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    insights: icon('<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>'),
    calendar: icon('<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  };

  // The four tabs. Every other feature is in the icon grid on the Home screen.
  const TABS = [
    { id: "home", label: "Home", href: "index.html" },
    { id: "expenses", label: "Expenses", href: "expenses.html" },
    { id: "insights", label: "Insights", href: "insights.html" },
    { id: "calendar", label: "Calendar", href: "calendar.html" },
  ];

  const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const current = TABS.find((t) => t.href === page)?.id || (page === "" ? "home" : null);
  const main = document.querySelector("main");
  if (!main) return;

  // ---------- tab bar ----------
  const nav = document.createElement("nav");
  nav.className = "m-tabbar";
  nav.setAttribute("aria-label", "Main");
  nav.innerHTML = `<ul>${TABS.map((t) =>
    `<li><a class="m-tab" href="${t.href}"${t.id === current ? ' aria-current="page"' : ""}>${ICONS[t.id]}<span>${t.label}</span></a></li>`).join("")}</ul>`;
  main.after(nav);

  // ---------- sticky header on inner pages (the ones with a back arrow) ----------
  const header = main.querySelector(":scope > header");
  if (header?.querySelector('a[href="index.html"]')) header.classList.add("m-header");

  // ---------- tap outside a pop-up to close it (same as Cancel) ----------
  // Both the press and the release must be outside, so dragging out of a text box doesn't close it.
  const outside = (dialog, e) => {
    if (e.target !== dialog) return false;
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressed = null;
  document.addEventListener("pointerdown", (e) => {
    pressed = e.target instanceof HTMLDialogElement && outside(e.target, e) ? e.target : null;
  });
  document.addEventListener("click", (e) => {
    if (pressed && e.target === pressed && pressed.open && outside(pressed, e)) pressed.close();
    pressed = null;
  });

  // ---------- browser/status bar colour follows the theme ----------
  const meta = document.querySelector('meta[name="theme-color"]');
  const syncThemeColor = () => { if (meta) meta.content = document.documentElement.classList.contains("dark") ? "#000000" : "#ffffff"; };
  new MutationObserver(syncThemeColor).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  syncThemeColor();
})();
