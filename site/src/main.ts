// The page is the finished document on first paint: every word is in index.html and reads with
// JavaScript off. This file layers motion and depth on top.
//
//   canvas                               the star field, and the code rain inside the portal
//   Motion (Framer Motion's vanilla API)  things that arrive: hero copy, counters, reveals, chart
//                                         lines, the reading-progress bar, press feedback
//   GSAP + ScrollTrigger                  scroll- and pointer-bound depth: the board tipping up into
//                                         place, cubes, parallax sides, 3D tilt, the circuit, the orbit
//
// Lessons from the last GSAP version of this page (git show eae1196): hide from HERE, never from
// CSS, so a script that fails leaves a readable page; re-measure ScrollTrigger after the webfonts
// and the load event; and a safety net that un-hides anything still hidden.
import './style.css'

import { animate, inView, press, scroll, stagger } from 'motion'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll<T>(sel))

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches

// ── always on: behaviour, not decoration ─────────────────────────────────────────────────────

function copyButtons(): void {
  const status = document.getElementById('copy-status')
  for (const btn of $$<HTMLButtonElement>('[data-copy]')) {
    btn.addEventListener('click', async () => {
      let ok = false
      try {
        await navigator.clipboard.writeText(btn.dataset.copy || '')
        ok = true
      } catch {
        // Clipboard refused (insecure context, permissions): select the text so Ctrl+C works.
        const code = btn.querySelector('code')
        if (code) {
          const range = document.createRange()
          range.selectNodeContents(code)
          const sel = window.getSelection()
          sel?.removeAllRanges()
          sel?.addRange(range)
        }
      }
      if (status) status.textContent = ok ? 'Copied to clipboard' : 'Selected: press Ctrl+C to copy'
      btn.classList.add('done')
      window.setTimeout(() => btn.classList.remove('done'), 1600)
    })
  }
}

function navState(): void {
  const nav = document.querySelector('.nav')
  if (!nav) return
  const update = () => nav.classList.toggle('scrolled', window.scrollY > 8)
  update()
  window.addEventListener('scroll', update, { passive: true })
}

