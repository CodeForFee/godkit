<script>
  import { onMount } from 'svelte'

  // Prerendered first: every word below is in the served HTML before a byte of JS runs.
  // GSAP only layers motion on top of a page that already works.
  onMount(async () => {
    const { init } = await import('$lib/motion.js')
    return init()
  })

  // The session lifecycle — this is the "quy trình", and it is the product in one row.
  const flow = [
    { k: 'Clock in', d: 'Read the board, the map, the last two logs.', i: 'read' },
    { k: 'Claim', d: 'Your file globs, on the board, before you edit.', i: 'lock' },
    { k: 'Work', d: 'Inside your scope. Found a bug outside it? File it.', i: 'edit' },
    { k: 'Verify', d: 'Run the exit condition. A return value is not evidence.', i: 'check' },
    { k: 'Log', d: 'Real paths, real commands, real output.', i: 'log' },
    { k: 'Hand off', d: 'Release the claim. The next agent starts cold.', i: 'pass' },
  ]

  const hosts = [
    { n: 'Claude Code', s: '~/.claude/skills/', r: 'CLAUDE.md', e: true },
    { n: 'Codex', s: '~/.agents/skills/', r: 'AGENTS.md', e: true },
    { n: 'Cursor', s: '—', r: '.cursor/rules/godkit.mdc', e: false },
    { n: 'Antigravity', s: '~/.gemini/antigravity/', r: '.agents/rules/godkit.md', e: false },
  ]

  const cli = [
    ['godkit init', 'scaffold .agent/ + the rule files, and set up this machine once'],
    ['godkit init --new', 'a project with no code yet: a brief instead of a map'],
    ['godkit sprint new "…"', 'a goal, and waves of file-disjoint tasks under it'],
    ['godkit sprint close', 'refuses while anything in it is unfinished or unproven'],
    ['godkit verify', 'every task and log against the rules the templates state'],
    ['godkit doctor', 'what is set up, and whether the map went stale'],
  ]

  const stats = [
    ['0', 'runtime dependencies'],
    ['16', 'skills, same everywhere'],
    ['4', 'agent tools, one protocol'],
    ['209', 'tests, green'],
  ]
</script>

<div class="bg" aria-hidden="true">
  <div class="glow glow-a" data-anim="glow"></div>
  <div class="glow glow-b" data-anim="glow"></div>
  <div class="grid"></div>
</div>

