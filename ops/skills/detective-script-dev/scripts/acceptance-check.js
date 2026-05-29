#!/usr/bin/env node
/**
 * detective-script-dev multi-case acceptance.
 *
 * Synthetic cases are created under the OS temp directory. HYOUKA-GZ is the
 * only real repo case used by this suite.
 */

const assert = require("assert");
const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const runner = path.join(repoRoot, "src", "bin", "wolf-runner.js");
const fanqieCli = path.join(repoRoot, "src", "adapters", "fanqie", "fanqie-cli.js");

function run(command, cwd = repoRoot) {
  return childProcess.execFileSync(process.execPath, command, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runRaw(command, cwd = repoRoot) {
  return childProcess.spawnSync(process.execPath, command, {
    cwd,
    encoding: "utf-8",
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function tempRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `detective-script-dev-${prefix}-`));
}

function caseDir(root, name) {
  return path.join(root, "content", "cases", name);
}

function lockCoreTrick(root, name) {
  const truthPath = path.join(caseDir(root, name), "00-meta", "truth-file.json");
  const truth = readJson(truthPath);
  truth.core_trick = {
    locked: true,
    approved_by: "acceptance",
    approved_at: "2026-05-29T00:00:00.000Z",
    editor_explanation: "Acceptance locked trick.",
    canonical_solution: "Acceptance canonical solution.",
    writer_constraints: ["Do not change the locked acceptance trick."],
    change_policy: "User approval required before any core trick change",
  };
  truth.core_trick.lock_hash = coreTrickHash(truth.core_trick);
  truth.updated_at = "2026-05-29T00:00:00.000Z";
  writeJson(truthPath, truth);
  return truth.core_trick.lock_hash;
}

function coreTrickHash(coreTrick) {
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

function initCase(root, name) {
  run([runner, "case", "init", name], root);
}

function setCurrentVersion(root, name, version) {
  const statePath = path.join(caseDir(root, name), ".case", "state.json");
  const state = readJson(statePath);
  state.current_version = version;
  state.last_successful_version = version;
  state.version_index = [version];
  writeJson(statePath, state);
}

function createVersionArtifacts(root, name, maxVersion) {
  for (let i = 1; i <= maxVersion; i++) {
    const version = `v${i}`;
    writeText(path.join(caseDir(root, name), "04-drafts", version, "full.md"), `# Draft ${version}\n`);
    writeText(path.join(caseDir(root, name), "05-reviews", version, "notes.md"), `# Review ${version}\n`);
  }
}

function validReview(lockHash) {
  return {
    reviewer_id: "logic-checker",
    chapter: "v1-ch01",
    provider: "mock",
    model: "acceptance-model",
    owner: "acceptance",
    prompt_version: "2026-05-29",
    created_at: "2026-05-29T00:00:00.000Z",
    derived_from_lock_hash: lockHash,
    dimensions: [{ name: "logic", verdict: "pass", confidence: "high" }],
    overall_verdict: "pass",
    critical_issues: [],
    summary: "Pass.",
  };
}

function validEditorVerdict(lockHash, nextAction = "proceed") {
  return {
    judge_id: "editor-judge",
    chapter: "v1-ch01",
    provider: "mock",
    model: "acceptance-model",
    owner: "acceptance",
    prompt_version: "2026-05-29",
    created_at: "2026-05-29T00:00:00.000Z",
    derived_from_lock_hash: lockHash,
    verdict: nextAction === "rollback" ? "needs_revision" : "pass",
    consensus_issues: [],
    conflicts: [],
    revision_checklist: [{ priority: "P1", task: "Rollback test path.", from: "editor" }],
    next_action: nextAction,
  };
}

function assertRealCaseRegression() {
  const out = run([runner, "case", "check", "HYOUKA-GZ", "--no-write"]);
  assert.match(out, /Status: PASS/);
  assert.match(out, /v10/);
  const state = readJson(path.join(repoRoot, "content", "cases", "HYOUKA-GZ", ".case", "state.json"));
  const manifest = readJson(path.join(repoRoot, "content", "cases", "HYOUKA-GZ", ".case", "manifest.json"));
  const truth = readJson(path.join(repoRoot, "content", "cases", "HYOUKA-GZ", "00-meta", "truth-file.json"));
  assert.strictEqual(state.current_version, "v10");
  assert.strictEqual(manifest.highestDetectedVersion, "v10");
  assert.strictEqual(truth.core_trick.locked, true);
  assert.strictEqual(state.current_version, manifest.highestDetectedVersion);
}

function assertBaseCaseLifecycle() {
  const root = tempRoot("base");
  initCase(root, "ACCEPT-BASE");
  const out = run([runner, "case", "check", "ACCEPT-BASE", "--no-write"], root);
  assert.match(out, /Status: PASS/);
  const truth = readJson(path.join(caseDir(root, "ACCEPT-BASE"), "00-meta", "truth-file.json"));
  assert.strictEqual(truth.core_trick.locked, false);
}

function assertLockLeaseConflict() {
  const root = tempRoot("lock");
  initCase(root, "ACCEPT-LOCK");
  run([runner, "case", "lock", "ACCEPT-LOCK", "--owner", "agent-a", "--ttl-minutes", "1"], root);
  const conflict = runRaw([runner, "case", "lock", "ACCEPT-LOCK", "--owner", "agent-b"], root);
  assert.notStrictEqual(conflict.status, 0);
  assert.match(conflict.stderr, /locked by agent-a/);
  run([runner, "case", "unlock", "ACCEPT-LOCK", "--owner", "agent-a"], root);
  run([runner, "case", "lock", "ACCEPT-LOCK", "--owner", "agent-b"], root);
}

function assertRollbackFuseArchive() {
  const root = tempRoot("fuse");
  initCase(root, "ACCEPT-FUSE");
  run([runner, "case", "rollback", "ACCEPT-FUSE", "--to", "v1", "--reason", "accept-1", "--owner", "codex"], root);
  run([runner, "case", "rollback", "ACCEPT-FUSE", "--to", "v1", "--reason", "accept-2", "--owner", "codex"], root);
  run([runner, "case", "rollback", "ACCEPT-FUSE", "--to", "v1", "--reason", "accept-3", "--owner", "codex"], root);
  const state = readJson(path.join(caseDir(root, "ACCEPT-FUSE"), ".case", "state.json"));
  assert.strictEqual(state.status, "fused");
  assert.strictEqual(state.rollback_count, 3);
  assert.strictEqual(state.circuit_breaker.fused, true);
  assert.match(state.archive_path, /^archive\/rollback-fused-/);
  assert.ok(fs.existsSync(path.join(caseDir(root, "ACCEPT-FUSE"), state.archive_path, "snapshot.json")));
  assert.notStrictEqual(runRaw([runner, "case", "rollback", "ACCEPT-FUSE", "--to", "v1"], root).status, 0);
  assert.notStrictEqual(runRaw([runner, "case", "promote", "ACCEPT-FUSE", "--version", "v1", "--owner", "codex", "--reason", "blocked"], root).status, 0);
  run([runner, "case", "recover", "ACCEPT-FUSE", "--manual", "--owner", "editor", "--reason", "acceptance recovery"], root);
  run([runner, "case", "promote", "ACCEPT-FUSE", "--version", "v1", "--owner", "editor", "--reason", "after recovery"], root);
}

function assertV12VersionPromotion() {
  const root = tempRoot("v12");
  initCase(root, "ACCEPT-V12");
  lockCoreTrick(root, "ACCEPT-V12");
  createVersionArtifacts(root, "ACCEPT-V12", 12);
  run([runner, "case", "promote", "ACCEPT-V12", "--version", "v12", "--owner", "codex", "--reason", "accept v12"], root);
  const status = run([runner, "case", "status", "ACCEPT-V12"], root);
  assert.match(status, /"current_version": "v12"/);
  assert.match(run([runner, "case", "check", "ACCEPT-V12", "--no-write"], root), /Status: PASS/);
  run([runner, "case", "rollback", "ACCEPT-V12", "--to", "v7", "--reason", "accept rollback", "--owner", "codex"], root);
  const state = readJson(path.join(caseDir(root, "ACCEPT-V12"), ".case", "state.json"));
  const lastRollback = state.rollback_history[state.rollback_history.length - 1];
  assert.strictEqual(lastRollback.from, "v12");
  assert.strictEqual(lastRollback.to, "v7");
  assert.strictEqual(lastRollback.owner, "codex");
  assert.strictEqual(lastRollback.reason, "accept rollback");
}

function assertReviewSchemaBlocking() {
  const root = tempRoot("schema");
  initCase(root, "ACCEPT-SCHEMA");
  const lockHash = lockCoreTrick(root, "ACCEPT-SCHEMA");
  writeJson(path.join(caseDir(root, "ACCEPT-SCHEMA"), "05-reviews", "v1", "review-result.json"), validReview(lockHash));
  writeJson(path.join(caseDir(root, "ACCEPT-SCHEMA"), "05-reviews", "v1", "editor-verdict.json"), validEditorVerdict(lockHash, "proceed"));
  assert.match(run([runner, "case", "check", "ACCEPT-SCHEMA", "--no-write"], root), /Status: PASS/);
  writeJson(path.join(caseDir(root, "ACCEPT-SCHEMA"), "05-reviews", "v1", "review-result.json"), {
    reviewer_id: "broken",
  });
  const blocked = runRaw([runner, "case", "check", "ACCEPT-SCHEMA", "--no-write"], root);
  assert.notStrictEqual(blocked.status, 0);
  assert.match(blocked.stdout, /Status: BLOCKED/);
  writeJson(path.join(caseDir(root, "ACCEPT-SCHEMA"), "05-reviews", "v1", "review-result.json"), validReview(lockHash));
  writeJson(path.join(caseDir(root, "ACCEPT-SCHEMA"), "05-reviews", "v1", "editor-verdict.json"), validEditorVerdict(lockHash, "rollback"));
  assert.match(run([runner, "case", "check", "ACCEPT-SCHEMA", "--no-write"], root), /Status: PASS/);
  run([runner, "case", "rollback", "ACCEPT-SCHEMA", "--to", "v1", "--owner", "editor", "--reason", "editor verdict rollback"], root);
}

function assertFanqieLiveGate() {
  const upload = runRaw([fanqieCli, "upload"]);
  assert.notStrictEqual(upload.status, 0);
  assert.match(upload.stderr, /CONFIRM_REQUIRED/);
  const createBook = runRaw([fanqieCli, "create-book", "--title", "Acceptance"]);
  assert.notStrictEqual(createBook.status, 0);
  assert.match(createBook.stderr, /CONFIRM_REQUIRED/);
  const checkStatus = runRaw([fanqieCli, "check-status"]);
  assert.doesNotMatch(`${checkStatus.stdout}\n${checkStatus.stderr}`, /CONFIRM_REQUIRED/);
}

const scenarios = [
  assertRealCaseRegression,
  assertBaseCaseLifecycle,
  assertLockLeaseConflict,
  assertRollbackFuseArchive,
  assertV12VersionPromotion,
  assertReviewSchemaBlocking,
  assertFanqieLiveGate,
];

for (const scenario of scenarios) {
  scenario();
  console.log(`PASS ${scenario.name}`);
}

console.log("detective-script-dev multi-case acceptance passed");