// A field of stars that twinkle and drift a little. With reduced motion it is drawn once.
function starField(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-stars]')
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  type Star = { x: number; y: number; r: number; a: number; s: number; v: number }
  let stars: Star[] = []
  let w = 0
  let h = 0
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const size = () => {
    w = window.innerWidth
    h = window.innerHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const n = Math.round(Math.min(220, (w * h) / 7000))
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.3 + 0.2,
      a: Math.random(), s: Math.random() * 0.015 + 0.004, v: Math.random() * 0.06 + 0.01,
    }))
  }
  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h)
    for (const s of stars) {
      const tw = reduce ? 0.7 : 0.45 + 0.55 * Math.abs(Math.sin(t * s.s + s.a * 6))
      ctx.globalAlpha = tw
      ctx.fillStyle = s.r > 1.1 ? '#d9dbff' : '#ffffff'
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fill()
      if (!reduce) {
        s.y -= s.v
        if (s.y < -2) s.y = h + 2
      }
    }
    ctx.globalAlpha = 1
  }
  size()
  window.addEventListener('resize', size)
  if (reduce) {
    draw(0)
    window.addEventListener('resize', () => draw(0))
    return
  }
  const loop = (t: number) => {
    if (!document.hidden) draw(t / 16)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

// Code rain inside the portal: the characters agents leave behind in .agent/.
function codeRain(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-rain]')
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  const glyphs = '01·claimlogverify{}[]#$|/\\agentmap'.split('')
  let cols: number[] = []
  let w = 0
  let h = 0
  const fs = 13
  const size = () => {
    const r = canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    w = r.width
    h = r.height
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    cols = Array.from({ length: Math.ceil(w / fs) }, () => Math.random() * -40)
  }
  const step = () => {
    ctx.fillStyle = 'rgba(3, 4, 10, 0.18)'
    ctx.fillRect(0, 0, w, h)
    ctx.font = fs + 'px JetBrains Mono, monospace'
    cols.forEach((y, i) => {
      const ch = glyphs[(Math.random() * glyphs.length) | 0]
      ctx.fillStyle = Math.random() > 0.94 ? '#d6fff1' : 'rgba(63, 224, 176, 0.85)'
      ctx.fillText(ch, i * fs, y * fs)
      cols[i] = y * fs > h && Math.random() > 0.96 ? 0 : y + 1
    })
  }
  size()
  window.addEventListener('resize', size)
  if (reduce) {
    for (let i = 0; i < 40; i++) step()
    return
  }
  let visible = false
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas)
  let last = 0
  const loop = (t: number) => {
    if (visible && t - last > 55) {
      step()
      last = t
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

// The circuit's wires are drawn from where the cards and the chip really are: each agent card gets
// its own wire, fanning out of its right edge and into its own pin on the chip's left side.
// Re-drawn whenever the layout changes. (The paths in the HTML are only the no-JS fallback.)
function wireCircuit(): void {
  const circuit = document.querySelector<HTMLElement>('[data-circuit]')
  const svg = circuit?.querySelector<SVGSVGElement>('.wires')
  const wrap = circuit?.querySelector<HTMLElement>('.chip-wrap')
  const pins = svg?.querySelector('[data-pins]')
  if (!circuit || !svg || !wrap || !pins) return
  const nodes = $$('.node', circuit)
  const wires = $$<SVGPathElement>('[data-wire]', svg)
  const pulses = $$<SVGPathElement>('[data-pulse]', svg)
  const draw = () => {
    const s = svg.getBoundingClientRect()
    if (!s.width || getComputedStyle(svg).display === 'none') return
    svg.setAttribute('viewBox', `0 0 ${s.width} ${s.height}`)
    // The chip is 52% of its wrapper, centred: measured from the wrapper so its float never matters.
    const w = wrap.getBoundingClientRect()
    const chipLeft = w.left + w.width * 0.24 - s.left + 4
    const chipTop = w.top + w.height * 0.24 - s.top
    const chipH = w.height * 0.52
    let dots = ''
    nodes.forEach((n, i) => {
      const r = n.getBoundingClientRect()
      const x0 = r.right - s.left
      const y0 = r.top + r.height / 2 - s.top
      const x1 = chipLeft
      const y1 = chipTop + chipH * (0.2 + (0.6 * i) / Math.max(1, nodes.length - 1))
      // A long straight run into the pin, so each wire enters as its own branch beside the traces.
      const k = (x1 - x0 - 50) * 0.5
      const d = `M${x0} ${y0} H${x0 + 14} C${x0 + 14 + k} ${y0} ${x1 - 36 - k} ${y1} ${x1 - 36} ${y1} H${x1}`
      wires[i]?.setAttribute('d', d)
      pulses[i]?.setAttribute('d', d)
      dots += `<circle cx="${x0}" cy="${y0}" r="4"/><circle class="end" cx="${x1}" cy="${y1}" r="3"/>`
    })
    pins.innerHTML = dots
  }
  draw()
  new ResizeObserver(draw).observe(circuit)
  document.fonts?.ready.then(draw).catch(() => {})
}

// The chip's circuit traces: seven per side on the top, right and bottom (the left is where the
// agents' wires come in). Each runs straight out, bends 45° away from the centre, runs on, and ends
// in a glowing pad; a spark rides each one outward (CSS, so reduced motion simply hides it).
function chipTraces(): void {
  const g = document.querySelector('[data-traces]')
  if (!g) return
  const C = 160 // centre of the 320 box
  const H = 83 // half the chip: it is 52% of the box
  const lanes = [-66, -44, -22, 0, 22, 44, 66]
  const turn = (x: number, y: number, deg: number) => {
    const a = (deg * Math.PI) / 180
    const dx = x - C
    const dy = y - C
    return [C + dx * Math.cos(a) - dy * Math.sin(a), C + dx * Math.sin(a) + dy * Math.cos(a)].map((v) => Math.round(v * 10) / 10)
  }
  let base = ''
  let sparks = ''
  let pads = ''
  // The left side keeps clear of the four wire pins (at ±17 and ±50 from the centre): its traces sit
  // in the gaps between them and stay short, so each incoming wire reads as its own branch.
  const sides: [number, number[], number][] = [[0, lanes, 1], [90, lanes, 1], [180, lanes, 1], [270, [-72, -33, 0, 33, 72], 0.55]]
  sides.forEach(([deg, laneSet, k], s) => {
    laneSet.forEach((o, i) => {
      const run1 = (10 + ((i * 5 + s * 3) % 4) * 7) * k
      const bend = o === 0 || deg === 270 ? 0 : Math.sign(o) * (8 + Math.abs(o) * 0.45)
      const run2 = (18 + ((i * 3 + s * 2) % 3) * 13) * k
      const y0 = C - H
      const raw: [number, number][] = [[C + o, y0], [C + o, y0 - run1], [C + o + bend, y0 - run1 - Math.abs(bend)], [C + o + bend, y0 - run1 - Math.abs(bend) - run2]]
      const pts = raw.map(([x, y]) => turn(x, y, deg))
      const d = 'M' + pts.map((p) => p.join(' ')).join(' L')
      const delay = -((i * 0.53 + s * 0.31) % 2.8).toFixed(2)
      const [ex, ey] = pts[3]
      base += `<path d="${d}"/>`
      sparks += `<path class="spark" pathLength="100" style="--d:${delay}s" d="${d}"/>`
      pads += `<circle cx="${ex}" cy="${ey}" r="2.4" style="--d:${delay}s"/>`
    })
  })
  g.innerHTML = base + sparks + pads
}

// Motes rising through the CTA's spotlight: narrow at the source, spreading as they climb.
function motes(): void {
  const box = document.querySelector('[data-motes]')
  if (!box || reduce) return
  let html = ''
  for (let i = 0; i < 34; i++) {
    const x = 50 + (Math.random() - 0.5) * 14
    const dx = (Math.random() - 0.5) * 22 + 'rem'
    const s = (Math.random() * 3 + 1.5).toFixed(1) + 'px'
    const t = (Math.random() * 5 + 5).toFixed(2) + 's'
    const d = -(Math.random() * 10).toFixed(2) + 's'
    html += `<i style="left:${x.toFixed(1)}%;--dx:${dx};--s:${s};--t:${t};--d:${d}"></i>`
  }
  box.innerHTML = html
}

copyButtons()
navState()
motes()
chipTraces()
wireCircuit()
starField()
codeRain()
if (!reduce) withMotion()

// ── motion layer ─────────────────────────────────────────────────────────────────────────────

function withMotion(): void {
  gsap.registerPlugin(ScrollTrigger)
  const hidden: HTMLElement[] = []
  const hide = (els: HTMLElement[], style: Partial<CSSStyleDeclaration>) => {
    for (const el of els) {
      Object.assign(el.style, style)
      hidden.push(el)
    }
  }
  const easeOut = [0.16, 1, 0.3, 1] as const

  // Motion: reading progress, bound to scroll.
  const bar = document.querySelector<HTMLElement>('[data-progress]')
  if (bar) scroll(animate(bar, { scaleX: [0, 1] }, { ease: 'linear' }))

  // Motion: hero copy. Lines rise out of their own mask, the rest follows.
  const lines = $$('[data-hero-title] .line > span')
  const heroBits = $$('[data-hero]')
  hide(lines, { transform: 'translateY(110%)' })
  hide(heroBits, { opacity: '0' })
  animate(lines, { transform: ['translateY(110%)', 'translateY(0%)'] }, { duration: 1, delay: stagger(0.1), ease: easeOut })
  animate(heroBits, { opacity: [0, 1], y: [16, 0] }, { duration: 0.8, delay: stagger(0.1, { startDelay: 0.3 }), ease: easeOut })

  // Motion: counters, once seen.
  for (const el of $$('[data-count]')) {
    const to = Number(el.dataset.count) || 0
    el.textContent = '0'
    inView(el, () => {
      animate(0, to, { duration: 1.2, delay: 0.6, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => (el.textContent = String(Math.round(v))) })
    })
  }

  // Motion: chart lines draw themselves when the board is in view.
  const chartLines = $$<SVGPathElement>('[data-line]')
  for (const p of chartLines) {
    const len = p.getTotalLength()
    p.style.strokeDasharray = String(len)
    p.style.strokeDashoffset = String(len)
  }
  inView('.chart', () => {
    chartLines.forEach((p, i) => animate(p, { strokeDashoffset: [p.getTotalLength(), 0] }, { duration: 1.6, delay: 0.5 + i * 0.25, ease: easeOut }))
  })

  // Motion: everything marked data-reveal arrives as it enters the viewport (IntersectionObserver,
  // so nothing measured can go stale when the fonts swap in).
  const reveals = $$('[data-reveal]')
  hide(reveals, { opacity: '0' })
  inView(reveals, (el) => {
    animate(el, { opacity: [0, 1], y: [28, 0] }, { duration: 0.75, ease: easeOut })
  }, { margin: '0px 0px -10% 0px' })

  // Motion: a press you can feel.
  press('.btn', (el) => {
    animate(el, { scale: 0.96 }, { duration: 0.08 })
    return () => animate(el, { scale: 1 }, { type: 'spring', stiffness: 520, damping: 24 })
  })

  const mm = gsap.matchMedia()
  const ctx = gsap.context(() => {
    // The light beam breathes.
    gsap.to('[data-beam]', { opacity: 0.45, rotate: 2, duration: 5, yoyo: true, repeat: -1, ease: 'sine.inOut' })

    // The board tips up into place as it scrolls in: the 3D entrance of the product screen.
    gsap.fromTo(
      '.board',
      { rotateX: 26, scale: 0.9, y: 30, transformPerspective: 1600 },
      { rotateX: 0, scale: 1, y: 0, ease: 'none', scrollTrigger: { trigger: '.stage', start: 'top 92%', end: 'top 22%', scrub: 0.6 } },
    )

    // Cubes turn slowly in 3D, each at its own pace.
    $$('[data-cube]').forEach((c, i) => {
      gsap.to(c, { rotationY: '+=360', duration: 18 + i * 4, repeat: -1, ease: 'none' })
      gsap.to(c, { rotationX: i % 2 ? 18 : -38, duration: 6 + i, yoyo: true, repeat: -1, ease: 'sine.inOut' })
    })

    // Circuit: wires draw in, then light pulses run along them into the chip.
    const wires = $$<SVGPathElement>('[data-wire]')
    // pathLength="100" on every wire: the dashes hold however the wires get re-drawn on resize.
    gsap.set(wires, { strokeDasharray: 100, strokeDashoffset: 100 })
    gsap.to(wires, { strokeDashoffset: 0, duration: 1.1, stagger: 0.12, ease: 'power2.inOut', scrollTrigger: { trigger: '[data-circuit]', start: 'top 70%', once: true } })
    // One pulse per agent, in turn: the agent lights up, its pulse runs, the chip flashes on arrival.
    const nodes = $$('.node')
    const chip = document.querySelector('[data-chip]')
    const pulses = $$<SVGPathElement>('[data-pulse]')
    const circuitLoop = gsap.timeline({ repeat: -1, delay: 1.4 })
    pulses.forEach((p, i) => {
      gsap.set(p, { strokeDasharray: '9 100', strokeDashoffset: 9 })
      const at = i * 1.1
      circuitLoop
        .call(() => nodes[i]?.classList.add('live'), undefined, at)
        .fromTo(p, { strokeDashoffset: 9 }, { strokeDashoffset: -100, duration: 1.6, ease: 'power1.in', immediateRender: false }, at)
        .call(() => { nodes[i]?.classList.remove('live'); chip?.classList.add('hit') }, undefined, at + 1.45)
        .call(() => chip?.classList.remove('hit'), undefined, at + 1.8)
    })
    circuitLoop.to({}, { duration: 0.6 })
    gsap.from('[data-chip]', { scale: 0.6, opacity: 0, duration: 1, ease: 'back.out(1.8)', scrollTrigger: { trigger: '[data-circuit]', start: 'top 70%', once: true } })

    // Feature cards float, each on its own rhythm.
    $$('[data-float]').forEach((el, i) => {
      gsap.to(el, { y: i % 2 ? 14 : -14, duration: 3.2 + (i % 3) * 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: i * 0.3 })
    })

    // Feature cards start as a tilted pile in the middle and scatter to their places as you scroll.
    // xPercent/yPercent and rotation, so the float (y) and the pointer tilt (rotationX/Y) still apply.
    mm.add('(min-width: 901px)', () => {
      const box = document.querySelector<HTMLElement>('.floaty')
      const cards = $$('.floaty .fcard')
      if (!box || !cards.length) return
      const tilt = [-7, 5, -3, 6, -5, 4]
      const pile = (el: HTMLElement, i: number, axis: 'x' | 'y') => {
        const w = el.offsetWidth
        const h = Math.max(...cards.map((c) => c.offsetHeight))
        const col = (i % 3) - 1
        const row = Math.floor(i / 3)
        if (axis === 'x') return ((box.clientWidth / 2 + col * w * 0.95 + (row ? 0.1 : -0.1) * w - (el.offsetLeft + w / 2)) / w) * 100
        return ((box.clientHeight / 2 + (row - 0.5) * h * 0.92 - (el.offsetTop + el.offsetHeight / 2)) / el.offsetHeight) * 100
      }
      gsap.fromTo(
        cards,
        {
          xPercent: (i: number, el: HTMLElement) => pile(el, i, 'x'),
          yPercent: (i: number, el: HTMLElement) => pile(el, i, 'y'),
          rotation: (i: number) => tilt[i % tilt.length],
          scale: 0.94,
        },
        { xPercent: 0, yPercent: 0, rotation: 0, scale: 1, ease: 'power2.inOut', scrollTrigger: { trigger: box, start: 'top 75%', end: 'center 45%', scrub: 0.9, invalidateOnRefresh: true } },
      )
    })

    // The protocol orbits the portal; the pills counter-rotate so they stay upright.
    mm.add('(min-width: 641px)', () => {
      gsap.to('[data-orbit]', { rotation: 360, duration: 70, repeat: -1, ease: 'none' })
      gsap.to('[data-orbit] span', { rotation: -360, duration: 70, repeat: -1, ease: 'none' })
    })

    // Hero sides: depth parallax on the pointer, and a slow drift otherwise.
    const zone = document.querySelector<HTMLElement>('[data-hero-zone]')
    const layers = $$('[data-depth]')
    layers.forEach((el, i) => gsap.to(el, { y: i % 2 ? 12 : -12, duration: 4 + i, yoyo: true, repeat: -1, ease: 'sine.inOut' }))
    if (zone && finePointer) {
      const movers = layers.map((el) => ({ el, d: Number(el.dataset.depth) || 1, x: gsap.quickTo(el, 'x', { duration: 0.8, ease: 'power3' }), r: gsap.quickTo(el, 'rotationY', { duration: 0.8, ease: 'power3' }) }))
      zone.addEventListener('pointermove', (e) => {
        const nx = e.clientX / window.innerWidth - 0.5
        for (const m of movers) {
          m.x(nx * 40 * m.d)
          m.r(nx * 18 * m.d)
        }
      })
    }

    // 3D tilt under the pointer, with a light that follows it.
    if (finePointer) {
      for (const el of $$('[data-tilt3d]')) {
        const rx = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3' })
        const ry = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3' })
        gsap.set(el, { transformPerspective: 900 })
        el.addEventListener('pointermove', (e) => {
          const r = el.getBoundingClientRect()
          const px = (e.clientX - r.left) / r.width
          const py = (e.clientY - r.top) / r.height
          rx((0.5 - py) * 10)
          ry((px - 0.5) * 12)
          el.style.setProperty('--gx', px * 100 + '%')
          el.style.setProperty('--gy', py * 100 + '%')
          el.classList.add('lit')
        })
        el.addEventListener('pointerleave', () => {
          rx(0)
          ry(0)
          el.classList.remove('lit')
        })
      }
    }
  })

  livingLoops()

  // Re-measure after fonts and load: positions measured against the fallback font are wrong.
  const remeasure = () => ScrollTrigger.refresh()
  if (document.fonts?.ready) document.fonts.ready.then(remeasure).catch(() => {})
  if (document.readyState !== 'complete') window.addEventListener('load', remeasure, { once: true })

  // The floor under all of it: whatever went wrong above, nothing in view stays invisible.
  window.setTimeout(() => {
    for (const el of hidden) {
      if (el.getBoundingClientRect().top < window.innerHeight && Number(getComputedStyle(el).opacity) < 0.05) {
        el.style.opacity = '1'
        el.style.transform = 'none'
      }
    }
    for (const p of $$<SVGPathElement>('[data-wire], [data-line]')) {
      if (p.getBoundingClientRect().top < window.innerHeight) p.style.strokeDashoffset = '0'
    }
  }, 3500)

  if (import.meta.hot) import.meta.hot.dispose(() => { ctx.revert(); mm.revert() })
}

// ── loops: the page keeps working while you read it ──────────────────────────────────────────
// Every loop only changes what is already in the HTML (order, highlight, a number), so a reader
// with JavaScript off, or with reduced motion, gets the same content standing still.

function every(ms: number, fn: () => void): void {
  window.setInterval(() => { if (!document.hidden) fn() }, ms)
}

// Highlight one element at a time, round and round.
function cycle(els: Element[], ms: number, cls = 'live'): void {
  if (!els.length) return
  let i = 0
  els[0].classList.add(cls)
  every(ms, () => {
    els[i].classList.remove(cls)
    i = (i + 1) % els.length
    els[i].classList.add(cls)
  })
}

function livingLoops(): void {
  const easeOut = [0.16, 1, 0.3, 1] as const

  // A light that follows the pointer across the whole page.
  const spot = document.querySelector<HTMLElement>('[data-spot]')
  if (spot && finePointer) {
    window.addEventListener('pointermove', (e) => {
      spot.style.setProperty('--mx', e.clientX + 'px')
      spot.style.setProperty('--my', e.clientY + 'px')
    }, { passive: true })
  }

  // The chart breathes: both lines morph between two shapes, and the point rides the second line
  // with its tooltip.
  const [la, lb] = $$<SVGPathElement>('[data-line]')
  const pt = document.querySelector<SVGCircleElement>('.chart .pt')
  const tip = document.querySelector<HTMLElement>('.chart .tip')
  const svg = pt?.ownerSVGElement
  if (la && lb && pt && tip && svg) {
    const alt = {
      a: 'M0 100 C40 120 60 70 100 60 S160 100 200 80 S260 40 300 30 S360 70 420 50',
      b: 'M0 110 C40 100 70 80 110 70 S170 60 210 40 S280 90 320 70 S380 30 420 40',
    }
    const days = ['1 Nov', '2 Nov', '3 Nov', '4 Nov', '5 Nov', '6 Nov']
    const ride = { t: 0.2 }
    const place = () => {
      const p = lb.getPointAtLength(ride.t * lb.getTotalLength())
      pt.setAttribute('cx', String(p.x))
      pt.setAttribute('cy', String(p.y))
      const box = svg.getBoundingClientRect()
      const host = tip.offsetParent?.getBoundingClientRect()
      if (!host || !box.width) return
      tip.style.left = box.left - host.left + (p.x / 420) * box.width - tip.offsetWidth / 2 + 'px'
      tip.style.top = box.top - host.top + (p.y / 150) * box.height - tip.offsetHeight - 12 + 'px'
      const n = Math.round(10 + (150 - p.y) / 6)
      tip.textContent = days[Math.min(days.length - 1, Math.floor(ride.t * days.length))] + ' · ' + n + ' sessions'
    }
    // Once the lines have drawn, drop the dash so a longer morphed line is never cut short.
    window.setTimeout(() => {
      for (const p of [la, lb]) p.style.strokeDasharray = 'none'
      gsap.to(la, { attr: { d: alt.a }, duration: 4, yoyo: true, repeat: -1, ease: 'sine.inOut' })
      gsap.to(lb, { attr: { d: alt.b }, duration: 5, yoyo: true, repeat: -1, ease: 'sine.inOut' })
      gsap.to(ride, { t: 0.85, duration: 6, yoyo: true, repeat: -1, ease: 'sine.inOut', onUpdate: place })
    }, 3200)
  }

  // Guard counters tick: something is always being allowed, now and then something is denied.
  const [denied, allowed] = $$('.stack b')
  const bump = (el: HTMLElement | undefined) => {
    if (!el) return
    el.textContent = String(Number(el.textContent) + 1)
    el.classList.add('bump')
    animate(el, { scale: [1.5, 1] }, { type: 'spring', stiffness: 400, damping: 12 })
    window.setTimeout(() => el.classList.remove('bump'), 500)
  }
  every(1700, () => bump(allowed))
  every(6100, () => bump(denied))

  // The brief in the terminal types itself out, line by line, then starts again.
  const lines = $$('[data-typer] .tl')
  if (lines.length) {
    gsap.set(lines, { clipPath: 'inset(0 100% 0 0)' })
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.4, scrollTrigger: { trigger: '[data-typer]', start: 'top 85%', toggleActions: 'play pause resume pause' } })
    for (const l of lines) {
      const n = Math.max(4, (l.textContent || '').length)
      tl.to(l, { clipPath: 'inset(0 0% 0 0)', duration: n * 0.028, ease: `steps(${n})` }, '+=0.12')
    }
    tl.to(lines, { opacity: 0, duration: 0.5 }, '+=2.6').set(lines, { clipPath: 'inset(0 100% 0 0)', opacity: 1 })
  }

  // Claims arrive one message at a time, like a live board.
  const msgs = $$('.msgs .msg')
  if (msgs.length) {
    gsap.set(msgs, { opacity: 0, y: 24, scale: 0.96 })
    const tl = gsap.timeline({ repeat: -1, scrollTrigger: { trigger: '.msgs', start: 'top 90%', toggleActions: 'play pause resume pause' } })
    msgs.forEach((m) => tl.to(m, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.6)' }, '+=0.9'))
    tl.to(msgs, { opacity: 0, y: -16, duration: 0.5, stagger: 0.08 }, '+=2.4').set(msgs, { y: 24, scale: 0.96 })
  }

  // The two hero cards change what they show: a stream of verified logs, a stream of denials.
  const feeds: Record<string, string[][]> = {
    log: [
      ['2026-11-05 · claude-opus-5', 'npm test → 330 passing'],
      ['2026-11-05 · codex-5.6', 'godkit verify → 0 problems'],
      ['2026-11-06 · gemini-3-pro', 'pnpm build → ok'],
      ['2026-11-06 · cursor-composer-2', 'claim released · lib/map/*'],
    ],
    deny: [
      ['git push --force origin main', 'use --force-with-lease'],
      ['git reset --hard HEAD~3', 'commit or stash first'],
      ['edit lib/auth/token.js', 'inside claude-opus-5\'s claim'],
      ['rm -rf .agent', 'shared memory is protected'],
    ],
  }
  for (const [kind, rows] of Object.entries(feeds)) {
    const card = document.querySelector<HTMLElement>('.float-card.' + kind)
    if (!card) continue
    const code = card.querySelector('code')
    const note = card.querySelector('.fc-t')
    let i = 0
    every(kind === 'log' ? 3400 : 4100, () => {
      i = (i + 1) % rows.length
      animate([code, note].filter(Boolean) as Element[], { opacity: [1, 0], y: [0, -6] }, { duration: 0.25 }).then(() => {
        if (kind === 'log') { note!.textContent = rows[i][0]; code!.textContent = rows[i][1] } else { code!.textContent = rows[i][0]; note!.textContent = rows[i][1] }
        animate([code, note].filter(Boolean) as Element[], { opacity: [0, 1], y: [6, 0] }, { duration: 0.4, ease: easeOut })
      })
    })
  }

  // Highlights walk the protocol, the commands and the host table.
  cycle($$('[data-orbit] li'), 1300)
  cycle($$('.cmds .cmd'), 1500)
  cycle($$('.matrix tbody tr'), 1800)

  // KPI deltas pulse in turn, so the dashboard never sits still.
  const deltas = $$('.kpis .delta')
  deltas.forEach((d, i) => gsap.to(d, { y: -3, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: i * 0.3 }))

  // The stage floats a little once it has tipped into place.
  gsap.to('.stage', { y: -10, duration: 4.5, yoyo: true, repeat: -1, ease: 'sine.inOut' })
}
