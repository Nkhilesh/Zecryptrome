// Synchronous page-facing cache; cloud hydration happens before page scripts run.
(() => {
  const keys = new Set(['income.v1', 'expenses.v1', 'savings.v1', 'loans.v1', 'scan.history.v1', 'fuel.presets.v1', 'dashboard.categories.v1', 'calendar.filters', 'theme']);
  let user, cache = {}, pending = {}, running = null;
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const panel = document.createElement('section');
  panel.className = 'mx-auto max-w-3xl border-b border-slate-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-black';
  panel.innerHTML = `<details open><summary class="cursor-pointer font-semibold">Account & cloud sync</summary><form class="mt-3 flex flex-wrap gap-2"><label>Email <input name="email" type="email" autocomplete="email" required class="rounded border p-2 text-black"></label><label>Password <input name="password" type="password" autocomplete="current-password" minlength="6" required class="rounded border p-2 text-black"></label><button type="submit" class="rounded bg-teal-700 px-3 py-2 text-white">Sign in</button><button type="button" data-action="signup" class="rounded border px-3 py-2">Create account</button></form><div class="mt-2 flex flex-wrap gap-3"><button type="button" data-action="retry" class="underline">Retry sync</button><button type="button" data-action="import" class="underline" hidden>Import browser data</button><button type="button" data-action="logout" class="underline" hidden>Sign out</button></div></details>`;
  panel.querySelector('details').append(status);
  document.body.prepend(panel);
  const form = panel.querySelector('form');
  const button = action => panel.querySelector(`[data-action="${action}"]`);
  const message = text => { status.textContent = text; };
  const cacheKey = () => `zecryptrome.cloud.${user.id}`;
  function persist() { localStorage.setItem(cacheKey(), JSON.stringify({ cache, pending })); }
  async function flush() {
    if (running) return running;
    if (!user || !Object.keys(pending).length) return;
    running = (async () => {
      message('Saving changes to Supabase?');
      try {
        while (Object.keys(pending).length) {
          const [key, value] = Object.entries(pending)[0];
          const { error } = await db.from('zecryptrome_data').upsert({ user_id: user.id, key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
          if (error) throw error;
          if (pending[key] === value) delete pending[key];
          persist();
        }
        message(`Signed in as ${user.email}. All changes saved to Supabase.`);
      } catch (error) {
        message(`Changes remain on this device and are awaiting sync: ${error.message}. Use Retry sync.`);
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
  async function authenticate(signup) {
    if (!form.reportValidity()) return;
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach(b => b.disabled = true);
    try {
      const email = form.elements.email.value.trim(), password = form.elements.password.value;
      const result = signup ? await signUp(email, password) : await login(email, password);
      if (result.session) location.reload();
      else message('Check your email to confirm your account, then sign in.');
    } catch (error) { message(error.message); }
    finally { buttons.forEach(b => b.disabled = false); }
  }
  form.addEventListener('submit', event => { event.preventDefault(); void authenticate(false); });
  button('signup').onclick = () => authenticate(true);
  button('retry').onclick = () => user ? flush().catch(() => {}) : location.reload();
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
  window.CloudReady = (async () => {
    const main = document.querySelector('main');
    main.inert = true;
    message('Connecting to Supabase?');
    try {
      const { data: { session }, error: sessionError } = await db.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) { message('Sign in or create an account to load and save your data. Existing browser data can be imported after signing in.'); return false; }
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError) throw authError;
      user = auth.user;
      if (!user) throw new Error('Please sign in again.');
      form.hidden = true; form.style.display = 'none'; button('logout').hidden = false;
      const { data, error } = await db.from('zecryptrome_data').select('key,value').eq('user_id', user.id);
      if (error) throw error;
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(cacheKey())) || {}; } catch (e) {}
      pending = Object.fromEntries(Object.entries(saved.pending || {}).filter(([key]) => keys.has(key)));
      cache = Object.fromEntries(data.filter(row => keys.has(row.key)).map(row => [row.key, row.value]));
      Object.assign(cache, pending);
      persist();
      button('import').hidden = data.length > 0 || Object.keys(pending).length > 0;
      if (cache.theme != null) document.documentElement.classList.toggle('dark', cache.theme === 'dark');
      message(`Signed in as ${user.email}. Data loaded from Supabase.`);
      main.inert = false;
      void flush().catch(() => {});
      db.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || (session && session.user.id !== user.id)) location.reload();
      });
      return true;
    } catch (error) {
      message(`Could not load your cloud data: ${error.message}. Check the connection and run supabase-schema.sql in your Supabase SQL Editor, then reload.`);
      button('retry').onclick = () => location.reload();
      return false;
    }
  })();
})();
