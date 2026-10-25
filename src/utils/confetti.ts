import confetti from 'canvas-confetti';

/**
 * Triggers a royal sapphire and cyan ribbon confetti explosion for GIO DA SORTE
 */
export function fireWinnerConfetti() {
  if (typeof window === 'undefined') return;

  const count = 220;
  const defaults = {
    origin: { y: 0.65 },
    zIndex: 9999,
  };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  // Sapphire blue + Electric Cyan + Silver shimmer
  fire(0.25, {
    spread: 28,
    startVelocity: 55,
    colors: ['#2563eb', '#38bdf8', '#60a5fa'],
  });
  fire(0.2, {
    spread: 60,
    colors: ['#0284c7', '#06b6d4', '#ffffff', '#3b82f6'],
  });
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
    colors: ['#38bdf8', '#93c5fd', '#f0f9ff'],
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    colors: ['#1d4ed8', '#0ea5e9', '#67e8f9'],
  });
  fire(0.1, {
    spread: 130,
    startVelocity: 45,
    colors: ['#1e40af', '#38bdf8', '#e0f2fe'],
  });
}
