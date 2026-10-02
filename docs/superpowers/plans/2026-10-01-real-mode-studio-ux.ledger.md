# SDD ledger — plan: docs/superpowers/plans/2026-10-01-real-mode-studio-ux.md

Spec: sections "Permintaan".."Keputusan desain" inside the plan file itself.
Executor: inline (executing-plans), branch feat/web-privy-redesign (not main), in place per session config.

## Pre-flight (shared interfaces)
| Producer → Consumer | Interface | Finding |
|---|---|---|
| T1 → T2 | SLOTS/slotOf/normalizeTraits/Profile | consistent |
| T1,T2 → T3 | composeSoul/parseSoul/inheritProfile/stackOf/stackLocus | consistent |
| T3 → T9,T10 | /api/studio/soul → {hash,loci}; /api/studio/suggest → {name,role,traits,instructions} | consistent |
| T3 ↔ T11 | Agent row lists soulVersion/soulUpdatedAt "(Task 11)" | Ruling: fields added in T11, T3 leaves them out — plan already marks them as T11 — cost: none |
| T7 → T9,T10,T15 | QuotaLedger, authHeaders(), identity privy:<did> / test:<addr> | consistent; test-mode identity used by e2e |
| T13 → T9,T11 | useConfirmPay | Ruling: T9/T11 call actor.act directly until T13 wires the sheet inside useActCore — plan says so — cost: none |
| T15 → T10 | ResultView | Ruling: T10 renders <pre> until T15 swaps in ResultView — plan says so |
| T4 → T5..T15 e2e | bun run start --test | all e2e specs need TEST_ACCOUNTS=1 server |

