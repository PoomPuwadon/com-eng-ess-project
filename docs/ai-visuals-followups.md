# AI visuals: follow-up tasks (not built)

1. **AI agents in the Leisure Suite (VT-01)** (requested 2026-11-19): AI agents can also take part in the Leisure Suite and are seen
   walking around near the entrance, mostly at the roulettes. Out of scope for the OT-01 / OT-02 / VT-02 build, so nothing is done yet.
   Open points to decide first: which agents (new ones or the existing key agents), whether they actually play (that touches money logic:
   needs the action gateway, caps, `model` recorded on every stake, and the money-ledger rules) or only walk and watch, and the cost/budget
   (cheapest is rule-book walkers with no LLM calls). Reuse `src/ai/agentActor.js`, `agentCard.js` and the feed (`room` list would need a VT-01 entry).
2. Real-GPU fps and draw-call measurement for OT-01, OT-02 and VT-02 (headless software rendering gave no usable numbers).
