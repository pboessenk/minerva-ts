/**
 * Tooltip with the full text of a truncated cell of the attribute table.
 */

let _truncTip: HTMLDivElement | null;

export function installTruncationTooltip(): void {
  _truncTip = null;
}

/** Dismiss the tooltip if it is showing. */
export function hideTruncationTip(): void {
  if (_truncTip) _truncTip.classList.remove('visible');
}

function _ensureTruncTip(): HTMLDivElement {
  if (!_truncTip) {
    _truncTip = document.createElement('div');
    _truncTip.className = 'ca-truncate-tip';
    document.body.appendChild(_truncTip);
  }
  return _truncTip;
}

export function initTruncationTooltip(): void {
  const main = document.getElementById('main');
  if (!main || (main as HTMLElement & { _truncTipBound?: boolean })._truncTipBound) return;
  (main as HTMLElement & { _truncTipBound?: boolean })._truncTipBound = true;

  main.addEventListener(
    'mouseenter',
    (e) => {
      const el = (e.target as Element).closest('.ca-attr-name, .ca-attr-type, .ca-attr-desc, .ca-attr-note, .ca-attr-example');
      if (!el) return;
      if (el.scrollWidth <= el.clientWidth + 1) return;

      const tip = _ensureTruncTip();
      tip.textContent = el.textContent;
      const rect = el.getBoundingClientRect();
      tip.style.left = rect.left + 'px';
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 60) {
        tip.style.top = rect.top - 36 + 'px';
      } else {
        tip.style.top = rect.bottom + 4 + 'px';
      }
      tip.classList.add('visible');
    },
    true,
  );

  main.addEventListener(
    'mouseleave',
    (e) => {
      const el = (e.target as Element).closest('.ca-attr-name, .ca-attr-type, .ca-attr-desc, .ca-attr-note, .ca-attr-example');
      if (!el) return;
      if (_truncTip) _truncTip.classList.remove('visible');
    },
    true,
  );
}