## Tasks
Task 1: complete (commits b0bd8ba..56dd6e7, tests: bun test packages/ → Ran 22 tests across 2 files. [0m[2m[[1m629.00ms[0m[2m][0m)
Task 2: complete (commits 56dd6e7..ccf85df, tests: bun test packages/ web/ → Ran 61 tests across 8 files. [0m[2m[[1m1331.00ms[0m[2m][0m)
Task 3: Ruling: old SoulStore test expected 4001-char rejection — updated to 7001/7000 because the plan moves the 4000 limit to instructions (endpoint) and the store holds profile+instructions — cost if wrong: one constant
Task 3: Ruling: old Studio page (rewritten in Task 9) stops reading numeric traits from /api/studio/suggest, which now returns free-text traits — keeps the page working between tasks — cost if wrong: none, page is replaced in Task 9
Task 3: complete (commits ccf85df..55bb6a4, tests: bun run test → Ran 183 tests across 22 files. [0m[2m[[1m1.54s[0m[2m][0m)
Task 4: Ruling: faucet on local chain without PRIVY_APP_ID keeps address-only identity (otherwise local dev without Privy could never get gas) — cost if wrong: local-only, no Sepolia effect. Also keeper's server-signed manifest shortcut gated on TEST.
Task 4: complete (commits 55bb6a4..f58cbce, tests: bun run test → Ran 184 tests across 23 files. [0m[2m[[1m2.43s[0m[2m][0m)
Task 5: Ruling: journey check 'tidak ada agent bawaan' asserts no non-Studio generation-0 agent exists (instead of length===0) so the spec can rerun on a used chain; the strict empty-chain check lives in empty.spec (Task 14) — cost if wrong: none
Task 5: Ruling: in test mode /api/status hides privyAppId so e2e can sign in with the injected fake wallet — Privy login itself is verified manually on Sepolia (Task 17 checklist) — cost if wrong: Privy-only UI regressions not caught by e2e
Task 5: Ruling: journey chain-down banner and GSAP reveal checks used fixed sleeps and failed under load (both pass in isolation) — replaced with waits up to 8 s on the same conditions — cost if wrong: a real >8 s regression would still fail
Task 5: e2e (bun run e2e, start --test, fresh Anvil): journey/wallet/market/protect SEMUA LULUS; forge: only pre-existing test_BirthGasStaysUnderBudget fails. Ruling: CREDITS_DEFAULT_PRICE_ETH default 0 (beta free, quota-limited) — cost if wrong: MCP tasks free until admin sets a price
Task 5: complete (commits f58cbce..2befbec, tests: bun run test → Ran 184 tests across 23 files. [0m[2m[[1m2.33s[0m[2m][0m)
Task 6: Ruling: server ownerName no longer maps Anvil accounts to Alice/Bob/Carol (always short address) — demo names leaked into Pasar cards — cost if wrong: none
Task 6: Ruling: /api/run in test mode always mocks when MOCK_LLM=1 (UI no longer has a mock checkbox) — cost if wrong: none outside test mode
Task 6: Ruling: hero agent count hidden when 0 agents (pulled forward from Task 14) — cost: none
Task 6: e2e journey/wallet/market/protect SEMUA LULUS
Task 6: complete (commits 2befbec..cf0a29f, tests: bun run test → Ran 184 tests across 23 files. [652.00ms])
Task 7: Ruling: quota-exhaustion e2e replaced by manual curl check (server restarted with FREE_TASKS_PER_DAY=2: 3rd run → 429 friendly message; other user unaffected; non-test mode without Privy token → 401 on run/soul/quota) because the e2e script cannot restart the server — cost if wrong: regression caught only by unit tests (9 QuotaLedger tests)
Task 7: Ruling: test mode uses loose default quotas (1000/day) unless env sets them, so e2e seeding never runs out — cost: none outside test mode
Task 7: Ruling: AI suggest/encode calls count toward the global token budget as sistem:* without using a user's task quota; when budget is exhausted they silently fall back to keyword rules — cost if wrong: Studio AI quality drops when budget is gone (by design)
Task 7: e2e 4 specs SEMUA LULUS
Task 7: complete (commits cf0a29f..78d6f6f, tests: bun run test → Ran 193 tests across 24 files. [476.00ms])
Task 8: Ruling: in test mode with empty ADMIN_ADDRESSES, Anvil #9 is admin so the admin panel is e2e-testable — cost if wrong: none outside test mode
Task 8: Ruling: "kawin" and "pasang-harga" metrics are recorded when /api/tx builds the transaction, not on receipt — approximation; cost: funnel may overcount cancelled signatures
Task 8: Ruling: reports use a separate FeedbackStore (10/account/day), feedback 5/account/day — cost: none
Task 8: e2e admin.spec SEMUA LULUS (expected 403 resource log for non-admin filtered)
Task 8: complete (commits 78d6f6f..e81e75c, tests: bun run test → Ran 199 tests across 26 files. [483.00ms])
Task 9: Ruling: Studio summary aside replaced by a fixed bottom bar under 900px (plan: sticky panel desktop, sticky bar phone) — cost: none
Task 9: Ruling: freePair now seeds a fresh pair after 6 mining rounds instead of waiting out exponential breeding cooldowns on a reused chain — cost: more seed agents on long test runs
Task 9: e2e: journey/market/protect passed in full run; wallet/admin passed after the freePair fix (rerun individually)
Task 9: complete (commits e81e75c..96bf59d, tests: bun run test → Ran 207 tests across 27 files. [432.00ms])
Task 10: Ruling: try endpoint encodes the profile with keyword rules only (no extra AI call) to keep "coba" to one model call — cost: try-run genome may differ slightly from the AI-encoded genome at creation
Task 10: Ruling: wallet-send check replaced by "agent count unchanged" (fake wallet has no send counter) — cost: none, same guarantee
Task 10: e2e market.spec SEMUA LULUS incl. 3 try checks
Task 10: complete (commits 96bf59d..969b286, tests: bun run test → Ran 213 tests across 28 files. [434.00ms])
Task 11: Ruling: inherited profiles and secret instructions now read each parent's soul AS OF the child's birth block (SoulSet history + old soul texts kept in SoulStore). Without this, a parent owner's edit silently changed other people's children — contradicting K5 ("anak yang sudah lahir tidak ikut berubah"). Tests: souls.test "versi otak saat anak lahir" RED→GREEN — cost if wrong: if a SoulSet event is missed by the scanner, the child falls back to "no soul at that time" for that parent
Task 11: Ruling: edits use a per-hour limiter instead of the 3/day new-agent quota; owner soul endpoint returns only the owner's own soul (children get their inherited public profile, never ancestors' secret instructions) — cost: none
Task 11: Ruling: protect.spec now seeds its own Alice-owned agent instead of assuming agent #1 (order-dependent on a reused chain)
Task 11: e2e journey/wallet/market/admin SEMUA LULUS in full run, protect SEMUA LULUS after fix; forge 80/81 (pre-existing gas test only)
Task 11: complete (commits 969b286..fbc98f6, tests: bun run test → Ran 215 tests across 28 files. [440.00ms])
Task 12: Ruling: matchAgent (lib/search.ts, planned for Task 15) pulled forward because Pasar search needs it now; tests from the Task 15 brief included — cost: none
Task 12: Ruling: old genome chips (highlights) replaced everywhere (home carousel, Kawinkan slots, Silsilah panel) per memory "perbagus semua yang sejenis"; genome trait list moved into "Detail teknis"; Arena link removed from Pasar
Task 12: Ruling: traitChips cuts "label: isi" at 30 chars (plan said 28 for value) — test pins 30 total — cost: cosmetic
Task 12: e2e 5 specs SEMUA LULUS
Task 12: complete (commits fbc98f6..ba77323, tests: bun run test → Ran 224 tests across 30 files. [462.00ms])
Task 13: Ruling: progress shown in a dedicated fixed panel (PayProvider) instead of extending the toast system — keeps explorer link + persistence without touching all toasts — cost: two notification surfaces
Task 13: Ruling: fee estimate = estimateGas × gasPrice × 1.2; on estimate failure UI uses 0.0002 ETH fallback
Task 13: Ruling: send-count check done via eth_getTransactionCount of a fresh zero-balance wallet (fake wallet has no counter)
Task 13: e2e journey/wallet/market/admin SEMUA LULUS in full run; protect SEMUA LULUS after adding the expected confirm step for deposits
Task 13: complete (commits ba77323..884de25, tests: bun run test → Ran 231 tests across 32 files. [446.00ms])
Task 14: Ruling: empty.spec intercepts /api/agents and /api/pregnancies with [] instead of needing a fresh chain (e2e cannot redeploy mid-run) — tests the UI on empty data — cost: server-side empty-chain behaviour covered only by start --test on a fresh Anvil (seen manually: "0 agent siap")
Task 14: Ruling: once a user owns an agent and ran a task, FirstSteps never reappears even if balance drops (no nagging) — extra unit test
Task 14: NOTE: empty.spec was written after the UI change, so it was not observed RED first (Kawinkan/Pasar empty texts did not exist before, so it would have failed)
Task 14: Ruling: a successful Studio "Coba" also counts as "pernah memberi tugas"
Task 14: e2e 6 specs SEMUA LULUS
Task 14: complete (commits 884de25..a07f883, tests: bun run test → Ran 235 tests across 33 files. [447.00ms])
Task 15: Ruling: splitBlocks lives in lib/blocks.ts (pure, tested) and the component is ResultText in components/result-view.tsx — cost: none
Task 15: Ruling: "Kerja penuh" checkbox shown only on a local non-public server with Docker (beta: FULL_MODE_PUBLIC=0) — cost: none
Task 15: Ruling: picker e2e compares shown rows with the app's own matchAgent over /api/agents (rows show role/lineage, not stack)
Task 15: e2e 6 specs SEMUA LULUS
Task 15: complete (commits a07f883..6daec72, tests: bun run test → Ran 238 tests across 34 files. [446.00ms])
Task 16: Ruling: Ketentuan contact = feedback button + per-agent report (no personal email/Telegram published) — cost: none, user can add a contact later
Task 16: Ruling: Hints not placed inside agent cards (cards are links; nested buttons are invalid HTML)
Task 16: Ruling: feedback/report daily limits loosened in test mode (repeat e2e runs exhausted 5/day)
Task 16: e2e: empty/journey/market/protect/admin SEMUA LULUS in full run; wallet SEMUA LULUS after regex fix for the "?" hint
Task 16: complete (commits 6daec72..98b06b9, tests: bun run test → Ran 240 tests across 35 files. [452.00ms])
Task 17: Ruling: .env now holds beta production values; start --test passes loose quota env explicitly (process env wins over .env in Bun) so e2e is unaffected — cost: none
Task 17: DONE by agent: operator wallet 0x5664EC247615826dA79A32aeC40E85AFa49476bA created (key only in .env, chmod 600); .env beta values written (METRICS_SALT random, PUBLIC_URL https://meiosis.rahmateka.my.id, TRUST_PROXY=1, MOCK_LLM=0); Groq limits read from headers: 1000 req/day, 8000 TPM per model (TPD not exposed) → DAILY_TOKEN_BUDGET 300000; encrypted backup script (openssl AES-256 + PBKDF2, key ~/.config/meiosis/backup.key) — restore round-trip identical, first real backup in ~/backup-flashdisk/meiosis; health check script; systemd user units + installer (deploy/laptop); Named Tunnel meiosis (d3a78186-…) + CNAME meiosis.rahmateka.my.id (overrides the existing wildcard only for this name)
Task 17: Ruling: age not installed → openssl enc used for backups — cost: none (same AES-256 confidentiality)
Task 17: BLOCKED (needs user): funding the operator (0.1 ETH send was refused by the auto-mode classifier as a real-world transaction; nothing was sent — operator balance 0) and `bun run deploy:sepolia` (also on-chain). Privy allowed origin + real login checklist are user steps.
Task 17: complete (commits 98b06b9..924b050, tests: bun run test → Ran 240 tests across 35 files. [445.00ms])
Task 18: a11y: axe-core serious/critical = 0 on 10 pages × desktop+phone after raising --dim to #7c86a2 and underlining inline links; keyboard-only Studio check passes (e2e/a11y.spec.ts)
Task 18: perf root causes (systematic-debugging): (1) build:web lacked production mode → React DEVELOPMENT build shipped; (2) all 19 fontsource subsets inlined as base64 into a 484 KB render-blocking CSS; (3) Privy SDK (2.2 MB) loaded on first visit; (4) no compression; (5) all pages in the entry chunk. Fixes: --production build, fonts as separate cached files (Latin only), Privy loaded on login click or known session (meiosis:privy flag), gzip static serving (server/static.ts, tested), lazy routes, hero title not hidden by animation.
Task 18: Lighthouse mobile (local, production build, no Brotli/HTTP2): home 26→67-68, Studio 35→83, Pasar 81; bytes 5.3 MB→0.5 MB; LCP 22.7 s→3.6 s
Task 18: Ruling: home stays at 67-68 locally (target 70) — remaining 745 ms long task is GSAP ScrollTrigger setup on the animated landing page; refactoring the landing animations is out of scope; re-measure via the tunnel URL at go-live (Cloudflare adds Brotli/HTTP2) — cost if wrong: home slightly below 70 on slow phones
Task 18: e2e 7 specs SEMUA LULUS after perf work; grep for demo/founder/lokus words in web/src clean (only false positive StaleListing); docs updated (README, QUICKSTART, DEPLOY, TESTING, ADDING-AGENTS). Lighthouse via tunnel pending go-live (blocked on deploy).
Task 18: complete (commits 924b050..e0bab6c, tests: bun run test → Ran 245 tests across 36 files. [464.00ms])
Final review: self-review (subagent not dispatched: user did not request subagents) against code-reviewer.md
Final: fixed payment burned when quota/IP limit refused after markPaid — test "reserveTasks: semua atau tidak sama sekali" RED→GREEN; live public-mode check returns 429 before payment validation; suite 246/246 unit, e2e 7/7, forge 80/81 (pre-existing gas test)
Final: minor (deferred): Studio daily quota is consumed when the soul is stored even if the user then cancels the transaction
Final: minor (deferred): a hidden agent can still be bred via a direct /kawin?a=<id> link (hidden from lists, MCP and rent only)
Final: minor (deferred): admin signatures can be replayed within the signed-message validity window (same as other signed endpoints)
Final: minor (deferred): home page mobile Lighthouse 67-68 locally (target 70); re-measure via tunnel at go-live
