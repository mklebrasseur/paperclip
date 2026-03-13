import type { AdapterExecutionContext, AdapterInvocationMeta } from "@paperclipai/adapter-utils";
import { execute as executeCodex } from "@paperclipai/adapter-codex-local/server";

export async function execute(ctx: AdapterExecutionContext) {
  const config = {
    ...ctx.config,
    command:
      typeof ctx.config.command === "string" && ctx.config.command.trim().length > 0
        ? ctx.config.command
        : "copilot",
  };

  return executeCodex({
    ...ctx,
    config,
    onMeta: ctx.onMeta
      ? async (meta: AdapterInvocationMeta) => {
          await ctx.onMeta?.({ ...meta, adapterType: "copilot_local" });
        }
      : undefined,
  });
}
