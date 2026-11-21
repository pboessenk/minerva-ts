import { jsArg } from '../base/html.ts';
import { escapeHtml } from '../base/ui.ts';
import { state } from '../editor/state.ts';
/**
 * Enum detail page: header, banners and the table of values.
 */

export function renderApiEnum(name: string): void {
  const e = state.apiEnums![name];
  if (!e) return;

  const listView = document.getElementById('listView')!;
  const backLink = `<a href="#" onclick="showApiGraphView();return false;" class="ca-back-link">← Domain Model</a>`;
  const rawName = name;

  const valuesRows = e.values
    .map((v) => {
      const rawVal = v.value;
      return `<tr data-enum="${escapeHtml(rawName)}" data-val="${escapeHtml(rawVal)}">
            <td class="ca-cell-editable" onclick="makeEnumValueEditable(this, ${jsArg(rawName)}, ${jsArg(rawVal)}, 'name')"><span class="ca-ev-codename">${escapeHtml(v.codeName || '')}</span></td>
            <td class="ca-cell-editable" onclick="makeEnumValueEditable(this, ${jsArg(rawName)}, ${jsArg(rawVal)}, 'value')"><span class="ca-ev-name">${escapeHtml(v.value)}</span></td>
            <td class="ca-cell-editable" onclick="makeEnumValueEditable(this, ${jsArg(rawName)}, ${jsArg(rawVal)}, 'label')"><span class="ca-ev-caption">${escapeHtml(v.name)}</span></td>
            <td class="ca-cell-editable" onclick="makeEnumValueEditable(this, ${jsArg(rawName)}, ${jsArg(rawVal)}, 'description')">${v.note ? `<span class="ca-ev-comment-text">${escapeHtml(v.note)}</span>` : '<span class="ca-cell-placeholder">+ description</span>'}</td>
            <td class="ca-cell-center"><button class="ca-delete-btn" onclick="deleteEnumValue(${jsArg(rawName)}, ${jsArg(rawVal)})" title="Delete value">✕</button></td>
        </tr>`;
    })
    .join('');

  const tableHtml =
    e.values.length > 0
      ? `
        <table class="ca-attr-table ca-enum-table">
            <thead><tr><th>Name</th><th>Value</th><th>Label</th><th>Description</th><th></th></tr></thead>
            <tbody>${valuesRows}</tbody>
        </table>`
      : '<p class="empty">No values defined yet.</p>';

  const bannerIcons: Record<string, string> = { info: 'ℹ', warning: '⚠', error: '✖' };
  const points = e.openPoints || [];
  let openPointHtml = '<div class="ca-banners">';
  points.forEach((p, i) => {
    const t = p.type || 'warning';
    const icon = bannerIcons[t] || '⚠';
    openPointHtml += `
            <div class="ca-banner ca-banner-${escapeHtml(t)}">
                <span class="ca-banner-icon" onclick="cycleEnumBannerType(${jsArg(rawName)}, ${i})" title="Click to change type">${icon}</span>
                <span class="ca-banner-text" onclick="editEnumBannerText(${jsArg(rawName)}, ${i}, this)">${escapeHtml(p.text)}</span>
                <button class="ca-banner-delete" onclick="deleteEnumBanner(${jsArg(rawName)}, ${i})" title="Remove">✕</button>
            </div>`;
  });
  openPointHtml += `<button class="ca-banner-add" onclick="addEnumBanner(${jsArg(rawName)})" title="Add note">+ Add note</button></div>`;

  listView.innerHTML = `
        ${backLink}
        <h1><span class="ca-enum-icon">◆</span> ${escapeHtml(name)}
            <span class="ca-entity-actions">
                <button class="ca-action-btn ca-rename-btn" onclick="_promptRenameEnum(${jsArg(rawName)})" title="Rename"><svg class="action-icon" viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
                <button class="ca-action-btn ca-danger-btn" onclick="deleteEnum(${jsArg(rawName)})" title="Delete enum"><svg class="action-icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </span>
        </h1>
        <p class="subtitle ca-editable-desc" onclick="updateEnumDescription(this, ${jsArg(rawName)})">${e.desc ? escapeHtml(e.desc) : '<span class="ca-cell-placeholder">(click to add description)</span>'}</p>

        ${openPointHtml}

        <div class="section">
            <h3>Values (${e.values.length})</h3>
            ${tableHtml}
            <div class="ca-add-buttons">
                <button class="ca-add-attr-btn" onclick="addEnumValue(${jsArg(rawName)})">+ Add Value</button>
            </div>
        </div>
    `;
}
