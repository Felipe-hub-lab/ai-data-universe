import { Html, Line, OrbitControls, PerformanceMonitor, Stars } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Metrics } from '../analytics/aggregate';
import type { Entity } from '../analytics/entities';
import type { Hub } from '../data/schema';
import type { Selection } from '../state/store';
import type { Domain } from '../modules/galaxy/encoding';
import { SCATTER } from '../modules/galaxy/encoding';
import { CameraRig, hubPositions, project, toColor, useKeyboardFlight, type CameraGoal } from './common';

export interface HoverInfo {
  kind: 'entity' | 'hub';
  id: string;
  x: number;
  y: number;
}

export interface GalaxySceneProps {
  hubs: Hub[];
  hubRevenue: Map<string, number>;
  hubColors: Map<string, string>;
  anomalyHubs: Map<string, number>;
  entities: Entity[];
  colors: string[];
  size: (revenue: number) => number;
  segmentOrder: string[];
  layout: 'geo' | 'scatter';
  domains: { x: Domain; y: Domain; z: Domain };
  axisFormat: { x: (v: number) => string; y: (v: number) => string; z: (v: number) => string };
  network: Metrics;
  lanes: { origin: string; destination: string; shipments: number }[];
  flows: boolean;
  selection: Selection;
  isolate: { kind: 'region' | 'segment'; id: string } | null;
  showAnomalyRings: boolean;
  onHover: (h: HoverInfo | null) => void;
  onSelect: (s: Selection) => void;
  cameraGoal: CameraGoal;
  reducedMotion: boolean;
  tier: 'low' | 'high';
  stageRef: React.RefObject<HTMLDivElement>;
}

const RING = 0.42;
const lerpMap = (v: number, d: Domain, r: [number, number]) => r[0] + ((v - d.min) / (d.max - d.min || 1)) * (r[1] - r[0]);

export default function GalaxyScene(props: GalaxySceneProps) {
  const [dpr, setDpr] = useState(props.tier === 'high' ? 1.75 : 1.25);
  return (
    <Canvas
      dpr={[1, dpr]}
      camera={{ position: props.cameraGoal.position, fov: 45, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      frameloop={props.reducedMotion ? 'demand' : 'always'}
      onPointerMissed={() => props.onSelect({})}
      aria-label="Universo 3D de dados"
    >
      <color attach="background" args={['#050608']} />
      <fog attach="fog" args={['#050608', 22, 48]} />
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 10, 0]} intensity={40} color="#7fdcff" />
      <PerformanceMonitor onDecline={() => setDpr(1)} />
      <Stars radius={70} depth={30} count={props.tier === 'high' ? 1600 : 700} factor={2.2} fade speed={props.reducedMotion ? 0 : 0.3} />
      <Scene {...props} />
      {props.tier === 'high' && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.9} luminanceThreshold={1} luminanceSmoothing={0.2} mipmapBlur />
        </EffectComposer>
      )}
    </Canvas>
  );
}

function Scene(p: GalaxySceneProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { invalidate } = useThree();
  useKeyboardFlight(p.stageRef, controls, invalidate);
  const hubPos = useMemo(() => hubPositions(p.hubs), [p.hubs]);
  const geo = p.layout === 'geo';

  return (
    <>
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} minDistance={3} maxDistance={40} maxPolarAngle={Math.PI * 0.49} />
      <CameraRig goal={p.cameraGoal} controls={controls} instant={p.reducedMotion} />
      {geo ? <Graticule /> : <ScatterAxes domains={p.domains} format={p.axisFormat} network={p.network} />}
      <Entities {...p} hubPos={hubPos} />
      {geo && <HubBeacons {...p} hubPos={hubPos} />}
      {geo && p.flows && <Flows lanes={p.lanes} hubPos={hubPos} animate={!p.reducedMotion} selection={p.selection} />}
    </>
  );
}

/* ---------------------------------------------------------------------------------- */

