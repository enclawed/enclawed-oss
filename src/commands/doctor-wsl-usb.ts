import { formatCliCommand } from "../cli/command-format.js";
import { note } from "../terminal/note.js";

/**
 * On WSL: is the Enclaweder bound, attached and reachable from Linux? Quiet off WSL and on WSL
 * machines where no Enclaweder is in play. Read-only: never prompts, elevates or runs sudo.
 */
export async function noteWslUsbHealth(): Promise<void> {
  const { isWslHost, wslUsbStatus, describeWslUsbStatus, wslUsbRelevant } =
    await import("../enclawed/platform/wsl-usb-cli.js");
  if (!isWslHost()) {
    return;
  }
  const status = await wslUsbStatus();
  if (!wslUsbRelevant(status)) {
    return;
  }
  const { healthy, lines } = describeWslUsbStatus(status);
  const body = lines.map((line) =>
    line.startsWith("Fix: enclawed ")
      ? `- Fix: run ${formatCliCommand(line.slice("Fix: ".length))}`
      : `- ${line}`,
  );
  note(body.join("\n"), healthy ? "Enclaweder on WSL" : "Enclaweder on WSL (needs setup)");
}
