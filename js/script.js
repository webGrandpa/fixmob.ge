// script.js — Fixmob.ge Premium Interactions

document.addEventListener("DOMContentLoaded", () => {

    // ================================
    // 1. Loading Screen
    // ================================
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        window.addEventListener('load', () => {
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
            }, 600);
        });
        // Fallback: dismiss after 3s max
        setTimeout(() => {
            loadingScreen.classList.add('hidden');
        }, 3000);
    }

    // ================================
    // 2. Smooth Scroll (exclude lang switcher)
    // ================================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            // Skip language switcher links
            if (this.hasAttribute('data-lang')) return;

            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            e.preventDefault();

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                // Close mobile nav if open
                closeMobileNav();

                const headerHeight = document.querySelector('.header')?.offsetHeight || 70;
                const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - headerHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // ================================
    // 3. Hamburger Menu
    // ================================
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const mobileNav = document.getElementById('mobile-nav');

    function closeMobileNav() {
        if (hamburgerBtn && mobileNav) {
            hamburgerBtn.classList.remove('active');
            hamburgerBtn.setAttribute('aria-expanded', 'false');
            mobileNav.classList.remove('open');
            document.body.style.overflow = '';
        }
    }

    if (hamburgerBtn && mobileNav) {
        hamburgerBtn.addEventListener('click', () => {
            const isOpen = hamburgerBtn.classList.toggle('active');
            hamburgerBtn.setAttribute('aria-expanded', isOpen);
            mobileNav.classList.toggle('open');
            document.body.style.overflow = isOpen ? 'hidden' : '';
        });

        // Close mobile nav when a link is clicked
        mobileNav.querySelectorAll('.mobile-nav-link, .mobile-nav-cta').forEach(link => {
            link.addEventListener('click', () => {
                closeMobileNav();
            });
        });
    }

    // ================================
    // 4. Header Scroll Effect
    // ================================
    const header = document.getElementById('header');
    let lastScroll = 0;

    function handleHeaderScroll() {
        const currentScroll = window.pageYOffset;
        if (header) {
            if (currentScroll > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        }
        lastScroll = currentScroll;
    }

    // ================================
    // 5. Scroll Progress Bar
    // ================================
    const progressBar = document.getElementById('scroll-progress');

    function updateProgress() {
        if (!progressBar) return;
        const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const progress = (scrollTop / scrollHeight) * 100;
        progressBar.style.width = progress + '%';
    }

    // ================================
    // 6. Back to Top Button
    // ================================
    const backToTop = document.getElementById('back-to-top');

    function handleBackToTop() {
        if (!backToTop) return;
        if (window.pageYOffset > 400) {
            backToTop.classList.add('visible');
        } else {
            backToTop.classList.remove('visible');
        }
    }

    if (backToTop) {
        backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ================================
    // 7. Combined Scroll Handler (performance)
    // ================================
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                handleHeaderScroll();
                updateProgress();
                handleBackToTop();
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });

    // ================================
    // 8. Scroll Animations (Intersection Observer)
    // ================================
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!prefersReducedMotion) {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: "0px 0px -40px 0px"
        };

        const animObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-visible');
                    animObserver.unobserve(entry.target);
                }
            });
        }, observerOptions);

        document.querySelectorAll('.animate-on-scroll, .animate-scale').forEach(el => {
            animObserver.observe(el);
        });
    } else {
        // If reduced motion, make everything visible immediately
        document.querySelectorAll('.animate-on-scroll, .animate-scale').forEach(el => {
            el.classList.add('animate-visible');
        });
    }

    // ================================
    // 9. Counter Animation
    // ================================
    const counterElements = document.querySelectorAll('.stat-num[data-count]');

    if (counterElements.length > 0 && !prefersReducedMotion) {
        const counterObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const target = parseInt(el.getAttribute('data-count'));
                    const suffix = target >= 1000 ? 'k+' : '+';
                    const displayTarget = target >= 1000 ? target / 1000 : target;
                    const duration = 2000;
                    const increment = displayTarget / (duration / 16);
                    let current = 0;

                    const timer = setInterval(() => {
                        current += increment;
                        if (current >= displayTarget) {
                            current = displayTarget;
                            clearInterval(timer);
                        }
                        el.textContent = Math.floor(current) + suffix;
                    }, 16);

                    counterObserver.unobserve(el);
                }
            });
        }, { threshold: 0.5 });

        counterElements.forEach(el => counterObserver.observe(el));
    }

    // ================================
    // 10. Escape Key closes mobile nav
    // ================================
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMobileNav();
        }
    });

    // Trigger initial checks
    handleHeaderScroll();
    updateProgress();
    handleBackToTop();
});
