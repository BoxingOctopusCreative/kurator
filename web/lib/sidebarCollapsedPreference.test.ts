import { describe, expect, it } from "vitest";
import {
  isLegalDocumentPath,
  parseSidebarCollapsedStored,
  serializeSidebarCollapsed,
} from "@/lib/sidebarCollapsedPreference";

describe("sidebarCollapsedPreference", () => {
  describe("parseSidebarCollapsedStored", () => {
    it("treats 1 as collapsed", () => {
      expect(parseSidebarCollapsedStored("1")).toBe(true);
    });
    it("treats 0 as expanded", () => {
      expect(parseSidebarCollapsedStored("0")).toBe(false);
    });
    it("defaults to expanded for null", () => {
      expect(parseSidebarCollapsedStored(null)).toBe(false);
    });
    it("defaults to expanded for unknown values", () => {
      expect(parseSidebarCollapsedStored("yes")).toBe(false);
    });
  });

  describe("isLegalDocumentPath", () => {
    it("matches privacy, terms, and sitemap routes", () => {
      expect(isLegalDocumentPath("/privacy")).toBe(true);
      expect(isLegalDocumentPath("/terms")).toBe(true);
      expect(isLegalDocumentPath("/sitemap")).toBe(true);
      expect(isLegalDocumentPath("/collections")).toBe(false);
    });
  });

  describe("serializeSidebarCollapsed", () => {
    it("writes 1 when collapsed", () => {
      expect(serializeSidebarCollapsed(true)).toBe("1");
    });
    it("writes 0 when expanded", () => {
      expect(serializeSidebarCollapsed(false)).toBe("0");
    });
  });
});
