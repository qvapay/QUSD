import { describe, expect, it } from "vitest";
import { ClarityValue, uintCV, someCV, noneCV, stringAsciiCV, stringUtf8CV, standardPrincipalCV, bufferCV, boolCV } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

/*
  The test below is an example. To learn more, read the testing documentation here:
  https://docs.hiro.so/stacks/clarinet-js-sdk
*/

describe("QUSD Contract Tests", () => {
  it("ensures simnet is well initialised", () => {
    expect(simnet.blockHeight).toBeDefined();
  });

  it("should have correct token metadata", () => {
    const { result: name } = simnet.callReadOnlyFn(
      "QUSD",
      "get-name",
      [],
      deployer
    );
    expect(name).toBeOk(stringAsciiCV("QvaPay USD"));

    const { result: symbol } = simnet.callReadOnlyFn(
      "QUSD",
      "get-symbol",
      [],
      deployer
    );
    expect(symbol).toBeOk(stringAsciiCV("QUSD"));

    const { result: decimals } = simnet.callReadOnlyFn(
      "QUSD",
      "get-decimals",
      [],
      deployer
    );
    expect(decimals).toBeOk(uintCV(8));

    const { result: totalSupply } = simnet.callReadOnlyFn(
      "QUSD",
      "get-total-supply",
      [],
      deployer
    );
    expect(totalSupply).toBeOk(uintCV(0));

    const { result: tokenUri } = simnet.callReadOnlyFn(
      "QUSD",
      "get-token-uri",
      [],
      deployer
    );
    expect(tokenUri).toBeOk(someCV(stringUtf8CV("https://qvpay.me/qusd.json")));
  });

  it("should allow deployer to mint tokens", () => {
    const mintAmount = 1000000; // 1 QUSD with 6 decimals
    const { result } = simnet.callPublicFn(
      "QUSD",
      "mint",
      [uintCV(mintAmount), standardPrincipalCV(wallet1)],
      deployer
    );
    expect(result).toBeOk(boolCV(true));

    const { result: balance } = simnet.callReadOnlyFn(
      "QUSD",
      "get-balance",
      [standardPrincipalCV(wallet1)],
      deployer
    );
    expect(balance).toBeOk(uintCV(mintAmount));

    const { result: totalSupply } = simnet.callReadOnlyFn(
      "QUSD",
      "get-total-supply",
      [],
      deployer
    );
    expect(totalSupply).toBeOk(uintCV(mintAmount));
  });

  it("should not allow non-deployer to mint tokens", () => {
    const mintAmount = 1000000;
    const { result } = simnet.callPublicFn(
      "QUSD",
      "mint",
      [uintCV(mintAmount), standardPrincipalCV(wallet2)],
      wallet1
    );
    expect(result).toBeErr(uintCV(100)); // err-owner-only
  });

  it("should allow deployer to burn tokens", () => {
    // First mint some tokens
    const mintAmount = 1000000;
    simnet.callPublicFn("QUSD", "mint", [uintCV(mintAmount), standardPrincipalCV(wallet1)], deployer);

    // Then burn half of them
    const burnAmount = 500000;
    const { result } = simnet.callPublicFn(
      "QUSD",
      "burn",
      [uintCV(burnAmount), standardPrincipalCV(wallet1)],
      deployer
    );
    expect(result).toBeOk(boolCV(true));

    const { result: balance } = simnet.callReadOnlyFn(
      "QUSD",
      "get-balance",
      [standardPrincipalCV(wallet1)],
      deployer
    );
    expect(balance).toBeOk(uintCV(500000));

    const { result: totalSupply } = simnet.callReadOnlyFn(
      "QUSD",
      "get-total-supply",
      [],
      deployer
    );
    expect(totalSupply).toBeOk(uintCV(500000));
  });

  it("should not allow non-deployer to burn tokens", () => {
    const burnAmount = 100000;
    const { result } = simnet.callPublicFn(
      "QUSD",
      "burn",
      [uintCV(burnAmount), standardPrincipalCV(wallet1)],
      wallet2
    );
    expect(result).toBeErr(uintCV(100)); // err-owner-only
  });

  it("should allow token holder to transfer tokens", () => {
    // First mint some tokens to wallet1
    const mintAmount = 1000000;
    simnet.callPublicFn("QUSD", "mint", [uintCV(mintAmount), standardPrincipalCV(wallet1)], deployer);

    // Transfer tokens from wallet1 to wallet2
    const transferAmount = 300000;
    const { result } = simnet.callPublicFn(
      "QUSD",
      "transfer",
      [uintCV(transferAmount), standardPrincipalCV(wallet1), standardPrincipalCV(wallet2), noneCV()],
      wallet1
    );
    expect(result).toBeOk(boolCV(true));

    const { result: balance1 } = simnet.callReadOnlyFn(
      "QUSD",
      "get-balance",
      [standardPrincipalCV(wallet1)],
      deployer
    );
    expect(balance1).toBeOk(uintCV(700000));

    const { result: balance2 } = simnet.callReadOnlyFn(
      "QUSD",
      "get-balance",
      [standardPrincipalCV(wallet2)],
      deployer
    );
    expect(balance2).toBeOk(uintCV(300000));
  });

  it("should not allow non-token-holder to transfer tokens", () => {
    // First mint some tokens to wallet1
    const mintAmount = 1000000;
    simnet.callPublicFn("QUSD", "mint", [uintCV(mintAmount), standardPrincipalCV(wallet1)], deployer);

    // Try to transfer from wallet1 to wallet2 using wallet2 as sender
    const transferAmount = 300000;
    const { result } = simnet.callPublicFn(
      "QUSD",
      "transfer",
      [uintCV(transferAmount), standardPrincipalCV(wallet1), standardPrincipalCV(wallet2), noneCV()],
      wallet2
    );
    expect(result).toBeErr(uintCV(101)); // err-not-token-owner
  });

  it("should handle transfer with memo", () => {
    // First mint some tokens to wallet1
    const mintAmount = 1000000;
    simnet.callPublicFn("QUSD", "mint", [uintCV(mintAmount), standardPrincipalCV(wallet1)], deployer);

    // Transfer with memo
    const transferAmount = 100000;
    const memo = "0x74657374206d656d6f"; // "test memo" in hex
    const { result } = simnet.callPublicFn(
      "QUSD",
      "transfer",
      [uintCV(transferAmount), standardPrincipalCV(wallet1), standardPrincipalCV(wallet2), someCV(bufferCV(Buffer.from("test memo", "utf8")))],
      wallet1
    );
    expect(result).toBeOk(boolCV(true));
  });
});
