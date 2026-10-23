import crypto from "node:crypto";
import https from "node:https";
import d from "qrcode-terminal";
//#region node_modules/@tencent-connect/qqbot-connector/dist/esm/qqbot-session.js
const E$1 = {
	production: "q.qq.com",
	test: "test.q.qq.com"
};
function u(t = "production") {
	return E$1[t];
}
function l$1() {
	return crypto.randomBytes(32).toString("base64");
}
var d$1;
(function(t) {
	t[t.NONE = 0] = "NONE", t[t.PENDING = 1] = "PENDING", t[t.COMPLETED = 2] = "COMPLETED", t[t.EXPIRED = 3] = "EXPIRED";
})(d$1 || (d$1 = {}));
function b(t, r) {
	const a = Buffer.from(r, "base64"), n = Buffer.from(t, "base64"), e = n.subarray(0, 12), i = n.subarray(n.length - 16), s = n.subarray(12, n.length - 16), o = crypto.createDecipheriv("aes-256-gcm", a, e);
	return o.setAuthTag(i), Buffer.concat([o.update(s), o.final()]).toString("utf8");
}
function h(t, r, a) {
	return new Promise((n, e) => {
		const i = JSON.stringify(r), s = new URL(t), o = https.request({
			hostname: s.hostname,
			path: s.pathname + s.search,
			method: "POST",
			timeout: a,
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				"Content-Length": Buffer.byteLength(i)
			}
		}, (c) => {
			if (c.statusCode !== 200) {
				c.resume(), e(/* @__PURE__ */ new Error(`HTTP ${c.statusCode} from ${t}`));
				return;
			}
			let f = "";
			c.on("data", (p) => {
				f += p;
			}), c.on("end", () => {
				try {
					n(JSON.parse(f));
				} catch (p) {
					e(p);
				}
			});
		});
		o.on("error", e), o.on("timeout", () => {
			o.destroy(), e(/* @__PURE__ */ new Error(`timeout fetching ${t}`));
		}), o.end(i);
	});
}
async function y(t = "production", r = 1e4) {
	const a = `https://${u(t)}/lite/create_bind_task`, n = l$1(), e = await h(a, { key: n }, r);
	if (e.retcode !== 0) throw new Error(e.msg ?? "create_bind_task failed");
	if (!e.data?.task_id) throw new Error("create_bind_task: missing task_id");
	return {
		taskId: e.data.task_id,
		key: n
	};
}
async function g(t, r = "production", a = 1e4) {
	const e = await h(`https://${u(r)}/lite/poll_bind_result`, { task_id: t }, a);
	if (e.retcode !== 0) throw new Error(e.msg ?? "poll_bind_result failed");
	return {
		status: e.data?.status ?? d$1.NONE,
		botAppId: String(e.data?.bot_appid ?? ""),
		botEncryptSecret: e.data?.bot_encrypt_secret ?? ""
	};
}
function w(t, r = "") {
	return `https://${u("production")}/qqbot/openclaw/connect.html?task_id=${encodeURIComponent(t)}&source=${encodeURIComponent(r)}&_wv=2`;
}
//#endregion
//#region node_modules/@tencent-connect/qqbot-connector/dist/esm/qr-connect.js
const l = 2e3;
function F(o) {
	return new Promise((r) => {
		d.generate(o, { small: !0 }, (t) => {
			r(t);
		});
	});
}
function E(o, r) {
	return new Promise((t, n) => {
		if (r?.aborted) {
			n(new DOMException("Aborted", "AbortError"));
			return;
		}
		const e = setTimeout(t, o);
		r?.addEventListener("abort", () => {
			clearTimeout(e), n(new DOMException("Aborted", "AbortError"));
		}, { once: !0 });
	});
}
async function m(o, r, t) {
	for (; !t?.aborted;) {
		let n;
		try {
			n = await g(o);
		} catch {
			await E(l, t);
			continue;
		}
		if (n.status === d$1.COMPLETED) {
			const e = b(n.botEncryptSecret, r);
			return {
				outcome: "scanned",
				appId: n.botAppId,
				appSecret: e
			};
		}
		if (n.status === d$1.EXPIRED) return { outcome: "expired" };
		await E(l, t);
	}
	throw new DOMException("Aborted", "AbortError");
}
function p(o, r) {
	const t = new AbortController(), n = r?.signal ? AbortSignal.any([t.signal, r.signal]) : t.signal;
	return (async () => {
		const e = r?.displayQrCodeToConsole ?? !0;
		for (;;) {
			if (n.aborted) throw new DOMException("Aborted", "AbortError");
			let a;
			try {
				a = await y();
			} catch (u) {
				throw new Error(`\u83B7\u53D6\u7ED1\u5B9A\u4EFB\u52A1\u5931\u8D25: ${u instanceof Error ? u.message : String(u)}`, { cause: u });
			}
			const s = w(a.taskId, r?.source);
			if (e) {
				const u = await F(s);
				console.log(u), console.log(`\u8BF7\u4F7F\u7528\u624B\u673A QQ \u626B\u63CF\u4E0A\u65B9\u4E8C\u7EF4\u7801\uFF0C\u5B8C\u6210\u673A\u5668\u4EBA\u7ED1\u5B9A\u3002
`);
			}
			o.onQrDisplayed?.(s);
			const c = await m(a.taskId, a.key, n);
			if (c.outcome === "scanned") {
				o.onSuccess([{
					appId: c.appId,
					appSecret: c.appSecret
				}]);
				return;
			}
			o.onQrExpired?.(), e && console.log(`\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u6B63\u5728\u5237\u65B0\u2026
`);
		}
	})().catch((e) => {
		if (e instanceof DOMException && e.name === "AbortError") {
			o.onFailure(/* @__PURE__ */ new Error("已取消"));
			return;
		}
		o.onFailure(e instanceof Error ? e : new Error(String(e)));
	}), () => t.abort();
}
function C(o) {
	return new Promise((r, t) => {
		p({
			onSuccess: r,
			onFailure: t
		}, {
			...o,
			displayQrCodeToConsole: !0
		});
	});
}
//#endregion
export { C as qrConnect };
