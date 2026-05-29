#!/usr/bin/env node
/**
 * Wolf Runner — Novel Pipeline CLI
 * Phase-aware runner with artifact protocol enforcement.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CWD = process.cwd();
const CASES_DIR = path.join(CWD, "content", "cases");
const MAX_ROLLBACKS = 3;
const VALID_CASE_STATUSES = new Set(["active", "delivered", "blocked", "fused", "archived"]);
const NODE_COMMANDS = new Map([
  ["brief-lock", { node: "brief", phase: "brief", gate: "trick-lock" }],
  ["trick-lock", { node: "trick", phase: "trick_locked", gate: "draft-start" }],
  ["draft-start", { node: "draft", phase: "drafting", gate: "review-start" }],
  ["review-start", { node: "review", phase: "reviewing", gate: "editor-judge" }],
  ["editor-judge", { node: "editor", phase: "editor_judging", gate: "publish-prep" }],
  ["publish-prep", { node: "publish_prep", phase: "publish_ready", gate: "human_live_publish_approval" }],
]);

function usage() {
  console.log(`
Usage: wolf-runner <command> [options]

Commands:
  case init <case-name>          Initialize a new case with artifact protocol
  case check <case-name>         Validate case artifacts against protocol
  case status <case-name>        Print state, manifest, and detected versions
  case rollback <case-name>      Record rollback to a prior version
                                  Options: --to vN [--reason TEXT] [--owner NAME]
  case promote <case-name>       Promote current version
                                  Options: --version vN --owner NAME --reason TEXT
  case recover <case-name>       Recover a fused case after manual approval
                                  Options: --manual --owner NAME --reason TEXT
  case agent-start <case-name>   Record a child-agent run lease
                                  Options: --owner NAME --target PATH
  case agent-finish <case-name>  Finish a child-agent run
                                  Options: --owner NAME --status done|failed
  case brief <case-name>         Print compact handoff context
  case brief-lock <case-name>    Mark brief node complete
  case trick-lock <case-name>    Lock core trick and write lock_hash
  case draft-start <case-name>   Prepare draft node
  case review-start <case-name>  Prepare review node
  case editor-judge <case-name>  Prepare editor judge node
  case publish-prep <case-name>  Prepare publish node without live publish
  case archive <case-name>       Archive current case state snapshot
                                  Options: [--reason TEXT] [--owner NAME]
  case lock <case-name>          Acquire a lightweight case write lease
                                  Options: --owner NAME [--ttl-minutes N]
  case unlock <case-name>        Release a case write lease
                                  Options: --owner NAME
  case list                      List all cases

Options:
  --no-write                     Do not update manifest during check
  --help, -h                     Show this help
`);
  process.exit(0);
}

// ─── Protocol Definition ───────────────────────────────────────

const ARTIFACT_PROTOCOL = {
  requiredDirs: [
    ".case",
    "00-meta",
    "01-brief",
    "02-research",
    "03-outline",
    "04-drafts",
    "05-reviews",
    "06-deliverables",
  ],
  requiredFiles: {
    "00-meta": ["meta.md", "characters.json", "truth-file.json"],
    "01-brief": ["brief.md"],
    "03-outline": [], // populated dynamically per version
    "04-drafts": [], // versioned subdirs
    "05-reviews": [], // versioned subdirs
    "06-deliverables": [], // populated on completion
  },
};

// ─── Case Init ─────────────────────────────────────────────────

function initCase(caseName) {
  if (!caseName) {
    console.error("Error: case name required");
    process.exit(1);
  }

  const caseDir = path.join(CASES_DIR, caseName);
  if (fs.existsSync(caseDir)) {
    console.error(`Error: case '${caseName}' already exists at ${caseDir}`);
    process.exit(1);
  }

  // Create directories
  for (const dir of ARTIFACT_PROTOCOL.requiredDirs) {
    fs.mkdirSync(path.join(caseDir, dir), { recursive: true });
  }

  // Create versioned subdirs
  fs.mkdirSync(path.join(caseDir, "04-drafts", "v1", "chapters"), { recursive: true });
  fs.mkdirSync(path.join(caseDir, "05-reviews", "v1"), { recursive: true });

  // Write template files
  const templates = {
    [path.join(caseDir, "00-meta", "meta.md")]: metaTemplate(caseName),
    [path.join(caseDir, "00-meta", "characters.json")]: charactersTemplate(),
    [path.join(caseDir, "00-meta", "truth-file.json")]: truthFileTemplate(),
    [path.join(caseDir, "01-brief", "brief.md")]: briefTemplate(),
    [path.join(caseDir, ".case", "state.json")]: stateTemplate(caseName),
    [path.join(caseDir, ".case", "manifest.json")]: manifestTemplate(caseName),
  };

  for (const [filePath, content] of Object.entries(templates)) {
    fs.writeFileSync(filePath, content, "utf-8");
  }

  console.log(`Initialized case: ${caseName}`);
  console.log(`  Path: ${caseDir}`);
  console.log(`  Run:  wolf-runner case check ${caseName}`);
}

// ─── Case Check ────────────────────────────────────────────────

function checkCase(caseName) {
  const options = parseOptions(process.argv.slice(5));
  if (!caseName) {
    console.error("Error: case name required");
    process.exit(1);
  }

  const caseDir = path.join(CASES_DIR, caseName);
  if (!fs.existsSync(caseDir)) {
    console.error(`Error: case '${caseName}' not found`);
    process.exit(1);
  }

  const report = {
    case: caseName,
    status: "PASS",
    checks: [],
    violations: [],
  };

  let state = null;
  try {
    state = loadState(caseDir, caseName);
  } catch (err) {
    report.status = "BLOCKED";
    report.violations.push(`Invalid state.json: ${err.message}`);
  }

  // Check 1: Required directories
  for (const dir of ARTIFACT_PROTOCOL.requiredDirs) {
    const dirPath = path.join(caseDir, dir);
    const exists = fs.existsSync(dirPath);
    report.checks.push({ check: `dir:${dir}`, status: exists ? "PASS" : "FAIL" });
    if (!exists) {
      report.status = "BLOCKED";
      report.violations.push(`Missing directory: ${dir}`);
    }
  }

  // Check 2: Required files per directory
  for (const [dir, files] of Object.entries(ARTIFACT_PROTOCOL.requiredFiles)) {
    for (const file of files) {
      const filePath = path.join(caseDir, dir, file);
      const exists = fs.existsSync(filePath);
      report.checks.push({ check: `file:${dir}/${file}`, status: exists ? "PASS" : "FAIL" });
      if (!exists) {
        if (report.status !== "BLOCKED") report.status = "WARN";
        report.violations.push(`Missing file: ${dir}/${file}`);
      }
    }
  }

  // Check 3: UTF-8 encoding on all .md and .json files
  const allFiles = walkDir(caseDir);
  for (const file of allFiles) {
    if (file.endsWith(".md") || file.endsWith(".json")) {
      const content = fs.readFileSync(file);
      const isUtf8 = isValidUtf8(content);
      const relPath = path.relative(caseDir, file);
      report.checks.push({ check: `encoding:${relPath}`, status: isUtf8 ? "PASS" : "FAIL" });
      if (!isUtf8) {
        if (report.status !== "BLOCKED") report.status = "WARN";
        report.violations.push(`Non-UTF-8 encoding: ${relPath}`);
      }
    }
  }

  // Check 4: Markdown heading structure in .md files
  for (const file of allFiles) {
    if (file.endsWith(".md")) {
      const content = fs.readFileSync(file, "utf-8");
      const headingCheck = checkMarkdownHeadings(content);
      const relPath = path.relative(caseDir, file);
      report.checks.push({ check: `headings:${relPath}`, status: headingCheck.ok ? "PASS" : "WARN" });
      if (!headingCheck.ok) {
        if (report.status !== "BLOCKED") report.status = "WARN";
        report.violations.push(`Heading issues in ${relPath}: ${headingCheck.issues.join(", ")}`);
      }
    }
  }

  // Check 5: Locked core trick contract
  const truthFilePath = path.join(caseDir, "00-meta", "truth-file.json");
  if (fs.existsSync(truthFilePath)) {
    try {
      const truthFile = JSON.parse(fs.readFileSync(truthFilePath, "utf-8"));
      const coreTrickCheck = checkCoreTrickLock(truthFile, caseDir);
      report.checks.push({
        check: "contract:00-meta/truth-file.json:core_trick",
        status: coreTrickCheck.ok ? "PASS" : "WARN",
      });
      if (!coreTrickCheck.ok) {
        if (report.status !== "BLOCKED") report.status = "WARN";
        report.violations.push(`Core trick lock issues: ${coreTrickCheck.issues.join(", ")}`);
      }
    } catch (err) {
      report.checks.push({
        check: "contract:00-meta/truth-file.json:core_trick",
        status: "FAIL",
      });
      report.status = "BLOCKED";
      report.violations.push(`Invalid truth-file.json: ${err.message}`);
    }
  }

  // Check 6: Version and state consistency
  const versionSummary = detectCaseVersions(caseDir);
  const stateCheck = checkStateConsistency(state, versionSummary);
  report.checks.push({
    check: "contract:.case/state.json:version_state",
    status: stateCheck.ok ? "PASS" : "WARN",
  });
  if (!stateCheck.ok) {
    if (stateCheck.blocking) report.status = "BLOCKED";
    else if (report.status !== "BLOCKED") report.status = "WARN";
    report.violations.push(`State consistency issues: ${stateCheck.issues.join(", ")}`);
  }

  // Check 7: Structured review/editor schema contracts
  const schemaCheck = checkStructuredArtifacts(caseDir);
  for (const check of schemaCheck.checks) {
    report.checks.push(check);
  }
  if (!schemaCheck.ok) {
    report.status = "BLOCKED";
    report.violations.push(...schemaCheck.issues);
  }

  // Update manifest
  const manifestPath = path.join(caseDir, ".case", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  manifest.detectedVersions = versionSummary.versions;
  manifest.highestDetectedVersion = versionSummary.highest || null;
  if (!options["no-write"]) {
    manifest.lastChecked = new Date().toISOString();
    manifest.checkResult = report.status;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  }

  // Output
  console.log(`\nCase: ${caseName}`);
  console.log(`Status: ${report.status}`);
  console.log(`Detected versions: ${versionSummary.versions.join(", ") || "none"}`);
  console.log(`Highest version: ${versionSummary.highest || "none"}`);
  if (report.violations.length > 0) {
    console.log("\nViolations:");
    for (const v of report.violations) {
      console.log(`  - ${v}`);
    }
  }
  console.log(`\nChecks: ${report.checks.filter((c) => c.status === "PASS").length}/${report.checks.length} passed`);

  process.exit(report.status === "PASS" ? 0 : report.status === "WARN" ? 0 : 1);
}

// ─── Case Status / Rollback / Archive ─────────────────────────

function statusCase(caseName) {
  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  const manifest = readJson(path.join(caseDir, ".case", "manifest.json"));
  const versions = detectCaseVersions(caseDir);
  console.log(JSON.stringify({ state, manifest, versions }, null, 2));
}

function rollbackCase(caseName, args) {
  const options = parseOptions(args);
  const targetVersion = normalizeVersion(options.to);
  if (!targetVersion) {
    console.error("Error: rollback requires --to vN");
    process.exit(1);
  }

  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  if (state.status === "fused" || state.status === "archived") {
    console.error(`Error: case '${caseName}' is ${state.status}; rollback is blocked`);
    process.exit(1);
  }

  const versionSummary = detectCaseVersions(caseDir);
  if (!versionSummary.versions.includes(targetVersion)) {
    console.error(`Error: target version '${targetVersion}' not found in case artifacts`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const event = {
    at: now,
    to: targetVersion,
    from: state.current_version || versionSummary.highest || null,
    owner: options.owner || "unknown",
    reason: options.reason || "unspecified",
  };

  state.rollback_count = Number(state.rollback_count || 0) + 1;
  state.rollback_history = Array.isArray(state.rollback_history) ? state.rollback_history : [];
  state.rollback_history.push(event);
  state.current_version = targetVersion;
  state.status = "active";
  state.phase = "rollback";
  state.updated_at = now;
  state.version_index = versionSummary.versions;
  state.active_run = {
    run_id: `rollback-${timestampId(now)}`,
    owner: event.owner,
    started_at: now,
    status: "recorded",
  };

  if (state.rollback_count >= MAX_ROLLBACKS) {
    state.status = "fused";
    state.phase = "fused";
    state.circuit_breaker = {
      fused: true,
      fused_at: now,
      reason: `rollback_count reached ${state.rollback_count}/${MAX_ROLLBACKS}`,
      next_action: "human_editor_decision_required",
    };
    const archivePath = archiveCaseSnapshot(caseDir, {
      reason: "rollback-fused",
      owner: event.owner,
      at: now,
    });
    state.archive_path = path.relative(caseDir, archivePath).replace(/\\/g, "/");
  }

  writeJson(path.join(caseDir, ".case", "state.json"), state);
  updateManifest(caseDir, {
    lastRollback: event,
    rollbackCount: state.rollback_count,
    caseStatus: state.status,
    archivePath: state.archive_path || null,
  });

  console.log(`Rollback recorded: ${caseName} -> ${targetVersion}`);
  console.log(`Rollback count: ${state.rollback_count}/${MAX_ROLLBACKS}`);
  if (state.status === "fused") {
    console.log("Status: fused");
    console.log(`Archive snapshot: ${state.archive_path}`);
  }
}

function archiveCase(caseName, args) {
  const options = parseOptions(args);
  const caseDir = requireCaseDir(caseName);
  const now = new Date().toISOString();
  const state = loadState(caseDir, caseName);
  const archivePath = archiveCaseSnapshot(caseDir, {
    reason: options.reason || "manual-archive",
    owner: options.owner || "unknown",
    at: now,
  });
  state.archive_path = path.relative(caseDir, archivePath).replace(/\\/g, "/");
  state.updated_at = now;
  writeJson(path.join(caseDir, ".case", "state.json"), state);
  updateManifest(caseDir, { archivePath: state.archive_path, lastArchiveAt: now });
  console.log(`Archive snapshot: ${state.archive_path}`);
}

function lockCase(caseName, args) {
  const options = parseOptions(args);
  const owner = options.owner;
  if (!owner) {
    console.error("Error: lock requires --owner NAME");
    process.exit(1);
  }
  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  const now = new Date();
  const activeRun = state.active_run;
  if (activeRun && activeRun.status === "locked") {
    const expiresAt = activeRun.lease_expires_at ? new Date(activeRun.lease_expires_at) : null;
    if (!expiresAt || expiresAt > now) {
      console.error(`Error: case is locked by ${activeRun.owner} until ${activeRun.lease_expires_at || "manual unlock"}`);
      process.exit(1);
    }
  }

  const ttlMinutes = Number(options["ttl-minutes"] || 120);
  const startedAt = now.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();
  state.active_run = {
    run_id: `run-${timestampId(startedAt)}`,
    owner,
    started_at: startedAt,
    lease_expires_at: leaseExpiresAt,
    status: "locked",
  };
  state.agent_runs = Array.isArray(state.agent_runs) ? state.agent_runs : [];
  state.agent_runs.push(state.active_run);
  state.updated_at = startedAt;
  writeJson(path.join(caseDir, ".case", "state.json"), state);
  updateManifest(caseDir, { activeRun: state.active_run });
  console.log(`Locked: ${caseName}`);
  console.log(`Owner: ${owner}`);
  console.log(`Lease expires: ${leaseExpiresAt}`);
}

function unlockCase(caseName, args) {
  const options = parseOptions(args);
  const owner = options.owner;
  if (!owner) {
    console.error("Error: unlock requires --owner NAME");
    process.exit(1);
  }
  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  if (!state.active_run || state.active_run.status !== "locked") {
    console.log(`No active lock for ${caseName}`);
    return;
  }
  if (state.active_run.owner !== owner) {
    console.error(`Error: lock is owned by ${state.active_run.owner}, not ${owner}`);
    process.exit(1);
  }
  state.active_run = { ...state.active_run, status: "released", released_at: new Date().toISOString() };
  state.updated_at = state.active_run.released_at;
  writeJson(path.join(caseDir, ".case", "state.json"), state);
  updateManifest(caseDir, { activeRun: state.active_run });
  console.log(`Unlocked: ${caseName}`);
}

function promoteCase(caseName, args) {
  const options = parseOptions(args);
  const targetVersion = normalizeVersion(options.version);
  if (!targetVersion || !options.owner || !options.reason) {
    console.error("Error: promote requires --version vN --owner NAME --reason TEXT");
    process.exit(1);
  }

  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  requireNotFusedForWrite(caseName, state, "promote");
  const versionSummary = detectCaseVersions(caseDir);
  if (!versionSummary.versions.includes(targetVersion)) {
    console.error(`Error: target version '${targetVersion}' not found in case artifacts`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const event = {
    at: now,
    from: state.current_version || null,
    to: targetVersion,
    owner: options.owner,
    reason: options.reason,
  };
  state.current_version = targetVersion;
  state.last_successful_version = targetVersion;
  state.status = "active";
  state.phase = "promoted";
  state.version_index = versionSummary.versions;
  state.promote_history = Array.isArray(state.promote_history) ? state.promote_history : [];
  state.promote_history.push(event);
  state.updated_at = now;
  writeJson(path.join(caseDir, ".case", "state.json"), state);
  updateManifest(caseDir, { currentVersion: targetVersion, lastPromotion: event });
  console.log(`Promoted: ${caseName} -> ${targetVersion}`);
}

function recoverCase(caseName, args) {
  const options = parseOptions(args);
  if (!options.manual || !options.owner || !options.reason) {
    console.error("Error: recover requires --manual --owner NAME --reason TEXT");
    process.exit(1);
  }
  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  const now = new Date().toISOString();
  const event = {
    at: now,
    owner: options.owner,
    reason: options.reason,
    from_status: state.status,
  };
  state.status = "active";
  state.phase = "manual_recovered";
  state.circuit_breaker = {
    ...(state.circuit_breaker || {}),
    fused: false,
    recovered_at: now,
    recovered_by: options.owner,
    recovery_reason: options.reason,
  };
  state.recover_history = Array.isArray(state.recover_history) ? state.recover_history : [];
  state.recover_history.push(event);
  state.updated_at = now;
  writeJson(path.join(caseDir, ".case", "state.json"), state);
  updateManifest(caseDir, { caseStatus: state.status, lastRecovery: event });
  console.log(`Recovered: ${caseName}`);
}

function agentStartCase(caseName, args) {
  const options = parseOptions(args);
  if (!options.owner || !options.target) {
    console.error("Error: agent-start requires --owner NAME --target PATH");
    process.exit(1);
  }
  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  requireNotFusedForWrite(caseName, state, "agent-start");
  const now = new Date().toISOString();
  const run = {
    run_id: `agent-${timestampId(now)}`,
    owner: options.owner,
    target: options.target,
    started_at: now,
    status: "running",
  };
  state.active_run = run;
  state.agent_runs = Array.isArray(state.agent_runs) ? state.agent_runs : [];
  state.agent_runs.push(run);
  state.updated_at = now;
  writeJson(path.join(caseDir, ".case", "state.json"), state);
  updateManifest(caseDir, { activeRun: run });
  console.log(`Agent started: ${run.run_id}`);
}

function agentFinishCase(caseName, args) {
  const options = parseOptions(args);
  if (!options.owner || !["done", "failed"].includes(options.status)) {
    console.error("Error: agent-finish requires --owner NAME --status done|failed");
    process.exit(1);
  }
  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  if (!state.active_run || state.active_run.owner !== options.owner) {
    console.error(`Error: no active run owned by ${options.owner}`);
    process.exit(1);
  }
  const now = new Date().toISOString();
  const finishedRun = { ...state.active_run, status: options.status, finished_at: now };
  state.active_run = finishedRun;
  state.agent_runs = (state.agent_runs || []).map((run) =>
    run.run_id === finishedRun.run_id ? finishedRun : run
  );
  state.updated_at = now;
  writeJson(path.join(caseDir, ".case", "state.json"), state);
  updateManifest(caseDir, { activeRun: finishedRun });
  console.log(`Agent finished: ${finishedRun.run_id} ${options.status}`);
}

function briefCase(caseName) {
  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  const truthFile = readJson(path.join(caseDir, "00-meta", "truth-file.json"));
  const coreTrick = truthFile.core_trick || {};
  const summary = {
    case: caseName,
    current_version: state.current_version,
    gate: state.pending_gates[0] || null,
    phase: state.phase,
    status: state.status,
    rollback_count: state.rollback_count,
    fused: Boolean(state.circuit_breaker && state.circuit_breaker.fused),
    locked_core_trick: {
      locked: coreTrick.locked === true,
      lock_hash: coreTrick.lock_hash || null,
      canonical_solution: coreTrick.canonical_solution || "",
      writer_constraints: coreTrick.writer_constraints || [],
      change_policy: coreTrick.change_policy || "",
    },
    forbidden_changes: coreTrick.writer_constraints || [],
    next_action: nextActionForState(state),
  };
  console.log(JSON.stringify(summary, null, 2));
}

function nodeCommandCase(command, caseName, args) {
  const config = NODE_COMMANDS.get(command);
  const options = parseOptions(args);
  const owner = options.owner || "unknown";
  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  requireNotFusedForWrite(caseName, state, command);
  if (command !== "brief-lock") {
    assertCoreTrickReady(caseDir, command);
  }
  if (command === "trick-lock") {
    lockCoreTrick(caseDir, owner);
  }
  if (command === "draft-start") {
    fs.mkdirSync(path.join(caseDir, "04-drafts", state.current_version || "v1"), { recursive: true });
  }
  if (command === "review-start") {
    fs.mkdirSync(path.join(caseDir, "05-reviews", state.current_version || "v1"), { recursive: true });
  }
  if (command === "editor-judge") {
    fs.mkdirSync(path.join(caseDir, "05-reviews", state.current_version || "v1"), { recursive: true });
  }
  const now = new Date().toISOString();
  state.phase = config.phase;
  state.completed_nodes = Array.isArray(state.completed_nodes) ? state.completed_nodes : [];
  if (!state.completed_nodes.includes(config.node)) state.completed_nodes.push(config.node);
  state.pending_gates = [config.gate];
  state.updated_at = now;
  state.node_history = Array.isArray(state.node_history) ? state.node_history : [];
  state.node_history.push({ at: now, command, node: config.node, owner, next_gate: config.gate });
  writeJson(path.join(caseDir, ".case", "state.json"), state);
  updateManifest(caseDir, { phase: state.phase, pendingGates: state.pending_gates });
  console.log(`Node advanced: ${command}`);
  console.log(`Next: ${config.gate}`);
}

// ─── List Cases ────────────────────────────────────────────────

function listCases() {
  if (!fs.existsSync(CASES_DIR)) {
    console.log("No cases directory found.");
    return;
  }
  const cases = fs.readdirSync(CASES_DIR).filter((name) => {
    const casePath = path.join(CASES_DIR, name);
    return fs.statSync(casePath).isDirectory();
  });
  console.log(`Cases (${cases.length}):`);
  for (const name of cases) {
    console.log(`  - ${name}`);
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function walkDir(dir) {
  const results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && !file.startsWith(".")) {
      results.push(...walkDir(filePath));
    } else if (stat.isFile()) {
      results.push(filePath);
    }
  }
  return results;
}

function parseOptions(args) {
  const options = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      options._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = next;
      i++;
    }
  }
  return options;
}

function requireCaseDir(caseName) {
  if (!caseName) {
    console.error("Error: case name required");
    process.exit(1);
  }
  const caseDir = path.join(CASES_DIR, caseName);
  if (!fs.existsSync(caseDir)) {
    console.error(`Error: case '${caseName}' not found`);
    process.exit(1);
  }
  return caseDir;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function loadState(caseDir, caseName) {
  const statePath = path.join(caseDir, ".case", "state.json");
  const state = readJson(statePath);
  return normalizeState(state, caseName, detectCaseVersions(caseDir));
}

function normalizeState(state, caseName, versionSummary) {
  const now = new Date().toISOString();
  return {
    ...state,
    case: state.case || caseName,
    status: state.status || "active",
    phase: state.phase || "init",
    current_version: state.current_version || state.last_successful_version || versionSummary.highest || null,
    last_successful_version: state.last_successful_version || null,
    rollback_count: Number(state.rollback_count || 0),
    rollback_history: Array.isArray(state.rollback_history) ? state.rollback_history : [],
    max_rollbacks: Number(state.max_rollbacks || MAX_ROLLBACKS),
    circuit_breaker: state.circuit_breaker || { fused: false },
    active_run: state.active_run || null,
    agent_runs: Array.isArray(state.agent_runs) ? state.agent_runs : [],
    version_index: versionSummary.versions,
    completed_nodes: Array.isArray(state.completed_nodes) ? state.completed_nodes : [],
    pending_gates: Array.isArray(state.pending_gates) ? state.pending_gates : [],
    archive_path: state.archive_path || null,
    updated_at: state.updated_at || now,
  };
}

function detectCaseVersions(caseDir) {
  const roots = ["02-research", "03-outline", "04-drafts", "05-reviews", "06-deliverables"];
  const versions = new Set();
  for (const root of roots) {
    const rootPath = path.join(caseDir, root);
    if (!fs.existsSync(rootPath)) continue;
    collectVersions(rootPath, versions);
  }
  const sorted = [...versions].sort((a, b) => versionNumber(a) - versionNumber(b));
  return { versions: sorted, highest: sorted.length ? sorted[sorted.length - 1] : null };
}

function collectVersions(entryPath, versions) {
  const entries = fs.readdirSync(entryPath, { withFileTypes: true });
  for (const entry of entries) {
    const matches = entry.name.match(/v\d+/gi) || [];
    for (const match of matches) versions.add(normalizeVersion(match));
    if (entry.isDirectory()) collectVersions(path.join(entryPath, entry.name), versions);
  }
}

function normalizeVersion(version) {
  if (typeof version !== "string") return null;
  const match = version.trim().match(/^v?(\d+)$/i);
  return match ? `v${Number(match[1])}` : null;
}

function versionNumber(version) {
  const normalized = normalizeVersion(version);
  return normalized ? Number(normalized.slice(1)) : 0;
}

function checkStateConsistency(state, versionSummary) {
  const issues = [];
  let blocking = false;
  if (!state) return { ok: false, blocking: true, issues: ["missing state"] };
  if (!VALID_CASE_STATUSES.has(state.status)) {
    issues.push(`invalid status ${state.status}`);
    blocking = true;
  }
  if (state.current_version && !versionSummary.versions.includes(state.current_version)) {
    issues.push(`current_version ${state.current_version} not found`);
    blocking = true;
  }
  if (state.current_version && versionSummary.highest && versionNumber(state.current_version) < versionNumber(versionSummary.highest)) {
    issues.push(`current_version ${state.current_version} is behind detected highest ${versionSummary.highest}`);
    blocking = true;
  }
  if (state.last_successful_version && !versionSummary.versions.includes(state.last_successful_version)) {
    issues.push(`last_successful_version ${state.last_successful_version} not found`);
    blocking = true;
  }
  if (state.rollback_count >= MAX_ROLLBACKS && state.status !== "fused") {
    issues.push(`rollback_count ${state.rollback_count} reached fuse threshold but status is ${state.status}`);
    blocking = true;
  }
  if (state.status === "fused" && !state.archive_path) {
    issues.push("fused case is missing archive_path");
    blocking = true;
  }
  if (state.status === "fused" && state.archive_path && !fs.existsSync(path.join(CASES_DIR, state.case, state.archive_path, "snapshot.json"))) {
    issues.push(`fused archive snapshot not found at ${state.archive_path}/snapshot.json`);
    blocking = true;
  }
  if (versionSummary.highest && !state.current_version) {
    issues.push(`highest version ${versionSummary.highest} exists but current_version is empty`);
    blocking = true;
  }
  return { ok: issues.length === 0, blocking, issues };
}

function checkStructuredArtifacts(caseDir) {
  const checks = [];
  const issues = [];
  const schemaByName = {
    "review-result.json": readJson(path.join(__dirname, "..", "schemas", "review-result.json")),
    "editor-verdict.json": readJson(path.join(__dirname, "..", "schemas", "editor-verdict.json")),
  };
  for (const file of walkDir(caseDir)) {
    const schema = schemaByName[path.basename(file)];
    if (!schema) continue;
    const relPath = path.relative(caseDir, file).replace(/\\/g, "/");
    try {
      const data = readJson(file);
      const result = validateJsonSchema(data, schema, relPath);
      checks.push({ check: `schema:${relPath}`, status: result.ok ? "PASS" : "FAIL" });
      if (!result.ok) {
        issues.push(`Schema issues in ${relPath}: ${result.issues.join(", ")}`);
      }
    } catch (err) {
      checks.push({ check: `schema:${relPath}`, status: "FAIL" });
      issues.push(`Invalid JSON in ${relPath}: ${err.message}`);
    }
  }
  return { ok: issues.length === 0, checks, issues };
}

function validateJsonSchema(data, schema, pathLabel) {
  const issues = [];
  validateNode(data, schema, pathLabel, issues);
  return { ok: issues.length === 0, issues };
}

function validateNode(value, schema, pathLabel, issues) {
  if (!schema) return;
  if (schema.type && !matchesType(value, schema.type)) {
    issues.push(`${pathLabel} expected ${schema.type}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    issues.push(`${pathLabel} expected one of ${schema.enum.join("|")}`);
  }
  if (schema.type === "object") {
    for (const field of schema.required || []) {
      if (value[field] === undefined) issues.push(`${pathLabel}.${field} is required`);
    }
    for (const [field, childSchema] of Object.entries(schema.properties || {})) {
      if (value[field] !== undefined) validateNode(value[field], childSchema, `${pathLabel}.${field}`, issues);
    }
  }
  if (schema.type === "array" && schema.items && Array.isArray(value)) {
    value.forEach((item, index) => validateNode(item, schema.items, `${pathLabel}[${index}]`, issues));
  }
}

function matchesType(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value && typeof value === "object" && !Array.isArray(value);
  return typeof value === type;
}

function archiveCaseSnapshot(caseDir, event) {
  const stamp = timestampId(event.at || new Date().toISOString());
  const archiveDir = path.join(caseDir, "archive", `${event.reason}-${stamp}`);
  fs.mkdirSync(archiveDir, { recursive: true });
  const snapshot = {
    event,
    state: readJson(path.join(caseDir, ".case", "state.json")),
    manifest: readJson(path.join(caseDir, ".case", "manifest.json")),
    versions: detectCaseVersions(caseDir),
  };
  writeJson(path.join(archiveDir, "snapshot.json"), snapshot);
  return archiveDir;
}

function updateManifest(caseDir, patch) {
  const manifestPath = path.join(caseDir, ".case", "manifest.json");
  const manifest = readJson(manifestPath);
  writeJson(manifestPath, { ...manifest, ...patch, updatedAt: new Date().toISOString() });
}

function timestampId(iso) {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function isValidUtf8(buffer) {
  // Simple check: if decoding as utf-8 and re-encoding matches, it's valid
  try {
    const str = buffer.toString("utf-8");
    return Buffer.from(str, "utf-8").equals(buffer);
  } catch {
    return false;
  }
}

function checkMarkdownHeadings(content) {
  const lines = content.split("\n");
  let lastLevel = 0;
  const issues = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s/);
    if (match) {
      const level = match[1].length;
      if (level > lastLevel + 1) {
        issues.push(`line ${i + 1}: heading level jump (${lastLevel} → ${level})`);
      }
      lastLevel = level;
    }
  }
  return { ok: issues.length === 0, issues };
}

function checkCoreTrickLock(truthFile, caseDir) {
  const issues = [];
  if (!truthFile.core_trick || typeof truthFile.core_trick !== "object") {
    return { ok: false, issues: ["missing core_trick"] };
  }

  const coreTrick = truthFile.core_trick;
  if (coreTrick.locked !== true) {
    if (!hasAdvancedStoryArtifacts(caseDir)) {
      return { ok: true, issues: [] };
    }
    return { ok: false, issues: ["core_trick.locked is not true"] };
  }
  if (typeof coreTrick.lock_hash !== "string" || coreTrick.lock_hash.trim() === "") {
    issues.push("missing lock_hash");
  }

  const requiredStrings = [
    "approved_by",
    "approved_at",
    "editor_explanation",
    "canonical_solution",
    "change_policy",
  ];
  for (const field of requiredStrings) {
    if (typeof coreTrick[field] !== "string" || coreTrick[field].trim() === "") {
      issues.push(`missing ${field}`);
    }
  }
  if (!Array.isArray(coreTrick.writer_constraints) || coreTrick.writer_constraints.length === 0) {
    issues.push("missing writer_constraints");
  }

  return { ok: issues.length === 0, issues };
}

function requireNotFusedForWrite(caseName, state, action) {
  if (state.status === "fused" || (state.circuit_breaker && state.circuit_breaker.fused)) {
    console.error(`Error: case '${caseName}' is fused; ${action} requires case recover --manual first`);
    process.exit(1);
  }
  if (state.status === "archived") {
    console.error(`Error: case '${caseName}' is archived; ${action} is blocked`);
    process.exit(1);
  }
}

function assertCoreTrickReady(caseDir, command) {
  const truthFile = readJson(path.join(caseDir, "00-meta", "truth-file.json"));
  const coreTrick = truthFile.core_trick || {};
  if (coreTrick.locked !== true && command !== "trick-lock") {
    console.error(`Error: ${command} requires locked core_trick`);
    process.exit(1);
  }
}

function lockCoreTrick(caseDir, owner) {
  const truthPath = path.join(caseDir, "00-meta", "truth-file.json");
  const truthFile = readJson(truthPath);
  truthFile.core_trick = truthFile.core_trick || {};
  truthFile.core_trick.locked = true;
  truthFile.core_trick.approved_by = truthFile.core_trick.approved_by || owner;
  truthFile.core_trick.approved_at = truthFile.core_trick.approved_at || new Date().toISOString();
  truthFile.core_trick.change_policy = truthFile.core_trick.change_policy || "User approval required before any core trick change";
  truthFile.core_trick.lock_hash = computeCoreTrickHash(truthFile.core_trick);
  truthFile.updated_at = new Date().toISOString();
  writeJson(truthPath, truthFile);
}

function computeCoreTrickHash(coreTrick) {
  const stable = {
    approved_by: coreTrick.approved_by || "",
    approved_at: coreTrick.approved_at || "",
    editor_explanation: coreTrick.editor_explanation || "",
    canonical_solution: coreTrick.canonical_solution || "",
    writer_constraints: coreTrick.writer_constraints || [],
    change_policy: coreTrick.change_policy || "",
  };
  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

function nextActionForState(state) {
  if (state.status === "fused" || (state.circuit_breaker && state.circuit_breaker.fused)) {
    return "case recover --manual";
  }
  if (state.pending_gates && state.pending_gates.length > 0) {
    return state.pending_gates[0];
  }
  if (!state.completed_nodes.includes("brief")) return "case brief-lock";
  if (!state.completed_nodes.includes("trick")) return "case trick-lock";
  if (!state.completed_nodes.includes("draft")) return "case draft-start";
  if (!state.completed_nodes.includes("review")) return "case review-start";
  if (!state.completed_nodes.includes("editor")) return "case editor-judge";
  return "case publish-prep";
}

function hasAdvancedStoryArtifacts(caseDir) {
  const advancedDirs = ["03-outline", "04-drafts", "06-deliverables"];
  for (const dir of advancedDirs) {
    const dirPath = path.join(caseDir, dir);
    if (!fs.existsSync(dirPath)) continue;
    const files = walkDir(dirPath).filter((file) => {
      const relPath = path.relative(dirPath, file);
      if (relPath.startsWith("v1\\chapters") || relPath.startsWith("v1/chapters")) {
        return fs.statSync(file).size > 0;
      }
      return (file.endsWith(".md") || file.endsWith(".json")) && fs.statSync(file).size > 0;
    });
    if (files.length > 0) return true;
  }
  return false;
}

// ─── Templates ─────────────────────────────────────────────────

function metaTemplate(caseName) {
  return `# ${caseName}

## 基本信息
- 类型: （同人 / 原创）
- 目标字数:
- 预计章节数:

## 世界观
（简要描述故事发生的世界、时代背景）

## 核心创意
（一句话概括这个故事最吸引人的点）
`;
}

function charactersTemplate() {
  return JSON.stringify(
    {
      characters: [
        {
          name: "",
          role: "protagonist|antagonist|supporting",
          personality: "",
          knowledge_bounds: "",
          appearances: [],
        },
      ],
      updated_at: new Date().toISOString(),
    },
    null,
    2
  );
}

function truthFileTemplate() {
  return JSON.stringify(
    {
      core_trick: {
        locked: false,
        approved_by: "",
        approved_at: "",
        editor_explanation: "",
        canonical_solution: "",
        writer_constraints: [],
        change_policy: "User approval required before any core trick change",
      },
      foreshadowing: [],
      clues: [],
      timeline: [],
      key_props: [],
      updated_at: new Date().toISOString(),
    },
    null,
    2
  );
}

function briefTemplate() {
  return `# 创作简报

## 一句话故事

## 目标读者

## 参考作品

## 禁忌元素
（绝对不能出现的内容）

## 质量红线
（必须满足的标准）
`;
}

function stateTemplate(caseName) {
  return JSON.stringify(
    {
      case: caseName,
      status: "active",
      phase: "init",
      current_version: "v1",
      completed_nodes: [],
      pending_gates: [],
      last_successful_version: null,
      rollback_count: 0,
      rollback_history: [],
      max_rollbacks: MAX_ROLLBACKS,
      circuit_breaker: { fused: false },
      active_run: null,
      agent_runs: [],
      version_index: ["v1"],
      archive_path: null,
      updated_at: new Date().toISOString(),
    },
    null,
    2
  );
}

function manifestTemplate(caseName) {
  return JSON.stringify(
    {
      case: caseName,
      version: "0.1.0",
      schema: "detective-script-dev-v1",
      created_at: new Date().toISOString(),
      lastChecked: null,
      checkResult: null,
      artifacts: [],
    },
    null,
    2
  );
}

// ─── CLI Dispatch ──────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    usage();
  }

  const [cmd, subcmd, name] = args;

  if (cmd === "case") {
    if (subcmd === "init") initCase(name);
    else if (subcmd === "check") checkCase(name);
    else if (subcmd === "status") statusCase(name);
    else if (subcmd === "rollback") rollbackCase(name, args.slice(3));
    else if (subcmd === "promote") promoteCase(name, args.slice(3));
    else if (subcmd === "recover") recoverCase(name, args.slice(3));
    else if (subcmd === "agent-start") agentStartCase(name, args.slice(3));
    else if (subcmd === "agent-finish") agentFinishCase(name, args.slice(3));
    else if (subcmd === "brief") briefCase(name);
    else if (NODE_COMMANDS.has(subcmd)) nodeCommandCase(subcmd, name, args.slice(3));
    else if (subcmd === "archive") archiveCase(name, args.slice(3));
    else if (subcmd === "lock") lockCase(name, args.slice(3));
    else if (subcmd === "unlock") unlockCase(name, args.slice(3));
    else if (subcmd === "list") listCases();
    else {
      console.error(`Unknown case subcommand: ${subcmd}`);
      process.exit(1);
    }
  } else {
    console.error(`Unknown command: ${cmd}`);
    usage();
  }
}

main();
