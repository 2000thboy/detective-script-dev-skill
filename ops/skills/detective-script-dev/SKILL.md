---
name: detective-script-dev
description: >
  Use this skill when Codex needs to run or orchestrate detective-script-dev, a
  detective/mystery novel pipeline for structured case initialization,
  brief/research/outline/draft/review flow, core trick locking, editor-led
  writer instructions, deterministic artifact paths, clue fairness checking,
  0-100 quality scoring, static user preference memory, multi-agent review
  contracts, or optional Fanqie publish preparation with human approval.
  Trigger for Chinese requests such as "按 detective-script-dev 写",
  "小说流水线", "侦探小说", "核心诡计锁死", "主编讲解后让写手写",
  "封装成 skill", "番茄发布准备", or "case check".
---

# detective-script-dev

detective-script-dev is a frontend-free detective fiction creation skill. Use
it as the control surface for a local workflow: Codex talks with the user, locks
creative facts, routes writing/review work, and keeps artifacts in deterministic
case folders.

## Critical Rule: Load References into Context

**Before any generation (outline, draft, review), you MUST load the relevant
reference documents into context.** This ensures all outputs conform to the
enforced protocols.

Required context loading sequence:

1. **Before demand clarification**: Read `references/demand-clarification.md`
2. **Before outline generation**: Read `references/outline-format.md`
3. **Before any review**: Read `references/agent-review.md` and `references/agents.yaml`
4. **Before drafting**: Read `references/artifact-protocol.md` and locked `truth-file.json`
5. **Before publish prep**: Read `references/beta-acceptance.md`

These documents define the canonical formats, agent roles, and quality gates.
**Never generate content that violates loaded reference documents.**

## First Response — State-Aware Launch Flow

Always start with a short Chinese status brief and **case state probe**:

```text
当前状态: 新建 case | 继续 case | 检查 case | 发布准备
目标: 用户这次要产出的内容
当前确认门: none | brief-approval | core-trick-approval | draft-version-approval | publish-approval
产物位置: content/cases/{case}/
下一步: one concrete action
需要你决定: only the next blocking creative or publish decision
```

### Launch Gated Sequence

**STEP 1: Case State Probe**
- Run `wolf case list` to detect existing cases.
- If cases exist, run `wolf case status {case}` for the active case.
- Determine: new case | continuing case | returning user.

**STEP 2: First-Launch Gate**
- Ask: "这是您第一次使用 detective-script-dev 吗？（是/否）"
- If YES: briefly explain the workflow (4-layer clarification → case init → brief → research → outline → core-trick-lock → draft → 6-agent review → publish-prep).
- If NO: ask which case to continue, or if starting a new one.

**STEP 3: Intent Confirmation**
- Ask what the user wants to write.
- Ask one blocking question at a time:
  1. 作品类型（同人/原创）？
  2. 目标字数？
  3. 核心风格偏好？

**STEP 4: Chinese Writing Confirmation Gate**
- Ask: "您确认要用中文进行创作吗？**在确认之前，我不会创建任何 .md 或 .json 文件。**"
- Only after explicit "确认/是/OK/没问题" proceed to Demand Clarification Phase.

## Demand Clarification Phase

**RULE: No files are created until Layer 4 is confirmed.**

Before starting this phase, **load `references/demand-clarification.md` into context**.

### Layered Discussion

| Layer | Focus | Topics |
|-------|-------|--------|
| 1 | 基础定位 | 同人/原创、参考作品、禁忌元素、目标字数、章节数、诡计类型 |
| 2 | 结构偏好 | 诡计类型细化、节奏（慢热/快节奏）、大纲深度、反转次数 |
| 3 | 风格偏好 | 文笔风格、角色关系基调、对话密度、内心独白、时代背景 |
| 4 | 确认汇总 | 打印前三层汇总，用户最终确认后才执行 `case init` |

### Return Mechanism

At the end of each layer, ask: "确认进入下一层，还是返回上一层修改？"
- Supported: "返回上一层" / "回到 Layer 1/2/3" / "修改 Layer X 的 XXX"
- Trick discussions may iterate multiple times across layers.
- User can say "重新讨论诡计" to return to Layer 1 trick type discussion.

### File Creation Rule

**ABSOLUTE**: No `.md`, `.json`, or any artifact files are created until:
1. Layer 4 is fully confirmed by the user
2. `wolf case init CASE_NAME` is explicitly run

If the user provides creative content during clarification (e.g., a story idea),
summarize it in the conversation but do NOT write it to disk until Layer 4.

## When NOT to Use

- Do not use for non-mystery fiction genres (romance, sci-fi without mystery elements, etc.).
- Do not use for live platform publishing without explicit human `--confirm-live` approval.
- Do not use for general creative writing without a structured case workflow.
- Do not use when the user has not provided a case name or creative direction.
- Do not modify locked `truth-file.json` core tricks without user approval.

## Workflow

