/** Encode Mastodon-supplied strings used in authored HTML templates. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

/** Only HTTP(S) is valid for external media/profile/post links. */
export function safeHttpUrl(value) {
  const input = String(value ?? '').trim();
  if (!input) return '';
  try {
    const base = typeof window === 'undefined' ? 'https://suwonmars.com/' : window.location.href;
    const url = new URL(input, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}
