import type {
  LoginCodeCapabilities,
  LoginCodeHttpClient,
  LoginCodeService,
} from "@devopsplaybook.io/common-web/services/LoginCodeService";
import { createLoginCodeService } from "@devopsplaybook.io/common-web/services/LoginCodeService";
import api from "./api";

// The app axios instance already uses "/api" as its base URL: the login-code
// prefix must stay relative or the calls would hit "/api/api/...".
export const LOGIN_CODE_BASE_URL = "/users/login-codes";

export type LoginCodeSessionHandler = (
  token: string,
  user: unknown,
) => void | Promise<void>;

export function createAppLoginCodeService(
  onSession?: LoginCodeSessionHandler,
): LoginCodeService {
  return createLoginCodeService({
    baseUrl: LOGIN_CODE_BASE_URL,
    // Axios is structurally compatible; the service passes only
    // signal/timeout/headers. The request interceptor supplies the bearer
    // token for preview/approve.
    http: api as unknown as LoginCodeHttpClient,
    ...(onSession ? { onSession } : {}),
  });
}

interface LoginCodeCapabilitySource {
  capabilities(): Promise<LoginCodeCapabilities>;
}

// 404 (feature not mounted) or any transport error means "unavailable".
export async function LoginCodeIsAvailable(
  source: LoginCodeCapabilitySource,
): Promise<boolean> {
  try {
    const capabilities = await source.capabilities();
    return capabilities.enabled === true && capabilities.available === true;
  } catch {
    return false;
  }
}
