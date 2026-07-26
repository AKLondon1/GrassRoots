# Coaching AI privacy gate

Coaching suggestions are disabled by default. GrassRoots does not call OpenAI unless all of these conditions are met:

1. The deployment uses Supabase mode and the adult user is authenticated.
2. The adult has `development:manage` for the requested team.
3. A club privacy review has approved this limited use and `OPENAI_COACHING_ENABLED=true` is set on the server.
4. `OPENAI_API_KEY` and `OPENAI_MODEL` are configured as server-only environment variables.

The client sends only organisation, team and objective identifiers. A security-definer database function checks the coach’s scoped capability, then builds provider context from explicitly permitted canonical columns: a shortened display name, the active objective title and drill tags used by that team. The route does not accept client-authored prompt text. Medical data, safeguarding records, contact information, private observations and private reviews cannot enter this query.

Requests use the Responses API with `store: false` and strict JSON Schema output. `store: false` does not make a deployment eligible for Zero Data Retention; OpenAI may still retain abuse-monitoring logs under its data controls. Clubs that require different retention terms must complete the relevant provider process before enabling the feature.

Refusals, incomplete responses and schema failures are shown as failures and are never persisted as summaries. Successful output remains an unpersisted draft until a human coach reviews, edits and explicitly approves it. GrassRoots records model, prompt version, schema version, request hash, token usage and cost-calculation status as auditable metadata; it does not put raw prompts, private notes or provider output in the AI-run audit record.

Production rollout should add a configured pricing table before cost totals are displayed. Until then the route reports provider usage and an explicit `estimatedCostGbp: null` rather than inventing a cost.
