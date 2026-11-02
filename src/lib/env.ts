import { useEffect, useState } from 'react';

let webglCache: boolean | null = null;

/** True when a WebGL context can actually be created (not just when the API exists). */
export function webglAvailable(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    if (new URLSearchParams(location.search).has('nowebgl')) return (webglCache = false);
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    webglCache = !!gl;
    (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export const useReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)');
export const useIsMobile = () => useMedia('(max-width: 760px)');

/** Rough device tier used to scale particle counts, DPR and post-processing. */
export function deviceTier(): 'low' | 'high' {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile = matchMedia('(max-width: 760px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
  return mobile || cores <= 4 ? 'low' : 'high';
}
