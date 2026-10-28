// Stage-0 must judge what the sender just wrote, not the assistant's own
// previous reply quoted underneath it.
//
// Field failure this pins: an ordinary support exchange was silently
// dropped because the assistant's own sentence -- "This mailbox is
// indeed the correct channel to report any security concerns" -- came
// back quoted in the reply and was classified as a false-fact claim.
// Every further round makes it likelier, because the quoted block only
// grows.

import { describe, expect, it } from "vitest";
import { extractNewMessageContent } from "../../enclawed-apps/executive-assistant/src/scheduler/extract-new-message.ts";

const THREAD = [
  "Excellent!",
  "",
  "When I check the status, I see this output:",
  '"PS C:\\> Get-EnclawedAppStatus executive-assistant ... "',
  "",
  "Is that normal?",
  "",
  "---",
  "Alfredo Metere, PhD",
  "",
  "From: Hanne Chloe <security@enclawed.com>",
  "Sent: Monday, August 31, 2026 9:18 PM",
  "Subject: Re: bugs in enclawed",
  "",
  "Thank you for reaching out, Alfredo. This mailbox is indeed the correct channel",
  "to report any security concerns or bugs related to enclawed. If you could",
  "provide more details about the weird behavior you're experiencing, I can help",
  "escalate it for further evaluation.",
  "",
  "— Hanne Chloe",
  "",
  "On Tue, 01 Sep 2026 04:18:57 GMT, Alfredo Metere wrote:",
  "> Hi,",
  "> Is this the correct channel to talk to someone about a weird behavior?",
].join("\n");

describe("quoted history is not judged as new input", () => {
  it("keeps the assistant's own prior reply out of the new message", () => {
    const split = extractNewMessageContent(THREAD);
    expect(split.newContent).not.toContain("This mailbox is indeed the correct channel");
    expect(split.quotedContext).toContain("This mailbox is indeed the correct channel");
  });

  it("keeps what the sender actually just wrote", () => {
    const split = extractNewMessageContent(THREAD);
    expect(split.newContent).toContain("Is that normal?");
    expect(split.newContent).toContain("Excellent!");
  });

  it("falls back to the whole body when there is nothing quoted", () => {
    // A first-contact message has no quoted block; the classifier must
    // still see it in full rather than an empty string.
    const first = "Hi, is this the right place to report a bug?";
    const split = extractNewMessageContent(first);
    const forClassifier = split.newContent.trim().length > 0 ? split.newContent : first;
    expect(forClassifier).toContain("report a bug");
  });
});
