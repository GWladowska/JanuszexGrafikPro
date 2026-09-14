import { expect, test } from "@playwright/test";
import { waitForHydration } from "./hydration";

// Ryzyko #1/#2 z context/foundation/test-plan.md: ekran i serwer nie zgadzają się
// co do grafiku — wyrenderowana tablica zmian nie odzwierciedla danych z bazy.
// Ścieżka pod asercją: nawigacja tygodnia w kliencie → GET /api/schedules (ciasteczko
// sesji) → RLS → render Reacta. SSR-owy initialAssignments zasila tylko widok startowy
// (następny tydzień, bez seedowanego grafiku), więc go nie dotyka.
test("seeded draft schedule for the current week renders its assignments", async ({ page }) => {
  await page.goto("/schedules");
  await waitForHydration(page);

  // Strona startuje na NASTĘPNYM tygodniu (src/pages/schedules/index.astro),
  // a seedowany draft jest na bieżący → cofamy o tydzień.
  await page.getByRole("button", { name: "Poprzedni tydzień" }).click();
  await expect(page.getByText("Anna Kowalska · 08:00 – 14:00")).toBeVisible();

  await page.reload();
  await waitForHydration(page);
  await page.getByRole("button", { name: "Poprzedni tydzień" }).click();
  await expect(page.getByText("Anna Kowalska · 08:00 – 14:00")).toBeVisible();
});
