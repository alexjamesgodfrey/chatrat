import * as vscode from "vscode";

export const OUTPUT_CHANNEL_NAME = "Chatrat";
const theOneAndOnlyOutputChannel =
  vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
theOneAndOnlyOutputChannel.show(true);

export function debugLog(...args: any[]) {
  theOneAndOnlyOutputChannel.appendLine(args.join(" "));
}