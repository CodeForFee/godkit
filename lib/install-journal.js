'use strict'
// Private write-ahead evidence for installation rollback. Never infer ownership from a diff.
const fs = require('fs')
const crypto = require('crypto')
const path = require('path')
const { isInside } = require('./paths')
const OWNER = 'godkit-install-journal-v1'
const hash = (bytes) => bytes === null ? null : crypto.createHash('sha256').update(bytes).digest('hex')
const bytes = (value) => value === null || value === undefined ? null : Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8')

function append(file, entry) {
  const journal = process.env.GODKIT_INSTALL_JOURNAL
  if (!journal) return
  const token = process.env.GODKIT_INSTALL_TOKEN
  if (!token || fs.lstatSync(journal).isSymbolicLink()) throw new Error('invalid installation journal')
  const fd = fs.openSync(journal, 'r')
  let header
  try {
    const buffer = Buffer.alloc(1024)
    const count = fs.readSync(fd, buffer, 0, buffer.length, 0)
    header = JSON.parse(buffer.subarray(0, count).toString('utf8').split('\n')[0])
  } finally { fs.closeSync(fd) }
  if (header.owner !== OWNER || header.token !== token) throw new Error('installation journal ownership mismatch')
  const roots = JSON.parse(fs.readFileSync(journal + '.scope', 'utf8'))
  const absolute = path.resolve(file)
  if (!roots.some((root) => isInside(root, absolute))) return
  fs.appendFileSync(journal, JSON.stringify({ file: absolute, ...entry }) + '\n', { mode: 0o600 })
}

function recordWrite(file, before, after) {
  const original = bytes(before)
  append(file, { before: original === null ? null : original.toString('base64'), afterHash: hash(bytes(after)) })
}

function recordLink(file, beforeTarget, afterTarget, type) {
  append(file, { kind: 'link', beforeTarget, afterTarget, type: type || null })
}

module.exports = { recordWrite, recordLink, hash, OWNER }
