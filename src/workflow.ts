import * as crypto from "crypto"
import { execFileSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"
import * as yaml from "js-yaml"

const CONFIG_CANDIDATES = [
  ".assistive-tools/workflow.yml",
  ".assistive-tools/workflow.yaml",
  ".assistive-tools/workflow.json",
]
const DEFAULT_REPORT_PATH = ".assistive-tools/release-readiness.md"
const RESULT_KEY_PREFIX = "assistiveTools.workflow.results.v1:"

export type WorkflowCheck = {
  id: string
  name?: string
  command: string
  paths?: string[]
  exclude?: string[]
  required?: boolean
}

export type GeneratedRule = {
  id: string
  name?: string
  sources: string[]
  outputs: string[]
  command: string
  required?: boolean
}

export type WorkflowConfig = {
  version: 1
  changes?: {
    baseRef?: string
  }
  checks: WorkflowCheck[]
  generated: GeneratedRule[]
  release: {
    requireCleanWorkingTree: boolean
    requiredChecks?: string[]
    artifacts: string[]
    reportPath: string
  }
}

export type GitSnapshot = {
  branch: string
  commit: string
  base: string
  files: string[]
  workingFiles: string[]
  clean: boolean
  signature: string
}

export type WorkflowAction = {
  id: string
  sourceId: string
  kind: "check" | "generated"
  label: string
  command: string
  reason: string
  required: boolean
}

export type StoredResult = {
  id: string
  label: string
  command: string
  passed: boolean
  exitCode?: number
  completedAt: string
  signature: string
}

export type MatrixRow = {
  item: string
  status: "PASS" | "PENDING" | "BLOCKED"
  detail: string
}

export type WorkflowInspection = {
  configPath: string
  config: WorkflowConfig
  snapshot: GitSnapshot
  actions: WorkflowAction[]
  results: Record<string, StoredResult>
  artifactCounts: Record<string, number>
  matrix: MatrixRow[]
  ready: boolean
}

export class WorkflowConfigError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join("\n"))
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readStringArray(value: unknown, field: string, errors: string[]): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    errors.push(`${field} 必须是非空字符串数组`)
    return []
  }
  return value.map((item) => item.trim())
}

