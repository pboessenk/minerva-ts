/** Nested entities and entity arrays, including the optional (checkbox-gated) sections. */
import type { ApiAttr } from '../types.ts';
import { depthClass } from './type-info.ts';
import { stampConstraints } from './constraints.ts';
import { buildEntityForm } from './build.ts';

/** Build the content form of a nested entity and tag it for the collector. */
function buildEntityContent(entityName: string, fieldPath: string, value: unknown, depth: number): HTMLElement {
  const content = buildEntityForm(entityName, fieldPath, value, depth);
  content.dataset.path = fieldPath;
  content.dataset.ftype = 'entity';
  content.dataset.entityRef = entityName;
  return content;
}

/* ── Nested entity (singular) ── */

export function buildEntitySection(attr: ApiAttr, fieldPath: string, value: unknown, entityName: string, parentDepth: number): HTMLElement {
  const hasData = !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;

  // Required entities: always-open <details>, no checkbox
  if (attr.required) {
    const details = document.createElement('details');
    details.className = `ca-form-entity ${depthClass(parentDepth + 1)}`;
    details.open = true;

    const summary = document.createElement('summary');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'ca-form-entity-name';
    nameSpan.textContent = attr.name;

    const typeHint = document.createElement('span');
    typeHint.className = 'ca-form-type-hint';
    typeHint.textContent = entityName;
    const req = document.createElement('span');
    req.style.color = '#f85149';
    req.textContent = ' *';
    typeHint.appendChild(req);

    summary.appendChild(nameSpan);
    summary.appendChild(typeHint);
    details.appendChild(summary);

    const childData = hasData ? value : {};
    details.appendChild(buildEntityContent(entityName, fieldPath, childData, parentDepth + 1));

    return details;
  }

  // Optional entities: checkbox-gated inclusion
  const wrapper = document.createElement('div');
  wrapper.className = `ca-form-entity ca-form-entity-optional ${depthClass(parentDepth + 1)}`;

  const header = document.createElement('div');
  header.className = 'ca-form-optional-header';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'ca-form-optional-cb';
  cb.checked = hasData;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'ca-form-entity-name';
  nameSpan.textContent = attr.name;

  const typeHint = document.createElement('span');
  typeHint.className = 'ca-form-type-hint';
  typeHint.textContent = entityName;

  header.appendChild(cb);
  header.appendChild(nameSpan);
  header.appendChild(typeHint);
  wrapper.appendChild(header);

  // Content area, built lazily on first check, hidden when unchecked
  const contentWrap = document.createElement('div');
  contentWrap.className = 'ca-form-optional-body';
  contentWrap.style.display = hasData ? '' : 'none';
  wrapper.appendChild(contentWrap);

  if (hasData) {
    contentWrap.appendChild(buildEntityContent(entityName, fieldPath, value, parentDepth + 1));
  }

  cb.addEventListener('change', () => {
    if (cb.checked) {
      contentWrap.style.display = '';
      // Build form lazily if not yet built
      if (!contentWrap.querySelector('.ca-form-entity-content')) {
        contentWrap.appendChild(buildEntityContent(entityName, fieldPath, {}, parentDepth + 1));
      }
      // Mark included
      const c = contentWrap.querySelector<HTMLElement>('.ca-form-entity-content');
      if (c) delete c.dataset.excluded;
    } else {
      contentWrap.style.display = 'none';
      // Mark excluded so collector skips it
      const c = contentWrap.querySelector<HTMLElement>('.ca-form-entity-content');
      if (c) c.dataset.excluded = 'true';
    }
  });

  return wrapper;
}

/* ── Entity array ── */

