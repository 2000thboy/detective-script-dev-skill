# detective-script-dev（探案小说创作 Skill）

> **版本**: 1.1.0 | **类型**: AI Skill 包 | **仓库**: `detective-script-dev-skill`

---

## 这是什么？

**detective-script-dev** 是一个给 AI（比如 Codex、Claude）用的 **Skill 包**。

安装后，AI 就能帮你：
- 从零开始搭建一个侦探小说的创作流程
- 自动检查故事有没有逻辑漏洞
- 确保关键线索在揭晓前已经出现（对读者公平）
- 给故事质量打分
- 生成番茄小说的发布包

简单来说：你告诉 AI "我想写一个密室杀人案"，AI 会按照这个 Skill 的规范，一步步带你完成整个创作过程。

---

## 📦 文件说明

| 文件/文件夹 | 是什么 |
|-----------|--------|
| `SKILL.md` | **Skill 的核心定义文件**，AI 读取这个文件才知道怎么帮你 |
| `src/` | 程序代码（运行命令用） |
| `ops/skills/detective-script-dev/` | 打包好的 Skill 文件 |
| `.plan/` | 产品规划（PRD、技术规格、检查清单） |
| `content/cases/` | 你的小说案子都放这里 |

> **关于命名**：GitHub 仓库加了 `-skill` 后缀（`detective-script-dev-skill`），方便区分。项目内部统一叫 `detective-script-dev`。

---

## 🚀 3 分钟快速上手

### 第 1 步：安装

```bash
# 克隆仓库
git clone https://github.com/2000thboy/detective-script-dev-skill.git

# 进入文件夹
cd detective-script-dev-skill

# 检查是否正常
npm test
```

### 第 2 步：创建新案子

```bash
node src/bin/wolf-runner.js case init 我的第一个案子
```

这会创建一个标准格式的文件夹，里面有模板，告诉你每一步该写什么。

### 第 3 步：让 AI 帮你写

安装 Skill 后，对 AI 说：

> "按 detective-script-dev 的流程，帮我写一个密室杀人案的侦探小说。"

AI 会自动：
1. 问你故事的基本设定（背景、人物、核心诡计）
2. 帮你写大纲
3. 锁定核心诡计（防止写到一半改设定）
4. 按章节写初稿
5. 自动检查线索是否公平
6. 给故事打分

---

## 📁 案子的文件夹结构

每个小说案子都是一个文件夹，按创作步骤分成 7 个区域：

```text
content/cases/我的案子/
  .case/          ← 工具自动记录的状态（不用手动改）
  00-meta/        ← 故事核心设定
                  ├── meta.md        故事简介
                  ├── characters.json 人物设定
                  └── truth-file.json 真相文件（凶手、手法、线索）
  01-brief/       ← 需求文档
  02-research/    ← 参考资料
  03-outline/     ← 大纲
  04-drafts/      ← 初稿（v1、v2、v3...）
  05-reviews/     ← AI 审校报告 + 评分
  06-deliverables/ ← 成品 + 发布包
```

**核心机制：核心诡计锁死**

写初稿之前，你必须先确定：凶手是谁、怎么作案、关键线索有哪些。这些设定一旦确定就被**锁死**，后面不能随意改动。这样可以保证故事逻辑前后一致。

---

## 🛠️ 常用命令

### 案子管理
```bash
# 创建新案子
node src/bin/wolf-runner.js case init 案子名称

# 查看所有案子
node src/bin/wolf-runner.js case list

# 检查案子格式是否正确
node src/bin/wolf-runner.js case check 案子名称

# 检查线索是否公平（关键线索在揭晓前出现过吗？）
node src/bin/wolf-runner.js case fair-check 案子名称 --version v1

# 给故事打分（0-100分）
node src/bin/wolf-runner.js case score 案子名称 --version v1
```

### 番茄小说发布
```bash
# 生成本地发布包（不会真的发出去）
node src/bin/wolf-runner.js publish prep 案子名称 --platform fanqie --version v1
```

**⚠️ 注意**：真正上传到番茄小说需要加 `--confirm-live` 参数，工具不会自动发布。

---

## 🔒 安全提醒

- **活写安全门**：所有真正写入番茄小说的命令（上传章节、创建书籍、删除草稿）必须加 `--confirm-live` 参数。
- **不要泄露账号**：不要把 cookies、密码、`book_id`、`volume_id` 上传到 git。
- **默认使用已有书籍**：不要频繁创建新书，`create-book` 仅用于维护。

---

## 🧠 个人偏好记忆

工具可以记住你的写作偏好（喜欢快节奏还是慢节奏、喜欢什么类型的诡计），保存在 `~/.config/wolf/memory.json`。

```bash
# 创建偏好文件
node src/bin/wolf-runner.js memory init

# 检查格式对不对
node src/bin/wolf-runner.js memory check

# 查看当前偏好
node src/bin/wolf-runner.js memory show
```

---

## 📋 更多文档

| 文档 | 位置 | 内容 |
|------|------|------|
| **SKILL.md** | `ops/skills/detective-script-dev/SKILL.md` | AI 读取的 Skill 定义（触发词、能力范围、工作流程） |
| **PRD** | `.plan/PRD.md` | 产品需求文档 |
| **SPEC** | `.plan/SPEC.md` | 技术规格 |
| **验收标准** | `.plan/MULTI_CASE_ACCEPTANCE_SPEC.md` | 多案子验收测试 |

---

## 📦 打包分享

如果想把这个 Skill 分享给其他人：

```bash
# 打包核心文件
npm pack

# 或者直接复制 ops/skills/detective-script-dev/ 文件夹
```

Skill 包可以安装到 Claude Code、Codex、WorkBuddy 等支持 Skill 的平台上。

---

**有问题？** 直接问 AI："怎么安装 detective-script-dev 这个 Skill？" 或 "帮我写一个密室杀人案。"
