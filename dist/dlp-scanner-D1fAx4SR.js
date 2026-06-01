//#region src/enclawed/dlp-scanner.ts
const PATTERNS = [
	{
		id: "industry-classification-banner",
		severity: "critical",
		re: /\b(RESTRICTED-PLUS|RESTRICTED|CONFIDENTIAL|INTERNAL\s*ONLY|HIGHLY\s*CONFIDENTIAL)\s*\/\/[A-Z0-9 \/_.-]+/g
	},
	{
		id: "us-classification-banner",
		severity: "critical",
		re: /\b(TOP\s*SECRET|SECRET|CONFIDENTIAL|CUI)\s*\/\/[A-Z0-9 \/_.-]+/g
	},
	{
		id: "us-doe-restricted-data",
		severity: "critical",
		re: /\b(RESTRICTED\s*DATA|FORMERLY\s*RESTRICTED\s*DATA|FRD|RD\b)/g
	},
	{
		id: "us-sci-codeword",
		severity: "high",
		re: /\b(NOFORN|ORCON|PROPIN|HCS|TK|SI|G|HUMINT)\b/g
	},
	{
		id: "industry-distribution-caveat",
		severity: "medium",
		re: /\b(EYES_ONLY|VENDOR_ONLY|DO_NOT_FORWARD|UNDER_NDA|UNDER\s+NDA)\b/g
	},
	{
		id: "aws-access-key-id",
		severity: "high",
		re: /\b(AKIA|ASIA)[0-9A-Z]{16,}/g
	},
	{
		id: "gcp-service-account",
		severity: "high",
		re: /"type"\s*:\s*"service_account"/g
	},
	{
		id: "azure-storage-key",
		severity: "high",
		re: /AccountKey=[A-Za-z0-9+/=]{40,}/g
	},
	{
		id: "github-token",
		severity: "high",
		re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g
	},
	{
		id: "gitlab-token",
		severity: "high",
		re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g
	},
	{
		id: "openai-key",
		severity: "high",
		re: /\bsk-[A-Za-z0-9_-]{20,}\b/g
	},
	{
		id: "anthropic-key",
		severity: "high",
		re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g
	},
	{
		id: "slack-bot-token",
		severity: "high",
		re: /\bxox[abprs]-[A-Za-z0-9-]{20,}\b/g
	},
	{
		id: "stripe-key",
		severity: "high",
		re: /\b(sk|pk|rk)_(test|live)_[A-Za-z0-9]{20,}\b/g
	},
	{
		id: "openai-key-loose",
		severity: "high",
		re: /sk-(?:ant-)?[A-Za-z0-9_=-]{8,}/g
	},
	{
		id: "aws-shape-loose",
		severity: "high",
		re: /(?:AKIA|ASIA)[A-Z0-9]{8,}/g
	},
	{
		id: "github-token-loose",
		severity: "high",
		re: /gh[pousr]_[A-Za-z0-9]{8,}/g
	},
	{
		id: "gitlab-token-loose",
		severity: "high",
		re: /glpat-[A-Za-z0-9_=-]{8,}/g
	},
	{
		id: "slack-token-loose",
		severity: "high",
		re: /xox[abprs]-[A-Za-z0-9-]{8,}/g
	},
	{
		id: "jwt",
		severity: "medium",
		re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
	},
	{
		id: "pem-private-key",
		severity: "critical",
		re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED |PGP )?PRIVATE KEY-----/g
	},
	{
		id: "email-address",
		severity: "low",
		re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
	},
	{
		id: "phone-e164",
		severity: "medium",
		re: /(?<![\w-])\+[1-9]\d{6,14}(?!\w)/g
	},
	{
		id: "credit-card-pan",
		severity: "high",
		re: /\b(?:\d[ -]?){13,19}\b/g
	},
	{
		id: "iban",
		severity: "high",
		re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g
	},
	{
		id: "us-ssn",
		severity: "high",
		re: /\b(?!000|666|9\d{2})\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b/g
	}
];
const SEVERITY_ORDER = {
	low: 1,
	medium: 2,
	high: 3,
	critical: 4
};
var DlpInputTooLargeError = class extends Error {
	constructor(actual, limit) {
		super(`DLP input too large: ${actual} bytes > ${limit} byte cap`);
		this.actual = actual;
		this.limit = limit;
		this.name = "DlpInputTooLargeError";
	}
};
function scan(text, opts = {}) {
	if (typeof text !== "string") return [];
	const limit = opts.maxBytes ?? 1048576;
	if (text.length > limit) if (opts.onOversize === "truncate") text = text.slice(0, limit);
	else throw new DlpInputTooLargeError(text.length, limit);
	const findings = [];
	for (const p of PATTERNS) {
		p.re.lastIndex = 0;
		let m;
		while ((m = p.re.exec(text)) !== null) findings.push({
			id: p.id,
			severity: p.severity,
			match: m[0],
			index: m.index
		});
	}
	return findings;
}
function redact(text, opts) {
	if (typeof text !== "string") return text;
	const placeholder = opts?.placeholder ?? "[REDACTED]";
	const threshold = SEVERITY_ORDER[opts?.minSeverity ?? "medium"];
	let out = text;
	const sorted = [...PATTERNS].sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
	for (const p of sorted) {
		if (SEVERITY_ORDER[p.severity] < threshold) continue;
		out = out.replace(p.re, placeholder);
	}
	return out;
}
//#endregion
export { scan as n, redact as t };
