import { describe, expect, it } from "vitest";
import { Cl, cvToString } from "@stacks/transactions";

// Simnet is re-initialised before every test (clarinet-sdk vitest setup), so each test
// starts from supply 0 with every role assigned to the deployer.
const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;
const wallet4 = accounts.get("wallet_4")!;

const C = "qusd-v2";
const ONE = 100_000_000; // 1 QUSD (8 decimals)

const ro = (fn: string, args: any[] = [], sender = deployer) => simnet.callReadOnlyFn(C, fn, args, sender).result;
const call = (fn: string, args: any[], sender: string) => simnet.callPublicFn(C, fn, args, sender);
const mint = (amount: number, to: string, sender = deployer) => call("mint", [Cl.uint(amount), Cl.principal(to)], sender);
const block = (who: string, sender = deployer) => call("block-principal", [Cl.principal(who), Cl.stringAscii("CASE-1")], sender);
const balance = (who: string) => ro("get-balance", [Cl.principal(who)]);
const printed = (events: any[], needle: string) =>
  events.some((e) => e.event === "print_event" && cvToString(e.data.value).includes(needle));

describe("qusd-v2 · metadata and roles", () => {
  it("keeps the v1 token identity (name, symbol, 8 decimals, supply 0)", () => {
    expect(ro("get-name")).toBeOk(Cl.stringAscii("QvaPayUSD"));
    expect(ro("get-symbol")).toBeOk(Cl.stringAscii("QUSD"));
    expect(ro("get-decimals")).toBeOk(Cl.uint(8));
    expect(ro("get-total-supply")).toBeOk(Cl.uint(0));
    expect(ro("get-token-uri")).toBeOk(Cl.some(Cl.stringUtf8("https://qvapay.com/qusd.json")));
  });

  it("assigns every role to the deployer and starts unpaused", () => {
    expect(ro("get-owner")).toBeOk(Cl.principal(deployer));
    expect(ro("get-minter")).toBeOk(Cl.principal(deployer));
    expect(ro("get-compliance-officer")).toBeOk(Cl.principal(deployer));
    expect(ro("get-blocked-property-account")).toBeOk(Cl.principal(deployer));
    expect(ro("get-pending-owner")).toBeOk(Cl.none());
    expect(ro("is-paused")).toBeOk(Cl.bool(false));
  });

  it("only the owner edits metadata, and each edit emits the SIP-016 notification", () => {
    expect(call("set-token-uri", [Cl.stringUtf8("https://x/y.json")], wallet1).result).toBeErr(Cl.uint(100));
    const { result, events } = call("set-token-uri", [Cl.stringUtf8("https://x/y.json")], deployer);
    expect(result).toBeOk(expect.anything());
    expect(printed(events, "token-metadata-update")).toBe(true);
    expect(ro("get-token-uri")).toBeOk(Cl.some(Cl.stringUtf8("https://x/y.json")));
    expect(call("set-token-name", [Cl.stringAscii("QvaPay USD")], deployer).result).toBeOk(expect.anything());
    expect(ro("get-name")).toBeOk(Cl.stringAscii("QvaPay USD"));
  });
});

describe("qusd-v2 · issuance", () => {
  it("minter mints (v1 signature) and the supply event carries the recipient", () => {
    const { result, events } = mint(ONE, wallet1);
    expect(result).toBeOk(Cl.bool(true));
    expect(balance(wallet1)).toBeOk(Cl.uint(ONE));
    expect(ro("get-total-supply")).toBeOk(Cl.uint(ONE));
    expect(printed(events, "mint")).toBe(true);
  });

  it("mint-memo carries the ledger reference in the event", () => {
    const memo = Cl.some(Cl.bufferFromUtf8("qusd_ledger:42"));
    const { result, events } = call("mint-memo", [Cl.uint(ONE), Cl.principal(wallet1), memo], deployer);
    expect(result).toBeOk(Cl.bool(true));
    expect(printed(events, "qusd_ledger:42") || printed(events, "0x717573645f6c65646765723a3432")).toBe(true);
  });

  it("refuses mint from a non-minter, of zero, or to a blocked principal", () => {
    expect(mint(ONE, wallet1, wallet1).result).toBeErr(Cl.uint(104));
    expect(mint(0, wallet1).result).toBeErr(Cl.uint(103));
    block(wallet2);
    expect(mint(ONE, wallet2).result).toBeErr(Cl.uint(106));
  });

  it("minter burns only its own balance; a holder's tokens are out of reach", () => {
    mint(ONE, deployer);
    mint(ONE, wallet1);
    expect(call("burn", [Cl.uint(ONE / 2), Cl.principal(deployer)], deployer).result).toBeOk(Cl.bool(true));
    expect(balance(deployer)).toBeOk(Cl.uint(ONE / 2));
    expect(call("burn", [Cl.uint(ONE), Cl.principal(wallet1)], deployer).result).toBeErr(Cl.uint(101));
    expect(call("burn", [Cl.uint(ONE), Cl.principal(wallet1)], wallet1).result).toBeErr(Cl.uint(104));
    expect(ro("get-total-supply")).toBeOk(Cl.uint(ONE + ONE / 2));
  });

  it("a rotated minter takes over and the old one loses the right", () => {
    expect(call("set-minter", [Cl.principal(wallet3)], wallet1).result).toBeErr(Cl.uint(100));
    expect(call("set-minter", [Cl.principal(wallet3)], deployer).result).toBeOk(Cl.bool(true));
    expect(mint(ONE, wallet1, wallet3).result).toBeOk(Cl.bool(true));
    expect(mint(ONE, wallet1, deployer).result).toBeErr(Cl.uint(104));
  });
});

