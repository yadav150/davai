// DavAI Worker — Groq API client.
// Non-streaming + streaming (SSE) support.
// Docs: https://console.groq.com/docs/api-reference

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Non-streaming chat completion.
 * @returns {{ content: string, model: string, tokens?: number }}
 */
export async function groqChat({ apiKey, model, messages, system, maxTokens = 2048, temperature = 0.6 }) {
  if (!apiKey) throw new Error("missing_groq_key");

  const payload = {
    model,
    messages: buildMessages(system, messages),
    temperature,
    max_tokens: maxTokens,
    stream: false
  };

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("groq_http_" + res.status + (text ? ": " + text.slice(0, 200) : ""));
  }

  const data = await res.json();
  const choice = data.choices && data.choices[0];
  const content = choice && choice.message && choice.message.content ? choice.message.content : "";
  return {
    content,
    model: data.model || model,
    tokens: data.usage && typeof data.usage.total_tokens === "number" ? data.usage.total_tokens : undefined
  };
}

/**
 * Streaming chat completion. Returns a ReadableStream of SSE chunks
 * in DavAI's own event format:
 *   data: {"type":"delta","text":"..."}
 *   data: {"type":"meta","model":"...","sources":[...]}
 *   data: [DONE]
 *
 * Caller is responsible for piping this to the client.
 *
 * @param {object} opts
 * @param {function} [opts.onMeta] — called once with final meta ({model, tokens})
 */
export async function groqChatStream({ apiKey, model, messages, system, maxTokens = 2048, temperature = 0.6 }) {
  if (!apiKey) throw new Error("missing_groq_key");

  const payload = {
    model,
    messages: buildMessages(system, messages),
    temperature,
    max_tokens: maxTokens,
    stream: true
  };

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error("groq_http_" + res.status + (text ? ": " + text.slice(0, 200) : ""));
  }

  return { stream: res.body, model };
}

/* ---------- Helpers ---------- */

function buildMessages(system, messages) {
  const out = [];
  if (system && String(system).trim()) {
    out.push({ role: "system", content: String(system) });
  }
  (Array.isArray(messages) ? messages : []).forEach((m) => {
    if (!m || typeof m.content !== "string") return;
    const role = m.role === "assistant" ? "assistant" : (m.role === "system" ? "system" : "user");
    out.push({ role, content: m.content });
  });
  return out;
}

/**
 * Convert a Groq SSE stream (OpenAI-compatible) into DavAI's own SSE format.
 * @param {ReadableStream} groqStream
 * @param {object} opts
 * @param {string} opts.model
 * @param {Array}  [opts.sources]
 * @returns {ReadableStream}
 */
export function transformGroqStream(groqStream, opts = {}) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let sentMeta = false;

  return new ReadableStream({
    async start(controller) {
      const reader = groqStream.getReader();
      const send = (obj) => controller.enqueue(encoder.encode("data: " + JSON.stringify(obj) + "\n\n"));
      const done = () => controller.enqueue(encoder.encode("data: [DONE]\n\n"));

      try {
        while (true) {
          const { value, done: rdone } = await reader.read();
          if (rdone) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const chunk of parts) {
            const lines = chunk.split("\n");
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const raw = trimmed.slice(5).trim();
              if (!raw) continue;
              if (raw === "[DONE]") continue;

              let evt;
              try { evt = JSON.parse(raw); } catch { continue; }
              const delta = evt.choices && evt.choices[0] && evt.choices[0].delta;
              const text = delta && typeof delta.content === "string" ? delta.content : "";
              if (text) send({ type: "delta", text });
            }
          }
        }

        // Emit meta once before closing.
        if (!sentMeta) {
          sentMeta = true;
          send({
            type: "meta",
            model: opts.model || "unknown",
            sources: Array.isArray(opts.sources) ? opts.sources : []
          });
        }
        done();
        controller.close();
      } catch (err) {
        send({ type: "error", code: "stream_error", message: "Stream interrupted." });
        controller.close();
      }
    }
  });
}
