const FALLBACK_MODEL = "openrouter/free";

function send(res, status, data) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return send(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return send(res, 500, {
      error: "OPENROUTER_API_KEY is not configured in Vercel."
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const lead = body.lead || {};

    const name = lead.name || "Unknown";
    const phone = lead.phone || "";
    const treatment = lead.treatment || "Unknown";
    const days = Number(lead.days) || 0;
    const insurance = Boolean(lead.insurance);

    // Keep the application's deterministic score.
    const score = Number.isFinite(Number(body.score))
      ? Number(body.score)
      : null;

    const tier =
      body.tier ||
      (score >= 75 ? "HOT" : score >= 55 ? "WARM" : "COLD");

    const systemPrompt = `
You are the AI response engine for a dental lead-management demonstration.

Your job:
1. Explain the supplied lead's priority.
2. Give concise reasoning that a dental practice staff member can understand.
3. Draft a professional follow-up message.
4. Recommend the next operational action.

Important rules:
- The supplied numerical score is deterministic and MUST NOT be changed.
- Do not invent clinic names, doctors, prices, discounts, insurance coverage,
  appointment availability, clinical diagnoses, or guarantees.
- Do not provide medical diagnosis or treatment advice.
- This is a sales/operations demo, not a clinical system.
- The response is only a draft. Never claim that a message was actually sent
  or an appointment was actually booked.
- Keep the writing concise and professional.

Return valid JSON with exactly these fields:
{
  "summary": "...",
  "reasoning": "...",
  "reply": "...",
  "next_step": "..."
}
`;

    const userPrompt = `
Lead information:

Name: ${name}
Phone available: ${phone ? "Yes" : "No"}
Treatment requested: ${treatment}
Days since inquiry: ${days}
Insurance flag: ${insurance ? "Yes" : "No"}
Deterministic priority score: ${score ?? "Not supplied"}/100
Priority tier: ${tier}

Explain the priority, draft a useful staff-review response,
and recommend the next action.
`;

    async function callOpenRouter(model) {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ai-dental-growth.vercel.app",
            "X-Title": "AI Dental Lead Response System"
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: systemPrompt
              },
              {
                role: "user",
                content: userPrompt
              }
            ],
            temperature: 0.4,
            max_tokens: 600
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error?.message ||
            `OpenRouter returned HTTP ${response.status}`
        );
      }

      const content = data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("The model returned an empty response.");
      }

      // Models sometimes wrap JSON in markdown fences.
      const cleaned = content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      let parsed;

      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // If a model doesn't obey JSON, still return its text safely.
        parsed = {
          summary: `AI analysis for ${tier} lead.`,
          reasoning: cleaned,
          reply: cleaned,
          next_step: "Review the draft and contact the lead manually."
        };
      }

      return {
        model: data?.model || model,
        result: parsed
      };
    }

    // First attempt: selected/default model.
    let ai;
    let fallbackUsed = false;

    try {
      ai = await callOpenRouter(
        typeof body.model === "string" && body.model.trim()
          ? body.model.trim()
          : FALLBACK_MODEL
      );
    } catch (primaryError) {
      // Automatic fallback.
      ai = await callOpenRouter(FALLBACK_MODEL);
      fallbackUsed = true;
    }

    return send(res, 200, {
      ok: true,
      score,
      tier,
      model: ai.model,
      fallback: fallbackUsed,
      ...ai.result
    });
  } catch (error) {
    console.error("AI TRIAGE ERROR:", error);

    return send(res, 502, {
      ok: false,
      error: "AI triage failed.",
      detail: error.message
    });
  }
};
