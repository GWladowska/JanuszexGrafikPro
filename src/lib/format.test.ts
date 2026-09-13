import { describe, expect, it } from "vitest";

import { formatRange } from "@/lib/format";

describe("formatRange", () => {
  it("składa zakres godzin z półpauzą", () => {
    expect(formatRange("08:00", "16:00")).toBe("08:00 – 16:00");
  });
});
