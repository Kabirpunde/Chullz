import { useCallback, useRef, useState } from 'react';

// Global mute state stored in localStorage
const MUTE_KEY = 'chullz_muted';

export function useSoundEffects() {
  const ctxRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const [muted, setMuted] = useState(() => {
    try {
      const stored = localStorage.getItem(MUTE_KEY) === 'true';
      mutedRef.current = stored;
      return stored;
    } catch {
      return false;
    }
  });

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      const next = !prev;
      mutedRef.current = next;
      try {
        localStorage.setItem(MUTE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  const getCtx = useCallback((): AudioContext | null => {
    if (mutedRef.current) return null;
    try {
      if (!ctxRef.current || ctxRef.current.state === 'closed') {
        ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (ctxRef.current.state === 'suspended') {
        ctxRef.current.resume();
      }
      return ctxRef.current;
    } catch {
      return null;
    }
  }, []);

  /** Double-tap beep for CHECK */
  const playCheck = useCallback(() => {
    const ac = getCtx();
    if (!ac) return;
    [0, 0.12].forEach(delay => {
      try {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.type = 'sine';
        osc.frequency.value = 1100;
        gain.gain.setValueAtTime(0, ac.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.28, ac.currentTime + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 0.10);
        osc.start(ac.currentTime + delay);
        osc.stop(ac.currentTime + delay + 0.12);
      } catch {}
    });
  }, [getCtx]);

  /** Chip clink for BET / CALL / RAISE */
  const playChips = useCallback((count = 3) => {
    const ac = getCtx();
    if (!ac) return;
    for (let i = 0; i < count; i++) {
      try {
        const delay = i * 0.07;
        const bufSize = Math.floor(ac.sampleRate * 0.12);
        const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let j = 0; j < bufSize; j++) {
          data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (ac.sampleRate * 0.025));
        }
        const src = ac.createBufferSource();
        src.buffer = buf;
        const filter = ac.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2200 + Math.random() * 400;
        filter.Q.value = 2;
        const gain = ac.createGain();
        gain.gain.value = 0.35;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ac.destination);
        src.start(ac.currentTime + delay);
      } catch {}
    }
  }, [getCtx]);

  /** Short tick for countdown (last 15s) */
  const playTick = useCallback(() => {
    const ac = getCtx();
    if (!ac) return;
    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.12, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.04);
      osc.start();
      osc.stop(ac.currentTime + 0.05);
    } catch {}
  }, [getCtx]);

  /** Rising chord for SUBMIT ASSIGNMENT */
  const playSubmit = useCallback(() => {
    const ac = getCtx();
    if (!ac) return;
    [0, 0.10, 0.20].forEach((delay, i) => {
      try {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.type = 'sine';
        osc.frequency.value = [523, 659, 784][i]; // C-E-G chord
        gain.gain.setValueAtTime(0, ac.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.22, ac.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 0.35);
        osc.start(ac.currentTime + delay);
        osc.stop(ac.currentTime + delay + 0.4);
      } catch {}
    });
  }, [getCtx]);

  /** Fold whoosh */
  const playFold = useCallback(() => {
    const ac = getCtx();
    if (!ac) return;
    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.18);
      gain.gain.setValueAtTime(0.18, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.22);
      osc.start();
      osc.stop(ac.currentTime + 0.25);
    } catch {}
  }, [getCtx]);

  return { playCheck, playChips, playTick, playSubmit, playFold, muted, toggleMute };
}