export function parseWorkflowConfig(source: string): WorkflowConfig {
  let raw: unknown
  try {
    raw = yaml.load(source)
  } catch (error: any) {
    throw new WorkflowConfigError([`YAML/JSON 解析失败: ${error.message}`])
  }
  if (!isRecord(raw)) {
    throw new WorkflowConfigError(["配置根节点必须是对象"])
  }

  const errors: string[] = []
  if (raw.version !== 1) errors.push("version 必须为 1")

  const rawChecks = raw.checks === undefined ? [] : raw.checks
  if (!Array.isArray(rawChecks)) errors.push("checks 必须是数组")
  const checks: WorkflowCheck[] = []
  const checkIds = new Set<string>()
  if (Array.isArray(rawChecks)) {
    rawChecks.forEach((value, index) => {
      if (!isRecord(value)) {
        errors.push(`checks[${index}] 必须是对象`)
        return
      }
      const id = typeof value.id === "string" ? value.id.trim() : ""
      const command = typeof value.command === "string" ? value.command.trim() : ""
      if (!/^[A-Za-z0-9._-]+$/.test(id)) errors.push(`checks[${index}].id 格式无效`)
      if (checkIds.has(id)) errors.push(`checks 中存在重复 id: ${id}`)
      if (!command) errors.push(`checks[${index}].command 不能为空`)
      if (id) checkIds.add(id)
      checks.push({
        id,
        name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : undefined,
        command,
        paths: readStringArray(value.paths, `checks[${index}].paths`, errors),
        exclude: readStringArray(value.exclude, `checks[${index}].exclude`, errors),
        required: value.required === undefined ? true : value.required === true,
      })
      if (value.required !== undefined && typeof value.required !== "boolean") {
        errors.push(`checks[${index}].required 必须是布尔值`)
      }
    })
  }

  const rawGenerated = raw.generated === undefined ? [] : raw.generated
  if (!Array.isArray(rawGenerated)) errors.push("generated 必须是数组")
  const generated: GeneratedRule[] = []
  const generatedIds = new Set<string>()
  if (Array.isArray(rawGenerated)) {
    rawGenerated.forEach((value, index) => {
      if (!isRecord(value)) {
        errors.push(`generated[${index}] 必须是对象`)
        return
      }
      const id = typeof value.id === "string" ? value.id.trim() : ""
      const command = typeof value.command === "string" ? value.command.trim() : ""
      const sources = readStringArray(value.sources, `generated[${index}].sources`, errors)
      const outputs = readStringArray(value.outputs, `generated[${index}].outputs`, errors)
      if (!/^[A-Za-z0-9._-]+$/.test(id)) errors.push(`generated[${index}].id 格式无效`)
      if (generatedIds.has(id)) errors.push(`generated 中存在重复 id: ${id}`)
      if (!command) errors.push(`generated[${index}].command 不能为空`)
      if (sources.length === 0) errors.push(`generated[${index}].sources 不能为空`)
      if (outputs.length === 0) errors.push(`generated[${index}].outputs 不能为空`)
      if (id) generatedIds.add(id)
      generated.push({
        id,
        name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : undefined,
        sources,
        outputs,
        command,
        required: value.required === undefined ? true : value.required === true,
      })
      if (value.required !== undefined && typeof value.required !== "boolean") {
        errors.push(`generated[${index}].required 必须是布尔值`)
      }
    })
  }

  const rawChanges = raw.changes
  let changes: WorkflowConfig["changes"]
  if (rawChanges !== undefined) {
    if (!isRecord(rawChanges)) {
      errors.push("changes 必须是对象")
    } else if (rawChanges.baseRef !== undefined && typeof rawChanges.baseRef !== "string") {
      errors.push("changes.baseRef 必须是字符串")
    } else {
      changes = {
        baseRef:
          typeof rawChanges.baseRef === "string" && rawChanges.baseRef.trim()
            ? rawChanges.baseRef.trim()
            : undefined,
      }
    }
  }

  const rawRelease = raw.release
  if (rawRelease !== undefined && !isRecord(rawRelease)) errors.push("release 必须是对象")
  const releaseRecord = isRecord(rawRelease) ? rawRelease : {}
  const hasRequiredChecks = Object.prototype.hasOwnProperty.call(releaseRecord, "requiredChecks")
  const requiredChecks = readStringArray(
    releaseRecord.requiredChecks,
    "release.requiredChecks",
    errors
  )
  for (const id of requiredChecks) {
    if (!checkIds.has(id)) errors.push(`release.requiredChecks 引用了不存在的检查: ${id}`)
  }
  if (
    releaseRecord.requireCleanWorkingTree !== undefined &&
    typeof releaseRecord.requireCleanWorkingTree !== "boolean"
  ) {
    errors.push("release.requireCleanWorkingTree 必须是布尔值")
  }
  const artifacts = readStringArray(releaseRecord.artifacts, "release.artifacts", errors)
  const reportPath =
    typeof releaseRecord.reportPath === "string" && releaseRecord.reportPath.trim()
      ? releaseRecord.reportPath.trim()
      : DEFAULT_REPORT_PATH
  const portableReportPath = reportPath.replace(/\\/g, "/")
  const normalizedReportPath = path.posix.normalize(portableReportPath)
  if (
    path.isAbsolute(reportPath) ||
    path.win32.isAbsolute(reportPath) ||
    reportPath.includes("\0") ||
    normalizedReportPath === "." ||
    normalizedReportPath === ".." ||
    normalizedReportPath.startsWith("../") ||
    portableReportPath.endsWith("/")
  ) {
    errors.push("release.reportPath 必须是工作区内的相对路径")
  }

  if (errors.length > 0) throw new WorkflowConfigError(errors)
  return {
    version: 1,
    changes,
    checks,
    generated,
    release: {
      requireCleanWorkingTree: releaseRecord.requireCleanWorkingTree !== false,
      requiredChecks: hasRequiredChecks ? requiredChecks : undefined,
      artifacts,
      reportPath,
    },
  }
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "")
}

export function resolveWorkspaceOutputPath(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, relativePath)
  const relative = path.relative(resolvedRoot, target)
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("输出路径不在工作区内")
  }

  let ancestor = path.dirname(target)
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor)
    if (parent === ancestor) break
    ancestor = parent
  }
  const realRoot = fs.realpathSync(resolvedRoot)
  const realAncestor = fs.realpathSync(ancestor)
  const realRelative = path.relative(realRoot, realAncestor)
  if (
    realRelative === ".." ||
    realRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(realRelative)
  ) {
    throw new Error("输出路径不能通过符号链接离开工作区")
  }

  let current = resolvedRoot
  for (const segment of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, segment)
    if (!fs.existsSync(current)) break
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw new Error("输出路径不能包含符号链接目录")
    }
  }
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
    throw new Error("输出文件不能是符号链接")
  }
  return target
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
}

export function matchesGlob(filePath: string, pattern: string): boolean {
  const value = normalizePath(filePath)
  const glob = normalizePath(pattern)
  let source = ""
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index]
    if (character === "*" && glob[index + 1] === "*") {
      if (glob[index + 2] === "/") {
        source += "(?:.*/)?"
        index += 2
      } else {
        source += ".*"
        index += 1
      }
    } else if (character === "*") {
      source += "[^/]*"
    } else if (character === "?") {
      source += "[^/]"
    } else {
      source += escapeRegExp(character)
    }
  }
  return new RegExp(`^${source}$`).test(value)
}

