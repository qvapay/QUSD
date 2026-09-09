# Migration runbook — `QUSD` (v1) → `qusd-v2`

State on 8 Sep 2026 (read from Hiro): v1 supply 951,510.65 QUSD, 2 holders — the
deployer (951,508.55) and one external wallet with 2.10 QUSD from a 2025 test transfer.
Last on-chain activity 9 Oct 2025. The qpweb ledger bridge (`QUSD_LEDGER_ENABLED`) has never
minted in production, so nothing on-chain represents a customer balance yet.

## 0. Prerequisites

- Deployer key `SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2` available (signs v1 burns and the
  v2 publish). STX for fees.
- Three destination keys decided: cold **owner**, hot **minter** (the TronDealer signer),
  **compliance officer** (CCO). One segregated **blocked-property** wallet.
- qpweb ready to switch `QUSD_CONTRACT` (`scripts/providers/payment/trondealer-qusd.js`) and
  the address quoted in `components/transparency/ReserveDisclosure.js`.
- TronDealer `/stx/mint` and `/stx/burn` pointed at `qusd-v2` (same function signatures).

## 1. Deploy v2 (supply 0)

```bash
clarinet deployments apply -p deployments/default.mainnet-plan.yaml
```

Only batch 1 (`qusd-v2`) is new; batch 0 is the historical v1 publish and is skipped.

## 2. Assign roles from the deployer key

```clarity
(contract-call? .qusd-v2 set-minter 'SP...HOT)
(contract-call? .qusd-v2 set-compliance-officer 'SP...CCO)
(contract-call? .qusd-v2 set-blocked-property-account 'SP...BLOCKED)
(contract-call? .qusd-v2 transfer-ownership 'SP...COLD)
;; then, signed by SP...COLD:
(contract-call? .qusd-v2 accept-ownership)
```

## 3. Retire v1 to zero

The v1 owner can burn from any holder, so the whole supply can be removed:

```clarity
(contract-call? .QUSD burn u95150855000000 'SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2)
(contract-call? .QUSD burn u210000000 'SP3GPJR3SSX38HEPCMKCHKTAX4PG5PMA6AV0V5N3Q)
(contract-call? .QUSD set-token-uri u"https://qvapay.com/qusd-v1-retired.json")
```

Leaving v1 at supply 0 keeps explorers and the reserve page from double counting. Publish a
retired-metadata JSON that points to the v2 contract id.

## 4. Initial mint = customer liabilities at the cut-off

From qpweb, capture Σ `users.balance` + Σ `savings_accounts.balance` at a chosen timestamp
(`captureReserveFigures`), freeze deposits/withdrawals for the capture window, and mint that
amount to the treasury (minter) wallet with a memo referencing the cut-off:

```clarity
(contract-call? .qusd-v2 mint-memo u<liabilities*1e8> 'SP...HOT (some 0x...))
```

Record the mint in `qusd_ledger` (`kind='mint'`, `source='migration'`) so the sync cron
does not treat it as missing.

## 5. Go live

Set `QUSD_LEDGER_ENABLED=queue` first (rows accumulate, `qusd-sync` sends them one by one),
watch `/admin/qusd` for ledger net vs on-chain supply, then `on`. From this point every
credited deposit mints and every completed withdrawal burns, and the monthly reserve report
reads outstanding QUSD from `get-total-supply`.

## 6. Public surfaces to update the same day

- `public/qusd.json` — unchanged (v2 reads the same URI).
- `/transparency/qusd` methodology — contract id.
- `/transparency/genius` — flip § 4(a)(6) from "being implemented" to live.
- `docs/compliance-genius-marketing-checklist.md` in qpweb — close the three v1 promises.