function Entities(p: GalaxySceneProps & { hubPos: Map<string, THREE.Vector3> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const capacity = p.hubs.length * p.segmentOrder.length;
  const current = useRef(new Map<string, THREE.Vector3>());
  const hovered = useRef<number | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const { invalidate } = useThree();

  const targets = useMemo(() => {
    return p.entities.map((e) => {
      if (p.layout === 'geo') {
        const c = p.hubPos.get(e.hubId)!;
        const k = p.segmentOrder.indexOf(e.segmentId);
        const a = (k / p.segmentOrder.length) * Math.PI * 2 - Math.PI / 2;
        return new THREE.Vector3(c.x + Math.cos(a) * RING, 0.12, c.z + Math.sin(a) * RING);
      }
      return new THREE.Vector3(
        lerpMap(e.m[SCATTER.x.metric], p.domains.x, SCATTER.x.range),
        lerpMap(e.m[SCATTER.y.metric], p.domains.y, SCATTER.y.range),
        lerpMap(e.m[SCATTER.z.metric], p.domains.z, SCATTER.z.range),
      );
    });
  }, [p.entities, p.layout, p.hubPos, p.segmentOrder, p.domains]);

  const emphasis = (e: Entity) => {
    const sel = p.selection;
    const isSel = (sel.hubId ? e.hubId === sel.hubId : true) && (sel.segmentId ? e.segmentId === sel.segmentId : true);
    const anySel = !!(sel.hubId || sel.segmentId);
    const iso = p.isolate ? (p.isolate.kind === 'region' ? e.regionId === p.isolate.id : e.segmentId === p.isolate.id) : true;
    if (!iso) return 0.12;
    if (anySel) return isSel ? 2.2 : 0.35;
    return 1;
  };

  const paint = (instant: boolean) => {
    const m = mesh.current;
    if (!m) return false;
    let moving = false;
    p.entities.forEach((e, i) => {
      let cur = current.current.get(e.id);
      const tgt = targets[i];
      if (!cur) {
        cur = tgt.clone();
        cur.y = tgt.y + (instant ? 0 : 2);
        current.current.set(e.id, cur);
      }
      if (instant) cur.copy(tgt);
      else {
        cur.lerp(tgt, 0.09);
        if (cur.distanceToSquared(tgt) > 1e-5) moving = true;
      }
      const emph = emphasis(e);
      const s = p.size(e.m.revenue) * (hovered.current === i ? 1.35 : emph > 1.5 ? 1.25 : 1);
      dummy.position.copy(cur);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, toColor(p.colors[i], hovered.current === i ? 2.4 : emph));
    });
    m.count = p.entities.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    return moving;
  };

  useLayoutEffect(() => {
    paint(p.reducedMotion);
    invalidate();
  });

  useFrame(() => {
    if (!p.reducedMotion) paint(false);
  });

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const i = e.instanceId;
    if (i == null || i >= p.entities.length) return;
    if (hovered.current !== i) {
      hovered.current = i;
      document.body.style.cursor = 'pointer';
      invalidate();
    }
    p.onHover({ kind: 'entity', id: p.entities[i].id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  };
  const onOut = () => {
    hovered.current = null;
    document.body.style.cursor = '';
    p.onHover(null);
    invalidate();
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const i = e.instanceId;
    if (i == null) return;
    const ent = p.entities[i];
    p.onSelect({ hubId: ent.hubId, segmentId: ent.segmentId });
  };

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, capacity]} onPointerMove={onMove} onPointerOut={onOut} onClick={onClick} frustumCulled={false}>
      <sphereGeometry args={[1, 24, 16]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/* ---------------------------------------------------------------------------------- */

function HubBeacons(p: GalaxySceneProps & { hubPos: Map<string, THREE.Vector3> }) {
  const maxRev = Math.max(1, ...p.hubRevenue.values());
  const { invalidate } = useThree();
  return (
    <group>
      {p.hubs.map((h) => {
        const pos = p.hubPos.get(h.id)!;
        const rev = p.hubRevenue.get(h.id) ?? 0;
        if (rev <= 0) return null;
        const height = 0.15 + 3.4 * (rev / maxRev);
        const selected = p.selection.hubId === h.id;
        const dim = p.isolate?.kind === 'region' && p.isolate.id !== h.region;
        const color = p.hubColors.get(h.id) ?? '#8B95A7';
        const anomalies = p.anomalyHubs.get(h.id) ?? 0;
        return (
          <group key={h.id} position={[pos.x, 0, pos.z]}>
            <mesh
              position={[0, height / 2, 0]}
              onPointerMove={(e) => {
                e.stopPropagation();
                document.body.style.cursor = 'pointer';
                p.onHover({ kind: 'hub', id: h.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
              }}
              onPointerOut={() => {
                document.body.style.cursor = '';
                p.onHover(null);
              }}
              onClick={(e) => {
                e.stopPropagation();
                p.onSelect({ hubId: h.id });
                invalidate();
              }}
            >
              <cylinderGeometry args={[selected ? 0.07 : 0.045, 0.06, height, 10]} />
              <meshBasicMaterial color={toColor(color, selected ? 2.2 : dim ? 0.15 : 0.85).clone()} toneMapped={false} transparent opacity={dim ? 0.3 : 0.9} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
              <ringGeometry args={[RING - 0.02, RING + 0.015, 48]} />
              <meshBasicMaterial color={color} transparent opacity={dim ? 0.08 : selected ? 0.8 : 0.28} toneMapped={false} />
            </mesh>
            {p.showAnomalyRings && anomalies > 0 && <AnomalyPulse count={anomalies} animate={!p.reducedMotion} />}
            <Html position={[0, height + 0.12, 0]} zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
              <div className="hub-label" data-hot={selected}>{h.id}</div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function AnomalyPulse({ count, animate }: { count: number; animate: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animate || !ref.current) return;
    const t = (clock.elapsedTime * 0.6) % 1;
    ref.current.scale.setScalar(1 + t * 0.9);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <ringGeometry args={[RING + 0.08, RING + 0.08 + 0.025 * Math.min(4, count), 48]} />
      <meshBasicMaterial color={toColor('#FF496C', 1.6).clone()} transparent opacity={0.6} toneMapped={false} />
    </mesh>
  );
}

/* ---------------------------------------------------------------------------------- */

function Flows({ lanes, hubPos, animate, selection }: { lanes: GalaxySceneProps['lanes']; hubPos: Map<string, THREE.Vector3>; animate: boolean; selection: Selection }) {
  const max = Math.max(1, ...lanes.map((l) => l.shipments));
  const curves = useMemo(
    () =>
      lanes
        .filter((l) => hubPos.has(l.origin) && hubPos.has(l.destination) && l.shipments > 0)
        .map((l) => {
          const a = hubPos.get(l.origin)!.clone().setY(0.05);
          const b = hubPos.get(l.destination)!.clone().setY(0.05);
          const mid = a.clone().add(b).multiplyScalar(0.5);
          mid.y = 0.35 + a.distanceTo(b) * 0.22;
          const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
          return { l, curve, points: curve.getPoints(28), w: l.shipments / max };
        }),
    [lanes, hubPos, max],
  );

  // Particle density along a lane is proportional to its volume (1–8 particles).
  const particles = useMemo(
    () =>
      curves.flatMap((c, ci) => {
        const n = Math.max(1, Math.round(c.w * 8));
        return Array.from({ length: n }, (_, k) => ({ ci, offset: k / n }));
      }),
    [curves],
  );
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particles.length * 3), 3));
    return g;
  }, [particles]);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const place = (time: number) => {
    const arr = geom.attributes.position.array as Float32Array;
    particles.forEach((pt, i) => {
      const t = (pt.offset + time * 0.12) % 1;
      curves[pt.ci].curve.getPoint(t, tmp);
      arr[i * 3] = tmp.x;
      arr[i * 3 + 1] = tmp.y;
      arr[i * 3 + 2] = tmp.z;
    });
    geom.attributes.position.needsUpdate = true;
  };
  useLayoutEffect(() => place(0.35));
  useFrame(({ clock }) => animate && place(clock.elapsedTime));

  return (
    <group>
      {curves.map(({ l, points, w }) => {
        const hot = selection.hubId && (l.origin === selection.hubId || l.destination === selection.hubId);
        const dim = selection.hubId && !hot;
        return (
          <Line
            key={`${l.origin}-${l.destination}`}
            points={points}
            color={hot ? '#00E5FF' : '#356BFF'}
            lineWidth={0.6 + w * 2.6}
            transparent
            opacity={dim ? 0.06 : hot ? 0.9 : 0.18 + w * 0.4}
          />
        );
      })}
      <points geometry={geom}>
        <pointsMaterial size={0.09} color={toColor('#7fe9ff', 1.8).clone()} toneMapped={false} transparent opacity={0.9} sizeAttenuation />
      </points>
    </group>
  );
}

/* ---------------------------------------------------------------------------------- */

/** 5° latitude/longitude graticule — the spatial reference for the geographic layout. */
function Graticule() {
  const lines = useMemo(() => {
    const out: { pts: [number, number, number][]; label: string; at: [number, number, number] }[] = [];
    for (let lon = -75; lon <= -30; lon += 5) {
      const a = project(6, lon);
      const b = project(-35, lon);
      out.push({ pts: [[a[0], 0, a[1]], [b[0], 0, b[1]]], label: `${Math.abs(lon)}°W`, at: [b[0], 0, b[1] + 0.4] });
    }
    for (let lat = 5; lat >= -35; lat -= 5) {
      const a = project(lat, -75);
      const b = project(lat, -30);
      out.push({ pts: [[a[0], 0, a[1]], [b[0], 0, b[1]]], label: lat === 0 ? '0°' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`, at: [a[0] - 0.6, 0, a[1]] });
    }
    return out;
  }, []);
  return (
    <group>
      {lines.map((l) => (
        <group key={l.label}>
          <Line points={l.pts} color="#1c2433" lineWidth={1} />
          <Html position={l.at} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
            <span className="axis-label">{l.label}</span>
          </Html>
        </group>
      ))}
    </group>
  );
}

function ScatterAxes({ domains, format, network }: { domains: GalaxySceneProps['domains']; format: GalaxySceneProps['axisFormat']; network: Metrics }) {
  const [x0, x1] = SCATTER.x.range;
  const y1 = SCATTER.y.range[1];
  const [z0, z1] = SCATTER.z.range;
  const ticks = (d: Domain) => [0, 0.25, 0.5, 0.75, 1].map((t) => d.min + (d.max - d.min) * t);
  const nx = lerpMap(network.onTimeRate, domains.x, SCATTER.x.range);
  const ny = lerpMap(network.margin, domains.y, SCATTER.y.range);
  return (
    <group>
      <gridHelper args={[12, 12, '#1c2433', '#121826']} position={[0, 0, 0]} />
      <Line points={[[x0, 0, z0], [x1, 0, z0]]} color="#00E5FF" lineWidth={1.2} />
      <Line points={[[x0, 0, z0], [x0, y1, z0]]} color="#9B5CFF" lineWidth={1.2} />
      <Line points={[[x0, 0, z0], [x0, 0, z1]]} color="#356BFF" lineWidth={1.2} />
      {/* Network-average reference lines split the space into quadrants. */}
      <Line points={[[nx, 0, z0], [nx, 0, z1]]} color="#8B95A7" lineWidth={1} dashed dashSize={0.2} gapSize={0.15} />
      <Line points={[[x0, ny, z1], [x1, ny, z1]]} color="#8B95A7" lineWidth={1} dashed dashSize={0.2} gapSize={0.15} />
      <Line points={[[nx, 0, z1], [nx, y1, z1]]} color="#8B95A7" lineWidth={1} dashed dashSize={0.2} gapSize={0.15} />
      <Html position={[nx, 0.1, z1 - 0.3]} zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
        <span className="axis-label" style={{ color: 'var(--text-2)' }}>média da rede</span>
      </Html>
      {ticks(domains.x).map((v, i) => (
        <Html key={`x${i}`} position={[lerpMap(v, domains.x, SCATTER.x.range), 0, z0 + 0.45]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
          <span className="axis-label">{format.x(v)}</span>
        </Html>
      ))}
      {ticks(domains.y).map((v, i) => (
        <Html key={`y${i}`} position={[x0 - 0.3, lerpMap(v, domains.y, SCATTER.y.range), z0]} zIndexRange={[3, 0]} style={{ pointerEvents: 'none', transform: 'translate(-100%, -50%)' }}>
          <span className="axis-label">{format.y(v)}</span>
        </Html>
      ))}
      {ticks(domains.z).map((v, i) => (
        <Html key={`z${i}`} position={[x0 - 0.5, 0, lerpMap(v, domains.z, SCATTER.z.range)]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
          <span className="axis-label">{format.z(v)}</span>
        </Html>
      ))}
      <Html position={[x1 + 0.3, 0, z0]} zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
        <span className="axis-label" style={{ color: 'var(--cyan)' }}>{SCATTER.x.label} →</span>
      </Html>
      <Html position={[x0, y1 + 0.4, z0]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
        <span className="axis-label" style={{ color: 'var(--violet)' }}>↑ {SCATTER.y.label}</span>
      </Html>
      <Html position={[x0, 0, z1 - 0.5]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
        <span className="axis-label" style={{ color: '#7d9bff' }}>{SCATTER.z.label} ↗</span>
      </Html>
    </group>
  );
}
