'use strict'
// What an agent must not do whatever the task says. These are the rules the host's own permission
// system cannot be trusted to apply the same way everywhere (Claude has modes, Codex has a sandbox,
// Cursor and Antigravity have neither by default), so they live in one hook every host can run.
//
// Only identity-free rules live here: a command or a path is dangerous no matter who runs it.
// Claim overlap needs to know who "I" am and is in hooks/guard.js.
//
// godkit: a split-on-operators scan, not a shell parser. It misses an obfuscated command
// (`eval "$(echo ...)"`) and trusts a quoted `sh -c` body only one level deep. Hosts' own prompts
// and the sandbox remain the second line; this is the first, and it is cheap.

const path = require('path')

const RESET = 'git reset --hard throws away uncommitted work. Commit or stash first, or ask the user to run it.'

// Superset of what checkCommand can deny, as a regex source, for hosts that filter hooks by command
// text (Cursor's beforeShellExecution matcher). Every command checkCommand denies must match it, so a
// dangerous command always reaches the hook; a harmless match costs one extra prompt, never a miss.
// tests/guard.test.js asserts the superset property over the whole sample list.
const SHELL_TRIGGER = [
  '\\bgit\\b[^|&;\\n]*\\b(?:push|reset|clean|checkout|restore)\\b',
  '\\brm\\s',
  '\\b(?:rmdir|rd|del|erase)\\s',
  '\\b(?:Remove-Item|ri)\\b',
  '\\|\\s*(?:sudo\\s+)?(?:ba|z|da)?sh\\b',
  '\\|\\s*iex\\b',
  '\\bmkfs',
  '\\bdd\\s',
  '\\b(?:ba|z)?sh\\s+-c\\b',
].join('|')

// Quoted text is data, not commands: `git commit -m "git reset --hard"` is fine. The bodies of
// `sh -c "..."` are pulled out first and checked as commands of their own.
function stripQuotes(text) {
  return text.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""')
}

function shellBodies(text) {
  const out = []
  const re = /\b(?:ba|z|da)?sh\s+-c\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/g
  let m
  while ((m = re.exec(text))) out.push(m[1] !== undefined ? m[1] : m[2])
  return out
}

const WRAPPERS = new Set(['sudo', 'env', 'command', 'nohup', 'time', 'exec', 'builtin', 'nice'])

function words(sub) {
  const t = sub.trim().split(/\s+/).filter(Boolean)
  while (t.length && (WRAPPERS.has(t[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0]))) t.shift()
  return t
}

const flagsOf = (args) => args.filter((a) => a.startsWith('-') && a !== '--')
const targetsOf = (args) => args.filter((a) => !a.startsWith('-') || a === '-')

function dangerousTarget(t) {
  const x = t.replace(/^["']|["']$/g, '')
  return (
    /^\/\*?$/.test(x) ||
    /^~(\/\*?)?$/.test(x) ||
    /^\$\{?HOME\}?(\/\*?)?$/.test(x) ||
    /^\.\.?(\/\*?)?$/.test(x) ||
    /^\*$/.test(x) ||
    /^\.git\/?$/.test(x) ||
    /^[A-Za-z]:[\\/]?\*?$/.test(x) ||
    /^%(USERPROFILE|HOMEPATH|SYSTEMDRIVE)%/i.test(x)
  )
}

function gitSub(t) {
  let i = 1
  while (i < t.length && t[i].startsWith('-')) i += t[i] === '-C' || t[i] === '-c' ? 2 : 1
  return { sub: t[i], rest: t.slice(i + 1) }
}

function checkGit(t) {
  const { sub, rest } = gitSub(t)
  const shortF = (a) => /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a)
  if (sub === 'push' && rest.some((a) => a === '--force' || shortF(a) || /^\+\S/.test(a))) {
    return 'git push --force rewrites shared history. Use --force-with-lease, or ask the user to run it.'
  }
  if (sub === 'reset' && rest.includes('--hard')) return RESET
  const dryRun = rest.some((a) => a === '--dry-run' || /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a))
  if (sub === 'clean' && rest.some((a) => a === '--force' || shortF(a)) && !dryRun) {
    return 'git clean -f deletes untracked files for good. Run git clean -n first and ask the user.'
  }
  if (sub === 'checkout' || sub === 'restore') {
    const targets = rest.filter((a) => a !== '--' && !a.startsWith('-'))
    const stagedOnly = sub === 'restore' && rest.includes('--staged') && !rest.includes('--worktree')
    if (targets.length === 1 && targets[0] === '.' && !stagedOnly) {
      return 'git ' + sub + ' . discards every uncommitted change. Name the files, or ask the user.'
    }
  }
  return null
}