<!-- ══ hero ══════════════════════════════════════════════════════════════ -->
<header class="hero">
  <div class="mark" data-h="mark">
    <svg viewBox="0 0 128 128" width="62" height="62" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity=".4">
        <path d="M64 34v14M64 80v14M34 64h14M80 64h14" />
        <rect x="49" y="9" width="30" height="25" rx="6" />
        <rect x="49" y="94" width="30" height="25" rx="6" />
        <rect x="9" y="49" width="25" height="30" rx="6" />
        <rect x="94" y="49" width="25" height="30" rx="6" />
      </g>
      <rect x="46" y="46" width="36" height="36" rx="9" fill="url(#g)" />
      <g stroke="#0a0a0b" stroke-width="4" stroke-linecap="round">
        <path d="M55 58h18M55 64h18M55 70h11" />
      </g>
      <defs>
        <linearGradient id="g" x1="46" y1="46" x2="82" y2="82" gradientUnits="userSpaceOnUse">
          <stop stop-color="#fbbf24" /><stop offset="1" stop-color="#f97316" />
        </linearGradient>
      </defs>
    </svg>
  </div>

  <p class="eyebrow" data-h="eyebrow">
    <span class="dot"></span> v1.0.0 · zero dependencies · MIT
  </p>

  <h1 data-h="title">
    One shared harness<br />for <em>every</em> AI agent
  </h1>

  <p class="sub" data-h="sub">
    Claude Code, Cursor, Codex and Antigravity all point at the same repo — and none of them can
    read the others' memory. Godkit gives them one that is committed.
  </p>

  <div class="actions" data-h="actions">
    <button class="cmd" type="button">
      <code>npx @codeforfee/godkit init</code>
    </button>
    <a class="ghost" href="https://github.com/CodeForFee/godkit">
      GitHub
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a>
  </div>

  <ul class="stats" data-h="stats">
    {#each stats as [n, l]}
      <li><b>{n}</b><span>{l}</span></li>
    {/each}
  </ul>
</header>

<main>
  <!-- ══ problem ═════════════════════════════════════════════════════════ -->
  <section class="sec" id="problem">
    <p class="kicker" data-a>The problem</p>
    <h2 data-a>Every agent arrives blind</h2>
    <p class="lead" data-a>
      It does not know what the project is, what was already done, which file someone else is
      holding, or what was decided last week. Private memory cannot fix it — Cursor cannot read
      Claude's, and Claude cannot read Cursor's.
    </p>

    <div class="scene" data-scene>
      <div class="side bad">
        <span class="side-tag">without godkit</span>
        <div class="nodes">
          {#each ['Claude', 'Cursor', 'Codex'] as n}
            <div class="node"><span>{n}</span><i class="store" data-drift></i></div>
          {/each}
        </div>
        <p class="side-cap">Three memories. None can read the other two.</p>
      </div>

      <div class="side good">
        <span class="side-tag on">with godkit</span>
        <div class="nodes">
          {#each ['Claude', 'Cursor', 'Codex'] as n}
            <div class="node"><span>{n}</span></div>
          {/each}
        </div>
        <svg class="wires" viewBox="0 0 300 62" preserveAspectRatio="none" aria-hidden="true">
          <path d="M50 0 V26 H150 V56" data-wire /><path d="M150 0 V56" data-wire />
          <path d="M250 0 V26 H150 V56" data-wire />
        </svg>
        <div class="hub" data-hub><code>.agent/</code></div>
        <p class="side-cap">One board, one map, one log — in the repo, in the diff.</p>
      </div>
    </div>

    <blockquote data-a>
      The only shared memory between tools<br />is the filesystem they both open.
    </blockquote>
  </section>

  <!-- ══ the workflow — the centrepiece ══════════════════════════════════ -->
  <section class="sec" id="flow">
    <p class="kicker" data-a>The protocol</p>
    <h2 data-a>Six steps, every session, every tool</h2>
    <p class="lead" data-a>
      Not a suggestion — on Claude Code and Codex a <code>Stop</code> hook blocks the turn until
      the log exists, and refuses one that claims done with nothing behind it.
    </p>

    <div class="flow" data-flow>
      <div class="track"><div class="pulse" data-pulse></div></div>
      {#each flow as s, i}
        <div class="step" data-step>
          <div class="step-num">{String(i + 1).padStart(2, '0')}</div>
          <h3>{s.k}</h3>
          <p>{s.d}</p>
        </div>
      {/each}
    </div>

    <div class="rules" data-a>
      <p class="rule">Read <code>.agent/</code> before you edit.</p>
      <span class="rule-sep"></span>
      <p class="rule">Write your log before you finish.</p>
    </div>
  </section>

  <!-- ══ the directory ═══════════════════════════════════════════════════ -->
  <section class="sec" id="state">
    <p class="kicker" data-a>The shared state</p>
    <h2 data-a>One directory, and it is committed</h2>
    <p class="lead" data-a>
      Not a database, not a service, not a plugin API. Markdown that every tool can already open
      and git can already merge.
    </p>

    <div class="win" data-a>
      <div class="win-bar"><i></i><i></i><i></i><span>.agent/</span></div>
      <pre><code><span class="f">BOARD.md</span>               <span class="c">roster · claims · bugs · decisions — one screen</span>
<span class="f">THREAD.md</span>              <span class="c">append-only conversation between agents</span>
<span class="f">BRIEF.md</span>               <span class="c">what this is, before there is code to map</span>
<span class="f">MAP.md</span>                 <span class="c">what this codebase is (generated)</span>
<span class="f">graph.json</span>             <span class="c">the machine-readable map</span>
<span class="f">sprints/S-001.md</span>       <span class="c">a goal, and the waves of tasks under it</span>
<span class="f">tasks/T-001-*.md</span>       <span class="c">Plan · Execute · Review · Test · Handoff</span>
<span class="f">log/&lt;UTC&gt;-&lt;model&gt;.md</span>   <span class="c">one per session, never edited by anyone else</span></code></pre>
    </div>

    <p class="lead sm" data-a>
      <strong>One log file per session</strong> is the whole concurrency design. Two tools writing
      at the same moment never touch the same file, so git merges them without a thought.
    </p>
  </section>

  <!-- ══ sprints ═════════════════════════════════════════════════════════ -->
  <section class="sec" id="sprints">
    <p class="kicker" data-a>Sprints</p>
    <h2 data-a>Waves that cannot collide</h2>
    <p class="lead" data-a>
      A task is one seam. Several seams pointed at one goal is a sprint — and the only rule that
      governs a wave is which files it touches.
    </p>

    <div class="waves" data-waves>
      <div class="wv" data-wv>
        <span class="wv-h">wave 1</span>
        <i>T-001</i><i>T-002</i><i>T-003</i>
      </div>
      <div class="gate" data-gate><span>join gate</span><b>full suite</b></div>
      <div class="wv" data-wv><span class="wv-h">wave 2</span><i>T-004</i><i>T-005</i></div>
      <div class="gate" data-gate><span>join gate</span><b>full suite</b></div>
      <div class="wv done" data-wv><span class="wv-h">close</span><i>proven</i></div>
    </div>

    <p class="lead sm" data-a>
      A task touching a file already claimed in this wave drops to the next one — it does not run
      in parallel and get merged hopefully. Each seam's exit condition proves the seam; the gate
      proves they still compose.
    </p>

    <div class="win" data-a>
      <div class="win-bar"><i></i><i></i><i></i><span>godkit sprint</span></div>
      <pre><code><span class="p">$</span> godkit sprint
S-001  open  ship auth

  task     owner               phase     state
  T-001    <span class="m">claude-opus-5</span>       done      <span class="ok">proven</span>
  T-002    <span class="m">codex-5.6-terra</span>     done      <span class="ok">proven</span>
  T-003    <span class="m">gemini-3.6-pro</span>      execute   ok

  1 blocker(s) — `godkit sprint close` lists them</code></pre>
    </div>
  </section>

  <!-- ══ identity ════════════════════════════════════════════════════════ -->
  <section class="sec narrow" id="identity">
    <p class="kicker" data-a>Identity</p>
    <h2 data-a>Signed by a model, never by a tool</h2>
    <div class="idcards">
      <div class="idc bad" data-a><code>agent: "claude"</code><span>which one?</span></div>
      <div class="idc good" data-a><code>agent: "claude-opus-5"</code><span>answerable</span></div>
    </div>
    <p class="lead" data-a>
      One tool runs many models, with different costs, context windows and failure modes. An agent
      reading someone else's unproven claim needs to know which one made it.
      <code>godkit verify</code> rejects a bare tool name.
    </p>
  </section>

  <!-- ══ hosts ═══════════════════════════════════════════════════════════ -->
  <section class="sec" id="hosts">
    <p class="kicker" data-a>Compatibility</p>
    <h2 data-a>Four tools, one protocol</h2>
    <div class="hosts">
      {#each hosts as h}
        <div class="host" data-a>
          <div class="host-top">
            <b>{h.n}</b>
            <span class="pill" class:on={h.e}>{h.e ? 'enforced' : 'instructed'}</span>
          </div>
          <dl>
            <dt>skills</dt><dd><code>{h.s}</code></dd>
            <dt>rules</dt><dd><code>{h.r}</code></dd>
          </dl>
        </div>
      {/each}
    </div>
    <p class="lead sm" data-a>
      Every rule file is generated from a single <code>AGENTS.md</code> and byte-compared in CI, so
      they cannot drift apart and quietly tell two agents different things.
    </p>
  </section>

  <!-- ══ cli ═════════════════════════════════════════════════════════════ -->
  <section class="sec" id="cli">
    <p class="kicker" data-a>Reference</p>
    <h2 data-a>What you actually type</h2>
    <div class="cmds">
      {#each cli as [c, d]}
        <div class="cmd-row" data-a>
          <code>{c}</code>
          <span>{d}</span>
        </div>
      {/each}
    </div>
  </section>

  <!-- ══ cta ═════════════════════════════════════════════════════════════ -->
  <section class="cta" data-a>
    <h2>Give them a memory they share</h2>
    <button class="cmd big" type="button"><code>npx @codeforfee/godkit init</code></button>
    <p>Node 18+. No dependencies. Nothing to configure.</p>
  </section>
</main>

<footer>
  <a href="https://www.npmjs.com/package/@codeforfee/godkit">npm</a>
  <a href="https://github.com/CodeForFee/godkit">source</a>
  <span>MIT © CodeForFee</span>
</footer>

<style>
  :global(:root) {
    --bg: #08080a;
    --surface: rgba(255, 255, 255, 0.028);
    --line: rgba(255, 255, 255, 0.085);
    --line-2: rgba(255, 255, 255, 0.16);
    --fg: #ecedf0;
    --dim: #8b8c96;
    --faint: #5c5d67;
    --amber: #fbbf24;
    --orange: #f97316;
    --grad: linear-gradient(135deg, #fbbf24, #f97316);
    --serif: 'Newsreader', ui-serif, Georgia, serif;
    --sans: 'Instrument Sans', ui-sans-serif, system-ui, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  }

  :global(html) { background: var(--bg); scroll-behavior: smooth; }
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--sans);
    font-size: 16px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }
  @media (prefers-reduced-motion: reduce) {
    :global(html) { scroll-behavior: auto; }
  }

  /* Nothing is hidden by CSS. The from-states are set by GSAP itself, in motion.js, so a page
     whose JS never loads - blocked, failed, or an engine that simply is not painting - is the
     finished document rather than a blank screen. Hiding content behind a script you do not
     control the delivery of is how a landing page ends up showing nothing at all. */

  code { font-family: var(--mono); font-size: 0.87em; }

  /* ── ambient background ─────────────────────────────────────────────── */
  .bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
  .glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(110px);
    opacity: 0.16;
  }
  .glow-a {
    width: 46rem; height: 46rem; top: -22rem; left: 50%; margin-left: -23rem;
    background: radial-gradient(circle, #f97316, transparent 68%);
  }
  .glow-b {
    width: 34rem; height: 34rem; top: 62%; left: 8%;
    background: radial-gradient(circle, #fbbf24, transparent 70%);
    opacity: 0.08;
  }
  .grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(var(--line) 1px, transparent 1px),
      linear-gradient(90deg, var(--line) 1px, transparent 1px);
    background-size: 68px 68px;
    mask-image: radial-gradient(ellipse 90% 55% at 50% 0%, #000 20%, transparent 78%);
    opacity: 0.5;
  }

  /* ── hero, centred ──────────────────────────────────────────────────── */
  .hero {
    position: relative; z-index: 1;
    max-width: 60rem;
    margin: 0 auto;
    padding: clamp(4.5rem, 12vh, 9rem) 1.5rem clamp(3rem, 7vh, 5rem);
    text-align: center;
  }
  .mark { color: var(--fg); line-height: 0; margin-bottom: 2rem; }

  .eyebrow {
    display: inline-flex; align-items: center; gap: 0.6rem;
    font-family: var(--mono); font-size: 0.7rem; letter-spacing: 0.1em;
    color: var(--dim);
    border: 1px solid var(--line); border-radius: 100px;
    padding: 0.4rem 0.95rem; margin: 0 0 2rem;
    background: var(--surface);
  }
  .dot {
    width: 6px; height: 6px; border-radius: 50%; background: var(--amber);
    box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.16);
  }

  h1 {
    font-family: var(--serif);
    font-weight: 300;
    font-size: clamp(2.6rem, 7.4vw, 5.4rem);
    line-height: 1.03;
    letter-spacing: -0.032em;
    margin: 0 0 1.6rem;
  }
  h1 em {
    font-style: italic;
    background: var(--grad);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .sub {
    max-width: 40rem; margin: 0 auto 2.5rem;
    color: var(--dim); font-size: clamp(1rem, 1.7vw, 1.15rem); line-height: 1.65;
  }

  .actions {
    display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; align-items: center;
  }
  .cmd {
    font: inherit; cursor: default;
    border: 1px solid var(--line-2); border-radius: 10px;
    background: rgba(255, 255, 255, 0.045);
    padding: 0.8rem 1.3rem;
    color: var(--fg);
    transition: border-color 0.25s, background 0.25s, transform 0.25s;
  }
  .cmd:hover { border-color: rgba(251, 191, 36, 0.55); background: rgba(251, 191, 36, 0.07); transform: translateY(-1px); }
  .cmd code::before { content: '$ '; color: var(--amber); }
  .cmd.big { padding: 1rem 1.7rem; font-size: 1.05rem; }

  .ghost {
    display: inline-flex; align-items: center; gap: 0.45rem;
    color: var(--dim); text-decoration: none;
    padding: 0.8rem 1.1rem; border-radius: 10px; border: 1px solid transparent;
    font-size: 0.92rem; transition: color 0.2s, border-color 0.2s;
  }
  .ghost:hover { color: var(--fg); border-color: var(--line); }

  .stats {
    list-style: none; margin: 3.5rem 0 0; padding: 0;
    display: flex; flex-wrap: wrap; justify-content: center; gap: 0.75rem 3rem;
  }
  .stats li { display: flex; flex-direction: column; gap: 0.15rem; }
  .stats b {
    font-family: var(--serif); font-weight: 400; font-size: 2rem; line-height: 1;
    background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .stats span { font-family: var(--mono); font-size: 0.66rem; color: var(--faint); letter-spacing: 0.06em; }

  /* ── sections, centred ──────────────────────────────────────────────── */
  main { position: relative; z-index: 1; }
  .sec {
    max-width: 62rem; margin: 0 auto;
    padding: clamp(4rem, 10vh, 7rem) 1.5rem;
    text-align: center;
  }
  .sec.narrow { max-width: 46rem; }

  .kicker {
    font-family: var(--mono); font-size: 0.68rem; letter-spacing: 0.18em;
    text-transform: uppercase; color: var(--amber); margin: 0 0 1rem;
  }
  h2 {
    font-family: var(--serif); font-weight: 300;
    font-size: clamp(1.9rem, 4.2vw, 3rem);
    line-height: 1.1; letter-spacing: -0.025em;
    margin: 0 0 1.2rem;
  }
  .lead {
    max-width: 42rem; margin: 0 auto 2.75rem;
    color: var(--dim); font-size: 1.02rem; line-height: 1.7;
  }
  .lead.sm { font-size: 0.95rem; margin-top: 2rem; margin-bottom: 0; }
  .lead code, h2 code { color: var(--amber); }
  .lead strong { color: var(--fg); font-weight: 600; }

  blockquote {
    font-family: var(--serif); font-weight: 300; font-style: italic;
    font-size: clamp(1.3rem, 3vw, 2rem); line-height: 1.35;
    margin: 3.5rem auto 0; max-width: 34rem; color: var(--fg);
  }

  /* ── problem scene ──────────────────────────────────────────────────── */
  .scene { display: grid; gap: 1rem; text-align: left; }
  @media (min-width: 760px) { .scene { grid-template-columns: 1fr 1fr; gap: 1.25rem; } }

  .side {
    border: 1px solid var(--line); border-radius: 16px;
    padding: 1.5rem 1.4rem 1.25rem; background: var(--surface);
    position: relative; overflow: hidden;
  }
  .side.good { border-color: rgba(251, 191, 36, 0.28); }
  .side-tag {
    font-family: var(--mono); font-size: 0.64rem; letter-spacing: 0.13em;
    text-transform: uppercase; color: var(--faint);
  }
  .side-tag.on { color: var(--amber); }
  .nodes { display: flex; gap: 0.5rem; margin: 1.1rem 0 0; }
  .node { flex: 1; text-align: center; }
  .node span {
    display: block; font-family: var(--mono); font-size: 0.68rem; color: var(--dim);
    border: 1px solid var(--line); border-radius: 8px; padding: 0.45rem 0.2rem;
    background: rgba(255, 255, 255, 0.02);
  }
  .store {
    display: block; height: 2.4rem; margin-top: 1.5rem;
    border: 1px dashed var(--line); border-radius: 8px;
  }
  .wires { display: block; width: 100%; height: 3.9rem; }
  /* Drawn by default. motion.js winds them back to 200 only when it is about to animate them,
     so with no JS the wires are simply there. */
  .wires path {
    fill: none; stroke: var(--amber); stroke-width: 1.25; opacity: 0.75;
    stroke-dasharray: 200; stroke-dashoffset: 0;
  }
  .hub {
    text-align: center; border: 1px solid rgba(251, 191, 36, 0.5); border-radius: 10px;
    padding: 0.55rem; background: rgba(251, 191, 36, 0.09);
  }
  .hub code { color: var(--amber); font-weight: 500; }
  .side-cap {
    font-family: var(--mono); font-size: 0.66rem; color: var(--faint);
    margin: 1.1rem 0 0; line-height: 1.55;
  }
  .bad .store { margin-top: 1.5rem; }

  /* ── the workflow ───────────────────────────────────────────────────── */
  .flow { position: relative; display: grid; gap: 0.85rem; text-align: left; }
  @media (min-width: 700px) { .flow { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 1000px) { .flow { grid-template-columns: repeat(6, 1fr); gap: 0.7rem; } }

  .track {
    display: none;
    position: absolute; top: 1.55rem; left: 4%; right: 4%; height: 1px;
    background: var(--line); overflow: visible;
  }
  @media (min-width: 1000px) { .track { display: block; } }
  .pulse {
    position: absolute; top: -2px; left: 0; width: 4.5rem; height: 5px; border-radius: 4px;
    background: var(--grad); filter: blur(1px);
    box-shadow: 0 0 14px rgba(249, 115, 22, 0.65);
  }

  .step {
    border: 1px solid var(--line); border-radius: 14px;
    padding: 1.1rem 1rem 1.15rem; background: var(--bg);
    position: relative; transition: border-color 0.3s, transform 0.3s;
  }
  .step:hover { border-color: rgba(251, 191, 36, 0.42); transform: translateY(-3px); }
  .step-num {
    font-family: var(--mono); font-size: 0.62rem; color: var(--bg);
    background: var(--grad); border-radius: 100px;
    width: 1.9rem; height: 1.35rem; display: grid; place-items: center;
    font-weight: 700; letter-spacing: 0.04em; margin-bottom: 0.75rem;
  }
  .step h3 { margin: 0 0 0.35rem; font-size: 0.98rem; font-weight: 600; letter-spacing: -0.01em; }
  .step p { margin: 0; font-size: 0.8rem; line-height: 1.55; color: var(--dim); }

  .rules {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
    gap: 1.25rem; margin-top: 3.5rem;
    border: 1px solid var(--line); border-radius: 16px;
    padding: 1.6rem 1.5rem; background: var(--surface);
  }
  .rule {
    margin: 0; font-family: var(--serif); font-style: italic; font-weight: 300;
    font-size: clamp(1.05rem, 2.2vw, 1.45rem); color: var(--fg);
  }
  .rule code { font-style: normal; color: var(--amber); }
  .rule-sep { width: 1px; height: 1.6rem; background: var(--line-2); }

  /* ── window chrome ──────────────────────────────────────────────────── */
  .win {
    border: 1px solid var(--line); border-radius: 14px; overflow: hidden;
    background: #0b0b0e; text-align: left;
    box-shadow: 0 24px 60px -30px rgba(0, 0, 0, 0.9);
  }
  .win-bar {
    display: flex; align-items: center; gap: 0.45rem;
    padding: 0.7rem 1rem; border-bottom: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.022);
  }
  .win-bar i { width: 9px; height: 9px; border-radius: 50%; background: var(--line-2); }
  .win-bar span {
    margin-left: 0.6rem; font-family: var(--mono); font-size: 0.68rem; color: var(--faint);
  }
  .win pre {
    margin: 0; padding: 1.25rem 1.35rem; overflow-x: auto;
    font-size: 0.76rem; line-height: 1.85; color: #b9bac2;
  }
  .win code { font-family: var(--mono); font-size: inherit; }
  .win .f { color: var(--amber); }
  .win .c { color: var(--faint); }
  .win .p { color: var(--orange); }
  .win .m { color: #7dd3fc; }
  .win .ok { color: #86efac; }

  /* ── waves ──────────────────────────────────────────────────────────── */
  .waves {
    display: flex; flex-wrap: wrap; align-items: stretch; justify-content: center;
    gap: 0.6rem; margin-bottom: 0.5rem;
  }
  .wv {
    border: 1px solid var(--line); border-radius: 12px;
    padding: 0.85rem 1rem; background: var(--surface);
    display: flex; flex-direction: column; gap: 0.35rem; align-items: flex-start;
  }
  .wv-h {
    font-family: var(--mono); font-size: 0.64rem; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--dim);
  }
  .wv i {
    font-style: normal; font-family: var(--mono); font-size: 0.7rem; color: var(--dim);
    background: rgba(255, 255, 255, 0.05); border-radius: 5px; padding: 0.14rem 0.5rem;
  }
  .wv.done { border-color: rgba(251, 191, 36, 0.45); background: rgba(251, 191, 36, 0.08); justify-content: center; }
  .wv.done .wv-h, .wv.done i { color: var(--amber); background: transparent; padding: 0; }
  .gate {
    align-self: center; text-align: center; padding: 0.5rem 0.7rem; border-radius: 10px;
    font-family: var(--mono); font-size: 0.64rem; line-height: 1.5;
  }
  .gate span { color: var(--amber); display: block; }
  .gate b { color: var(--faint); font-weight: 400; }

  /* ── identity cards ─────────────────────────────────────────────────── */
  .idcards { display: grid; gap: 0.75rem; margin-bottom: 2.5rem; }
  @media (min-width: 620px) { .idcards { grid-template-columns: 1fr 1fr; } }
  .idc {
    border: 1px solid var(--line); border-radius: 12px; padding: 1.1rem;
    display: flex; flex-direction: column; gap: 0.4rem; background: var(--surface);
  }
  .idc code { font-size: 0.88rem; }
  .idc span { font-family: var(--mono); font-size: 0.66rem; letter-spacing: 0.08em; }
  .idc.bad code { color: var(--faint); text-decoration: line-through; }
  .idc.bad span { color: var(--faint); }
  .idc.good { border-color: rgba(251, 191, 36, 0.38); background: rgba(251, 191, 36, 0.06); }
  .idc.good code { color: var(--amber); }
  .idc.good span { color: var(--amber); }

  /* ── hosts ──────────────────────────────────────────────────────────── */
  .hosts { display: grid; gap: 0.75rem; text-align: left; }
  @media (min-width: 640px) { .hosts { grid-template-columns: 1fr 1fr; } }
  .host {
    border: 1px solid var(--line); border-radius: 14px; padding: 1.15rem 1.25rem;
    background: var(--surface); transition: border-color 0.3s;
  }
  .host:hover { border-color: var(--line-2); }
  .host-top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.9rem; }
  .host-top b { font-size: 0.98rem; }
  .pill {
    font-family: var(--mono); font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase;
    border: 1px solid var(--line); border-radius: 100px; padding: 0.16rem 0.6rem; color: var(--faint);
  }
  .pill.on { color: var(--amber); border-color: rgba(251, 191, 36, 0.4); background: rgba(251, 191, 36, 0.07); }
  .host dl { margin: 0; display: grid; grid-template-columns: 3.4rem 1fr; gap: 0.35rem 0.6rem; }
  .host dt { font-family: var(--mono); font-size: 0.64rem; color: var(--faint); letter-spacing: 0.06em; }
  .host dd { margin: 0; }
  .host dd code { color: var(--dim); font-size: 0.72rem; word-break: break-all; }

  /* ── cli ────────────────────────────────────────────────────────────── */
  .cmds { display: grid; gap: 0.4rem; text-align: left; }
  .cmd-row {
    display: grid; gap: 0.2rem 1.5rem; align-items: baseline;
    padding: 0.85rem 1.1rem; border: 1px solid var(--line); border-radius: 11px;
    background: var(--surface); transition: border-color 0.25s, background 0.25s;
  }
  @media (min-width: 720px) { .cmd-row { grid-template-columns: 15rem 1fr; } }
  .cmd-row:hover { border-color: rgba(251, 191, 36, 0.32); background: rgba(251, 191, 36, 0.035); }
  .cmd-row code { color: var(--fg); font-weight: 500; }
  .cmd-row span { color: var(--dim); font-size: 0.88rem; }

  /* ── cta ────────────────────────────────────────────────────────────── */
  .cta {
    max-width: 46rem; margin: 0 auto; text-align: center;
    padding: clamp(4rem, 10vh, 7rem) 1.5rem clamp(5rem, 12vh, 8rem);
  }
  .cta h2 { margin-bottom: 2rem; }
  .cta p { font-family: var(--mono); font-size: 0.72rem; color: var(--faint); margin: 1.5rem 0 0; }

  footer {
    position: relative; z-index: 1;
    border-top: 1px solid var(--line);
    padding: 2rem 1.5rem 3rem; text-align: center;
    display: flex; flex-wrap: wrap; gap: 1.5rem; justify-content: center;
    font-family: var(--mono); font-size: 0.72rem; color: var(--faint);
  }
  footer a { color: var(--dim); text-decoration: none; }
  footer a:hover { color: var(--amber); }
</style>
