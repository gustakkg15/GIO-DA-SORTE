import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Sparkles } from 'lucide-react';
import { ComputedRaffle, Winner } from '../types';
import { playWheelTick, playWinnerFanfare } from '../utils/audio';
import { fireWinnerConfetti } from '../utils/confetti';
import { secureRandomInt } from '../utils/raffle';

interface FortuneWheelProps {
  computed: ComputedRaffle;
  isDrawing: boolean;
  onSpinStart: () => void;
  onSpinEnd: (winnerTicket: { number: number; participantId: string; name: string }) => void;
  latestWinner: Winner | null;
}

// Curated distinctive color palette for slices
const SLICE_COLORS = [
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#8b5cf6', // Purple
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#e11d48', // Rose
  '#3b82f6', // Blue
  '#84cc16', // Lime
  '#d97706', // Dark Amber
];

export const FortuneWheel: React.FC<FortuneWheelProps> = ({
  computed,
  isDrawing,
  onSpinStart,
  onSpinEnd,
  latestWinner,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentAngle, setCurrentAngle] = useState(0);
  const [activeContender, setActiveContender] = useState<string | null>(null);

  // Eligible participants with tickets
  const eligibleSlices = computed.allocations.filter((a) => a.assignedTickets > 0);
  const totalEligibleTickets = eligibleSlices.reduce((acc, a) => acc + a.assignedTickets, 0);

  // Animation refs
  const spinStateRef = useRef<{
    spinning: boolean;
    angularVelocity: number;
    angle: number;
    targetAngle: number;
    chosenTicket: { number: number; participantId: string; name: string } | null;
    lastTickSlice: number;
  }>({
    spinning: false,
    angularVelocity: 0,
    angle: 0,
    targetAngle: 0,
    chosenTicket: null,
    lastTickSlice: -1,
  });

  // Calculate slice boundaries
  const slicesWithAngles = React.useMemo(() => {
    let startAngle = 0;
    return eligibleSlices.map((item, idx) => {
      const sliceAngle = totalEligibleTickets > 0 ? (item.assignedTickets / totalEligibleTickets) * (Math.PI * 2) : 0;
      const mid = startAngle + sliceAngle / 2;
      const res = {
        item,
        startAngle,
        endAngle: startAngle + sliceAngle,
        midAngle: mid,
        color: SLICE_COLORS[idx % SLICE_COLORS.length],
      };
      startAngle += sliceAngle;
      return res;
    });
  }, [eligibleSlices, totalEligibleTickets]);

  // Draw the wheel on canvas
  const drawWheel = useCallback(
    (rotation: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const size = canvas.width;
      const center = size / 2;
      const radius = center - 24;

      ctx.clearRect(0, 0, size, size);

      // Save context for rotation
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(rotation);

      if (slicesWithAngles.length === 0) {
        // Empty wheel state
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }

      // Draw slices
      slicesWithAngles.forEach((slice) => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, slice.startAngle, slice.endAngle);
        ctx.closePath();
        ctx.fillStyle = slice.color;
        ctx.fill();

        // Slice borders
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Text labels inside slices
        const sliceSpan = slice.endAngle - slice.startAngle;
        if (sliceSpan > 0.08) {
          ctx.save();
          ctx.rotate(slice.midAngle);
          ctx.textAlign = 'right';
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 14px "Outfit", system-ui, sans-serif';

          // Format name truncate
          const displayName =
            slice.item.participant.name.length > 14
              ? slice.item.participant.name.slice(0, 12) + '…'
              : slice.item.participant.name;

          ctx.fillText(displayName, radius - 20, 5);

          if (sliceSpan > 0.18) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
            ctx.font = 'bold 11px "JetBrains Mono", monospace';
            ctx.fillText(`${slice.item.winProbability}%`, radius - 20, 20);
          }

          ctx.restore();
        }
      });

      // Outer gold metallic rim with decorative pegs
      ctx.restore();

      // Draw Sapphire / Silver Outer Ring
      ctx.save();
      ctx.translate(center, center);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.lineWidth = 14;
      const rimGrad = ctx.createLinearGradient(-radius, -radius, radius, radius);
      rimGrad.addColorStop(0, '#1d4ed8');
      rimGrad.addColorStop(0.5, '#38bdf8');
      rimGrad.addColorStop(1, '#2563eb');
      ctx.strokeStyle = rimGrad;
      ctx.stroke();

      // Rim Pegs (dots around the rim)
      const pegCount = Math.max(12, Math.min(36, slicesWithAngles.length * 2));
      for (let i = 0; i < pegCount; i++) {
        const ang = (i / pegCount) * Math.PI * 2 + rotation;
        const px = Math.cos(ang) * (radius - 2);
        const py = Math.sin(ang) * (radius - 2);
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#0c4a6e';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Central Hub
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fillStyle = '#2563eb';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px "Outfit", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', 0, 1);

      ctx.restore();

      // Draw Top Fixed Needle / Indicator Pointer (pointing DOWN into top of wheel at angle -PI/2)
      ctx.save();
      ctx.translate(center, 12);
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(14, 0);
      ctx.lineTo(0, 28);
      ctx.closePath();
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Needle pin center
      ctx.beginPath();
      ctx.arc(0, 4, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    },
    [slicesWithAngles]
  );

  // Redraw when angle or slices change
  useEffect(() => {
    drawWheel(currentAngle);
  }, [currentAngle, drawWheel]);

  // Handle Spin Execution with Physics
  const startSpin = () => {
    if (spinStateRef.current.spinning || isDrawing) return;
    const pool = computed.eligibleTickets;
    if (pool.length === 0) return;

    onSpinStart();

    // Pick winner cryptographically
    const chosenTicket = pool[secureRandomInt(pool.length)];
    const chosenSlice = slicesWithAngles.find((s) => s.item.participant.id === chosenTicket.participantId);

    // The needle points at the top of the canvas, which is -Math.PI / 2 (or 3*PI/2)
    // To have slice point to top needle: (rotation + slice.midAngle) % 2PI = 3*PI / 2
    const targetMid = chosenSlice ? chosenSlice.midAngle : 0;
    const needleAngle = (3 * Math.PI) / 2;

    // Add 6 to 10 full rotations for suspense
    const extraRotations = (7 + Math.random() * 3) * (Math.PI * 2);
    const targetAngle = currentAngle + extraRotations + (needleAngle - ((currentAngle + targetMid) % (Math.PI * 2)));

    spinStateRef.current = {
      spinning: true,
      angularVelocity: 0,
      angle: currentAngle,
      targetAngle,
      chosenTicket,
      lastTickSlice: -1,
    };

    const startTime = performance.now();
    const duration = 4500; // 4.5 seconds of thrilling spin
    const startAngle = currentAngle;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);

      // Smooth custom ease-out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3.5);
      const newAngle = startAngle + (targetAngle - startAngle) * easeOut;

      setCurrentAngle(newAngle);

      // Identify currently pointed slice and play needle click
      const normalizedAngle = (needleAngle - (newAngle % (Math.PI * 2)) + Math.PI * 4) % (Math.PI * 2);
      const currentSliceIdx = slicesWithAngles.findIndex(
        (s) => normalizedAngle >= s.startAngle && normalizedAngle < s.endAngle
      );

      if (currentSliceIdx !== -1 && currentSliceIdx !== spinStateRef.current.lastTickSlice) {
        spinStateRef.current.lastTickSlice = currentSliceIdx;
        setActiveContender(slicesWithAngles[currentSliceIdx].item.participant.name);
        playWheelTick(Math.max(0.04, 0.15 * (1 - progress)));
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Spin finished
        spinStateRef.current.spinning = false;
        playWinnerFanfare();
        fireWinnerConfetti();
        if (spinStateRef.current.chosenTicket) {
          onSpinEnd(spinStateRef.current.chosenTicket);
        }
      }
    };

    requestAnimationFrame(animate);
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      {/* Current Pointer Name Badge */}
      <div className="h-8 flex items-center justify-center">
        {isDrawing && activeContender ? (
          <div className="px-3 py-1 rounded-full bg-amber-400 text-slate-950 font-bold text-xs animate-pulse">
            Passando por: {activeContender}
          </div>
        ) : latestWinner ? (
          <div className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs border border-emerald-500/40">
            Vencedor: {latestWinner.name} (Bilhete #{latestWinner.number})
          </div>
        ) : (
          <div className="text-xs text-slate-400">
            {eligibleSlices.length} fatias proporcionais às moedas
          </div>
        )}
      </div>

      {/* Canvas Wheel */}
      <div className="relative p-2 rounded-full bg-slate-900 border-2 border-slate-800 shadow-2xl">
        <canvas
          ref={canvasRef}
          width={440}
          height={440}
          className="max-w-full h-auto w-[320px] sm:w-[400px] aspect-square rounded-full cursor-pointer select-none"
          onClick={startSpin}
        />
      </div>

      {/* Spin Button */}
      <button
        type="button"
        disabled={isDrawing || computed.eligibleTickets.length === 0}
        onClick={startSpin}
        className={`w-full max-w-sm py-3.5 px-6 rounded-xl font-display font-black text-lg flex items-center justify-center gap-2.5 transition active:scale-95 ${
          !isDrawing && computed.eligibleTickets.length > 0
            ? 'bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-600 text-white shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 hover:brightness-105 cursor-pointer ring-1 ring-sky-300/30'
            : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
        }`}
      >
        {isDrawing ? (
          <>
            <Sparkles className="w-5 h-5 animate-spin text-white" />
            <span>Girando a Roleta...</span>
          </>
        ) : (
          <>
            <Play className="w-5 h-5 fill-white" />
            <span>GIRAR ROLETA DA FORTUNA</span>
          </>
        )}
      </button>
    </div>
  );
};
