import { expect, type Page } from "@playwright/test";

// `ssr` znika z <astro-island> dopiero po hydratacji (astro/dist/runtime/server/astro-island.js:189).
// Bez tego czekania fill/click trafia w SSR, a React nadpisuje wpisaną wartość kontrolowanego inputa.
export async function waitForHydration(page: Page): Promise<void> {
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}