export function buildEntityArraySection(
  attr: ApiAttr,
  fieldPath: string,
  value: unknown,
  entityName: string,
  parentDepth: number,
): HTMLElement {
  const hasData = Array.isArray(value) && value.length > 0;

  // Required arrays: always-open <details>, no checkbox
  if (attr.required) {
    return buildEntityArrayDetails(attr, fieldPath, value, entityName, parentDepth, true);
  }

  // Optional arrays: checkbox-gated inclusion
  const wrapper = document.createElement('div');
  wrapper.className = `ca-form-entity ca-form-entity-optional ${depthClass(parentDepth + 1)}`;

  const header = document.createElement('div');
  header.className = 'ca-form-optional-header';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'ca-form-optional-cb';
  cb.checked = hasData;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'ca-form-entity-name';
  nameSpan.textContent = attr.name;

  const typeHint = document.createElement('span');
  typeHint.className = 'ca-form-type-hint';
  typeHint.textContent = entityName + '[]';

  const countSpan = document.createElement('span');
  countSpan.className = 'ca-form-array-count';

  header.appendChild(cb);
  header.appendChild(nameSpan);
  header.appendChild(typeHint);
  header.appendChild(countSpan);
  wrapper.appendChild(header);

  // Content area, built lazily on first check
  const contentWrap = document.createElement('div');
  contentWrap.className = 'ca-form-optional-body';
  contentWrap.style.display = hasData ? '' : 'none';
  wrapper.appendChild(contentWrap);

  /** Build the inner array panel (items + add button, no summary header). */
  const buildInnerArray = (existingItems: unknown): HTMLDivElement => {
    const section = document.createElement('div');
    section.className = 'ca-form-array';
    section.dataset.path = fieldPath;
    section.dataset.ftype = 'entity-array';
    section.dataset.entityRef = entityName;
    stampConstraints(section, attr);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'ca-form-array-items';
    section.appendChild(itemsContainer);

    const items: unknown[] = Array.isArray(existingItems) ? existingItems : [];
    if (items.length > 0) {
      items.forEach((itemData, idx) => {
        itemsContainer.appendChild(buildArrayItem(entityName, fieldPath, itemData, parentDepth, idx));
      });
    } else {
      // Start with one empty item when first enabled
      itemsContainer.appendChild(buildArrayItem(entityName, fieldPath, {}, parentDepth, 0));
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'ca-form-add-btn';
    addBtn.textContent = '+ Add ' + entityName;
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => {
      const count = itemsContainer.children.length;
      itemsContainer.appendChild(buildArrayItem(entityName, fieldPath, {}, parentDepth, count));
      updateOptionalArrayLabels(wrapper, entityName);
    });
    section.appendChild(addBtn);

    return section;
  };

  if (hasData) {
    contentWrap.appendChild(buildInnerArray(value));
  }

  updateOptionalArrayLabels(wrapper, entityName);

  cb.addEventListener('change', () => {
    if (cb.checked) {
      contentWrap.style.display = '';
      if (!contentWrap.querySelector('.ca-form-array')) {
        contentWrap.appendChild(buildInnerArray([]));
      }
      const s = contentWrap.querySelector<HTMLElement>('.ca-form-array');
      if (s) delete s.dataset.excluded;
      updateOptionalArrayLabels(wrapper, entityName);
    } else {
      contentWrap.style.display = 'none';
      const s = contentWrap.querySelector<HTMLElement>('.ca-form-array');
      if (s) s.dataset.excluded = 'true';
      countSpan.textContent = '';
    }
  });

  return wrapper;
}

/** Update count badge and re-label items inside an optional array wrapper. */
function updateOptionalArrayLabels(wrapper: HTMLElement, entityName: string): void {
  const items = wrapper.querySelectorAll('.ca-form-array-items > .ca-form-array-item');
  items.forEach((item, i) => {
    const label = item.querySelector('.ca-form-array-item-label');
    if (label) label.textContent = entityName + ' #' + (i + 1);
  });
  const countSpan = wrapper.querySelector('.ca-form-array-count');
  if (countSpan) countSpan.textContent = items.length > 0 ? '(' + items.length + ')' : '';
}

