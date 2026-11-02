import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useRef } from 'react';
import * as THREE from 'three';
import type { Health } from '../analytics/health';
import { toColor } from './common';

const RING_COLORS = ['#00E5FF', '#356BFF', '#9B5CFF', '#F4F7FB'];
export const BAND_COLORS: Record<Health['band'], string> = { forte: '#35F2A3', estável: '#00E5FF', atenção: '#FFB547', crítico: '#FF496C' };

/**
 * Health core: the nucleus colour encodes the health band; each orbit is one component
 * of the index and its lit arc length = component score / 100.
 */
export default function CoreScene({ health, reducedMotion, tier }: { health: Health; reducedMotion: boolean; tier: 'low' | 'high' }) {
  return (
    <Canvas dpr={[1, tier === 'high' ? 1.75 : 1.25]} camera={{ position: [0, 1.6, 7.4], fov: 40 }} frameloop={reducedMotion ? 'demand' : 'always'} aria-hidden="true">
      <ambientLight intensity={0.4} />
      <Core health={health} animate={!reducedMotion} />
      {tier === 'high' && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={1.1} luminanceThreshold={1} luminanceSmoothing={0.25} mipmapBlur />
        </EffectComposer>
      )}
    </Canvas>
  );
}

function Core({ health, animate }: { health: Health; animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  const nucleus = useRef<THREE.Mesh>(null);
  useFrame(({ clock }, dt) => {
    if (!animate) return;
    if (group.current) group.current.rotation.y += dt * 0.12;
    if (nucleus.current) nucleus.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 1.4) * 0.025);
  });
  const band = BAND_COLORS[health.band] ?? '#8B95A7';
  // Fit the outer orbit inside narrow panels.
  const { viewport } = useThree();
  const fit = Math.min(1, viewport.width / 8.6, viewport.height / 6.2);
  return (
    <group rotation={[0.18, 0, 0]} scale={fit}>
      <pointLight position={[2.5, 2.5, 3]} intensity={18} color="#ffffff" />
      <mesh ref={nucleus}>
        <icosahedronGeometry args={[0.55, 5]} />
        <meshStandardMaterial color={band} emissive={band} emissiveIntensity={0.55} roughness={0.35} metalness={0.25} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.9, 1]} />
        <meshBasicMaterial color={band} wireframe transparent opacity={0.14} />
      </mesh>
      <group ref={group}>
        {health.components.map((c, i) => {
          const r = 1.75 + i * 0.5;
          const tilt: [number, number, number] = [Math.PI / 2 + (i - 1.5) * 0.22, (i % 2 ? 1 : -1) * 0.18 * i, 0];
          const arc = c.available ? Math.max(0.001, (c.score / 100) * Math.PI * 2) : 0;
          const end = new THREE.Vector3(Math.cos(arc) * r, Math.sin(arc) * r, 0);
          return (
            <group key={c.id} rotation={tilt}>
              <mesh>
                <torusGeometry args={[r, 0.008, 6, 160]} />
                <meshBasicMaterial color="#2a3242" transparent opacity={0.8} />
              </mesh>
              {arc > 0 && (
                <mesh>
                  <torusGeometry args={[r, 0.028, 8, 200, arc]} />
                  <meshBasicMaterial color={toColor(RING_COLORS[i], 1.5).clone()} toneMapped={false} />
                </mesh>
              )}
              {arc > 0 && (
                <mesh position={end}>
                  <sphereGeometry args={[0.07, 16, 12]} />
                  <meshBasicMaterial color={toColor(RING_COLORS[i], 2.2).clone()} toneMapped={false} />
                </mesh>
              )}
              {/* On narrow panels the labels collide; the 2D bars below carry the same values. */}
              {fit > 0.8 && (
                <Html position={end.clone().multiplyScalar(1.06)} zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
                  <span className="axis-label" style={{ color: RING_COLORS[i] }}>
                    {c.label.toUpperCase()} {c.available ? Math.round(c.score) : '—'}
                  </span>
                </Html>
              )}
            </group>
          );
        })}
      </group>
    </group>
  );
}
