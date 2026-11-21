/**
 * Editor general view: API metadata form (title, subtitle, color, servers,
 * security, contact), plus the Changelog tab (rendered by changelog.ts).
 * Renders into #listView when the General sidebar button is clicked.
 */
import { openBumpDialog, renderChangelogPane } from './changelog.ts';
import type { RawContact, RawSecurity, RawServer } from '@minerva/core';
import type { ApiConfig } from './model-types.ts';
import { state } from './state.ts';
import { getModel, setDirty } from '../base/model-state.ts';
import { applyViewButtonColors, currentView, views, type ViewDef } from '../base/registry.ts';
import { escapeHtml } from '../base/ui.ts';

type GeneralTab = 'general' | 'changelog';

interface GeneralState {
  /** Active tab; survives full re-renders of #listView. */
  activeTab: GeneralTab;
}

const general = {} as GeneralState;

export function showGeneralView(): void {
  const caCyEl = document.getElementById('caCy') as HTMLElement;
  const listView = document.getElementById('listView') as HTMLElement;
  const caGraphLegend = document.getElementById('caGraphLegend') as HTMLElement;
  const caGraphZoom = document.getElementById('caGraphZoom');

  caCyEl.classList.remove('visible', 'with-header');
  caGraphLegend.style.display = 'none';
  if (caGraphZoom) caGraphZoom.style.display = 'none';
  (document.getElementById('graphTooltip') as HTMLElement).classList.remove('visible');

  const m = getModel();
  const version = (m && m.version) || '';
  const title = (m && m.title) || '';
  const subtitle = (m && m.subtitle) || '';
  const currentColor = (state.apiConfig && state.apiConfig.color) || '#1f6feb';
  const servers: RawServer[] = (m && m.servers) || [];
  const sec: RawSecurity = (m && m.security) || {};
  const contact: RawContact = (m && m.contact) || {};

  const serverRows = servers
    .map(
      (s, i) => `
        <div class="ca-server-row" data-idx="${i}">
            <input type="text" class="ca-server-url" value="${escapeHtml(s.url || '')}" placeholder="https://api.example.com" spellcheck="false">
            <input type="text" class="ca-server-desc" value="${escapeHtml(s.description || '')}" placeholder="Description" spellcheck="false">
            <button class="ca-delete-btn ca-server-remove" title="Remove">✕</button>
        </div>`,
    )
    .join('');

  listView.innerHTML = `
        <div class="ca-general-view">
            <h2 class="ca-general-heading">General</h2>

            <div class="ca-gen-tabs">
                <button class="ca-gen-tab ${general.activeTab === 'general' ? 'active' : ''}" data-tab="general">General</button>
                <button class="ca-gen-tab ${general.activeTab === 'changelog' ? 'active' : ''}" data-tab="changelog">Changelog</button>
            </div>

            <div id="genTabGeneral" class="ca-gen-tab-panel" style="display:${general.activeTab === 'general' ? 'block' : 'none'}">
            <section class="ca-general-section">
                <h3>Identity</h3>
                <div class="ca-general-field">
                    <label for="genTitle">Title</label>
                    <input type="text" id="genTitle" value="${escapeHtml(title)}" placeholder="API title" spellcheck="false">
                </div>
                <div class="ca-general-field">
                    <label>Version</label>
                    <div class="ca-version-row">
                        <span class="ca-version-display" id="genVersionDisplay">${version ? escapeHtml(version) : '—'}</span>
                        <button class="ca-bump-btn" id="genBumpBtn">Bump version</button>
                    </div>
                </div>
                <div class="ca-general-field">
                    <label for="genSubtitle">Description</label>
                    <textarea id="genSubtitle" rows="4" placeholder="API description" spellcheck="false">${escapeHtml(subtitle)}</textarea>
                </div>
                <div class="ca-general-field">
                    <label for="genColor">Accent color</label>
                    <div class="ca-general-color-row">
                        <input type="color" id="genColor" value="${escapeHtml(currentColor)}" title="API accent color">
                        <span class="ca-general-color-hex" id="genColorHex">${escapeHtml(currentColor)}</span>
                    </div>
                </div>
            </section>

            <section class="ca-general-section">
                <h3>Servers</h3>
                <div id="genServerRows">${serverRows}</div>
                <button class="ca-add-attr-btn" id="genAddServerBtn">+ Add Server</button>
            </section>

            <section class="ca-general-section">
                <h3>Security</h3>
                <label class="ca-security-toggle"><input type="checkbox" id="genSecEnabled" ${sec.enabled ? 'checked' : ''}> Enable Bearer Auth</label>
                <div class="ca-general-field-row">
                    <div class="ca-general-field">
                        <label for="genSecFormat">Bearer format</label>
                        <input type="text" id="genSecFormat" value="${escapeHtml(sec.bearerFormat || '')}" placeholder="e.g. JWT" spellcheck="false">
                    </div>
                    <div class="ca-general-field">
                        <label for="genSecDesc">Description</label>
                        <input type="text" id="genSecDesc" value="${escapeHtml(sec.description || '')}" placeholder="Security description" spellcheck="false">
                    </div>
                </div>
            </section>

            <section class="ca-general-section">
                <h3>Contact</h3>
                <div class="ca-general-field-row">
                    <div class="ca-general-field">
                        <label for="genContactName">Name</label>
                        <input type="text" id="genContactName" value="${escapeHtml(contact.name || '')}" placeholder="Contact name" spellcheck="false">
                    </div>
                    <div class="ca-general-field">
                        <label for="genContactEmail">Email</label>
                        <input type="text" id="genContactEmail" value="${escapeHtml(contact.email || '')}" placeholder="email@example.com" spellcheck="false">
                    </div>
                    <div class="ca-general-field">
                        <label for="genContactUrl">URL</label>
                        <input type="text" id="genContactUrl" value="${escapeHtml(contact.url || '')}" placeholder="https://..." spellcheck="false">
                    </div>
                </div>
            </section>
            </div>

            <div id="genTabChangelog" class="ca-gen-tab-panel" style="display:${general.activeTab === 'changelog' ? 'block' : 'none'}"></div>
        </div>
    `;
  listView.style.display = 'block';

  // ── Event wiring ──
  const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

  // Tab switching
  document.querySelectorAll<HTMLElement>('.ca-gen-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      general.activeTab = tab.dataset.tab as GeneralTab;
      document.querySelectorAll('.ca-gen-tab').forEach((t) => t.classList.toggle('active', t === tab));
      byId('genTabGeneral').style.display = general.activeTab === 'general' ? 'block' : 'none';
      byId('genTabChangelog').style.display = general.activeTab === 'changelog' ? 'block' : 'none';
    });
  });

  renderChangelogPane(document.getElementById('genTabChangelog'));

  // Identity
  byId<HTMLInputElement>('genTitle').addEventListener('input', (e) => {
    const m2 = getModel();
    if (m2) {
      m2.title = (e.target as HTMLInputElement).value;
      setDirty(true);
    }
  });
  byId('genBumpBtn').addEventListener('click', openBumpDialog);
  const subtitleEl = byId<HTMLTextAreaElement>('genSubtitle');
  function autoGrowSubtitle(): void {
    subtitleEl.style.height = 'auto';
    subtitleEl.style.height = subtitleEl.scrollHeight + 'px';
  }
  autoGrowSubtitle();
  subtitleEl.addEventListener('input', () => {
    autoGrowSubtitle();
    const m2 = getModel();
    if (m2) {
      m2.subtitle = subtitleEl.value;
      setDirty(true);
    }
  });
  byId<HTMLInputElement>('genColor').addEventListener('input', (e) => {
    const color = (e.target as HTMLInputElement).value;
    byId('genColorHex').textContent = color;
    (state.apiConfig as ApiConfig).color = color;
    const m2 = getModel();
    if (m2) m2.color = color;
    setDirty(true);
    const viewId = Object.keys(views).find((id) => (views[id] as ViewDef).category === 'api' && currentView === id);
    if (viewId) (views[viewId] as ViewDef).color = color;
    applyViewButtonColors();
    const icon = document.querySelector<HTMLElement>('.ca-overview-icon');
    if (icon) icon.style.color = color;
    const entityList = document.getElementById('entityList');
    if (entityList) entityList.style.setProperty('--api-color', color);
  });

  // Servers
  function syncGenServers(): void {
    const m2 = getModel();
    if (!m2) return;
    const rows = document.querySelectorAll('#genServerRows .ca-server-row');
    m2.servers = Array.from(rows)
      .map((r) => ({
        url: (r.querySelector('.ca-server-url') as HTMLInputElement).value.trim(),
        description: (r.querySelector('.ca-server-desc') as HTMLInputElement).value.trim(),
      }))
      .filter((s) => s.url);
    setDirty(true);
  }

  byId('genServerRows').addEventListener('input', syncGenServers);

  document.querySelectorAll('#genServerRows .ca-server-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      (btn.closest('.ca-server-row') as HTMLElement).remove();
      syncGenServers();
    });
  });

  byId('genAddServerBtn').addEventListener('click', () => {
    const container = byId('genServerRows');
    const row = document.createElement('div');
    row.className = 'ca-server-row';
    row.innerHTML = `
            <input type="text" class="ca-server-url" placeholder="https://api.example.com" spellcheck="false">
            <input type="text" class="ca-server-desc" placeholder="Description" spellcheck="false">
            <button class="ca-delete-btn ca-server-remove" title="Remove">✕</button>`;
    container.appendChild(row);
    (row.querySelector('.ca-server-url') as HTMLInputElement).focus();
    (row.querySelector('.ca-server-remove') as HTMLElement).addEventListener('click', () => {
      row.remove();
      syncGenServers();
    });
    (row.querySelector('.ca-server-url') as HTMLElement).addEventListener('input', syncGenServers);
    (row.querySelector('.ca-server-desc') as HTMLElement).addEventListener('input', syncGenServers);
  });

  // Security
  function syncGenSecurity(): void {
    const m2 = getModel();
    if (!m2) return;
    m2.security = {
      enabled: byId<HTMLInputElement>('genSecEnabled').checked,
      bearerFormat: byId<HTMLInputElement>('genSecFormat').value.trim(),
      description: byId<HTMLInputElement>('genSecDesc').value.trim(),
    };
    setDirty(true);
  }
  byId('genSecEnabled').addEventListener('change', syncGenSecurity);
  byId('genSecFormat').addEventListener('input', syncGenSecurity);
  byId('genSecDesc').addEventListener('input', syncGenSecurity);

  // Contact
  function syncGenContact(): void {
    const m2 = getModel();
    if (!m2) return;
    const name = byId<HTMLInputElement>('genContactName').value.trim();
    const email = byId<HTMLInputElement>('genContactEmail').value.trim();
    const url = byId<HTMLInputElement>('genContactUrl').value.trim();
    if (name || email || url) {
      m2.contact = { name, email, url };
    } else {
      delete m2.contact;
    }
    setDirty(true);
  }
  byId('genContactName').addEventListener('input', syncGenContact);
  byId('genContactEmail').addEventListener('input', syncGenContact);
  byId('genContactUrl').addEventListener('input', syncGenContact);
}

/** Creates the general view state. */
export function install(): void {
  general.activeTab = 'general';
}
