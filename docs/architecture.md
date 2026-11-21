# Architecture

## Layers

```
            browser (editor)
                  │  HTTP
┌─────────────────▼──────────────────┐
│ packages/server                     │  routes, static files, data directory
│   Workspace ── reads data/          │
└──────┬─────────────────────┬────────┘
       │                     │
┌──────▼───────────┐  ┌──────▼────────────────┐
│ packages/        │  │ packages/core         │
│ exporters        │──▶ model, catalogue,     │
│ one per format   │  │ shared export rules   │
└──────────────────┘  └───────────────────────┘
```

Dependencies only point down. `core` imports nothing but itself and has no
I/O, so it could run unchanged in the browser.

The editor does not use it yet. It has its own copy of the model types
(`web/src/editor/model-types.ts`) and of the constraint rules
(`web/src/editors/constraints.ts`), and it reaches the server only over HTTP.
Moving the editor onto `core` is planned work, so that each rule exists once.

## core

- `text/`: string, number and CSV helpers with exactly defined output.
  Export output is compared byte for byte, and JavaScript's built-ins differ
  at the edges (full versus simple case mapping, UTF-16 versus code-point
  sort order, number formatting, escaping). Each helper documents the rule it
  implements. `fixtures/vectors/go-compat.json` holds reference results that
  the tests check them against.
- `json/`: a parser that keeps key order, duplicate keys and number spelling;
  a streaming reader; typed decoding. Example payloads in a model are kept
  as the exact text the editor wrote.
- `model/`: the decoded model types, the decoder, constraint rules and save
  validation.
- `catalog/`: the SIVI catalogue, its on-disk format, and the lookups
  exporters use (descriptions, codelist values, workspace overrides).
- `export/`: what every exporter needs: entity order, discriminated
  entities and their subtypes, named value types, descriptions, example
  payload handling, root filtering and export settings.
- `compare/`: comparison of a model with an OpenAPI contract (the drift
  report).

## exporters

Each format is `(ctx: ExportContext) => ExportResult`: no clock, no globals,
no access to the workspace. Everything an export depends on is in the
context: the model (already narrowed to the requested roots), catalogue
lookups, export settings, and the time. `EXPORTERS` in `src/index.ts` maps
format names to exporters; that table is the only place a new format is
registered.

## web (the editor)

Plain DOM code, no framework, bundled by esbuild (`packages/web/build.ts`)
together with the graph libraries (cytoscape with the dagre layout, at fixed
versions; `src/base/graph-library.ts`). The server builds the bundle on each
page load; `pnpm build` writes a minified one to `packages/web/dist`, which
`--prebuilt` serves instead. `src/main.ts` sets the parts up in order, each
through its `install()`:

- `base/`: view registry, model state, the SIVI list, graph and codelist views;
- `editor/`: runtime model (`model-types.ts`), sidebar, toolbar, export, search, compare, graph;
- `editors/`: entity, attribute, constraint and enum editors;
- `operations/`: operation and example editors, the example form.

Modules reach each other through ES imports; import cycles are fine because
nothing runs at import time (the `install()` functions run from `main.ts`).
Shared mutable state is an exported object or a variable with exported
setters (`editor/state.ts`, `base/model-loader.ts`, `base/sivi-state.ts`).
The one use of the global scope left is the inline handlers in the markup
(`onclick="selectApiEntity('Order')"` and the like): the functions they call
are put on `window` with `exposeFunctions`, and the two variables they assign
with `exposeState` (see `src/globals.ts`).

Views are built as HTML strings, and every value from a model file, the
catalogue or user input is untrusted: a model may come from someone else.
`src/base/html.ts` has the helpers. Wrap text and attribute values in
`escapeHtml` (or `escapeText`). Pass a value used as a string argument in an
inline handler through `jsArg`, which returns a quoted JavaScript literal that
is safe inside a double-quoted attribute. HTML-escaping alone is not enough
there, because the browser decodes the entities before the script runs. For
new code, the `html` tagged template escapes every interpolation by default.
Variables named `raw…` hold unescaped values.

## server

The server listens on localhost only. Because a browser sends requests there
on behalf of any open page, every request first passes `guardRequest`
(`src/http/guard.ts`):

- the `Host` header must name localhost, which stops DNS-rebinding pages;
- a request that changes something must come from the editor's own origin
  (or from a client that sends no `Origin`, such as curl), and must carry
  `Content-Type: application/json`, which a plain cross-site form cannot send.

`Workspace` is the only code that touches the data directory. Models are
read from disk on every request (a save in another tab is picked up
immediately); the catalogue is read once at start.

Saving writes the request body exactly as received, after two guards:

1. the body must decode as a model and pass constraint validation;
2. optimistic locking on `lastModified`, so a stale tab cannot silently
   overwrite a newer save.

## Where data-specific knowledge lives

Nothing in the code names a particular API, entity or organisation. Values
that are a matter of a specific design live in data:

| Value | Where |
| --- | --- |
| Which models exist, their labels, groups, colours | `minerva.json` → `models` (or discovered) |
| Default model | `minerva.json` → `defaultModel` (else the first) |
| TypeSpec namespace, the root emitted first | model → `export.namespace`, `export.primaryRoot` |
| CSV column headers, download names | `minerva.json` → `exports` |
| Fallback title of an untitled model | the neutral `API Model` |
