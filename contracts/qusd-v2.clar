;; QUSD v2 - SIP-010 fungible token with the controls the GENIUS Act (Pub. L. 119-27)
;; requires from a payment stablecoin issuer:
;;
;;   Sec. 4(a)(6)  technological capability to comply with lawful orders - seize, freeze,
;;              burn or prevent the transfer of payment stablecoins.
;;   Sec. 4(a)(5)  sanctions program: block / reject specific transactions on-chain.
;;
;; Roles (all default to the deployer; the owner reassigns them after deployment):
;;   contract-owner        cold key. Rotates every role (two-step ownership transfer),
;;                         metadata and the blocked-property account.
;;   minter                operational key (TronDealer). Mint on credited deposits,
;;                         burn on completed withdrawals - only from its OWN balance.
;;   compliance-officer    CCO key. Blocklist, seize, burn-by-order, pause.
;;   blocked-property-account
;;                         where seized tokens are held (31 CFR Sec. 501.603 blocked
;;                         property). Can never itself be blocked.
;;
;; Every state change prints a structured event so the ledger, the OFAC blocked-property
;; report and the monthly reserve disclosure can be reconciled from the chain alone.
;; `mint` / `burn` keep the v1 signatures so the existing TronDealer routes work unchanged;
;; `mint-memo` / `burn-memo` carry a 34-byte reference (qusd_ledger id) for row-level
;; reconciliation.

(impl-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

;; ---------------------------------------------------------------------------
;; Errors (u100-u103 identical to v1)
;; ---------------------------------------------------------------------------
(define-constant ERR-OWNER-ONLY (err u100))
(define-constant ERR-NOT-TOKEN-OWNER (err u101))
(define-constant ERR-NOT-ENOUGH-FUND (err u102))
(define-constant ERR-INVALID-PARAMETERS (err u103))
(define-constant ERR-MINTER-ONLY (err u104))
(define-constant ERR-PAUSED (err u105))
(define-constant ERR-BLOCKED (err u106))
(define-constant ERR-NOT-BLOCKED (err u107))
(define-constant ERR-NO-PENDING-OWNER (err u108))
(define-constant ERR-COMPLIANCE-ONLY (err u109))

;; ---------------------------------------------------------------------------
;; Token data
;; ---------------------------------------------------------------------------
(define-constant token-decimals u8)
(define-data-var token-name (string-ascii 32) "QvaPayUSD")
(define-data-var token-symbol (string-ascii 10) "QUSD")
(define-data-var token-uri (optional (string-utf8 256)) (some u"https://qvapay.com/qusd.json"))

(define-fungible-token QUSD)

;; ---------------------------------------------------------------------------
;; Roles and state
;; ---------------------------------------------------------------------------
(define-data-var contract-owner principal tx-sender)
(define-data-var pending-owner (optional principal) none)
(define-data-var minter principal tx-sender)
(define-data-var compliance-officer principal tx-sender)
(define-data-var blocked-property-account principal tx-sender)
(define-data-var paused bool false)

;; Blocklist: principal -> when and why. Presence == blocked.
(define-map blocklist principal { since: uint, reason: (string-ascii 64) })

;; ---------------------------------------------------------------------------
;; Private helpers
;; ---------------------------------------------------------------------------
(define-private (is-owner)
    (is-eq tx-sender (var-get contract-owner))
)
(define-private (is-minter)
    (is-eq tx-sender (var-get minter))
)
;; The owner can always act as compliance officer (cold key as backstop).
(define-private (is-compliance)
    (or (is-owner) (is-eq tx-sender (var-get compliance-officer)))
)
(define-private (blocked? (who principal))
    (is-some (map-get? blocklist who))
)
(define-private (emit-supply-event (event (string-ascii 16)) (amount uint) (account principal) (memo (optional (buff 34))))
    (print {
        event: event,
        amount: amount,
        account: account,
        memo: memo,
        by: tx-sender,
        height: stacks-block-height
    })
)
(define-private (emit-metadata-update)
    (print {
        notification: "token-metadata-update",
        payload: {
            contract-id: (as-contract tx-sender),
            token-class: "ft"
        }
    })
)

;; ---------------------------------------------------------------------------
;; SIP-010: transfer
;; ---------------------------------------------------------------------------
;; Refused while paused, when the caller is not the sender, or when either party is on
;; the blocklist ("prevent the transfer", Sec. 4(a)(6)).
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
    (begin
        (asserts! (not (var-get paused)) ERR-PAUSED)
        (asserts! (is-eq tx-sender sender) ERR-NOT-TOKEN-OWNER)
        (asserts! (not (blocked? sender)) ERR-BLOCKED)
        (asserts! (not (blocked? recipient)) ERR-BLOCKED)
        (try! (ft-transfer? QUSD amount sender recipient))
        (match memo to-print (print to-print) 0x)
        (ok true)
    )
)

