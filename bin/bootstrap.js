#!/usr/bin/env node
'use strict'
// The bootstrap has Node now; package installation and normal npx setup meet at the same init.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { stageRelease, activateRelease, rollbackRelease } = require('../lib/releases')
const { isInside } = require('../lib/paths')
const { atomicWriteFile } = require('../lib/session')

function parse(args) {
  const o = { project: process.cwd(), home: process.env.GODKIT_HOME || path.join(os.homedir(), '.godkit') }
  for (let i = 0; i < args.length; i++) {
    const key = args[i]
    if (key === '--rollback') o.rollback = true
    else if (key === '--project-only') o.projectOnly = true
    else if (['--source', '--project', '--home'].includes(key)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('missing value for ' + key)
      o[key.slice(2)] = args[++i]
    } else throw new Error('unknown bootstrap argument: ' + key)
  }
  o.project = path.resolve(o.project)
  o.home = path.resolve(o.home)
  return o
}

function npmCli(node) {
  const dir = path.dirname(node)
  const candidates = [path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), path.resolve(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')]
  const found = candidates.find((p) => fs.existsSync(p))
  if (!found) throw new Error('npm is missing from the selected Node runtime; use the pinned Godkit runtime or a complete Node installation')
  return found
}

function sourceDirectory(source, temp, node) {
  if (fs.existsSync(source) && fs.statSync(source).isDirectory()) return path.resolve(source)
  // npm validates and unpacks the package without running lifecycle scripts. No global install.
  const spec = fs.existsSync(source) ? path.resolve(source) : source
  if (!fs.existsSync(source) && !/^@codeforfee\/godkit@\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(source)) throw new Error('source must be a local directory/tarball or an exact @codeforfee/godkit version')
  const run = spawnSync(node, [npmCli(node), 'install', '--prefix', temp, '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--', spec], { encoding: 'utf8', timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024, env: { ...process.env, PATH: path.dirname(node) + path.delimiter + (process.env.PATH || '') } })
  if (run.error || run.status !== 0) throw new Error('package download failed: ' + (run.error ? run.error.message : run.stderr.trim()))
  return path.join(temp, 'node_modules', '@codeforfee', 'godkit')
}

function configFiles(project) {
  const install = require('../lib/install')
  if (install.configurationPaths) return install.configurationPaths(project)
  const hostmcp = require('../lib/hostmcp')
  return [...install.allTargets().map((r) => r[1]), ...hostmcp.mcpTargets().map((r) => r[1]), path.join(os.homedir(), '.claude.json'), ...['AGENTS.md', 'CLAUDE.md', '.gitattributes', '.cursor/rules/godkit.mdc', '.agents/rules/godkit.md'].map((f) => path.join(project, f))]
}

function configure(o, release) {
  const args = [path.join(release.root, 'bin', 'godkit.js'), 'init', o.project]
  if (o.projectOnly) args.push('--no-install')
  const run = spawnSync(release.node, args, { stdio: 'inherit', timeout: 120000, windowsHide: true, env: { ...process.env, GODKIT_HOME: o.home, GODKIT_FORCE_STABLE: '0', GODKIT_STABLE_CHILD: '1' } })
  if (run.error || run.status !== 0) throw new Error('Godkit configuration failed' + (run.error ? ': ' + run.error.message : ' (exit ' + run.status + ')'))
}

function launchers(home, release) {
  const dir = path.join(home, 'bin')
  const bin = path.join(release.root, 'bin', 'godkit.js')
  const shQuote = (s) => "'" + s.replace(/'/g, "'\\''") + "'"
  const shell = '#!/bin/sh\n# godkit-owned launcher\nexec ' + shQuote(release.node.replace(/\\/g, '/')) + ' ' + shQuote(bin.replace(/\\/g, '/')) + ' "$@"\n'
  const cmd = '@echo off\r\nrem godkit-owned launcher\r\n"' + release.node.replace(/%/g, '%%') + '" "' + bin.replace(/%/g, '%%') + '" %*\r\n'
  for (const [name, body] of [['godkit', shell], ['godkit.cmd', cmd]]) {
    const dest = path.join(dir, name)
    const prior = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null
    if (prior !== null && !prior.includes('godkit-owned launcher')) throw new Error('launcher exists and is not owned by Godkit: ' + dest)
    atomicWriteFile(dest, body, { expectedRaw: prior })
    if (name === 'godkit') fs.chmodSync(dest, 0o755)
  }
}

function main(args) {
  const o = parse(args)
  process.env.GODKIT_HOME = o.home
  const configured = configFiles(o.project).filter((file) => !o.projectOnly || isInside(o.project, file))
  const options = { home: o.home, node: process.execPath, configFiles: configured.concat([path.join(o.home, 'bin', 'godkit'), path.join(o.home, 'bin', 'godkit.cmd')]), configure: (r) => { configure(o, r); launchers(o.home, r) } }
  let temp
  try {
    let state
    if (o.rollback) state = rollbackRelease(options)
    else {
      fs.mkdirSync(o.home, { recursive: true })
      temp = fs.mkdtempSync(path.join(o.home, '.download-'))
      const source = o.source || '@codeforfee/godkit@' + require('../package.json').version
      const staged = stageRelease(sourceDirectory(source, temp, process.execPath), options)
      state = activateRelease(staged, options)
    }
    process.stdout.write('Godkit ' + state.current.version + ' installed. Launcher: ' + path.join(o.home, 'bin', process.platform === 'win32' ? 'godkit.cmd' : 'godkit') + '\n')
    return state
  } finally {
    if (temp && isInside(o.home, temp) && path.dirname(temp) === o.home) fs.rmSync(temp, { recursive: true, force: true })
  }
}

if (require.main === module) {
  try { main(process.argv.slice(2)) } catch (error) { process.stderr.write('godkit installer: ' + error.message + '\n'); process.exitCode = 1 }
}
module.exports = { parse, npmCli, sourceDirectory, configFiles, main }
