import { request, type FullConfig } from "@playwright/test";
import { resetDemoData } from "./helpers.js";

/** Leaves the deployment in the spec's seed state after the suite. */
export default async function globalTeardown(
  config: FullConfig,
): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  const context = await request.newContext({ baseURL });
  try {
    await resetDemoData(context);
  } finally {
    await context.dispose();
  }
}
