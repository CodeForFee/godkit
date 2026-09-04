'use strict'
// The rule this pins: a tool name is not an identity. One tool runs many models with different
// costs and failure modes, so a log saying "claude" tells the next agent nothing about whether to
// trust the unproven claim in it. Deliberately no registry of known ids — an allowlist is wrong
// within a quarter and then rejects the truth.

const { test } = require('node:test')
const assert = require('node:assert/strict')

const identity = require('../lib/identity')

test('model ids pass, across every vendor', () => {
  for (const id of [
    'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5',
    'codex-5.6-terra', 'codex-5.6-sol',
    'gemini-3.6-pro', 'gemini-3.8-flash',
  ]) {
    assert.equal(identity.looksLikeModelId(id), true, id + ' should be a model id')
  }
})

test('bare tool and vendor names are refused', () => {
  for (const name of ['claude', 'claude-code', 'cursor', 'codex', 'antigravity', 'gemini', 'copilot']) {
    assert.equal(identity.isPlatformName(name), true, name + ' should be known as a platform')
    assert.equal(identity.looksLikeModelId(name), false, name + ' is a tool, not a model')
  }
})

test('a name with no version is not a model id', () => {
  // "codex-kuhn" is real: it is what a worker in this repo's own history called itself. A family
  // without a version cannot answer "which model made this call".
  assert.equal(identity.looksLikeModelId('codex-kuhn'), false)
  assert.equal(identity.looksLikeModelId('some-thing'), false)
  assert.equal(identity.looksLikeModelId(''), false)
  assert.equal(identity.looksLikeModelId(null), false)
})

test('the unrecorded sentinel passes, and is never suggested', () => {
  // Logs written before the rule existed genuinely do not record a model. Back-filling a guess
  // would put a fabricated attribution into the permanent record, so there is one honest value.
  assert.equal(identity.looksLikeModelId(identity.UNRECORDED), true)
  for (const bad of ['claude', '', 'nonsense']) {
    assert.ok(!identity.why(bad).includes(identity.UNRECORDED), 'why() must not offer the sentinel')
  }
})

test('why() names the model rule rather than restating the value', () => {
  assert.match(identity.why('claude'), /is a tool, not a model/)
  assert.match(identity.why(''), /^empty\./)
  assert.match(identity.why('nonsense'), /family and a version/)
})
