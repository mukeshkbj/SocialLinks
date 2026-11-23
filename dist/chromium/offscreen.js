// Chrome/Edge only: an invisible extension page whose single job is writing to the clipboard
// for the right-click "Copy" item (service workers have no clipboard access).
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.target !== 'sl-offscreen' || msg.type !== 'copy') return;
  const ta = document.getElementById('buf');
  ta.value = String(msg.text || '');
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.value = '';
  reply({ ok });
});
