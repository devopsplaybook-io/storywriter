import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import AuthorizeDeviceCard from "@devopsplaybook.io/common-web/components/AuthorizeDeviceCard.vue";
import LoginWithCodeCard from "@devopsplaybook.io/common-web/components/LoginWithCodeCard.vue";
import type {
  LoginCodeApproval,
  LoginCodeCancellation,
  LoginCodeCapabilities,
  LoginCodePollResult,
  LoginCodePreview,
  LoginCodeRequest,
  LoginCodeService,
} from "@devopsplaybook.io/common-web/services/LoginCodeService";

interface StubService {
  capabilities: Mock<() => Promise<LoginCodeCapabilities>>;
  create: Mock<() => Promise<LoginCodeRequest>>;
  poll: Mock<() => Promise<LoginCodePollResult>>;
  preview: Mock<() => Promise<LoginCodePreview>>;
  approve: Mock<() => Promise<LoginCodeApproval>>;
  cancel: Mock<() => Promise<LoginCodeCancellation>>;
}

function iso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function capabilities(
  overrides: Partial<LoginCodeCapabilities> = {},
): LoginCodeCapabilities {
  return {
    enabled: true,
    available: true,
    codeLength: 8,
    rotationSeconds: 30,
    graceSeconds: 60,
    ttlSeconds: 300,
    pollIntervalMs: 60000,
    approveRequiresPassword: false,
    serverTime: iso(),
    ...overrides,
  };
}

function stubService(overrides: Partial<StubService> = {}): StubService {
  return {
    capabilities: vi.fn(async () => capabilities()),
    create: vi.fn(async () => ({
      requestToken: "req-1",
      code: "BCDFGHJK",
      codeExpiresAt: iso(15000),
      expiresAt: iso(300000),
      serverTime: iso(),
    })),
    poll: vi.fn(async () => ({
      status: "pending",
      codeExpiresAt: iso(15000),
      expiresAt: iso(300000),
      serverTime: iso(),
    })),
    preview: vi.fn(async () => ({
      deviceLabel: "Firefox on Linux",
      userAgent: "Mozilla/5.0 (test)",
      createdAt: iso(-1000),
      expiresAt: iso(300000),
      userName: "ada",
      serverTime: iso(),
    })),
    approve: vi.fn(async () => ({
      approved: true,
      expiresAt: iso(300000),
      serverTime: iso(),
    })),
    cancel: vi.fn(async () => ({ status: "cancelled", serverTime: iso() })),
    ...overrides,
  };
}

function asService(stub: StubService): LoginCodeService {
  return stub as unknown as LoginCodeService;
}

function findButton(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAll("button").find((button) => button.text() === label);
}

beforeEach(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LoginWithCodeCard", () => {
  it("shows the formatted code and waits for approval", async () => {
    const service = stubService();

    const wrapper = mount(LoginWithCodeCard, {
      props: { service: asService(service) },
    });

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("BCDF-GHJK");
    });
    expect(wrapper.text()).toContain("Waiting for approval");
    expect(service.create).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("emits use-password from the fallback link", async () => {
    const service = stubService();
    const wrapper = mount(LoginWithCodeCard, {
      props: { service: asService(service) },
    });

    const link = findButton(wrapper, "Use password instead");
    expect(link).toBeTruthy();
    await link?.trigger("click");

    expect(wrapper.emitted("use-password")).toHaveLength(1);
    wrapper.unmount();
  });

  it("renders the unavailable copy without starting a flow", async () => {
    const service = stubService({
      capabilities: vi.fn(async () =>
        capabilities({ enabled: false, available: false }),
      ),
    });

    const wrapper = mount(LoginWithCodeCard, {
      props: { service: asService(service) },
    });

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("Login with a code is unavailable");
    });
    expect(service.create).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain("BCDF-GHJK");

    wrapper.unmount();
  });

  it("persists the redeemed session and emits approved on an approved poll", async () => {
    const service = stubService({
      capabilities: vi.fn(async () => capabilities({ pollIntervalMs: 1 })),
      poll: vi.fn(async () => ({
        status: "approved",
        token: "jwt-token",
        user: { id: "u1", name: "ada" },
        expiresAt: iso(300000),
        serverTime: iso(),
      })),
    });
    const onSession = vi.fn(async () => undefined);

    const wrapper = mount(LoginWithCodeCard, {
      props: { service: asService(service), onSession },
    });

    await vi.waitFor(() => {
      expect(wrapper.emitted("approved")).toBeTruthy();
    });
    expect(onSession).toHaveBeenCalledTimes(1);
    expect(onSession).toHaveBeenCalledWith("jwt-token", {
      id: "u1",
      name: "ada",
    });
    const approved = wrapper.emitted("approved");
    expect(approved?.[0]?.[0]).toMatchObject({ token: "jwt-token" });

    wrapper.unmount();
  });
});

describe("AuthorizeDeviceCard", () => {
  it("previews then approves the code entered on the settings page", async () => {
    const service = stubService();
    const wrapper = mount(AuthorizeDeviceCard, {
      props: { service: asService(service) },
    });

    await vi.waitFor(() => {
      expect(findButton(wrapper, "Continue")?.attributes("disabled")).toBeUndefined();
    });

    await wrapper.get("input").setValue("BCDFGHJK");
    await wrapper.get("form").trigger("submit");

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("ada");
    });
    expect(service.preview).toHaveBeenCalledWith(
      "BCDFGHJK",
      expect.objectContaining({ signal: expect.anything() }),
    );

    await findButton(wrapper, "Approve sign-in")?.trigger("click");

    await vi.waitFor(() => {
      expect(wrapper.emitted("approved")).toBeTruthy();
    });
    expect(service.approve).toHaveBeenCalledWith(
      { code: "BCDFGHJK", password: undefined },
      expect.objectContaining({ signal: expect.anything() }),
    );

    wrapper.unmount();
  });
});
