// enclawed adapter kit: the credentials of an admitted remote MCP server, a
// leaf module (types only) so ./remote-launch.ts names them without importing
// ./remote-auth.ts (which imports ./remote-launch.ts). Re-exported by ./remote-auth.ts.

import type { BoundCredential } from "./host-env.js";

export type RemoteCredentials = Readonly<{
  /** The admitted server's origin: these headers go nowhere else. */
  origin: string;
  /** The headers for the next request to the server (the requestHeaders seam). */
  headers(): Readonly<Record<string, string>>;
  /** Refresh an expired or refused access token; false when it cannot be. */
  refresh(force?: boolean): Promise<boolean>;
  /** Secret values, for removal from results (bound to the server's host). */
  handles(): readonly BoundCredential[];
}>;