function matchingFiles(files: string[], includes: string[], excludes: string[] = []): string[] {
  if (includes.length === 0)
    return files.filter((file) => !excludes.some((item) => matchesGlob(file, item)))
  return files.filter(
    (file) =>
      includes.some((item) => matchesGlob(file, item)) &&
      !excludes.some((item) => matchesGlob(file, item))
  )
}

export function recommendWorkflowActions(
  config: WorkflowConfig,
  changedFiles: string[]
): WorkflowAction[] {
  const actions: WorkflowAction[] = []
  // 先重新生成，再运行检查；否则检查可能验证的是旧生成物。
  for (const rule of config.generated) {
    const sourceMatches = matchingFiles(changedFiles, rule.sources)
    const outputMatches = matchingFiles(changedFiles, rule.outputs)
    if (sourceMatches.length > 0 || outputMatches.length > 0) {
      actions.push({
        id: `generated:${rule.id}`,
        sourceId: rule.id,
        kind: "generated",
        label: rule.name || rule.id,
        command: rule.command,
        reason:
          sourceMatches.length > 0
            ? `源文件已改动：${sourceMatches.slice(0, 3).join("、")}`
            : `生成物已改动：${outputMatches.slice(0, 3).join("、")}`,
        required: rule.required !== false,
      })
    }
  }
  for (const check of config.checks) {
    const matches = matchingFiles(changedFiles, check.paths || [], check.exclude || [])
    if ((check.paths || []).length === 0 || matches.length > 0) {
      actions.push({
        id: `check:${check.id}`,
        sourceId: check.id,
        kind: "check",
        label: check.name || check.id,
        command: check.command,
        reason:
          (check.paths || []).length === 0
            ? "配置为每次运行"
            : `命中 ${matches.slice(0, 3).join("、")}${matches.length > 3 ? ` 等 ${matches.length} 个文件` : ""}`,
        required: check.required !== false,
      })
    }
  }
  return actions
}

function runGit(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024,
  })
}

function splitZero(value: string): string[] {
  return value.split("\0").map(normalizePath).filter(Boolean)
}

function getDiffFiles(root: string, base: string): string[] {
  return splitZero(runGit(root, ["diff", "--name-only", "-z", base, "--"]))
}

function getUntrackedFiles(root: string): string[] {
  return splitZero(runGit(root, ["ls-files", "--others", "--exclude-standard", "-z", "--"]))
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map(normalizePath))].sort()
}

function hashSnapshot(root: string, commit: string, base: string, files: string[]): string {
  const hash = crypto.createHash("sha256")
  hash.update(`${commit}\0${base}\0`)
  for (const file of files) {
    hash.update(`${file}\0`)
    const absolutePath = path.join(root, file)
    if (fs.existsSync(absolutePath)) {
      const stat = fs.lstatSync(absolutePath)
      if (stat.isSymbolicLink()) {
        hash.update(`<symlink:${fs.readlinkSync(absolutePath)}>`)
      } else if (stat.isFile()) {
        hash.update(fs.readFileSync(absolutePath))
      } else {
        hash.update(`<${stat.mode}>`)
      }
    } else {
      hash.update("<deleted>")
    }
    hash.update("\0")
  }
  return hash.digest("hex")
}

export function collectGitSnapshot(
  root: string,
  baseRef?: string,
  ignoredPaths: string[] = []
): GitSnapshot {
  const commit = runGit(root, ["rev-parse", "HEAD"]).trim()
  const branch = runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim()
  let base = "HEAD"
  if (baseRef) {
    try {
      base = runGit(root, ["merge-base", "HEAD", baseRef]).trim()
    } catch {
      throw new Error(`无法解析 changes.baseRef: ${baseRef}`)
    }
  }
  const ignored = ignoredPaths.map(normalizePath)
  const shouldKeep = (file: string) => !ignored.includes(normalizePath(file))
  const untracked = getUntrackedFiles(root)
  const files = uniqueSorted([...getDiffFiles(root, base), ...untracked]).filter(shouldKeep)
  const workingFiles = uniqueSorted([...getDiffFiles(root, "HEAD"), ...untracked]).filter(
    shouldKeep
  )
  return {
    branch,
    commit,
    base,
    files,
    workingFiles,
    clean: workingFiles.length === 0,
    signature: hashSnapshot(root, commit, base, files),
  }
}

function resultState(
  result: StoredResult | undefined,
  signature: string
): "passed" | "failed" | "missing" {
  if (!result || result.signature !== signature) return "missing"
  return result.passed ? "passed" : "failed"
}

