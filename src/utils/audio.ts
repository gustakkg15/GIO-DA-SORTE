/**
 * Web Audio API synthesizer for raffle sound effects.
 * Requires no external audio files - 100% reliable and instantaneous.
 */

let audioCtx: AudioContext | null = null;
let soundEnabled = true;

// Pre-emptively unlock AudioContext on first user interaction (critical for iOS Safari and mobile Chrome)
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  };
  window.addEventListener('touchstart', unlockAudio, { passive: true, once: true });
  window.addEventListener('click', unlockAudio, { passive: true, once: true });
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
  try {
    localStorage.setItem('sorteio_sound_enabled', enabled ? 'true' : 'false');
  } catch {
    // Ignore storage errors
  }
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem('sorteio_sound_enabled');
  if (stored !== null) {
    soundEnabled = stored === 'true';
  }
  return soundEnabled;
}

/**
 * Click / tick sound when cycling numbers rapidly during raffle roll
 */
export function playTick(pitchMultiplier = 1) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450 * pitchMultiplier, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  } catch {
    // Ignore audio context glitch
  }
}

/**
 * Wheel needle click when crossing a slice boundary
 */
export function playWheelTick(volume = 0.1) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.025);

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.025);
  } catch {
    // Ignore
  }
}

/**
 * Dramatic heartbeat / tension thump for Battle Royale elimination rounds
 */
export function playHeartbeat() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  } catch {
    // Ignore
  }
}

/**
 * Suspenseful countdown sound effect for each second leading to the draw
 */
export function playCountdownTick(secondsRemaining: number) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const isUrgent = secondsRemaining <= 3;

    // Sub-bass tension pulse
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(80, now);
    subOsc.frequency.exponentialRampToValueAtTime(35, now + 0.12);
    subGain.gain.setValueAtTime(isUrgent ? 0.3 : 0.18, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.14);

    // High suspense alert tone with increasing pitch
    const beepOsc = ctx.createOscillator();
    const beepGain = ctx.createGain();
    beepOsc.type = isUrgent ? 'sawtooth' : 'triangle';

    const pitch = isUrgent
      ? (secondsRemaining === 1 ? 987.77 : secondsRemaining === 2 ? 880 : 783.99)
      : 440 + Math.max(0, 10 - secondsRemaining) * 25;

    beepOsc.frequency.setValueAtTime(pitch, now);
    beepGain.gain.setValueAtTime(isUrgent ? 0.22 : 0.12, now);
    beepGain.gain.exponentialRampToValueAtTime(0.001, now + (isUrgent ? 0.14 : 0.08));

    beepOsc.connect(beepGain);
    beepGain.connect(ctx.destination);
    beepOsc.start(now);
    beepOsc.stop(now + (isUrgent ? 0.14 : 0.08));
  } catch {
    // Ignore audio glitches
  }
}

/**
 * High energy launch sound effect when countdown reaches 0 ("COMEÇOU!")
 */
export function playCountdownLaunch() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Rising energy laser sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.35);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.38);

    // Punchy sub drop
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(140, now);
    sub.frequency.exponentialRampToValueAtTime(45, now + 0.32);
    subGain.gain.setValueAtTime(0.35, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.35);
  } catch {
    // Ignore
  }
}

/**
 * Elimination sound when a contestant drops out
 */
export function playEliminationDrop() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.25);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  } catch {
    // Ignore
  }
}

/**
 * Pleasant metallic coin chime when adding coins or saving
 */
export function playCoinChime() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(987.77, now); // B5
    osc1.frequency.setValueAtTime(1318.51, now + 0.08); // E6

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1975.53, now); // B6
    osc2.frequency.setValueAtTime(2637.02, now + 0.08); // E7

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.35);
    osc2.stop(now + 0.35);
  } catch {
    // Ignore
  }
}

/**
 * Triumphant fanfare chord when the winner is revealed
 */
export function playWinnerFanfare() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);

      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0.18, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.9);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.9);
    });

    const bass = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(261.63, now + 0.3); // C4
    bassGain.gain.setValueAtTime(0.2, now + 0.3);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

    bass.connect(bassGain);
    bassGain.connect(ctx.destination);
    bass.start(now + 0.3);
    bass.stop(now + 1.6);
  } catch {
    // Ignore
  }
}
