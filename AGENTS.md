<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Civsav design consistency

Before changing UI, layout, styling, charts, or interactions, read [Design.md](./Design.md). Follow its visual tokens, component patterns, screen hierarchy, responsive behavior, accessibility rules, and data-state conventions. Reuse the existing shared components instead of creating a parallel design system. When an explicit product direction intentionally evolves the design, update `Design.md` and the shared implementation together.