export function buildReleaseMatrix(
  config: WorkflowConfig,
  snapshot: GitSnapshot,
  results: Record<string, StoredResult>,
  artifactCounts: Record<string, number>
): MatrixRow[] {
  const rows: MatrixRow[] = [
    {
      item: "工作流配置",
      status: "PASS",
      detail: `version ${config.version}`,
    },
  ]

  if (config.release.requireCleanWorkingTree) {
    rows.push({
      item: "Git 工作区",
      status: snapshot.clean ? "PASS" : "BLOCKED",
      detail: snapshot.clean ? "工作区干净" : `${snapshot.workingFiles.length} 个未提交文件`,
    })
  }

  for (const rule of config.generated.filter((item) => item.required !== false)) {
    const sources = matchingFiles(snapshot.files, rule.sources)
    const outputs = matchingFiles(snapshot.files, rule.outputs)
    const state = resultState(results[`generated:${rule.id}`], snapshot.signature)
    let status: MatrixRow["status"] = "PASS"
    let detail = "当前改动未涉及该生成链路"
    if (outputs.length > 0 && sources.length === 0) {
      status = state === "passed" ? "PASS" : "BLOCKED"
      detail =
        state === "passed"
          ? "生成命令已在当前改动上成功运行"
          : `生成物被直接修改，未发现源文件改动：${outputs.slice(0, 3).join("、")}`
    } else if (sources.length > 0 || outputs.length > 0) {
      status = state === "passed" ? "PASS" : state === "failed" ? "BLOCKED" : "PENDING"
      detail =
        state === "passed"
          ? "生成命令已在当前改动上成功运行"
          : state === "failed"
            ? "生成命令运行失败"
            : "相关文件已改动，尚未成功运行生成命令"
    }
    rows.push({ item: `生成物：${rule.name || rule.id}`, status, detail })
  }

  const requiredIds =
    config.release.requiredChecks ||
    config.checks.filter((item) => item.required !== false).map((item) => item.id)
  for (const id of requiredIds) {
    const check = config.checks.find((item) => item.id === id)
    if (!check) continue
    const affected =
      (check.paths || []).length === 0 ||
      matchingFiles(snapshot.files, check.paths || [], check.exclude || []).length > 0
    const state = resultState(results[`check:${check.id}`], snapshot.signature)
    rows.push({
      item: `验证：${check.name || check.id}`,
      status: !affected
        ? "PASS"
        : state === "passed"
          ? "PASS"
          : state === "failed"
            ? "BLOCKED"
            : "PENDING",
      detail: !affected
        ? "当前改动范围不需要此检查"
        : state === "passed"
          ? "已在当前改动上通过"
          : state === "failed"
            ? "最近一次运行失败"
            : "尚未在当前改动上运行",
    })
  }

  for (const artifact of config.release.artifacts) {
    const count = artifactCounts[artifact] || 0
    rows.push({
      item: `发布物：${artifact}`,
      status: count > 0 ? "PASS" : "BLOCKED",
      detail: count > 0 ? `找到 ${count} 个文件` : "未找到匹配文件",
    })
  }
  return rows
}

function walkFiles(root: string, current: string, result: string[], limit: number): void {
  if (result.length >= limit) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(current, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (result.length >= limit) return
    if (entry.name === ".git" || entry.name === "node_modules") continue
    const absolute = path.join(current, entry.name)
    if (entry.isDirectory()) walkFiles(root, absolute, result, limit)
    else if (entry.isFile()) result.push(normalizePath(path.relative(root, absolute)))
  }
}

export function countReleaseArtifacts(root: string, patterns: string[]): Record<string, number> {
  if (patterns.length === 0) return {}
  const files: string[] = []
  walkFiles(root, root, files, 20000)
  return Object.fromEntries(
    patterns.map((pattern) => [pattern, matchingFiles(files, [pattern]).length])
  )
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>")
}

export function renderReleaseReport(
  inspection: WorkflowInspection,
  generatedAt = new Date()
): string {
  const status = inspection.ready ? "READY" : "NOT READY"
  const lines = [
    "# 发布就绪报告",
    "",
    `> ${status} · ${generatedAt.toISOString()}`,
    "",
    `- 分支：\`${inspection.snapshot.branch}\``,
    `- 提交：\`${inspection.snapshot.commit}\``,
    `- 对比基线：\`${inspection.snapshot.base}\``,
    `- 改动签名：\`${inspection.snapshot.signature.slice(0, 12)}\``,
    "",
    "## 就绪矩阵",
    "",
    "| 项目 | 状态 | 说明 |",
    "| --- | --- | --- |",
    ...inspection.matrix.map(
      (row) => `| ${escapeTable(row.item)} | ${row.status} | ${escapeTable(row.detail)} |`
    ),
    "",
    "## 改动范围",
    "",
  ]
  if (inspection.snapshot.files.length === 0) lines.push("- 无相对基线改动")
  else lines.push(...inspection.snapshot.files.map((file) => `- \`${file}\``))

  lines.push("", "## 推荐验证", "")
  if (inspection.actions.length === 0) lines.push("- 当前改动没有命中任何工作流规则")
  else {
    for (const action of inspection.actions) {
      const result = inspection.results[action.id]
      const current = result?.signature === inspection.snapshot.signature
      const state = current ? (result.passed ? "PASS" : "FAILED") : "NOT RUN"
      lines.push(`- **${action.label}** · ${state} · \`${action.command}\` — ${action.reason}`)
    }
  }
  lines.push("", "---", "", "由 Assistive Tools 根据项目工作流配置生成。", "")
  return lines.join("\n")
}

