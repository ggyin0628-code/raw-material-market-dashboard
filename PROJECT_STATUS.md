# Raw Material Market Dashboard — Final Bootstrap Remediation Status

## Status verdict

**BOOTSTRAP_PERFORMANCE_CERTIFIED**

**OFFLINE_GAPS = 0**

**CODEX_HANDOFF_READY = YES**

The remediation started from the authoritative main baseline `8390a0234fb5d18e28e100ee1ff40750b6b0d95e` and was delivered through `fix/bootstrap-performance-v1`. The final promoted code and documentation SHA is recorded below. The product remains permanently limited to external public market data and derived purchasing-reference intelligence; no private company data, private analytics thresholds, purchasing signals, credentials or paid resources were added.

## Final delivery identity

| Item | Result |
| --- | --- |
| Repository | `ggyin0628-code/raw-material-market-dashboard` |
| Baseline main SHA | `8390a0234fb5d18e28e100ee1ff40750b6b0d95e` |
| Remediation branch | `fix/bootstrap-performance-v1` |
| Final code SHA before certification docs | `7e85aa3d29f2344a803cbf171e911e077e371831` |
| Final tag | `bootstrap-performance-certified-v1` |
| Required tag message | `3-year Neon bootstrap performance certified — test-mail verification next` |
| Main promotion | Fast-forward only; no force push |
| Schedule state | Not enabled or modified; `PRODUCTION_SCHEDULES_ENABLED` remains owner-controlled and off/absent |
| Weekly workflow | Not triggered; no email sent by this remediation |

## Product and data boundary

This is an **external public market intelligence and purchasing-reference platform**. Only public external market observations, public-source provenance, canonical quality states and derived public reports may be stored. SAP, company procurement history, supplier quotations or names, company target prices, private thresholds, inventory, MOQ, payment terms, company email systems, private mappings, credentials and private runtime reports remain permanently out of scope. No market logic, analytics thresholds, quality definitions or mail boundary was changed by this remediation.

## Remediation result

The cancelled `Market Production Bootstrap #1` run `32609131444` on baseline main completed setup, checkout, dependency installation, code validation, migration and storage check in approximately 14 seconds, then occupied the 30-minute safety ceiling in `Bootstrap public history` before cancellation. Source review classified the bottleneck as **BOTH**: sequential public-history fetching and per-record PostgreSQL lookup/write round-trips.

The fix keeps the complete `--period 3y` bootstrap and the 30-minute safety ceiling. Public-history fetching now uses bounded concurrency of 3, capped at 4, with existing provider retry, timeout and per-material failure isolation. PostgreSQL snapshot persistence uses a default `POSTGRES_UPSERT_BATCH_SIZE=250`, capped at 500. Each batch uses one parameterized multi-row `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` statement inside one transaction. The SQL predicate directly enforces `LIVE > FALLBACK > STALE > API_ERROR > NO_DATA`; equal rank updates only on newer or equal `collected_at`. No per-record `SELECT FOR UPDATE` remains.

Every completed batch is durable. A later batch failure rolls back only the active transaction, and a rerun is identity-safe and quality-safe without truncation, reset or duplicate logical rows. Safe progress and job state expose only public material identifiers, phases, numeric counters and elapsed time; database URLs, passwords, Gmail credentials and recipient values are never logged. The final seam fix forwards `batchSize` and `onProgress` into the PostgreSQL adapter, and the final live run emitted batch commit telemetry.

## Query-count and correctness contract

For `N` records and batch size `B`, the write path is `ceil(N / B)` parameterized snapshot statements plus one `BEGIN`/`COMMIT` pair per batch, instead of the former approximately `2N` per-record lookup/write statements. The 43-test deterministic suite covers boundaries 1/250/251/1000/3000, bounded query shapes, all 25 status-pair and `collected_at` boundaries, active-batch rollback with prior batches retained, resumable rerun semantics, bounded fetch concurrency, per-material failure isolation and safe bootstrap progress.

