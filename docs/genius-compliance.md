# GENIUS Act — what this contract covers and what it does not

Reference: *Guiding and Establishing National Innovation for U.S. Stablecoins Act*,
Pub. L. 119-27 (18 Jul 2025). Effective date (§ 20): the earlier of 18 months after
enactment (**18 Jan 2027**) or 120 days after the primary regulators issue final rules.
After 18 Jul 2028 (§ 3(b)) a digital asset service provider may only offer payment
stablecoins issued by permitted issuers.

A smart contract can only satisfy the *technological* obligations. Everything else
(licence, reserves, disclosures, AML program) lives in the platform and is published at
`https://www.qvapay.com/transparency/genius`. This table is the contract-side view.

| Section | Obligation | Where it is met | `qusd-v2` mechanism |
|---|---|---|---|
| § 4(a)(6) | Technological capability to comply with lawful orders: **seize, freeze, burn, prevent transfer** | contract | `block-principal` (freeze + prevent transfer, both directions) · `seize` → blocked-property account · `burn-by-order` · `pause` |
| § 4(a)(5)(D) | Technical capabilities to **block, freeze and reject** specific transactions | contract | `transfer` refuses blocked sender **or** recipient; `mint` refuses blocked recipients |
| 31 CFR § 501.603 | Blocked property held in a segregated, reportable account | contract | `blocked-property-account` role; it can never be blocked; every `seize` prints `order-ref`, amount, destination and block height |
| § 4(a)(1)(C), § 4(a)(3) | Monthly report of outstanding stablecoins | contract → platform | `get-total-supply` is the only source of "QUSD outstanding" in the reserve disclosure; `mint-memo` / `burn-memo` carry the `qusd_ledger` id for row-level reconciliation |
| § 4(a)(9), § 4(e) | Name must not suggest U.S. government backing | contract | name `QvaPayUSD`, symbol `QUSD` ("USD" is expressly allowed) |
| § 4(a)(11) | No interest or yield for holding | contract | no yield mechanics of any kind; supply changes only through `mint*`, `burn*`, `burn-by-order` |
| Key management | Separation of duties | contract | owner (cold) ≠ minter (hot, TronDealer) ≠ compliance officer (CCO); two-step ownership transfer |
| Auditability | Reconstruct every state change from chain data | contract | structured `print` on mint, burn, block, unblock, seize, burn-by-order, pause, unpause and every role change |

## Deliberately NOT in the contract

| Obligation | Why not on-chain | Where it lives |
|---|---|---|
| § 3(a) permitted-issuer licence | legal status, not code | Board / counsel; status on `/transparency/genius` |
| § 4(a)(1)(A) reserve composition (cash, insured deposits, T-bills ≤ 93 d, gov MMF) | reserves are off-chain assets | treasury; monthly disclosure at `/transparency/qusd` |
| § 4(a)(2) no rehypothecation of reserves | policy over off-chain assets | treasury policy |
| § 4(a)(1)(B) redemption policy, 7-day notice of fee changes | product policy | `/transparency/qusd` |
| § 4(a)(3) CEO + CFO certification, examination by a registered public accounting firm | people and firms | `/admin/qusd/reserves` (two signatures) + examiner fields |
| § 4(a)(5) BSA/AML program, CIP, SAR, sanctions screening | platform controls | qpweb compliance stack (`/transparency` §§ 2-7) |
| § 4(a)(7)-(8) permitted activities, no tying | corporate conduct | policy |
| § 4(f), § 5(i) officer disqualification, annual AML certification | people / filings | Board / CCO |
| § 11 holder priority in insolvency | statutory once licensed | segregation of reserves (treasury) |

## Threat model the contract answers

- **Lost or compromised operational key**: the minter can only burn its own balance and
  cannot touch the blocklist; the owner rotates it with `set-minter`.
- **Lost owner key**: v1 had no recovery at all. v2 owner rotation is two-step, so a wrong
  address never orphans the contract; the owner key is meant to be cold.
- **Sanctioned address receives QUSD**: `block-principal` freezes it in both directions;
  `seize` moves the property to the blocked-property account without changing supply;
  the OFAC § 501.603(b) report is built from the `seize` events.
- **Order to destroy tokens**: `burn-by-order` on a blocked holder, with the order
  reference in the event.
- **Incident**: `pause` halts transfers and issuance; lawful-order actions keep working.
