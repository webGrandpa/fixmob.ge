document.addEventListener('DOMContentLoaded', () => {
    const root = document.documentElement;
    const { gsap, ScrollTrigger, Lenis } = window;
    const hasGsap = !!(gsap && ScrollTrigger);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    if (hasGsap) gsap.registerPlugin(ScrollTrigger);

    // The intro always starts at the top; restored mid-page positions would also
    // be measured before layout settles and throw the scroll scenes off.
    const initialHash = window.location.hash;
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    // ================================
    // 1. Smooth scrolling (Lenis, synced with GSAP)
    // ================================
    let lenis = null;
    if (Lenis && hasGsap && !prefersReducedMotion) {
        lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, smoothWheel: true });
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((time) => lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);
        lenis.stop();
    }

    // ================================
    // 2. Preloader — waits for page load and the 3D phone (with a hard cap)
    // ================================
    const countEl = document.getElementById('preloader-count');
    const barEl = document.getElementById('preloader-bar');
    const wantsPhone = root.classList.contains('webgl');
    let pageLoaded = document.readyState === 'complete';
    let phoneReady = !wantsPhone;
    let finished = false;
    let shown = 0;
    const startedAt = performance.now();

    window.addEventListener('load', () => { pageLoaded = true; });
    // Web fonts change heading heights — re-measure scroll scenes once they land.
    document.fonts?.ready.then(() => hasGsap && ScrollTrigger.refresh());
    window.addEventListener('phone:ready', () => { phoneReady = true; });

    function finishLoading() {
        if (finished) return;
        finished = true;
        // 3D never arrived — fall back to the static hero image.
        if (!root.classList.contains('webgl-ready')) root.classList.remove('webgl');
        root.classList.add('is-loaded');
        if (lenis) lenis.start();
        if (hasGsap) ScrollTrigger.refresh();
        const target = initialHash.length > 1 && document.querySelector(initialHash);
        if (target) {
            if (lenis) lenis.scrollTo(target, { offset: -90, immediate: true });
            else target.scrollIntoView();
        }
    }

    (function tickLoader() {
        const elapsed = performance.now() - startedAt;
        const ready = pageLoaded && phoneReady && elapsed > 900;
        const timedOut = elapsed > 4500;
        const target = ready || timedOut ? 100 : Math.min(92, (elapsed / 2200) * 92);
        shown += (target - shown) * (ready || timedOut ? 0.22 : 0.08);
        if (countEl) countEl.textContent = Math.round(shown);
        if (barEl) barEl.style.transform = `scaleX(${shown / 100})`;
        if (shown > 99.5 && (ready || timedOut)) {
            if (countEl) countEl.textContent = '100';
            setTimeout(finishLoading, 180);
            return;
        }
        requestAnimationFrame(tickLoader);
    })();

    // ================================
    // 3. Hamburger Menu
    // ================================
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const mobileNav = document.getElementById('mobile-nav');

    function closeMobileNav() {
        if (!hamburgerBtn || !mobileNav || !mobileNav.classList.contains('open')) return;
        hamburgerBtn.classList.remove('active');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        mobileNav.classList.remove('open');
        document.body.style.overflow = '';
        if (lenis) lenis.start();
    }

    if (hamburgerBtn && mobileNav) {
        hamburgerBtn.addEventListener('click', () => {
            const isOpen = hamburgerBtn.classList.toggle('active');
            hamburgerBtn.setAttribute('aria-expanded', isOpen);
            mobileNav.classList.toggle('open', isOpen);
            document.body.style.overflow = isOpen ? 'hidden' : '';
            if (lenis) isOpen ? lenis.stop() : lenis.start();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMobileNav();
    });

    // ================================
    // 4. Anchor links (smooth, header-aware)
    // ================================
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', (e) => {
            const id = anchor.getAttribute('href');
            if (id === '#' || id.length < 2) return;
            const target = document.querySelector(id);
            if (!target) return;
            e.preventDefault();
            const wasOpen = mobileNav?.classList.contains('open');
            closeMobileNav();
            const go = () => {
                if (lenis) lenis.scrollTo(target, { offset: -90, duration: 1.6 });
                else target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
            };
            // Let the menu's clip-path start closing before the page moves.
            wasOpen ? setTimeout(go, 250) : go();
        });
    });

    // ================================
    // 5. Scroll-linked chrome: header, progress, back-to-top, dock
    // ================================
    const header = document.getElementById('header');
    const progressBar = document.getElementById('scroll-progress');
    const backToTop = document.getElementById('back-to-top');
    const dock = document.getElementById('dock');
    let lastY = window.scrollY;

    function onScroll() {
        const y = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const goingDown = y > lastY;

        if (header) {
            header.classList.toggle('scrolled', y > 40);
            const navOpen = mobileNav?.classList.contains('open');
            if (!navOpen && Math.abs(y - lastY) > 4) {
                header.classList.toggle('is-hidden', goingDown && y > 400);
            }
        }
        if (progressBar && max > 0) progressBar.style.transform = `scaleX(${y / max})`;
        const pastHero = y > window.innerHeight * 0.8;
        backToTop?.classList.toggle('visible', pastHero);
        dock?.classList.toggle('is-visible', pastHero);
        lastY = y;
    }

    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            onScroll();
            ticking = false;
        });
    }, { passive: true });
    onScroll();

    backToTop?.addEventListener('click', () => {
        if (lenis) lenis.scrollTo(0, { duration: 2 });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ================================
    // 6. Split headings into words (for the rise-in reveal)
    // ================================
    document.querySelectorAll('[data-split]').forEach((el) => {
        const words = el.textContent.trim().split(/\s+/);
        el.setAttribute('aria-label', words.join(' '));
        el.textContent = '';
        words.forEach((word, i) => {
            const outer = document.createElement('span');
            outer.className = 'split-w';
            outer.setAttribute('aria-hidden', 'true');
            const inner = document.createElement('span');
            inner.textContent = word;
            inner.style.setProperty('--i', i);
            outer.appendChild(inner);
            el.appendChild(outer);
            if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
        });
    });

    // ================================
    // 7. Reveal on scroll
    // ================================
    const revealEls = document.querySelectorAll('[data-reveal], [data-split]');
    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
        revealEls.forEach((el) => el.classList.add('is-in'));
    } else {
        const revealObserver = new IntersectionObserver((entries) => {
            entries
                .filter((entry) => entry.isIntersecting)
                .forEach((entry, i) => {
                    entry.target.style.setProperty('--d', `${Math.min(i, 5) * 0.08}s`);
                    entry.target.classList.add('is-in');
                    revealObserver.unobserve(entry.target);
                });
        }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
        revealEls.forEach((el) => revealObserver.observe(el));
    }

    // ================================
    // 8. Counters
    // ================================
    const counters = document.querySelectorAll('[data-count]');
    if (counters.length && !prefersReducedMotion && hasGsap) {
        counters.forEach((el) => {
            const end = parseFloat(el.dataset.count);
            const suffix = el.dataset.suffix || '';
            const state = { v: 0 };
            el.textContent = '0' + suffix;
            ScrollTrigger.create({
                trigger: el,
                start: 'top 88%',
                once: true,
                onEnter: () => {
                    gsap.to(state, {
                        v: end,
                        duration: 2.2,
                        ease: 'power3.out',
                        onUpdate: () => { el.textContent = Math.round(state.v) + suffix; },
                    });
                },
            });
        });
    }

    // ================================
    // 9. Pointer effects: spotlight, tilt, magnetic, cursor
    // ================================
    if (finePointer && !prefersReducedMotion) {
        document.querySelectorAll('[data-spotlight]').forEach((card) => {
            card.addEventListener('pointermove', (e) => {
                const r = card.getBoundingClientRect();
                card.style.setProperty('--mx', `${e.clientX - r.left}px`);
                card.style.setProperty('--my', `${e.clientY - r.top}px`);
            });
        });

        document.querySelectorAll('[data-tilt]').forEach((card) => {
            card.addEventListener('pointermove', (e) => {
                const r = card.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width - 0.5;
                const py = (e.clientY - r.top) / r.height - 0.5;
                card.style.setProperty('--rx', `${(-py * 6).toFixed(2)}deg`);
                card.style.setProperty('--ry', `${(px * 6).toFixed(2)}deg`);
            });
            card.addEventListener('pointerleave', () => {
                card.style.setProperty('--rx', '0deg');
                card.style.setProperty('--ry', '0deg');
            });
        });

        if (hasGsap) {
            document.querySelectorAll('[data-magnetic]').forEach((el) => {
                const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
                const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
                el.addEventListener('pointermove', (e) => {
                    const r = el.getBoundingClientRect();
                    xTo((e.clientX - r.left - r.width / 2) * 0.28);
                    yTo((e.clientY - r.top - r.height / 2) * 0.38);
                });
                el.addEventListener('pointerleave', () => {
                    xTo(0);
                    yTo(0);
                });
            });

            const cursor = document.querySelector('.cursor');
            if (cursor) {
                const ring = cursor.querySelector('.cursor__ring');
                const dot = cursor.querySelector('.cursor__dot');
                const ringX = gsap.quickTo(ring, 'x', { duration: 0.5, ease: 'power3.out' });
                const ringY = gsap.quickTo(ring, 'y', { duration: 0.5, ease: 'power3.out' });
                const dotX = gsap.quickTo(dot, 'x', { duration: 0.08 });
                const dotY = gsap.quickTo(dot, 'y', { duration: 0.08 });
                window.addEventListener('pointermove', (e) => {
                    cursor.classList.add('is-active');
                    ringX(e.clientX);
                    ringY(e.clientY);
                    dotX(e.clientX);
                    dotY(e.clientY);
                }, { passive: true });
                document.addEventListener('pointerleave', () => cursor.classList.remove('is-active'));
                document.addEventListener('pointerover', (e) => {
                    cursor.classList.toggle('is-hover', !!e.target.closest('a, button, [data-tilt]'));
                });
            }
        }
    }

    // ================================
    // 10. Marquee: seamless loop + scroll-velocity skew
    // ================================
    document.querySelectorAll('[data-marquee]').forEach((row) => {
        const track = row.querySelector('.marquee__track');
        if (!track) return;
        const clone = track.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        row.appendChild(clone);
    });

    const marquee = document.querySelector('.marquee');
    if (marquee && lenis) {
        let skew = 0;
        gsap.ticker.add(() => {
            const targetSkew = Math.max(-10, Math.min(10, (lenis.velocity || 0) * -0.35));
            skew += (targetSkew - skew) * 0.12;
            marquee.style.setProperty('--skew', `${skew.toFixed(2)}deg`);
        });
    }

    // ================================
    // 11. Scroll-scrubbed scenes (GSAP)
    // ================================
    if (hasGsap && !prefersReducedMotion) {
        // About image: clip-path opening + inner parallax
        const frame = document.querySelector('[data-clip-reveal]');
        if (frame) {
            gsap.fromTo(frame,
                { clipPath: 'inset(16% 12% 16% 12% round 28px)' },
                {
                    clipPath: 'inset(0% 0% 0% 0% round 28px)',
                    ease: 'none',
                    scrollTrigger: { trigger: frame, start: 'top 95%', end: 'center 55%', scrub: 0.6 },
                }
            );
            const img = frame.querySelector('[data-parallax-img]');
            if (img) {
                gsap.fromTo(img, { yPercent: -10 }, {
                    yPercent: 0,
                    ease: 'none',
                    scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true },
                });
            }
        }

        // Why cards: each card recedes as the next one stacks over it
        const cards = gsap.utils.toArray('.why-card');
        cards.forEach((card, i) => {
            const next = cards[i + 1];
            if (!next) return;
            gsap.to(card, {
                scale: 0.93,
                filter: 'brightness(0.6)',
                ease: 'none',
                scrollTrigger: { trigger: next, start: 'top 75%', end: 'top 20%', scrub: true },
            });
        });

        // Footer wordmark rises in
        const mark = document.querySelectorAll('.footer__mark span');
        if (mark.length) {
            gsap.from(mark, {
                yPercent: 60,
                opacity: 0,
                stagger: 0.12,
                duration: 1.4,
                ease: 'expo.out',
                scrollTrigger: { trigger: '.footer__mark', start: 'top 92%' },
            });
        }

        // Highlight the nav link of the section in view
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach((link) => {
            const section = document.querySelector(link.getAttribute('href'));
            if (!section) return;
            ScrollTrigger.create({
                trigger: section,
                start: 'top 50%',
                end: 'bottom 50%',
                onToggle: (self) => link.classList.toggle('is-current', self.isActive),
            });
        });
    }
});
