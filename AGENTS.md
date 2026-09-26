# Project maintenance rules

- Work in `paopao/` for the React/Vite application. Keep recommendation rules, quotas, blacklist filtering and persistence in their existing layers.
- Before generating screenshots, recordings, reference downloads or temporary files, add their destination to `.gitignore`. Use `qa-artifacts/`, `.reference/` or `.tmp/`. Never force-add ignored artifacts.
- No new Git blob may exceed 1 MiB. Do not commit builds, dependencies, archives, videos or screenshot evidence. Run `node tools/check-staged-files.mjs` before every commit; enable the hook with `git config core.hooksPath .githooks` in a new checkout.
- Keep feature CSS scoped to its component. Centralize presentation data normalization, palettes and timing constants; do not add animation/state dependencies for a single screen.
- Validate changed behavior in a running browser, including mobile widths and reduced motion. Reuse the existing business actions instead of duplicating persistence logic.
- Run `npm run build` and `npm test` in `paopao/`, plus the relevant browser acceptance script. Report actual failures and remote write restrictions accurately.
