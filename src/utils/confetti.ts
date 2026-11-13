import { confetti } from '@tsparticles/confetti';
import canvasConfetti from 'canvas-confetti';

/**
 * Triggers a royal sapphire, cyan, and gold confetti explosion for GIO DA SORTE
 * utilizing @tsparticles/confetti with fallback to canvas-confetti
 */
export async function fireWinnerConfetti() {
  if (typeof window === 'undefined') return;

  try {
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 99999,
      disableForReducedMotion: true,
    };

    // 1. Initial high-speed central fountain burst
    await confetti({
      ...defaults,
      particleCount: 80,
      spread: 45,
      startVelocity: 60,
      colors: ['#0131CD', '#A6C957', '#FFFFFF', '#A5B1C5'],
      shapes: ['star', 'circle', 'square'],
      scalar: 1.1,
    });

    // 2. Wide dispersion flutter
    await confetti({
      ...defaults,
      particleCount: 120,
      spread: 110,
      decay: 0.92,
      startVelocity: 42,
      colors: ['#0131CD', '#A6C957', '#FFFFFF', '#A5B1C5'],
      shapes: ['circle', 'square'],
      scalar: 0.9,
    });
  } catch (err) {
    console.warn('Fallback to standard confetti burst:', err);
    // Reliable canvas-confetti fallback
    canvasConfetti({
      particleCount: 150,
      spread: 90,
      origin: { y: 0.65 },
      colors: ['#0131CD', '#A6C957', '#FFFFFF', '#A5B1C5'],
    });
  }
}

/**
 * Spectacular fireworks display utilizing tsParticles
 * Launches multiple mortar bursts from different horizontal positions
 */
export async function fireWinnerFireworks(durationMs = 2800) {
  if (typeof window === 'undefined') return;

  const animationEnd = Date.now() + durationMs;
  const colors = [
    ['#0131CD', '#A6C957', '#FFFFFF'],
    ['#A6C957', '#FFFFFF', '#A5B1C5'],
    ['#0131CD', '#FFFFFF', '#A6C957'],
    ['#0131CD', '#A6C957', '#A5B1C5'],
  ];

  let colorIdx = 0;

  const interval: ReturnType<typeof setInterval> = setInterval(async () => {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      clearInterval(interval);
      return;
    }

    const currentPalette = colors[colorIdx % colors.length];
    colorIdx++;

    // Mortar burst 1: Left to Center
    try {
      await confetti({
        particleCount: 45,
        angle: 60 + Math.random() * 20,
        spread: 55,
        origin: { x: 0.15 + Math.random() * 0.1, y: 0.75 },
        startVelocity: 50 + Math.random() * 15,
        colors: currentPalette,
        zIndex: 99999,
        shapes: ['circle', 'star'],
        scalar: 1.0,
      });

      // Mortar burst 2: Right to Center
      await confetti({
        particleCount: 45,
        angle: 120 - Math.random() * 20,
        spread: 55,
        origin: { x: 0.85 - Math.random() * 0.1, y: 0.75 },
        startVelocity: 50 + Math.random() * 15,
        colors: currentPalette,
        zIndex: 99999,
        shapes: ['circle', 'star'],
        scalar: 1.0,
      });

      // Mortar burst 3: High Center Sky Rocket
      if (Math.random() > 0.4) {
        await confetti({
          particleCount: 60,
          angle: 90,
          spread: 80,
          origin: { x: 0.5, y: 0.6 },
          startVelocity: 55,
          colors: ['#0131CD', '#A6C957', '#FFFFFF', '#A5B1C5'],
          zIndex: 99999,
          shapes: ['star', 'circle'],
          scalar: 1.2,
        });
      }
    } catch {
      // Fallback
      canvasConfetti({
        particleCount: 30,
        origin: { x: Math.random(), y: Math.random() * 0.5 + 0.3 },
      });
    }
  }, 380);
}

/**
 * Grand celebration sequence combining fireworks and confetti
 */
export async function fireCelebrationGrandShow() {
  await fireWinnerConfetti();
  fireWinnerFireworks(3200);
}
