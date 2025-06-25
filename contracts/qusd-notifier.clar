(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

;; Refresh the metadata for a FT from a specific contract
(define-public (ft-metadata-update-notify (contract <ft-trait>))
    (ok (print {
        notification: "token-metadata-update",
        payload: {
            contract-id: contract,
            token-class: "ft",
        },
    }))
)