```text
case init (after Layer 4 confirmation only)
-> brief                    [brief-approval]
-> research
-> outline                  [outline-format enforcement]
-> core-trick-lock          [core-trick-approval]
-> draft
-> completeness-gate
-> mandatory-6-agent-review [95/100 threshold each]
-> editor-judge
-> revise or publish-prep   [draft-version-approval / publish-approval]
```

## Outline Format Enforcement

**Before accepting any outline, load `references/outline-format.md` into context.**

The outline MUST follow this strict 4-section format:

1. **一句话故事**: ≤150 字，简洁概括核心创意
2. **故事简介**: 200-500 字，包含故事链条、人物人设、情节展开、真相反转、时代背景、异文化展示
3. **故事细纲**: 5000-10000 字，细化到每章节拍
4. **人物简介**: 主要角色的性格、动机、关系

**Enforcement**: Run `wolf case outline-validate CASE_NAME --outline PATH` before accepting any outline. Reject any deviation with specific violations.

## Mandatory 6-Agent Review

**Before any review, load `references/agent-review.md` and `references/agents.yaml` into context.**

### Review Pipeline (Sequential)

```text
completeness-gate (deterministic)
  -> strict-reader      (阅读体验、节奏、钩子设计)     threshold: 95/100
  -> canon-checker     (原著合规、角色OOC、世界观)     threshold: 95/100
  -> logic-checker     (时间线、因果链、线索、推理)    threshold: 95/100
  -> ai-flavor-checker (AI味检测 — MANDATORY)          threshold: 95/100
  -> research-usage-checker (Research引用 — MANDATORY)  threshold: 95/100
  -> editor-judge      (主编调度器，聚合裁决)
```

### Mandatory Rules

1. **ai-flavor-checker** and **research-usage-checker** are **non-optional**. If either is missing from review artifacts, editor-judge MUST return `needs_revision` with reason: "缺少强制审查环节".
2. **Each agent scores 0-100 per dimension**, passing threshold is **95/100**.
3. **editor-judge is the sole orchestrator**: aggregates all 6 reviews, identifies consensus issues, resolves conflicts, outputs prioritized revision checklist (P0/P1/P2).
4. All review artifacts MUST be written to `content/cases/{case}/05-reviews/v{N}/`.

### AI Flavor Check (Mandatory)

The ai-flavor-checker explicitly checks for:
- 过度总结（段落开头/结尾的概括句）
- 重复三联（"不仅...而且...更重要的是..."）
- 说教感（直接灌输道理而非展示）
- 模板化表达（通用化描述，缺乏个性）
- 机械感（句子结构过于整齐、用词过于规范）

**Any flagged AI-flavor issue MUST be fixed before proceeding.**

### Research Usage Check (Mandatory)

The research-usage-checker verifies:
- `02-research/` notes are actually used in text (not just listed)
- Research content is transformed into story details, not just mentioned
- Professional knowledge is used accurately in correct scenes
- Depth: surface mention vs. deep integration

**Any research content not integrated MUST be fixed or removed with user approval.**

## Iterative Refinement

When editor-judge returns `needs_revision`:

1. Generate `modification-list-v{N}-iter{M}.md`:
   ```bash
   wolf case modification-list CASE_NAME --version vN --items "item1,item2,..."
   ```
2. Writer revises based on the checklist.
3. Increment `iteration_number`.
4. Re-run the full 6-agent review.
5. Compare with `previous_verdict_reference`.
6. Repeat until `pass` or user explicitly approves `proceed`.

Track iterations in `content/cases/{case}/.case/state.json` under `iteration_tracking`.

## Core Trick Lock

Treat the core trick as a locked truth asset, not a suggestion.

Before writing draft prose, the editor must produce:

- `editor_explanation`: plain-language explanation for the writer.
- `canonical_solution`: the final truth, method, clue chain, and reveal logic.
- `writer_constraints`: what the writer must not change.
- `change_policy`: user approval required before any core trick change.

Write these fields to `content/cases/{case}/00-meta/truth-file.json` under
`core_trick`, then set `locked: true` only after the user approves.

If a writer or reviewer wants to change the culprit logic, method, motive truth,
reveal chain, or final explanation, stop and return `CONFIRM_REQUIRED` with the
proposed change. Do not silently rewrite the locked trick.

## User Memory Update

When the user explicitly states a preference during any conversation (e.g.,
"我喜欢慢节奏"), save it to `~/.config/wolf/memory.json`:

```bash
wolf memory update --key preferred_pace --value "slow"
wolf memory update --key preferred_style --value "轻小说"
```

Tracked fields:
- `preferred_style`: array of style tags
- `preferred_pace`: "slow" | "fast" | "mixed"
- `preferred_trick_type`: array of trick type tags
- `chapter_length_target`: number (words)
- `outline_depth`: number (1-5 scale)
- `successful_cases`: array of case names that passed review
- `failure_patterns`: array of recurring issues found in reviews

Use `wolf memory show` at the start of each new case to load preferences into
brief/outline/draft prompts. Memory is preference context only; locked case
truth always overrides memory.

## Commands

