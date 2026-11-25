// Claude Code's PreToolUse input as the kit's PreActionEvent, exactly as
// codenclawed maps it (enclawde-cli src/gate.mjs preActionEventOf and
// src/tools.mjs, its tool table). This is adapter data, copied so the replay
// decides each call on the event the adapter would have built.

import path from "node:path";
const READ_TOOLS = /* @__PURE__ */ new Set([
  "Read",
  "Glob",
  "Grep",
  "LS",
  "NotebookRead",
  "ToolSearch",
  "BashOutput",
  "LSP",
]);
const SESSION_TOOLS = /* @__PURE__ */ new Set([
  "TodoWrite",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskUpdate",
  "TaskOutput",
  "AskUserQuestion",
  "ExitPlanMode",
  "EnterPlanMode",
  "SubagentHandback",
  "ListAgents",
]);
// SendMessage continues a subagent the session started: its own calls are checked like any agent's.
const AGENT_TOOLS = /* @__PURE__ */ new Set(["Agent", "Task", "SendMessage"]);
const FS_WRITE_TOOLS = {
  Write: { op: "write", fields: ["file_path"] },
  Edit: { op: "edit", fields: ["file_path"] },
  MultiEdit: { op: "edit", fields: ["file_path"] },
  NotebookEdit: { op: "edit", fields: ["notebook_path", "file_path"] },
};
const GATEWAY_ALIASES = {
  Read: ["read"],
  Write: ["write"],
  Edit: ["edit"],
  MultiEdit: ["edit"],
  NotebookEdit: ["edit"],
  Bash: ["exec"],
  Monitor: ["exec"],
  PowerShell: ["exec"],
  WebFetch: ["web_fetch"],
  WebSearch: ["web_search"],
  Agent: ["subagents"],
  Task: ["subagents"],
};
function toolKind(name) {
  if (!name) {
    return "unknown";
  }
  if (name.startsWith("mcp__")) {
    return "mcp";
  }
  if (name === "WebFetch") {
    return "fetch";
  }
  if (name === "WebSearch") {
    return "search";
  }
  if (name === "Skill") {
    return "skill";
  }
  if (READ_TOOLS.has(name)) {
    return "read";
  }
  if (SESSION_TOOLS.has(name)) {
    return "session";
  }
  if (AGENT_TOOLS.has(name)) {
    return "agent";
  }
  if (Object.hasOwn(FS_WRITE_TOOLS, name)) {
    return "fs-write";
  }
  if (name === "Bash" || name === "Monitor" || name === "PowerShell") {
    return "shell";
  }
  return "unknown";
}
function readTargetsOf(tool, ti, cwd) {
  const reads = [];
  const listOnly = tool === "Glob";
  const add = (p, recursive = false) => {
    if (typeof p === "string" && p !== "") {
      reads.push({
        path: p,
        ...(recursive ? { recursive: true } : {}),
        ...(listOnly ? { listOnly: true } : {}),
      });
    }
  };
  switch (tool) {
    case "Read":
      add(ti.file_path);
      break;
    case "NotebookRead":
      add(ti.notebook_path ?? ti.file_path);
      break;
    case "LS":
      add(ti.path);
      break;
    case "Grep":
      add(typeof ti.path === "string" && ti.path !== "" ? ti.path : cwd, true);
      break;
    case "Glob": {
      const base = typeof ti.path === "string" && ti.path !== "" ? ti.path : cwd;
      add(base, true);
      if (typeof ti.pattern === "string" && ti.pattern !== "") {
        add(
          /^(\/|~|\$HOME|\$\{HOME\})/.test(ti.pattern)
            ? ti.pattern
            : `${base.replace(/\/+$/, "")}/${ti.pattern}`,
          true,
        );
      }
      break;
    }
    default:
      break;
  }
  return { reads, literalParams: tool === "Grep" ? ["pattern"] : [] };
}
const NO_PERSON_MODES = /* @__PURE__ */ new Set(["bypassPermissions"]);
function preActionEventOf(tool, ti, o) {
  const kind = toolKind(tool);
  const event = {
    type: "pre-action",
    actor: { sessionId: o.sessionId, subagentId: null },
    callId: o.callId,
    tool,
    policyIds: [tool.trim().toLowerCase(), ...(GATEWAY_ALIASES[tool] ?? [])],
    kind,
    params: ti,
    cwd: o.cwd,
    approvalRoute: o.mode && NO_PERSON_MODES.has(o.mode) ? "no-person" : "person",
    hostMode: o.mode,
  };
  switch (kind) {
    case "read":
      return { ...event, ...readTargetsOf(tool, ti, o.cwd) };
    case "fetch":
      return { ...event, ...(typeof ti.url === "string" ? { url: ti.url } : {}) };
    case "fs-write": {
      const spec = FS_WRITE_TOOLS[tool];
      const raw = spec.fields.map((f) => ti[f]).find((v) => typeof v === "string" && v.length > 0);
      return { ...event, writes: [{ path: raw ?? "", op: spec.op }] };
    }
    case "shell":
      return {
        ...event,
        command: {
          text: typeof ti.command === "string" ? ti.command : "",
          dialect: tool === "PowerShell" ? "powershell" : "posix",
        },
      };
    case "mcp": {
      const m = /^mcp__(.+?)__(.+)$/.exec(tool);
      return { ...event, ...(m ? { mcp: { server: m[1], tool: m[2] } } : {}) };
    }
    case "skill":
      return {
        ...event,
        skill:
          typeof ti.skill === "string"
            ? ti.skill
            : typeof ti.command === "string"
              ? ti.command
              : "",
      };
    default:
      return event;
  }
}
function applyFsEffect(tool, ti, cwd, fsApi) {
  const p = typeof ti.file_path === "string" ? path.resolve(cwd, ti.file_path) : null;
  if (!p) {
    return;
  }
  try {
    if (tool === "Write" && typeof ti.content === "string") {
      fsApi.mkdirSync(path.dirname(p), { recursive: true });
      fsApi.writeFileSync(p, ti.content);
    } else if (
      tool === "Edit" &&
      typeof ti.old_string === "string" &&
      typeof ti.new_string === "string"
    ) {
      const cur = fsApi.readFileSync(p, "utf8");
      const next = ti.replace_all
        ? cur.split(ti.old_string).join(ti.new_string)
        : cur.replace(ti.old_string, ti.new_string);
      if (next !== cur) {
        fsApi.writeFileSync(p, next);
      }
    }
  } catch {}
}
export { applyFsEffect, preActionEventOf, toolKind };
