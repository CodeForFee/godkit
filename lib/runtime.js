// @ts-check
'use strict'
const path = require('path')

/** The interpreter that is actually running Godkit, independent of a GUI host's PATH.
 * @returns {string}
 */
function nodePath() {
  return path.resolve(process.execPath)
}

/** @param {string} value @returns {string} */
function shellQuote(value) {
  return "'" + value.replace(/'/g, "'\\''") + "'"
}

/** @param {string} value @returns {string} */
function commandQuote(value) {
  if (process.platform === 'win32') return '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"'
  return '"' + value.replace(/["\\$`]/g, '\\$&') + '"'
}

/** @param {string} script @param {string[]} [args] @returns {string} */
function command(script, args = []) {
  return [commandQuote(nodePath()), commandQuote(script), ...args.map((a) => /^[\w-]+$/.test(a) ? a : commandQuote(a))].join(' ')
}

module.exports = { nodePath, shellQuote, command }
