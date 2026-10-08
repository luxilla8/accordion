/*!
 * <accordion-group> v2.1.0
 * A small, accessible accordion built on native <details>/<summary>.
 * MIT License · https://github.com/luxilla8/accordion
 */
(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const EASING = 'cubic-bezier(.2, .8, .2, 1)';
  const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

  // A damped spring (ratio 0.6, ~9% overshoot) sampled into a linear() curve.
  const SPRING = CSS.supports('transition-timing-function', 'linear(0, 1)')
    ? 'linear(0, 0.047, 0.163, 0.315, 0.478, 0.634, 0.771, 0.884, 0.97, 1.031, 1.07, 1.089, '
      + '1.095, 1.09, 1.079, 1.064, 1.049, 1.034, 1.021, 1.011, 1.003, 0.997, 0.993, 0.991, '
      + '0.991, 0.991, 0.993, 0.994, 0.995, 0.997, 0.998, 0.999, 1)'
    : 'cubic-bezier(.34, 1.56, .64, 1)';

  const autoDuration = (distance) => Math.min(520, 180 + distance * 0.5);

  /*
   * Animation presets, chosen with the `animation` attribute.
   * Each one sets how the height moves (`easing`, `duration` from the distance
   * in px) and how panel content arrives (`enter`, called once per panel with
   * the timing to use; it returns the Animation objects it starts).
   * Add your own: AccordionGroup.animations.myPreset = { enter(panel, timing) {…} }
   */
  const ANIMATIONS = {
    slide: {
      enter: (panel, t) => panel.animate(
        { opacity: [0, 1], transform: ['translateY(-6px)', 'none'] },
        { ...t, duration: t.duration * 0.9, delay: t.duration * 0.1 },
      ),
    },
    fade: {
      enter: (panel, t) => panel.animate(
        { opacity: [0, 1] },
        { ...t, easing: 'ease-out', duration: t.duration * 0.85, delay: t.duration * 0.15 },
      ),
    },
    spring: {
      easing: SPRING,
      duration: (distance) => Math.min(820, 440 + distance * 0.4),
      enter: (panel, t) => [
        panel.animate({ transform: ['translateY(-16px) scale(.97)', 'none'] }, t),
        panel.animate({ opacity: [0, 1] }, { ...t, easing: 'ease-out', duration: t.duration * 0.4 }),
      ],
    },
    cascade: {
      duration: (distance) => Math.min(620, 240 + distance * 0.5),
      enter: (panel, t) => {
        const pieces = panel.children.length ? [...panel.children] : [panel];
        return pieces.map((el, i) => el.animate(
          { opacity: [0, 1], transform: ['translateY(12px)', 'none'] },
          { ...t, duration: t.duration * 0.8, delay: t.duration * 0.1 + Math.min(i, 8) * 70 },
        ));
      },
    },
    blur: {
      enter: (panel, t) => panel.animate(
        { opacity: [0, 1], filter: ['blur(10px)', 'blur(0)'], transform: ['scale(.985)', 'none'] },
        { ...t, easing: 'ease-out' },
      ),
    },
    none: null,
  };

  class AccordionGroup extends HTMLElement {
    static observedAttributes = ['multiple'];
    static animations = ANIMATIONS;

    // Where each item is heading. It can differ from `details.open`
    // while a close animation is still running.
    #target = new WeakMap();
    #animations = new WeakMap(); // height animation per item, while it runs
    #effects = new WeakMap(); // content animations per item (may outlast the height)
    #observer = null;

    connectedCallback() {
      this.#upgrade();
      this.addEventListener('click', this.#onClick);
      this.addEventListener('keydown', this.#onKeydown);
      // `toggle` doesn't bubble, so listen in the capture phase.
      this.addEventListener('toggle', this.#onToggle, true);
      window.addEventListener('hashchange', this.#onHashChange);
      this.#observer = new MutationObserver(() => this.#upgrade());
      this.#observer.observe(this, { childList: true, subtree: true });
      this.#openFromHash(false);
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.#onClick);
      this.removeEventListener('keydown', this.#onKeydown);
      this.removeEventListener('toggle', this.#onToggle, true);
      window.removeEventListener('hashchange', this.#onHashChange);
      this.#observer?.disconnect();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      // Switching to one-at-a-time: keep the first open item, close the rest.
      if (name === 'multiple' && newValue === null && oldValue !== null) {
        this.items.filter((d) => this.isOpen(d)).slice(1).forEach((d) => this.close(d));
      }
    }

    /* ---------- Public API ---------- */

    get multiple() { return this.hasAttribute('multiple'); }
    set multiple(value) { this.toggleAttribute('multiple', Boolean(value)); }

    /** The <details> elements this group owns (nested groups excluded). */
    get items() {
      return [...this.querySelectorAll('details')].filter(
        (d) => d.closest('accordion-group') === this && d.querySelector(':scope > summary'),
      );
    }

    isOpen(item) {
      const d = this.#resolve(item);
      if (!d) return false;
      return this.#target.has(d) ? this.#target.get(d) : d.open;
    }

    open(item) { this.toggle(item, true); }
    close(item) { this.toggle(item, false); }

    /** Toggle an item by element, index or id. `force` sets the state outright. */
    toggle(item, force) {
      const d = this.#resolve(item);
      if (d) this.#set(d, force ?? !this.isOpen(d), { exclusive: !this.multiple });
    }

    openAll() { this.items.forEach((d) => this.#set(d, true, { exclusive: false })); }
    closeAll() { this.items.forEach((d) => this.#set(d, false)); }

    /* ---------- Internals ---------- */

    #resolve(item) {
      if (item instanceof HTMLDetailsElement) return this.items.includes(item) ? item : null;
      if (typeof item === 'number') return this.items[item] ?? null;
      if (typeof item === 'string') return this.items.find((d) => d.id === item) ?? null;
      return null;
    }

    #upgrade() {
      const items = this.items;
      let seenOpen = false;
      for (const d of items) {
        // The native `name` attribute makes groups exclusive without JS.
        // Once we're running we take over, so the closing item can animate.
        if (d.hasAttribute('name')) d.removeAttribute('name');
        if (!this.multiple && d.open) {
          if (seenOpen) d.open = false;
          seenOpen = true;
        }
        if (!this.#target.has(d)) this.#target.set(d, d.open);
        d.dataset.state ??= d.open ? 'open' : 'closed';
      }
    }

    #set(d, open, { exclusive = false } = {}) {
      if (this.isOpen(d) === open) return;
      if (open && exclusive) {
        for (const other of this.items) if (other !== d) this.#set(other, false);
      }
      this.#target.set(d, open);
      d.dataset.state = open ? 'open' : 'closed';
      this.#animate(d, open);
      this.#announce(d, open);
    }

    #announce(d, open) {
      this.dispatchEvent(new CustomEvent('accordion-toggle', {
        bubbles: true,
        detail: { item: d, open, index: this.items.indexOf(d) },
      }));
    }

    #animate(d, open) {
      const summary = d.querySelector(':scope > summary');
      const panels = [...d.querySelectorAll(':scope > :not(summary)')];
      // Read the current state before cancelling, so an interrupted
      // animation reverses from wherever it is mid-flight.
      const start = d.getBoundingClientRect().height;
      const interrupted = this.#animations.has(d);
      const opacities = panels.map((panel) => Number(getComputedStyle(panel).opacity));
      this.#stop(d);

      const preset = this.#preset();
      if (!preset || reducedMotion.matches || !d.isConnected || start === 0) {
        d.open = open;
        return;
      }

      if (open) d.open = true;
      const borders = d.offsetHeight - d.clientHeight;
      const end = open ? d.scrollHeight + borders : summary.offsetHeight + borders;
      const distance = Math.abs(end - start);
      const duration = Number(this.getAttribute('duration'))
        || (preset.duration ?? autoDuration)(distance);
      const easing = this.getAttribute('easing') || preset.easing || EASING;

      d.style.overflow = 'clip';
      const height = d.animate({ height: [`${start}px`, `${end}px`] }, { duration, easing });
      this.#animations.set(d, height);

      const timing = { duration, easing, fill: 'backwards' };
      const effects = panels.flatMap((panel, i) => {
        if (!open) {
          return panel.animate(
            { opacity: [opacities[i], 0] },
            { duration: duration * 0.5, easing: 'ease-in', fill: 'forwards' },
          );
        }
        // Reversing a close: fade back from where it was, don't replay the entrance.
        if (interrupted) {
          return panel.animate({ opacity: [opacities[i], 1] }, { duration: duration * 0.5 });
        }
        return [].concat(preset.enter?.(panel, timing) ?? []);
      });
      this.#effects.set(d, effects);

      height.onfinish = () => {
        if (this.#animations.get(d) !== height) return;
        this.#animations.delete(d);
        d.style.overflow = '';
        if (!open) {
          d.open = false;
          this.#stop(d); // clear the faded-out content now that it's hidden
        }
      };
    }

    #preset() {
      const name = this.getAttribute('animation') || 'slide';
      if (name === 'none') return null;
      return AccordionGroup.animations[name] ?? AccordionGroup.animations.slide;
    }

    #stop(d) {
      this.#animations.get(d)?.cancel();
      this.#animations.delete(d);
      this.#effects.get(d)?.forEach((animation) => animation.cancel());
      this.#effects.delete(d);
    }

    #onClick = (event) => {
      const summary = event.target.closest('summary');
      if (!summary) return;
      // Let links and controls placed inside a summary do their own thing.
      const control = event.target.closest('a, button, input, select, textarea');
      if (control && summary.contains(control)) return;
      const d = summary.parentElement;
      if (!(d instanceof HTMLDetailsElement) || !this.items.includes(d)) return;
      event.preventDefault();
      this.toggle(d);
    };

    #onKeydown = (event) => {
      if (!NAV_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
      const summary = event.target.closest('summary');
      if (!summary) return;
      const summaries = this.items
        .filter((d) => !d.closest('[hidden], [inert]'))
        .map((d) => d.querySelector(':scope > summary'));
      const index = summaries.indexOf(summary);
      if (index === -1) return;
      event.preventDefault();
      const last = summaries.length - 1;
      const next = {
        ArrowDown: index === last ? 0 : index + 1,
        ArrowUp: index === 0 ? last : index - 1,
        Home: 0,
        End: last,
      }[event.key];
      summaries[next].focus();
    };

    // Catches state changes we didn't start: find-in-page, `details.open = x`.
    #onToggle = (event) => {
      const d = event.target;
      if (!(d instanceof HTMLDetailsElement) || !this.items.includes(d)) return;
      if (this.#animations.has(d) || this.#target.get(d) === d.open) return;
      this.#target.set(d, d.open);
      d.dataset.state = d.open ? 'open' : 'closed';
      if (d.open && !this.multiple) {
        for (const other of this.items) if (other !== d) this.#set(other, false);
      }
      this.#announce(d, d.open);
    };

    #onHashChange = () => this.#openFromHash(true);

    #openFromHash(scroll) {
      let id;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
      if (!id) return;
      const d = document.getElementById(id)?.closest('details');
      if (!d || !this.items.includes(d)) return;
      this.toggle(d, true);
      if (scroll) {
        d.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
        d.querySelector(':scope > summary').focus({ preventScroll: true });
      }
    }
  }

  if (!customElements.get('accordion-group')) {
    customElements.define('accordion-group', AccordionGroup);
  }
  window.AccordionGroup = AccordionGroup;
})();
