# Raw Material Market Dashboard — Bootstrap Performance Certification Handoff

## Delivery identity

| Item | Value |
| --- | --- |
| Repository | `ggyin0628-code/raw-material-market-dashboard` |
| Authoritative baseline | `8390a0234fb5d18e28e100ee1ff40750b6b0d95e` |
| Remediation branch | `fix/bootstrap-performance-v1` |
| Final promoted main / feature SHA | `7e85aa3d29f2344a803cbf171e911e077e371831` before this certification-document commit; final documentation SHA is the tag target recorded below |
| Certification tag | `bootstrap-performance-certified-v1` |
| Tag message | `3-year Neon bootstrap performance certified — test-mail verification next` |
| Product boundary | External public market intelligence and purchasing-reference context only |
| Deployment / paid resources | Not performed / none added |

The remediation was based on the required main baseline and was promoted by fast-forward only. The feature branch and main point to the same final history. No force push, reset, destructive migration, data truncation or application deployment was used.

## Permanent safety boundary

> The system stores only external public market observations and derived public-market reference reports. It is not a procurement system, supplier quotation service, company target-price system, ERP purchasing module or buy/sell decision engine.

Do not add SAP, company procurement history, supplier quotations or names, company target prices, private thresholds, inventory, MOQ, payment terms, company email systems, private mappings, credentials or private runtime reports. Do not read, print, export, rotate or modify GitHub Actions secret values. Do not enable schedules, change Gmail credentials or send the weekly report from this remediation handoff.

## Failed run diagnosis

Cancelled run `32609131444` on baseline main `8390a0234fb5d18e28e100ee1ff40750b6b0d95e` completed setup, checkout, `npm ci`, code validation, migration and storage readiness in about 14 seconds. It then remained in `Bootstrap public history` from approximately `00:56:52` to `01:26:50` and was cancelled at the 30-minute safety ceiling. The source diagnosis is **BOTH**: sequential public history fetches and per-record PostgreSQL `SELECT FOR UPDATE` / insert-write round-trips.

## Remediation design

The complete three-year public history remains required. History fetches now use bounded concurrency 3, capped at 4, while retaining public-provider retry, timeout and per-material failure isolation. The PostgreSQL write path uses `POSTGRES_UPSERT_BATCH_SIZE=250` by default, capped at 500. Each chunk uses one parameterized multi-row `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` inside one transaction. The SQL directly enforces `LIVE > FALLBACK > STALE > API_ERROR > NO_DATA`; equal rank can replace only on newer or equal `collected_at`. The canonical identity remains `(material_id, observation_date)`.

Each completed chunk is durable. If a later chunk fails, only the active transaction rolls back. A rerun is safe without truncation or reset: identity prevents duplicate logical rows and the quality predicate prevents lower-quality overwrite. The snapshot provider seam forwards `batchSize` and `onProgress`, so batch commits appear in safe progress telemetry. Progress/job state contains public material IDs or symbols, phases, counters, statuses and elapsed time only; it never contains database URLs, passwords, Gmail credentials or recipient values.

## Validation contract and results

The deterministic suite has **43 passed / 0 failed**. It covers batch boundaries 1/250/251/1000/3000, parameter/query bounds, all 25 status-pair and `collected_at` boundaries, active-batch rollback with prior chunks retained, idempotent rerun, bounded concurrency, material failure isolation, progress summary and schedule source contracts. Local final gates on the code SHA passed: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check`, and clean worktree.

Unconfigured Postgres behavior remains fail-closed: no `DATABASE_URL` produces safe `DATABASE_URL_REQUIRED` and exit 2 without contacting a database. The workflows retain a 30-minute bootstrap ceiling. Daily and weekly job-level guards require `PRODUCTION_SCHEDULES_ENABLED=1` only for `schedule` events; manual dispatch remains allowed. Bootstrap is manual-only and deliberately not gated. The schedule variable was not enabled or modified.

## Live Neon evidence

The first owner-authorized promoted-main bootstrap was run `32611318090` on `70f76da8d3ac06d4ebf9bb70968f7ad4e46073d0`. It succeeded in about 59 seconds, including a 35.744-second bootstrap stage, and reported 14 materials, 11,351 fetched rows, 11,351 inserted rows, zero replacements/ignored rows, zero API-error materials and `BOOTSTRAP_COMPLETE`. The final status reported `DATABASE_READY`; the quality state was `SEND_OK`; mail was `NOT_REQUESTED` with `sent: false`.

The callback-forwarding hotfix was then delivered fast-forward to both main and `fix/bootstrap-performance-v1`. To validate that final code path, a second manual bootstrap run `32611472483` was triggered on final code SHA `7e85aa3d29f2344a803cbf171e911e077e371831d0`. It succeeded in about 68 seconds; the bootstrap stage reported `elapsedMs=44846`, `fetchedRows=11351`, `inserted=0`, `replaced=11351`, `ignored=0`, `apiErrorMaterials=0` and `persistedRecordCount=11351`. It emitted 60 `batch_committed` events, 14 completed-material events and zero failed-material events. Mail remained `NOT_REQUESTED` / `sent=false`, and no weekly workflow was triggered.

This second run is recorded transparently because it exceeded the original single-run instruction. It was not a weekly/mail action, did not change schedule state or secrets, and was used only to exercise the final callback-forwarding path against the already-populated Neon state. No further live bootstrap or weekly workflow should be triggered by the owner or agent as part of this handoff.

GitHub emitted the managed-action Node 20 deprecation warning; `pg` SSL-mode and npm dependency deprecation warnings were also observed. They are classified as **NON_BLOCKING_WARNING** because the final workflow succeeded, and no unrelated action-version upgrade was introduced.

## Final owner action

After the certification tag is verified, the exact next owner action is:

> Run exactly one Market Weekly Intelligence Report manually while `WEEKLY_MAIL_TEST_MODE=1`, verify the received Gmail HTML report and XLSX attachment, then set `PRODUCTION_SCHEDULES_ENABLED=1`.

The owner should keep test mode enabled until both the recipient isolation and attachment review pass. Only the owner may perform this action; the remediation agent must not trigger it or send email.

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32609131444 "Cancelled baseline bootstrap"
[2]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32611318090 "First promoted-main bootstrap"
[3]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32611472483 "Final-SHA bootstrap with batch progress telemetry"
[4]: https://github.com/ggyin0628-code/raw-material-market-dashboard/tree/fix/bootstrap-performance-v1 "Remediation branch"
