// Settings menu: profile, account settings, household (joint account) and log out.
// Uses the Supabase client (db, logout) from supabase-config.js and the signed-in user from cloud-store.js.
(() => {
  const $ = (id) => document.getElementById(id);
  const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900";
  const dialogClass = "max-h-[90vh] w-[90%] max-w-sm rounded-2xl p-6 backdrop:bg-black/60 dark:border dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100";
  const primary = "rounded-lg bg-teal-600 px-4 py-2 font-medium text-white hover:bg-teal-500 disabled:opacity-60";
  const secondary = "rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-900";
  const note = "text-xs text-slate-500 dark:text-neutral-400";
  const closeRow = `<div class="flex gap-2"><button type="button" data-close class="flex-1 ${secondary}">Close</button></div>`;

  const user = () => window.Account?.user;
  const fullName = () => (user()?.user_metadata?.full_name || "").trim();

  function makeDialog(id, html) {
    const d = document.createElement("dialog");
    d.id = id;
    d.className = dialogClass;
    d.innerHTML = html;
    d.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) d.close(); });
    document.body.appendChild(d);
    return d;
  }
  // Show a result under a form section. kind: "ok" | "error" | "" (neutral)
  function say(el, text, kind = "") {
    el.textContent = text;
    el.className = "text-sm empty:hidden " + (kind === "error" ? "text-red-600 dark:text-red-400" : kind === "ok" ? "text-teal-700 dark:text-teal-400" : "text-slate-600 dark:text-neutral-300");
  }
  async function busy(button, task) {
    button.disabled = true;
    try { return await task(); } finally { button.disabled = false; }
  }
  function openFromMenu(dialog, prepare) {
    if (typeof setMenuOpen === "function") setMenuOpen(false);
    prepare?.();
    dialog.showModal();
  }

  // ---------- menu header: avatar, name, email ----------
  function renderMenuProfile() {
    const name = fullName(), email = user()?.email || "";
    $("profile-avatar").textContent = (name || email || "?").trim().charAt(0).toUpperCase();
    $("profile-name").textContent = name || "Add your name";
    $("profile-email").textContent = email;
    if (typeof renderHeader === "function") renderHeader(); // greeting uses the name
  }

  // ---------- Profile ----------
  const profile = makeDialog("profileDialog", `
    <form class="space-y-3">
      <h2 class="text-lg font-semibold">Profile</h2>
      <label class="block text-sm">Your name
        <input name="name" maxlength="60" autocomplete="name" placeholder="e.g. Kavya Ramdin" class="${field}">
        <span class="mt-1 block ${note}">Shown in the greeting on the home screen.</span>
      </label>
      <label class="block text-sm">Email
        <input name="email" readonly class="${field} text-slate-500 dark:text-neutral-400">
        <span class="mt-1 block ${note}">To change it, use Account settings.</span>
      </label>
      <p data-msg role="status"></p>
      <div class="flex gap-2">
        <button type="button" data-close class="flex-1 ${secondary}">Cancel</button>
        <button type="submit" class="flex-1 ${primary}">Save</button>
      </div>
    </form>`);
  const profileForm = profile.querySelector("form");
  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = profile.querySelector("[data-msg]");
    const name = profileForm.elements.name.value.trim().replace(/\s+/g, " ");
    await busy(e.submitter || profileForm.querySelector("[type=submit]"), async () => {
      const { data, error } = await db.auth.updateUser({ data: { full_name: name } });
      if (error) return say(msg, error.message, "error");
      window.Account.setUser(data.user);
      renderMenuProfile();
      profile.close();
    });
  });

  // ---------- Account settings ----------
  const account = makeDialog("accountDialog", `
    <form class="space-y-5" novalidate>
      <h2 class="text-lg font-semibold">Account settings</h2>
      <section class="space-y-2">
        <h3 class="text-sm font-semibold">Email address</h3>
        <p class="${note}">Now: <span data-current-email></span></p>
        <input name="email" type="email" autocomplete="email" placeholder="New email address" class="${field}">
        <button type="button" data-action="email" class="${secondary} w-full">Change email</button>
        <p data-msg="email" role="status"></p>
      </section>
      <section class="space-y-2 border-t border-slate-200 pt-4 dark:border-neutral-800">
        <h3 class="text-sm font-semibold">Password</h3>
        <input name="password" type="password" autocomplete="new-password" placeholder="New password (at least 6 characters)" class="${field}">
        <input name="confirm" type="password" autocomplete="new-password" placeholder="Type it again" class="${field}">
        <button type="button" data-action="password" class="${secondary} w-full">Change password</button>
        <p data-msg="password" role="status"></p>
      </section>
      <section class="space-y-2 border-t border-slate-200 pt-4 dark:border-neutral-800">
        <h3 class="text-sm font-semibold">Devices</h3>
        <p class="${note}">Lost a phone? This signs you out everywhere, including here.</p>
        <button type="button" data-action="everywhere" class="${secondary} w-full">Sign out of all devices</button>
        <p data-msg="everywhere" role="status"></p>
      </section>
      <section class="space-y-2 border-t border-slate-200 pt-4 dark:border-neutral-800">
        <h3 class="text-sm font-semibold text-red-600 dark:text-red-400">Delete account</h3>
        <p class="${note}">Permanently deletes your account and everything in it: income, expenses, subscriptions, savings, loans and scans. This can't be undone.</p>
        <p data-household-warning class="hidden rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"></p>
        <label class="block text-sm">Type <b>DELETE</b> to confirm
          <input name="confirmDelete" autocomplete="off" autocapitalize="characters" spellcheck="false" class="${field}">
        </label>
        <button type="button" data-action="delete" class="w-full rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-500 disabled:opacity-60">Delete my account</button>
        <p data-msg="delete" role="status"></p>
      </section>
      ${closeRow}
    </form>`);
  const accountForm = account.querySelector("form");
  const accountMsg = (name) => account.querySelector(`[data-msg="${name}"]`);
  account.querySelector('[data-action="email"]').addEventListener("click", (e) => busy(e.currentTarget, async () => {
    const input = accountForm.elements.email, email = input.value.trim();
    if (!input.checkValidity() || !email) return say(accountMsg("email"), "Enter a valid email address.", "error");
    if (email.toLowerCase() === (user()?.email || "").toLowerCase()) return say(accountMsg("email"), "That's already your email address.", "error");
    const { error } = await db.auth.updateUser({ email });
    if (error) return say(accountMsg("email"), error.message, "error");
    input.value = "";
    say(accountMsg("email"), `Check your inbox: we sent a link to ${email}. Your email changes once you open it (your current address may get a link to confirm too).`, "ok");
  }));
  account.querySelector('[data-action="password"]').addEventListener("click", (e) => busy(e.currentTarget, async () => {
    const pw = accountForm.elements.password.value, again = accountForm.elements.confirm.value;
    if (pw.length < 6) return say(accountMsg("password"), "Use at least 6 characters.", "error");
    if (pw !== again) return say(accountMsg("password"), "The two passwords don't match.", "error");
    const { error } = await db.auth.updateUser({ password: pw });
    if (error) return say(accountMsg("password"), error.message, "error");
    accountForm.elements.password.value = accountForm.elements.confirm.value = "";
    say(accountMsg("password"), "Password changed.", "ok");
  }));
  account.querySelector('[data-action="everywhere"]').addEventListener("click", (e) => busy(e.currentTarget, async () => {
    if (!confirm("Sign out on every device, including this one?")) return;
    try { await window.AppStorage?.flush(); } catch (err) {}
    const { error } = await db.auth.signOut({ scope: "global" });
    if (error) return say(accountMsg("everywhere"), error.message, "error");
    location.reload();
  }));

  account.querySelector('[data-action="delete"]').addEventListener("click", (e) => busy(e.currentTarget, async () => {
    if (accountForm.elements.confirmDelete.value.trim().toUpperCase() !== "DELETE") {
      return say(accountMsg("delete"), "Type DELETE in the box to confirm.", "error");
    }
    if (!confirm("Delete your account and all its data for good? This can't be undone.")) return;
    const { error } = await db.rpc("zecryptrome_delete_account");
    if (error) {
      const missing = /zecryptrome_delete_account|could not find the function|PGRST202|42883/i.test(`${error.code} ${error.message}`);
      return say(accountMsg("delete"), missing
        ? "Account deletion isn't switched on for this app yet. Whoever manages the Supabase project needs to run the latest supabase-schema.sql in its SQL Editor."
        : `Couldn't delete your account: ${error.message}`, "error");
    }
    // Gone on the server: clear this device's copy and the login, then show the sign-in card
    const id = user()?.id;
    try { if (id) localStorage.removeItem(`zecryptrome.cloud.${id}`); } catch (err) {}
    try { sessionStorage.setItem("zecryptrome.accountDeleted", "1"); } catch (err) {}
    try { await db.auth.signOut({ scope: "local" }); } catch (err) {}
    location.reload();
  }));

  // Warn before deleting if the budget is shared
  async function renderDeleteWarning() {
    const box = account.querySelector("[data-household-warning]");
    box.classList.add("hidden");
    let state;
    try { state = await loadHousehold(); } catch (err) { return; }
    if (!state || state.missing || !state.home) return;
    const { home, me } = state;
    if (home.partner_id && home.owner_id === me) {
      box.textContent = `You share this budget with ${home.partner_email || "your partner"}. Deleting your account deletes the shared budget too; they go back to their own.`;
    } else if (home.partner_id === me) {
      box.textContent = `You're in ${home.owner_email || "your partner"}'s household. You'll leave it; their budget, including what you added, stays with them.`;
    } else return;
    box.classList.remove("hidden");
  }

  // ---------- Household (joint account) ----------
  const household = makeDialog("householdDialog", `
    <form class="space-y-4" novalidate>
      <h2 class="text-lg font-semibold">Add partner (joint account)</h2>
      <p class="${note}">A joint account: you and your partner see and edit the same budget (income, expenses, subscriptions, savings, loans, scans). Theme and home-page cards stay personal.</p>
      <div data-body class="space-y-3"></div>
      <p data-msg role="status"></p>
      ${closeRow}
    </form>`);
  const hBody = household.querySelector("[data-body]"), hMsg = household.querySelector("[data-msg]");

  async function loadHousehold() {
    const me = user().id;
    const { data, error } = await db.from("zecryptrome_households")
      .select("owner_id,owner_email,partner_id,partner_email,invite_code,invite_expires")
      .or(`owner_id.eq.${me},partner_id.eq.${me}`);
    if (error) {
      // The household table hasn't been created in Supabase yet
      if (/zecryptrome_households|does not exist|schema cache|PGRST205|42P01/i.test(`${error.code} ${error.message}`)) return { missing: true };
      throw error;
    }
    return { home: (data || [])[0] || null, me };
  }

  function renderHouseholdSummary(state) {
    const el = $("household-summary");
    if (!el) return;
    if (!state || state.missing) { el.textContent = "Share your budget with a partner"; return; }
    const { home, me } = state;
    el.textContent = !home ? "Share your budget with a partner"
      : home.partner_id === me ? `In ${home.owner_email || "your partner"}'s household`
      : home.partner_id ? `Shared with ${home.partner_email || "your partner"}`
      : "Invite sent, waiting for your partner";
  }

  async function renderHousehold() {
    hBody.innerHTML = `<p class="${note}">Loading…</p>`;
    say(hMsg, "");
    let state;
    try { state = await loadHousehold(); } catch (error) {
      hBody.innerHTML = "";
      return say(hMsg, `Couldn't load your household: ${error.message}`, "error");
    }
    renderHouseholdSummary(state);
    if (state.missing) {
      hBody.innerHTML = `<p class="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Household sharing isn't switched on for this app yet. Whoever manages the Supabase project needs to run the household part of <b>supabase-schema.sql</b> in its SQL Editor.</p>`;
      return;
    }
    const { home, me } = state;

    if (home && home.partner_id === me) {
      // You joined someone else's household
      hBody.innerHTML = `
        <div class="rounded-xl border border-teal-600/40 p-3 text-sm">You share <b data-who></b>'s budget. Everything you add goes into it.</div>
        <button type="button" data-act="leave" class="w-full rounded-lg border border-red-300 px-4 py-2 font-medium text-red-600 dark:border-red-900 dark:text-red-400">Leave household</button>
        <p class="${note}">If you leave, you go back to your own budget as it was before you joined. The shared budget stays with ${"<span data-who></span>"}.</p>`;
      hBody.querySelectorAll("[data-who]").forEach((el) => { el.textContent = home.owner_email || "your partner"; });
      hBody.querySelector('[data-act="leave"]').onclick = (e) => leave(e.currentTarget, "Leave this household? You'll go back to your own budget.");
      return;
    }
    if (home && home.partner_id) {
      // Your partner joined you
      hBody.innerHTML = `
        <div class="rounded-xl border border-teal-600/40 p-3 text-sm">Shared with <b data-who></b>. You both see and edit this budget.</div>
        <button type="button" data-act="leave" class="w-full rounded-lg border border-red-300 px-4 py-2 font-medium text-red-600 dark:border-red-900 dark:text-red-400">Stop sharing</button>
        <p class="${note}">Your partner loses access straight away and goes back to their own budget. Your data stays here.</p>`;
      hBody.querySelector("[data-who]").textContent = home.partner_email || "your partner";
      hBody.querySelector('[data-act="leave"]').onclick = (e) => leave(e.currentTarget, "Stop sharing your budget with your partner?");
      return;
    }

    // Not sharing yet: invite your partner, or join theirs
    const invite = home?.invite_code && new Date(home.invite_expires) > new Date() ? home : null;
    hBody.innerHTML = `
      <section class="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-neutral-800">
        <h3 class="text-sm font-semibold">Invite your partner</h3>
        <p class="${note}">They join your budget. Send them the code; they enter it under Settings → Household on their own account.</p>
        <div data-invite class="hidden space-y-2">
          <p class="text-center font-mono text-2xl font-bold tracking-widest" data-code></p>
          <p class="text-center ${note}" data-expiry></p>
          <div class="flex gap-2">
            <button type="button" data-act="share" class="flex-1 ${primary}">Share code</button>
            <button type="button" data-act="cancel" class="flex-1 ${secondary}">Cancel invite</button>
          </div>
        </div>
        <button type="button" data-act="create" class="w-full ${primary}">Create invite code</button>
      </section>
      <section class="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-neutral-800">
        <h3 class="text-sm font-semibold">Join your partner's budget</h3>
        <p class="${note}">Have a code? While you're in their household you see their budget; yours is kept and comes back if you leave.</p>
        <input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Invite code" class="${field} font-mono uppercase tracking-widest">
        <button type="button" data-act="join" class="w-full ${secondary}">Join</button>
      </section>`;
    const showInvite = (code, expires) => {
      hBody.querySelector("[data-invite]").classList.remove("hidden");
      const remake = hBody.querySelector('[data-act="create"]');
      remake.textContent = "Make a new code";
      remake.className = `w-full ${secondary}`;
      hBody.querySelector("[data-code]").textContent = code.replace(/(.{5})/, "$1-");
      hBody.querySelector("[data-expiry]").textContent = `Valid until ${new Date(expires).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;
      hBody.querySelector('[data-act="share"]').onclick = async () => {
        const text = `Join my budget on Budget Tracker: open Settings → Household and enter the code ${code}`;
        try {
          if (navigator.share) await navigator.share({ title: "Budget Tracker invite", text });
          else { await navigator.clipboard.writeText(code); say(hMsg, "Code copied.", "ok"); }
        } catch (err) { /* sharing cancelled */ }
      };
    };
    if (invite) showInvite(invite.invite_code, invite.invite_expires);
    hBody.querySelector('[data-act="create"]').onclick = (e) => busy(e.currentTarget, async () => {
      const { data, error } = await db.rpc("zecryptrome_create_invite");
      if (error) return say(hMsg, error.message, "error");
      showInvite(data, Date.now() + 7 * 864e5);
      renderHouseholdSummary({ home: { invite_code: data }, me: user().id });
      say(hMsg, "");
    });
    hBody.querySelector('[data-act="cancel"]').onclick = (e) => busy(e.currentTarget, async () => {
      const { error } = await db.rpc("zecryptrome_leave_household");
      if (error) return say(hMsg, error.message, "error");
      renderHousehold();
    });
    hBody.querySelector('[data-act="join"]').onclick = (e) => busy(e.currentTarget, async () => {
      const code = household.querySelector("[name=code]").value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (!code) return say(hMsg, "Enter the invite code from your partner.", "error");
      if (!confirm("Join your partner's budget? You'll see and edit their budget instead of yours. Yours is kept and comes back if you leave.")) return;
      const { error } = await db.rpc("zecryptrome_join_household", { code });
      if (error) return say(hMsg, error.message, "error");
      await reloadBudget("Joined. Loading the shared budget…");
    });
  }

  async function leave(button, question) {
    if (!confirm(question)) return;
    await busy(button, async () => {
      try { await window.AppStorage?.flush(); } catch (err) {}
      const { error } = await db.rpc("zecryptrome_leave_household");
      if (error) return say(hMsg, error.message, "error");
      await reloadBudget("Done. Loading your budget…");
    });
  }
  // Whose budget is shown has changed: reload so every figure comes from the right account
  async function reloadBudget(text) {
    say(hMsg, text, "ok");
    try { await window.AppStorage?.flush(); } catch (err) {}
    location.reload();
  }

  // ---------- menu wiring ----------
  $("profile-open").addEventListener("click", () => openFromMenu(profile, () => {
    profileForm.elements.name.value = fullName();
    profileForm.elements.email.value = user()?.email || "";
    say(profile.querySelector("[data-msg]"), "");
  }));
  $("account-open").addEventListener("click", () => openFromMenu(account, () => {
    accountForm.reset();
    account.querySelector("[data-current-email]").textContent = user()?.email || "";
    for (const m of account.querySelectorAll("[data-msg]")) say(m, "");
    void renderDeleteWarning();
  }));
  $("household-open").addEventListener("click", () => openFromMenu(household, renderHousehold));
  $("logout-btn").addEventListener("click", async (e) => {
    const button = e.currentTarget;
    await busy(button, async () => {
      try { await window.AppStorage?.flush(); }
      catch (err) {
        if (!confirm("Some changes haven't synced yet. They're kept on this device and will sync next time you sign in here. Log out anyway?")) return;
      }
      try { await logout(); } catch (err) { alert(`Couldn't log out: ${err.message}`); return; }
      location.reload();
    });
  });

  renderMenuProfile();
  loadHousehold().then(renderHouseholdSummary).catch(() => {});
})();
