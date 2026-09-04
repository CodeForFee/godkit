'use strict'
// Who wrote this, in the only terms that stay true: the model, not the tool it ran inside.
//
// "claude" is four different models with four different failure modes, and a year from now it is
// four others. The next agent reading a log needs to know whether an unproven claim came from a
// frontier model or a cheap one — the tool name cannot answer that, so it is not an identity.
//
// Deliberately NOT a registry of known model ids. A shipped allowlist is wrong within a quarter and
// then rejects the truth. These two checks only reject what is definitely not a model id, and let
// the model name itself.

// Tool, vendor and role names that get typed where a model id belongs.
const PLATFORMS = new Set([
  'claude', 'claude-code', 'claudecode', 'anthropic',
  'cursor', 'codex', 'openai', 'chatgpt',
  'antigravity', 'gemini', 'google',
  'copilot', 'github-copilot', 'windsurf', 'cline', 'aider', 'devin',
  'agent', 'ai', 'assistant', 'bot', 'llm', 'model', 'unassigned', 'root', 'human', 'user',
])

// The one honest answer for a log written before this rule existed: the model genuinely was not
// recorded, and back-filling a guess would put a fabricated attribution into the permanent record.
// It passes the format gate and `godkit doctor` counts it, so it stays visible without being a
// wall. Never valid for new work — AGENTS.md says name your model.
const UNRECORDED = 'unrecorded'

function normalize(value) {
  return String(value == null ? '' : value).trim().toLowerCase()
}

function isPlatformName(value) {
  return PLATFORMS.has(normalize(value))
}

// A model id carries a family and a version: at least two `-` separated segments, and a digit
// somewhere. claude-opus-5, codex-5.6-terra, gemini-3.6-pro pass. claude, cursor, gpt fail.
function looksLikeModelId(value) {
  const v = normalize(value)
  if (v === UNRECORDED) return true
  if (!v || isPlatformName(v)) return false
  if (!/^[a-z0-9][a-z0-9.\-_]*$/.test(v)) return false
  return v.split('-').filter(Boolean).length >= 2 && /\d/.test(v)
}

// The one message. Kept here so the CLI, the contract check and the Stop hook cannot drift into
// three different phrasings of the same rule.
function why(value) {
  const v = normalize(value)
  if (!v) return 'empty. Name the model you are running as, e.g. claude-opus-5.'
  if (isPlatformName(v)) {
    return '"' + v + '" is a tool, not a model. Name the model: claude-opus-5, codex-5.6-terra, gemini-3.6-pro.'
  }
  return '"' + v + '" is not a model id — it needs a family and a version, e.g. claude-opus-5.'
}

module.exports = { PLATFORMS, UNRECORDED, isPlatformName, looksLikeModelId, why }
