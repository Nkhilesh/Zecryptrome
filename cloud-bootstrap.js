// Load existing classic scripts in order after account data is available.
(async () => {
  const scripts = JSON.parse(document.currentScript.dataset.scripts);
  if (!await window.CloudReady) return;
  for (const src of scripts) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src; script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.body.appendChild(script);
    });
  }
})().catch(error => {
  const note = document.createElement('p'); note.setAttribute('role', 'alert');
  note.textContent = `Page could not start: ${error.message}. Reload to retry.`;
  document.body.prepend(note);
});