describe("qusd-v2 · transfer", () => {
  it("holder transfers; a third party cannot move someone else's tokens", () => {
    mint(ONE, wallet1);
    expect(call("transfer", [Cl.uint(ONE / 4), Cl.principal(wallet1), Cl.principal(wallet2), Cl.none()], wallet1).result).toBeOk(Cl.bool(true));
    expect(balance(wallet2)).toBeOk(Cl.uint(ONE / 4));
    expect(call("transfer", [Cl.uint(ONE / 4), Cl.principal(wallet1), Cl.principal(wallet2), Cl.none()], wallet2).result).toBeErr(Cl.uint(101));
  });

  it("prints the memo when present", () => {
    mint(ONE, wallet1);
    const memo = Cl.some(Cl.bufferFromUtf8("invoice-7"));
    const { result, events } = call("transfer", [Cl.uint(ONE / 4), Cl.principal(wallet1), Cl.principal(wallet2), memo], wallet1);
    expect(result).toBeOk(Cl.bool(true));
    expect(events.some((e) => e.event === "print_event")).toBe(true);
  });

  it("is refused when the sender or the recipient is blocked (§ 4(a)(6) prevent transfer)", () => {
    mint(ONE, wallet1);
    mint(ONE, wallet2);
    block(wallet1);
    expect(call("transfer", [Cl.uint(1), Cl.principal(wallet1), Cl.principal(wallet2), Cl.none()], wallet1).result).toBeErr(Cl.uint(106));
    expect(call("transfer", [Cl.uint(1), Cl.principal(wallet2), Cl.principal(wallet1), Cl.none()], wallet2).result).toBeErr(Cl.uint(106));
    call("unblock-principal", [Cl.principal(wallet1)], deployer);
    expect(call("transfer", [Cl.uint(1), Cl.principal(wallet1), Cl.principal(wallet2), Cl.none()], wallet1).result).toBeOk(Cl.bool(true));
  });
});

