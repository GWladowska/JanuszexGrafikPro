import { describe, expect, it } from "vitest";
import { ERROR_UNAUTHORIZED } from "@/lib/http";
import { POST as businessPOST } from "@/pages/api/business/index";
import { POST as employeesPOST } from "@/pages/api/employees/index";
import { callHandler, expectStatus, signUpOwner } from "./helpers";

describe("smoke — okablowanie harnessu integracyjnego", () => {
  it("niezalogowane żądanie dostaje 401 z komunikatem ERROR_UNAUTHORIZED", async () => {
    const res = await callHandler(employeesPOST, {
      method: "POST",
      path: "/api/employees",
      body: { name: "Ktoś", contactEmail: "ktos@example.com" },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe(ERROR_UNAUTHORIZED);
  });

  it("świeży właściciel tworzy biznes przez realną bazę (201)", async () => {
    const { userId, jar } = await signUpOwner("smoke");
    const res = await callHandler(businessPOST, {
      method: "POST",
      path: "/api/business",
      body: { name: "Smoke Kawiarnia" },
      user: { id: userId },
      jar,
    });

    await expectStatus(res, 201, "utworzenie biznesu przez świeżego właściciela");
    const body = (await res.json()) as { business?: { id?: string } };
    expect(body.business?.id).toBeTruthy();
  });
});