export function findWorkflowConfigPath(root: string): string | undefined {
  return CONFIG_CANDIDATES.map((item) => path.join(root, item)).find((item) => fs.existsSync(item))
}

function loadWorkflowConfig(root: string): { path: string; config: WorkflowConfig } {
  const configPath = findWorkflowConfigPath(root)
  if (!configPath) throw new Error(`未找到 ${CONFIG_CANDIDATES[0]}`)
  return { path: configPath, config: parseWorkflowConfig(fs.readFileSync(configPath, "utf8")) }
}

function packageManagerCommand(root: string, scriptName: string): string {
  let manager = "npm"
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
    const declared =
      typeof packageJson.packageManager === "string" ? packageJson.packageManager.split("@")[0] : ""
    if (["npm", "pnpm", "yarn", "bun"].includes(declared)) manager = declared
    else if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) manager = "pnpm"
    else if (
      fs.existsSync(path.join(root, "yarn.lock")) &&
      !fs.existsSync(path.join(root, "package-lock.json"))
    )
      manager = "yarn"
    else if (
      fs.existsSync(path.join(root, "bun.lock")) ||
      fs.existsSync(path.join(root, "bun.lockb"))
    )
      manager = "bun"
  } catch {
    // Keep npm as the conservative default.
  }
  return `${manager} run ${JSON.stringify(scriptName)}`
}

export function buildDefaultWorkflowYaml(root: string): string {
  let scripts: Record<string, unknown> = {}
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
    if (isRecord(packageJson.scripts)) scripts = packageJson.scripts
  } catch {
    // A config with no checks is still valid and can be edited by the user.
  }
  const candidateIds = ["lint", "typecheck", "check", "test", "build", "compile"].filter(
    (id) => typeof scripts[id] === "string"
  )
  const lines = [
    "# Assistive Tools 项目工作流。路径均相对于工作区根目录。",
    "version: 1",
    "",
    "changes: {}",
    "# 若需包含已提交的分支改动，可配置 baseRef: origin/main、origin/develop 或上一个发布 tag。",
    "",
  ]
  if (candidateIds.length === 0) {
    lines.push("checks: []")
  } else {
    lines.push("checks:")
    for (const id of candidateIds) {
      lines.push(
        `  - id: ${id}`,
        `    name: ${id}`,
        `    command: ${JSON.stringify(packageManagerCommand(root, id))}`,
        "    paths:",
        "      - src/**",
        "      - test/**",
        "      - package.json",
        "      - package-lock.json",
        "      - pnpm-lock.yaml",
        "      - yarn.lock",
        "    required: true"
      )
    }
  }
  lines.push(
    "",
    "# 示例：源文件或生成物变化时推荐运行 command；直接改生成物会阻断发布矩阵。",
    "generated: []",
    "# generated:",
    "#   - id: api-client",
    "#     name: API 客户端",
    "#     sources: [openapi/**]",
    "#     outputs: [src/request/**]",
    "#     command: pnpm generate:api",
    "#     required: true",
    "",
    "release:",
    "  requireCleanWorkingTree: true",
    "  artifacts: []",
    `  reportPath: ${DEFAULT_REPORT_PATH}`,
    ""
  )
  return lines.join("\n")
}

class WorkflowTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    description: string,
    icon: string,
    command?: vscode.Command,
    collapsibleState = vscode.TreeItemCollapsibleState.None,
    public readonly folder?: vscode.WorkspaceFolder
  ) {
    super(label, collapsibleState)
    this.description = description
    this.iconPath = new vscode.ThemeIcon(icon)
    this.command = command
  }
}

class WorkflowController {
  private readonly output = vscode.window.createOutputChannel("Assistive Workflow")

  constructor(private readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(this.output)
  }

  public async chooseFolder(
    folder?: vscode.WorkspaceFolder
  ): Promise<vscode.WorkspaceFolder | undefined> {
    if (folder) return folder
    const active = vscode.window.activeTextEditor?.document.uri
    const activeFolder = active ? vscode.workspace.getWorkspaceFolder(active) : undefined
    if (activeFolder) return activeFolder
    const folders = vscode.workspace.workspaceFolders || []
    if (folders.length <= 1) return folders[0]
    const selected = await vscode.window.showQuickPick(
      folders.map((item) => ({ label: item.name, description: item.uri.fsPath, folder: item })),
      { placeHolder: "选择要使用的项目工作流" }
    )
    return selected?.folder
  }

  private resultKey(folder: vscode.WorkspaceFolder): string {
    return `${RESULT_KEY_PREFIX}${folder.uri.toString()}`
  }

