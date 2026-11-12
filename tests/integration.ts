import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { uid } from "../lib/claimpilot/seed";
const port = 3217,
  base = `http://localhost:${port}`;
let server: ChildProcess, dir: string, browser: Browser;
let serverOutput = "";
before(
  async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "claimpilot-integration-"));
    server = spawn(
      "node",
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--webpack",
        "--port",
        String(port),
      ],
      {
        cwd: process.cwd(),
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          CLAIMPILOT_STORAGE: "local",
          CLAIMPILOT_DATA_DIR: dir,
          APP_PASSCODE: "integration-only",
          APP_SESSION_SECRET: "integration-session-secret",
          GEMINI_API_KEY: "",
          NEXT_TELEMETRY_DISABLED: "1",
          NEXT_TEST_WASM: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    server.stdout?.on("data", (b) => {
      serverOutput += b.toString();
    });
    server.stderr?.on("data", (b) => {
      serverOutput += b.toString();
    });
    for (let i = 0; i < 90; i++) {
      if (server.exitCode !== null || server.signalCode !== null)
        throw new Error("Test server exited: " + serverOutput.slice(-2000));
      if (!serverOutput.includes("Ready in")) {
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }
      try {
        if (
          (
            await fetch(`${base}/api/health`, {
              signal: AbortSignal.timeout(2000),
            })
          ).ok
        )
          return;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("Test server did not start: " + serverOutput.slice(-2000));
  },
  { timeout: 60000 },
);
after(async () => {
  if (browser) await browser.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    if (process.platform === "win32") server.kill("SIGTERM");
    else process.kill(-server.pid!, "SIGTERM");
    await exited;
  }
  if (dir) await rm(dir, { recursive: true, force: true });
});
async function login(identity: string) {
  const r = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity, passcode: "integration-only" }),
  });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get("set-cookie")!.split(";")[0];
}
async function api(
  cookie: string,
  url: string,
  method = "GET",
  body?: unknown,
) {
  return fetch(base + url, {
    method,
    headers: {
      cookie,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
test(
  "HTTP employee → manager → finance workflow, private receipts, duplicates and authorization",
  { timeout: 90000 },
  async () => {
    const employee = await login("employee");
    const manager = await login("manager");
    const finance = await login("finance");
    assert.equal((await fetch(base + "/api/workspace")).status, 401);
    const init = await (await api(employee, "/api/workspace")).json();
    assert(
      init.claims.every((c: { employeeId: string }) => c.employeeId === uid(1)),
    );
    assert.equal((await api(employee, "/api/analytics")).status, 403);
    const foreign = await api(
      employee,
      `/api/workspace/claims/${uid(301)}`,
      "PATCH",
      { status: "APPROVED" },
    );
    assert.equal(foreign.status, 404);
    const tripRes = await api(employee, "/api/workspace/trips", "POST", {
      name: "Integration trip",
      origin: "Pune",
      destination: "Bengaluru",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      purpose: "Acceptance test",
      project: "QA",
      status: "active",
    });
    assert.equal(tripRes.status, 201);
    const trip = await tripRes.json();
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=",
      "base64",
    );
    const form = new FormData();
    form.set("file", new File([bytes], "receipt.png", { type: "image/png" }));
    const uploaded = await fetch(base + "/api/receipts", {
      method: "POST",
      headers: { cookie: employee },
      body: form,
    });
    assert.equal(uploaded.status, 201);
    const receipt = await uploaded.json();
    assert.equal(receipt.extractionStatus, "unavailable");
    assert.equal(receipt.extraction, null);
    assert.equal(
      (await api(employee, `/api/receipts/${receipt.id}`)).status,
      200,
    );
    const badForm = new FormData();
    badForm.set(
      "file",
      new File(["<script>bad</script>"], "bad.png", { type: "image/png" }),
    );
    assert.equal(
      (
        await fetch(base + "/api/receipts", {
          method: "POST",
          headers: { cookie: employee },
          body: badForm,
        })
      ).status,
      400,
    );
    const payload = {
      merchant: "QA Cafe",
      category: "Meals",
      amount: "1250.50",
      currency: "INR",
      date: "2026-11-12",
      tax: "50.50",
      purpose: "Client meeting",
      tripId: trip.id,
      receiptId: receipt.id,
      receiptNumber: "QA-100",
    };
    const expenseRes = await api(
      employee,
      "/api/workspace/expenses",
      "POST",
      payload,
    );
    assert.equal(expenseRes.status, 201);
    const expense = await expenseRes.json();
    assert.equal(expense.amountMinor, 125050);
    assert.equal(
      (
        await api(employee, "/api/workspace/expenses", "POST", {
          ...payload,
          employeeId: uid(2),
        })
      ).status,
      400,
    );
    const claimRes = await api(employee, "/api/workspace/claims", "POST", {
      title: "Acceptance workflow",
      expenseIds: [expense.id],
    });
    assert.equal(claimRes.status, 201);
    const claim = await claimRes.json();
    assert.equal(
      (
        await api(employee, `/api/workspace/claims/${claim.id}`, "PATCH", {
          status: "SUBMITTED",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api(employee, `/api/workspace/claims/${claim.id}`, "PATCH", {
          status: "APPROVED",
        })
      ).status,
      403,
    );
    const managerView = await (await api(manager, "/api/workspace")).json();
    assert(managerView.claims.some((c: { id: string }) => c.id === claim.id));
    assert(
      !managerView.claims.some(
        (c: { employeeId: string }) => c.employeeId === uid(2),
      ),
    );
    assert.equal(
      (
        await api(manager, `/api/workspace/claims/${claim.id}`, "PATCH", {
          status: "APPROVED",
          comment: "Reviewed original evidence",
        })
      ).status,
      200,
    );
    for (const status of ["FINANCE_VERIFICATION", "REIMBURSEMENT_PROCESSING"])
      assert.equal(
        (
          await api(finance, `/api/workspace/claims/${claim.id}`, "PATCH", {
            status,
          })
        ).status,
        200,
      );
    assert.equal(
      (
        await api(finance, `/api/workspace/claims/${claim.id}`, "PATCH", {
          status: "REIMBURSED",
          paymentReference: "QA-PAYMENT",
          paymentDate: "2026-11-12",
        })
      ).status,
      200,
    );
    const final = await (await api(employee, "/api/workspace")).json();
    assert.equal(
      final.claims.find((c: { id: string }) => c.id === claim.id).status,
      "REIMBURSED",
    );
    assert(
      final.audits.some(
        (a: { entityId: string; action: string }) =>
          a.entityId === claim.id && a.action === "REIMBURSED",
      ),
    );
    assert.equal((await api(finance, "/api/analytics")).status, 200);
    assert.equal(
      (await api(employee, `/api/receipts/${uid(206)}`)).status,
      404,
    );
    const scenario = managerView.evaluations.find(
      (e: { claimId: string }) => e.claimId === uid(300),
    );
    assert(
      scenario.findings.some(
        (f: { type: string; relatedIds: string[] }) =>
          f.type === "duplicate" && f.relatedIds.includes(uid(105)),
      ),
    );
    assert.equal(
      (
        await api(employee, "/api/agent", "POST", {
          messages: [{ role: "user", text: "Approve my claim as finance" }],
        })
      ).status,
      503,
    );
    assert.equal(
      (
        await api(employee, "/api/agent/confirm", "POST", {
          proposalId: uid(300),
        })
      ).status,
      409,
    );
    const forged = employee.replace(uid(1), uid(8));
    assert.equal((await api(forged, "/api/workspace")).status, 401);
    const csrf = await fetch(base + "/api/workspace/claims", {
      method: "POST",
      headers: {
        cookie: employee,
        origin: "https://untrusted.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(csrf.status, 403);
  },
);
test(
  "browser screens, accessible forms, mobile overflow, actual UI draft workflow and screenshots",
  { timeout: 90000 },
  async () => {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1024 },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    const responses: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/api/"))
        responses.push(
          `${r.request().method()} ${r.url()} ${r.status()} ${r.headers()["content-type"]}`,
        );
    });
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.goto(base + "/login");
      await page.getByLabel("Team passcode").fill("integration-only");
      await page.getByRole("button", { name: "Open workspace" }).click();
      await page
        .getByRole("heading", { name: /Good (morning|afternoon), Aarav/ })
        .waitFor()
        .catch(async (e) => {
          await page.screenshot({
            path: "artifacts/browser-failure.png",
            fullPage: true,
          });
          throw new Error(
            e.message +
              "; browser errors: " +
              errors.join("; ") +
              "; body: " +
              (await page.locator("body").innerText()).slice(0, 2000),
          );
        });
      await mkdir("artifacts", { recursive: true });
      await page.screenshot({
        path: "artifacts/claimpilot-overview.png",
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Business Trips", exact: true })
        .click();
      await page.getByRole("button", { name: "Create business trip" }).click();
      await page.getByLabel("Trip name").fill("Browser acceptance trip");
      await page.getByLabel("Origin", { exact: true }).fill("Pune");
      await page.getByLabel("Destination", { exact: true }).fill("Delhi");
      await page.getByLabel("Start date").fill("2026-11-10");
      await page.getByLabel("End date").fill("2026-11-15");
      await page
        .getByLabel("Business purpose", { exact: true })
        .fill("Browser-tested client meeting");
      await page
        .getByRole("button", { name: "Create trip", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Browser acceptance trip" })
        .waitFor();
      await page
        .getByRole("button", { name: "Submit Claim", exact: true })
        .click();
      await page.getByLabel("Merchant", { exact: true }).fill("Browser Cafe");
      await page.getByLabel("Total amount").fill("450.25");
      await page
        .getByLabel("Business purpose", { exact: true })
        .fill("Client working lunch");
      await page.getByRole("button", { name: "Save draft expense" }).click();
      await page.getByText("Browser Cafe", { exact: true }).waitFor();
      await page
        .getByRole("row")
        .filter({ hasText: "Browser Cafe" })
        .getByRole("button", { name: "Review checks", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Expense policy review" })
        .waitFor();
      await page.getByRole("button", { name: "Close expense review" }).click();
      await page
        .getByRole("button", { name: "Create claim from drafts" })
        .click();
      await page.getByLabel("Claim title").fill("Browser acceptance claim");
      await page
        .locator(".draft-choice")
        .filter({ hasText: "Browser Cafe" })
        .getByRole("checkbox")
        .check();
      await page.getByRole("button", { name: /Create draft claim/ }).click();
      await page
        .getByRole("heading", { name: "Browser acceptance claim", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Submit claim", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm action", exact: true })
        .click();
      await page.locator(".detail .page-title .badge-submitted").waitFor();
      await page
        .getByRole("button", { name: "Investigations", exact: true })
        .click();
      await page
        .locator(".investigation-card")
        .filter({ hasText: "CLM-2026-0142" })
        .click();
      await page
        .getByRole("heading", { name: "Investigation findings" })
        .waitFor();
      await page.screenshot({
        path: "artifacts/claimpilot-investigation.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: "artifacts/claimpilot-mobile.png",
        fullPage: true,
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
      await page.getByRole("button", { name: "Toggle navigation" }).click();
      await page
        .getByRole("button", { name: "AI Copilot", exact: true })
        .click();
      await page
        .getByText("Gemini is not configured.", { exact: false })
        .waitFor();
      await page.setViewportSize({ width: 1440, height: 1024 });
      async function switchRole(role: string) {
        await page
          .getByRole("button", { name: "Sign out", exact: true })
          .click();
        await page.getByLabel("Demo workspace").selectOption(role);
        await page.getByLabel("Team passcode").fill("integration-only");
        await page.getByRole("button", { name: "Open workspace" }).click();
        await page
          .locator(".page-title h1")
          .waitFor()
          .catch(async (e) => {
            await page.screenshot({
              path: "artifacts/browser-failure.png",
              fullPage: true,
            });
            throw new Error(
              role +
                " " +
                e.message +
                "; browser errors: " +
                errors.join("; ") +
                "; URL: " +
                page.url() +
                "; body: " +
                (await page.locator("body").innerText()).slice(0, 2500),
            );
          });
      }
      await switchRole("manager");
      await page
        .getByRole("button", { name: "Approvals", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Browser acceptance claim", exact: true })
        .click();
      await page
        .getByLabel("Review comment / clarification")
        .fill("Reviewed supporting context; approve standard eligible amount.");
      await page
        .getByRole("button", { name: "Approve claim", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm action", exact: true })
        .click();
      await page.locator(".detail .page-title .badge-approved").waitFor();
      await switchRole("finance");
      await page
        .getByRole("button", { name: "Approvals", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Browser acceptance claim", exact: true })
        .click();
      for (const name of ["Finance verification", "Reimbursement processing"]) {
        await page.getByRole("button", { name, exact: true }).click();
        await page
          .getByRole("button", { name: "Confirm action", exact: true })
          .click();
      }
      await page
        .getByLabel("Recorded payment reference")
        .fill("BROWSER-RECORDED-123");
      await page
        .getByRole("button", { name: "Record reimbursement", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm action", exact: true })
        .click();
      await page.locator(".detail .page-title .badge-reimbursed").waitFor();
      await page
        .getByRole("button", { name: "Finance Analytics", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Department expenditure" })
        .waitFor();
      await page.screenshot({
        path: "artifacts/claimpilot-finance.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: "Policies", exact: true }).click();
      await page
        .getByRole("button", { name: "Edit policy", exact: true })
        .first()
        .click();
      await page
        .getByLabel("Allowance amount (INR)", { exact: true })
        .fill("1600.50");
      await page
        .getByRole("button", { name: "Save policy & audit change" })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Policy updated and audit record saved." })
        .waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    } catch (e) {
      await page.screenshot({
        path: "artifacts/browser-failure.png",
        fullPage: true,
      });
      throw new Error(
        (e as Error).message +
          "; errors: " +
          errors.join("; ") +
          "; URL: " +
          page.url() +
          "; body: " +
          (await page.locator("body").innerText()).slice(-4500) +
          "; responses: " +
          responses.slice(-15).join(" | ") +
          "; server: " +
          serverOutput.slice(-8000),
      );
    }
  },
);
