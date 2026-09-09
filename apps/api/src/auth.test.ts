import { describe, expect, test } from "bun:test";
import { authMode, fetchUserByCookie } from "./auth";

const me = {
  user: { id: "u1", name: "Ada", email: "ada@x.io", image: null },
  organizations: [{ id: "o1", name: "Org", slug: "org", logo: null, role: "owner" }],
};

describe("cookie SSO", () => {
  test("no client id means cookie mode", () => {
    expect(authMode).toBe("cookie");
  });

  test("maps /api/me to the userinfo shape and caches per cookie", async () => {
    let calls = 0;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls++;
      expect(url).toEndWith("/api/me");
      expect(new Headers(init?.headers).get("cookie")).toBe("sid=a");
      return Response.json(me);
    }) as typeof fetch;

    const user = await fetchUserByCookie("sid=a");
    expect(user).toEqual({
      sub: "u1",
      name: "Ada",
      email: "ada@x.io",
      picture: undefined,
      organizations: [{ id: "o1", name: "Org", slug: "org", logo: undefined, role: "owner" }],
    });
    await fetchUserByCookie("sid=a");
    expect(calls).toBe(1);
  });

  test("401 means nobody", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 401 })) as unknown as typeof fetch;
    expect(await fetchUserByCookie("sid=b")).toBeNull();
  });
});
