'use strict'
// Terminal presentation for the commands a person runs by hand (init, doctor, help, recall).
// Pretty only when a person is looking: anything piped, run by an agent, a hook or CI gets plain
// text, because that output lands in a model's context and every decorative byte is a token.

const env = process.env

function fancy(stream) {
  const s = stream || process.stdout
  if (env.GODKIT_PLAIN === '1') return false
  if (env.GODKIT_FANCY === '1') return true // tests and screenshots
  return Boolean(s.isTTY) && !('NO_COLOR' in env) && !env.CI && env.TERM !== 'dumb'
}

// Legacy Windows consoles render box-drawing as mojibake; Windows Terminal, VS Code and every
// non-Windows terminal do not.
function unicode() {
  if (env.GODKIT_ASCII === '1') return false
  if (process.platform !== 'win32') return true
  return Boolean(env.WT_SESSION || env.TERM_PROGRAM || env.ConEmuANSI === 'ON' || env.TERM)
}

function truecolor() {
  return /truecolor|24bit/i.test(env.COLORTERM || '') || Boolean(env.WT_SESSION) || env.TERM_PROGRAM === 'vscode'
}

function make(on) {
  const wrap = (open, close) => (s) => (on ? '\x1b[' + open + 'm' + s + '\x1b[' + close + 'm' : String(s))
  const rgb = (r, g, b, n256) => wrap(truecolor() ? '38;2;' + r + ';' + g + ';' + b : '38;5;' + n256, 39)
  return {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    under: wrap(4, 24),
    cyan: wrap(36, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    red: wrap(31, 39),
    white: wrap(97, 39),
    slate: rgb(148, 163, 184, 110), // logo-dark.svg stroke
    amber: rgb(217, 119, 6, 172), // logo.svg centre
  }
}

const SYM = {
  ok: ['●', '*'],
  skip: ['○', '-'],
  up: ['↑', '^'],
  warn: ['▲', '!'],
  err: ['✖', 'x'],
  done: ['✔', 'OK'],
  mark: ['◆', '*'],
  spark: ['✦', '*'],
}

// assets/logo.svg in box-drawing: four agents around one shared centre, the centre is .agent/.
// Rows 2-5, columns 8-14 are the centre box, drawn amber; everything else is slate.
const LOGO = [
  '        ╭─────╮     ',
  '        ╰──┬──╯     ',
  '   ╭──╮ ╭──┴──╮ ╭──╮',
  '   │  ├─┤ ▬▬▬ ├─┤  │',
  '   │  │ │ ▬▬  │ │  │',
  '   ╰──╯ ╰──┬──╯ ╰──╯',
  '        ╭──┴──╮     ',
  '        ╰─────╯     ',
]

function create(stream) {
  const out = stream || process.stdout
  const on = fancy(out)
  const uni = unicode()
  const c = make(on)
  const sym = (name) => SYM[name][uni ? 0 : 1]
  const write = (line) => out.write((line === undefined ? '' : line) + '\n')

  function paintLogoRow(row, i) {
    if (i < 2 || i > 5) return c.slate(row)
    // Painted per segment: a nested colour's reset would otherwise drop the amber after the bars.
    const mid = row.slice(8, 15).split(/(▬+)/).map((seg) => (seg.includes('▬') ? c.white(c.bold(seg)) : c.amber(seg)))
    return c.slate(row.slice(0, 8)) + mid.join('') + c.slate(row.slice(15))
  }

  // Full logo when there is room and the glyphs render; one mark otherwise.
  function header(title, version, subtitle) {
    const cols = out.columns || 80
    if (on && uni && cols >= 60) {
      write()
      LOGO.forEach((row, i) => {
        let text = ''
        if (i === 3) text = c.bold(c.cyan(title)) + '  ' + c.dim(version)
        if (i === 4 && subtitle) text = c.dim(subtitle)
        write(paintLogoRow(row, i) + (text ? '    ' + text : ''))
      })
      write()
      return
    }
    write()
    write('  ' + c.amber(sym('mark')) + ' ' + c.bold(c.cyan(title)) + ' ' + c.dim(version) +
      (subtitle ? '  ' + c.dim(subtitle) : ''))
    write()
  }

  const COLOR = { ok: c.green, skip: c.dim, up: c.cyan, warn: c.yellow, err: c.red }

  // One status line: symbol, label column, detail.
  function row(state, label, detail) {
    const s = (COLOR[state] || String)(sym(state))
    write('  ' + s + '  ' + c.bold(String(label || '').padEnd(9)) + ' ' + (detail || ''))
  }

  function kv(label, value) {
    write('  ' + c.dim(String(label).padEnd(9)) + ' ' + value)
  }

  function done(message, startedAt) {
    const ms = startedAt ? Date.now() - startedAt : null
    write()
    write('  ' + c.green(sym('done')) + ' ' + c.bold(message) + (ms === null ? '' : c.dim(' in ' + (ms / 1000).toFixed(1) + 's')))
  }

  function next(lines) {
    write()
    lines.forEach((line, i) => write('  ' + (i ? '      ' : c.bold(c.cyan('Next')) + '  ') + line))
    write()
  }

  return { on, uni, c, sym, write, header, row, kv, done, next }
}

module.exports = { create, fancy, unicode, LOGO }
