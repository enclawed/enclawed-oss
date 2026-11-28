import { beforeEach, describe, expect, it, vi } from "vitest";

const { applySettingsFromUrlMock, connectGatewayMock, loadBootstrapMock } = vi.hoisted(() => ({
  applySettingsFromUrlMock: vi.fn(),
  connectGatewayMock: vi.fn(),
  loadBootstrapMock: vi.fn(),
}));

vi.mock("./app-gateway.ts", () => ({
  connectGateway: connectGatewayMock,
}));

vi.mock("./controllers/control-ui-bootstrap.ts", () => ({
  loadControlUiBootstrapConfig: loadBootstrapMock,
}));

vi.mock("./app-settings.ts", () => ({
  applySettingsFromUrl: applySettingsFromUrlMock,
  attachThemeListener: vi.fn(),
  detachThemeListener: vi.fn(),
  inferBasePath: vi.fn(() => "/"),
  syncTabWithLocation: vi.fn(),
  syncThemeWithSettings: vi.fn(),
}));

vi.mock("./app-polling.ts", () => ({
  startLogsPolling: vi.fn(),
  startNodesPolling: vi.fn(),
  stopLogsPolling: vi.fn(),
  stopNodesPolling: vi.fn(),
  startDebugPolling: vi.fn(),
  stopDebugPolling: vi.fn(),
}));

vi.mock("./app-scroll.ts", () => ({
  observeTopbar: vi.fn(),
  scheduleChatScroll: vi.fn(),
  scheduleLogsScroll: vi.fn(),
}));

import { handleConnected } from "./app-lifecycle.ts";

function createHost() {
  return {
    basePath: "",
    client: null,
    connectGeneration: 0,
    connected: false,
    tab: "chat",
    assistantName: "Enclawed",
    assistantAvatar: null,
    assistantAgentId: null,
    serverVersion: null,
    chatHasAutoScrolled: false,
    chatManualRefreshInFlight: false,
    chatLoading: false,
    chatMessages: [],
    chatToolMessages: [],
    chatStream: "",
    logsAutoFollow: false,
    logsAtBottom: true,
    logsEntries: [],
    popStateHandler: vi.fn(),
    topbarObserver: null,
    gatewayUrlPolicy: null as string | null,
    allowedGatewayOrigins: [] as string[],
    pendingGatewayUrl: null as string | null,
    pendingGatewayToken: null as string | null,
    gatewayUrlLinkRefusal: null as string | null,
  };
}

describe("handleConnected", () => {
  beforeEach(() => {
    applySettingsFromUrlMock.mockReset();
    connectGatewayMock.mockReset();
    loadBootstrapMock.mockReset();
  });

  it("waits for bootstrap load before first gateway connect", async () => {
    let resolveBootstrap!: () => void;
    loadBootstrapMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveBootstrap = resolve;
      }),
    );
    connectGatewayMock.mockReset();
    const host = createHost();

    handleConnected(host as never);
    expect(connectGatewayMock).not.toHaveBeenCalled();

    resolveBootstrap();
    await Promise.resolve();
    expect(connectGatewayMock).toHaveBeenCalledTimes(1);
  });

  it("skips deferred connect when disconnected before bootstrap resolves", async () => {
    let resolveBootstrap!: () => void;
    loadBootstrapMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveBootstrap = resolve;
      }),
    );
    connectGatewayMock.mockReset();
    const host = createHost();

    handleConnected(host as never);
    expect(connectGatewayMock).not.toHaveBeenCalled();

    host.connectGeneration += 1;
    resolveBootstrap();
    await Promise.resolve();

    expect(connectGatewayMock).not.toHaveBeenCalled();
  });

  it("scrubs URL settings before starting the bootstrap fetch", () => {
    loadBootstrapMock.mockResolvedValueOnce(undefined);
    const host = createHost();

    handleConnected(host as never);

    expect(applySettingsFromUrlMock).toHaveBeenCalledTimes(1);
    expect(loadBootstrapMock).toHaveBeenCalledTimes(1);
    expect(applySettingsFromUrlMock.mock.invocationCallOrder[0]).toBeLessThan(
      loadBootstrapMock.mock.invocationCallOrder[0],
    );
  });

  it("refuses a non-allowlisted gatewayUrl link once the enclaved policy is known", async () => {
    const host = createHost();
    host.pendingGatewayUrl = "wss://attacker.example";
    host.pendingGatewayToken = "link-token";
    loadBootstrapMock.mockImplementationOnce(async (state: typeof host) => {
      state.gatewayUrlPolicy = "allowlist";
      state.allowedGatewayOrigins = [];
    });

    handleConnected(host as never);
    await vi.waitFor(() => expect(connectGatewayMock).toHaveBeenCalledTimes(1));

    expect(host.pendingGatewayUrl).toBeNull();
    expect(host.pendingGatewayToken).toBeNull();
    expect(host.gatewayUrlLinkRefusal).toContain("wss://attacker.example");
  });

  it("keeps the gatewayUrl link pending for confirmation in the open flavor", async () => {
    const host = createHost();
    host.pendingGatewayUrl = "wss://gateway-b.example";
    loadBootstrapMock.mockImplementationOnce(async (state: typeof host) => {
      state.gatewayUrlPolicy = "confirm";
    });

    handleConnected(host as never);
    await vi.waitFor(() => expect(connectGatewayMock).toHaveBeenCalledTimes(1));

    expect(host.pendingGatewayUrl).toBe("wss://gateway-b.example");
    expect(host.gatewayUrlLinkRefusal).toBeNull();
  });
});