function checkOne(sub) {
  const t = words(sub)
  if (!t.length) return null
  const cmd = path.basename(t[0]).toLowerCase()
  const args = t.slice(1)
  if (cmd === 'git') return checkGit(t)
  if (cmd === 'rm') {
    const flags = flagsOf(args).join(' ')
    if (/(^|\s)-[a-zA-Z]*[rR]|--recursive/.test(flags) && targetsOf(args).some(dangerousTarget)) {
      return 'rm -r on a root, home, parent, or .git path deletes more than any task needs. Name the exact directory.'
    }
  }
  if (['rmdir', 'rd', 'del', 'erase'].includes(cmd) && args.some((a) => /^\/s$/i.test(a)) && targetsOf(args).some((a) => dangerousTarget(a.replace(/^\/\w+$/, ''))) ) {
    return cmd + ' /s on a drive root or user folder deletes more than any task needs. Name the exact directory.'
  }
  if (['remove-item', 'ri'].includes(cmd) && args.some((a) => /^-recurse$/i.test(a)) && targetsOf(args).some(dangerousTarget)) {
    return 'Remove-Item -Recurse on a root, home, or parent path deletes more than any task needs. Name the exact directory.'
  }
  if (cmd.startsWith('mkfs')) return 'mkfs formats a disk and erases everything on it. Not a coding task.'
  if (cmd === 'dd' && args.some((a) => /^of=\/dev\//.test(a))) return 'dd to a device file overwrites a whole disk. Not a coding task.'
  return null
}

// Reason string when the command must not run, else null.
function checkCommand(command, depth) {
  const text = Array.isArray(command) ? command.join(' ') : String(command || '')
  if (!text.trim()) return null
  const bare = stripQuotes(text)
  if (/\b(?:curl|wget|iwr|Invoke-WebRequest)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/i.test(bare) || /\|\s*iex\b/i.test(bare)) {
    return 'Piping a download into a shell runs code nobody read. Download it, read it, then run it.'
  }
  for (const sub of bare.split(/&&|\|\||[;|&\n]/)) {
    const reason = checkOne(sub)
    if (reason) return reason
  }
  if (!depth) {
    for (const body of shellBodies(text)) {
      const reason = checkCommand(body, 1)
      if (reason) return reason
    }
  }
  return null
}

const SECRET_NAMES = /^(id_(rsa|ed25519|ecdsa|dsa)|\.netrc|\.npmrc|\.pypirc)$/
const SHELL_RC = /^\.(bashrc|zshrc|profile|bash_profile|zprofile|zshenv)$/

// Reason string when the file must not be written, else null.
function checkPath(file, cwd) {
  if (typeof file !== 'string' || !file.trim()) return null
  const abs = path.resolve(cwd || process.cwd(), file).replace(/\\/g, '/')
  const parts = abs.split('/')
  const name = parts[parts.length - 1]
  const lower = name.toLowerCase()
  if (parts.includes('.git')) return 'Files inside .git/ are git\'s own state; use git commands.'
  if (/^\.env(\..+)?$/.test(lower) && !/\.(example|sample|template|dist)$/.test(lower)) {
    return name + ' holds secrets. Edit ' + name + '.example, and ask the user to change the real one.'
  }
  if (parts.includes('.ssh') || SECRET_NAMES.test(lower)) return name + ' is a credential file. Ask the user to change it.'
  if (parts.includes('.aws') && lower === 'credentials') return 'AWS credentials are not an agent\'s to edit.'
  if (SHELL_RC.test(lower)) return name + ' is a shell startup file that runs on every login. Ask the user to change it.'
  return null
}

module.exports = { SHELL_TRIGGER, checkCommand, checkPath }
