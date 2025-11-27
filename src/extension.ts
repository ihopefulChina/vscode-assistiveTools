import * as vscode from "vscode";
import registerEnumHover from "./hover";

/**
 * 插件激活时调用
 */
export function activate(context: vscode.ExtensionContext) {
  console.log("Assistive Tools 插件已激活");

  // 注册枚举悬停转换功能
  registerEnumHover(context);
}

/**
 * 插件停用时调用
 */
export function deactivate() {
  console.log("Assistive Tools 插件已停用");
}
