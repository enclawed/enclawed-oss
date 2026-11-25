import { describe, expect, it } from "vitest";
import {
  SHIPPED_EGRESS_PROFILES,
  checkRoutingProvenance,
  emailsIn,
  hostMatches,
  pathMatches,
  suppliedValues,
  type RoutingRequest,
} from "./routing.js";

const postmark = [SHIPPED_EGRESS_PROFILES.postmark];
const req = (body: unknown, extra: Partial<RoutingRequest> = {}): RoutingRequest => ({
  host: "api.postmarkapp.com",
  method: "POST",
  target: "/email",
  headers: {},
  contentType: "application/json",
  body: Buffer.from(JSON.stringify(body)),
  ...extra,
});

describe("routing-field provenance", () => {
  const supplied = suppliedValues([
    { to: "Alice <Alice@Example.test>, bob@example.test", subject: "hi" },
    "bot@company.test",
  ]);

  it("passes when every recipient and the sender come from the call or the declared constants", () => {
    const v = checkRoutingProvenance(
      req({ From: "bot@company.test", To: "alice@example.test, Bob <BOB@example.test>" }),
      postmark,
      supplied,
    );
    expect(v).toEqual({ ok: true, checked: 3 });
  });

  it("refuses the postmark-mcp 1.0.16 hidden Bcc", () => {
    const v = checkRoutingProvenance(
      req({ From: "bot@company.test", To: "alice@example.test", Bcc: "phan@giftshop.club" }),
      postmark,
      supplied,
    );
    expect(v).toMatchObject({
      ok: false,
      code: "routing-field-not-from-call",
      field: "Bcc",
      value: "phan@giftshop.club",
    });
  });

  it("is not fooled by key case, batch arrays, or object-shaped values", () => {
    expect(
      checkRoutingProvenance(
        req({ To: "alice@example.test", bcc: "x@evil.test" }),
        postmark,
        supplied,
      ).ok,
    ).toBe(false);
    const batch = req([{ To: "alice@example.test" }, { To: "x@evil.test" }], {
      target: "/email/batch",
    });
    expect(checkRoutingProvenance(batch, postmark, supplied).ok).toBe(false);
    expect(
      checkRoutingProvenance(req({ To: { Email: "x@evil.test" } }), postmark, supplied).ok,
    ).toBe(false);
    expect(
      checkRoutingProvenance(
        req({ To: "alice@example.test" }, { target: "/EMAIL?x=1" }),
        postmark,
        supplied,
      ).ok,
    ).toBe(true);
    expect(
      checkRoutingProvenance(
        req({ To: "alice@example.test", Cc: "x@evil.test" }, { target: "/EMAIL" }),
        postmark,
        supplied,
      ).ok,
    ).toBe(false);
  });

  it("fails closed on a body it cannot read, and checks form and multipart bodies", () => {
    const bad = req(null, { body: Buffer.from("{not json"), contentType: "application/json" });
    expect(checkRoutingProvenance(bad, postmark, supplied)).toMatchObject({
      ok: false,
      code: "routing-body-unparseable",
    });
    const mailgun = [SHIPPED_EGRESS_PROFILES.mailgun];
    const form = {
      host: "api.mailgun.net",
      method: "POST",
      target: "/v3/mg.company.test/messages",
      headers: {},
      contentType: "application/x-www-form-urlencoded",
      body: Buffer.from("to=alice%40example.test&bcc=x%40evil.test&text=hi"),
    };
    expect(checkRoutingProvenance(form, mailgun, supplied)).toMatchObject({
      ok: false,
      field: "bcc",
    });
    const boundary = "XyZ";
    const multipart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="to"\r\n\r\nalice@example.test\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="bcc"\r\n\r\nx@evil.test\r\n--${boundary}--\r\n`,
    );
    expect(
      checkRoutingProvenance(
        { ...form, contentType: `multipart/form-data; boundary=${boundary}`, body: multipart },
        mailgun,
        supplied,
      ),
    ).toMatchObject({ ok: false, field: "bcc" });
  });

  it("checks webhook targets as URLs and leaves unprofiled requests alone", () => {
    const gh = [SHIPPED_EGRESS_PROFILES["github-webhooks"]];
    const call = suppliedValues([{ url: "https://hooks.company.test/ci" }]);
    const hook = (url: string): RoutingRequest => ({
      host: "api.github.com",
      method: "POST",
      target: "/repos/o/r/hooks",
      headers: {},
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({ config: { url } })),
    });
    expect(checkRoutingProvenance(hook("https://hooks.company.test/ci"), gh, call).ok).toBe(true);
    expect(checkRoutingProvenance(hook("https://attacker.test/x"), gh, call).ok).toBe(false);
    const issue = { ...hook("x"), target: "/repos/o/r/issues", body: Buffer.from('{"title":"t"}') };
    expect(checkRoutingProvenance(issue, gh, call)).toEqual({ ok: true, checked: 0 });
  });

  it("matches hosts by label and paths by segment", () => {
    expect(hostMatches("email.*.amazonaws.com", "email.us-east-1.amazonaws.com")).toBe(true);
    expect(hostMatches("email.*.amazonaws.com", "email.amazonaws.com")).toBe(false);
    expect(pathMatches("/v3/*/messages", "/v3/d.test/messages")).toBe(true);
    expect(pathMatches("/v3/*/messages", "/v3/d.test/messages/x")).toBe(false);
    expect(emailsIn('"Doe, J" <j@x.test>; k@y.test')).toEqual(["j@x.test", "k@y.test"]);
  });
});
