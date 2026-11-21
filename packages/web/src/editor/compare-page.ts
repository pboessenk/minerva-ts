/**
 * Editor compare page: diffs the currently loaded model against an OpenAPI
 * 3.x contract (uploaded, or a known on-disk source like a compiled
 * swagger.json) and renders the server's drift report: every difference plus
 * the change needed to align the two sides.
 */
import { exposeFunctions } from '../globals.ts';
import { refreshIconStrip } from './sidebar.ts';
import { state } from './state.ts';
import { escapeHtml, showToast } from '../base/ui.ts';
import { jsArg } from '../base/html.ts';

type Severity = 'error' | 'warn' | 'info';

/** One difference between model and contract, as sent by the server. */
interface DriftFinding {
  category: string;
  severity: Severity;
  entity?: string;
  property?: string;
  operation?: string;
  code?: string;
  model?: string;
  contract?: string;
  onlyInModel?: string[];
  onlyInContract?: string[];
  changeNeeded?: string;
}

interface DriftStats {
  errors?: number;
  warnings?: number;
  infos?: number;
  matchedSchemas?: number;
  modelSchemas?: number;
  matchedOperations?: number;
  modelOperations?: number;
}

/** The server's drift report plus the label of the compared source. */
interface DriftReport {
  modelTitle?: string;
  modelFile?: string;
  modelVersion?: string;
  contractTitle?: string;
  contractVersion?: string;
  stats?: DriftStats;
  findings?: DriftFinding[];
  _sourceLabel?: string;
}

/** What to compare against: a known source on disk, or the text of an uploaded contract. */
interface CompareRun {
  sourceId?: string;
  text?: string;
  label: string;
}

interface CompareSource {
  id: string;
  label: string;
}

interface CompareState {
  /** Last drift report. */
  report: DriftReport | null;
  lastRun: CompareRun | null;
  severity: Record<Severity, boolean>;
  includeDesc: boolean;
}

const compare = {} as CompareState;

/**
 * Show the compare page. Hides graph / detail, renders into #listView.
 */
export function showCompareView(): void {
  state.apiActiveEntity = '__compare__';
  document.querySelectorAll('.ca-entity-btn').forEach((b) => b.classList.remove('active'));
  refreshIconStrip();

  // Hide graph elements
  const caCyEl = document.getElementById('caCy');
  const caGraphLegend = document.getElementById('caGraphLegend');
  const caGraphZoom = document.getElementById('caGraphZoom');
  const graphTooltip = document.getElementById('graphTooltip');
  if (caCyEl) caCyEl.classList.remove('visible', 'with-header');
  if (caGraphLegend) caGraphLegend.style.display = 'none';
  if (caGraphZoom) caGraphZoom.style.display = 'none';
  if (graphTooltip) graphTooltip.classList.remove('visible');

  const listView = document.getElementById('listView') as HTMLElement;
  listView.innerHTML =
    '<div class="ca-search-page ca-compare-page">' +
    '<a href="#" onclick="showApiGraphView();return false;" class="ca-back-link">← Domain Model</a>' +
    '<h2 class="ca-search-title">⇄ Compare against OpenAPI</h2>' +
    '<div class="ca-compare-intro">Diff the current model against an OpenAPI 3.x contract (e.g. the service ' +
    'repo’s compiled <code>swagger.json</code>) and list all drift and the changes needed.</div>' +
    '<div class="ca-compare-actions" id="caCompareActions">' +
    '<button class="editor-toolbar-btn" onclick="_compareUpload()">Upload OpenAPI JSON…</button>' +
    '</div>' +
    '<label class="ca-compare-toggle"><input type="checkbox" id="caCompareDesc"' +
    (compare.includeDesc ? ' checked' : '') +
    ' onchange="_compareToggleDesc(this.checked)"> Include description drift</label>' +
    '<div id="caCompareBody"></div>' +
    '</div>';
  listView.style.display = 'block';

  loadCompareSources();
  if (compare.report) renderCompareReport();
}

