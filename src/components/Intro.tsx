import { useEffect, useRef, useState } from 'react';

export interface BootStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}

const TITLE = 'AI DATA UNIVERSE';

/**
 * Opening sequence. The boot log reflects real initialisation steps (dataset build,
 * aggregates, 3D engine download); the animation never delays access once data is ready
 * beyond a short minimum, and can be skipped at any time.
 */
export function Intro({ steps, ready, onDone, reducedMotion }: { steps: BootStep[]; ready: boolean; onDone: () => void; reducedMotion: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [minElapsed, setMinElapsed] = useState(reducedMotion);
  const skipBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    skipBtn.current?.focus();
    if (reducedMotion) return;
    const t = setTimeout(() => setMinElapsed(true), 3400);
    return () => clearTimeout(t);
  }, [reducedMotion]);

  const leave = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onDone, reducedMotion ? 0 : 600);
  };

  useEffect(() => {
    if (ready && minElapsed) leave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, minElapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ready) leave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (reducedMotion) return;
    const c = canvas.current!;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const N = w < 700 ? 110 : 200;
    // Each particle settles on one of three tilted orbits around the core.
    const ps = Array.from({ length: N }, (_, i) => {
      const ring = i % 3;
      return {
        sx: (Math.random() - 0.5) * 2.4,
        sy: (Math.random() - 0.5) * 2.4,
        a: Math.random() * Math.PI * 2,
        r: 0.16 + ring * 0.09 + Math.random() * 0.025,
        tilt: [-0.42, 0.3, 0.05][ring],
        speed: (0.12 + Math.random() * 0.1) * (ring % 2 ? -1 : 1),
        delay: Math.random() * 0.8,
        hue: ring === 0 ? '0,229,255' : ring === 1 ? '53,107,255' : '155,92,255',
      };
    });
    const start = performance.now();
    let raf = 0;
    const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
    const frame = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2 - Math.min(h * 0.06, 40);
      const S = Math.min(w, h) * 0.9;
      const pts: [number, number, number, string][] = [];
      for (const p of ps) {
        const k = ease((t - p.delay) / 1.8);
        const ang = p.a + t * p.speed;
        const ox = Math.cos(ang) * p.r;
        const oy = Math.sin(ang) * p.r * 0.38;
        const tx = ox * Math.cos(p.tilt) - oy * Math.sin(p.tilt);
        const ty = ox * Math.sin(p.tilt) + oy * Math.cos(p.tilt);
        const x = cx + (p.sx + (tx - p.sx) * k) * S;
        const y = cy + (p.sy + (ty - p.sy) * k) * S;
        pts.push([x, y, k, p.hue]);
      }
      ctx.lineWidth = 0.6;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i][0] - pts[j][0];
          const dy = pts[i][1] - pts[j][1];
          const d2 = dx * dx + dy * dy;
          if (d2 < 2600) {
            ctx.strokeStyle = `rgba(${pts[i][3]},${0.16 * (1 - d2 / 2600) * pts[i][2]})`;
            ctx.beginPath();
            ctx.moveTo(pts[i][0], pts[i][1]);
            ctx.lineTo(pts[j][0], pts[j][1]);
            ctx.stroke();
          }
        }
      }
      for (const [x, y, k, hue] of pts) {
        ctx.fillStyle = `rgba(${hue},${0.25 + 0.6 * k})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.1 + k * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      const core = ease((t - 0.6) / 1.6);
      const R = S * 0.07 * core;
      if (R > 0) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 3.2);
        g.addColorStop(0, 'rgba(244,247,251,0.95)');
        g.addColorStop(0.18, 'rgba(0,229,255,0.75)');
        g.addColorStop(0.5, 'rgba(53,107,255,0.18)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [reducedMotion]);

  const failed = steps.some((s) => s.status === 'error');

  return (
    <div className="intro" data-leaving={leaving} role="dialog" aria-label="Inicialização do AI Data Universe">
      {!reducedMotion && <canvas ref={canvas} style={{ width: '100%', height: '100%' }} aria-hidden="true" />}
      <div className="intro__center" style={{ marginTop: '34vh' }}>
        <h1 className="intro__title" aria-label={TITLE}>
          {TITLE.split('').map((ch, i) => (
            <span key={i} style={{ animationDelay: `${0.5 + i * 0.045}s` }} aria-hidden="true">
              {ch === ' ' ? ' ' : ch}
            </span>
          ))}
        </h1>
        <p className="intro__tag">DATA IS NOT STATIC. IT IS A UNIVERSE TO EXPLORE.</p>
      </div>
      <div className="intro__boot" aria-live="polite">
        {steps.map((s) => (
          <div key={s.id}>
            <span className={s.status === 'done' ? 'ok' : s.status === 'running' ? 'run' : s.status === 'error' ? 'bad' : ''}>
              [{s.status === 'done' ? ' OK ' : s.status === 'running' ? ' .. ' : s.status === 'error' ? 'FAIL' : '    '}]
            </span>{' '}
            {s.label}
            {s.detail ? <span style={{ color: 'var(--faint)' }}> — {s.detail}</span> : null}
          </div>
        ))}
        <div style={{ color: 'var(--warn)', marginTop: 6 }}>DEMONSTRATION DATA — FOR PORTFOLIO PURPOSES</div>
      </div>
      {!failed && (
        <button ref={skipBtn} className="btn btn--ghost intro__skip" onClick={leave} disabled={!ready}>
          {ready ? 'Entrar agora →' : 'Preparando dados…'}
        </button>
      )}
    </div>
  );
}
