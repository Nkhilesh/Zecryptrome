// Synchronous page-facing cache; cloud hydration happens before page scripts run.
(() => {
  const keys = new Set(['income.v1', 'expenses.v1', 'savings.v1', 'loans.v1', 'scan.history.v1', 'fuel.presets.v1', 'dashboard.categories.v1', 'calendar.filters', 'theme']);
  // Personal settings; everything else is budget data, shared with a partner in a household (joint account)
  const personal = new Set(['dashboard.categories.v1', 'calendar.filters', 'theme']);
  let user, cache = {}, pending = {}, running = null;
  let owner = null; // whose budget is shown: yours, or your partner's if you joined their household
  const ownerFor = key => personal.has(key) ? user.id : (owner || user.id);
  const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';
  const panel = document.createElement('div');
  panel.innerHTML = `
    <!-- Shown until you are signed in and your data has loaded -->
    <section data-part="gate" class="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-black">
      <div class="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white">
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/><path d="M16 13h.01"/></svg>
        </div>
        <h1 class="mt-4 text-2xl font-semibold">Budget Tracker</h1>
        <p data-part="intro" class="mt-1 text-sm text-slate-500 dark:text-neutral-400">Sign in to see your budget. Your data is saved to your account, so it's the same on every device.</p>
        <form hidden class="mt-5 space-y-3">
          <label data-part="name" style="display: none" class="text-sm">Your name
            <input name="name" autocomplete="name" maxlength="60" placeholder="e.g. Asha Ramdin" class="${field}">
            <span class="mt-1 block text-xs text-slate-500 dark:text-neutral-400">Shown in your greeting. You can change it later in Settings.</span>
          </label>
          <label class="block text-sm">Email
            <input name="email" type="email" autocomplete="email" required class="${field}">
          </label>
          <label class="block text-sm">Password
            <input name="password" type="password" autocomplete="current-password" minlength="6" required class="${field}">
            <span class="mt-1 block text-xs text-slate-500 dark:text-neutral-400">At least 6 characters.</span>
          </label>
          <button type="submit" data-action="submit" class="w-full rounded-lg bg-teal-600 p-2.5 font-medium text-white hover:bg-teal-500 disabled:opacity-60">Sign in</button>
          <button type="button" data-action="signup" class="w-full rounded-lg border border-slate-300 p-2.5 font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-900">Create account</button>
        </form>
        <p data-part="status" role="status" class="mt-4 text-sm text-slate-600 empty:hidden dark:text-neutral-300"></p>
        <div class="mt-3 flex flex-wrap gap-4 text-sm empty:hidden">
          <button type="button" data-action="reload" hidden class="font-medium text-teal-700 hover:underline dark:text-teal-400">Try again</button>
          <button type="button" data-action="gate-logout" hidden class="text-slate-500 hover:underline dark:text-neutral-400">Sign out</button>
        </div>
      </div>
    </section>
    <!-- Shown above the page once signed in -->
    <section data-part="bar" hidden class="mx-auto max-w-3xl border-x border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-500 dark:border-neutral-800 dark:bg-black dark:text-neutral-400">
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p data-part="status" role="status"></p>
        <div class="flex flex-wrap gap-4">
          <button type="button" data-action="retry" hidden class="font-medium text-teal-700 hover:underline dark:text-teal-400">Retry sync</button>
          <button type="button" data-action="import" hidden class="font-medium text-teal-700 hover:underline dark:text-teal-400">Import this browser's data</button>
          <button type="button" data-action="logout" class="hover:underline">Sign out</button>
        </div>
      </div>
    </section>`;
  document.body.prepend(panel);
  const part = name => panel.querySelector(`[data-part="${name}"]`);
  const main = document.querySelector('main');
  main.hidden = true; // nothing half-loaded behind the sign-in screen
  // The sign-in card only appears when it's needed (signed out, first load on this device, or an error),
  // so moving between pages doesn't flash a loading screen
  const gate = part('gate');
  const showGate = () => { gate.hidden = false; gate.style.display = ''; };
  gate.hidden = true; gate.style.display = 'none';
  const form = panel.querySelector('form');
  const button = action => panel.querySelector(`[data-action="${action}"]`);
  const message = text => { for (const el of panel.querySelectorAll('[data-part="status"]')) el.textContent = text; };
  const cacheKey = () => `zecryptrome.cloud.${user.id}`;
  function persist() { localStorage.setItem(cacheKey(), JSON.stringify({ cache, pending, owner })); }
  async function flush() {
    if (running) return running;
    if (!user || !Object.keys(pending).length) return;
    running = (async () => {
      message('Saving…');
      try {
        while (Object.keys(pending).length) {
          const [key, value] = Object.entries(pending)[0];
          const { error } = await db.from('zecryptrome_data').upsert({ user_id: ownerFor(key), key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
          if (error) throw error;
          if (pending[key] === value) delete pending[key];
          persist();
        }
        button('retry').hidden = true;
        message(`Signed in as ${user.email}. All changes saved.`);
      } catch (error) {
        button('retry').hidden = false;
        message(`Changes are saved on this device and waiting to sync: ${error.message}.`);
        throw error;
      }
    })();
    try { await running; } finally { running = null; }
  }
  window.AppStorage = {
    getItem(key) { return keys.has(key) ? cache[key] ?? null : localStorage.getItem(key); },
    setItem(key, value) {
      if (!keys.has(key)) return localStorage.setItem(key, value);
      if (!user) throw new Error('Sign in before saving.');
      const previous = cache[key], previousPending = pending[key];
      cache[key] = String(value); pending[key] = String(value);
      try { persist(); } catch (error) {
        if (previous === undefined) delete cache[key]; else cache[key] = previous;
        if (previousPending === undefined) delete pending[key]; else pending[key] = previousPending;
        throw error;
      }
      void flush().catch(() => {});
    },
    flush
  };
  // For the account settings (account.js)
  window.Account = {
    get user() { return user; },
    get isPartner() { return Boolean(user && owner && owner !== user.id); },
    setUser(u) { if (u && user && u.id === user.id) user = u; },
  };
  // The card has two modes: sign in, and create account (which asks for your name too)
  let signupMode = false;
  function setSignupMode(on) {
    signupMode = on;
    part('name').style.display = on ? 'block' : 'none'; // only when creating an account
    form.elements.name.required = on;
    form.elements.password.autocomplete = on ? 'new-password' : 'current-password';
    button('submit').textContent = on ? 'Create account' : 'Sign in';
    button('signup').textContent = on ? 'I already have an account' : 'Create account';
    part('intro').textContent = on
      ? "Create your account. Your data is saved to it, so it's the same on every device."
      : "Sign in to see your budget. Your data is saved to your account, so it's the same on every device.";
    message('');
    (on ? form.elements.name : form.elements.email).focus();
  }
  async function authenticate(signup) {
    if (signup) form.elements.name.value = form.elements.name.value.trim().replace(/\s+/g, ' ');
    if (!form.reportValidity()) return;
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach(b => b.disabled = true);
    try {
      const email = form.elements.email.value.trim(), password = form.elements.password.value;
      const result = signup ? await signUp(email, password, form.elements.name.value) : await login(email, password);
      if (result.session) location.reload();
      else {
        setSignupMode(false);
        form.elements.email.value = email;
        message('Account created. Check your email for a confirmation link, then sign in here.');
      }
    } catch (error) { message(error.message); }
    finally { buttons.forEach(b => b.disabled = false); }
  }
  form.addEventListener('submit', event => { event.preventDefault(); void authenticate(signupMode); });
  button('signup').onclick = () => setSignupMode(!signupMode);
  button('retry').onclick = () => flush().catch(() => {});
  button('reload').onclick = () => location.reload();
  button('gate-logout').onclick = async () => { try { await logout(); } catch (e) {} location.reload(); };
  button('logout').onclick = async () => {
    try { await flush(); await logout(); location.reload(); }
    catch (error) { message(`Sign out could not finish: ${error.message}. Retry syncing first.`); }
  };
  button('import').onclick = async () => {
    if (!confirm('Copy existing browser data into this account? This is available only for an empty account.')) return;
    try {
      const { data, error } = await db.from('zecryptrome_data').select('key').eq('user_id', user.id);
      if (error) throw error;
      if (data.length || Object.keys(pending).length) throw new Error('This account already contains data; import was cancelled to avoid replacing it.');
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value !== null) { cache[key] = value; pending[key] = value; }
      }
      persist(); await flush(); location.reload();
    } catch (error) { message(`Import could not finish: ${error.message}`); }
  };
  window.addEventListener('online', () => { void flush().catch(() => {}); });
  window.addEventListener('beforeunload', event => {
    if (Object.keys(pending).length) { event.preventDefault(); event.returnValue = ''; }
  });
  // Show the page: the account bar on top, the sign-in card gone
  function openApp() {
    message(`Signed in as ${user.email}.`);
    gate.hidden = true; gate.style.display = 'none';
    part('bar').hidden = false;
    main.hidden = false;
    if (cache.theme != null) document.documentElement.classList.toggle('dark', cache.theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : cache.theme === 'dark');
  }

  // Confirm the login with Supabase and fetch the latest data.
  // Returns true if the data differs from what this device had saved.
  async function refreshFromCloud() {
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError) throw authError;
    if (!auth.user || auth.user.id !== user.id) throw new Error('Please sign in again.');
    user = auth.user;
    // Joined a partner's household? Then the budget comes from their account.
    // (If the household table isn't set up yet, everyone just has their own budget.)
    let newOwner = user.id;
    const { data: homes, error: homeError } = await db.from('zecryptrome_households')
      .select('owner_id,partner_id').or(`owner_id.eq.${user.id},partner_id.eq.${user.id}`);
    if (!homeError) {
      const joined = (homes || []).find(h => h.partner_id === user.id);
      if (joined) newOwner = joined.owner_id;
    }
    if (newOwner !== (owner || user.id)) {
      // Switched budgets: unsynced edits to the old shared budget can't go to the new one
      for (const key of Object.keys(pending)) if (!personal.has(key)) delete pending[key];
    }
    owner = newOwner;
    const { data, error } = await db.from('zecryptrome_data').select('user_id,key,value').in('user_id', [...new Set([user.id, owner])]);
    if (error) throw error;
    const fresh = Object.fromEntries(data.filter(row => keys.has(row.key) && row.user_id === ownerFor(row.key)).map(row => [row.key, row.value]));
    Object.assign(fresh, pending); // changes made on this device that haven't synced yet win
    const same = (x, y) => JSON.stringify(Object.entries(x).sort()) === JSON.stringify(Object.entries(y).sort());
    const changed = !same(fresh, cache);
    cache = fresh;
    persist();
    button('import').hidden = owner !== user.id || data.length > 0 || Object.keys(pending).length > 0;
    return changed;
  }

  window.CloudReady = (async () => {
    try {
      const { data: { session }, error: sessionError } = await db.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        showGate();
        message('');
        try {
          if (sessionStorage.getItem('zecryptrome.accountDeleted')) {
            sessionStorage.removeItem('zecryptrome.accountDeleted');
            message('Your account and its data have been deleted.');
          }
        } catch (e) {}
        form.hidden = false;
        form.elements.email.focus();
        return false;
      }
      user = session.user;
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(cacheKey())); } catch (e) {}
      pending = Object.fromEntries(Object.entries(saved?.pending || {}).filter(([key]) => keys.has(key)));
      owner = saved?.owner || user.id;
      db.auth.onAuthStateChange((event, s) => {
        if (event === 'SIGNED_OUT' || (s && s.user.id !== user.id)) location.reload();
      });

      if (saved?.cache) {
        // Seen this account on this device before: draw the page straight away from the saved copy,
        // then check with Supabase in the background
        cache = Object.assign(Object.fromEntries(Object.entries(saved.cache).filter(([key]) => keys.has(key))), pending);
        openApp();
        void flush().catch(() => {});
        refreshFromCloud().then((changed) => {
          // Another device changed something: reload once to show it (the reload is instant, from the updated copy)
          if (changed) location.reload();
        }).catch(async (error) => {
          if (error?.status === 401 || error?.status === 403 || /sign in again|jwt|token/i.test(error?.message || '')) {
            // The login has expired or was revoked: back to the sign-in card (no reload, so it can't loop)
            try { await logout(); } catch (e) {}
            main.hidden = true; part('bar').hidden = true;
            showGate(); form.hidden = false;
            message('Your session has expired. Please sign in again.');
          } else {
            message(`Signed in as ${user.email}. Offline: showing the data saved on this device.`);
          }
        });
        return true;
      }

      // First time on this device: nothing saved yet, so wait for the data
      showGate();
      message('Loading your data…');
      await refreshFromCloud();
      openApp();
      void flush().catch(() => {});
      return true;
    } catch (error) {
      showGate();
      part('intro').textContent = "Your data couldn't be loaded.";
      message(`${error.message}. Check your internet connection and try again. (If this is a new Supabase project, run supabase-schema.sql in its SQL Editor first.)`);
      button('reload').hidden = false;
      button('gate-logout').hidden = !user;
      return false;
    }
  })();
})();
