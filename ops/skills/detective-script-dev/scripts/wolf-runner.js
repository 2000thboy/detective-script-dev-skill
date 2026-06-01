#!/usr/bin/env node
/**
 * Wolf Runner — Novel Pipeline CLI
 * Phase-aware runner with artifact protocol enforcement.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CWD = process.cwd();
const CONFIG = loadWolfConfig();
const CASES_DIR = path.resolve(CWD, CONFIG.caseRoot || path.join("content", "cases"));
const MAX_ROLLBACKS = Number(CONFIG.maxRollbacks || 3);
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
Usage: wolf <command> [options]

Commands:
  case init <case-name>          Initialize a new case with artifact protocol
  case check <case-name>         Validate case artifacts against protocol
  case fair-check <case-name>    Check whether key clues appear before reveal
                                  Options: [--version vN] [--draft PATH] [--truth PATH] [--json]
  case score <case-name>         Write a 0-100 quality score report
                                  Options: [--version vN] [--json]
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
  case modification-list <case>  Generate modification list for iteration
                                  Options: --version vN --items "item1,item2"
  case outline-validate <case>   Validate outline against outline-format.md
                                  Options: --outline PATH
  publish prep <case-name>       Generate manual publish package
                                  Options: [--platform fanqie] [--version vN]
  publish checklist <case-name>  Print manual publish checklist path
                                  Options: [--platform fanqie] [--version vN]
  memory init                    Create static user preference memory JSON
                                  Options: [--path PATH] [--force]
  memory check                   Validate static user preference memory JSON
                                  Options: [--path PATH] [--json]
  memory show                    Print static memory summary if configured
                                  Options: [--path PATH] [--json]
  memory update                  Update a specific memory field
                                  Options: --key KEY --value VALUE [--path PATH]

Options:
  --no-write                     Do not update manifest during check
  --help, -h                     Show this help

Optional config:
  ~/.config/wolf/config.json     { "caseRoot": "content/cases", "maxRollbacks": 3 }
  ~/.config/wolf/memory.json     Static user style and failure-pattern memory
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

// ─── Case Name Sanitization ────────────────────────────────────

function sanitizeCaseName(caseName) {
  if (!caseName) return null;
  const trimmed = String(caseName).trim();
  if (!trimmed) return null;
  // Reject path traversal attempts
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    console.error(`Error: case name cannot contain path separators: ${trimmed}`);
    process.exit(1);
  }
  return trimmed;
}

// ─── Project Root Detection ────────────────────────────────────

function detectProjectRoot() {
  // Check for package.json or content/cases/ or .kit/ in current dir or parents
  let dir = process.cwd();
  for (let i = 0; i < 3; i++) {
    if (fs.existsSync(path.join(dir, 'package.json')) ||
        fs.existsSync(path.join(dir, 'content')) ||
        fs.existsSync(path.join(dir, '.kit'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ─── Case Init ─────────────────────────────────────────────────

function initCase(caseName) {
  caseName = sanitizeCaseName(caseName);
  if (!caseName) {
    console.error("Error: case name required");
    process.exit(1);
  }

  const projectRoot = detectProjectRoot();
  if (!projectRoot) {
    console.warn('Warning: No project root detected. Case will be created under current directory.');
    console.warn('Expected to find package.json, content/, or .kit/ in current or parent directories.');
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
  caseName = sanitizeCaseName(caseName);
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

// ─── Fairness Check ───────────────────────────────────────────

function fairCheckCase(caseName, args) {
  caseName = sanitizeCaseName(caseName);
  const options = parseOptions(args);
  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  const version = normalizeVersion(options.version) || state.current_version || detectCaseVersions(caseDir).highest || "v1";
  const truthPath = options.truth ? path.resolve(CWD, options.truth) : path.join(caseDir, "00-meta", "truth-file.json");
  const draftPath = options.draft ? path.resolve(CWD, options.draft) : resolveDraftPath(caseDir, version);

  if (!fs.existsSync(truthPath)) {
    console.error(`Error: truth file not found: ${truthPath}`);
    process.exit(1);
  }
  if (!draftPath || !fs.existsSync(draftPath)) {
    console.error(`Error: draft not found for ${caseName} ${version}`);
    process.exit(1);
  }

  let truthFile;
  try {
    truthFile = JSON.parse(fs.readFileSync(truthPath, 'utf-8'));
  } catch (err) {
    console.error(`Error: truth-file.json is invalid: ${err.message}`);
    process.exit(1);
  }
  const draft = fs.readFileSync(draftPath, "utf-8");
  const report = buildFairnessReport(caseName, version, truthFile, draft, draftPath, truthPath);
  const reviewDir = path.join(caseDir, "05-reviews", version);
  fs.mkdirSync(reviewDir, { recursive: true });
  writeJson(path.join(reviewDir, "fairness-report.json"), report);
  fs.writeFileSync(path.join(reviewDir, "fairness-report.md"), formatFairnessMarkdown(report), "utf-8");
  updateManifest(caseDir, {
    lastFairnessCheck: {
      at: report.created_at,
      version,
      status: report.status,
      report: path.relative(caseDir, path.join(reviewDir, "fairness-report.json")).replace(/\\/g, "/"),
    },
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Fairness: ${report.status}`);
    console.log(`Case: ${caseName}`);
    console.log(`Version: ${version}`);
    console.log(`Clues: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.blocked} blocked`);
    console.log(`Report: ${path.relative(CWD, path.join(reviewDir, "fairness-report.md")).replace(/\\/g, "/")}`);
    for (const item of report.items.filter((entry) => entry.status !== "PASS")) {
      console.log(`  - ${item.status} ${item.id}: ${item.issue}`);
    }
  }

  process.exit(report.status === "BLOCKED" ? 1 : 0);
}

function scoreCase(caseName, args) {
  caseName = sanitizeCaseName(caseName);
  const options = parseOptions(args);
  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  if (!state.completed_nodes || !state.completed_nodes.includes('draft')) {
    console.error('Error: case has not reached draft phase. Run draft-start first.');
    process.exit(1);
  }
  const version = normalizeVersion(options.version) || state.current_version || detectCaseVersions(caseDir).highest || "v1";
  const truthPath = path.join(caseDir, "00-meta", "truth-file.json");
  const draftPath = resolveDraftPath(caseDir, version);
  if (!draftPath || !fs.existsSync(draftPath)) {
    console.error(`Error: draft not found for ${caseName} ${version}`);
    process.exit(1);
  }
  const truthFile = readJson(truthPath);
  const draft = fs.readFileSync(draftPath, "utf-8");
  const reviewDir = path.join(caseDir, "05-reviews", version);
  const fairnessPath = path.join(reviewDir, "fairness-report.json");
  const fairness = fs.existsSync(fairnessPath)
    ? readJson(fairnessPath)
    : buildFairnessReport(caseName, version, truthFile, draft, draftPath, truthPath);
  const report = buildQualityReport(caseName, version, truthFile, draft, fairness, reviewDir);
  fs.mkdirSync(reviewDir, { recursive: true });
  writeJson(path.join(reviewDir, "quality-score.json"), report);
  fs.writeFileSync(path.join(reviewDir, "quality-score.md"), formatQualityMarkdown(report), "utf-8");
  updateManifest(caseDir, {
    lastQualityScore: {
      at: report.created_at,
      version,
      score: report.score,
      verdict: report.verdict,
      report: path.relative(caseDir, path.join(reviewDir, "quality-score.json")).replace(/\\/g, "/"),
    },
  });
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Quality score: ${report.score}/100`);
    console.log(`Verdict: ${report.verdict}`);
    console.log(`Report: ${path.relative(CWD, path.join(reviewDir, "quality-score.md")).replace(/\\/g, "/")}`);
  }
  process.exit(report.verdict === "blocked" ? 1 : 0);
}

function buildFairnessReport(caseName, version, truthFile, draft, draftPath, truthPath) {
  const clues = normalizeClues(truthFile);
  const revealIndex = detectRevealIndex(draft, truthFile);
  const items = clues.map((clue) => evaluateClueFairness(clue, draft, revealIndex));
  const summary = {
    pass: items.filter((item) => item.status === "PASS").length,
    warn: items.filter((item) => item.status === "WARN").length,
    blocked: items.filter((item) => item.status === "BLOCKED").length,
  };
  const status = summary.blocked > 0 ? "BLOCKED" : summary.warn > 0 ? "WARN" : "PASS";
  return {
    case: caseName,
    version,
    status,
    created_at: new Date().toISOString(),
    draft: path.relative(CWD, draftPath).replace(/\\/g, "/"),
    truth_file: path.relative(CWD, truthPath).replace(/\\/g, "/"),
    reveal_index: revealIndex,
    summary,
    items,
  };
}

function normalizeClues(truthFile) {
  const rawClues = Array.isArray(truthFile.clues) ? truthFile.clues : [];
  return rawClues.map((clue, index) => {
    const aliases = Array.isArray(clue.aliases) ? clue.aliases : [];
    const terms = [
      clue.claim,
      clue.description,
      clue.significance,
      clue.text,
      clue.name,
      ...aliases,
    ]
      .filter((term) => typeof term === "string")
      .flatMap((term) => splitSearchTerms(term))
      .filter((term) => term.length >= 2);
    return {
      id: clue.id || `clue-${index + 1}`,
      claim: clue.claim || clue.description || clue.name || "",
      expected_before_reveal: clue.expected_before_reveal !== false,
      terms: unique(terms),
    };
  });
}

function splitSearchTerms(text) {
  const normalized = text.replace(/[，。、“”‘’：:；;（）()[\]{}]/g, " ");
  const parts = normalized.split(/\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return [];
  return [text.trim(), ...parts].filter((part) => part.length <= 40);
}

function evaluateClueFairness(clue, draft, revealIndex) {
  if (!clue.expected_before_reveal) {
    return {
      id: clue.id,
      status: "PASS",
      issue: "not required before reveal",
      first_occurrence: null,
      matched_term: null,
      occurrences_before_reveal: 0,
    };
  }
  if (clue.terms.length === 0) {
    return {
      id: clue.id,
      status: "WARN",
      issue: "clue has no searchable claim, description, name, or aliases",
      first_occurrence: null,
      matched_term: null,
      occurrences_before_reveal: 0,
    };
  }

  const matches = findTermMatches(draft, clue.terms);
  const beforeReveal = matches.filter((match) => match.index < revealIndex);
  if (matches.length === 0) {
    return {
      id: clue.id,
      status: "BLOCKED",
      issue: "key clue is not present in draft",
      first_occurrence: null,
      matched_term: null,
      occurrences_before_reveal: 0,
    };
  }
  if (beforeReveal.length === 0) {
    return {
      id: clue.id,
      status: "BLOCKED",
      issue: "key clue first appears at or after reveal",
      first_occurrence: matches[0].index,
      matched_term: matches[0].term,
      occurrences_before_reveal: 0,
    };
  }
  if (beforeReveal.length === 1 && beforeReveal[0].term.length <= 2) {
    return {
      id: clue.id,
      status: "WARN",
      issue: "clue appears before reveal, but only through a very weak term",
      first_occurrence: beforeReveal[0].index,
      matched_term: beforeReveal[0].term,
      occurrences_before_reveal: beforeReveal.length,
    };
  }
  return {
    id: clue.id,
    status: "PASS",
    issue: "",
    first_occurrence: beforeReveal[0].index,
    matched_term: beforeReveal[0].term,
    occurrences_before_reveal: beforeReveal.length,
  };
}

function findTermMatches(text, terms) {
  const matches = [];
  for (const term of terms) {
    let start = 0;
    while (start < text.length) {
      const index = text.indexOf(term, start);
      if (index === -1) break;
      matches.push({ term, index });
      start = index + Math.max(term.length, 1);
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

function detectRevealIndex(draft, truthFile) {
  const markers = ["## 解谜", "## 真相", "## 揭示", "## 解决篇", "## 终章", "真相是", "最终解释", "canonical solution"];
  const markerIndexes = markers.map((marker) => draft.indexOf(marker)).filter((index) => index >= 0);
  if (markerIndexes.length > 0) return Math.min(...markerIndexes);

  const coreSolution = truthFile.core_trick && truthFile.core_trick.canonical_solution;
  if (typeof coreSolution === "string" && coreSolution.trim()) {
    const solutionTerms = splitSearchTerms(coreSolution).filter((term) => term.length >= 4);
    const solutionMatch = findTermMatches(draft, solutionTerms)[0];
    if (solutionMatch) return solutionMatch.index;
  }

  return Math.floor(draft.length * 0.75);
}

function resolveDraftPath(caseDir, version) {
  const candidates = [
    path.join(caseDir, "04-drafts", version, "full.md"),
    path.join(caseDir, "04-drafts", `${version}.md`),
    path.join(caseDir, "04-drafts", version, "chapters", "full.md"),
    path.join(caseDir, "06-deliverables", `${version}.md`),
    path.join(caseDir, "06-deliverables", "final.md"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function formatFairnessMarkdown(report) {
  const lines = [
    `# Fairness Report — ${report.case} ${report.version}`,
    "",
    `Status: ${report.status}`,
    `Draft: ${report.draft}`,
    `Truth file: ${report.truth_file}`,
    "",
    "## Summary",
    "",
    `- PASS: ${report.summary.pass}`,
    `- WARN: ${report.summary.warn}`,
    `- BLOCKED: ${report.summary.blocked}`,
    "",
    "## Clues",
    "",
  ];
  for (const item of report.items) {
    lines.push(`- ${item.status} ${item.id}: ${item.issue || "fairly planted before reveal"}`);
    if (item.matched_term) lines.push(`  - matched: ${item.matched_term}`);
    if (item.first_occurrence !== null) lines.push(`  - first_occurrence: ${item.first_occurrence}`);
  }
  return `${lines.join("\n")}\n`;
}

function unique(items) {
  return [...new Set(items)];
}

function buildQualityReport(caseName, version, truthFile, draft, fairness, reviewDir) {
  const dimensions = [
    scoreCoreTrick(truthFile),
    scoreFairness(fairness),
    scoreDraftCompleteness(draft),
    scoreReviewArtifacts(reviewDir),
    scorePublishReadiness(reviewDir),
  ];
  const score = Math.round(dimensions.reduce((sum, item) => sum + item.score * item.weight, 0) / dimensions.reduce((sum, item) => sum + item.weight, 0));
  const blockers = dimensions.flatMap((item) => item.blockers.map((blocker) => `${item.name}: ${blocker}`));
  return {
    case: caseName,
    version,
    score,
    verdict: blockers.length > 0 ? "blocked" : score >= 85 ? "pass" : score >= 70 ? "warn" : "blocked",
    created_at: new Date().toISOString(),
    dimensions,
    blockers,
  };
}

function scoreCoreTrick(truthFile) {
  const coreTrick = truthFile.core_trick || {};
  const blockers = [];
  let score = 100;
  if (coreTrick.locked !== true) {
    blockers.push("core_trick is not locked");
    score -= 50;
  }
  for (const field of ["editor_explanation", "canonical_solution", "change_policy"]) {
    if (typeof coreTrick[field] !== "string" || !coreTrick[field].trim()) score -= 10;
  }
  if (!Array.isArray(coreTrick.writer_constraints) || coreTrick.writer_constraints.length === 0) score -= 10;
  return qualityDimension("core_trick", 0.25, score, blockers);
}

function scoreFairness(fairness) {
  const blockers = [];
  let score = 100;
  if (!fairness || fairness.status === "BLOCKED") {
    blockers.push("fairness check is blocked");
    score = 30;
  } else if (fairness.status === "WARN") {
    score = 75;
  }
  if (fairness && fairness.summary) {
    score -= Number(fairness.summary.warn || 0) * 5;
  }
  return qualityDimension("fairness", 0.3, score, blockers);
}

function scoreDraftCompleteness(draft) {
  const blockers = [];
  const length = draft.trim().length;
  let score = 100;
  if (length < 1000) {
    blockers.push("draft is too short for review");
    score = 40;
  } else if (length < 5000) {
    score = 75;
  }
  return qualityDimension("draft_completeness", 0.2, score, blockers, { characters: length });
}

function scoreReviewArtifacts(reviewDir) {
  const hasReview = fs.existsSync(path.join(reviewDir, "review-result.json"));
  const hasEditor = fs.existsSync(path.join(reviewDir, "editor-verdict.json"));
  let score = 60;
  if (hasReview) score += 20;
  if (hasEditor) score += 20;
  return qualityDimension("structured_review", 0.15, score, [], { has_review: hasReview, has_editor_verdict: hasEditor });
}

function scorePublishReadiness(reviewDir) {
  const hasFairness = fs.existsSync(path.join(reviewDir, "fairness-report.json"));
  const hasQuality = fs.existsSync(path.join(reviewDir, "quality-score.json"));
  let score = 70;
  if (hasFairness) score += 20;
  if (hasQuality) score += 10;
  return qualityDimension("publish_readiness", 0.1, score, []);
}

function qualityDimension(name, weight, score, blockers, extra = {}) {
  return {
    name,
    weight,
    score: Math.max(0, Math.min(100, Math.round(score))),
    blockers,
    ...extra,
  };
}

function formatQualityMarkdown(report) {
  const lines = [
    `# Quality Score — ${report.case} ${report.version}`,
    "",
    `Score: ${report.score}/100`,
    `Verdict: ${report.verdict}`,
    "",
    "## Dimensions",
    "",
  ];
  for (const item of report.dimensions) {
    lines.push(`- ${item.name}: ${item.score}/100`);
    for (const blocker of item.blockers) lines.push(`  - blocker: ${blocker}`);
  }
  if (report.blockers.length > 0) {
    lines.push("", "## Blockers", "");
    for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  }
  return `${lines.join("\n")}\n`;
}

function loadWolfConfig() {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return {};
  const configDir = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  const configPath = path.join(configDir, 'wolf', 'config.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const config = {};
    if (typeof parsed.caseRoot === 'string') config.caseRoot = parsed.caseRoot;
    if (typeof parsed.maxRollbacks === 'number') config.maxRollbacks = parsed.maxRollbacks;
    return config;
  } catch (err) {
    console.warn('Warning: Invalid config at', configPath, '- using defaults');
    return {};
  }
}

function memoryInit(args) {
  const options = parseOptions(args);
  const memoryPath = resolveMemoryPath(options.path);
  if (fs.existsSync(memoryPath) && !options.force) {
    console.error(`Error: memory file already exists: ${memoryPath}`);
    console.error("Re-run with --force to overwrite.");
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
  writeJson(memoryPath, defaultMemoryTemplate());
  console.log(`Memory initialized: ${memoryPath}`);
}

function memoryCheck(args) {
  const options = parseOptions(args);
  const memoryPath = resolveMemoryPath(options.path);
  if (!fs.existsSync(memoryPath)) {
    console.error(`Error: memory file not found: ${memoryPath}`);
    process.exit(1);
  }
  const memory = readJson(memoryPath);
  const result = validateMemory(memory);
  if (options.json) {
    console.log(JSON.stringify({ path: memoryPath, ...result }, null, 2));
  } else {
    console.log(`Memory: ${result.ok ? "PASS" : "BLOCKED"}`);
    console.log(`Path: ${memoryPath}`);
    for (const issue of result.issues) console.log(`  - ${issue}`);
  }
  process.exit(result.ok ? 0 : 1);
}

function memoryShow(args) {
  const options = parseOptions(args);
  const memoryPath = resolveMemoryPath(options.path);
  if (!fs.existsSync(memoryPath)) {
    if (options.json) console.log(JSON.stringify({ configured: false, path: memoryPath }, null, 2));
    else console.log(`Memory not configured: ${memoryPath}`);
    return;
  }
  const memory = readJson(memoryPath);
  const result = validateMemory(memory);
  if (!result.ok) {
    console.error(`Error: invalid memory at ${memoryPath}: ${result.issues.join(", ")}`);
    process.exit(1);
  }
  const summary = memorySummary(memory, memoryPath);
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Memory: ${summary.configured ? "configured" : "not configured"}`);
    console.log(`Path: ${summary.path}`);
    console.log(`Preferred style: ${summary.user_profile.preferred_style.join(", ") || "none"}`);
    console.log(`Failure patterns: ${summary.failure_patterns_count}`);
  }
}

function memoryUpdate(args) {
  const options = parseOptions(args);
  const key = options.key;
  const value = options.value;

  if (!key || value === undefined) {
    console.error("Error: memory update requires --key KEY --value VALUE");
    process.exit(1);
  }

  const memoryPath = resolveMemoryPath(options.path);
  let memory;
  if (fs.existsSync(memoryPath)) {
    memory = readJson(memoryPath);
  } else {
    memory = defaultMemoryTemplate();
  }

  const result = validateMemory(memory);
  if (!result.ok) {
    console.error(`Error: invalid memory at ${memoryPath}: ${result.issues.join(", ")}`);
    process.exit(1);
  }

  // Update the key under user_profile
  const profileKeys = new Set([
    "preferred_style",
    "preferred_pace",
    "preferred_trick_type",
    "chapter_length_target",
    "outline_depth",
  ]);

  if (profileKeys.has(key)) {
    if (key === "preferred_style" || key === "preferred_trick_type") {
      if (!Array.isArray(memory.user_profile[key])) memory.user_profile[key] = [];
      if (!memory.user_profile[key].includes(value)) {
        memory.user_profile[key].push(value);
      }
    } else {
      memory.user_profile[key] = value;
    }
  } else if (key === "successful_cases") {
    if (!Array.isArray(memory.successful_cases)) memory.successful_cases = [];
    if (!memory.successful_cases.includes(value)) {
      memory.successful_cases.push(value);
    }
  } else if (key === "failure_patterns") {
    if (!Array.isArray(memory.failure_patterns)) memory.failure_patterns = [];
    if (!memory.failure_patterns.includes(value)) {
      memory.failure_patterns.push(value);
    }
  } else {
    // Allow arbitrary keys under user_profile
    memory.user_profile[key] = value;
  }

  memory.updated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
  writeJson(memoryPath, memory);

  if (options.json) {
    console.log(JSON.stringify({ updated: true, key, value, path: memoryPath }, null, 2));
  } else {
    console.log(`Memory updated: ${key} = ${value}`);
    console.log(`Path: ${memoryPath}`);
  }
}

function loadMemorySummary() {
  const memoryPath = resolveMemoryPath();
  if (!fs.existsSync(memoryPath)) {
    return { configured: false, path: memoryPath };
  }
  try {
    const memory = readJson(memoryPath);
    const result = validateMemory(memory);
    if (!result.ok) return { configured: false, path: memoryPath, issues: result.issues };
    return memorySummary(memory, memoryPath);
  } catch (err) {
    return { configured: false, path: memoryPath, issues: [err.message] };
  }
}

function memorySummary(memory, memoryPath) {
  return {
    configured: true,
    path: memoryPath,
    user_profile: memory.user_profile,
    successful_cases_count: memory.successful_cases.length,
    failure_patterns_count: memory.failure_patterns.length,
  };
}

function resolveMemoryPath(customPath) {
  if (customPath) return path.resolve(CWD, customPath);
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) {
    console.error("Error: cannot resolve home directory for memory path");
    process.exit(1);
  }
  return path.join(home, ".config", "wolf", "memory.json");
}

function defaultMemoryTemplate() {
  return {
    version: "1.0",
    user_profile: {
      preferred_style: [],
      preferred_pace: "",
      preferred_trick_type: [],
      chapter_length_target: null,
      outline_depth: null,
    },
    successful_cases: [],
    failure_patterns: [],
    updated_at: new Date().toISOString(),
  };
}

function validateMemory(memory) {
  const issues = [];
  if (!memory || typeof memory !== "object" || Array.isArray(memory)) {
    return { ok: false, issues: ["memory root must be an object"] };
  }
  if (!memory.user_profile || typeof memory.user_profile !== "object" || Array.isArray(memory.user_profile)) {
    issues.push("user_profile must be an object");
  } else {
    const profile = memory.user_profile;
    for (const field of ["preferred_style", "preferred_trick_type"]) {
      if (!Array.isArray(profile[field])) issues.push(`user_profile.${field} must be an array`);
    }
    if (profile.chapter_length_target !== null && profile.chapter_length_target !== undefined && typeof profile.chapter_length_target !== "number") {
      issues.push("user_profile.chapter_length_target must be number or null");
    }
    if (profile.outline_depth !== null && profile.outline_depth !== undefined && typeof profile.outline_depth !== "number") {
      issues.push("user_profile.outline_depth must be number or null");
    }
  }
  for (const field of ["successful_cases", "failure_patterns"]) {
    if (!Array.isArray(memory[field])) issues.push(`${field} must be an array`);
  }
  return { ok: issues.length === 0, issues };
}

// ─── Case Status / Rollback / Archive ─────────────────────────

function statusCase(caseName) {
  caseName = sanitizeCaseName(caseName);
  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  const manifest = readJson(path.join(caseDir, ".case", "manifest.json"));
  const versions = detectCaseVersions(caseDir);
  console.log(JSON.stringify({ state, manifest, versions }, null, 2));
}

function rollbackCase(caseName, args) {
  caseName = sanitizeCaseName(caseName);
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
  caseName = sanitizeCaseName(caseName);
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
  caseName = sanitizeCaseName(caseName);
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
  caseName = sanitizeCaseName(caseName);
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
  caseName = sanitizeCaseName(caseName);
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
  caseName = sanitizeCaseName(caseName);
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
  caseName = sanitizeCaseName(caseName);
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
  caseName = sanitizeCaseName(caseName);
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
  caseName = sanitizeCaseName(caseName);
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
    memory: loadMemorySummary(),
    next_action: nextActionForState(state),
  };
  console.log(JSON.stringify(summary, null, 2));
}

function nodeCommandCase(command, caseName, args) {
  caseName = sanitizeCaseName(caseName);
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
    if (!options['i-approve']) {
      console.error('CONFIRM_REQUIRED');
      console.error('Locking the core trick is irreversible. Re-run with --i-approve after reviewing the truth file.');
      process.exit(2);
    }
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

// ─── Modification List ─────────────────────────────────────────

function modificationListCase(caseName, args) {
  const options = parseOptions(args);
  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  const version = normalizeVersion(options.version) || state.current_version || detectCaseVersions(caseDir).highest || "v1";
  const items = (options.items || "").split(",").filter(Boolean);

  const reviewDir = path.join(caseDir, "05-reviews", version);
  fs.mkdirSync(reviewDir, { recursive: true });

  // Detect iteration number
  const existingLists = fs.existsSync(reviewDir)
    ? fs.readdirSync(reviewDir).filter((f) => f.startsWith("modification-list-"))
    : [];
  const iteration = existingLists.length + 1;

  const lines = [
    `# Modification List — ${caseName} ${version} Iteration ${iteration}`,
    "",
    `## Trigger`,
    "",
    `- Editor verdict: needs_revision`,
    `- Iteration: ${iteration}`,
    `- Generated at: ${new Date().toISOString()}`,
    "",
    "## Modification Items",
    "",
    "| # | Priority | Item | Reason | Source | Location | Status |",
    "|---|----------|------|--------|--------|----------|--------|",
  ];

  for (let i = 0; i < items.length; i++) {
    lines.push(`| ${i + 1} | P1 | ${items[i]} | pending | editor-judge | TBD | pending |`);
  }

  if (items.length === 0) {
    lines.push("| — | — | (no items provided, populate from editor-verdict.json) | — | — | — | — |");
  }

  lines.push(
    "",
    "## Revision Record",
    "",
    "| Round | Changes | Verification |",
    "|-------|---------|--------------|",
    `| ${iteration} | (pending) | (pending) |`,
    ""
  );

  const fileName = `modification-list-${version}-iter${iteration}.md`;
  const filePath = path.join(reviewDir, fileName);
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");

  updateManifest(caseDir, {
    lastModificationList: {
      version,
      iteration,
      path: path.relative(caseDir, filePath).replace(/\\/g, "/"),
      at: new Date().toISOString(),
    },
  });

  console.log(`Modification list created: ${path.relative(CWD, filePath).replace(/\\/g, "/")}`);
  console.log(`Iteration: ${iteration}`);
}

// ─── Outline Validate ──────────────────────────────────────────

function outlineValidateCase(caseName, args) {
  const options = parseOptions(args);
  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  const version = normalizeVersion(options.version) || state.current_version || detectCaseVersions(caseDir).highest || "v1";

  const outlinePath = options.outline
    ? path.resolve(CWD, options.outline)
    : path.join(caseDir, "03-outline", `${version}.md`);

  if (!fs.existsSync(outlinePath)) {
    console.error(`Error: outline not found at ${outlinePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(outlinePath, "utf-8");
  const report = validateOutline(content);

  const reviewDir = path.join(caseDir, "05-reviews", version);
  fs.mkdirSync(reviewDir, { recursive: true });
  writeJson(path.join(reviewDir, "outline-validation.json"), {
    case: caseName,
    version,
    outline: path.relative(CWD, outlinePath).replace(/\\/g, "/"),
    status: report.ok ? "PASS" : "FAIL",
    checks: report.checks,
    violations: report.violations,
    created_at: new Date().toISOString(),
  });

  if (report.ok) {
    console.log(`Outline validation: PASS`);
    console.log(`All ${report.checks.length} checks passed`);
  } else {
    console.log(`Outline validation: FAIL`);
    console.log("Violations:");
    for (const v of report.violations) {
      console.log(`  - ${v}`);
    }
    console.log(`\nChecks: ${report.checks.filter((c) => c.status === "PASS").length}/${report.checks.length} passed`);
  }

  process.exit(report.ok ? 0 : 1);
}

function validateOutline(content) {
  const checks = [];
  const violations = [];

  // Check 1: 一句话故事
  const oneLinerMatch = content.match(/##?\s*一句话故事[\s\S]*?\n\s*([^#\n][^\n]{10,150})/i);
  const hasOneLiner = oneLinerMatch && oneLinerMatch[1].trim().length >= 10;
  checks.push({ check: "section:一句话故事", status: hasOneLiner ? "PASS" : "FAIL" });
  if (!hasOneLiner) violations.push("缺少'一句话故事'或内容过短（需≥10字）");

  // Check 2: 故事简介 (200-500 chars)
  const synopsisMatch = content.match(/##?\s*故事简介[\s\S]*?\n\s*([^#\n][^#]*)/i);
  let synopsisLength = 0;
  if (synopsisMatch) {
    synopsisLength = synopsisMatch[1].replace(/\s/g, "").length;
  }
  const synopsisOk = synopsisLength >= 200 && synopsisLength <= 500;
  checks.push({ check: "section:故事简介", status: synopsisOk ? "PASS" : "FAIL" });
  if (synopsisLength < 200) violations.push(`故事简介过短: ${synopsisLength}字（需≥200字）`);
  if (synopsisLength > 500) violations.push(`故事简介过长: ${synopsisLength}字（需≤500字）`);
  if (synopsisLength === 0) violations.push("缺少'故事简介'部分");

  // Check 3: 故事细纲 (5000-10000 chars)
  const outlineMatch = content.match(/##?\s*故事细纲[\s\S]*?\n\s*([^#\n][^#]*)/i);
  let outlineLength = 0;
  if (outlineMatch) {
    const startIdx = content.indexOf(outlineMatch[0]);
    const endIdx = content.search(/##?\s*人物简介/i);
    const outlineSection = endIdx > startIdx ? content.slice(startIdx, endIdx) : content.slice(startIdx);
    outlineLength = outlineSection.replace(/\s/g, "").length;
  }
  const outlineOk = outlineLength >= 5000 && outlineLength <= 10000;
  checks.push({ check: "section:故事细纲", status: outlineOk ? "PASS" : "FAIL" });
  if (outlineLength < 5000) violations.push(`故事细纲过短: ${outlineLength}字（需≥5000字）`);
  if (outlineLength > 10000) violations.push(`故事细纲过长: ${outlineLength}字（需≤10000字）`);
  if (outlineLength === 0) violations.push("缺少'故事细纲'部分");

  // Check 4: 人物简介
  const charMatch = content.match(/##?\s*人物简介/i);
  const hasChars = !!charMatch;
  checks.push({ check: "section:人物简介", status: hasChars ? "PASS" : "WARN" });
  if (!hasChars) violations.push("缺少'人物简介'部分（建议添加）");

  // Check 5: Structure order
  const orderCheck = checkOutlineStructure(content);
  checks.push({ check: "structure:section_order", status: orderCheck.ok ? "PASS" : "FAIL" });
  if (!orderCheck.ok) violations.push(`大纲结构顺序错误: ${orderCheck.issue}`);

  return {
    ok: violations.filter((v) => !v.includes("建议")).length === 0,
    checks,
    violations,
  };
}

function checkOutlineStructure(content) {
  const sections = ["一句话故事", "故事简介", "故事细纲", "人物简介"];
  const positions = sections.map((s) => {
    const match = content.match(new RegExp(`##?\\s*${s}`, "i"));
    return match ? content.indexOf(match[0]) : -1;
  });

  const found = positions.filter((p) => p >= 0);
  if (found.length < 3) {
    return { ok: false, issue: `仅找到 ${found.length}/4 个核心部分` };
  }

  // Check ascending order
  let lastPos = -1;
  for (const pos of positions) {
    if (pos >= 0) {
      if (pos < lastPos) {
        return { ok: false, issue: "核心部分未按正确顺序排列" };
      }
      lastPos = pos;
    }
  }

  return { ok: true, issue: "" };
}

// ─── Publish Prep ─────────────────────────────────────────────

function publishPrepCase(caseName, args) {
  caseName = sanitizeCaseName(caseName);
  const options = parseOptions(args);
  const platform = options.platform || "fanqie";
  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  const version = normalizeVersion(options.version) || state.current_version || detectCaseVersions(caseDir).highest || "v1";
  const draftPath = resolveDraftPath(caseDir, version);
  if (!draftPath || !fs.existsSync(draftPath)) {
    console.error(`Error: draft not found for ${caseName} ${version}`);
    process.exit(1);
  }

  const draft = fs.readFileSync(draftPath, "utf-8");
  const packageDir = path.join(caseDir, "06-deliverables", "publish", `${platform}-package`);
  fs.mkdirSync(packageDir, { recursive: true });
  const title = inferTitle(caseName, draft);
  const synopsis = inferSynopsis(draft);
  fs.writeFileSync(path.join(packageDir, "chapter.txt"), draft, "utf-8");
  fs.writeFileSync(path.join(packageDir, "title.txt"), `${title}\n`, "utf-8");
  fs.writeFileSync(path.join(packageDir, "synopsis.txt"), `${synopsis}\n`, "utf-8");
  fs.writeFileSync(path.join(packageDir, "publish-checklist.md"), formatPublishChecklist(caseName, version, platform), "utf-8");
  writeJson(path.join(packageDir, "manual-copy-plan.json"), {
    case: caseName,
    version,
    platform,
    created_at: new Date().toISOString(),
    live_write: false,
    files: {
      chapter: "chapter.txt",
      title: "title.txt",
      synopsis: "synopsis.txt",
      checklist: "publish-checklist.md",
    },
    next_action: "manual_copy_after_human_publish_approval",
  });
  updateManifest(caseDir, {
    lastPublishPrep: {
      version,
      platform,
      package: path.relative(caseDir, packageDir).replace(/\\/g, "/"),
      liveWrite: false,
    },
  });
  console.log(`Publish package prepared: ${path.relative(CWD, packageDir).replace(/\\/g, "/")}`);
  console.log("Live write: false");
}

function publishChecklistCase(caseName, args) {
  caseName = sanitizeCaseName(caseName);
  const options = parseOptions(args);
  const platform = options.platform || "fanqie";
  const caseDir = requireCaseDir(caseName);
  const state = loadState(caseDir, caseName);
  const version = normalizeVersion(options.version) || state.current_version || detectCaseVersions(caseDir).highest || "v1";
  const checklistPath = path.join(caseDir, "06-deliverables", "publish", `${platform}-package`, "publish-checklist.md");
  if (!fs.existsSync(checklistPath)) {
    publishPrepCase(caseName, ["--platform", platform, "--version", version]);
    return;
  }
  console.log(path.relative(CWD, checklistPath).replace(/\\/g, "/"));
}

function inferTitle(caseName, draft) {
  const heading = draft.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  if (!heading) return caseName;
  return heading.replace(/^#\s+/, "").trim() || caseName;
}

function inferSynopsis(draft) {
  const lines = draft.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  return lines.slice(0, 3).join("\n").slice(0, 500);
}

function formatPublishChecklist(caseName, version, platform) {
  return `# Publish Checklist — ${caseName} ${version}

Platform: ${platform}
Live write: false

- Confirm final draft version with user.
- Confirm title and synopsis.
- Copy chapter text manually into the platform editor.
- Preview formatting in the platform editor.
- Publish only after explicit human approval.
`;
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
    else if (subcmd === "fair-check") fairCheckCase(name, args.slice(3));
    else if (subcmd === "score") scoreCase(name, args.slice(3));
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
    else if (subcmd === "modification-list") modificationListCase(name, args.slice(3));
    else if (subcmd === "outline-validate") outlineValidateCase(name, args.slice(3));
    else {
      console.error(`Unknown case subcommand: ${subcmd}`);
      process.exit(1);
    }
  } else if (cmd === "publish") {
    if (subcmd === "prep") publishPrepCase(name, args.slice(3));
    else if (subcmd === "checklist") publishChecklistCase(name, args.slice(3));
    else {
      console.error(`Unknown publish subcommand: ${subcmd}`);
      process.exit(1);
    }
  } else if (cmd === "memory") {
    if (subcmd === "init") memoryInit(args.slice(2));
    else if (subcmd === "check") memoryCheck(args.slice(2));
    else if (subcmd === "show") memoryShow(args.slice(2));
    else if (subcmd === "update") memoryUpdate(args.slice(2));
    else {
      console.error(`Unknown memory subcommand: ${subcmd}`);
      process.exit(1);
    }
  } else {
    console.error(`Unknown command: ${cmd}`);
    usage();
  }
}

main();
