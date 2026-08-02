#!/usr/bin/env node

import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ITERATION_COUNT = 3;
const BUILD_ORIGIN = "https://phase15-staging.example.test";
const LOCAL_ORIGIN = "http://localhost:3000";
const LOCAL_CRON_SECRET = "phase-15-local-cron-secret-00000001";

function step(name, tool, args, envMode = "base", capture = false) {
  return { name, tool, args, envMode, capture };
}

export function createIterationPlan() {
  return Array.from({ length: ITERATION_COUNT }, (_unused, index) => ({
    iteration: index + 1,
    steps: [
      step("reset local database", "supabase", ["db", "reset", "--local"]),
      step("read local service status", "supabase", ["status", "--output", "json"], "base", true),
      step("seed confirmed auth identities", "node", ["scripts/seed-auth-identities.mjs"], "local"),
      step("preflight auth", "node", ["scripts/preflight-auth.mjs", "--remote"], "local"),
      step("preflight database", "node", ["scripts/preflight-supabase.mjs", "--local"], "local"),
      step("pgTAP", "supabase", ["test", "db", "--local"]),
      step("Vitest", "node", ["node_modules/vitest/vitest.mjs", "run"]),
      step("typecheck", "node", ["node_modules/typescript/bin/tsc", "--noEmit"]),
      step("lint", "node", ["node_modules/eslint/bin/eslint.js", ".", "--max-warnings=0"]),
      step("production build", "node", ["node_modules/next/dist/bin/next", "build"], "build"),
      step("demo browser suite", "node", ["node_modules/@playwright/test/cli.js", "test", "--workers=2"], "demo"),
      step("signed-in browser suite", "node", ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.supabase.config.ts"], "local"),
    ],
  }));
}

function commandFor(stepDefinition) {
  if (stepDefinition.tool === "node") {
    return { executable: process.execPath, args: stepDefinition.args };
  }
  if (stepDefinition.tool === "supabase") {
    const cli = join(ROOT, "node_modules", "supabase", "dist", "supabase.js");
    if (!existsSync(cli)) {
      throw new Error("The pinned Supabase CLI is not installed. Run npm install first.");
    }
    return { executable: process.execPath, args: [cli, ...stepDefinition.args] };
  }
  throw new Error(`Unsupported Phase 15 tool: ${stepDefinition.tool}`);
}

function baseEnvironment() {
  const environment = { ...process.env };
  if (process.platform === "win32") {
    const dockerBin = "C:\\Program Files\\Docker\\Docker\\resources\\bin";
    const nodeBin = dirname(process.execPath);
    const gitBin = join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "cmd");
    const inheritedPath = String(environment.PATH ?? environment.Path ?? "");
    for (const key of Object.keys(environment)) {
      if (key.toLowerCase() === "path") delete environment[key];
    }
    environment.Path = [nodeBin, gitBin, dockerBin, inheritedPath]
      .filter((entry, index, entries) => entry && entries.indexOf(entry) === index)
      .join(";");
  }
  return environment;
}

function environmentFor(mode, base, local) {
  if (mode === "local") return { ...base, ...local, APP_ORIGIN: LOCAL_ORIGIN };
  if (mode === "build") return { ...base, ...local, APP_ORIGIN: BUILD_ORIGIN };
  if (mode === "demo") {
    const demo = { ...base, NEXT_PUBLIC_DATA_MODE: "demo", APP_ORIGIN: BUILD_ORIGIN };
    delete demo.NEXT_PUBLIC_SUPABASE_URL;
    delete demo.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete demo.SUPABASE_SERVICE_ROLE_KEY;
    delete demo.SUPABASE_URL;
    return demo;
  }
  return base;
}

function runStep(stepDefinition, environment) {
  const command = commandFor(stepDefinition);
  const startedAt = Date.now();
  process.stdout.write(`\n[phase15] ${stepDefinition.name}\n`);

  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      cwd: ROOT,
      env: environment,
      shell: false,
      stdio: stepDefinition.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    if (stepDefinition.capture) {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
    }
    child.on("error", reject);
    child.on("close", (exitCode) => {
      const result = {
        name: stepDefinition.name,
        tool: stepDefinition.tool,
        args: stepDefinition.args,
        envMode: stepDefinition.envMode,
        exitCode: exitCode ?? 1,
        durationMs: Date.now() - startedAt,
      };
      if (exitCode === 0) {
        resolve({ result, stdout, stderr });
      } else {
        const error = new Error(`${stepDefinition.name} failed with exit code ${exitCode ?? 1}.`);
        error.phase15Result = result;
        reject(error);
      }
    });
  });
}

function localEnvironmentFromStatus(output) {
  const jsonStart = output.indexOf("{");
  if (jsonStart === -1) throw new Error("Local Supabase status did not return JSON.");
  const status = JSON.parse(output.slice(jsonStart));
  if (!status.API_URL || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error("Local Supabase status is missing an API URL or required local keys.");
  }
  return {
    NEXT_PUBLIC_DATA_MODE: "supabase",
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    CRON_SECRET: LOCAL_CRON_SECRET,
  };
}

function evidencePath(startedAt) {
  const directory = join(ROOT, "test-results", "phase-15");
  mkdirSync(directory, { recursive: true });
  return join(directory, `${startedAt.replaceAll(":", "-")}.json`);
}

function writeEvidence(path, evidence) {
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

export async function runPhase15Loop() {
  if (process.argv.length > 2) {
    throw new Error("The Phase 15 loop accepts no target arguments; it is local-only.");
  }

  const startedAt = new Date().toISOString();
  const path = evidencePath(startedAt);
  const evidence = {
    startedAt,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    consecutiveGreen: 0,
    status: "running",
    iterations: [],
  };
  writeEvidence(path, evidence);

  const base = baseEnvironment();

  try {
    for (const iterationPlan of createIterationPlan()) {
      const iteration = { iteration: iterationPlan.iteration, status: "running", commands: [] };
      evidence.iterations.push(iteration);
      let local = null;
      writeEvidence(path, evidence);

      for (const plannedStep of iterationPlan.steps) {
        if (plannedStep.envMode !== "base" && !local) {
          throw new Error(`Local environment was not loaded before ${plannedStep.name}.`);
        }
        const execution = await runStep(
          plannedStep,
          environmentFor(plannedStep.envMode, base, local ?? {}),
        );
        iteration.commands.push(execution.result);
        if (plannedStep.name === "read local service status") {
          local = localEnvironmentFromStatus(execution.stdout);
        }
        writeEvidence(path, evidence);
      }

      iteration.status = "green";
      evidence.consecutiveGreen += 1;
      writeEvidence(path, evidence);
    }

    evidence.status = "green";
    evidence.finishedAt = new Date().toISOString();
    writeEvidence(path, evidence);
    process.stdout.write(`\n[phase15] ${evidence.consecutiveGreen} consecutive green iterations.\n`);
    process.stdout.write(`[phase15] Evidence: ${path}\n`);
    return evidence;
  } catch (error) {
    const iteration = evidence.iterations.at(-1);
    if (iteration) {
      iteration.status = "red";
      if (error?.phase15Result) iteration.commands.push(error.phase15Result);
    }
    evidence.status = "red";
    evidence.finishedAt = new Date().toISOString();
    evidence.failure = error instanceof Error ? error.message : String(error);
    writeEvidence(path, evidence);
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runPhase15Loop().catch((error) => {
    process.stderr.write(`[phase15] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
