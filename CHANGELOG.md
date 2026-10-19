# Changelog

All notable changes to **Canvas Cards** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/).

## 0.2.0

### Added

- **Search card bodies** — a command that searches titles *and* hidden Markdown
  bodies of every card across all canvases, with keyboard navigation and jump-to-card.
- **Export a card to a note** — writes the card body to a Markdown note next to the
  canvas, with frontmatter recording the source canvas, node id and export time.
- **Cover thumbnails** — the first image embed in the body becomes the card cover
  (toggle with the *Show thumbnails* setting).
- **Paste images into the body** — pasted images are saved to the attachment folder
  and inserted as an `![[image]]` embed.
- Adding a card no longer stacks exactly on top of an existing one (28 px stepping).

### Fixed

- Body autosaves no longer leave a stale Canvas undo snapshot that could silently
  drop the body when undoing an earlier canvas action; closing the popup now pushes
  one session-level history snapshot instead.
- The file explorer could appear empty after the plugin wrote to a search input; the
  search test was narrowed to the plugin popup (does not affect card data).

## 0.1.0

### Added

- Cards on Canvas: a native text node renders as a compact, centred title; a single
  click (or the corner button) opens the full rendered Markdown body in a popup.
- Card creation, conversion, cancellation and body editing commands plus context
  menu entries.
- Minimal editor with autosave, undo isolation, full-screen popup, copy body and
  image paste.
- Settings: card appearance (minimal/button), opening trigger (click/corner button),
  save status.
- Bilingual (English/Chinese) UI, Advanced Canvas coexistence and selected Canvas
  node colour support.
