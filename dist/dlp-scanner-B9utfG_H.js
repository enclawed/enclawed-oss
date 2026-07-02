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
	},
	{
		id: "prompt-template-marker",
		severity: "critical",
		re: /<\|(?:im_start|im_end|user|assistant|system|tool|endoftext|fim_prefix|fim_middle|fim_suffix)\|>/gi
	},
	{
		id: "prompt-template-marker-llama",
		severity: "critical",
		re: /\[\/?INST\]|\[\/?SYS\]/g
	},
	{
		id: "prompt-template-marker-bos-eos",
		severity: "critical",
		re: /<\/?(?:s|system|user|assistant|tool)>/gi
	},
	{
		id: "prompt-injection-instruction",
		severity: "critical",
		re: /\b(?:ignore|disregard|forget|override|overrule|cancel|skip|bypass)\s+(?:(?:all|the|any|previous|prior|above|earlier|preceding)\s+){1,3}(?:instructions?|prompts?|rules?|context|directives?|messages?|guidelines?|text|content|input|output|turn|reply|paragraphs?|sentences?|lines?|words?|everything)\b/gi
	},
	{
		id: "prompt-injection-extraction-request",
		severity: "critical",
		re: /\b(?:print|reveal|show|output|dump|reproduce|display|repeat|recite|share|reply\s+with|respond\s+with|answer\s+with|begin\s+with|start\s+with|include|return|emit|send|tell\s+me|what\s+(?:is|are))\s+(?:me\s+)?(?:the\s+|your\s+)?(?:initial|original|hidden|system|secret|raw|verbatim|literal|full|complete|whole|entire|previous)\s+(?:system\s+)?(?:prompt|prompts|rules?|instructions?|directives?|guidelines?|persona|posture|configuration|setup|message|context|api[ _-]?keys?)\b/gi
	},
	{
		id: "prompt-injection-hidden-prompt-phrase",
		severity: "critical",
		re: /\b(?:hidden|system|initial|original|secret|raw|verbatim|literal)\s+(?:system\s+)?(?:prompt|instructions?|rules?|directives?|guidelines?|persona|configuration)\b/gi
	},
	{
		id: "prompt-injection-canonical-leak-phrase",
		severity: "critical",
		re: /(?:starting\s+with\s+["“'']?|begin\s+with\s+["“'']?|reply\s+with\s+["“'']?)?(?:You\s+are\s+(?:a|an)\s+)?(?:large\s+language\s+model|LLM\s+assistant|helpful\s+AI\s+assistant|AI\s+assistant\s+(?:created|trained|developed)\s+by)/gi
	},
	{
		id: "prompt-injection-new-instructions",
		severity: "critical",
		re: /\bnew\s+(?:instructions?|prompts?|directives?|rules?|task)\s*[:\-]/gi
	},
	{
		id: "prompt-injection-role-takeover",
		severity: "critical",
		re: /(?:^|\n)\s*(?:system|assistant|user|tool|developer|model)\s*:\s*\S/gim
	},
	{
		id: "prompt-injection-jailbreak-tags",
		severity: "critical",
		re: /\bDAN\s+(?:mode|jailbreak)\b|\bdo\s+anything\s+now\b|\bjailbreak\b/gi
	},
	{
		id: "prompt-template-slash-control",
		severity: "critical",
		re: /\/(?:no_?think|think|reset|clear|system|raw)\b/gi
	},
	{
		id: "prompt-injection-identity-override",
		severity: "critical",
		re: /\b(?:forget\s+(?:everything|all)\s+you\s+(?:know|learned)|this\s+is\s+your\s+new\s+(?:identity|role|persona|task|prompt)|you\s+are\s+now\s+a\s+(?:new|different)|pretend\s+(?:you\s+are|to\s+be))\b/gi
	},
	{
		id: "prompt-injection-exfiltration-request",
		severity: "critical",
		re: /\b(?:reveal|share|leak|expose|disclose|dump|export|send)\s+(?:all|every|the)\s+(?:secrets?|credentials?|passwords?|tokens?|contacts?|memor(?:y|ies)|conversation|history|data|messages?|emails?|files?)\b/gi
	},
	{
		id: "prompt-injection-credential-mention",
		severity: "critical",
		re: /\b(?:passwords?|passphrases?|passcodes?|api[ _-]?keys?|api[ _-]?tokens?|access[ _-]?tokens?|bearer[ _-]?tokens?|secret[ _-]?keys?|auth[ _-]?tokens?|client[ _-]?secrets?|refresh[ _-]?tokens?|private[ _-]?keys?|credentials?)\b/gi
	},
	{
		id: "prompt-injection-cot-extraction",
		severity: "critical",
		re: /\b(?:explain|describe|share|reveal|show|output|print|reproduce|tell\s+me)\s+(?:your\s+)?(?:answer\s+)?(?:step[- ]by[- ]step|chain[- ]of[- ]thought|hidden\s+reasoning|internal\s+(?:reasoning|thoughts?|policies|rules)|thought\s+process|thinking)\b/gi
	},
	{
		id: "prompt-injection-encoded-payload",
		severity: "critical",
		re: /\b(?:decode|interpret|process|execute|run|evaluate)\s+(?:and\s+(?:execute|run|process|interpret))?\s*(?:the\s+)?(?:following|this|below|encoded|base64|b64|hex|rot13)\b[^.\n]{0,40}\b(?:base64|b64|encoded|payload|instruction|task|message|command|script)\b|\b(?:here(?:'?s|\s+is)\s+(?:an?\s+)?(?:base64|b64|encoded|ciphered)\s+(?:task|payload|message|instruction|command))/gi
	},
	{
		id: "prompt-injection-zero-width-abuse",
		severity: "critical",
		re: /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]{2,}/g
	},
	{
		id: "prompt-injection-comment-smuggled",
		severity: "critical",
		re: /<!--[\s\S]{0,500}?(?:system|admin|root|override|ignore\s+(?:all|previous)|hidden|api[ _-]?key|password|secret|reveal|exfil|https?:\/\/)[\s\S]{0,500}?-->|\{#[\s\S]{0,500}?(?:system|admin|ignore|override|hidden|password|secret)[\s\S]{0,500}?#\}/gi
	},
	{
		id: "prompt-injection-roleplay-as-malicious",
		severity: "critical",
		re: /\b(?:roleplay|role[- ]play|act|behave|pretend|simulate|impersonate)\s+(?:as|to\s+be)\s+(?:a|an|the)?\s*(?:disgruntled|malicious|evil|compromised|rogue|hostile|hacked|unrestricted|jailbroken|liberated|uncensored|amoral|unfiltered|unaligned)\b/gi
	},
	{
		id: "prompt-injection-agent-gaslighting",
		severity: "critical",
		re: /\b(?:tell|instruct|message|inform|notify|order|command)\s+(?:the\s+)?(?:main|admin|root|parent|sibling|sub|child|helper|orchestrator|other|next|trusted|authorized)\s+agent\b|\b(?:user|principal|operator|caller|requester)\s+(?:has\s+been|is|was)\s+(?:already\s+)?(?:pre[- ]?)?authorized\b/gi
	},
	{
		id: "prompt-injection-system-override-banner",
		severity: "critical",
		re: /\b(?:system|admin|root|developer|sudo|kernel|superuser|god[- ]?mode)\s+(?:override|escalation|elevation|takeover|control|access|mode)\b/gi
	},
	{
		id: "prompt-injection-covert-channel",
		severity: "critical",
		re: /\b(?:output|encode|express|write|represent|render|format|reply|respond)\s+[^.\n]{0,60}\b(?:as|in|using|with)\s+(?:only\s+)?(?:emoji|emojis|morse(?:\s+code)?|binary|hex|base64|rot13|leetspeak|leet|pig\s+latin|symbols|braille)\b|\bone\s+(?:emoji|character|symbol)\s+per\s+character\b/gi
	},
	{
		id: "prompt-injection-oob-exfil",
		severity: "critical",
		re: /\b(?:send|post|get|fetch|curl|wget|exfiltrate|exfil|transmit|upload|forward|beacon|ping)\s+[^.\n]{0,40}\b(?:to|via|using|through|at)\s+[^.\n]{0,40}\bhttps?:\/\/|\b(?:webhook|callback)\s+(?:url|endpoint|address)\b|\blog\s+(?:the\s+)?(?:system\s+prompt|api[ _-]?key|password|secret|token|credential)\s+(?:by\s+)?(?:sending|posting)\b/gi
	},
	{
		id: "prompt-injection-template-env",
		severity: "critical",
		re: /\$\{[^}]*(?:env|process|secret|password|key|token|cred|aws|gcp|azure|getenv)[^}]*\}|\{\{[^}]*(?:env|process|secret|password|key|token|cred|secrets)[^}]*\}\}|<%=?[^%]{0,200}?(?:env|process|secret|password|key|token|cred|ENV\[)[^%]{0,200}?%>/gi
	},
	{
		id: "prompt-injection-harmful-noun",
		severity: "critical",
		re: /\b(?:thermite|ransomware|malware|keylogger|rootkit|backdoor|botnet|command[- ]and[- ]control\s+server|c2\s+server|exploit\s+(?:code|kit|payload)|sql\s+injection|cross[- ]site\s+scripting|nerve\s+agent|chemical\s+weapon|bio[- ]?weapons?|biological\s+weapon|pipe\s+bomb|improvised\s+explosive|TATP|sarin|VX\s+gas)\b/gi
	},
	{
		id: "prompt-injection-step-delegation",
		severity: "critical",
		re: /\b(?:break|decompose|split|divide|expand)\s+(?:this\s+|the\s+)?(?:task|request|problem|prompt|question)\s+(?:in)?to\s+\d+\s+(?:steps?|parts?|stages?|substeps?)\b/gi
	},
	{
		id: "prompt-injection-elevated-identity-claim",
		severity: "critical",
		re: /\b(?:I\s+am\s+(?:the\s+|your\s+)?(?:system|admin|root|developer|owner|maintainer|moderator|operator|anthropic|openai|google|the\s+model['']?s?\s+(?:owner|creator)))\b|\bthis\s+message\s+is\s+from\s+(?:the\s+)?(?:system|admin|root|developer|anthropic|openai|google)\b/gi
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
