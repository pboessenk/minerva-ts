# Security

## Status

This project is not actively maintained (see the [README](README.md)), so
there are no security fixes or releases. If you use it or a fork of it, you
are responsible for keeping it safe. The rest of this page describes what the
code was designed to protect against, as a starting point.

## What Minerva protects against

Minerva is a local tool: the server listens on localhost only and serves one
data directory. The threats it is designed for:

- **Other websites in your browser.** The server refuses requests addressed
  to any host other than localhost, and refuses writes from any origin other
  than the editor itself, or without a JSON body.
- **Models and catalogue data from someone else.** The editor treats every
  value from a model file or the catalogue as text, never as markup.

Out of scope: anyone who can already run code on your machine or write to the
data directory, and exposing the server to a network yourself (for example
with a reverse proxy). Minerva has no authentication.
