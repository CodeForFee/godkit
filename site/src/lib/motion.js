import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// Every scene here carries an idea the static page can only assert. Decoration that survives
// being deleted does not belong in this file.

const q = (sel, root = document) => Array.from(root.querySelectorAll(sel))

const HIDDEN = '[data-a], [data-h], [data-step], [data-wv], [data-gate]'

export function init() {
  document.documentElement.classList.add('ready')

  // Reduced motion, or no JS at all: the page is already the finished document, because nothing
  // in the stylesheet hides it. Only this function ever hides anything, and only to animate it
  // back a moment later.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}

  // Hide from HERE, not from CSS. If this module never loads the page still reads; if it does,
  // the from-state is applied in the same frame the tweens are built, so there is no flash.
  gsap.set(HIDDEN, { opacity: 0 })
  gsap.set('[data-wire]', { strokeDashoffset: 200 })

  const ctx = gsap.context(() => {
    // ── hero: one entrance, then it never moves again ──────────────────────
    gsap
      .timeline({ defaults: { ease: 'power3.out' } })
      .from('[data-h="mark"]', { opacity: 0, scale: 0.6, rotate: -20, duration: 0.9 })
      .from('[data-h="eyebrow"]', { opacity: 0, y: 12, duration: 0.6 }, '-=0.55')
      .from('[data-h="title"]', { opacity: 0, y: 40, duration: 1 }, '-=0.4')
      .from('[data-h="sub"]', { opacity: 0, y: 20, duration: 0.8 }, '-=0.7')
      .from('[data-h="actions"] > *', { opacity: 0, y: 16, stagger: 0.09, duration: 0.6 }, '-=0.55')
      .from('[data-h="stats"] li', { opacity: 0, y: 18, stagger: 0.08, duration: 0.6 }, '-=0.4')
      .from('[data-anim="glow"]', { opacity: 0, scale: 0.75, duration: 1.6, stagger: 0.2 }, 0)

    // ── generic reveals ────────────────────────────────────────────────────
    q('[data-a]').forEach((el) => {
      gsap.from(el, {
        opacity: 0,
        y: 26,
        duration: 0.75,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 88%' },
      })
    })

    // ── the scene that IS the product ──────────────────────────────────────
    // Left: three private stores drift apart and dim - they cannot reach each other.
    // Right: three wires draw downward and land on one committed directory.
    // Scrubbed, so the reader controls the pace and can hold it still to read.
    const scene = document.querySelector('[data-scene]')
    if (scene) {
      gsap
        .timeline({
          scrollTrigger: { trigger: scene, start: 'top 78%', end: 'bottom 65%', scrub: 0.7 },
        })
        .to('[data-drift]', {
          xPercent: (i) => [-22, 0, 22][i],
          opacity: 0.28,
          duration: 1,
          ease: 'power1.inOut',
        })
        .to('[data-wire]', { strokeDashoffset: 0, duration: 1.2, stagger: 0.12, ease: 'none' }, 0)
        .from('[data-hub]', { opacity: 0, y: -10, scale: 0.9, duration: 0.6, ease: 'back.out(2.2)' }, 0.85)
    }

    // ── the workflow: a pulse travels the track as the six steps land ──────
    const flowEl = document.querySelector('[data-flow]')
    if (flowEl) {
      gsap
        .timeline({ scrollTrigger: { trigger: flowEl, start: 'top 76%' } })
        .from(q('[data-step]', flowEl), {
          opacity: 0,
          y: 30,
          scale: 0.96,
          duration: 0.55,
          stagger: 0.11,
          ease: 'power2.out',
        })
        .fromTo(
          '[data-pulse]',
          { xPercent: 0, opacity: 0 },
          { opacity: 1, duration: 0.25 },
          0.15,
        )
        .to('[data-pulse]', { left: '100%', xPercent: -100, duration: 1.5, ease: 'power1.inOut' }, 0.3)
        .to('[data-pulse]', { opacity: 0, duration: 0.35 }, '-=0.2')

      // and once more, slowly, whenever the section is on screen - the protocol is a loop
      gsap.to('[data-pulse]', {
        keyframes: [{ opacity: 0.9, duration: 0.3 }, { left: '100%', xPercent: -100, duration: 2.6 }, { opacity: 0, duration: 0.3 }],
        repeat: -1,
        repeatDelay: 1.6,
        ease: 'none',
        scrollTrigger: { trigger: flowEl, start: 'top 60%', end: 'bottom 25%', toggleActions: 'play pause resume pause' },
      })
    }

    // ── waves land in order, and each gate pulses as work passes through ───
    const waves = document.querySelector('[data-waves]')
    if (waves) {
      gsap
        .timeline({ scrollTrigger: { trigger: waves, start: 'top 82%' } })
        .from(q('[data-wv], [data-gate]', waves), {
          opacity: 0,
          y: 18,
          scale: 0.95,
          duration: 0.45,
          stagger: 0.14,
          ease: 'back.out(1.6)',
        })
        .fromTo(
          q('[data-gate]', waves),
          { boxShadow: '0 0 0 0 rgba(251,191,36,0)' },
          {
            boxShadow: '0 0 0 7px rgba(251,191,36,0.14)',
            duration: 0.45,
            stagger: 0.2,
            repeat: 1,
            yoyo: true,
            ease: 'sine.inOut',
          },
          '-=0.15',
        )
    }

    // ── the glows drift on scroll: depth, and it costs nothing ─────────────
    gsap.to('.glow-a', {
      yPercent: 22,
      ease: 'none',
      scrollTrigger: { trigger: 'main', start: 'top bottom', end: 'bottom top', scrub: 1.2 },
    })
    gsap.to('.glow-b', {
      yPercent: -28,
      ease: 'none',
      scrollTrigger: { trigger: 'main', start: 'top bottom', end: 'bottom top', scrub: 1.2 },
    })
  })

  ScrollTrigger.refresh()
  return () => ctx.revert()
}