;; ---------------------------------------------------------------------------
;; Issuance (minter)
;; ---------------------------------------------------------------------------
(define-public (mint (amount uint) (recipient principal))
    (mint-memo amount recipient none)
)

(define-public (mint-memo (amount uint) (recipient principal) (memo (optional (buff 34))))
    (begin
        (asserts! (is-minter) ERR-MINTER-ONLY)
        (asserts! (not (var-get paused)) ERR-PAUSED)
        (asserts! (> amount u0) ERR-INVALID-PARAMETERS)
        (asserts! (not (blocked? recipient)) ERR-BLOCKED)
        (try! (ft-mint? QUSD amount recipient))
        (emit-supply-event "mint" amount recipient memo)
        (ok true)
    )
)

;; The minter can only burn from its OWN balance: the operational key can never destroy
;; a holder's tokens. Burning a holder's tokens under a lawful order is `burn-by-order`.
(define-public (burn (amount uint) (sender principal))
    (burn-memo amount sender none)
)

(define-public (burn-memo (amount uint) (sender principal) (memo (optional (buff 34))))
    (begin
        (asserts! (is-minter) ERR-MINTER-ONLY)
        (asserts! (is-eq sender tx-sender) ERR-NOT-TOKEN-OWNER)
        (asserts! (> amount u0) ERR-INVALID-PARAMETERS)
        (try! (ft-burn? QUSD amount sender))
        (emit-supply-event "burn" amount sender memo)
        (ok true)
    )
)

;; ---------------------------------------------------------------------------
;; Compliance controls (compliance officer or owner) - GENIUS Sec. 4(a)(6)
;; ---------------------------------------------------------------------------
;; Freeze: the principal can neither send nor receive. `reason` is the internal case
;; reference (never the order text itself - Sec. 501.602 tip-off rules apply off-chain).
(define-public (block-principal (who principal) (reason (string-ascii 64)))
    (begin
        (asserts! (is-compliance) ERR-COMPLIANCE-ONLY)
        (asserts! (not (is-eq who (var-get blocked-property-account))) ERR-INVALID-PARAMETERS)
        (map-set blocklist who { since: stacks-block-height, reason: reason })
        (print { event: "block", account: who, reason: reason, by: tx-sender, height: stacks-block-height })
        (ok true)
    )
)

(define-public (unblock-principal (who principal))
    (begin
        (asserts! (is-compliance) ERR-COMPLIANCE-ONLY)
        (asserts! (blocked? who) ERR-NOT-BLOCKED)
        (map-delete blocklist who)
        (print { event: "unblock", account: who, by: tx-sender, height: stacks-block-height })
        (ok true)
    )
)

;; Seize: move tokens from a blocked principal to the blocked-property account
;; (31 CFR Sec. 501.603). Requires a prior block so a seizure is never a silent transfer.
(define-public (seize (who principal) (amount uint) (order-ref (string-ascii 64)))
    (begin
        (asserts! (is-compliance) ERR-COMPLIANCE-ONLY)
        (asserts! (blocked? who) ERR-NOT-BLOCKED)
        (asserts! (> amount u0) ERR-INVALID-PARAMETERS)
        (try! (ft-transfer? QUSD amount who (var-get blocked-property-account)))
        (print { event: "seize", account: who, amount: amount, to: (var-get blocked-property-account), order-ref: order-ref, by: tx-sender, height: stacks-block-height })
        (ok true)
    )
)

;; Burn under a lawful order (court / authorized agency). Only from a blocked principal.
(define-public (burn-by-order (who principal) (amount uint) (order-ref (string-ascii 64)))
    (begin
        (asserts! (is-compliance) ERR-COMPLIANCE-ONLY)
        (asserts! (blocked? who) ERR-NOT-BLOCKED)
        (asserts! (> amount u0) ERR-INVALID-PARAMETERS)
        (try! (ft-burn? QUSD amount who))
        (print { event: "burn-by-order", account: who, amount: amount, order-ref: order-ref, by: tx-sender, height: stacks-block-height })
        (ok true)
    )
)

