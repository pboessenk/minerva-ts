/** Click-to-edit cells on the operation detail page, and parameter editing. */
import { getOps } from './model-access.ts';
import { renderApiOperation } from './op-detail.ts';
import { setDirty } from '../base/model-state.ts';
export function makeOpFieldEditable(el: HTMLElement): void {
  if (el.querySelector('textarea, input')) return;
  const opId = el.dataset.opid as string;
  const field = el.dataset.field as 'summary' | 'description';
  const op = (getOps() || []).find((o) => o.id === opId);
  if (!op) return;

  const current = op[field] || '';
  const isLong = field === 'description';

  if (isLong) {
    const ta = document.createElement('textarea');
    ta.className = 'fn-prompt-input';
    ta.style.cssText = 'width:100%;min-height:60px;resize:vertical;font-size:14px;';
    ta.value = current;
    el.textContent = '';
    el.appendChild(ta);
    ta.focus();

    const save = () => {
      const val = ta.value.trim();
      op[field] = val;
      setDirty(true);
      renderApiOperation(opId);
    };
    ta.addEventListener('blur', save);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') renderApiOperation(opId);
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        save();
      }
    });
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fn-prompt-input';
    input.style.cssText = 'width:100%;font-size:14px;';
    input.value = current;
    el.textContent = '';
    el.appendChild(input);
    input.focus();
    input.select();

    const save = () => {
      const val = input.value.trim();
      op[field] = val;
      setDirty(true);
      renderApiOperation(opId);
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') renderApiOperation(opId);
      if (e.key === 'Enter') save();
    });
  }
}

export function makeTagsEditable(el: HTMLElement): void {
  if (el.querySelector('input')) return;
  const opId = el.dataset.opid as string;
  const op = (getOps() || []).find((o) => o.id === opId);
  if (!op) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fn-prompt-input';
  input.style.cssText = 'width:100%;font-size:14px;';
  input.placeholder = 'Comma-separated tags, e.g. documents, orders';
  input.value = (op.tags || []).join(', ');
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();

  const save = () => {
    const val = input.value.trim();
    op.tags = val
      ? val
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    setDirty(true);
    renderApiOperation(opId);
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') renderApiOperation(opId);
    if (e.key === 'Enter') save();
  });
}

export function makeRespDescEditable(td: HTMLElement): void {
  if (td.querySelector('input')) return;
  const opId = td.dataset.opid as string;
  const code = td.dataset.code as string;
  const op = (getOps() || []).find((o) => o.id === opId);
  const resp = op?.responses[code];
  if (!op || !resp) return;

  const current = resp.description || '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fn-prompt-input';
  input.style.cssText = 'width:100%;font-size:13px;';
  input.value = current;
  td.textContent = '';
  td.appendChild(input);
  input.focus();
  input.select();

  const save = () => {
    resp.description = input.value.trim();
    setDirty(true);
    renderApiOperation(opId);
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') renderApiOperation(opId);
    if (e.key === 'Enter') save();
  });
}

export function makeRespSchemaEditable(td: HTMLElement): void {
  if (td.querySelector('input')) return;
  const opId = td.dataset.opid as string;
  const code = td.dataset.code as string;
  const op = (getOps() || []).find((o) => o.id === opId);
  const resp = op?.responses[code];
  if (!op || !resp) return;

  const current = resp.schema || '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fn-prompt-input';
  input.style.cssText = 'width:100%;font-size:13px;';
  input.value = current;
  input.placeholder = 'Entity name (optional)';
  td.textContent = '';
  td.appendChild(input);
  input.focus();
  input.select();

  const save = () => {
    const val = input.value.trim();
    resp.schema = val || undefined;
    setDirty(true);
    renderApiOperation(opId);
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') renderApiOperation(opId);
    if (e.key === 'Enter') save();
  });
}

export function makeParamFieldEditable(td: HTMLElement): void {
  if (td.querySelector('input')) return;
  const opId = td.dataset.opid as string;
  const pidx = parseInt(td.dataset.pidx as string, 10);
  const op = (getOps() || []).find((o) => o.id === opId);
  const param = op?.parameters?.[pidx];
  if (!op || !param) return;

  const fieldMap: Record<string, 'name' | 'type' | 'description'> = {
    'ca-param-name': 'name',
    'ca-param-type': 'type',
    'ca-param-desc': 'description',
  };
  let field: 'name' | 'type' | 'description' | '' = '';
  for (const [cls, f] of Object.entries(fieldMap)) {
    if (td.classList.contains(cls)) {
      field = f;
      break;
    }
  }
  if (!field) return;

  const current = param[field] || '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fn-prompt-input';
  input.style.cssText = 'width:100%;font-size:13px;';
  input.value = current;
  td.textContent = '';
  td.appendChild(input);
  input.focus();
  input.select();

  const save = () => {
    param[field] = input.value.trim();
    setDirty(true);
    renderApiOperation(opId);
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') renderApiOperation(opId);
    if (e.key === 'Enter') save();
  });
}

export function makeParamInEditable(td: HTMLElement): void {
  if (td.querySelector('select')) return;
  const opId = td.dataset.opid as string;
  const pidx = parseInt(td.dataset.pidx as string, 10);
  const op = (getOps() || []).find((o) => o.id === opId);
  const param = op?.parameters?.[pidx];
  if (!op || !param) return;

  const current = param.in || 'path';
  const sel = document.createElement('select');
  sel.className = 'fn-prompt-input';
  sel.style.cssText = 'width:100%;font-size:13px;';
  ['path', 'query', 'header'].forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    if (v === current) opt.selected = true;
    sel.appendChild(opt);
  });
  td.textContent = '';
  td.appendChild(sel);
  sel.focus();

  const save = () => {
    param.in = sel.value;
    setDirty(true);
    renderApiOperation(opId);
  };
  sel.addEventListener('blur', save);
  sel.addEventListener('change', save);
}

export function toggleParamRequired(opId: string, pidx: number, val: boolean): void {
  const op = (getOps() || []).find((o) => o.id === opId);
  if (!op || !op.parameters || !op.parameters[pidx]) return;
  op.parameters[pidx].required = val;
  setDirty(true);
}

export function addParam(opId: string): void {
  const op = (getOps() || []).find((o) => o.id === opId);
  if (!op) return;
  if (!op.parameters) op.parameters = [];
  op.parameters.push({ name: 'param', in: 'path', type: 'string', required: true, description: '' });
  setDirty(true);
  renderApiOperation(opId);
}

export function deleteParam(opId: string, pidx: number): void {
  const op = (getOps() || []).find((o) => o.id === opId);
  if (!op || !op.parameters) return;
  op.parameters.splice(pidx, 1);
  setDirty(true);
  renderApiOperation(opId);
}
