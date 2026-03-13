import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
  models as codexModels,
} from "@paperclipai/adapter-codex-local";

export const type = "copilot_local";
export const label = "Copilot CLI (local)";
export const DEFAULT_COPILOT_LOCAL_MODEL = DEFAULT_CODEX_LOCAL_MODEL;
export const DEFAULT_COPILOT_LOCAL_BYPASS_APPROVALS_AND_SANDBOX =
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX;
export const models = codexModels;

export const agentConfigurationDoc = `# copilot_local agent configuration

Adapter: copilot_local

Core fields:
- cwd (string, optional): default absolute working directory fallback for the agent process (created if missing when possible)
- instructionsFilePath (string, optional): absolute path to a markdown instructions file prepended to stdin prompt at runtime
- model (string, optional): Copilot model id
- modelReasoningEffort (string, optional): reasoning effort override (minimal|low|medium|high) passed via -c model_reasoning_effort=...
- promptTemplate (string, optional): run prompt template
- search (boolean, optional): run copilot with --search
- dangerouslyBypassApprovalsAndSandbox (boolean, optional): run with bypass flag
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
- Paperclip auto-injects local skills into the Codex-compatible skills dir used by this adapter ("$CODEX_HOME/skills" or "~/.codex/skills") when missing.
- When Paperclip realizes a workspace/runtime for a run, it injects PAPERCLIP_WORKSPACE_* and PAPERCLIP_RUNTIME_* env vars for agent-side tooling.
`;
