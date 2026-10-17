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
