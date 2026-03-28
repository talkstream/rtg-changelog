---
description: Design system reference for RTG.center frontend — auto-loaded when editing UI files
applyTo: "packages/web/src/{components,layouts,styles,pages}/**"
---

Before modifying UI components, read `DESIGN.md` in the project root.
For visual reference, view screenshots in `docs/design/screenshots/` using the Read tool.

Key constraints:
- Zero JS (CSP blocks all scripts: `script-src 'none'`)
- Container max-width 720px — do not change
- Thai text: `lang="th"` attribute + line-height 1.85
- All AI-generated content must pass through `sanitize-html` (lib/sanitize.ts)
- Series colors are fixed: A=indigo, B=amber, C=teal, D=slate
- No external fonts, no iframes, no width-based media queries
- Responsive via `clamp()` only