/** Inner builder for required entity arrays (full <details> with summary). */
function buildEntityArrayDetails(
  attr: ApiAttr,
  fieldPath: string,
  value: unknown,
  entityName: string,
  parentDepth: number,
  startOpen: boolean,
): HTMLDetailsElement {
  const section = document.createElement('details');
  section.className = `ca-form-array ca-form-entity ${depthClass(parentDepth + 1)}`;
  section.open = startOpen;
  section.dataset.path = fieldPath;
  section.dataset.ftype = 'entity-array';
  section.dataset.entityRef = entityName;
  stampConstraints(section, attr);

  // Summary (collapsible header)
  const summary = document.createElement('summary');
  summary.className = 'ca-form-array-header';

  const title = document.createElement('span');
  title.className = 'ca-form-entity-name';
  title.textContent = attr.name;

  const typeHint = document.createElement('span');
  typeHint.className = 'ca-form-type-hint';
  typeHint.textContent = entityName + '[]';
  if (attr.required) {
    const req = document.createElement('span');
    req.style.color = '#f85149';
    req.textContent = ' *';
    typeHint.appendChild(req);
  }

  const countSpan = document.createElement('span');
  countSpan.className = 'ca-form-array-count';

  summary.appendChild(title);
  summary.appendChild(typeHint);
  summary.appendChild(countSpan);
  section.appendChild(summary);

  // Items container
  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'ca-form-array-items';
  section.appendChild(itemsContainer);

  // Populate from existing data, or add 1 empty item only if required
  const items: unknown[] = Array.isArray(value) ? value : [];
  if (items.length > 0) {
    items.forEach((itemData, idx) => {
      itemsContainer.appendChild(buildArrayItem(entityName, fieldPath, itemData, parentDepth, idx));
    });
  } else if (attr.required || startOpen) {
    // For required or explicitly-opened arrays, start with one empty item
    itemsContainer.appendChild(buildArrayItem(entityName, fieldPath, {}, parentDepth, 0));
  }
  // Optional arrays with no data start empty: the user clicks "+ Add" to begin

  updateArrayLabels(section);

  // Add button
  const addBtn = document.createElement('button');
  addBtn.className = 'ca-form-add-btn';
  addBtn.textContent = '+ Add ' + entityName;
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    const count = itemsContainer.children.length;
    itemsContainer.appendChild(buildArrayItem(entityName, fieldPath, {}, parentDepth, count));
    updateArrayLabels(section);
  });
  section.appendChild(addBtn);

  return section;
}

function buildArrayItem(entityName: string, basePath: string, itemData: unknown, parentDepth: number, index: number): HTMLDetailsElement {
  void basePath; // kept for symmetry with the call sites; items do not use the path
  const item = document.createElement('details');
  item.className = 'ca-form-array-item';
  item.open = true;

  const itemHeader = document.createElement('summary');
  itemHeader.className = 'ca-form-array-item-header';

  const itemLabel = document.createElement('span');
  itemLabel.className = 'ca-form-array-item-label';
  itemLabel.textContent = entityName + ' #' + (index + 1);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'ca-form-remove-btn';
  removeBtn.textContent = '× Remove';
  removeBtn.type = 'button';
  removeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.closest<HTMLElement>('.ca-form-array');
    const optWrapper = item.closest<HTMLElement>('.ca-form-entity-optional');
    item.remove();
    if (optWrapper) {
      const ref = section ? section.dataset.entityRef : entityName;
      updateOptionalArrayLabels(optWrapper, ref || entityName);
    } else if (section) {
      updateArrayLabels(section);
    }
  });

  itemHeader.appendChild(itemLabel);
  itemHeader.appendChild(removeBtn);
  item.appendChild(itemHeader);

  // Item path doesn't use index in the data-path: we rely on DOM order in collectFormValues
  const content = buildEntityForm(entityName, '', itemData, parentDepth + 1);
  item.appendChild(content);

  return item;
}

/** Re-label "Entity #1", "Entity #2", ... and update the count badge. */
function updateArrayLabels(sectionEl: HTMLElement): void {
  const entityRef = sectionEl.dataset.entityRef || 'Item';
  const items = sectionEl.querySelectorAll(':scope > .ca-form-array-items > .ca-form-array-item');
  items.forEach((item, i) => {
    const label = item.querySelector('.ca-form-array-item-label');
    if (label) label.textContent = entityRef + ' #' + (i + 1);
  });
  const countSpan = sectionEl.querySelector('.ca-form-array-count');
  if (countSpan) countSpan.textContent = '(' + items.length + ')';
}
