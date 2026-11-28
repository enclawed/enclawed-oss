/**
 * The first question name of a DNS query, or null. Case is kept: DNS
 * matching ignores it, but encoded exfiltration (base64 labels) uses it.
 */
export declare function parseDnsQuestion(buf: Uint8Array): {
    name: string;
    type: number;
} | null;
/**
 * A DNS answer for `query` that points the name at `sinkhole` (IPv4), so the
 * caller's follow-up connection lands on the trap too and shows what it
 * meant to send. Non-A questions get an empty NOERROR answer.
 */
export declare function dnsSinkholeAnswer(query: Uint8Array, sinkhole: string): Buffer | null;
/** The server name (SNI) of a TLS ClientHello, or null. */
export declare function parseTlsSni(buf: Uint8Array): string | null;
/** The request line and Host header of a plain HTTP/1.x request, or null. */
export declare function parseHttpRequestHead(buf: Uint8Array): {
    method: string;
    target: string;
    host: string | null;
} | null;
export type CaptureSummary = {
    /** What the bytes are: dns, tls, http, or unknown. */
    protocol: "dns" | "tls" | "http" | "unknown";
    /** The name the process tried to reach, when the bytes reveal it. */
    name: string | null;
    /** HTTP method and target, for plain HTTP. */
    request: string | null;
};
/** Classify the first bytes of a trapped attempt. */
export declare function summarizeCapture(buf: Uint8Array, transport: "tcp" | "udp", port: number): CaptureSummary;
