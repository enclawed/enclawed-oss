// Stand-in for @modelcontextprotocol/server-filesystem before 2025.7.1
// (CVE-2025-53109/53110): the requested path is checked against the allowed
// directories with a string prefix BEFORE symbolic links are resolved, and
// the file is then opened following links.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const serve = require("./mcp-mini.cjs");
const allowed = process.argv.slice(2).map((p) => path.resolve(p));
function validate(p) {
  const abs = path.resolve(p);
  if (!allowed.some((a) => abs.startsWith(a))) {
    throw Object.assign(new Error(`Access denied - path outside allowed directories: ${abs}`), {
      code: "EACCES",
    });
  }
  return abs;
}
serve("filesystem", {
  read_file: {
    description: "read a file",
    handler: (a) => fs.readFileSync(validate(a.path), "utf8"),
  },
  write_file: {
    description: "write a file",
    handler: (a) => {
      const p = validate(a.path);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, a.content);
      return `wrote ${p}`;
    },
  },
  list_directory: {
    description: "list a directory",
    handler: (a) => fs.readdirSync(validate(a.path)).join("\n"),
  },
});
