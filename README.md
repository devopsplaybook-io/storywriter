# storywriter

## AI assistance (LLM)

Storywriter can analyze books and assist while writing (section notes and in-editor AI actions) using any OpenAI-compatible chat completions API.

Configure the connection on the server via `config.json` or environment variables:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `LLM_API_KEY` | yes (for AI features) | _(empty — AI disabled)_ | API key for the chat completions endpoint. When empty, all AI features are disabled and the UI explains it. |
| `LLM_API_URL` | no | `https://api.deepseek.com/chat/completions` | OpenAI-compatible chat completions URL. |
| `LLM_MODEL` | no | `deepseek-chat` | Model name sent with each request. |

The web UI reports availability via `GET /api/llm/status` (`{ available, model }`, authentication required; the API key is never returned) and disables AI actions with an explanation when the server has no key configured. Checking availability costs nothing — no request is made to the LLM provider.

## Authentication sessions

Sessions follow the policy documented in
[`common-utils`](https://github.com/devopsplaybook-io/common-utils/blob/main/docs/auth-session-policy.md)
with one deliberate deviation: the token lives 30 days
(`JWT_VALIDITY_DURATION` = `2592000`) and the absolute session is capped at the
same 30 days (`JWT_SESSION_MAX_DURATION` = `2592000`, inherited from
common-utils), because the web client only renews the session when a page loads.
Both values are re-registered with `addConfigField` so a `config.json` or
environment value survives `reload()`, and `Config.spec.ts` pins the literal
effective values.

## Login with a code

Set `LOGIN_CODE_ENABLED=true` (default: off) to let a signed-out device sign in
by showing an 8-character code that an already signed-in user approves from
Settings. The protocol is documented in
[`common-utils`](https://github.com/devopsplaybook-io/common-utils/blob/main/docs/login-with-code.md).

- Requires the `users_login_codes` table; both database backends ship it as
  migration `init-0011`, applied at boot even while the flag stays off.
- The login page and Settings only show the feature when the server reports it
  available (`GET /api/users/login-codes/capabilities`), so toggling the flag
  needs no web change.
- Approving requires an interactive session; API tokens are refused (403).
- Login-code traffic is exempt from the failed-password login throttle, and
  every login-code response is sent with `Cache-Control: no-store`.
