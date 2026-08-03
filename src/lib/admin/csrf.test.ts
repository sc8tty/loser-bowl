import { describe, expect, it } from "vitest";

import { isAllowedAdminOrigin } from "./csrf";

describe("admin CSRF origin checks", () => {
  it("accepts the same request origin", () => {
    expect(
      isAllowedAdminOrigin({
        origin: "https://loserbowl.landermedia.com",
        requestUrl: "https://loserbowl.landermedia.com/api/admin/sync",
        host: "loserbowl.landermedia.com",
        forwardedHost: null,
        forwardedProto: null,
      }),
    ).toBe(true);
  });

  it("accepts forwarded host and protocol from a deployment proxy", () => {
    expect(
      isAllowedAdminOrigin({
        origin: "https://loserbowl.landermedia.com",
        requestUrl: "https://loser-bowl.vercel.app/api/admin/sync",
        host: "loser-bowl.vercel.app",
        forwardedHost: "loserbowl.landermedia.com",
        forwardedProto: "https",
      }),
    ).toBe(true);
  });

  it("rejects missing, invalid, or cross-site origins", () => {
    const base = {
      requestUrl: "https://loserbowl.landermedia.com/api/admin/sync",
      host: "loserbowl.landermedia.com",
      forwardedHost: null,
      forwardedProto: null,
    };

    expect(isAllowedAdminOrigin({ ...base, origin: null })).toBe(false);
    expect(isAllowedAdminOrigin({ ...base, origin: "not a url" })).toBe(false);
    expect(
      isAllowedAdminOrigin({
        ...base,
        origin: "https://example.com",
      }),
    ).toBe(false);
  });
});
