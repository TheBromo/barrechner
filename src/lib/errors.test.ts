import { describe, expect, it } from "vitest";
import { GENERIC_ERROR, userMessage } from "./errors";

describe("user-facing error messages", () => {
  it("shows validation messages thrown by our own code", () => {
    expect(userMessage(new Error("Bitte gib deiner Bar einen Namen."))).toBe("Bitte gib deiner Bar einen Namen.");
  });

  it("shows messages raised by our database functions", () => {
    expect(userMessage({ code: "P0001", message: "Maximal fünf aktive Bars sind erlaubt" })).toBe("Maximal fünf aktive Bars sind erlaubt");
  });

  it("hides other database, auth and storage errors", () => {
    expect(userMessage({ code: "42702", message: 'column reference "old_slug" is ambiguous' })).toBe(GENERIC_ERROR);
    expect(userMessage(Object.assign(new Error("Database error creating new user"), { __isAuthError: true, code: "unexpected_failure" }))).toBe(GENERIC_ERROR);
    expect(userMessage(Object.assign(new Error("The resource was not found"), { __isStorageError: true }))).toBe(GENERIC_ERROR);
  });

  it("hides programming errors", () => {
    expect(userMessage(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(GENERIC_ERROR);
    expect(userMessage("boom", "Fallback")).toBe("Fallback");
  });

  it("explains slug conflicts", () => {
    expect(userMessage({ code: "23505", message: 'duplicate key value violates unique constraint "bars_slug_key"' })).toBe("Diese Adresse ist bereits vergeben.");
  });
});