  private getResults(folder: vscode.WorkspaceFolder): Record<string, StoredResult> {
    return this.context.workspaceState.get<Record<string, StoredResult>>(this.resultKey(folder), {})
  }

  public inspect(folder: vscode.WorkspaceFolder): WorkflowInspection {
    const loaded = loadWorkflowConfig(folder.uri.fsPath)
    const reportPath = normalizePath(loaded.config.release.reportPath)
    const snapshot = collectGitSnapshot(folder.uri.fsPath, loaded.config.changes?.baseRef, [
      reportPath,
    ])
    const actions = recommendWorkflowActions(loaded.config, snapshot.files)
    const results = this.getResults(folder)
    const artifactCounts = countReleaseArtifacts(folder.uri.fsPath, loaded.config.release.artifacts)
    const matrix = buildReleaseMatrix(loaded.config, snapshot, results, artifactCounts)
    return {
      configPath: loaded.path,
      config: loaded.config,
      snapshot,
      actions,
      results,
      artifactCounts,
      matrix,
      ready: matrix.every((row) => row.status === "PASS"),
    }
  }

  public async createConfig(folder?: vscode.WorkspaceFolder): Promise<void> {
    const selectedFolder = await this.chooseFolder(folder)
    if (!selectedFolder) {
      vscode.window.showWarningMessage("请先打开一个项目文件夹")
      return
    }
    const existing = findWorkflowConfigPath(selectedFolder.uri.fsPath)
    if (existing) {
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(existing))
      return
    }
    const target = resolveWorkspaceOutputPath(selectedFolder.uri.fsPath, CONFIG_CANDIDATES[0])
    const confirmed = await vscode.window.showInformationMessage(
      `将在 ${CONFIG_CANDIDATES[0]} 创建项目工作流配置`,
      { modal: true, detail: "会根据根 package.json 中已有的脚本生成初始检查项。" },
      "创建"
    )
    if (confirmed !== "创建") return
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, buildDefaultWorkflowYaml(selectedFolder.uri.fsPath), "utf8")
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(target))
  }

  public async recommendAndRun(folder?: vscode.WorkspaceFolder): Promise<void> {
    const selectedFolder = await this.chooseFolder(folder)
    if (!selectedFolder) return
    let inspection: WorkflowInspection
    try {
      inspection = this.inspect(selectedFolder)
    } catch (error: any) {
      vscode.window
        .showErrorMessage(`读取工作流失败: ${error.message}`, "创建或打开配置")
        .then((action) => {
          if (action) void this.createConfig(selectedFolder)
        })
      return
    }
    if (inspection.actions.length === 0) {
      vscode.window.showInformationMessage("当前改动没有命中任何验证或生成物规则")
      return
    }
    const picks = inspection.actions.map((action) => ({
      label: action.label,
      description: action.command,
      detail: action.reason,
      picked: true,
      action,
    }))
    const selected = await vscode.window.showQuickPick(picks, {
      canPickMany: true,
      placeHolder: `根据 ${inspection.snapshot.files.length} 个改动文件推荐，选择要运行的项目`,
      title: "Assistive Tools：推荐验证",
    })
    if (!selected || selected.length === 0) return
    await this.runActions(
      selectedFolder,
      selected.map((item) => item.action)
    )
  }

  public async checkGenerated(folder?: vscode.WorkspaceFolder): Promise<void> {
    const selectedFolder = await this.chooseFolder(folder)
    if (!selectedFolder) return
    try {
      const inspection = this.inspect(selectedFolder)
      const rows = inspection.matrix.filter((row) => row.item.startsWith("生成物："))
      if (rows.length === 0) {
        vscode.window.showInformationMessage("工作流尚未配置 generated 规则")
        return
      }
      const problems = rows.filter((row) => row.status !== "PASS")
      const detail = rows.map((row) => `${row.status}  ${row.item}：${row.detail}`).join("\n")
      if (problems.length === 0)
        vscode.window.showInformationMessage("生成物检查通过", { modal: true, detail })
      else
        vscode.window.showWarningMessage(`生成物检查发现 ${problems.length} 个未就绪项`, {
          modal: true,
          detail,
        })
    } catch (error: any) {
      vscode.window.showErrorMessage(`生成物检查失败: ${error.message}`)
    }
  }

  public async writeReport(folder?: vscode.WorkspaceFolder): Promise<void> {
    const selectedFolder = await this.chooseFolder(folder)
    if (!selectedFolder) return
    try {
      const inspection = this.inspect(selectedFolder)
      const target = resolveWorkspaceOutputPath(
        selectedFolder.uri.fsPath,
        inspection.config.release.reportPath
      )
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, renderReleaseReport(inspection), "utf8")
      const document = await vscode.workspace.openTextDocument(target)
      await vscode.window.showTextDocument(document)
      await vscode.commands.executeCommand("markdown.showPreview", document.uri)
      vscode.window.showInformationMessage(
        inspection.ready ? "发布就绪：报告已生成" : "当前尚未发布就绪：报告已生成"
      )
    } catch (error: any) {
      vscode.window.showErrorMessage(`生成发布报告失败: ${error.message}`)
    }
  }

  public async runGeneratedRule(
    folder: vscode.WorkspaceFolder,
    rule: GeneratedRule
  ): Promise<void> {
    await this.runActions(folder, [
      {
        id: `generated:${rule.id}`,
        sourceId: rule.id,
        kind: "generated",
        label: rule.name || rule.id,
        command: rule.command,
        reason: "手工保存了生成物",
        required: rule.required !== false,
      },
    ])
  }

  private async runActions(
    folder: vscode.WorkspaceFolder,
    actions: WorkflowAction[]
  ): Promise<void> {
    this.output.show(true)
    const completed: Array<{ action: WorkflowAction; exitCode?: number; signature?: string }> = []
    const results = this.getResults(folder)
    for (const action of actions) {
      delete results[action.id]
      try {
        await this.context.workspaceState.update(this.resultKey(folder), results)
      } catch (error: any) {
        this.output.appendLine(`[旧结果未清除] ${action.label}: ${error.message}`)
        vscode.window.showErrorMessage(`无法使旧验证结果失效，已停止运行: ${error.message}`)
        return
      }
      this.output.appendLine(`[运行] ${action.label}: ${action.command}`)
      let exitCode: number | undefined
      try {
        exitCode = await this.runTask(folder, action)
      } catch (error: any) {
        this.output.appendLine(`[启动失败] ${action.label}: ${error.message}`)
      }
      this.output.appendLine(
        `[${exitCode === 0 ? "通过" : "失败"}] ${action.label} (${exitCode ?? "无退出码"})`
      )
      let signature: string | undefined
      try {
        signature = this.inspect(folder).snapshot.signature
        results[action.id] = {
          id: action.id,
          label: action.label,
          command: action.command,
          passed: exitCode === 0,
          exitCode,
          completedAt: new Date().toISOString(),
          signature,
        }
        await this.context.workspaceState.update(this.resultKey(folder), results)
      } catch (error: any) {
        this.output.appendLine(`[结果未记录] ${action.label}: ${error.message}`)
        vscode.window.showErrorMessage(`验证已结束，但无法刷新改动签名: ${error.message}`)
      }
      completed.push({ action, exitCode, signature })
    }

    const failures = completed.filter((item) => item.exitCode !== 0)
    let finalSignature: string | undefined
    try {
      finalSignature = this.inspect(folder).snapshot.signature
    } catch {
      // The error was already reported while storing the affected action.
    }
    const stale = finalSignature
      ? completed.filter((item) => item.signature !== finalSignature)
      : []
    const unrecorded = completed.filter((item) => !item.signature)
    if (
      failures.length === 0 &&
      finalSignature !== undefined &&
      stale.length === 0 &&
      unrecorded.length === 0
    ) {
      vscode.window.showInformationMessage(`推荐验证全部通过（${completed.length} 项）`)
    } else if (failures.length === 0 && (finalSignature === undefined || unrecorded.length > 0)) {
      vscode.window.showErrorMessage(
        "命令均已通过，但无法绑定当前改动签名，请修复 Git 状态后重新运行"
      )
    } else if (failures.length === 0) {
      vscode.window.showWarningMessage(
        `命令均已通过，但后续命令又修改了文件；${stale.length} 项结果已过期，请重新运行`
      )
    } else {
      vscode.window.showErrorMessage(
        `推荐验证有 ${failures.length} 项失败，请查看 Assistive Workflow 输出`
      )
    }
  }

  private async runTask(
    folder: vscode.WorkspaceFolder,
    action: WorkflowAction
  ): Promise<number | undefined> {
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const task = new vscode.Task(
      { type: "assistiveToolsWorkflow", runId, action: action.id },
      folder,
      action.label,
      "Assistive Tools",
      new vscode.ShellExecution(action.command, { cwd: folder.uri.fsPath })
    )
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Dedicated,
      clear: true,
    }
    return new Promise<number | undefined>((resolve, reject) => {
      const processSubscription = vscode.tasks.onDidEndTaskProcess((event) => {
        if (event.execution.task.definition.runId !== runId) return
        processSubscription.dispose()
        resolve(event.exitCode)
      })
      Promise.resolve(vscode.tasks.executeTask(task)).catch((error: unknown) => {
        processSubscription.dispose()
        reject(error)
      })
    })
  }
}

