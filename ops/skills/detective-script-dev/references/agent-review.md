# Agent Review Contract

Run deterministic checks before LLM review. Do not claim multi-agent review
happened unless review artifacts exist under:

```text
content/cases/{case}/05-reviews/v{N}/
```

## Mandatory 6-Agent Review Flow

以下流程为**强制要求**，不可跳过任何环节：

```text
completeness-gate
-> strict-reader（严格读者：阅读体验、节奏、钩子）
-> canon-checker（原著合规：原作设定、角色OOC、世界观）
-> logic-checker（逻辑线索：时间线、因果链、线索铺设、推理完整性）
-> ai-flavor-checker（AI味检测：机械感、过度总结、说教感 — MANDATORY）
-> research-usage-checker（Research引用：研究内容转化度 — MANDATORY）
-> editor-judge（主编调度器：聚合裁决）
```

### 强制规则

1. **ai-flavor-checker 和 research-usage-checker 是强制环节**。缺少任一项，editor-judge 必须返回 `needs_revision`，理由为："缺少强制审查环节"。
2. **每项评分 0-100，通过阈值 95/100**（沿用 HYOUKA-GZ 案例标准）。低于 95 分的维度必须进入修订清单。
3. **editor-judge 是唯一的调度器**，负责：
   - 识别共识问题（2个以上审查员同意的问题）
   - 裁决冲突意见
   - 输出优先级排序的修改清单（P0/P1/P2）
   - 决定 next_action: `revise_and_resubmit` | `proceed` | `rollback`

### 审查员输出规范

每个审查员输出 `review-result.json`，包含：
- `reviewer_id`: 审查员标识
- `dimensions`: 各维度评分（0-100）和 verdict
- `overall_score`: 总分（0-100）
- `overall_verdict`: `pass` | `needs_revision`
- `critical_issues`: 关键问题列表

主编输出 `editor-verdict.json`，包含：
- `consensus_issues`: 共识问题列表
- `conflicts`: 冲突意见列表
- `revision_checklist`: P0/P1/P2 修改清单
- `modification_list_path`: 对应的 modification-list 文件路径
- `iteration_number`: 当前迭代轮次
- `previous_verdict_reference`: 上一轮 verdict 文件路径（如有）

## 迭代修改追踪

每次修订必须生成 `modification-list-v{N}-iter{M}.md`：

```text
content/cases/{case}/05-reviews/v{N}/modification-list-v{N}-iter{M}.md
```

内容包含：
- 触发原因（哪一轮评审未通过）
- 修改清单表格（优先级、修改项、原因、来源审查、位置、状态）
- 修改记录（轮次、修改项、内容摘要、验证状态）

## 子代理协作规范

Each spawned reviewer must have a distinct owner label, for example
`logic-checker:v7:run-20260529T120000Z`. Do not let two agents write the same
review file. Merge only after the editor judge reads all completed reviewer
artifacts.

Before a coordinator writes shared state, acquire a lease:

```bash
node ops/skills/detective-script-dev/scripts/wolf-runner.js case lock CASE_NAME --owner "editor-judge:vN" --ttl-minutes 120
```

Release it after merging:

```bash
node ops/skills/detective-script-dev/scripts/wolf-runner.js case unlock CASE_NAME --owner "editor-judge:vN"
```

Reviewer inputs:

- current draft or chapter text
- `00-meta/characters.json`
- `00-meta/truth-file.json`
- approved outline
- `02-research/` research notes (for research-usage-checker)
- previous chapter summary if context is long
- user preferences from `~/.config/wolf/memory.json`

Writer inputs:

- approved brief
- approved outline
- locked `core_trick`
- editor explanation
- canonical solution
- writer constraints

Hard rule: reviewers and writers may suggest scene-level improvements, but they
must not modify the locked core trick without explicit user approval.

If the editor judge returns `next_action: rollback`, record it with:

```bash
node ops/skills/detective-script-dev/scripts/wolf-runner.js case rollback CASE_NAME --to vN --reason "editor-judge" --owner "editor-judge"
```

Three rollbacks fuse the case and create an archive snapshot. Fused cases must
not continue drafting until the user approves a new direction.

Use:

- `schemas/review-result.json` for each expert.
- `schemas/editor-verdict.json` for the final editor judge.
