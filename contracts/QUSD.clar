;; SIP-010 Token: QUSD

(impl-trait 'ST1NXBK3K5YYMD6FD41MVNP3JS1GABZ8TRVX023PT.sip-010-trait-ft-standard.sip-010-trait)

;; Constants
(define-constant err-owner-only (err u100))
(define-constant err-not-token-owner (err u101))

;; Data
(define-data-var contract-owner principal tx-sender)

;; Fungible Token
(define-fungible-token QUSD)

;; Mint (only owner)
(define-public (mint (amount uint) (recipient principal))
    (begin
        (asserts! (is-eq tx-sender (var-get contract-owner)) err-owner-only)
        (asserts! (> amount u0) (err u102))
        (ft-mint? QUSD amount recipient)
    )
)

;; Burn (only owner)
(define-public (burn (amount uint) (sender principal))
    (begin
        (asserts! (is-eq tx-sender (var-get contract-owner)) err-owner-only)
        (asserts! (> amount u0) (err u102))
        (ft-burn? QUSD amount sender)
    )
)

;; Transfer (must be called by sender)
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
	(begin
		(asserts! (is-eq tx-sender sender) err-not-token-owner)
		(try! (ft-transfer? QUSD amount sender recipient))
		(match memo to-print (print to-print) 0x)
		(ok true)
	)
)

;; Read-only accessors
(define-read-only (get-name)
    (ok "QvaPay USD")
)
(define-read-only (get-symbol)
    (ok "QUSD")
)
(define-read-only (get-decimals)
    (ok u8)
)
(define-read-only (get-balance (who principal))
    (ok (ft-get-balance QUSD who))
)
(define-read-only (get-total-supply)
    (ok (ft-get-supply QUSD))
)
(define-read-only (get-token-uri)
    (ok (some u"https://qvapay.com/qusd.json"))
)
