import type { AdapterEnvironmentTestContext } from "@paperclipai/adapter-utils";
import { testEnvironment as codexTestEnvironment } from "@paperclipai/adapter-codex-local/server";

export async function testEnvironment(ctx: AdapterEnvironmentTestContext) {
  const config =
    typeof ctx.config === "object" && ctx.config !== null && !Array.isArray(ctx.config)
      ? (ctx.config as Record<string, unknown>)
      : {};

  return codexTestEnvironment({
    ...ctx,
    config: {
      ...config,
      command:
        typeof config.command === "string" && config.command.trim().length > 0
          ? config.command
          : "copilot",
    },
  });
}