describe("qusd-v2 · compliance controls", () => {
  it("only compliance (or the owner) blocks; a random wallet gets u109", () => {
    expect(block(wallet2, wallet1).result).toBeErr(Cl.uint(109));
    const { result, events } = block(wallet2);
    expect(result).toBeOk(Cl.bool(true));
    expect(printed(events, "block")).toBe(true);
    expect(ro("is-blocked", [Cl.principal(wallet2)])).toBeOk(Cl.bool(true));
    const info = ro("get-block-info", [Cl.principal(wallet2)]);
    expect(cvToString(info)).toContain("CASE-1");
  });

  it("unblock needs a prior block; the blocked-property account can never be blocked", () => {
    expect(call("unblock-principal", [Cl.principal(wallet2)], deployer).result).toBeErr(Cl.uint(107));
    expect(block(deployer).result).toBeErr(Cl.uint(103)); // deployer is the default blocked-property account
    call("set-blocked-property-account", [Cl.principal(wallet4)], deployer);
    expect(block(wallet4).result).toBeErr(Cl.uint(103));
    expect(block(deployer).result).toBeOk(Cl.bool(true));
  });

  it("seize moves tokens from a blocked principal to the blocked-property account, with an order reference", () => {
    call("set-blocked-property-account", [Cl.principal(wallet4)], deployer);
    mint(ONE, wallet1);
    expect(call("seize", [Cl.principal(wallet1), Cl.uint(ONE), Cl.stringAscii("OFAC-2026-001")], deployer).result).toBeErr(Cl.uint(107));
    block(wallet1);
    const { result, events } = call("seize", [Cl.principal(wallet1), Cl.uint(ONE), Cl.stringAscii("OFAC-2026-001")], deployer);
    expect(result).toBeOk(Cl.bool(true));
    expect(printed(events, "OFAC-2026-001")).toBe(true);
    expect(balance(wallet1)).toBeOk(Cl.uint(0));
    expect(balance(wallet4)).toBeOk(Cl.uint(ONE));
    expect(ro("get-total-supply")).toBeOk(Cl.uint(ONE)); // seize never changes supply
  });

  it("burn-by-order destroys a blocked holder's tokens and reduces supply", () => {
    mint(ONE, wallet1);
    expect(call("burn-by-order", [Cl.principal(wallet1), Cl.uint(ONE), Cl.stringAscii("COURT-77")], deployer).result).toBeErr(Cl.uint(107));
    block(wallet1);
    expect(call("burn-by-order", [Cl.principal(wallet1), Cl.uint(ONE), Cl.stringAscii("COURT-77")], wallet2).result).toBeErr(Cl.uint(109));
    const { result, events } = call("burn-by-order", [Cl.principal(wallet1), Cl.uint(ONE), Cl.stringAscii("COURT-77")], deployer);
    expect(result).toBeOk(Cl.bool(true));
    expect(printed(events, "COURT-77")).toBe(true);
    expect(ro("get-total-supply")).toBeOk(Cl.uint(0));
  });

  it("pause stops transfers and minting but not lawful-order actions", () => {
    mint(ONE, wallet1);
    expect(call("pause", [], wallet1).result).toBeErr(Cl.uint(109));
    expect(call("pause", [], deployer).result).toBeOk(Cl.bool(true));
    expect(ro("is-paused")).toBeOk(Cl.bool(true));
    expect(call("transfer", [Cl.uint(1), Cl.principal(wallet1), Cl.principal(wallet2), Cl.none()], wallet1).result).toBeErr(Cl.uint(105));
    expect(mint(ONE, wallet1).result).toBeErr(Cl.uint(105));
    block(wallet1);
    expect(call("seize", [Cl.principal(wallet1), Cl.uint(ONE / 2), Cl.stringAscii("X")], deployer).result).toBeOk(Cl.bool(true));
    expect(call("burn-by-order", [Cl.principal(wallet1), Cl.uint(ONE / 2), Cl.stringAscii("X")], deployer).result).toBeOk(Cl.bool(true));
    expect(call("unpause", [], deployer).result).toBeOk(Cl.bool(true));
    expect(mint(ONE, wallet2).result).toBeOk(Cl.bool(true));
  });

  it("a dedicated compliance officer can block but cannot mint or rotate roles", () => {
    expect(call("set-compliance-officer", [Cl.principal(wallet3)], deployer).result).toBeOk(Cl.bool(true));
    expect(block(wallet1, wallet3).result).toBeOk(Cl.bool(true));
    expect(mint(ONE, wallet2, wallet3).result).toBeErr(Cl.uint(104));
    expect(call("set-minter", [Cl.principal(wallet3)], wallet3).result).toBeErr(Cl.uint(100));
    // The owner keeps the compliance powers as a backstop.
    expect(block(wallet2, deployer).result).toBeOk(Cl.bool(true));
  });
});

describe("qusd-v2 · ownership", () => {
  it("rotates in two steps: propose, then the new owner accepts", () => {
    expect(call("accept-ownership", [], wallet1).result).toBeErr(Cl.uint(108));
    expect(call("transfer-ownership", [Cl.principal(wallet1)], wallet2).result).toBeErr(Cl.uint(100));
    expect(call("transfer-ownership", [Cl.principal(wallet1)], deployer).result).toBeOk(Cl.bool(true));
    expect(ro("get-pending-owner")).toBeOk(Cl.some(Cl.principal(wallet1)));
    expect(call("accept-ownership", [], wallet2).result).toBeErr(Cl.uint(100));
    expect(call("accept-ownership", [], wallet1).result).toBeOk(Cl.bool(true));
    expect(ro("get-owner")).toBeOk(Cl.principal(wallet1));
    expect(ro("get-pending-owner")).toBeOk(Cl.none());
    // Old owner lost governance; new owner has it.
    expect(call("set-minter", [Cl.principal(wallet3)], deployer).result).toBeErr(Cl.uint(100));
    expect(call("set-minter", [Cl.principal(wallet3)], wallet1).result).toBeOk(Cl.bool(true));
  });
});
