#!/usr/bin/env node
/**
 * Make the seeded identities able to sign in, without committing a credential.
 *
 * WHY THIS EXISTS. `supabase/seed.sql` inserts skeletal `auth.users` rows: id, email
 * and display name, and nothing else. No password, no `email_confirmed_at`, no `aud`,
 * no `role`. They are there to satisfy the foreign keys from `public.profiles` and
 * `public.memberships`, and Task 13 established that none of them can authenticate by
 * any route. That is what made the role-tier browser pass impossible rather than
 * merely undone.
 *
 * The obvious fix is to put a password in `seed.sql`. That is the shortcut Task 13
 * refused, and this script exists so nobody takes it: a credential committed to the
 * seed ends up in staging, in every fork, and in every developer's shell history, and
 * `tests/unit/no-committed-credentials.test.ts` fails the build if one appears.
 *
 * So the credential lives in the environment, the script is committed, and the two
 * never meet in git. No password is set here either, because the project's decision
 * is magic links only: this script confirms the accounts and can mint one-time links,
 * and there is no password to steal because none is ever created.
 *
 * Run after `supabase db reset`, which recreates the skeletal rows:
 *
 *   node scripts/seed-auth-identities.mjs           # confirm the accounts
 *   node scripts/seed-auth-identities.mjs --links   # ...and print sign-in links
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 * in the environment. Neither has a default, on purpose: a default service-role key
 * is a committed credential wearing a hat.
 */

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "0.0.0.0"]);

/**
 * The four the role-tier browser pass needs, plus the second guardian the household
 * screens use. Matched by email against rows `seed.sql` already created, and updated
 * in place: creating parallel users would leave every foreign key in the seed
 * pointing at the wrong person.
 */
const IDENTITIES = [
  { email: "alex.morgan@example.test", note: "guardian, two children (the only child selector)" },
  { email: "sam.taylor@example.test", note: "coach of the Under 11s, and a guardian" },
  { email: "priya.shah@example.test", note: "club administrator" },
  { email: "morgan.lee@example.test", note: "platform operator (must see no club data)" },
  { email: "jordan.morgan@example.test", note: "second guardian in the Morgan household" },
];

function fail(message) {
  process.stderr.write(`seed-auth-identities: ${message}\n`);
  process.exit(1);
}

function readConfig(argv) {
  if (process.env.NODE_ENV === "production") {
    fail("refusing to run with NODE_ENV=production.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) fail("set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).");
  if (!serviceRoleKey) fail("set SUPABASE_SERVICE_ROLE_KEY. There is no default.");

  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    fail(`"${url}" is not a valid URL.`);
  }

  const force = argv.includes("--force");
  if (!LOCAL_HOSTS.has(hostname) && !force) {
    // A service-role key plus a remote URL is enough to rewrite anybody's auth table.
    // Staging is a legitimate target; a slip of the shell is not, so it has to be said
    // out loud.
    fail(
      `${hostname} is not a local Supabase. Re-run with --force if you really mean to ` +
        "change that project's users.",
    );
  }

  return { url: url.replace(/\/$/, ""), serviceRoleKey, withLinks: argv.includes("--links") };
}

async function admin(config, path, init = {}) {
  const response = await fetch(`${config.url}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body && typeof body === "object" ? JSON.stringify(body) : response.statusText;
    throw new Error(`${init.method ?? "GET"} ${path} -> ${response.status} ${detail}`);
  }
  return body;
}

async function findUsersByEmail(config) {
  const byEmail = new Map();
  // Paginated deliberately rather than assuming one page: a developer's local stack
  // accumulates users, and silently missing one would look like the script worked.
  for (let page = 1; page <= 20; page += 1) {
    const body = await admin(config, `/admin/users?page=${page}&per_page=200`);
    const users = Array.isArray(body?.users) ? body.users : [];
    for (const user of users) {
      if (user?.email) byEmail.set(String(user.email).toLowerCase(), user);
    }
    if (users.length < 200) break;
  }
  return byEmail;
}

async function main() {
  const config = readConfig(process.argv.slice(2));
  const existing = await findUsersByEmail(config);

  const results = [];
  for (const identity of IDENTITIES) {
    const user = existing.get(identity.email);
    if (!user) {
      results.push({ ...identity, state: "missing" });
      continue;
    }

    // `email_confirm: true` is what turns a skeletal row into an account GoTrue will
    // issue a session for. No password is set, so there is nothing here to leak.
    await admin(config, `/admin/users/${user.id}`, {
      method: "PUT",
      body: JSON.stringify({ email_confirm: true }),
    });

    let link;
    if (config.withLinks) {
      const generated = await admin(config, "/admin/generate_link", {
        method: "POST",
        body: JSON.stringify({ type: "magiclink", email: identity.email }),
      });
      link = generated?.properties?.action_link ?? generated?.action_link;
    }
    results.push({ ...identity, state: "confirmed", link });
  }

  const confirmed = results.filter((row) => row.state === "confirmed");
  const missing = results.filter((row) => row.state === "missing");

  for (const row of confirmed) {
    process.stdout.write(`  ok       ${row.email.padEnd(30)} ${row.note}\n`);
    if (row.link) process.stdout.write(`           ${row.link}\n`);
  }
  for (const row of missing) {
    process.stdout.write(`  MISSING  ${row.email.padEnd(30)} run supabase db reset first\n`);
  }

  process.stdout.write(`\n${confirmed.length} confirmed, ${missing.length} missing.\n`);
  if (config.withLinks) {
    process.stdout.write(
      "Links are one-time and expire. They are printed, never written to a file.\n",
    );
  }
  if (missing.length) process.exit(1);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
