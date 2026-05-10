import { describe, expect, it } from "vitest";
import { APP_NAV_LINKS, LOGOUT_ACTION } from "@/components/navigation/AppHeader";

describe("AppHeader navigation", () => {
  it("exposes hamburger dropdown links", () => {
    expect(APP_NAV_LINKS.map((link) => link.label)).toEqual(["Dashboard", "Reports", "Runs", "Costs", "Testing", "Settings"]);
  });

  it("includes a runs destination and logout action", () => {
    expect(APP_NAV_LINKS.some((link) => link.href === "/runs")).toBe(true);
    expect(APP_NAV_LINKS.some((link) => link.href === "/costs")).toBe(true);
    expect(APP_NAV_LINKS.some((link) => link.href === "/testing")).toBe(true);
    expect(LOGOUT_ACTION).toBe("/api/auth/logout");
  });
});
