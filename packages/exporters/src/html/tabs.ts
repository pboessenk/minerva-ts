import { esc } from './markup.ts';

/**
 * The sections of the page body. Tabs are plain links to a section id, so
 * the URL hash alone (`:target`) decides the active tab and the visible
 * section; sidebar links into another section switch tabs the same way.
 */
export interface Tab {
  /** Section id without the `sec-` prefix. */
  readonly id: string;
  readonly label: string;
}

export const TABS = {
  entities: { id: 'entities', label: 'Entities' },
  ops: { id: 'ops', label: 'Operations' },
  enums: { id: 'enums', label: 'Enums' },
  codelists: { id: 'codelists', label: 'Codelists' },
} as const satisfies Record<string, Tab>;

/** Tab order in the bar, which differs from the section order in the body (operations come first there). */
const TAB_ORDER: readonly Tab[] = [TABS.entities, TABS.ops, TABS.enums, TABS.codelists];

/** The tab links for the sections present; empty when there is at most one section. */
export function renderTabBar(present: ReadonlySet<Tab>): string {
  const tabs = TAB_ORDER.filter((tab) => present.has(tab));
  if (tabs.length <= 1) return '';
  return tabs.map((tab) => `<a class="ml-tab" href="#sec-${tab.id}">${esc(tab.label)}</a>`).join('');
}

/** A body section; its `<h2>` is hidden by the stylesheet when a tab bar is shown. */
export function section(tab: Tab, inner: string): string {
  return `<section class="ml-section" id="sec-${tab.id}" data-tab="${tab.id}"><h2>${tab.label}</h2>${inner}</section>`;
}
