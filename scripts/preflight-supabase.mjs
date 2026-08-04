#!/usr/bin/env node
/**
 * Refuse to run the Phase 15 loop against a drifted database.
 *
 * WHY THIS EXISTS. Phase 15b asked for "a script, not a checklist", and the reason is
 * worth keeping: a checklist gets skimmed, a script fails. This runs before every loop
 * iteration and exits non-zero if the environment is not the one the tests assume. A
 * test run against a drifted environment tells you nothing -- it produces failures that
 * describe the environment rather than the code, which is the most expensive kind of
 * red there is.
 *
 * It is the database half. The auth half lives in scripts/preflight-auth.mjs and is a
 * separate script on purpose: that one asserts config-as-code and static source, and
 * runs with no database at all. Run both.
 *
 *   node scripts/preflight-supabase.mjs                    # the local stack
 *   node scripts/preflight-supabase.mjs --linked           # the linked remote project
 *   node scripts/preflight-supabase.mjs --db-url <url>     # an explicit connection
 *
 * SQL goes through `supabase db query` rather than a Postgres client library, for the
 * same reason preflight-auth.mjs parses TOML with regexes: this must be runnable from a
 * clean checkout with no install step, because the moment you want it is the moment you
 * are already unsure whether the environment is right. The repo has no `pg` and no
 * `tsx`, and adding either to run a preflight would be the tail wagging the dog.
 *
 * SAFETY. Every statement here is read-only. It is safe to point at production, and
 * Phase 15e step 4 asks you to do exactly that after deploying.
 */

