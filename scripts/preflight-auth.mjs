#!/usr/bin/env node
/**
 * Assert the auth configuration Phase 14f set, so a dashboard edit cannot silently undo it.
 *
 * WHY THIS EXISTS. Half of 14f is config-as-code (`supabase/config.toml`) and half is a
 * hosted project's dashboard, which no file in this repo can see. The plan's rule for that
 * split is the only one that survives contact with reality: "Configure it however you like;
 * prove it in code." A setting changed by hand at 11pm and never written down is not a
 * configuration, it is a rumour.
 *
 * So this script is the proof half. Every box on the 14f checklist is either asserted here
 * or listed in NOT_ASSERTABLE_LOCALLY below with the reason it cannot be. Nothing on that
 * checklist may be silently absent from both lists.
 *
 *   node scripts/preflight-auth.mjs              # local config + static source assertions
 *   node scripts/preflight-auth.mjs --remote     # ...and check identities on a project
 *
 * The --remote pass needs SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or
 * SUPABASE_URL). Neither has a default, for the reason given in seed-auth-identities.mjs.
 */

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The 14f boxes that cannot be checked from this repository, and why. Printed on every run
 * rather than filed in a document, because the failure this whole script guards against is
 * exactly "someone forgot which half was manual".
 */
const NOT_ASSERTABLE_LOCALLY = [
  "Hosted Site URL and redirect allowlist -- no Management API credential in this repo.",
  "Hosted SMTP points at a catcher, not a real sender -- dashboard-only setting.",
  "Hosted OTP rate limits -- readable in the dashboard; record them in docs/AUTH-PROVISIONING.md.",
  "Google provider left untouched -- absence of change is not observable from here.",
  "No auth.users row holds a password hash -- auth.users is not reachable from the",
  "   service-role REST API; assert it in pgTAP against the local database instead.",
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

// --- The local project's config, read as text ------------------------------------------
//
// Parsed with regexes rather than a TOML library on purpose: this script must run from a
// clean checkout with no install step, because its whole job is to be runnable at the
// moment somebody is wondering whether the config is right.

const configPath = join(ROOT, "supabase", "config.toml");
if (!existsSync(configPath)) {
  process.stderr.write("preflight-auth: supabase/config.toml is missing.\n");
  process.exit(1);
}
const config = readFileSync(configPath, "utf8");

function scalar(key) {
  const match = config.match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\n#]+)"?`, "m"));
  return match ? match[1].trim() : null;
}

const siteUrl = scalar("site_url");
const redirectsRaw = config.match(/^\s*additional_redirect_urls\s*=\s*\[([^\]]*)\]/m);
const redirects = redirectsRaw
  ? redirectsRaw[1].split(",").map((entry) => entry.trim().replace(/^"|"$/g, "")).filter(Boolean)
  : [];
const otpExpiry = Number(scalar("otp_expiry"));
const emailSent = Number(scalar("email_sent"));

// The application's own idea of its origin. If these two disagree the magic link is built
// against an origin the app then refuses -- which is exactly the bug 14f found, where
// config.toml said 127.0.0.1 and .env.example said localhost.
const envExample = readFileSync(join(ROOT, ".env.example"), "utf8");
const appOrigin = envExample.match(/^APP_ORIGIN=(.+)$/m)?.[1]?.trim() ?? null;

check(
  "site_url equals APP_ORIGIN from .env.example",
  siteUrl !== null && appOrigin !== null && siteUrl === appOrigin,
  `site_url=${siteUrl} APP_ORIGIN=${appOrigin} -- compared as strings, because 'localhost' ` +
    "and '127.0.0.1' are different origins to a browser.",
);

check(
  "redirect allowlist is exactly the callback path, with no wildcard",
  redirects.length === 1 &&
    redirects[0] === `${appOrigin}/auth/callback` &&
    !redirects.some((entry) => entry.includes("*")),
  `found ${JSON.stringify(redirects)}, expected ["${appOrigin}/auth/callback"] -- a bare ` +
    "origin or a wildcard here undoes the origin check in lib/supabase/oauth.ts:20-27.",
);

check(
  "magic-link expiry is set deliberately, between 15 and 60 minutes",
  Number.isFinite(otpExpiry) && otpExpiry >= 900 && otpExpiry <= 3600,
  `otp_expiry=${otpExpiry}s -- under 15 minutes fails honest users on phones and burns the ` +
    "send limit on retries; over an hour leaves a live credential in a shared mailbox.",
);