/** Fetch the model's on-disk contract sources and add one-click buttons. */
async function loadCompareSources(): Promise<void> {
  try {
    const apiConfig = state.apiConfig;
    const modelFile = apiConfig && apiConfig.dataPath ? apiConfig.dataPath.split('/').pop() : '';
    const resp = await fetch('/api/compare/sources?model=' + encodeURIComponent(modelFile as string));
    if (!resp.ok) return;
    const sources = (await resp.json()) as CompareSource[] | null;
    const actions = document.getElementById('caCompareActions');
    if (!actions) return;
    for (const src of sources || []) {
      const btn = document.createElement('button');
      btn.className = 'editor-toolbar-btn';
      btn.textContent = src.label;
      btn.onclick = () => runCompare({ sourceId: src.id, label: src.label });
      actions.appendChild(btn);
    }
  } catch (err) {
    // Sources are a convenience; uploading still works.
    console.warn('compare sources unavailable:', err);
  }
}

/** File-picker upload (same pattern as editorLoad). */
function compareUpload(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = (input.files as FileList)[0];
    if (!file) return;
    const text = await file.text();
    runCompare({ text: text, label: file.name });
  };
  input.click();
}

function compareToggleDesc(checked: boolean): void {
  compare.includeDesc = checked;
  if (compare.lastRun) runCompare(compare.lastRun);
}

/** POST the contract to /api/compare and render the report. */
async function runCompare(run: CompareRun): Promise<void> {
  compare.lastRun = run;
  const body = document.getElementById('caCompareBody');
  if (body) body.innerHTML = '<div class="ca-search-prompt">Comparing…</div>';
  try {
    const apiConfig = state.apiConfig;
    const modelFile = apiConfig && apiConfig.dataPath ? apiConfig.dataPath.split('/').pop() : '';
    let url = '/api/compare?model=' + encodeURIComponent(modelFile as string);
    if (compare.includeDesc) url += '&includeDescriptions=1';
    if (run.sourceId) url += '&source=' + encodeURIComponent(run.sourceId);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: run.sourceId ? undefined : run.text,
    });
    if (!resp.ok) {
      const msg = await resp.text();
      throw new Error(msg.trim() || 'HTTP ' + resp.status);
    }
    const report = (await resp.json()) as DriftReport;
    compare.report = report;
    report._sourceLabel = run.label || '';
    renderCompareReport();
  } catch (err) {
    if (body) body.innerHTML = '';
    showToast('Compare failed: ' + (err as Error).message, 'error');
  }
}

function compareToggleSeverity(sev: Severity): void {
  compare.severity[sev] = !compare.severity[sev];
  renderCompareReport();
}

/** Render the cached drift report into #caCompareBody. */
function renderCompareReport(): void {
  const body = document.getElementById('caCompareBody');
  const r = compare.report;
  if (!body || !r) return;

  const stats = r.stats || {};
  let html =
    '<div class="ca-compare-header">' +
    '<div><span class="ca-compare-side">Model:</span> ' +
    escapeHtml(r.modelTitle || r.modelFile || '?') +
    ' <span class="ca-compare-ver">' +
    escapeHtml(r.modelVersion || '') +
    '</span></div>' +
    '<div><span class="ca-compare-side">Contract:</span> ' +
    escapeHtml(r.contractTitle || '?') +
    ' <span class="ca-compare-ver">' +
    escapeHtml(r.contractVersion || '') +
    '</span>' +
    (r._sourceLabel ? ' <span class="ca-compare-ver">(' + escapeHtml(r._sourceLabel) + ')</span>' : '') +
    '</div>' +
    '</div>' +
    '<div class="ca-compare-stats">' +
    compareSevChip('error', stats.errors || 0) +
    compareSevChip('warn', stats.warnings || 0) +
    compareSevChip('info', stats.infos || 0) +
    '<span class="ca-compare-stat">' +
    (stats.matchedSchemas || 0) +
    '/' +
    (stats.modelSchemas || 0) +
    ' schemas matched</span>' +
    '<span class="ca-compare-stat">' +
    (stats.matchedOperations || 0) +
    '/' +
    (stats.modelOperations || 0) +
    ' operations matched</span>' +
    '</div>';

  const findings = (r.findings || []).filter((f) => compare.severity[f.severity]);
  if (findings.length === 0) {
    const total = (r.findings || []).length;
    html +=
      '<div class="ca-search-prompt">' +
      (total === 0 ? 'No drift found — model and contract agree.' : total + ' finding(s) hidden by the severity filter above.') +
      '</div>';
    body.innerHTML = html;
    return;
  }

  const opFindings = findings.filter((f) => f.operation);
  const enumFindings = findings.filter((f) => !f.operation && f.category.indexOf('enum') === 0);
  const schemaFindings = findings.filter((f) => !f.operation && f.category.indexOf('enum') !== 0);

  html += compareGroupTable('Operations', opFindings, 'operation');
  html += compareGroupTable('Schemas & properties', schemaFindings, 'entity');
  html += compareGroupTable('Enums & codelists', enumFindings, 'entity');

  body.innerHTML = html;
}

