;; SIP-010 Token: QUSD

(impl-trait 'ST1NXBK3K5YYMD6FD41MVNP3JS1GABZ8TRVX023PT.sip-010-trait-ft-standard.sip-010-trait)

;; Constants
(define-constant err-owner-only (err u100))
(define-constant err-not-token-owner (err u101))

;; Data
(define-constant token-decimals u8)
(define-data-var token-name (string-ascii 32) "QvaPay USD")
(define-data-var token-symbol (string-ascii 10) "QUSD")
(define-data-var contract-owner principal tx-sender)
(define-data-var token-uri (optional (string-utf8 256)) (some u"https://qvpay.me/qusd.json"))

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
