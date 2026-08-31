import { expect, test } from "@playwright/test";
import { installRuntime } from "./runtime-fixture";

declare global {
  interface Window {
    __webmcpTestRuntime: {
      tools: Map<string, { execute(input: unknown, context: { signal: AbortSignal }): Promise<unknown> }>;
      driver: { state: number; videoId: string; seconds: number; freezeObservation: boolean };
    };
  }
}

const demoUrl = "/examples/plain-html/";

async function invoke(page: import("@playwright/test").Page, name: string, input: unknown) {
  return await page.evaluate(async ({ toolName, value }) => {
    const tool = window.__webmcpTestRuntime.tools.get(toolName);
    if (!tool) throw new Error("tool_missing");
    return await tool.execute(value, { signal: new AbortController().signal });
  }, { toolName: name, value: input });
}

async function searchReference(page: import("@playwright/test").Page, query = "motorized exoskeleton") {
  const result = await invoke(page, "search_this_catalog", { query, limit: 1 }) as {
    moments: Array<{ moment_ref: string }>;
  };
  return result.moments[0]?.moment_ref ?? "";
}

test("chains search, context, and play", async ({ page }) => {
  await installRuntime(page);
  await page.goto(demoUrl);
  await expect(page.locator("#runtime-status")).toHaveText("Registered 3 page tools.");
  const momentRef = await searchReference(page);
  expect(momentRef).toMatch(/^wmv_[A-Za-z0-9_-]{22}$/);
  await expect(invoke(page, "get_moment_context", { moment_ref: momentRef })).resolves.toMatchObject({
    moment_ref: momentRef,
    start_seconds: 46,
  });
  await expect(invoke(page, "play_moment", { moment_ref: momentRef })).resolves.toMatchObject({
    status: "sought",
    requested_seconds: 46,
  });
});

test("cues a cold or different official video", async ({ page }) => {
  await installRuntime(page, { state: -1, videoId: "t82C_EYja18", seconds: 0 });
  await page.goto(demoUrl);
  const momentRef = await searchReference(page, "Cars in China evolved");
  await expect(invoke(page, "play_moment", { moment_ref: momentRef })).resolves.toMatchObject({
    status: "cued",
    requested_seconds: 120,
  });
});

test("denies revocation before play", async ({ page }) => {
  await installRuntime(page);
  await page.goto(demoUrl);
  const momentRef = await searchReference(page);
  await page.evaluate((reference) => window.__webmcpVideoLocalDemo?.revokeReference(reference), momentRef);
  await expect(invoke(page, "play_moment", { moment_ref: momentRef })).rejects.toThrow(/rights_denied/);
});

test("denies revocation while authorization is active", async ({ page }) => {
  await installRuntime(page, { freezeObservation: true });
  await page.goto(demoUrl);
  const momentRef = await searchReference(page);
  const outcome = await page.evaluate(async (reference) => {
    const pending = window.__webmcpVideoLocalDemo?.invoke("play_moment", { moment_ref: reference })
      .then(() => "resolved", (error: unknown) => error instanceof Error ? error.message : "rejected");
    await new Promise((resolve) => setTimeout(resolve, 30));
    window.__webmcpVideoLocalDemo?.revokeReference(reference);
    return await pending;
  }, momentRef);
  expect(outcome).toContain("rights_denied");
});

test("supersedes overlapping plays", async ({ page }) => {
  await installRuntime(page, { freezeObservation: true });
  await page.goto(demoUrl);
  const firstRef = await searchReference(page);
  const secondRef = await searchReference(page, "robotic massage scene");
  const outcomes = await page.evaluate(async ({ first, second }) => {
    const runtime = window.__webmcpTestRuntime;
    const firstPlay = window.__webmcpVideoLocalDemo?.invoke("play_moment", { moment_ref: first })
      .then(() => "resolved", (error: unknown) => error instanceof Error ? error.message : "rejected");
    await new Promise((resolve) => setTimeout(resolve, 30));
    runtime.driver.freezeObservation = false;
    const secondPlay = window.__webmcpVideoLocalDemo?.invoke("play_moment", { moment_ref: second })
      .then((value) => (value as { status: string }).status);
    return await Promise.all([firstPlay, secondPlay]);
  }, { first: firstRef, second: secondRef });
  expect(outcomes).toEqual(["play_superseded", "sought"]);
});

test("keeps normal controls when the WebMCP runtime is missing", async ({ page }) => {
  await installRuntime(page, { missingRuntime: true });
  await page.goto(demoUrl);
  await expect(page.locator("#runtime-status")).toHaveText("WebMCP is unavailable. The local demo controls still work.");
  await expect(page.getByRole("button", { name: "Find exact moment" })).toBeVisible();
});

test("reports autoplay restriction as needs_user", async ({ page }) => {
  await installRuntime(page, { state: 2, seconds: 0, autoplayBlocked: true });
  await page.goto(demoUrl);
  const momentRef = await searchReference(page);
  await expect(invoke(page, "play_moment", { moment_ref: momentRef })).resolves.toMatchObject({
    status: "needs_user",
    observed_seconds: 46,
  });
});

test("suppresses stale success and stale audit evidence", async ({ page }) => {
  await installRuntime(page, { freezeObservation: true });
  await page.goto(demoUrl);
  const firstRef = await searchReference(page);
  const secondRef = await searchReference(page, "robotic massage scene");
  const result = await page.evaluate(async ({ first, second }) => {
    const firstPlay = window.__webmcpVideoLocalDemo?.invoke("play_moment", { moment_ref: first })
      .catch((error: unknown) => error instanceof Error ? error.message : "rejected");
    await new Promise((resolve) => setTimeout(resolve, 30));
    window.__webmcpTestRuntime.driver.freezeObservation = false;
    const secondPlay = await window.__webmcpVideoLocalDemo?.invoke("play_moment", { moment_ref: second });
    await firstPlay;
    return {
      secondPlay,
      audit: window.__webmcpVideoLocalDemo?.auditEntries() ?? [],
    };
  }, { first: firstRef, second: secondRef });
  expect(result.secondPlay).toMatchObject({ status: "sought", moment_ref: secondRef });
  const playAudits = result.audit.filter((entry) => entry.tool_id === "play_moment");
  expect(playAudits).toHaveLength(1);
  expect(playAudits[0]).toMatchObject({ moment_ref: secondRef, rights_decision: "allowed" });
});