function compareSevChip(sev: Severity, count: number): string {
  const active = compare.severity[sev] ? ' active' : '';
  const label = { error: 'errors', warn: 'warnings', info: 'info' }[sev];
  return (
    '<button class="ca-search-chip ca-compare-chip-' +
    sev +
    active +
    '" ' +
    'onclick="_compareToggleSeverity(' +
    jsArg(sev) +
    ')" title="Toggle ' +
    label +
    '">' +
    count +
    ' ' +
    label +
    '</button>'
  );
}

function compareGroupTable(title: string, findings: DriftFinding[], locKey: 'operation' | 'entity'): string {
  if (findings.length === 0) return '';
  let html =
    '<h3 class="ca-compare-group">' +
    escapeHtml(title) +
    ' <span class="ca-search-chip-count">' +
    findings.length +
    '</span></h3>' +
    '<table class="ca-search-table ca-compare-table"><thead><tr>' +
    '<th></th><th>Category</th><th>Where</th><th>Model</th><th>Contract</th><th>Change needed</th>' +
    '</tr></thead><tbody>';
  for (const f of findings) {
    html +=
      '<tr>' +
      '<td><span class="ca-compare-badge ca-compare-badge-' +
      escapeHtml(f.severity) +
      '">' +
      escapeHtml(f.severity) +
      '</span></td>' +
      '<td class="ca-search-type">' +
      escapeHtml(f.category) +
      '</td>' +
      '<td>' +
      compareLocation(f, locKey) +
      '</td>' +
      '<td class="ca-compare-val">' +
      compareValue(f.model, f.onlyInModel) +
      '</td>' +
      '<td class="ca-compare-val">' +
      compareValue(f.contract, f.onlyInContract) +
      '</td>' +
      '<td class="ca-search-desc ca-compare-change">' +
      escapeHtml(f.changeNeeded || '') +
      '</td>' +
      '</tr>';
  }
  return html + '</tbody></table>';
}

/** Location cell: entity names deep-link into the editor when they exist. */
function compareLocation(f: DriftFinding, locKey: 'operation' | 'entity'): string {
  const parts: string[] = [];
  if (locKey === 'operation' && f.operation) {
    parts.push('<span class="ca-search-attr-name">' + escapeHtml(f.operation) + '</span>');
    if (f.code) parts.push('<span class="ca-search-type">[' + escapeHtml(f.code) + ']</span>');
    if (f.entity) parts.push(compareEntityLink(f.entity));
  } else if (f.entity) {
    parts.push(compareEntityLink(f.entity));
    if (f.code) parts.push('<span class="ca-search-type">[' + escapeHtml(f.code) + ']</span>');
  }
  if (f.property) parts.push('<span class="ca-search-attr-name">.' + escapeHtml(f.property) + '</span>');
  return parts.join(' ');
}

function compareEntityLink(name: string): string {
  const target = state.apiModel && state.apiModel[name] ? name : state.apiEnums && state.apiEnums[name] ? 'enum:' + name : null;
  if (!target) return '<span class="ca-search-attr-name">' + escapeHtml(name) + '</span>';
  return '<span class="ca-search-entity" onclick="selectApiEntity(' + jsArg(target) + ')">' + escapeHtml(name) + '</span>';
}

/** Value cell: plain value, or an added/removed enum-value list. */
function compareValue(value: string | undefined, onlyList: string[] | undefined): string {
  let html = value ? escapeHtml(value) : '';
  if (onlyList && onlyList.length > 0) {
    html += (html ? '<br>' : '') + '<span class="ca-compare-only">+ ' + escapeHtml(onlyList.join(', ')) + '</span>';
  }
  return html || '<span class="ca-search-type">—</span>';
}

/** Creates the compare state and keeps the functions reachable for the inline handlers of the page and the toolbar. */
export function install(): void {
  compare.report = null;
  compare.lastRun = null;
  compare.severity = { error: true, warn: true, info: false };
  compare.includeDesc = false;

  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    showCompareView,
    _compareUpload: compareUpload,
    _compareToggleDesc: compareToggleDesc,
    _compareToggleSeverity: compareToggleSeverity,
  });
}