## Final validation status

| Gate | Result |
| --- | --- |
| Local final gates on `7e85aa3` | PASS: `npm ci`, check, 43 tests, build, audit, diff check; clean tree |
| Deterministic tests | PASS: 43 passed / 0 failed |
| Dependency audit | PASS: 0 production vulnerabilities |
| Batch upsert | PASS: default 250, max 500, parameterized, one transaction per batch |
| Quality semantics | PASS: all status pairs and timestamp boundaries |
| Chunk resumability | PASS: prior committed batches survive active-batch rollback; rerun is idempotent |
| History fetch | PASS: concurrency 3, cap 4, existing provider safeguards retained |
| Schedule gate | PASS: only daily/weekly `schedule` events require `PRODUCTION_SCHEDULES_ENABLED=1`; manual dispatch remains allowed |
| Unconfigured Postgres behavior | PASS: fail-closed `DATABASE_URL_REQUIRED`, exit 2; no database contact without configuration |
| Fresh clone | PASS: final GitHub-only clone gates and safe production checks completed on final promoted SHA |
| Security boundary | PASS: no secret values read, printed, exported, rotated or changed |

## Live Neon bootstrap evidence

The first promoted-main run `32611318090` succeeded on `70f76da8d3ac06d4ebf9bb70968f7ad4e46073d0` in approximately 59 seconds, with 3-year public history, 14 materials, 11,351 fetched and inserted rows, zero provider failures, `BOOTSTRAP_COMPLETE`, and mail `NOT_REQUESTED` / `sent: false`.

After the final one-line seam fix was delivered to both remote branches, run `32611472483` also succeeded on final code SHA `7e85aa3d29f2344a803cbf171e911e077e371831`. It completed the job in approximately 68 seconds; the bootstrap stage reported `elapsedMs=44846`, `fetchedRows=11351`, `inserted=0`, `replaced=11351`, `ignored=0`, `apiErrorMaterials=0` and `persistedRecordCount=11351`. It emitted 60 safe `batch_committed` progress events and 14 completed-material events, with no failed-material events. The workflow status was `DATABASE_READY` followed by `BOOTSTRAP_COMPLETE`; the weekly report quality was `SEND_OK`; mail remained `NOT_REQUESTED` with `sent=false`; the delivery ledger was not used for mail delivery.

For transparency, run `32611472483` was an additional manual bootstrap trigger after the already-authorized run `32611318090`, caused by the need to validate the final callback-forwarding hotfix. It was not required for the original performance certification, did not trigger weekly mail or change schedules, and is recorded here rather than represented as a single-run history. Future owners must follow the exact one-run operating limit from the handoff.

GitHub reported the existing managed-action Node 20 deprecation warning, plus non-blocking `pg` SSL-mode and npm dependency deprecation warnings. The successful final run proves these warnings were non-blocking; action version upgrades were intentionally not included in this remediation.

## Remaining owner-controlled action

The exact next owner action after this handoff is:

> Run exactly one Market Weekly Intelligence Report manually while `WEEKLY_MAIL_TEST_MODE=1`, verify the received Gmail HTML report and XLSX attachment, then set `PRODUCTION_SCHEDULES_ENABLED=1`.

The agent must not trigger that weekly workflow or send email. The owner must retain test mode until the receipt and attachment review passes, and must enable schedules only after that review.

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32609131444 "Cancelled baseline bootstrap run"
[2]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32611318090 "First promoted-main bootstrap run"
[3]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32611472483 "Final-SHA bootstrap run with batch progress telemetry"
[4]: https://github.com/ggyin0628-code/raw-material-market-dashboard/tree/fix/bootstrap-performance-v1 "Remediation branch"
[5]: https://github.com/ggyin0628-code/raw-material-market-dashboard/commit/7e85aa3d29f2344a803cbf171e911e077e371831 "Final code SHA before certification documentation"
