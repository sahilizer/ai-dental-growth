const PRIMARY_MODEL = "openai/gpt-oss-20b:free";
const SECONDARY_MODEL = "openrouter/free";

function send(res, status, data) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return send(res, 405, {
      ok: false,
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return send(res, 500, {
      ok: false,
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

    // The frontend owns the deterministic score.
    // AI must never change it.
    const score = Number.isFinite(Number(body.score))
      ? Number(body.score)
      : null;

    const tier =
      body.tier ||
      (score >= 75 ? "HOT" : score >= 55 ? "WARM" : "COLD");

    const systemPrompt = `
You are the AI response engine for a dental lead-management demonstration.

Return concise, professional JSON with exactly these fields:

{
  "summary": "...",
  "reasoning": "...",
  "reply": "...",
  "next_step": "..."
}

Rules:
- The supplied numerical score is deterministic and MUST NOT be changed.
- Explain priority using only the supplied lead data.
- Never invent clinic names, doctors, prices, discounts, insurance coverage,
  eligibility, appointment availability, diagnoses, or guarantees.
- Do not provide medical advice.
- This is a sales/operations demonstration, not a clinical system.
- The reply is only a staff-review draft.
- Never claim that a message was sent or an appointment was booked.
- Keep every field concise and useful to dental practice staff.
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

Explain why this lead has this priority,
draft a professional staff-review follow-up,
and recommend the next operational action.
`;

    async function callOpenRouter(model) {
      const controller = new AbortController();

      const timeout = setTimeout(() => {
        controller.abort();
      }, 12000);

      try {
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            signal: controller.signal,

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

              temperature: 0.3,
              max_tokens: 450
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

        const content =
          data?.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error(
            "The model returned an empty response."
          );
        }

        // Remove markdown JSON fences if the model adds them.
        const cleaned = content
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();

        let parsed;

        try {
          parsed = JSON.parse(cleaned);
        } catch {
          // Keep the demo usable even if the model ignores JSON format.
          parsed = {
            summary:
              `AI analysis for ${tier} lead with score ${score}/100.`,

            reasoning:
              cleaned,

            reply:
              cleaned,

            next_step:
              "Review the draft and contact the lead manually."
          };
        }

        return {
          model: data?.model || model,
          result: parsed
        };

      } finally {
        clearTimeout(timeout);
      }
    }

    /*
     * AI ATTEMPT 1
     *
     * Known free model.
     */
    try {
      const ai = await callOpenRouter(PRIMARY_MODEL);

      return send(res, 200, {
        ok: true,
        score,
        tier,
        model: ai.model,
        fallback: false,
        ai_source: "live",

        ...ai.result
      });

    } catch (primaryError) {

      console.warn(
        "Primary AI model failed:",
        primaryError.message
      );
    }

    /*
     * AI ATTEMPT 2
     *
     * OpenRouter free-model router.
     */
    try {
      const ai = await callOpenRouter(
        SECONDARY_MODEL
      );

      return send(res, 200, {
        ok: true,
        score,
        tier,
        model: ai.model,
        fallback: true,
        ai_source: "live",

        ...ai.result
      });

    } catch (secondaryError) {

      console.warn(
        "Secondary AI model failed:",
        secondaryError.message
      );
    }

    /*
     * FINAL DEMO FALLBACK
     *
     * The UI must never break simply because
     * an external AI provider is temporarily unavailable.
     */
    const insuranceText = insurance
      ? "Insurance is flagged as present in the demo."
      : "No insurance flag was supplied in the demo.";

    const phoneText = phone
      ? "A phone number is available for outreach."
      : "No phone number is available, so staff review is recommended.";

    return send(res, 200, {
      ok: true,
      score,
      tier,

      model: "deterministic-demo-fallback",

      fallback: true,
      ai_source: "demo-fallback",

      summary:
        `${tier} priority lead with a simulated score of ${score}/100.`,

      reasoning:
        `${treatment} is the requested treatment and the inquiry is ` +
        `${days} day${days === 1 ? "" : "s"} old. ` +
        `${insuranceText} ${phoneText}`,

      reply:
        `Hi ${name.split(" ")[0]}, thanks for contacting the practice ` +
        `about ${treatment.toLowerCase()}. We'd be happy to help with ` +
        `next steps. Please reply when convenient and our team can assist you.`,

      next_step:
        phone
          ? "Review the draft and contact the lead promptly."
          : "Review the lead and have staff identify an appropriate contact method."
    });

  } catch (error) {

    console.error(
      "AI TRIAGE ERROR:",
      error
    );

    /*
     * Even unexpected backend errors should not
     * destroy the demonstration.
     */
    return send(res, 200, {
      ok: true,

      score: null,
      tier: "COLD",

      model: "deterministic-demo-fallback",

      fallback: true,
      ai_source: "demo-fallback",

      summary:
        "Demo analysis is available without live AI.",

      reasoning:
        "The external AI service was temporarily unavailable.",

      reply:
        "Thanks for contacting the practice. " +
        "Our team will review your inquiry and follow up.",

      next_step:
        "Review the inquiry and follow up manually."
    });
  }
};
