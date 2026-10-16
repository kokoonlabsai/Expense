export const inviteUrl = (token) => `${window.location.origin}/join/${token}`;

/** Open the phone's share sheet (WhatsApp, Messages…) or fall back to copying. */
export async function share({ title, text, url }, toast) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url ? `${text ? text + ' ' : ''}${url}` : text);
    toast?.('Link copied — paste it anywhere');
  } catch {
    toast?.('Could not copy the link', 'error');
  }
}
