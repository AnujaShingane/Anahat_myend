import { useCallback, useEffect, useRef, useState } from 'react';

// A real, working player for the Relaxation page while the recorded raag
// tracks are not uploaded yet: it synthesises a tanpura-style drone (Sa,
// Pa, upper Sa) with the Web Audio API, so play / pause / seek / next /
// previous / shuffle / loop / volume all behave exactly as they will with
// audio files. Swap `startDrone` for an <audio> element later.
const parseLen = (s) => { const [m, sec] = String(s || '0:00').split(':').map(Number); return (m || 0) * 60 + (sec || 0); };

export function useRaagPlayer(tracks) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [volume, setVolume] = useState(0.6);
  const [shuffle, setShuffle] = useState(false);
  const [loop, setLoop] = useState(false);
  const ctxRef = useRef(null);
  const nodesRef = useRef(null);
  const gainRef = useRef(null);
  const timerRef = useRef(null);

  const track = tracks[Math.min(index, tracks.length - 1)];
  const duration = parseLen(track?.length);

  const stopDrone = useCallback(() => {
    if (nodesRef.current) { nodesRef.current.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }); nodesRef.current = null; }
  }, []);

  const startDrone = useCallback((t) => {
    const ctx = ctxRef.current || new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;
    if (ctx.state === 'suspended') ctx.resume();
    stopDrone();
    const master = gainRef.current || ctx.createGain();
    gainRef.current = master;
    master.gain.value = volume;
    master.connect(ctx.destination);
    const sa = 110 + ((t?.hue || 0) % 90);       // tonic varies gently per raag
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 900; filter.connect(master);
    const voices = [[sa, 0.35, 0], [sa * 1.5, 0.25, 2], [sa * 2, 0.18, -2], [sa * 0.5, 0.2, 0]].map(([f, g, detune]) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = detune;
      const og = ctx.createGain(); og.gain.value = g;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.15 + Math.random() * 0.1;
      const lg = ctx.createGain(); lg.gain.value = g * 0.4; lfo.connect(lg); lg.connect(og.gain);
      o.connect(og); og.connect(filter); o.start(); lfo.start();
      return [o, lfo];
    }).flat();
    nodesRef.current = voices;
  }, [stopDrone, volume]);

  useEffect(() => { if (gainRef.current) gainRef.current.gain.value = volume; }, [volume]);

  const next = useCallback(() => {
    setElapsed(0);
    setIndex((i) => (shuffle ? Math.floor(Math.random() * tracks.length) : (i + 1) % tracks.length));
  }, [shuffle, tracks.length]);
  const prev = useCallback(() => {
    setElapsed((e) => { if (e > 3) return 0; setIndex((i) => (i - 1 + tracks.length) % tracks.length); return 0; });
  }, [tracks.length]);

  // Progress clock; at the end: loop, or advance, or stop.
  useEffect(() => {
    if (!playing) { clearInterval(timerRef.current); return undefined; }
    timerRef.current = setInterval(() => {
      setElapsed((e) => {
        if (e + 1 < duration) return e + 1;
        if (loop) return 0;
        if (tracks.length > 1) { setTimeout(next, 0); return 0; }
        setPlaying(false); return duration;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [playing, duration, loop, next, tracks.length]);

  // (Re)start the drone whenever the track changes while playing.
  useEffect(() => { if (playing) startDrone(track); else stopDrone(); }, [playing, index, track?.name, track?.hue]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { stopDrone(); ctxRef.current?.close?.(); }, [stopDrone]);

  const select = (i, autoPlay = true) => { setIndex(i); setElapsed(0); setPlaying(autoPlay); };
  const toggle = () => setPlaying((p) => !p);
  const seek = (fraction) => setElapsed(Math.max(0, Math.min(duration, Math.round(fraction * duration))));
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return { index, track, playing, elapsed, duration, volume, shuffle, loop, select, toggle, next, prev, seek, setVolume, setShuffle, setLoop, fmt, setIndex, setElapsed };
}
