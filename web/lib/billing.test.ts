import { describe, expect, it } from "vitest";
import {
  billingIntervalLabel,
  normalizeBillingInterval,
  proPlanLabel,
} from "./billing";

describe("billing helpers", () => {
  it("normalizes interval aliases", () => {
    expect(normalizeBillingInterval("monthly")).toBe("monthly");
    expect(normalizeBillingInterval("MONTH")).toBe("monthly");
    expect(normalizeBillingInterval("annual")).toBe("annual");
    expect(normalizeBillingInterval("yearly")).toBe("annual");
    expect(normalizeBillingInterval("weekly")).toBeNull();
  });

  it("labels pro plan with cadence", () => {
    expect(proPlanLabel("free", "")).toBe("Free");
    expect(proPlanLabel("pro", "monthly")).toBe("Pro (Monthly)");
    expect(proPlanLabel("pro", "annual")).toBe("Pro (Annual)");
    expect(proPlanLabel("pro", "")).toBe("Pro");
    expect(billingIntervalLabel("annual")).toBe("Annual");
  });
});
