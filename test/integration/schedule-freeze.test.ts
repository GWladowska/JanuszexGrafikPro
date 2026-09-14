import { afterEach, describe, expect, it, vi } from "vitest";
import { ERROR_WEEK_FROZEN } from "@/lib/http";
import { POST as schedulePOST } from "@/pages/api/schedules/index";
import { callHandler, createBusiness, signUpOwner, type CookieJar } from "./helpers";

function freezeAt(iso: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

interface FreezeWorld {
  userId: string;
  jar: CookieJar;
}

async function freezeWorld(prefix: string): Promise<FreezeWorld> {
  const { userId, jar } = await signUpOwner(prefix);
  await createBusiness(jar, userId);
  return { userId, jar };
}

async function createResult(
  world: FreezeWorld,
  weekStart: string,
): Promise<{ status: number; body: { error?: string } }> {
  const res = await callHandler(schedulePOST, {
    method: "POST",
    path: "/api/schedules",
    body: { weekStart },
    user: { id: world.userId },
    jar: world.jar,
  });
  return { status: res.status, body: (await res.json()) as { error?: string } };
}

describe("ryzyko #3 — bramka zamrożenia grafiku (Europe/Warsaw, fake timers)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("poniedziałek po przełomie DST: bieżący tydzień zamrożony, następny otwarty", async () => {
    freezeAt("2026-03-30T08:00:00Z");
    const world = await freezeWorld("freeze-dst");

    const frozen = await createResult(world, "2026-03-30");
    expect(frozen.status).toBe(409);
    expect(frozen.body.error).toBe(ERROR_WEEK_FROZEN);

    const open = await createResult(world, "2026-04-06");
    expect(open.status).toBe(201);
  });

  it("niedziela 22:30 UTC: Warszawa jest już w poniedziałku (lekcja stref)", async () => {
    freezeAt("2026-03-29T22:30:00Z");
    const world = await freezeWorld("freeze-sunday");

    const frozen = await createResult(world, "2026-03-30");
    expect(frozen.status).toBe(409);
    expect(frozen.body.error).toBe(ERROR_WEEK_FROZEN);

    const open = await createResult(world, "2026-04-06");
    expect(open.status).toBe(201);
  });

  it("zwykły tydzień: bieżący zamrożony, następny otwarty", async () => {
    freezeAt("2026-04-13T08:00:00Z");
    const world = await freezeWorld("freeze-plain");

    const frozen = await createResult(world, "2026-04-13");
    expect(frozen.status).toBe(409);
    expect(frozen.body.error).toBe(ERROR_WEEK_FROZEN);

    const open = await createResult(world, "2026-04-20");
    expect(open.status).toBe(201);
  });
});
