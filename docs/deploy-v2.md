# Despliegue de `qusd-v2` en mainnet — paso a paso

Estado de partida (8 sep 2026): v1 `SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD` con
951.510,65 QUSD en circulación, todo en la wallet deployer salvo 2,10 QUSD en
`SP3GPJR3SSX38HEPCMKCHKTAX4PG5PMA6AV0V5N3Q`. El deployer tiene ~147 STX: sobra para
todo (publicar v2 cuesta < 1 STX; cada llamada, milésimas).

Herramientas: `clarinet` (publica el contrato) y `scripts/call.mjs` (firma y difunde las
llamadas de roles, quema y mint con `@stacks/transactions`). Todo lo que firma la
**misma llave del deployer** va en serie: Stacks no tolera dos transacciones con el mismo
nonce en vuelo. Espera la confirmación de cada una en el explorador antes de la siguiente.

## 0. Decisiones previas (un día antes)

| Llave / cuenta | Quién | Nota |
|---|---|---|
| `owner` (fría) | Erich | hardware wallet o llave fuera de línea; solo rota roles |
| `minter` (caliente) | TronDealer | la que firma `/stx/mint` y `/stx/burn`. Si TronDealer sigue usando la llave del deployer, el minter ES el deployer y no hace falta `set-minter` |
| `compliance-officer` | CCO | firma `block`/`seize`/`burn-by-order`/`pause` |
| `blocked-property-account` | tesorería | wallet NUEVA y vacía, solo para propiedad bloqueada (§ 501.603). Nunca la del minter |

Ten a mano el hex de la llave privada del deployer (`STX_PRIVATE_KEY`) y las direcciones de
las cuatro cuentas. Coordina con qpweb: durante el paso 5 se congelan depósitos y retiros
unos minutos.

## 1. Instalar y comprobar

```bash
brew install clarinet
cd ~/webs/QUSD && npm install
clarinet check          # 3 contratos, 0 errores
npm test                # 28/28
```

## 2. Credenciales de despliegue (git-ignoradas)

`settings/Mainnet.toml`:

```toml
[network]
name = "mainnet"
stacks_node_rpc_address = "https://api.hiro.so"
deployment_fee_rate = 10

[accounts.deployer]
mnemonic = "<24 palabras de SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2>"
```

`settings/Testnet.toml` igual, con `name = "testnet"`, `stacks_node_rpc_address =
"https://api.testnet.hiro.so"` y el mnemonic de `ST14CTSJZNKZ7YTR6C84368J2QXRW8RC20K8V67HB`.

## 3. Ensayo en testnet (recomendado, 20 min)

```bash
clarinet deployments apply -p deployments/default.testnet-plan.yaml
```

Clarinet salta lo que ya exista en cadena (el trait remapeado y `QUSD` v1 si ya se publicó)
y publica `qusd-v2`. Luego, con `--testnet`, repite los pasos 5 a 7 en pequeño:

```bash
export STX_PRIVATE_KEY=<hex deployer testnet>
node scripts/call.mjs mint u100000000 ST14CTSJZNKZ7YTR6C84368J2QXRW8RC20K8V67HB --testnet
node scripts/call.mjs block-principal ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG "ENSAYO" --testnet
node scripts/call.mjs seize ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG u1 "ENSAYO" --testnet   # → err u1: saldo 0, esperado
```

## 4. Publicar v2 en mainnet

```bash
clarinet deployments apply -p deployments/default.mainnet-plan.yaml
```

El batch 0 (`QUSD` v1) ya existe y se salta; el batch 1 publica `qusd-v2`. Confirma en
<https://explorer.hiro.so/txid/…> y comprueba:

```bash
curl -s https://api.hiro.so/v2/contracts/interface/SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2/qusd-v2 | head -c 300
```

Hasta que termine el paso 6 el contrato existe con supply 0 y todos los roles en el deployer.

## 5. Asignar roles (firma: deployer, en serie)

```bash
export STX_PRIVATE_KEY=<hex deployer mainnet>
node scripts/call.mjs set-blocked-property-account SP…BLOQUEADA
node scripts/call.mjs set-compliance-officer SP…CCO
node scripts/call.mjs set-minter SP…HOT            # omitir si TronDealer firma con el deployer
```

