/** Small shared UI helpers: toast, file download, HTML escaping, DOM lookups. */
import { escapeText } from './html.ts';

/** Shows a short message in the corner; a new toast replaces the visible one. */
export function showToast(message: string, type?: string, durationMs?: number): void {
  const kind = type || 'success';
  const duration = durationMs || 2500;
  // Remove existing toasts
  document.querySelectorAll('.minerva-toast').forEach((t) => t.remove());
  const toast = document.createElement('div');
  toast.className = 'minerva-toast minerva-toast-' + kind;
  toast.textContent = message;
  document.body.appendChild(toast);
  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/** Offers `text` as a file download through a detached anchor. */
export function downloadTextFile(filename: string, text: string, mime?: string): void {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function escapeHtml(str: string | null | undefined): string {
  return escapeText(str);
}

export function getListView(): HTMLElement | null {
  return document.getElementById('listView');
}

export function getWelcomeScreen(): HTMLElement | null {
  return document.getElementById('welcomeScreen');
}
