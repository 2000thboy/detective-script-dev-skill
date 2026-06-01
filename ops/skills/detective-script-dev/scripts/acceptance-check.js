#!/usr/bin/env node
/**
 * detective-script-dev multi-case acceptance.
 *
 * Synthetic cases are created under the OS temp directory. The suite does not
 * rely on a bundled repo case.
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

function prepareFairnessCase(root, name, clues, draft) {
  initCase(root, name);
  lockCoreTrick(root, name);
  run([runner, "case", "draft-start", name], root);
  const truthPath = path.join(caseDir(root, name), "00-meta", "truth-file.json");
  const truth = readJson(truthPath);
  truth.clues = clues;
  truth.core_trick.canonical_solution = "The canonical solution is revealed after the marked truth section.";
  writeJson(truthPath, truth);
  writeText(path.join(caseDir(root, name), "04-drafts", "v1", "full.md"), draft);
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
    dimensions: [{ name: "logic", verdict: "pass", confidence: "high", score: 95 }],
    overall_score: 95,
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
  // Create a full regression case instead of relying on HYOUKA-GZ
  const root = tempRoot("regression");
  initCase(root, "ACCEPT-REGRESSION");
  lockCoreTrick(root, "ACCEPT-REGRESSION");
  createVersionArtifacts(root, "ACCEPT-REGRESSION", 3);
  setCurrentVersion(root, "ACCEPT-REGRESSION", "v3");
  const out = run([runner, "case", "check", "ACCEPT-REGRESSION", "--no-write"], root);
  assert.match(out, /Status: PASS/);
  assert.match(out, /v3/);
  const state = readJson(path.join(caseDir(root, "ACCEPT-REGRESSION"), ".case", "state.json"));
  const manifest = readJson(path.join(caseDir(root, "ACCEPT-REGRESSION"), ".case", "manifest.json"));
  const truth = readJson(path.join(caseDir(root, "ACCEPT-REGRESSION"), "00-meta", "truth-file.json"));
  assert.strictEqual(state.current_version, "v3");
  assert.strictEqual(truth.core_trick.locked, true);
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

function assertFairnessPassLockedRoom() {
  const root = tempRoot("fair-pass");
  prepareFairnessCase(
    root,
    "ACCEPT-LOCKED-ROOM",
    [
      { id: "cl-door", claim: "door wax seal", aliases: ["wax seal"], expected_before_reveal: true },
      { id: "cl-window", claim: "scratched window latch", aliases: ["window latch"], expected_before_reveal: true },
      { id: "cl-key", claim: "brass duplicate key", aliases: ["duplicate key"], expected_before_reveal: true },
      { id: "cl-clock", claim: "stopped corridor clock", aliases: ["corridor clock"], expected_before_reveal: true },
      { id: "cl-ash", claim: "white ash under threshold", aliases: ["white ash"], expected_before_reveal: true },
    ],
    [
      "# Locked Room",
      "The wax seal on the study door was intact.",
      "A scratched window latch caught the detective's eye.",
      "The brass duplicate key was listed in the housekeeper's ledger.",
      "The stopped corridor clock pointed to an impossible time.",
      "White ash under threshold marked the hidden draft.",
      "## 真相",
      "The canonical solution explains the locked room.",
    ].join("\n")
  );
  const out = run([runner, "case", "fair-check", "ACCEPT-LOCKED-ROOM", "--version", "v1", "--json"], root);
  const report = JSON.parse(out);
  assert.strictEqual(report.status, "PASS");
  assert.strictEqual(report.items.length, 5);
  assert.ok(fs.existsSync(path.join(caseDir(root, "ACCEPT-LOCKED-ROOM"), "05-reviews", "v1", "fairness-report.json")));
}

function assertFairnessBlockedMissingClueAlibi() {
  const root = tempRoot("fair-missing");
  prepareFairnessCase(
    root,
    "ACCEPT-ALIBI",
    [
      { id: "cl-ticket", claim: "platform ticket stamp", aliases: ["ticket stamp"], expected_before_reveal: true },
      { id: "cl-call", claim: "missed midnight call", aliases: ["midnight call"], expected_before_reveal: true },
      { id: "cl-photo", claim: "rain on the photo", aliases: ["rain photo"], expected_before_reveal: true },
      { id: "cl-map", claim: "folded station map", aliases: ["station map"], expected_before_reveal: true },
      { id: "cl-watch", claim: "watch set seven minutes fast", aliases: ["seven minutes fast"], expected_before_reveal: true },
    ],
    [
      "# Alibi",
      "The platform ticket stamp and missed midnight call seemed to clear the suspect.",
      "Rain on the photo contradicted the stated route.",
      "The folded station map had one corner torn away.",
      "## 解谜",
      "The watch set seven minutes fast finally solved the alibi.",
    ].join("\n")
  );
  const blocked = runRaw([runner, "case", "fair-check", "ACCEPT-ALIBI", "--version", "v1", "--json"], root);
  assert.notStrictEqual(blocked.status, 0);
  const report = JSON.parse(blocked.stdout);
  assert.strictEqual(report.status, "BLOCKED");
  assert.ok(report.items.some((item) => item.id === "cl-watch" && item.status === "BLOCKED"));
}

function assertFairnessBlockedRevealOnlySocialMotive() {
  const root = tempRoot("fair-reveal");
  prepareFairnessCase(
    root,
    "ACCEPT-SOCIAL-MOTIVE",
    [
      { id: "cl-ledger", claim: "factory relief ledger", aliases: ["relief ledger"], expected_before_reveal: true },
      { id: "cl-badge", claim: "union badge scratch", aliases: ["union badge"], expected_before_reveal: true },
      { id: "cl-letter", claim: "burned apology letter", aliases: ["apology letter"], expected_before_reveal: true },
      { id: "cl-song", claim: "old protest song", aliases: ["protest song"], expected_before_reveal: true },
      { id: "cl-debt", claim: "medical debt receipt", aliases: ["debt receipt"], expected_before_reveal: true },
    ],
    [
      "# Social Motive",
      "The factory relief ledger, union badge scratch, burned apology letter, and old protest song were all mentioned early.",
      "## 真相",
      "Only now did the detective reveal the medical debt receipt.",
    ].join("\n")
  );
  const blocked = runRaw([runner, "case", "fair-check", "ACCEPT-SOCIAL-MOTIVE", "--version", "v1", "--json"], root);
  assert.notStrictEqual(blocked.status, 0);
  const report = JSON.parse(blocked.stdout);
  assert.strictEqual(report.status, "BLOCKED");
  assert.ok(report.items.some((item) => item.id === "cl-debt" && item.issue.includes("at or after reveal")));
}

function assertPackageWolfAlias() {
  const pkg = readJson(path.join(repoRoot, "package.json"));
  assert.strictEqual(pkg.bin.wolf, "src/bin/wolf-runner.js");
  assert.strictEqual(pkg.bin["wolf-runner"], "src/bin/wolf-runner.js");
  assert.ok(pkg.files.includes("ops/skills/detective-script-dev/"));
  assert.ok(pkg.files.includes("src/"));
  assert.ok(!pkg.files.some((entry) => entry.startsWith(".omc")));
  assert.ok(!pkg.files.some((entry) => entry.startsWith("content/cases/HYOUKA-GZ")));
}

function assertPublishPrepNoLiveWrite() {
  const root = tempRoot("publish-prep");
  initCase(root, "ACCEPT-PUBLISH");
  lockCoreTrick(root, "ACCEPT-PUBLISH");
  writeText(
    path.join(caseDir(root, "ACCEPT-PUBLISH"), "04-drafts", "v1", "full.md"),
    "# Publishable Chapter\nThis chapter is ready for manual copy.\n"
  );
  const out = run([runner, "publish", "prep", "ACCEPT-PUBLISH", "--platform", "fanqie", "--version", "v1"], root);
  assert.match(out, /Live write: false/);
  const packageDir = path.join(caseDir(root, "ACCEPT-PUBLISH"), "06-deliverables", "publish", "fanqie-package");
  assert.ok(fs.existsSync(path.join(packageDir, "chapter.txt")));
  assert.ok(fs.existsSync(path.join(packageDir, "publish-checklist.md")));
  const plan = readJson(path.join(packageDir, "manual-copy-plan.json"));
  assert.strictEqual(plan.live_write, false);
  assert.strictEqual(plan.next_action, "manual_copy_after_human_publish_approval");
}

function assertMemorySchemaLifecycle() {
  const root = tempRoot("memory");
  const memoryPath = path.join(root, "memory.json");
  run([runner, "memory", "init", "--path", memoryPath], root);
  assert.ok(fs.existsSync(memoryPath));
  const checked = run([runner, "memory", "check", "--path", memoryPath, "--json"], root);
  const result = JSON.parse(checked);
  assert.strictEqual(result.ok, true);
  const shown = JSON.parse(run([runner, "memory", "show", "--path", memoryPath, "--json"], root));
  assert.strictEqual(shown.configured, true);
  const memory = readJson(memoryPath);
  memory.user_profile.preferred_style = "not-array";
  writeJson(memoryPath, memory);
  const blocked = runRaw([runner, "memory", "check", "--path", memoryPath, "--json"], root);
  assert.notStrictEqual(blocked.status, 0);
  assert.strictEqual(JSON.parse(blocked.stdout).ok, false);
}

function assertQualityScorePassAndBlocked() {
  const root = tempRoot("quality");
  prepareFairnessCase(
    root,
    "ACCEPT-QUALITY",
    [
      { id: "cl-a", claim: "blue envelope", aliases: ["blue envelope"], expected_before_reveal: true },
      { id: "cl-b", claim: "quiet stair", aliases: ["quiet stair"], expected_before_reveal: true },
      { id: "cl-c", claim: "left glove", aliases: ["left glove"], expected_before_reveal: true },
      { id: "cl-d", claim: "silver bell", aliases: ["silver bell"], expected_before_reveal: true },
      { id: "cl-e", claim: "final receipt", aliases: ["final receipt"], expected_before_reveal: true },
    ],
    [
      "# Quality Case",
      "The blue envelope, quiet stair, left glove, silver bell, and final receipt were all visible.",
      "The detective kept checking the blue envelope and quiet stair while the witness described the left glove.",
      "The silver bell and final receipt made the route solvable before the reveal.",
      "Filler ".repeat(900),
      "## 真相",
      "The clues resolve fairly.",
    ].join("\n")
  );
  run([runner, "case", "fair-check", "ACCEPT-QUALITY", "--version", "v1"], root);
  const out = run([runner, "case", "score", "ACCEPT-QUALITY", "--version", "v1", "--json"], root);
  const report = JSON.parse(out);
  assert.ok(report.score >= 85);
  assert.strictEqual(report.verdict, "pass");
  assert.ok(fs.existsSync(path.join(caseDir(root, "ACCEPT-QUALITY"), "05-reviews", "v1", "quality-score.json")));

  prepareFairnessCase(
    root,
    "ACCEPT-QUALITY-BLOCKED",
    [{ id: "cl-missing", claim: "missing impossible clue", expected_before_reveal: true }],
    "# Blocked\nNo clue here.\n## 真相\nThe missing impossible clue appears too late.\n"
  );
  const blocked = runRaw([runner, "case", "score", "ACCEPT-QUALITY-BLOCKED", "--version", "v1", "--json"], root);
  assert.notStrictEqual(blocked.status, 0);
  assert.strictEqual(JSON.parse(blocked.stdout).verdict, "blocked");
}

function assertDistributionMaterials() {
  const marketplace = readJson(path.join(repoRoot, "ops", "skills", "detective-script-dev", "marketplace.json"));
  assert.strictEqual(marketplace.name, "detective-script-dev");
  assert.strictEqual(marketplace.version, "1.1.0");
  assert.strictEqual(marketplace.safety.live_platform_writes, true);
  assert.strictEqual(marketplace.safety.requires_human_publish_approval, true);
  assert.match(marketplace.safety.live_write_gate, /--confirm-live/);
  assert.ok(marketplace.capabilities.includes("clue fairness check before reveal"));
  assert.ok(marketplace.capabilities.includes("AI-flavor detection (mandatory)"));
  assert.ok(marketplace.capabilities.includes("research-usage verification (mandatory)"));
  const beta = fs.readFileSync(path.join(repoRoot, "ops", "skills", "detective-script-dev", "references", "beta-acceptance.md"), "utf-8");
  assert.match(beta, /No beta run performs live platform writes/);
  assert.match(beta, /wolf case fair-check/);
  assert.match(beta, /wolf case score/);
}

function assertOutlineValidation() {
  const root = tempRoot("outline");
  initCase(root, "ACCEPT-OUTLINE");
  // Valid outline - ensure 故事细纲 >= 5000 chars, 故事简介 200-500 chars
  const synopsisBase = "这是一个很长的故事简介，包含足够的内容来达到200字以上的要求，描述了主角的性格特点和故事的主要冲突，以及故事发生的时代背景和世界观设定。";
  const longSynopsis = synopsisBase.repeat(4);
  const outlineBase = "第一章开场主角登场介绍背景。第二章发展案件发生主角调查。第三章高潮真相浮现主角抉择。第四章结局谜团解开线索串联。";
  const longOutline = outlineBase.repeat(90);
  writeText(
    path.join(caseDir(root, "ACCEPT-OUTLINE"), "03-outline", "v1.md"),
    `# 一句话故事\n这是一个测试用的简短故事概要，描述了一个关于勇气与智慧的冒险故事。\n\n# 故事简介\n${longSynopsis}\n\n# 故事细纲\n${longOutline}\n\n# 人物简介\n主角：性格勇敢，动机正义。反派：性格阴险，动机贪婪。配角A：忠诚的朋友。配角B：神秘的知情者。\n`
  );
  const valid = run([runner, "case", "outline-validate", "ACCEPT-OUTLINE", "--version", "v1"], root);
  assert.match(valid, /Outline validation: PASS/);

  // Invalid outline (missing sections)
  writeText(
    path.join(caseDir(root, "ACCEPT-OUTLINE"), "03-outline", "v2.md"),
    `# Random Title\nThis is not a valid outline format.\n`
  );
  const invalid = runRaw([runner, "case", "outline-validate", "ACCEPT-OUTLINE", "--version", "v2"], root);
  assert.notStrictEqual(invalid.status, 0);
  assert.match(invalid.stdout, /Outline validation: FAIL/);
}

function assertModificationListTracking() {
  const root = tempRoot("modlist");
  initCase(root, "ACCEPT-MODLIST");
  lockCoreTrick(root, "ACCEPT-MODLIST");
  writeText(path.join(caseDir(root, "ACCEPT-MODLIST"), "04-drafts", "v1", "full.md"), "# Draft\n");
  run([runner, "case", "modification-list", "ACCEPT-MODLIST", "--version", "v1", "--items", "fix pacing,reduce AI flavor"], root);
  const listPath = path.join(caseDir(root, "ACCEPT-MODLIST"), "05-reviews", "v1", "modification-list-v1-iter1.md");
  assert.ok(fs.existsSync(listPath));
  const content = fs.readFileSync(listPath, "utf-8");
  assert.match(content, /fix pacing/);
  assert.match(content, /reduce AI flavor/);
  assert.match(content, /Iteration 1/);
}

function assertMemoryUpdateCommand() {
  const root = tempRoot("memupdate");
  const memoryPath = path.join(root, "test-memory.json");
  run([runner, "memory", "update", "--key", "preferred_pace", "--value", "slow", "--path", memoryPath], root);
  const memory = readJson(memoryPath);
  assert.strictEqual(memory.user_profile.preferred_pace, "slow");
  run([runner, "memory", "update", "--key", "preferred_style", "--value", "轻小说", "--path", memoryPath], root);
  const memory2 = readJson(memoryPath);
  assert.ok(memory2.user_profile.preferred_style.includes("轻小说"));
  const showOut = run([runner, "memory", "show", "--path", memoryPath], root);
  assert.match(showOut, /configured/);
}

const scenarios = [
  assertRealCaseRegression,
  assertBaseCaseLifecycle,
  assertLockLeaseConflict,
  assertRollbackFuseArchive,
  assertV12VersionPromotion,
  assertReviewSchemaBlocking,
  assertFanqieLiveGate,
  assertFairnessPassLockedRoom,
  assertFairnessBlockedMissingClueAlibi,
  assertFairnessBlockedRevealOnlySocialMotive,
  assertPackageWolfAlias,
  assertPublishPrepNoLiveWrite,
  assertMemorySchemaLifecycle,
  assertQualityScorePassAndBlocked,
  assertDistributionMaterials,
  assertOutlineValidation,
  assertModificationListTracking,
  assertMemoryUpdateCommand,
];

for (const scenario of scenarios) {
  scenario();
  console.log(`PASS ${scenario.name}`);
}

console.log("detective-script-dev multi-case acceptance passed");
