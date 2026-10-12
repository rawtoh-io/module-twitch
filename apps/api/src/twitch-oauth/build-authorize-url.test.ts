import { describe, expect, it } from "bun:test";
import { buildAuthorizeUrl } from "./build-authorize-url";

describe("buildAuthorizeUrl", () => {
  it("encodes scopes and forces re-consent", () => {
    const url = new URL(buildAuthorizeUrl({ clientId: "cid", redirectUri: "http://x/cb", scopes: ["chat:read", "channel:read:redemptions"], state: "s1" }));
    expect(url.origin + url.pathname).toBe("https://id.twitch.tv/oauth2/authorize");
    expect(url.searchParams.get("scope")).toBe("chat:read channel:read:redemptions");
    expect(url.searchParams.get("state")).toBe("s1");
    expect(url.searchParams.get("force_verify")).toBe("true");
    expect(url.searchParams.get("redirect_uri")).toBe("http://x/cb");
  });
});
