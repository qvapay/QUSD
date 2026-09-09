# QUSD — QvaPay USD on Stacks

SIP-010 fungible token that QvaPay, Inc. uses on the Stacks blockchain to mirror the
customer USD balances it holds in custody. It is not legal tender, not a deposit, not
FDIC-insured and not issued or backed by the U.S. government.

- **Token**: `QvaPayUSD` · symbol `QUSD` · 8 decimals · 1 QUSD = 1 USD, redeemable at par
- **Mainnet (v1, live)**: [`SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD`](https://explorer.hiro.so/token/SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD)
- **Mainnet (v2)**: `SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.qusd-v2` — not deployed yet, see [docs/migration-v1-to-v2.md](docs/migration-v1-to-v2.md)
- **Deployer**: mainnet `SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2` · testnet `ST14CTSJZNKZ7YTR6C84368J2QXRW8RC20K8V67HB`
- **Metadata**: [`https://qvapay.com/qusd.json`](https://qvapay.com/qusd.json) (copy in [`qusd.json`](qusd.json))
- **Public disclosures**: [qvapay.com/transparency](https://www.qvapay.com/transparency) · [monthly reserve](https://www.qvapay.com/transparency/qusd) · [GENIUS Act compliance](https://www.qvapay.com/transparency/genius)

## Why two contracts

Clarity contracts are immutable. `QUSD.clar` (v1) is a minimal SIP-010: open transfers,
owner-only mint/burn, and no way to rotate the owner key, freeze an address, seize or pause.
The GENIUS Act (Pub. L. 119-27, § 4(a)(6)) requires a payment stablecoin issuer to have the
technological capability to **seize, freeze, burn or prevent the transfer** of its
stablecoin under a lawful order. `qusd-v2.clar` adds exactly that, keeps the v1 `mint` /
`burn` signatures so the treasury bridge keeps working, and separates the keys.

| | `QUSD` (v1) | `qusd-v2` |
|---|---|---|
| SIP-010 transfer | open | refused while paused or if either party is blocked |
| Mint / burn | owner, from any holder | `minter` role; burn only from its own balance |
| Blocklist (freeze) | — | `block-principal` / `unblock-principal` |
| Seize | — | `seize` → blocked-property account (31 CFR § 501.603) |
| Burn under order | — | `burn-by-order` (blocked holders only) |
| Pause | — | `pause` / `unpause` (compliance actions still work) |
| Owner rotation | impossible | two-step `transfer-ownership` / `accept-ownership` |
| Roles | one key | owner · minter · compliance-officer · blocked-property-account |
| Events | memo only | structured `print` on every state change (mint, burn, block, seize…) |
| Ledger reference | — | `mint-memo` / `burn-memo` carry a 34-byte reference |

Full obligation-by-obligation mapping: [docs/genius-compliance.md](docs/genius-compliance.md).

## Project layout

```
contracts/QUSD.clar            v1 (deployed on mainnet, frozen)
contracts/qusd-v2.clar         v2 (GENIUS controls)
contracts/qusd-notifier.clar   SIP-016 metadata refresh helper (not deployed)
tests/                         vitest + @hirosystems/clarinet-sdk (28 tests)
deployments/                   Clarinet deployment plans (simnet / devnet / testnet / mainnet)
docs/                          GENIUS mapping · v1 → v2 migration runbook
qusd.json                      token metadata served at https://qvapay.com/qusd.json
```

## Development

Requires Node.js ≥ 22. The test runner ships its own simnet; the `clarinet` CLI is only
needed for `clarinet check`, `clarinet console` and real deployments.

```bash
npm install
npm test               # vitest, all three contracts
npm run test:report    # + coverage and cost report
clarinet check         # static analysis (needs the Clarinet CLI)
clarinet console       # REPL on simnet
```

`npm test` regenerates `deployments/default.simnet-plan.yaml` from `Clarinet.toml`; commit
that change when you add a contract.

## qusd-v2 interface

### SIP-010

`transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34)))`
plus `get-name`, `get-symbol`, `get-decimals`, `get-balance`, `get-total-supply`, `get-token-uri`.

### Issuance — `minter`

| Function | Notes |
|---|---|
| `mint (amount) (recipient)` | v1 signature. Refused while paused or to a blocked recipient |
| `mint-memo (amount) (recipient) (memo)` | same, with a ledger reference in the event |
| `burn (amount) (sender)` | v1 signature; `sender` **must be the minter itself** |
| `burn-memo (amount) (sender) (memo)` | same, with reference |

### Compliance — `compliance-officer` (the owner can always act too)

| Function | Notes |
|---|---|
| `block-principal (who) (reason)` | freeze: can neither send nor receive. `reason` = internal case id |
| `unblock-principal (who)` | |
| `seize (who) (amount) (order-ref)` | blocked holder → blocked-property account; supply unchanged |
| `burn-by-order (who) (amount) (order-ref)` | blocked holder only; supply decreases |
| `pause` / `unpause` | stops transfers and minting; seize / burn-by-order keep working |

### Governance — `contract-owner`

`transfer-ownership (new)` → `accept-ownership` (by the proposed owner) · `set-minter` ·
`set-compliance-officer` · `set-blocked-property-account` · `set-token-uri` ·
`set-token-name` · `set-token-symbol`.

### Read-only

`get-owner`, `get-pending-owner`, `get-minter`, `get-compliance-officer`,
`get-blocked-property-account`, `is-paused`, `is-blocked (who)`, `get-block-info (who)`.

### Errors

| Code | Constant | When |
|---|---|---|
| u100 | `ERR-OWNER-ONLY` | governance call by a non-owner; wrong principal accepting ownership |
| u101 | `ERR-NOT-TOKEN-OWNER` | `transfer` where `tx-sender ≠ sender`; minter burning someone else's balance |
| u102 | `ERR-NOT-ENOUGH-FUND` | reserved (the FT primitives return `u1` on insufficient balance) |
| u103 | `ERR-INVALID-PARAMETERS` | zero amount; blocking the blocked-property account |
| u104 | `ERR-MINTER-ONLY` | mint / burn by a non-minter |
| u105 | `ERR-PAUSED` | transfer or mint while paused |
| u106 | `ERR-BLOCKED` | a party is on the blocklist |
| u107 | `ERR-NOT-BLOCKED` | seize / burn-by-order / unblock on a principal that is not blocked |
| u108 | `ERR-NO-PENDING-OWNER` | `accept-ownership` with no proposal |
| u109 | `ERR-COMPLIANCE-ONLY` | compliance call by a principal that is neither officer nor owner |

FT primitive errors propagate unchanged: `u1` insufficient balance, `u2` sender = recipient,
`u3` zero amount.

## Deployment

```bash
clarinet deployments apply -p deployments/default.testnet-plan.yaml
clarinet deployments apply -p deployments/default.mainnet-plan.yaml   # batch 1 = qusd-v2
```

`settings/Mainnet.toml` and `settings/Testnet.toml` hold the deployer mnemonic and are
git-ignored. After deployment, from the deployer key: `set-minter` (TronDealer hot key),
`set-compliance-officer` (CCO key), `set-blocked-property-account` (segregated
blocked-property wallet), then `transfer-ownership` to the cold key and accept it from there.

## License

ISC — QvaPay, Inc.
