// The sky behind every page, drawn on one canvas: far, middle and near layers of stars that
// drift slowly, as in the app's StarField. On the homepage (data-sky="night") shooting stars
// also link stars into constellations, one star after another; the first chain leads to the
// Nkrabea mark, which then draws itself. Reduce-motion keeps one still frame.
(() => {
  const sky = document.querySelector('.sky');
  if (!sky) return;
  const root = document.documentElement;
  const night = sky.dataset.sky === 'night';
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const intro = night && root.classList.contains('intro');
  const mark = night ? document.querySelector('.mark svg') : null;

  const canvas = document.createElement('canvas');
  sky.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const GOLD = '242, 181, 68';
  const SUNSTAR = '251, 241, 220';
  const STARLIGHT = '#eee9ff';
  const LINE_ALPHA = 0.42;
  const STAR_AT = { x: 173.5, y: -173.5 }; // the guiding star's centre, on the ring at 45°, in the mark's units

  // Seeded (mulberry32), so the field looks the same on every visit; shooting stars use Math.random.
  const seeded = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const rand = Math.random;
  const between = (r, min, max) => min + r() * (max - min);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const clamp01 = (v) => clamp(v, 0, 1);
  const smooth = (p) => p * p * (3 - 2 * p);
  const easeOut = (p) => 1 - (1 - p) ** 3;
  const easeInOut = (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
  const backOut = (p) => 1 + 2.9 * (p - 1) ** 3 + 1.9 * (p - 1) ** 2;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const unit = (a, b) => {
    const d = dist(a, b) || 1;
    return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
  };
  const distToSegment = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };

  // ——— The field ———

  const LAYERS = [
    { per: 6500, r: [0.5, 1.0], o: [0.2, 0.45], period: 90000, amp: 10 },
    { per: 13000, r: [0.9, 1.4], o: [0.35, 0.65], period: 140000, amp: 22 },
    { per: 38000, r: [1.3, 2.0], o: [0.55, 0.9], period: 200000, amp: 38 },
  ];
  const offset = LAYERS.map(() => ({ x: 0, y: 0 }));
  let W = 0;
  let H = 0;
  let dpr = 1;
  let fieldWidth = -1;
  let stars = [];
  const figures = [];
  const meteors = [];
  let nextAt = Infinity; // the ambient sky begins once the intro has formed the mark
  let markAnim = null;
  let isFormed = !intro;

  function buildField() {
    const r = seeded(7);
    // Mobile toolbars resize the viewport while scrolling: keep one field tall enough for both.
    const h = Math.max(H, window.screen ? window.screen.height : 0);
    stars = [];
    LAYERS.forEach((layer, li) => {
      const count = Math.round(((W + layer.amp * 2) * (h + layer.amp * 2)) / layer.per);
      for (let i = 0; i < count; i++) {
        stars.push({
          x: r() * (W + layer.amp * 2) - layer.amp,
          y: r() * (h + layer.amp * 2) - layer.amp,
          r: between(r, ...layer.r),
          o: between(r, ...layer.o),
          layer: li,
          twinkle: 0,
          busy: false,
        });
      }
    });
    const bright = stars.filter((s) => s.layer > 0);
    for (let i = 0; i < Math.min(9, bright.length); i++) {
      const s = bright[Math.floor(r() * bright.length)];
      s.twinkle = between(r, 3500, 7000);
      s.phase = r() * Math.PI * 2;
    }
  }

  const at = (s) => ({ x: s.x + offset[s.layer].x, y: s.y + offset[s.layer].y });

  function resize() {
    W = sky.clientWidth;
    H = sky.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (W !== fieldWidth) {
      fieldWidth = W;
      buildField();
      // Figures were placed on the old field.
      figures.length = 0;
      meteors.length = 0;
      if (markAnim) finishMark();
    }
    if (still) draw(performance.now());
  }

  function draw(now) {
    if (!still) {
      LAYERS.forEach((layer, i) => {
        const wave = Math.sin((now / layer.period) * Math.PI * 2);
        offset[i].x = 0.3 * layer.amp * wave;
        offset[i].y = 0.5 * layer.amp * wave;
      });
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = STARLIGHT;
    for (const s of stars) {
      const p = at(s);
      if (p.x < -4 || p.x > W + 4 || p.y < -4 || p.y > H + 4) continue;
      let o = s.o;
      if (s.twinkle && !still) o *= 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((now / s.twinkle) * Math.PI * 2 + s.phase));
      ctx.globalAlpha = o;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (night && !still) {
      if (now >= nextAt) ambient(now);
      drawFigures(now);
      drawMeteors(now);
      if (markAnim) stepMark(now);
    }
  }

  // ——— Shooting stars and constellations ———

  function glow(p, radius, alpha) {
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    g.addColorStop(0, `rgba(${SUNSTAR}, ${alpha})`);
    g.addColorStop(0.35, `rgba(${GOLD}, ${0.35 * alpha})`);
    g.addColorStop(1, `rgba(${GOLD}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A bright head with a tail that fades back along the way it came. */
  function shootingStar(from, head, tail, alpha) {
    const back = unit(head, from);
    const end = { x: head.x + back.x * tail, y: head.y + back.y * tail };
    const g = ctx.createLinearGradient(head.x, head.y, end.x, end.y);
    g.addColorStop(0, `rgba(${SUNSTAR}, ${0.95 * alpha})`);
    g.addColorStop(0.3, `rgba(${GOLD}, ${0.45 * alpha})`);
    g.addColorStop(1, `rgba(${GOLD}, 0)`);
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(head.x, head.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    glow(head, 8, 0.9 * alpha);
  }

  /** A star a shooting star has reached: it flares, then holds a steady gold-white light. */
  function litStar(p, age, alpha) {
    const flare = 1 - smooth(clamp01(age / 800));
    glow(p, 7 + 12 * flare, (0.55 + 0.45 * flare) * alpha);
    ctx.fillStyle = `rgba(${SUNSTAR}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * A constellation drawn edge by edge: each edge is a shooting star travelling from a lit star
   * to the next, leaving its line behind. `pairs` are [from, to] node indexes in drawing order.
   */
  function addFigure(nodes, pairs, startAt, { hold = 4500, fade = 2200, onLand } = {}) {
    let t = startAt;
    const edges = pairs.map(([a, b]) => {
      const len = dist(nodes[a].pos(), nodes[b].pos());
      const dur = clamp(360 + len * 1.5, 520, 950);
      const edge = { a, b, start: t, dur, landed: false };
      t += dur + 140;
      return edge;
    });
    nodes.forEach((n) => {
      n.litAt = Infinity;
      if (n.star) n.star.busy = true;
    });
    nodes[pairs[0][0]].litAt = startAt;
    const figure = { nodes, edges, fade, fadeAt: onLand ? Infinity : t + hold, onLand };
    figures.push(figure);
    return figure;
  }

  function drawFigures(now) {
    ctx.lineCap = 'round';
    for (let i = figures.length - 1; i >= 0; i--) {
      const f = figures[i];
      const alpha = 1 - smooth(clamp01((now - f.fadeAt) / f.fade));
      if (alpha <= 0) {
        f.nodes.forEach((n) => n.star && (n.star.busy = false));
        figures.splice(i, 1);
        continue;
      }
      for (const e of f.edges) {
        if (now < e.start) continue;
        const p = clamp01((now - e.start) / e.dur);
        const a = f.nodes[e.a].pos();
        const b = f.nodes[e.b].pos();
        const k = easeOut(p);
        const head = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
        ctx.strokeStyle = `rgba(${GOLD}, ${LINE_ALPHA * alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(head.x, head.y);
        ctx.stroke();
        if (p < 1) {
          shootingStar(a, head, Math.min(110, dist(a, head)), alpha);
        } else if (!e.landed) {
          e.landed = true;
          f.nodes[e.b].litAt = Math.min(f.nodes[e.b].litAt, now);
          if (f.onLand) f.onLand(e, now);
        }
      }
      for (const n of f.nodes) if (n.litAt <= now && !n.hidden) litStar(n.pos(), now - n.litAt, alpha);
    }
  }

  /** A lone shooting star that crosses part of the sky, clear of the mark and the words, and fades. */
  function addMeteor(now) {
    const z = { ...zones(), segments: [] };
    for (let attempt = 0; attempt < 12; attempt++) {
      const right = rand() < 0.5;
      const angle = (between(rand, 18, 38) * Math.PI) / 180;
      const m = {
        from: { x: between(rand, W * 0.1, W * 0.9), y: between(rand, H * 0.05, H * 0.55) },
        dir: { x: Math.cos(angle) * (right ? 1 : -1), y: Math.sin(angle) },
        len: between(rand, 160, Math.max(170, Math.min(340, W * 0.6))),
        start: now,
        dur: between(rand, 700, 1000),
      };
      const to = { x: m.from.x + m.dir.x * m.len, y: m.from.y + m.dir.y * m.len };
      if (pointFree(m.from, z) && segmentClear(m.from, to, z)) {
        meteors.push(m);
        return;
      }
    }
  }

  function drawMeteors(now) {
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      const p = (now - m.start) / m.dur;
      if (p >= 1) {
        meteors.splice(i, 1);
        continue;
      }
      const alpha = Math.min(1, p / 0.15) * Math.min(1, (1 - p) / 0.35);
      const head = { x: m.from.x + m.dir.x * m.len * p, y: m.from.y + m.dir.y * m.len * p };
      shootingStar(m.from, head, Math.min(120, m.len * p), 0.9 * alpha);
    }
  }

  /** After the intro: every few seconds, a shooting star crosses or a small constellation forms. */
  function ambient(now) {
    const clusters = figures.filter((f) => !f.chain).length;
    if (!(clusters < 2 && rand() < 0.65 && spawnCluster(now))) addMeteor(now);
    nextAt = now + between(rand, 4500, 8500);
  }

  // ——— Where lines may go ———

  /** Places lines keep clear of: the words under the mark, the mark itself, and lines already drawn. */
  function zones() {
    const rects = [];
    const words = [...document.querySelectorAll('.hero > :not(.mark)')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.bottom > 0 && r.top < H);
    if (words.length) {
      rects.push({
        left: Math.min(...words.map((r) => r.left)) - 20,
        right: Math.max(...words.map((r) => r.right)) + 20,
        top: Math.min(...words.map((r) => r.top)) - 14,
        bottom: Math.max(...words.map((r) => r.bottom)) + 14,
      });
    }
    const circles = [];
    if (mark) {
      const g = markGeometry();
      if (g.rect.bottom > 0 && g.rect.top < H) circles.push({ c: g.c, r: g.radius + 10 });
    }
    const segments = [];
    for (const f of figures) for (const e of f.edges) segments.push([f.nodes[e.a].pos(), f.nodes[e.b].pos()]);
    return { rects, circles, segments };
  }

  function pointFree(p, z, skipCircles = false) {
    for (const r of z.rects) if (p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom) return false;
    if (!skipCircles) for (const c of z.circles) if (dist(p, c.c) < c.r) return false;
    for (const [a, b] of z.segments) if (distToSegment(p, a, b) < 22) return false;
    return true;
  }

  function segmentClear(a, b, z, skipCircles = false) {
    const n = Math.max(2, Math.ceil(dist(a, b) / 8));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (!pointFree({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, z, skipCircles)) return false;
    }
    return true;
  }

  /**
   * Field stars that can join a constellation, on screen and clear of the zones. Small
   * constellations use the brighter layers; the chain to the mark may also light faint stars,
   * which it needs on a phone, where the words leave little open sky.
   */
  function candidates(z, faint = false) {
    const out = [];
    for (const s of stars) {
      if ((s.layer === 0 && !faint) || s.busy) continue;
      const p = at(s);
      if (p.x < 16 || p.x > W - 16 || p.y < 16 || p.y > H - 16) continue;
      if (pointFree(p, z)) out.push({ s, p });
    }
    return out;
  }

  /** A small constellation: a few neighbouring stars joined by their shortest links (Prim's tree). */
  function spawnCluster(startAt) {
    const z = zones();
    const pool = candidates(z);
    if (pool.length < 3) return false;
    const radius = clamp(Math.hypot(W, H) * 0.2, 140, 300);
    const want = 4 + Math.floor(rand() * 3);
    for (let attempt = 0; attempt < 14; attempt++) {
      const seed = pool[Math.floor(rand() * pool.length)];
      const near = pool
        .filter((c) => c !== seed && dist(c.p, seed.p) > 36 && dist(c.p, seed.p) < radius)
        .sort((a, b) => dist(a.p, seed.p) - dist(b.p, seed.p))
        .slice(0, want - 1);
      if (near.length < 2) continue;
      const pts = [seed, ...near];
      const order = [0];
      const pairs = [];
      while (order.length < pts.length) {
        let best = null;
        for (const i of order) {
          for (let j = 0; j < pts.length; j++) {
            if (order.includes(j)) continue;
            const d = dist(pts[i].p, pts[j].p);
            if ((!best || d < best.d) && segmentClear(pts[i].p, pts[j].p, z)) best = { i, j, d };
          }
        }
        if (!best) break;
        order.push(best.j);
        pairs.push([best.i, best.j]);
      }
      if (order.length < 3) continue;
      const index = new Map(order.map((o, k) => [o, k]));
      const nodes = order.map((o) => ({ star: pts[o].s, pos: () => at(pts[o].s) }));
      addFigure(nodes, pairs.map(([a, b]) => [index.get(a), index.get(b)]), startAt);
      return true;
    }
    return false;
  }

  // ——— The intro: a chain of stars leads to the mark ———

  function markGeometry() {
    const rect = mark.getBoundingClientRect();
    const k = rect.width / 744; // the mark's viewBox is 744 units wide
    const c = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    return { rect, c, radius: rect.width * 0.5, star: { x: c.x + STAR_AT.x * k, y: c.y + STAR_AT.y * k } };
  }

  /**
   * Stars that lead, one after another, to the guiding star. The chain heads for a point just
   * outside the mark beyond the guiding star, so its last line arrives from outside the ring.
   */
  function planChain() {
    const g = markGeometry();
    const T = g.star;
    const out = unit(g.c, T);
    const diag = Math.hypot(W, H);
    const minStep = clamp(diag * 0.07, 60, 130);
    const maxStep = clamp(diag * 0.17, 130, 260);
    const lead = Math.min(maxStep * 0.8, 150);
    const via = { x: T.x + out.x * lead, y: T.y + out.y * lead };
    const z = zones();
    const pool = candidates(z, true).filter((c) => dist(c.p, T) > 50);
    const finalOk = (p) =>
      dist(p, T) <= maxStep * 1.25 && dot(unit(T, p), out) > 0.35 && segmentClear(p, T, z, true);
    const starts = pool.filter((c) => dist(c.p, via) > diag * 0.22 && dist(c.p, via) < diag * 0.65);
    for (let attempt = 0; attempt < 10 && starts.length; attempt++) {
      const path = [starts[Math.floor(rand() * starts.length)]];
      const used = new Set(path);
      for (let step = 0; step < 8; step++) {
        const cur = path[path.length - 1];
        if (path.length >= 2 && finalOk(cur.p)) return path;
        const toVia = dist(cur.p, via);
        let best = null;
        for (const c of pool) {
          if (used.has(c)) continue;
          const d = dist(cur.p, c.p);
          if (d < minStep || d > maxStep) continue;
          const gain = toVia - dist(c.p, via);
          if (gain < d * 0.3 || !segmentClear(cur.p, c.p, z)) continue;
          let score = gain / d + rand() * 0.5;
          if (path.length > 1 && dot(unit(path[path.length - 2].p, cur.p), unit(cur.p, c.p)) < 0.2) score -= 0.6;
          if (!best || score > best.score) best = { c, score };
        }
        if (!best) break;
        path.push(best.c);
        used.add(best.c);
      }
      if (path.length >= 2 && finalOk(path[path.length - 1].p)) return path;
    }
    return null;
  }

  function startIntro(now) {
    const g = markGeometry();
    if (g.rect.bottom < 0 || g.rect.top > H) return formed(now); // the page opened scrolled down
    prepareMark();
    root.classList.add('drawing');
    const path = planChain();
    let nodes;
    let pairs;
    if (path) {
      nodes = path.map((c) => ({ star: c.s, pos: () => at(c.s) }));
      pairs = path.slice(1).map((_, i) => [i, i + 1]);
    } else {
      // No path through the stars on this screen: one shooting star flies straight in.
      const out = unit(g.c, g.star);
      const from = { x: g.star.x + out.x * 420, y: g.star.y + out.y * 420 };
      nodes = [{ pos: () => from, hidden: true }];
      pairs = [];
    }
    nodes.push({ pos: () => markGeometry().star, hidden: true });
    const last = nodes.length - 1;
    pairs.push([last - 1, last]);
    const chain = addFigure(nodes, pairs, now + 350, {
      onLand: (edge, t) => {
        if (edge.b !== last) return;
        markAnim.t0 = t;
        chain.fadeAt = t + 3800;
      },
    });
    chain.chain = true;
    // Smaller constellations form elsewhere while the chain travels.
    spawnCluster(now + 900);
    if (W > 700) spawnCluster(now + 1900);
  }

  /** Split the mark into parts that can draw: two half-rings and one element per ray. */
  function prepareMark() {
    const ns = 'http://www.w3.org/2000/svg';
    const ring = mark.querySelector('[data-ring]');
    const raysPath = mark.querySelector('[data-rays]');
    const star = mark.querySelector('[data-star]');
    const r = Number(ring.getAttribute('r'));
    const p = { x: r * Math.SQRT1_2, y: -r * Math.SQRT1_2 };
    // The ring draws from the guiding star both ways round, meeting opposite it.
    const arcs = [1, 0].map((sweep) => {
      const arc = document.createElementNS(ns, 'path');
      arc.setAttribute('d', `M ${p.x} ${p.y} A ${r} ${r} 0 0 ${sweep} ${-p.x} ${-p.y}`);
      for (const name of ['fill', 'stroke', 'stroke-width']) arc.setAttribute(name, ring.getAttribute(name));
      arc.setAttribute('pathLength', '1');
      arc.setAttribute('stroke-dasharray', '1');
      arc.setAttribute('stroke-dashoffset', '1');
      ring.before(arc);
      return arc;
    });
    ring.remove();
    const rays = raysPath
      .getAttribute('d')
      .split('Z')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
        const base = { x: (n[0] + n[4]) / 2, y: (n[1] + n[5]) / 2 };
        const angle = (Math.atan2(base.y, base.x) * 180) / Math.PI;
        const turn = (((angle + 45) % 360) + 360) % 360; // degrees from the guiding star
        const el = document.createElementNS(ns, 'path');
        el.setAttribute('d', `${d} Z`);
        el.setAttribute('fill', raysPath.getAttribute('fill'));
        el.setAttribute('fill-opacity', raysPath.getAttribute('fill-opacity'));
        el.setAttribute('opacity', '0');
        raysPath.before(el);
        return { el, base, at: Math.min(turn, 360 - turn) / 180, start: 0 };
      });
    raysPath.remove();
    star.setAttribute('opacity', '0');
    markAnim = { ring, raysPath, arcs, rays, star, t0: Infinity, done: false };
  }

  const scaleAbout = (s, c) => `matrix(${s} 0 0 ${s} ${c.x * (1 - s)} ${c.y * (1 - s)})`;

  /** The guiding star flares, the ring traces itself, and each ray sprouts as the ring reaches it. */
  function stepMark(now) {
    const m = markAnim;
    if (m.done || now < m.t0) return;
    const t = now - m.t0;
    m.star.setAttribute('opacity', clamp01(t / 250));
    m.star.setAttribute('transform', scaleAbout(backOut(clamp01(t / 700)), STAR_AT));
    const ring = easeInOut(clamp01((t - 150) / 1500));
    m.arcs.forEach((a) => a.setAttribute('stroke-dashoffset', 1 - ring));
    let growing = false;
    for (const ray of m.rays) {
      if (!ray.start && t >= 150 && ring >= ray.at) ray.start = now;
      const q = ray.start ? clamp01((now - ray.start) / 450) : 0;
      if (q < 1) growing = true;
      ray.el.setAttribute('opacity', clamp01(q * 2));
      ray.el.setAttribute('transform', scaleAbout(backOut(q), ray.base));
    }
    if (t >= 1100) formed(now);
    if (t >= 1700 && !growing) finishMark();
  }

  /** Put the whole mark back as it was drawn in the page. */
  function finishMark() {
    const m = markAnim;
    if (!m || m.done) return;
    m.done = true;
    m.arcs[0].before(m.ring);
    m.arcs.forEach((a) => a.remove());
    m.rays[0].el.before(m.raysPath);
    m.rays.forEach((r) => r.el.remove());
    m.star.removeAttribute('opacity');
    m.star.removeAttribute('transform');
    formed(performance.now());
  }

  function formed(now) {
    if (isFormed) return;
    isFormed = true;
    root.classList.add('formed');
    try {
      sessionStorage.setItem('nkrabea.intro', '1');
    } catch {
      // Private windows may refuse storage; the intro then simply plays again.
    }
    nextAt = now + 2500;
  }

  // ——— Start ———

  resize();
  window.addEventListener('resize', resize);
  if (still) return;
  if (night) {
    if (intro && mark) {
      // Wait briefly for the fonts, so the words (which the lines avoid) are in their final place.
      const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
      Promise.race([fonts, new Promise((r) => setTimeout(r, 700))]).then(() => startIntro(performance.now()));
    } else {
      nextAt = performance.now() + 1500;
    }
  }
  const loop = (now) => {
    draw(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