La rotación del owner se deja para el paso 8, después del mint inicial: mientras el deployer
sea owner y minter, cualquier corrección es una sola llave.

## 6. Retirar v1 (firma: deployer)

```bash
node scripts/call.mjs burn u95150855000000 SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2 --v1
node scripts/call.mjs burn u210000000 SP3GPJR3SSX38HEPCMKCHKTAX4PG5PMA6AV0V5N3Q --v1
node scripts/call.mjs set-token-uri 'utf8:"https://qvapay.com/qusd-v1-retired.json"' --v1
```

Antes de la tercera, sube en qpweb `public/qusd-v1-retired.json` (copia de `qusd.json` con
`"name": "QvaPayUSD (retired v1)"` y `"description": "Retired. Superseded by
SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.qusd-v2."`). Verifica supply 0:

```bash
curl -s https://api.hiro.so/metadata/v1/ft/SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD | python3 -c "import sys,json;print(json.load(sys.stdin)['total_supply'])"
```

## 7. Mint inicial = pasivo con clientes al corte (firma: minter)

1. En qpweb, `/admin/qusd/reserves` → "Capturar cifras de plataforma" da Σ balances + Σ
   ahorro (o `captureReserveFigures()`). Anota el timestamp: es el corte.
2. Congela depósitos y retiros el minuto de la captura (pausa de los crons `process-withdraw`
   y `qusd-sync`, y del bridge de TronDealer) para que el número no se mueva.
3. Mint a la wallet del minter, en unidades base (USD × 1e8), con memo del corte:

```bash
# ejemplo: 793.033,71 USD → u79303371000000 · memo = "cut:2026-09-30T23:59Z" en hex
node scripts/call.mjs mint-memo u79303371000000 SP…HOT 0x6375743a323032362d30392d33305432333a35395a
```

4. Inserta la fila en `qusd_ledger` (`kind='mint'`, `ref_type='migration'`, `ref_id=<corte>`,
   `status='sent'`, txid) para que `qusd-sync` no la vea como faltante.

## 8. Rotar el owner a la llave fría (firma: deployer, luego fría)

```bash
node scripts/call.mjs transfer-ownership SP…FRIA
STX_PRIVATE_KEY=<hex fría> node scripts/call.mjs accept-ownership
node scripts/call.mjs get-owner   # no aplica: es read-only; compruébalo en el explorador → SP…FRIA
```

Desde aquí el deployer solo es minter (si TronDealer lo usa) y ya no puede tocar roles.

## 9. Encender el ledger en qpweb

1. `scripts/providers/payment/trondealer-qusd.js`: `QUSD_CONTRACT = 'SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.qusd-v2'`.
2. `components/transparency/ReserveDisclosure.js` y `GeniusCompliance.js`: la dirección citada
   pasa a `qusd-v2`; la fila `orders-onchain` de GENIUS pasa a `status: 'live'`.
3. TronDealer: `/stx/mint` y `/stx/burn` contra `qusd-v2` (misma firma de funciones).
4. Vercel: `QUSD_LEDGER_ENABLED=queue`. Reanuda crons y bridge. Vigila `/admin/qusd` un día:
   neto del ledger ≈ supply on-chain ≈ Σ balances. Después `on`.

## 10. Comprobaciones finales

- `get-total-supply` de `qusd-v2` = mint inicial ± movimientos del día.
- Hiro indexa la metadata de `qusd-v2` sola (mismo `token-uri`); si tarda, llama
  `qusd-notifier.ft-metadata-update-notify` o simplemente espera.
- `/transparency/qusd` (informe de septiembre) cita el contrato nuevo; `/transparency/genius`
  muestra § 4(a)(6) onchain como vigente.
- Cierra en `docs/compliance-genius-marketing-checklist.md` (qpweb) las tres promesas de v1.

## Si algo sale mal

- Transacción `abort_by_post_condition`: el script ya usa `PostConditionMode.Allow`; si la
  firmaste desde una wallet, repite con el script.
- Mint a una dirección equivocada: `block-principal` + `seize` desde el CCO (u owner) la
  devuelve a la cuenta de propiedad bloqueada; de ahí a tesorería con `unblock` + `transfer`.
- Llave caliente comprometida: `set-minter` a una nueva desde la fría; el minter nunca pudo
  quemar saldo ajeno ni tocar la blocklist.
