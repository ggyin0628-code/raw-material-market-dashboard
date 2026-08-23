# Raw Material Dashboard — Production Handoff

## Delivery identity

| Item | Value |
| --- | --- |
| Repository | `ggyin0628-code/raw-material-market-dashboard` |
| Authoritative baseline | `8390a0234fb5d18e28e100ee1ff40750b6b0d95e` |
| Existing bootstrap remediation | `fix/bootstrap-performance-v1`, certified by `bootstrap-performance-certified-v1` |
| Final presentation main SHA | `8a9fd80c30a339b9eeea1a176c174459368a39b9` |
| Presentation status | Approved, committed and pushed to `main` |
| Active production mail provider | Gmail SMTP (`MAIL_PROVIDER=smtp`) |
| Approved presentation preview | Offline `2026-W33` HTML/XLSX preview |
| Product boundary | External public market intelligence and purchasing-reference context only |
| Deployment / paid resources | Not performed / none added |

The approved procurement-management presentation redesign is complete and is no longer pending. The final main commit contains the HTML/XLSX presentation renderer, deterministic offline preview generator, presentation regression coverage and the required status/handoff alignment. The remote main SHA was verified against the local main SHA and the working tree was clean after push.

## Permanent safety boundary

> The system stores only external public market observations and derived public-market reference reports. It is not a procurement system, supplier quotation service, company target-price system, ERP purchasing module or buy/sell decision engine.

Do not add SAP, company procurement history, supplier quotations or names, company target prices, private thresholds, inventory, MOQ, payment terms, company email systems, private mappings, credentials or private runtime reports. Do not read, print, export, rotate or modify GitHub Actions secret values. No company data or company mail integration is part of this system. The only mail provider currently active in production is the existing owner-configured Gmail SMTP path.

## Existing bootstrap certification retained

The cancelled `Market Production Bootstrap #1` run `32609131444` on the original baseline completed setup, checkout, dependency installation, code validation, migration and storage readiness in about 14 seconds, then occupied the 30-minute safety ceiling in `Bootstrap public history`. The bottleneck was classified as **BOTH**: sequential public-history fetching and per-record PostgreSQL lookup/write round-trips.

The remediation kept the complete three-year public history and 30-minute safety ceiling. It added bounded history concurrency 3 (cap 4), default Postgres batch size 250 (cap 500), one parameterized multi-row upsert transaction per batch, status-quality preservation, chunk resumability and safe progress. Run `32611318090` established the successful promoted-main Neon bootstrap, and run `32611472483` verified final callback-forwarded batch telemetry. Both were bootstrap-only with no weekly mail and no schedule activation. **Bootstrap is complete and must not be rerun for this handoff or for the presentation redesign.**

## Production mail delivery state

The production weekly workflow remains on the existing Gmail SMTP provider. The owner-confirmed live Gmail test succeeded: the HTML email was received successfully and the XLSX attachment was received successfully. Gmail SMTP is therefore the active production mail provider. The existing recipients, test-mode behavior, delivery ledger, duplicate guard and `WEEKLY_MAIL_TEST_MODE` boundary remain unchanged.

The manual Gmail test is complete. It is not a pending action and must not be repeated as part of this handoff. This documentation cleanup does not send mail or trigger the weekly workflow.

Microsoft Graph is **historical and inactive only**. Any Graph implementation or OAuth helper retained in repository history is not the active production weekly path, is not required for current operations and must not be treated as a production mail dependency. The current workflow uses Gmail SMTP and no company Microsoft 365 integration.

## Presentation redesign state

The approved presentation layer is live in the promoted `main` source at SHA `8a9fd80c30a339b9eeea1a176c174459368a39b9`. It provides the procurement-management HTML report and polished XLSX workbook with four KPI cards, weekly change overview, procurement review priorities, category momentum, signal distribution, compact prioritized detail columns, filters, frozen headers, alternating row shading, directional indicators, warning-row highlighting and a bottom disclaimer.

The accepted offline `2026-W33` preview was generated from synthetic public-safe fixture data with zero network calls and no mail send. The redesign changes presentation only; market collection, calculations, signals, quality gate, Neon/PostgreSQL, bootstrap, mail delivery, recipients, GitHub Actions and schedules remain outside its scope.

## Validation status

| Gate or state | Result |
| --- | --- |
| Presentation redesign approval | PASS: offline `2026-W33` preview accepted |
| Final main SHA | `8a9fd80c30a339b9eeea1a176c174459368a39b9` |
| Deterministic regression suite | PASS: 53 passed / 0 failed |
| `npm ci` / check / syntax | PASS |
| Build / audit / YAML validation | PASS |
| Presentation scope guard | PASS |
| Protected runtime unchanged | PASS |
| Gmail SMTP live test | PASS: HTML received and XLSX attachment received |
| Microsoft Graph production use | INACTIVE / historical only |
| Bootstrap | COMPLETE; do not rerun |
| Schedule activation | Pending owner enablement only |
| Company data / company mail integration | NONE |

## Schedule gate and next operational certification

The daily/weekly schedule gate remains owner-controlled. The agent did not enable or modify `PRODUCTION_SCHEDULES_ENABLED`, and no schedule was triggered by this documentation cleanup.

The next operational certification is for the owner to enable the existing schedule gate by setting `PRODUCTION_SCHEDULES_ENABLED=1` when ready. The Gmail live test and attachment verification are already complete; they are not prerequisites to repeat. No bootstrap rerun, Graph setup, company mail integration or additional live email is required for this handoff.

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32609131444 "Cancelled bootstrap run"
[2]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32611318090 "Successful promoted-main bootstrap"
[3]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32611472483 "Bootstrap batch telemetry verification"
[4]: https://github.com/ggyin0628-code/raw-material-market-dashboard/commit/8a9fd80c30a339b9eeea1a176c174459368a39b9 "Final presentation main commit"
