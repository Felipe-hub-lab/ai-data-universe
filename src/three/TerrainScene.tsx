import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { divergingColor } from '../styles/tokens';
import { toColor, useKeyboardFlight } from './common';

export interface TerrainProps {
  rows: { id: string; label: string }[];
  months: string[];
  /** index[row][month] = 1 + k·(value ÷ row mean − 1): 1 = the hub's own average. NaN = no data. */
  index: number[][];
  playhead: number;
  selectedRow?: string;
  onHover: (h: { row: number; col: number; x: number; y: number } | null) => void;
  onSelectRow: (id: string) => void;
  reducedMotion: boolean;
  stageRef: React.RefObject<HTMLDivElement>;
}

const STEP = 0.5;

/**
 * Temporal terrain: one column per hub × month. Height = value relative to the hub's
 * own average (so hubs of different size are comparable); colour = above/below average.
 * Months after the playhead collapse to the floor — the animation only reveals data.
 */
export default function TerrainScene(p: TerrainProps) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [-1.5, 8.5, 12.5], fov: 42 }} frameloop={p.reducedMotion ? 'demand' : 'always'} onPointerMissed={() => p.onHover(null)}>
      <color attach="background" args={['#050608']} />
      <fog attach="fog" args={['#050608', 20, 40]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 12, 4]} intensity={1.6} />
      <directionalLight position={[-8, 6, -6]} intensity={0.4} color="#6b8cff" />
      <Terrain {...p} />
    </Canvas>
  );
}

function Terrain(p: TerrainProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { invalidate } = useThree();
  useKeyboardFlight(p.stageRef, controls, invalidate);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const R = p.rows.length;
  const C = p.months.length;
  const heights = useRef(new Float32Array(R * C));
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const x0 = -((C - 1) * STEP) / 2;
  const z0 = -((R - 1) * STEP) / 2;

  const target = (r: number, c: number) => {
    const v = p.index[r]?.[c];
    if (c > p.playhead || !Number.isFinite(v)) return 0.001;
    return Math.max(0.03, v);
  };

  const paint = (instant: boolean) => {
    const m = mesh.current;
    if (!m) return;
    let moving = false;
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        const t = target(r, c);
        const h = instant ? t : heights.current[i] + (t - heights.current[i]) * 0.14;
        if (Math.abs(h - t) > 0.002) moving = true;
        heights.current[i] = h;
        dummy.position.set(x0 + c * STEP, h / 2, z0 + r * STEP);
        dummy.scale.set(STEP * 0.78, Math.max(0.001, h), STEP * 0.78);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        const v = p.index[r]?.[c];
        const sel = p.selectedRow === p.rows[r].id;
        const dim = p.selectedRow && !sel ? 0.35 : 1;
        const current = c === p.playhead ? 1.6 : 1;
        m.setColorAt(i, toColor(Number.isFinite(v) ? divergingColor((v - 1) / 1.2) : '#2a3242', dim * current));
      }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (moving) invalidate();
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
    if (e.instanceId == null) return;
    const row = Math.floor(e.instanceId / C);
    const col = e.instanceId % C;
    if (col > p.playhead) return p.onHover(null);
    document.body.style.cursor = 'pointer';
    p.onHover({ row, col, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  };

  return (
    <>
      <OrbitControls ref={controls} makeDefault enableDamping target={[0, 0.4, 0.5]} minDistance={4} maxDistance={30} maxPolarAngle={Math.PI * 0.48} />
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, R * C]}
        onPointerMove={onMove}
        onPointerOut={() => {
          document.body.style.cursor = '';
          p.onHover(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId != null) p.onSelectRow(p.rows[Math.floor(e.instanceId / C)].id);
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial metalness={0.35} roughness={0.45} />
      </instancedMesh>
      {/* Reference plane at index = 1 (each hub's own average). */}
      <mesh position={[0, 1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[C * STEP, R * STEP]} />
        <meshBasicMaterial color="#00E5FF" transparent opacity={0.04} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Playhead */}
      <mesh position={[x0 + p.playhead * STEP, 1.5, 0]}>
        <boxGeometry args={[0.015, 3, R * STEP + 0.4]} />
        <meshBasicMaterial color="#00E5FF" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <gridHelper args={[Math.max(C, R) * STEP + 2, Math.max(C, R) + 4, '#1c2433', '#10151f']} position={[0, 0, 0]} />
      {p.rows.map((r, i) => (
        <Html key={r.id} position={[x0 - 0.6, 0, z0 + i * STEP]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
          <span className="axis-label" style={{ color: r.id === p.selectedRow ? 'var(--cyan)' : undefined }}>{r.label}</span>
        </Html>
      ))}
      {p.months.map((m, c) =>
        c % 3 === 0 || c === p.playhead ? (
          <Html key={m} position={[x0 + c * STEP, 0, z0 + R * STEP + 0.3]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
            <span className="axis-label" style={{ color: c === p.playhead ? 'var(--cyan)' : undefined }}>{m}</span>
          </Html>
        ) : null,
      )}
      <Html position={[x0 + C * STEP + 0.2, 1, z0]} zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
        <span className="axis-label" style={{ color: 'var(--cyan)' }}>média do hub = 1,0</span>
      </Html>
    </>
  );
}
