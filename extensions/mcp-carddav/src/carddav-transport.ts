// CardDAV MCP transport.
//
// Implements the `McpTransport` contract from mcp-attested. tsdav
// drives RFC-6352 CardDAV against any compliant host; vcard.ts
// extracts the fields the secretary actually consumes (display name,
// emails, phones).
//
// Two tools:
//   - search_contacts   case-insensitive match across displayName +
//                       emails for a free-text query.
//   - list_contacts     full address book (bounded by maxResults).
//
// The secretary's contact-gating decision (reply via Ollama vs.
// frozen refusal) runs search_contacts with the sender's address
// against the principal's address book. That is the load-bearing
// path; everything else is convenience.

import tsdav, { type DAVClient } from "tsdav";
import type { JsonRpcResult } from "../../mcp-attested/src/http-transport.js";
import type { McpTransport } from "../../mcp-attested/src/server-registry.js";
import { parseVCard, type ParsedContact } from "./vcard.js";

// tsdav ships as CommonJS; see the CalDAV bridge for the same
// rationale. Pull the value off the default export.
const { createDAVClient } = tsdav;

export type CardDavTransportOptions = Readonly<{
  serverUrl: string;
  username: string;
  password: string;
  /**
   * Optional address-book id (URL or displayName) to prefer over
   * the first listed book. Most users have exactly one book; the
   * secretary's lookups never need a non-primary book.
   */
  defaultAddressBookId?: string;
  // Test seam.
  clientFactory?: (cfg: {
    serverUrl: string;
    credentials: { username: string; password: string };
  }) => Promise<DAVClient>;
}>;

export type Contact = ParsedContact;

export class CardDavTransport implements McpTransport {
  private readonly serverUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly defaultAddressBookId?: string;
  private readonly clientFactory: NonNullable<CardDavTransportOptions["clientFactory"]>;
  private clientPromise: Promise<DAVClient> | null = null;

  constructor(opts: CardDavTransportOptions) {
    if (!opts.serverUrl) {
      throw new TypeError("CardDavTransport: serverUrl required");
    }
    if (!opts.username) {
      throw new TypeError("CardDavTransport: username required");
    }
    if (!opts.password) {
      throw new TypeError("CardDavTransport: password required");
    }
    this.serverUrl = opts.serverUrl;
    this.username = opts.username;
    this.password = opts.password;
    this.defaultAddressBookId = opts.defaultAddressBookId;
    this.clientFactory =
      opts.clientFactory ??
      ((cfg) =>
        createDAVClient({
          serverUrl: cfg.serverUrl,
          credentials: cfg.credentials,
          authMethod: "Basic",
          defaultAccountType: "carddav",
        }));
  }

  async call(method: string, params: Record<string, unknown>): Promise<JsonRpcResult> {
    if (method !== "tools/call") {
      return { ok: false, reason: `CardDAV bridge: unsupported MCP method ${method}` };
    }
    const name = typeof params.name === "string" ? params.name : "";
    const args =
      params.arguments && typeof params.arguments === "object"
        ? (params.arguments as Record<string, unknown>)
        : {};
    try {
      switch (name) {
        case "search_contacts":
          return { ok: true, result: await this.searchContacts(args) };
        case "list_contacts":
          return { ok: true, result: await this.listContacts(args) };
        default:
          return { ok: false, reason: `CardDAV bridge: unknown tool: ${name}` };
      }
    } catch (err) {
      this.clientPromise = null;
      return { ok: false, reason: `carddav ${name}: ${(err as Error).message}` };
    }
  }

  private getClient(): Promise<DAVClient> {
    if (!this.clientPromise) {
      this.clientPromise = this.clientFactory({
        serverUrl: this.serverUrl,
        credentials: { username: this.username, password: this.password },
      });
    }
    return this.clientPromise;
  }

  private async resolvePrimaryBook(client: DAVClient): Promise<{ url: string }> {
    const books = await client.fetchAddressBooks();
    if (!books || books.length === 0) {
      throw new Error("no address books available on this account");
    }
    if (this.defaultAddressBookId) {
      const match = books.find(
        (b) => b.url === this.defaultAddressBookId || b.displayName === this.defaultAddressBookId,
      );
      if (match) {
        return { url: match.url };
      }
    }
    return { url: books[0].url };
  }

  private async fetchAllContacts(client: DAVClient): Promise<ReadonlyArray<Contact>> {
    const book = await this.resolvePrimaryBook(client);
    const objects = await client.fetchVCards({ addressBook: { url: book.url } });
    const contacts: Contact[] = [];
    for (const obj of objects) {
      if (typeof obj.data !== "string") {
        continue;
      }
      const parsed = parseVCard(obj.data);
      if (parsed) {
        contacts.push(parsed);
      }
    }
    return Object.freeze(contacts);
  }

  private async searchContacts(args: Record<string, unknown>): Promise<{
    contacts: ReadonlyArray<Contact>;
  }> {
    const queryRaw = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
    if (!queryRaw) {
      throw new Error("search_contacts: `query` is required");
    }
    const maxResults =
      typeof args.maxResults === "number" && args.maxResults > 0
        ? Math.min(Math.floor(args.maxResults), 100)
        : 25;

    const client = await this.getClient();
    const all = await this.fetchAllContacts(client);
    const matches: Contact[] = [];
    for (const c of all) {
      const inEmails = c.emails.some((e) => e.includes(queryRaw));
      const inName = c.displayName.toLowerCase().includes(queryRaw);
      if (inEmails || inName) {
        matches.push(c);
        if (matches.length >= maxResults) {
          break;
        }
      }
    }
    return { contacts: Object.freeze(matches) };
  }

  private async listContacts(args: Record<string, unknown>): Promise<{
    contacts: ReadonlyArray<Contact>;
  }> {
    const maxResults =
      typeof args.maxResults === "number" && args.maxResults > 0
        ? Math.min(Math.floor(args.maxResults), 500)
        : 100;
    const client = await this.getClient();
    const all = await this.fetchAllContacts(client);
    return { contacts: Object.freeze(all.slice(0, maxResults)) };
  }
}
