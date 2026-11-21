/**
 * Welcome page of the editor: model statistics and the open points of all entities.
 */
import { getRawModel } from './model-access.ts';
import { escapeHtml } from '../base/ui.ts';
import { state } from '../editor/state.ts';

export function renderApiWelcome(): void {
  const listView = document.getElementById('listView')!;
  const totalAttrs = Object.values(state.apiModel!).reduce((sum, e) => sum + e.attrs.filter((a) => a.type !== '_section').length, 0);
  const siviAttrs = Object.values(state.apiModel!).reduce(
    (sum, e) => sum + e.attrs.filter((a) => a.type !== '_section' && a.sivi).length,
    0,
  );

  const m = getRawModel()!;
  const title = (m && m.title) || (state.apiConfig && state.apiConfig.name) || 'API Draft';
  const subtitle = (m && m.subtitle) || '';

  listView.innerHTML = `
        <h1 class="ca-title">${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(subtitle)}</p>

        <div class="stats">
            <div class="stat-card"><div class="value">${Object.keys(state.apiModel!).length}</div><div class="label">Entities</div></div>
            <div class="stat-card"><div class="value">${Object.keys(state.apiEnums!).length}</div><div class="label">Enums</div></div>
            <div class="stat-card"><div class="value">${(state.apiOps || []).length}</div><div class="label">Endpoints</div></div>
            <div class="stat-card"><div class="value">${(state.apiExamples || []).length}</div><div class="label">Examples</div></div>
            <div class="stat-card"><div class="value">${totalAttrs}</div><div class="label">Total Attributes</div></div>
            <div class="stat-card"><div class="value">${siviAttrs} / ${totalAttrs}</div><div class="label">SIVI-aligned attrs</div></div>
        </div>

        <div class="section">
            <h3>Open Points</h3>
            <ul class="ca-open-points-list">
                ${Object.entries(state.apiModel!)
                  .filter(([_, e]) => e.openPoints && e.openPoints.length)
                  .map(([name, e]) =>
                    e.openPoints
                      .map((p) => {
                        const icon = p.type === 'error' ? '✖' : p.type === 'info' ? 'ℹ' : '⚠';
                        return `<li class="ca-op-${escapeHtml(p.type || 'warning')}"><span class="ca-op-icon">${icon}</span> <strong class="ca-open-points-name">${escapeHtml(name)}:</strong> ${escapeHtml(p.text)}</li>`;
                      })
                      .join(''),
                  )
                  .join('')}
            </ul>
        </div>

        <p class="ca-hint-text">Select an entity from the sidebar to explore its attributes.</p>
    `;
}
