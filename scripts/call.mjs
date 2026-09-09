// Firma y difunde una llamada a qusd-v2 (o a QUSD v1) desde la línea de comandos.
//
//   STX_PRIVATE_KEY=<hex> node scripts/call.mjs <function> [args...] [--v1] [--testnet] [--dry] [--fee=<uSTX>]
//
// Argumentos por prefijo:  u123 → uint · SP…/ST… → principal · none → (optional none)
//                          "texto" → string-ascii · utf8:"…" → string-utf8 · 0x… → buff (opcional some)
// Ejemplos:
//   node scripts/call.mjs set-minter SP2HOTKEY…
//   node scripts/call.mjs block-principal SP3BAD… "OFAC-2026-001"
//   node scripts/call.mjs mint-memo u100000000 SP2HOTKEY… 0x6d6967726174696f6e
//   node scripts/call.mjs burn u95150855000000 SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2 --v1
// --dry construye y muestra la transacción sin difundirla (no consulta nonce ni saldo).

import { makeContractCall, broadcastTransaction, Cl, AnchorMode, PostConditionMode, getAddressFromPrivateKey } from '@stacks/transactions'

const argv = process.argv.slice(2)
const flags = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true] }))
const [fn, ...rawArgs] = argv.filter(a => !a.startsWith('--'))
if (!fn) { console.error('uso: node scripts/call.mjs <function> [args...] [--v1] [--testnet] [--dry] [--fee=uSTX]'); process.exit(1) }

const network = flags.testnet ? 'testnet' : 'mainnet'
const contractAddress = flags.testnet ? 'ST14CTSJZNKZ7YTR6C84368J2QXRW8RC20K8V67HB' : 'SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2'
const contractName = flags.v1 ? 'QUSD' : 'qusd-v2'

const parse = (a) => {
	if (a === 'none') return Cl.none()
	if (/^u\d+$/.test(a)) return Cl.uint(a.slice(1))
	if (/^S[PT][0-9A-Z]{28,41}(\.[a-z0-9-]+)?$/.test(a)) return Cl.principal(a)
	if (/^0x[0-9a-fA-F]*$/.test(a)) return Cl.some(Cl.bufferFromHex(a.slice(2)))
	if (a.startsWith('utf8:')) return Cl.stringUtf8(a.slice(5).replace(/^"|"$/g, ''))
	return Cl.stringAscii(a.replace(/^"|"$/g, ''))
}
const functionArgs = rawArgs.map(parse)

const senderKey = process.env.STX_PRIVATE_KEY
if (!senderKey) { console.error('falta STX_PRIVATE_KEY (hex, 64 o 66 chars)'); process.exit(1) }
const sender = getAddressFromPrivateKey(senderKey, network)

const opts = {
	contractAddress, contractName, functionName: fn, functionArgs,
	senderKey, network, anchorMode: AnchorMode.Any,
	// Las llamadas de tesorería mueven el token del propio contrato: sin post-conditions estrictas
	// una transferencia/quema fallaría por `abort_by_post_condition` (pasó en 2025 con v1).
	postConditionMode: PostConditionMode.Allow,
}
if (flags.fee) opts.fee = BigInt(flags.fee)
if (flags.dry) { opts.nonce = 0n; opts.fee = opts.fee ?? 1000n }

const tx = await makeContractCall(opts)
console.log(`${network} · ${contractAddress}.${contractName}::${fn}(${rawArgs.join(', ')}) · sender ${sender}`)
if (flags.dry) { console.log(`dry-run · ${tx.serialize().length} bytes · txid ${tx.txid()}`); process.exit(0) }

const res = await broadcastTransaction({ transaction: tx, network })
if (res.error) { console.error('rechazada:', res.error, res.reason || '', res.reason_data || ''); process.exit(2) }
console.log(`difundida · txid ${res.txid}`)
console.log(`https://explorer.hiro.so/txid/${res.txid}${flags.testnet ? '?chain=testnet' : ''}`)