Run from the project root or from a workspace that contains `content/cases/`.
If globally installed as `wolf`, the runner can also read optional config from
`~/.config/wolf/config.json`; absence of that file is valid.

```bash
node ops/skills/detective-script-dev/scripts/wolf-runner.js case init CASE_NAME
node ops/skills/detective-script-dev/scripts/wolf-runner.js case list
node ops/skills/detective-script-dev/scripts/wolf-runner.js case check CASE_NAME
node ops/skills/detective-script-dev/scripts/wolf-runner.js case check CASE_NAME --no-write
node ops/skills/detective-script-dev/scripts/wolf-runner.js case fair-check CASE_NAME --version vN
node ops/skills/detective-script-dev/scripts/wolf-runner.js case score CASE_NAME --version vN
node ops/skills/detective-script-dev/scripts/wolf-runner.js case status CASE_NAME
node ops/skills/detective-script-dev/scripts/wolf-runner.js case modification-list CASE_NAME --version vN --items "item1,item2"
node ops/skills/detective-script-dev/scripts/wolf-runner.js case outline-validate CASE_NAME --outline PATH
node ops/skills/detective-script-dev/scripts/wolf-runner.js case rollback CASE_NAME --to vN --reason "why" --owner "agent-or-human"
node ops/skills/detective-script-dev/scripts/wolf-runner.js case promote CASE_NAME --version vN --owner NAME --reason TEXT
node ops/skills/detective-script-dev/scripts/wolf-runner.js case recover CASE_NAME --manual --owner NAME --reason TEXT
node ops/skills/detective-script-dev/scripts/wolf-runner.js case lock CASE_NAME --owner "agent-or-human" --ttl-minutes 120
node ops/skills/detective-script-dev/scripts/wolf-runner.js case unlock CASE_NAME --owner "agent-or-human"
node ops/skills/detective-script-dev/scripts/wolf-runner.js case archive CASE_NAME --reason "why" --owner "agent-or-human"
node ops/skills/detective-script-dev/scripts/wolf-runner.js publish prep CASE_NAME --platform fanqie --version vN
node ops/skills/detective-script-dev/scripts/wolf-runner.js publish checklist CASE_NAME --platform fanqie --version vN
node ops/skills/detective-script-dev/scripts/wolf-runner.js memory init
node ops/skills/detective-script-dev/scripts/wolf-runner.js memory check
node ops/skills/detective-script-dev/scripts/wolf-runner.js memory show
node ops/skills/detective-script-dev/scripts/wolf-runner.js memory update --key KEY --value VALUE
```

Fanqie preparation is optional and human-gated:

```bash
node ops/skills/detective-script-dev/scripts/wolf-runner.js publish prep CASE_NAME --platform fanqie --version vN
node ops/skills/detective-script-dev/scripts/fanqie-cli.js check-status --book-id BOOK_ID
```

## Interaction Rules

- Speak Chinese to the user unless they ask otherwise.
- Ask one blocking question at a time.
- After each user confirmation, record the approved fact in the case artifact.
- **Before generating any content, load the relevant reference .md files into context** (see Critical Rule above).
- When drafting, inject `characters.json`, `truth-file.json`, the approved
  outline, and the editor explanation before writer instructions.
- When reviewing, load `references/agents.yaml` and require structured outputs
  matching `schemas/review-result.json` and `schemas/editor-verdict.json`.
- Before editor approval, run `case fair-check` for the draft version being
  considered. Treat `BLOCKED` as a hard stop until the clue is planted earlier
  or the locked truth is explicitly changed by the user.
- Run `case score` after fairness check. Treat `blocked` as an editor stop and
  `warn` as requiring editor judgment before publish prep.
- Use memory only as preference context for brief/outline/draft/review prompts.
  Locked case truth in `truth-file.json` always overrides memory.
- When using multiple subagents, give each one a distinct owner label and write
  only to its assigned artifact path. Use `case lock` before coordinated writes
  and `case unlock` after completion. Record coordination decisions in
  `.case/state.json` or the relevant review artifact before merging.
- If an editor decision says `rollback`, call `case rollback`. After the third
  rollback, treat `status: fused` as a hard stop; do not draft again until the
  user explicitly approves a new direction.
- For deterministic checks, prefer the runner before subjective review.
- Keep live platform actions as `CONFIRM_REQUIRED`.

## References

Read these **into context before generating corresponding content**:

- `references/demand-clarification.md`: demand clarification phase protocol, layered discussion, return mechanism.
- `references/outline-format.md`: strict 4-section outline format, word count rules, validation criteria.
- `references/artifact-protocol.md`: case folders, truth lock shape, validation.
- `references/agent-review.md`: 6-agent mandatory review flow, scoring rules, iteration tracking.
- `references/agents.yaml`: concrete role definitions for all 6 reviewers and editor-judge.
- `references/beta-acceptance.md`: first external-user acceptance script.
- `schemas/review-result.json`: expert review output schema.
- `schemas/editor-verdict.json`: editor decision output schema.
- `marketplace.json`: distribution listing draft and safety claims.
