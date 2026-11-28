// Read one line from the controlling terminal (/dev/tty), not from stdin, so
// a code is typed by the person at the keyboard and not piped in by whatever
// launched this process. Echo is off. Used only for a device-verified code.

import fs from "node:fs";
import tty from "node:tty";

export function readLineFromTty(prompt: string): Promise<string> {
  let fd: number;
  try {
    fd = fs.openSync("/dev/tty", "r+");
  } catch {
    return Promise.reject(new Error("there is no terminal to ask on"));
  }
  const input = new tty.ReadStream(fd);
  fs.writeSync(fd, prompt);
  return new Promise((resolve, reject) => {
    let buf = "";
    input.setRawMode(true);
    const finish = (fn: () => void) => {
      input.setRawMode(false);
      input.removeAllListeners("data");
      input.destroy();
      try {
        fs.writeSync(fd, "\n");
      } catch {
        /* closed by destroy */
      }
      fn();
    };
    input.on("data", (d: Buffer) => {
      for (const ch of d.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          finish(() => resolve(buf));
          return;
        }
        if (ch === "\u0003" || ch === "\u0004") {
          finish(() => reject(new Error("cancelled")));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          buf = buf.slice(0, -1);
        } else if (buf.length < 64) {
          buf += ch;
        }
      }
    });
  });
}
