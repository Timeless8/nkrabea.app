// The star field behind every page: far, middle and near layers, as in the app's StarField.
(() => {
  const sky = document.querySelector('.sky');
  if (!sky) return;

  // Seeded (mulberry32), so the sky looks the same on every visit.
  let a = 7;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (min, max) => min + rand() * (max - min);

  const W = 1600;
  const H = 1000;
  const layers = [
    { count: 220, r: [0.5, 1.0], o: [0.2, 0.45], drift: '90s', d: 10 },
    { count: 110, r: [0.9, 1.4], o: [0.35, 0.65], drift: '140s', d: 22 },
    { count: 36, r: [1.3, 2.0], o: [0.55, 0.9], drift: '200s', d: 38 },
  ];
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.setAttribute('aria-hidden', 'true');
  for (const layer of layers) {
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'layer');
    g.style.setProperty('--drift', layer.drift);
    g.style.setProperty('--dx', `${layer.d * 0.6}px`);
    g.style.setProperty('--dy', `${layer.d}px`);
    for (let i = 0; i < layer.count; i++) {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', (rand() * W).toFixed(1));
      c.setAttribute('cy', (rand() * H).toFixed(1));
      c.setAttribute('r', between(...layer.r).toFixed(2));
      c.setAttribute('fill', '#eee9ff');
      c.setAttribute('opacity', between(...layer.o).toFixed(2));
      g.appendChild(c);
    }
    svg.appendChild(g);
  }
  sky.appendChild(svg);
})();
