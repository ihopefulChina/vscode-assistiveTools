import * as vscode from "vscode"
import registerEnumHover from "./commands/enum-hover"
import registerCreateComponents from "./commands/create-components"
import { registerNpmScripts } from "./npm-scripts"
import { registerWechatPageSync } from "./commands/wechat-pages"

/**
 * 插件激活时调用
 */
export function activate(context: vscode.ExtensionContext) {
  console.log("Assistive Tools 插件已激活")

  // 注册枚举悬停转换功能
  registerEnumHover(context)

  // 注册创建组件和页面功能
  registerCreateComponents(context)

  // 注册工作区脚本中心
  registerNpmScripts(context)

  // 注册微信小程序页面调试配置同步
  registerWechatPageSync(context)
}

/**
 * 插件停用时调用
 */
export function deactivate() {
  console.log("Assistive Tools 插件已停用")
}
