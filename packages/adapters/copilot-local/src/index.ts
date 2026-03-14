export const type = "copilot_local";
export const label = "Copilot CLI (local)";
export const DEFAULT_COPILOT_LOCAL_MODEL = "auto";
export const DEFAULT_COPILOT_LOCAL_BYPASS_APPROVALS_AND_SANDBOX = true;

export { models } from "@paperclipai/adapter-cursor-local";

export const agentConfigurationDoc = `# copilot_local agent configuration

Adapter: copilot_local

Core fields:
- cwd (string, optional): default absolute working directory fallback for the agent process (created if missing when possible)
- instructionsFilePath (string, optional): absolute path to a markdown instructions file prepended to prompt at runtime
- model (string, optional): Copilot model id
- modelReasoningEffort (string, optional): reasoning effort override passed via mode flag
- promptTemplate (string, optional): run prompt template
- dangerouslyBypassApprovalsAndSandbox (boolean, optional): run with --yolo bypass flag
- command (string, optional): defaults to "copilot"
- extraArgs (string[], optional): additional CLI args
- env (object, optional): KEY=VALUE environment variables
- workspaceStrategy (object, optional): execution workspace strategy; currently supports { type: "git_worktree", baseRef?, branchTemplate?, worktreeParentDir? }
- workspaceRuntime (object, optional): workspace runtime service intents; local host-managed services are realized before Copilot starts and exposed back via context/env

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds

Notes:
- Prompts are passed as the value to \`-p\` (Copilot non-interactive prompt mode).
- The Copilot CLI does not support the \`--workspace\` flag.
- Copilot uses \`--output-format json\` which emits JSONL events with dot-notation types (e.g. \`assistant.message_delta\`).
- When Paperclip realizes a workspace/runtime for a run, it injects PAPERCLIP_WORKSPACE_* and PAPERCLIP_RUNTIME_* env vars for agent-side tooling.
`;
