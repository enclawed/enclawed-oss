import { afterEach, vi } from "vitest";
import type {
  resolveProviderHttpRequestConfig,
  // Type-only imports for two helpers whose value is not yet re-exported by
  // src/plugin-sdk/provider-http.ts in oss. They surface as parameters of the
  // mocks the consumer factory creates; the test-bundle never tries to read
  // them at runtime because the parent provider-http-test-mocks shell only
  // runs under vitest.
} from "../provider-http.js";

type ResolveProviderHttpRequestConfigParams = Parameters<
  typeof resolveProviderHttpRequestConfig
>[0];
// Loosely-typed mock-param shapes — upstream pins these to
// pollProviderOperationJson / sanitizeConfiguredModelProviderRequest from
// provider-http; oss ships those at runtime but the matching value-exports
// are still on the missing-symbol allowlist. The mocks treat them as
// black-box payloads either way.
type PollProviderOperationJsonParams = {
  maxAttempts: number;
  url: string;
  headers: Record<string, string>;
  defaultTimeoutMs: number;
  fetchFn?: typeof fetch;
  requestFailedMessage: string;
  isComplete: (payload: unknown) => boolean;
  getFailureMessage?: (payload: unknown) => string | null | undefined;
  timeoutMessage: string;
};
type SanitizeConfiguredModelProviderRequestParams = unknown;

const providerHttpMocks = vi.hoisted(() => ({
  resolveApiKeyForProviderMock: vi.fn(async () => ({ apiKey: "provider-key" })),
  postJsonRequestMock: vi.fn(),
  fetchWithTimeoutMock: vi.fn(),
  pollProviderOperationJsonMock: vi.fn(),
  assertOkOrThrowHttpErrorMock: vi.fn(async (_response: Response, _label: string) => {}),
  assertOkOrThrowProviderErrorMock: vi.fn(async (_response: Response, _label: string) => {}),
  sanitizeConfiguredModelProviderRequestMock: vi.fn(
    (request: SanitizeConfiguredModelProviderRequestParams) => request,
  ),
  resolveProviderHttpRequestConfigMock: vi.fn((params: ResolveProviderHttpRequestConfigParams) => ({
    baseUrl: params.baseUrl ?? params.defaultBaseUrl,
    allowPrivateNetwork: params.allowPrivateNetwork === true,
    headers: new Headers(params.defaultHeaders),
    dispatcherPolicy: undefined,
  })),
}));

providerHttpMocks.pollProviderOperationJsonMock.mockImplementation(
  async (params: PollProviderOperationJsonParams) => {
    for (let attempt = 0; attempt < params.maxAttempts; attempt += 1) {
      const response = await providerHttpMocks.fetchWithTimeoutMock(
        params.url,
        {
          method: "GET",
          headers: params.headers,
        },
        params.defaultTimeoutMs,
        params.fetchFn,
      );
      await providerHttpMocks.assertOkOrThrowHttpErrorMock(response, params.requestFailedMessage);
      const payload = await response.json();
      if (params.isComplete(payload)) {
        return payload;
      }
      const failureMessage = params.getFailureMessage?.(payload);
      if (failureMessage) {
        throw new Error(failureMessage);
      }
    }
    throw new Error(params.timeoutMessage);
  },
);

vi.mock("@enclawed/plugin-sdk/provider-auth-runtime", () => ({
  resolveApiKeyForProvider: providerHttpMocks.resolveApiKeyForProviderMock,
}));

vi.mock("@enclawed/plugin-sdk/provider-http", () => ({
  assertOkOrThrowHttpError: providerHttpMocks.assertOkOrThrowHttpErrorMock,
  assertOkOrThrowProviderError: providerHttpMocks.assertOkOrThrowProviderErrorMock,
  createProviderOperationDeadline: ({
    label,
    timeoutMs,
  }: {
    label: string;
    timeoutMs?: number;
  }) => ({
    label,
    timeoutMs,
  }),
  fetchWithTimeout: providerHttpMocks.fetchWithTimeoutMock,
  pollProviderOperationJson: providerHttpMocks.pollProviderOperationJsonMock,
  postJsonRequest: providerHttpMocks.postJsonRequestMock,
  resolveProviderOperationTimeoutMs: ({ defaultTimeoutMs }: { defaultTimeoutMs: number }) =>
    defaultTimeoutMs,
  resolveProviderHttpRequestConfig: providerHttpMocks.resolveProviderHttpRequestConfigMock,
  sanitizeConfiguredModelProviderRequest:
    providerHttpMocks.sanitizeConfiguredModelProviderRequestMock,
  waitProviderOperationPollInterval: async () => {},
}));

export function getProviderHttpMocks() {
  return providerHttpMocks;
}

export function installProviderHttpMockCleanup(): void {
  afterEach(() => {
    providerHttpMocks.resolveApiKeyForProviderMock.mockClear();
    providerHttpMocks.postJsonRequestMock.mockReset();
    providerHttpMocks.fetchWithTimeoutMock.mockReset();
    providerHttpMocks.pollProviderOperationJsonMock.mockClear();
    providerHttpMocks.assertOkOrThrowHttpErrorMock.mockClear();
    providerHttpMocks.assertOkOrThrowProviderErrorMock.mockClear();
    providerHttpMocks.sanitizeConfiguredModelProviderRequestMock.mockClear();
    providerHttpMocks.resolveProviderHttpRequestConfigMock.mockClear();
  });
}