class WorkflowTreeProvider implements vscode.TreeDataProvider<WorkflowTreeItem> {
  private readonly emitter = new vscode.EventEmitter<WorkflowTreeItem | undefined>()
  public readonly onDidChangeTreeData = this.emitter.event

  constructor(private readonly controller: WorkflowController) {}

  public refresh(): void {
    this.emitter.fire(undefined)
  }

  public getTreeItem(element: WorkflowTreeItem): vscode.TreeItem {
    return element
  }

  public async getChildren(element?: WorkflowTreeItem): Promise<WorkflowTreeItem[]> {
    const folders = vscode.workspace.workspaceFolders || []
    if (folders.length === 0) return []
    if (!element && folders.length > 1) {
      return folders.map(
        (folder) =>
          new WorkflowTreeItem(
            folder.name,
            folder.uri.fsPath,
            "folder",
            undefined,
            vscode.TreeItemCollapsibleState.Collapsed,
            folder
          )
      )
    }
    const folder = element?.folder || folders[0]
    if (!findWorkflowConfigPath(folder.uri.fsPath)) {
      return [
        new WorkflowTreeItem("创建项目工作流配置", CONFIG_CANDIDATES[0], "new-file", {
          command: "assistiveTools.workflow.createConfig",
          title: "创建配置",
          arguments: [folder],
        }),
      ]
    }
    try {
      const inspection = this.controller.inspect(folder)
      const generatedProblems = inspection.matrix.filter(
        (row) => row.item.startsWith("生成物：") && row.status !== "PASS"
      ).length
      return [
        new WorkflowTreeItem(
          "项目工作流配置",
          path.relative(folder.uri.fsPath, inspection.configPath),
          "settings-gear",
          {
            command: "vscode.open",
            title: "打开配置",
            arguments: [vscode.Uri.file(inspection.configPath)],
          }
        ),
        new WorkflowTreeItem(
          "改动范围",
          `${inspection.snapshot.files.length} 个文件`,
          "git-compare"
        ),
        new WorkflowTreeItem("推荐并运行验证", `${inspection.actions.length} 项`, "run-all", {
          command: "assistiveTools.workflow.recommendAndRun",
          title: "推荐并运行验证",
          arguments: [folder],
        }),
        new WorkflowTreeItem(
          "生成物保护",
          generatedProblems === 0 ? "通过" : `${generatedProblems} 项待处理`,
          generatedProblems === 0 ? "shield" : "warning",
          {
            command: "assistiveTools.workflow.checkGenerated",
            title: "检查生成物",
            arguments: [folder],
          }
        ),
        new WorkflowTreeItem(
          "发布就绪报告",
          inspection.ready ? "READY" : "NOT READY",
          inspection.ready ? "pass-filled" : "report",
          {
            command: "assistiveTools.workflow.releaseReport",
            title: "生成报告",
            arguments: [folder],
          }
        ),
      ]
    } catch (error: any) {
      return [new WorkflowTreeItem("工作流配置无效", error.message.split("\n")[0], "error")]
    }
  }
}

