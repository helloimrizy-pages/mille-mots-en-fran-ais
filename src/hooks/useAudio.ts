import { useCallback, useEffect, useState } from 'react';

let sharedAudio: HTMLAudioElement | null = null;
let currentId: string | null = null;
const listeners = new Set<() => void>();

function notify() { for (const l of listeners) l(); }

function getAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.addEventListener('ended', () => { currentId = null; notify(); });
  }
  return sharedAudio;
}

export interface AudioApi {
  play: (id: string, src: string) => Promise<void>;
  isPlaying: (id: string) => boolean;
}

export function useAudio(): AudioApi {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const play = useCallback(async (id: string, src: string) => {
    const a = getAudio();
    a.pause();
    a.src = src;
    currentId = id;
    notify();
    try { await a.play(); } catch { /* autoplay rejection or 404 — ignore */ }
  }, []);

  const isPlaying = useCallback((id: string) => {
    return currentId === id;
  }, []);

  return { play, isPlaying };
}
