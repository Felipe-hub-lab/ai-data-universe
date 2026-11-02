import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Hub } from '../data/schema';

/** Equirectangular projection of the hub coordinates onto the XZ plane (north = −Z). */
export const GEO_SCALE = 0.62;
export const project = (lat: number, lon: number): [number, number] => [(lon + 47.5) * GEO_SCALE, -(lat + 15.5) * GEO_SCALE];

/**
 * Geographic positions with a light collision relaxation so neighbouring hubs
 * (e.g. São Paulo / Campinas) do not overlap. Displacement is bounded and documented.
 */
export function hubPositions(hubs: Hub[], minDist = 1.15): Map<string, THREE.Vector3> {
  const pts = hubs.map((h) => {
    const [x, z] = project(h.lat, h.lon);
    return { id: h.id, x, z, ox: x, oz: z };
  });
  for (let it = 0; it < 80; it++) {
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz) || 0.001;
        if (d < minDist) {
          const push = (minDist - d) / 2;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        }
      }
  }
  return new Map(pts.map((p) => [p.id, new THREE.Vector3(p.x, 0, p.z)]));
}

export interface CameraGoal {
  position: [number, number, number];
  target: [number, number, number];
  /** Changes whenever a new flight is requested. */
  key: string | number;
}

/**
 * Smoothly flies camera + orbit target to a goal. Any user interaction cancels the flight
 * so the user is never fighting the camera.
 */
export function CameraRig({ goal, controls, instant }: { goal: CameraGoal; controls: React.RefObject<OrbitControlsImpl>; instant: boolean }) {
  const { camera, invalidate } = useThree();
  const flying = useRef(true);
  const pos = useRef(new THREE.Vector3());
  const tgt = useRef(new THREE.Vector3());

  useEffect(() => {
    pos.current.set(...goal.position);
    tgt.current.set(...goal.target);
    flying.current = true;
    if (instant && controls.current) {
      camera.position.copy(pos.current);
      controls.current.target.copy(tgt.current);
      controls.current.update();
      flying.current = false;
    }
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal.key]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => (flying.current = false);
    c.addEventListener('start', stop);
    return () => c.removeEventListener('start', stop);
  }, [controls]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!flying.current || !c) return;
    const k = 1 - Math.pow(0.0025, dt);
    camera.position.lerp(pos.current, k);
    c.target.lerp(tgt.current, k);
    c.update();
    if (camera.position.distanceTo(pos.current) < 0.02 && c.target.distanceTo(tgt.current) < 0.02) flying.current = false;
    invalidate();
  });
  return null;
}

/** WASD / arrow keys pan the orbit target; +/− dolly. Bound to the focused stage element. */
export function useKeyboardFlight(el: React.RefObject<HTMLElement>, controls: React.RefObject<OrbitControlsImpl>, invalidate: () => void) {
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const on = (e: KeyboardEvent) => {
      const c = controls.current;
      if (!c) return;
      const cam = c.object as THREE.PerspectiveCamera;
      const fwd = new THREE.Vector3().subVectors(c.target, cam.position).setY(0).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const step = 0.6;
      const move = new THREE.Vector3();
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          move.add(fwd.multiplyScalar(step));
          break;
        case 's':
        case 'arrowdown':
          move.add(fwd.multiplyScalar(-step));
          break;
        case 'a':
        case 'arrowleft':
          move.add(right.multiplyScalar(-step));
          break;
        case 'd':
        case 'arrowright':
          move.add(right.multiplyScalar(step));
          break;
        case '+':
        case '=': {
          const dir = new THREE.Vector3().subVectors(c.target, cam.position).multiplyScalar(0.12);
          cam.position.add(dir);
          break;
        }
        case '-': {
          const dir = new THREE.Vector3().subVectors(c.target, cam.position).multiplyScalar(-0.12);
          cam.position.add(dir);
          break;
        }
        default:
          return;
      }
      e.preventDefault();
      c.target.add(move);
      cam.position.add(move);
      c.update();
      invalidate();
    };
    node.addEventListener('keydown', on);
    return () => node.removeEventListener('keydown', on);
  }, [el, controls, invalidate]);
}

const tmpColor = new THREE.Color();
/** Parses any CSS colour (hex or rgb()) into a THREE.Color scaled by `intensity`. */
export function toColor(css: string, intensity = 1, out = tmpColor): THREE.Color {
  return out.set(css).multiplyScalar(intensity);
}
