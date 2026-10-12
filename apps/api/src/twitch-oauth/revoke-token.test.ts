import { afterEach, describe, expect, it, mock } from "bun:test";
import { revokeTwitchToken } from "./revoke-token";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("revokeTwitchToken", () => {
  it("posts client_id and token as form data", async () => {
    let captured: { url: string; body: string } | undefined;
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), body: String(init?.body) };
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    expect(await revokeTwitchToken("cid", "tok")).toBe(true);
    expect(captured?.url).toBe("https://id.twitch.tv/oauth2/revoke");
    expect(captured?.body).toBe("client_id=cid&token=tok");
  });

  it("returns false when Twitch rejects the token", async () => {
    globalThis.fetch = mock(async () => new Response(null, { status: 400 })) as unknown as typeof fetch;
    expect(await revokeTwitchToken("cid", "stale")).toBe(false);
  });
});
