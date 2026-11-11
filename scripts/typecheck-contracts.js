// @ts-check
'use strict'
// Assign implementation exports to their public boundary contracts. This catches missing exports,
// incompatible parameters and return-value drift without converting the legacy implementation.
const runtime = require('../lib/runtime')
const install = require('../lib/install')
const host = require('../lib/hostmcp')
const mcp = require('../lib/mcp')

/** @type {() => string} */
const nodePath = runtime.nodePath
/** @type {(value: string) => string} */
const shellQuote = runtime.shellQuote
/** @type {(script: string, args?: string[]) => string} */
const command = runtime.command
/** @type {(hooksDir: string, script: string, argv?: string[]) => string} */
const hookCommand = install.hookCommand
/** @type {(project: string, env?: NodeJS.ProcessEnv) => string[]} */
const configurationPaths = install.configurationPaths
/** @type {(raw: string | null, uninstall: boolean, bin: string) => string | null} */
const applyJson = host.applyJson
/** @type {(raw: string | null, uninstall: boolean, bin: string, approve?: boolean) => string | null} */
const applyToml = host.applyToml
/** @type {(input: NodeJS.ReadableStream, output: NodeJS.WritableStream) => void} */
const serve = mcp.serve
/** @type {(message: {jsonrpc: string, id?: number | string, method: string, params?: Record<string, unknown>}) => unknown} */
const respond = mcp.respond
/** @type {{name: string, inputSchema: {type: string, required?: string[]}, run: (args: Record<string, any>) => {content: {type: string, text: string}[], isError?: boolean}}[]} */
const tools = mcp.TOOLS

// These must remain errors: removing the interface types would make the check fail.
// @ts-expect-error argv must be strings
command('script.js', [1])
// @ts-expect-error installation requires a boolean uninstall decision
applyJson('{}', 'uninstall', 'bin/godkit.js')
void [nodePath, shellQuote, hookCommand, configurationPaths, applyToml, serve, respond, tools]