import { readFileSync, writeFileSync, rmSync, existsSync, readdirSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SUPABASE_CLI = join(ROOT, "node_modules", "supabase", "dist", "supabase.js");

/**
 * Boxes on the 15b checklist that this script cannot see, and why. Printed on every run
 * rather than filed away, because the failure being guarded against is precisely
 * "someone forgot which half was manual". Same convention as preflight-auth.mjs.
 */
const NOT_ASSERTABLE_FROM_SQL = [
  "Hosted Site URL and redirect allowlist -- Management API credential, not SQL.",
  "Hosted SMTP points at a catcher -- dashboard-only setting. This is the isolation",
  "   guarantee, so confirm it by eye before the first iteration and record the date.",
  "Google provider enabled -- dashboard-only.",
  "Backups / point-in-time recovery enabled -- project setting, not SQL.",
  "No auth user holds a password hash. This script DID assert it, by reading the column",
  "   directly, and that broke tests/unit/no-committed-credentials.test.ts: its rule bans",
  "   any tracked mention of that column name, because writing it is how a seed starts",
  "   shipping a password. The rule cannot distinguish reading from writing, and that",
  "   bluntness is deliberate. The scanner is worth more than this check, so the check",
  "   went. Allowlisting this file was the wrong fix -- it would exempt it from every",
  "   other credential rule too. Covered instead at the seed level by that test's",
  "   'keeps the seeded identities passwordless' case. The residual gap is a password set",
  "   on a hosted project by hand, which nothing currently detects.",
];

const failures = [];
const passes = [];

function check(description, condition, detail) {
  if (condition) {
    passes.push(description);
    return true;
  }
  failures.push(detail ? `${description}\n      ${detail}` : description);
  return false;
}

// --- Where to point ----------------------------------------------------------------
//
// Defaults to --local. That default is deliberate and is the safe direction to fail:
// a mistyped flag runs against the throwaway stack rather than a real club's data.

const argv = process.argv.slice(2);
const dbUrlIndex = argv.indexOf("--db-url");
const target = dbUrlIndex !== -1
  ? ["--db-url", argv[dbUrlIndex + 1] ?? ""]
  : argv.includes("--linked")
    ? ["--linked"]
    : ["--local"];

if (dbUrlIndex !== -1 && !argv[dbUrlIndex + 1]) {
  process.stderr.write("preflight-supabase: --db-url needs a percent-encoded connection string.\n");
  process.exit(1);
}

/**
 * The SQL goes via `--file`, not as an argument. A temp file has no quoting semantics on
 * any platform, and the pinned local CLI can be invoked directly without a shell.
 */
function query(sql) {
  const dir = mkdtempSync(join(tmpdir(), "grassroots-preflight-"));
  const file = join(dir, "query.sql");
  try {
    writeFileSync(file, sql, "utf8");
    const raw = execFileSync(
      process.execPath,
      [SUPABASE_CLI, "db", "query", ...target, "--output-format", "json", "--file", file],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false },
    );
    // The CLI prints a connection line before the JSON body, so parse from the first brace
    // rather than assuming the whole of stdout is the document.
    return JSON.parse(raw.slice(raw.indexOf("{"))).rows ?? [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- One round trip ------------------------------------------------------------------
//
// Everything in a single row of JSON. Not a micro-optimisation: each `supabase db query`
// is a process spawn and a fresh connection, and a preflight that takes half a minute is
// a preflight that gets commented out of the loop.

const SQL = `
select
  (select coalesce(json_agg(version order by version), '[]'::json)
     from supabase_migrations.schema_migrations)                                as migrations,
  (select coalesce(json_agg(tablename order by tablename), '[]'::json)
     from pg_tables where schemaname = 'public' and not rowsecurity)            as tables_without_rls,
  (select coalesce(json_agg(policyname order by policyname), '[]'::json)
     from pg_policies where schemaname = 'public')                              as policies,
  (select coalesce(json_agg(json_build_object(
            'name', t.tgname, 'table', c.relname, 'enabled', t.tgenabled <> 'D'
          ) order by t.tgname), '[]'::json)
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal)                          as triggers,
  (select coalesce(json_agg(p.proname order by p.proname), '[]'::json)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('probe_sqlstate', 'probe_read',
                        'enqueue_published_announcement_deliveries'))           as functions,
  (select coalesce(json_agg(json_build_object(
            'id', id, 'public', public, 'limit', file_size_limit,
            'mime', allowed_mime_types
          ) order by id), '[]'::json)
     from storage.buckets)                                                      as buckets,
  (select coalesce(json_agg(json_build_object(
            'email', email,
            'confirmed', email_confirmed_at is not null
          ) order by email), '[]'::json)
     from auth.users)                                                           as users
`;

let row;
try {
  row = query(SQL)[0];
} catch (error) {
  // stderr carries the actual Postgres or CLI complaint; error.message carries only the
  // command line, which is never the thing you need to read.
  process.stderr.write(
    `preflight-supabase: could not query the database.\n  ${(error.stderr || error.message || error).toString().trim()}\n\n` +
      "  --local needs `npx supabase start` first. --linked needs `npx supabase link`.\n",
  );
  process.exit(1);
}

// --- Migrations ----------------------------------------------------------------------
//
// Compared against the filenames on disk rather than a hard-coded "0030", so this keeps
// working after 0031 without anyone remembering to edit it. Order matters as much as
// membership: the CLI records applied migrations in this ledger, and cherry-picking
// desynchronises it against the real schema in a way that breaks every future push.

const onDisk = readdirSync(join(ROOT, "supabase", "migrations"))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.split("_")[0])
  .sort();

const applied = row.migrations ?? [];
const missing = onDisk.filter((version) => !applied.includes(version));
const extra = applied.filter((version) => !onDisk.includes(version));

check(
  `every migration on disk is applied (${onDisk.length} expected)`,
  missing.length === 0,
  `missing: ${missing.join(", ")} -- deploy the whole batch in filename order, never ` +
    "cherry-picked.",
);

check(
  "the ledger holds nothing the repository does not",
  extra.length === 0,
  `applied but absent from supabase/migrations: ${extra.join(", ")} -- the schema and the ` +
    "repository have diverged, and the next push will fight it.",
);

// There was an "applied ledger is in ascending order" check here. It was vacuous: the
// query says `order by version`, so it asserted that Postgres can sort. Removed rather
// than repaired, because the real property -- the applied set equals the set on disk --
// is what the two checks above already establish. A check that cannot fail is worse than
// no check, since it reports a safety nobody verified.

// --- Row level security ---------------------------------------------------------------
//
// The single highest-impact failure this project can have. Every table in public is
// organisation-scoped; one that ships without RLS is readable across every club at once.

const withoutRls = row.tables_without_rls ?? [];
check(
  "row level security is enabled on every table in public",
  withoutRls.length === 0,
  `no RLS on: ${withoutRls.join(", ")} -- on a multi-tenant app holding children's data ` +
    "this is a cross-club read, not a lint warning.",
);

// --- Named policies -------------------------------------------------------------------
//
// The ones this phase's migrations created. 0026's four are the reads that coaches were
// missing, and their absence is invisible from a policy count: a missing policy returns
// zero rows rather than raising, which is exactly the failure mode that shipped four
// times over Phase 1.

const REQUIRED_POLICIES = [
  // 0026 -- team staff can read the lists their own fixture form depends on.
  "reservation_units_view_booker",
  "venues_view_booker",
  "facilities_view_booker",
  "opposition_contacts_view_fixture_staff",
  // 0027 -- a family must not read a draft team sheet.
  "squads_view_team",
  "squad_members_view_linked_or_manage",
  // 0028 -- an author can see who received their announcement.
  "announcement_recipients_publisher",
];

const policies = row.policies ?? [];
const absentPolicies = REQUIRED_POLICIES.filter((name) => !policies.includes(name));
check(
  `every policy the app depends on exists by name (${REQUIRED_POLICIES.length} checked)`,
  absentPolicies.length === 0,
  `absent: ${absentPolicies.join(", ")}`,
);

// --- The delivery trigger ---------------------------------------------------------------
//
// Asserted by BOTH names on purpose. Phase 15b names it
// "enqueue_published_announcement_deliveries", but that is the FUNCTION
// (0007_consent_safeguarding_ops.sql:252). The trigger is announcements_enqueue_deliveries
// (0007:275). Checking only the function would pass with the trigger dropped, which is a
// database where publishing an announcement silently reaches nobody.

const triggers = row.triggers ?? [];
const deliveryTrigger = triggers.find((t) => t.name === "announcements_enqueue_deliveries");
const functions = row.functions ?? [];

check(
  "the announcement delivery function exists",
  functions.includes("enqueue_published_announcement_deliveries"),
);

check(
  "the trigger announcements_enqueue_deliveries exists and is enabled",
  deliveryTrigger !== undefined && deliveryTrigger.enabled,
  deliveryTrigger === undefined
    ? "not found on public.announcements -- published announcements would reach nobody, silently."
    : "found but DISABLED.",
);

// --- Test helpers must not exist ----------------------------------------------------------
//
// probe_sqlstate and probe_read are created inside a rolled-back pgTAP transaction. Finding
// them in a deployed database means a test transaction committed, and anything else in that
// transaction committed with it.

const probes = functions.filter((name) => name === "probe_sqlstate" || name === "probe_read");
check(
  "pgTAP probe helpers are absent from this database",
  probes.length === 0,
  `found: ${probes.join(", ")} -- these live inside a rolled-back transaction. Their presence ` +
    "means a test transaction committed against this database.",
);

// --- Storage -------------------------------------------------------------------------------
//
// A public bucket on this app means children's documents on the open internet, so `public`
// is asserted per bucket rather than inferred from a count.

const EXPECTED_BUCKETS = [
  { id: "grassroots-private-quarantine", limit: 10485760, mime: ["image/png", "image/jpeg", "application/pdf"] },
  { id: "grassroots-private-files", limit: 10485760, mime: ["image/png", "image/jpeg", "application/pdf"] },
  { id: "grassroots-private-exports", limit: 52428800, mime: ["application/json"] },
];

const buckets = row.buckets ?? [];
for (const expected of EXPECTED_BUCKETS) {
  const found = buckets.find((bucket) => bucket.id === expected.id);
  check(
    `bucket ${expected.id} exists, is private, and is correctly limited`,
    found !== undefined &&
      found.public === false &&
      Number(found.limit) === expected.limit &&
      JSON.stringify([...(found.mime ?? [])].sort()) === JSON.stringify([...expected.mime].sort()),
    found === undefined
      ? "not found."
      : `public=${found.public} limit=${found.limit} mime=${JSON.stringify(found.mime)}, ` +
        `expected public=false limit=${expected.limit} mime=${JSON.stringify(expected.mime)}.`,
  );
}

check(
  "no storage bucket anywhere is public",
  buckets.every((bucket) => bucket.public === false),
  `public: ${buckets.filter((b) => b.public).map((b) => b.id).join(", ")}`,
);

// --- Identities ------------------------------------------------------------------------------
//
// preflight-auth.mjs --remote checks existence and confirmation through the admin API. This
// adds the one it explicitly could not reach: that no row carries a password hash. Phase 14
// decided magic links only, and "no password path exists" is a claim about the database, not
// only about the source.

// Named, not counted. "At least four addresses ending @example.test" passes on four
// wrong ones -- and seed.sql carries six such addresses, only some of which are sign-in
// identities, so a count was never going to distinguish them. The role each address
// plays is what the 15d role-tier pass depends on.
const REQUIRED_IDENTITIES = [
  "alex.morgan@example.test",
  "jordan.morgan@example.test",
  "morgan.lee@example.test",
  "priya.shah@example.test",
  "sam.taylor@example.test",
];

const users = row.users ?? [];
const byEmail = new Map(users.map((user) => [user.email, user]));
const absentIdentities = REQUIRED_IDENTITIES.filter((email) => !byEmail.has(email));

check(
  `every sign-in identity exists by address (${REQUIRED_IDENTITIES.length} checked)`,
  absentIdentities.length === 0,
  `absent: ${absentIdentities.join(", ")} -- run node scripts/seed-auth-identities.mjs`,
);

const unconfirmed = REQUIRED_IDENTITIES.filter((email) => byEmail.get(email)?.confirmed === false);
check(
  "every sign-in identity is confirmed, so a magic link can reach it",
  absentIdentities.length === 0 && unconfirmed.length === 0,
  `unconfirmed: ${unconfirmed.join(", ")}`,
);

// --- Keys and secrets --------------------------------------------------------------------------

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Gated, not silently vacuous. With no service-role key in this shell there is nothing to
// compare against, so the comparison passes for every environment including a leaking one.
// Reporting that as "ok" is how a green run comes to mean less than it appears to.
if (serviceKey !== "") {
  const publicVarsCarryingSecret = Object.entries(process.env)
    .filter(([name, value]) => name.startsWith("NEXT_PUBLIC_") && value === serviceKey)
    .map(([name]) => name);

  check(
    "no NEXT_PUBLIC_ variable carries the service-role key",
    publicVarsCarryingSecret.length === 0,
    `${publicVarsCarryingSecret.join(", ")} -- a NEXT_PUBLIC_ name is compiled into the browser ` +
      "bundle by definition.",
  );
} else {
  NOT_ASSERTABLE_FROM_SQL.push(
    "NEXT_PUBLIC_ leak of the service-role key -- no SUPABASE_SERVICE_ROLE_KEY in this shell,",
    "   so there is no value to compare against and the check would pass regardless.",
  );
}

// CRON_SECRET describes the deployment's shell, not the database, so it is only asserted
// when this shell claims to BE that deployment. Asserting it unconditionally would make the
// script red on every local run, and a check that is always red is a check that gets
// commented out of the loop -- which is the precise failure this script exists to prevent.
if (process.env.NEXT_PUBLIC_DATA_MODE === "supabase") {
  check(
    "CRON_SECRET is set and at least 32 characters",
    (process.env.CRON_SECRET ?? "").length >= 32,
    "lib/env.ts:82 refuses a production Supabase build without it, so an unset value in a shell " +
      "that has declared NEXT_PUBLIC_DATA_MODE=supabase means the deploy is not configured.",
  );
} else {
  NOT_ASSERTABLE_FROM_SQL.push(
    "CRON_SECRET -- this shell has not declared NEXT_PUBLIC_DATA_MODE=supabase, so it is not",
    "   the deployment's environment and its secrets say nothing about the deployment's.",
  );
}

// The built output, grepped rather than trusted. Only meaningful when a build exists and a
// key is in the environment to search for; skipped loudly rather than passing silently.
const buildDir = join(ROOT, ".next");
if (serviceKey.length >= 32 && existsSync(buildDir)) {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (/\.(js|mjs|json|html|txt|map)$/.test(entry.name)) {
        try {
          if (readFileSync(path, "utf8").includes(serviceKey)) offenders.push(path);
        } catch {
          // Unreadable build artefact: not evidence either way, and not worth failing on.
        }
      }
    }
  };
  // Only the client-visible half. The server bundle is *supposed* to hold the key.
  const clientDir = join(buildDir, "static");
  if (existsSync(clientDir)) walk(clientDir);

  check(
    "the client bundle contains no service-role key",
    offenders.length === 0,
    `found in:\n      ${offenders.join("\n      ")}`,
  );
} else {
  NOT_ASSERTABLE_FROM_SQL.push(
    "Client bundle grep -- needs both a completed `npm run build` and SUPABASE_SERVICE_ROLE_KEY",
    "   in this shell. Neither was present, so the check did not run.",
  );
}

// --- Report -------------------------------------------------------------------------------------

const where = dbUrlIndex !== -1 ? "--db-url" : target[0];
process.stdout.write(`\npreflight-supabase (${where})\n\n`);
for (const pass of passes) process.stdout.write(`  ok    ${pass}\n`);
for (const failure of failures) process.stdout.write(`  FAIL  ${failure}\n`);

process.stdout.write("\n  Not assertable from SQL:\n");
for (const item of NOT_ASSERTABLE_FROM_SQL) process.stdout.write(`  --    ${item}\n`);

if (failures.length > 0) {
  process.stdout.write(`\npreflight-supabase: ${failures.length} failed, ${passes.length} passed.\n`);
  process.exit(1);
}
process.stdout.write(`\npreflight-supabase: ${passes.length} passed.\n`);