;; Global pause: stops transfers and issuance. Compliance actions keep working so a
;; lawful order can be executed while the token is paused.
(define-public (pause)
    (begin
        (asserts! (is-compliance) ERR-COMPLIANCE-ONLY)
        (var-set paused true)
        (print { event: "pause", by: tx-sender, height: stacks-block-height })
        (ok true)
    )
)

(define-public (unpause)
    (begin
        (asserts! (is-compliance) ERR-COMPLIANCE-ONLY)
        (var-set paused false)
        (print { event: "unpause", by: tx-sender, height: stacks-block-height })
        (ok true)
    )
)

;; ---------------------------------------------------------------------------
;; Governance (owner)
;; ---------------------------------------------------------------------------
;; Two-step ownership transfer: the new owner must accept, so a typo can never orphan
;; the contract (v1 had no rotation at all).
(define-public (transfer-ownership (new-owner principal))
    (begin
        (asserts! (is-owner) ERR-OWNER-ONLY)
        (var-set pending-owner (some new-owner))
        (print { event: "ownership-proposed", account: new-owner, by: tx-sender, height: stacks-block-height })
        (ok true)
    )
)

(define-public (accept-ownership)
    (let ((pending (unwrap! (var-get pending-owner) ERR-NO-PENDING-OWNER)))
        (asserts! (is-eq tx-sender pending) ERR-OWNER-ONLY)
        (var-set contract-owner pending)
        (var-set pending-owner none)
        (print { event: "ownership-accepted", account: pending, height: stacks-block-height })
        (ok true)
    )
)

(define-public (set-minter (who principal))
    (begin
        (asserts! (is-owner) ERR-OWNER-ONLY)
        (var-set minter who)
        (print { event: "set-minter", account: who, by: tx-sender, height: stacks-block-height })
        (ok true)
    )
)

(define-public (set-compliance-officer (who principal))
    (begin
        (asserts! (is-owner) ERR-OWNER-ONLY)
        (var-set compliance-officer who)
        (print { event: "set-compliance-officer", account: who, by: tx-sender, height: stacks-block-height })
        (ok true)
    )
)

(define-public (set-blocked-property-account (who principal))
    (begin
        (asserts! (is-owner) ERR-OWNER-ONLY)
        (asserts! (not (blocked? who)) ERR-BLOCKED)
        (var-set blocked-property-account who)
        (print { event: "set-blocked-property-account", account: who, by: tx-sender, height: stacks-block-height })
        (ok true)
    )
)

;; Metadata (owner). Each change emits the SIP-016 metadata-update notification.
(define-public (set-token-uri (value (string-utf8 256)))
    (begin
        (asserts! (is-owner) ERR-OWNER-ONLY)
        (var-set token-uri (some value))
        (ok (emit-metadata-update))
    )
)

(define-public (set-token-name (value (string-ascii 32)))
    (begin
        (asserts! (is-owner) ERR-OWNER-ONLY)
        (var-set token-name value)
        (ok (emit-metadata-update))
    )
)

(define-public (set-token-symbol (value (string-ascii 10)))
    (begin
        (asserts! (is-owner) ERR-OWNER-ONLY)
        (var-set token-symbol value)
        (ok (emit-metadata-update))
    )
)

;; ---------------------------------------------------------------------------
;; Read-only
;; ---------------------------------------------------------------------------
(define-read-only (get-name)
    (ok (var-get token-name))
)
(define-read-only (get-symbol)
    (ok (var-get token-symbol))
)
(define-read-only (get-decimals)
    (ok token-decimals)
)
(define-read-only (get-balance (who principal))
    (ok (ft-get-balance QUSD who))
)
(define-read-only (get-total-supply)
    (ok (ft-get-supply QUSD))
)
(define-read-only (get-token-uri)
    (ok (var-get token-uri))
)
(define-read-only (get-owner)
    (ok (var-get contract-owner))
)
(define-read-only (get-pending-owner)
    (ok (var-get pending-owner))
)
(define-read-only (get-minter)
    (ok (var-get minter))
)
(define-read-only (get-compliance-officer)
    (ok (var-get compliance-officer))
)
(define-read-only (get-blocked-property-account)
    (ok (var-get blocked-property-account))
)
(define-read-only (is-paused)
    (ok (var-get paused))
)
(define-read-only (is-blocked (who principal))
    (ok (blocked? who))
)
(define-read-only (get-block-info (who principal))
    (ok (map-get? blocklist who))
)