// 14d asks for an asserted number, not an assumed one. The floor is what the exit condition
// needs: four identities signing in, with retries, inside one session.
check(
  "email send limit can serve the four test identities",
  Number.isFinite(emailSent) && emailSent >= 10,
  `email_sent=${emailSent}/hour -- magic links are the only way in, so this is the ceiling ` +
    "on signing in at all, and a throttled send is reported to the user as success.",
);

// --- The magic-link template ------------------------------------------------------------

const templateConfigured = /\[auth\.email\.template\.magic_link\]/.test(config);
const templatePath = join(ROOT, "supabase", "templates", "magic_link.html");
const template = existsSync(templatePath) ? readFileSync(templatePath, "utf8") : "";

check("magic-link template is configured and present", templateConfigured && template.length > 0);

check(
  "template tells the reader what the link does and what to do if unexpected",
  /ConfirmationURL/.test(template) && /\.Email/.test(template) && /ignore this/i.test(template),
  "It must name the address, render the link, and say that ignoring an unrequested email is " +
    "sufficient -- this is the only mail a parent sees before they have an account.",
);

// The stated duration and the configured one must agree, or the email lies to the reader.
const statedMinutes = Number(template.match(/expires in\s*<[^>]*>\s*(\d+)\s*minutes/i)?.[1]);
check(
  "expiry stated in the email matches otp_expiry",
  Number.isFinite(statedMinutes) && statedMinutes * 60 === otpExpiry,
  `email says ${statedMinutes} minutes, config says ${otpExpiry / 60}.`,
);

// --- Magic links only, enforced rather than intended ------------------------------------
//
// There is no project-level setting that disables password sign-in: 14f's checklist asks for
// one and the CLI schema has no such key. This is the substitute, and it is stronger than a
// toggle would have been, because it fails the build rather than sitting in a dashboard.

// This file names the methods it forbids, so it matches its own search. Excluding the
// scanner's own source is not a loophole: this is where the pattern is defined, and the
// same exclusion exists for the same reason in tests/unit/no-committed-credentials.test.ts.
// Excluding any OTHER file would be a loophole, which is why this is a single exact path
// rather than a list somebody can grow.
const SELF = "scripts/preflight-auth.mjs";

let passwordCallSites = "";
try {
  passwordCallSites = execFileSync(
    "git",
    ["grep", "-l", "-e", "signInWithPassword", "-e", "sign_in_with_password", "--", "*.ts", "*.tsx", "*.mjs", "*.js"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
} catch {
  // git grep exits 1 when there are no matches, which is the passing case.
  passwordCallSites = "";
}

passwordCallSites = passwordCallSites
  .split("\n")
  .filter((path) => path !== "" && path !== SELF)
  .join("\n");

check(
  "no tracked source file calls a password sign-in method",
  passwordCallSites === "",
  `found in:\n      ${passwordCallSites.split("\n").join("\n      ")}\n      The moment a ` +
    "password path exists for a test, it exists for an attacker.",
);

// --- Optional remote pass ----------------------------------------------------------------

if (process.argv.includes("--remote")) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    failures.push(
      "--remote needs NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
    );
  } else {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (error) {
      failures.push(`could not list users: ${error.message}`);
    } else {
      const seeded = data.users.filter((user) => user.email?.endsWith("@example.test"));
      check(
        "the seeded identities exist on this project",
        seeded.length > 0,
        "None found. Seeding runs against the database, not this script.",
      );
      // An unconfirmed account cannot receive a magic link, which is precisely the state
      // Task 13 found and could not get past.
      check(
        "every seeded identity is confirmed, so a link can reach it",
        seeded.length > 0 && seeded.every((user) => user.email_confirmed_at),
        `unconfirmed: ${seeded.filter((u) => !u.email_confirmed_at).map((u) => u.email).join(", ")}` +
          " -- run: node scripts/seed-auth-identities.mjs",
      );
    }
  }
}

// --- Report -------------------------------------------------------------------------------

for (const pass of passes) process.stdout.write(`  ok    ${pass}\n`);
for (const failure of failures) process.stdout.write(`  FAIL  ${failure}\n`);

process.stdout.write("\n  Not assertable from this repository:\n");
for (const item of NOT_ASSERTABLE_LOCALLY) process.stdout.write(`  --    ${item}\n`);

if (failures.length > 0) {
  process.stdout.write(`\npreflight-auth: ${failures.length} failed, ${passes.length} passed.\n`);
  process.exit(1);
}
process.stdout.write(`\npreflight-auth: ${passes.length} passed.\n`);
