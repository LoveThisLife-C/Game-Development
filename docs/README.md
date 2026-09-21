# Blackout Ridge documentation

The documentation tree is organized by audience and lifecycle:

| Folder | Purpose |
|---|---|
| `client-input/` | Source briefs, production specifications, and implementation handoffs received from the client |
| `client-guide/` | Current client-facing Word guide and its reusable screenshots |
| `full-system/` | Current runtime, facilitator, and playbook-coverage references |
| `reports/` | Consolidated milestone completion reports and the source captures used to regenerate them |

## Visual asset policy

All repository raster assets and external screenshot sources use WebP. The only
compatibility exception is `prototype/favicon.ico`. Generated Word documents
embed OOXML-compatible image copies internally, but their maintained source
captures remain WebP.

Run the asset check with the normal quality suite:

```bash
npm run check
```

To prune obsolete capture variants and convert new PNG/JPEG files:

```bash
python3 scripts/optimize-project-assets.py
```

To regenerate the illustrated deliverables:

```bash
python3 scripts/generate-client-guide.py
python3 scripts/generate-milestone-reports.py
```

To capture the current end-to-end runtime, start the game and run:

```bash
npm run capture:m4
```
