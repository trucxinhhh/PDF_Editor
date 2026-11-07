# Project knowledge

- Shared document catalog and Graphify graph: `C:/Users/ADMIN/truc/knowledge-hub/README.md`.
- For document/architecture investigations, search `& C:/Users/ADMIN/truc/knowledge-hub/hub.ps1 search 'keywords' -Project 'PDF_Editor'`; read the cited original files before making decisions.
- Check `C:/Users/ADMIN/truc/knowledge-hub/generated/status.json` for freshness and failures. Refresh with `hub.ps1 build` after relevant code/docs changes.
- The graph contains AST relationships and explicit document headings/links; semantic document extraction is incomplete. Current source and verified project decisions govern behavior.

## Archify and Harness

- Integration guide: `C:/Users/ADMIN/truc/knowledge-hub/INTEGRATIONS.md`. Use the shared `project-harness` skill for work needing several stages and the `archify` skill for useful architecture/process diagrams.
- Create a source-aware plan with `& C:/Users/ADMIN/truc/knowledge-hub/hub.ps1 plan 'task' -Project 'PDF_Editor'`. A plan does not start agents or count as completed work. The project's real tests and source evidence determine acceptance.

- Required after every assistant build/code/document update: inspect architecture sources, update the candidate if necessary, run `hub.ps1 review -Project 'PDF_Editor'` only after that review, then `hub.ps1 sync -Project 'PDF_Editor'` before handoff. Check `generated/sync-latest.json`; report any incomplete sync. This updates Graphify and Archify without a background watcher.

