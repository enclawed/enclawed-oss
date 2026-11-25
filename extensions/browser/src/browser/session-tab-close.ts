// Public-facing session tab tracking surface. Installs the client-backed
// default closer on the tab registry and re-exports the registry API, so any
// caller that can track or close session tabs also has a closer installed.
// Kept separate from session-tab-registry.ts so the registry stays free of the
// browser client (which lazily reaches the control service and its cleanup
// timer, which in turn sweeps the registry).

import { browserCloseTab } from "./client.js";
import { setDefaultTrackedBrowserTabCloser } from "./session-tab-registry.js";

setDefaultTrackedBrowserTabCloser(async (tab) => {
  await browserCloseTab(tab.baseUrl, tab.targetId, {
    profile: tab.profile,
  });
});

export {
  closeTrackedBrowserTabsForSessions,
  sweepTrackedBrowserTabs,
  touchSessionBrowserTab,
  trackSessionBrowserTab,
  untrackSessionBrowserTab,
  type TrackedBrowserTabCloser,
} from "./session-tab-registry.js";
