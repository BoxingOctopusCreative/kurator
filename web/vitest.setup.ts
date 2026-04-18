import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Avoid double DOM from React Strict Mode (breaks controlled-input tests).
configure({ reactStrictMode: false });

afterEach(() => {
  cleanup();
});