export function registerWorkflow(context: vscode.ExtensionContext): void {
  const controller = new WorkflowController(context)
  const provider = new WorkflowTreeProvider(controller)
  const view = vscode.window.createTreeView("assistiveToolsWorkflow", {
    treeDataProvider: provider,
    showCollapseAll: false,
  })
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/.assistive-tools/workflow.{yml,yaml,json}"
  )

  context.subscriptions.push(
    view,
    watcher,
    watcher.onDidCreate(() => provider.refresh()),
    watcher.onDidChange(() => provider.refresh()),
    watcher.onDidDelete(() => provider.refresh()),
    vscode.commands.registerCommand(
      "assistiveTools.workflow.createConfig",
      (folder?: vscode.WorkspaceFolder) =>
        controller.createConfig(folder).finally(() => provider.refresh())
    ),
    vscode.commands.registerCommand(
      "assistiveTools.workflow.recommendAndRun",
      (folder?: vscode.WorkspaceFolder) =>
        controller.recommendAndRun(folder).finally(() => provider.refresh())
    ),
    vscode.commands.registerCommand(
      "assistiveTools.workflow.checkGenerated",
      (folder?: vscode.WorkspaceFolder) => controller.checkGenerated(folder)
    ),
    vscode.commands.registerCommand(
      "assistiveTools.workflow.releaseReport",
      (folder?: vscode.WorkspaceFolder) =>
        controller.writeReport(folder).finally(() => provider.refresh())
    ),
    vscode.commands.registerCommand("assistiveTools.workflow.refresh", () => provider.refresh()),
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      const folder = vscode.workspace.getWorkspaceFolder(document.uri)
      if (!folder) return
      try {
        const loaded = loadWorkflowConfig(folder.uri.fsPath)
        const relative = normalizePath(path.relative(folder.uri.fsPath, document.uri.fsPath))
        const rule = loaded.config.generated.find(
          (item) => matchingFiles([relative], item.outputs).length > 0
        )
        if (!rule) return
        const action = await vscode.window.showWarningMessage(
          `${relative} 被标记为生成物，请修改源文件后重新生成`,
          "运行生成命令"
        )
        if (action) await controller.runGeneratedRule(folder, rule)
      } catch {
        // Invalid or missing configs are reported by explicit workflow commands.
      } finally {
        provider.refresh()
      }
    })
  )
}
