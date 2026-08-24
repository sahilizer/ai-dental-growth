# Dental Lead Response System — Sales Demo

Single-file demo: simulated inquiry → AI intent scoring → drafted response →
placeholder booking CTA → scheduled follow-up → staff escalation →
New → Contacted → Booked.

**All patient data is fictional. Nothing is sent, booked, or contacted.
Runs fully offline — no dependencies, no backend, no network calls.**

## Run
Open `index.html` directly in a browser, or:

    python3 -m http.server 8080   # → http://localhost:8080

## Demo script
1. Click a seeded lead → walk the intent score, reasons, automation timeline.
2. Point out the PLACEHOLDER booking URL (`example.com`) and editable draft.
3. Submit a new inquiry **without a phone number** → watch the timeline play
   and staff escalation trigger automatically.
4. Mark Contacted → Booked (Booked is gated until Contacted).


## Commit

```bash
git add index.html README.md
git commit -m "v2: rename to Dental Lead Response System; fictional-data compliance, visible automation timeline, placeholder booking CTA, escalation rules, gated status flow"
git push origin main
```
