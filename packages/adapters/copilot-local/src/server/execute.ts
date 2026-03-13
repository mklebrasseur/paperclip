import type { AdapterExecutionContext, AdapterInvocationMeta } from "@paperclipai/adapter-utils";
import { execute as executeCursor } from "@paperclipai/adapter-cursor-local/server";

export async function execute(ctx: AdapterExecutionContext) {
  const config = {
    ...ctx.config,
    includeWorkspaceArg: false,
    passPromptAsArgument: true,
    command:
      typeof ctx.config.command === "string" && ctx.config.command.trim().length > 0
        ? ctx.config.command
        : "copilot",
  };

  return executeCursor({
    ...ctx,
    config,
    onMeta: ctx.onMeta
      ? async (meta: AdapterInvocationMeta) => {
          await ctx.onMeta?.({ ...meta, adapterType: "copilot_local" });
        }
      : undefined,
  });
}
