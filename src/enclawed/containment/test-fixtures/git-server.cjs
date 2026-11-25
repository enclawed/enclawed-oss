// Stand-in for mcp-server-git before 2025.12.18 (CVE-2025-68144): tool
// arguments reach the git command line unchecked, so a "target" that starts
// with "-" is read by git as an option (e.g. --output=<file>).
"use strict";
const { execFileSync } = require("node:child_process");
const serve = require("./mcp-mini.cjs");
const git = (repo, args) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
serve("git", {
  git_status: { description: "status", handler: (a) => git(a.repo_path, ["status", "--short"]) },
  git_diff: {
    description: "diff against a target",
    handler: (a) => git(a.repo_path, ["diff", a.target]),
  },
  git_log: {
    description: "log",
    handler: (a) => git(a.repo_path, ["log", "--oneline", "-n", String(a.max_count || 10)]),
  },
  git_add: { description: "add", handler: (a) => git(a.repo_path, ["add", "--", ...a.files]) },
  git_commit: {
    description: "commit",
    handler: (a) => git(a.repo_path, ["commit", "-m", a.message]),
  },
  git_create_branch: {
    description: "branch",
    handler: (a) => git(a.repo_path, ["branch", a.branch_name]),
  },
  git_checkout: {
    description: "checkout",
    handler: (a) => git(a.repo_path, ["checkout", a.branch_name]),
  },
});
