import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Sparkles, Play } from 'lucide-react';
import { ComputedRaffle, Winner } from '../types';
import { playWheelTick, playWinnerFanfare } from '../utils/audio';
import { fireWinnerConfetti } from '../utils/confetti';

interface FortuneWheelProps {
  computed: ComputedRaffle;
  isDrawing: boolean;
  onSpinStart: () => void;
  onSpinEnd: (winningTicket: { number: number; participantId: string; name: string }) => void;
  latestWinner: Winner | null;
  onRequestSpin?: () => void;
  spinSignal?: number;
  predeterminedWinningTicket?: { number: number; participantId: string; name: string } | null;
}

// Paleta Oficial Redesign 2.0 — Preto Profundo, Azul Royal e Lima Neon
const WHEEL_COLORS = [
  '#0131CD', // Azul Royal
  '#10141E', // Superfície
  '#B9FC01', // Lima Neon PRO
  '#161C2C', // Superfície Elevada
  '#0131CD', // Azul Royal
  '#080A0F', // Preto Profundo
  '#F5B942', // Dourado
  '#20C997', // Verde Sucesso
];

export const FortuneWheel: React.FC<FortuneWheelProps> = ({
  computed,
  isDrawing,
  onSpinStart,
  onSpinEnd,
  latestWinner,
  onRequestSpin,
  spinSignal,
  predeterminedWinningTicket,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentAngle, setCurrentAngle] = useState<number>(0);
  const [activeContender, setActiveContender] = useState<string>('');
  const currentAngleRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const lastSpinSignalRef = useRef<number>(spinSignal ?? 0);
  const onSpinStartRef = useRef(onSpinStart);
  const onSpinEndRef = useRef(onSpinEnd);

  useEffect(() => {
    onSpinStartRef.current = onSpinStart;
  }, [onSpinStart]);

  useEffect(() => {
    onSpinEndRef.current = onSpinEnd;
  }, [onSpinEnd]);

  // Build proportional slices based on eligible participants and their tickets
  const eligibleParticipantIds = React.useMemo(
    () => new Set(computed.eligibleTickets.map((t) => t.participantId)),
    [computed.eligibleTickets]
  );
  const eligibleSlices = React.useMemo(
    () =>
      computed.allocations.filter(
        (a) => a.assignedTickets > 0 && eligibleParticipantIds.has(a.participant.id)
      ),
    [computed.allocations, eligibleParticipantIds]
  );

  const totalEligibleTickets = computed.eligibleTickets.length;

  // Compute angles for each participant slice
  const slicesWithAngles = React.useMemo(() => {
    let start = 0;
    return eligibleSlices.map((item, idx) => {
      const fraction = totalEligibleTickets > 0 ? item.assignedTickets / totalEligibleTickets : 0;
      const arc = fraction * Math.PI * 2;
      const slice = {
        item,
        startAngle: start,
        endAngle: start + arc,
        midAngle: start + arc / 2,
        color: WHEEL_COLORS[idx % WHEEL_COLORS.length],
      };
      start += arc;
      return slice;
    });
  }, [eligibleSlices, totalEligibleTickets]);

  const slicesRef = useRef(slicesWithAngles);
  useEffect(() => {
    slicesRef.current = slicesWithAngles;
  }, [slicesWithAngles]);

  // Ref for animation loop state
  const spinStateRef = useRef<{
    spinning: boolean;
    chosenTicket: { number: number; participantId: string; name: string } | null;
    lastTickSlice: number;
  }>({
    spinning: false,
    chosenTicket: null,
    lastTickSlice: -1,
  });

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      spinStateRef.current.spinning = false;
    };
  }, []);

  // Draw the wheel on Canvas
  const drawWheel = useCallback(
    (rotation: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const size = canvas.width;
      const center = size / 2;
      const radius = center - 20;

      ctx.clearRect(0, 0, size, size);

      if (slicesWithAngles.length === 0) {
        ctx.save();
        ctx.translate(center, center);
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#10141E';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#161C2C';
        ctx.stroke();

        ctx.fillStyle = '#94A3B8';
        ctx.font = '600 15px "Inter", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Adicione participantes elegíveis', 0, -10);
        ctx.font = '400 12px "Inter", system-ui, sans-serif';
        ctx.fillText('para girar a Roleta Proporcional', 0, 12);
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(rotation);

      slicesWithAngles.forEach((slice) => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, slice.startAngle, slice.endAngle);
        ctx.closePath();

        ctx.fillStyle = slice.color;
        ctx.fill();

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#080A0F';
        ctx.stroke();

        const sliceAngle = slice.endAngle - slice.startAngle;
        if (sliceAngle > 0.09) {
          ctx.save();
          ctx.rotate(slice.midAngle);
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';

          const isLightSlice =
            slice.color === '#B9FC01' ||
            slice.color === '#F5B942' ||
            slice.color === '#20C997';
          ctx.fillStyle = isLightSlice ? '#080A0F' : '#FFFFFF';
          ctx.font = '600 13px "Inter", system-ui, sans-serif';

          const maxNameLen = 15;
          const rawName = slice.item.participant.name;
          const label = rawName.length > maxNameLen ? rawName.slice(0, maxNameLen - 1) + '…' : rawName;

          ctx.fillText(label, radius - 22, 0);

          if (sliceAngle > 0.22) {
            ctx.font = '500 10px "IBM Plex Mono", monospace';
            ctx.fillStyle = isLightSlice ? 'rgba(8,10,15,0.85)' : '#94A3B8';
            ctx.fillText(`${slice.item.assignedTickets} bil.`, radius - 22, 13);
          }

          ctx.restore();
        }
      });

      ctx.restore();

      // Outer Rim
      ctx.save();
      ctx.translate(center, center);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.lineWidth = 12;
      const rimGrad = ctx.createLinearGradient(-radius, -radius, radius, radius);
      rimGrad.addColorStop(0, '#161C2C');
      rimGrad.addColorStop(0.5, '#0131CD');
      rimGrad.addColorStop(1, '#161C2C');
      ctx.strokeStyle = rimGrad;
      ctx.stroke();

      const pegCount = Math.max(12, Math.min(36, slicesWithAngles.length * 2));
      for (let i = 0; i < pegCount; i++) {
        const ang = (i / pegCount) * Math.PI * 2 + rotation;
        const px = Math.cos(ang) * (radius - 1);
        const py = Math.sin(ang) * (radius - 1);
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = '#080A0F';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Central Hub
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.fillStyle = '#10141E';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#F5B942';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fillStyle = '#10141E';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0131CD';
      ctx.stroke();

      ctx.fillStyle = '#F5B942';
      ctx.font = 'bold 14px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', 0, 1);

      ctx.restore();

      // Top Fixed Needle
      ctx.save();
      ctx.translate(center, 12);
      ctx.beginPath();
      ctx.moveTo(-13, 0);
      ctx.lineTo(13, 0);
      ctx.lineTo(0, 26);
      ctx.closePath();
      ctx.fillStyle = '#F5B942';
      ctx.fill();
      ctx.strokeStyle = '#080A0F';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 5, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#080A0F';
      ctx.fill();
      ctx.restore();
    },
    [slicesWithAngles]
  );

  useEffect(() => {
    drawWheel(currentAngle);
  }, [currentAngle, drawWheel]);

  // Execute visual spin strictly targeting backend-determined winning ticket
  const startSpin = useCallback(
    (chosenTicket: { number: number; participantId: string; name: string }) => {
      if (spinStateRef.current.spinning) return;

      onSpinStartRef.current();

      const currentSlices = slicesRef.current;
      const chosenSlice = currentSlices.find(
        (s) => s.item.participant.id === chosenTicket.participantId
      );

      const startAngle = currentAngleRef.current;
      const targetMid = chosenSlice ? chosenSlice.midAngle : 0;
      const needleAngle = (3 * Math.PI) / 2; // Top 12 o'clock pointer
      const twoPi = Math.PI * 2;
      const currentAtNeedle = ((startAngle + targetMid) % twoPi + twoPi) % twoPi;
      const deltaToNeedle = ((needleAngle - currentAtNeedle) % twoPi + twoPi) % twoPi;
      const extraRotations = 8 * twoPi;
      const targetAngle = startAngle + extraRotations + deltaToNeedle;

      spinStateRef.current = {
        spinning: true,
        chosenTicket,
        lastTickSlice: -1,
      };

      const startTime = performance.now();
      const duration = 4500;

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const easeOut = 1 - Math.pow(1 - progress, 3.5);
        const newAngle = startAngle + (targetAngle - startAngle) * easeOut;

        currentAngleRef.current = newAngle;
        setCurrentAngle(newAngle);

        const activeSlices = slicesRef.current;
        if (activeSlices.length > 0) {
          const normalizedAngle = ((needleAngle - newAngle) % twoPi + twoPi) % twoPi;
          const currentSliceIdx = activeSlices.findIndex(
            (s) => normalizedAngle >= s.startAngle && normalizedAngle < s.endAngle
          );

          if (currentSliceIdx !== -1 && currentSliceIdx !== spinStateRef.current.lastTickSlice) {
            spinStateRef.current.lastTickSlice = currentSliceIdx;
            setActiveContender(activeSlices[currentSliceIdx].item.participant.name);
            playWheelTick(Math.max(0.04, 0.15 * (1 - progress)));
          }
        }

        if (progress < 1) {
          rafIdRef.current = requestAnimationFrame(animate);
        } else {
          rafIdRef.current = null;
          spinStateRef.current.spinning = false;
          setActiveContender(chosenTicket.name);
          playWinnerFanfare();
          fireWinnerConfetti();
          onSpinEndRef.current(chosenTicket);
        }
      };

      rafIdRef.current = requestAnimationFrame(animate);
    },
    []
  );

  // Trigger spin once per new spinSignal from parent with authoritative ticket
  useEffect(() => {
    if (
      spinSignal &&
      spinSignal > 0 &&
      spinSignal !== lastSpinSignalRef.current &&
      predeterminedWinningTicket
    ) {
      lastSpinSignalRef.current = spinSignal;
      startSpin(predeterminedWinningTicket);
    }
  }, [spinSignal, predeterminedWinningTicket, startSpin]);

  const handleUserTrigger = () => {
    if (spinStateRef.current.spinning || isDrawing) return;
    if (computed.eligibleTickets.length === 0) return;
    if (onRequestSpin) {
      onRequestSpin();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      {/* Live Contender / Status Indicator */}
      <div className="min-h-[32px] flex items-center justify-center">
        {isDrawing && activeContender ? (
          <div className="px-3.5 py-1 rounded-lg bg-[#161C2C] border border-[#F5B942]/60 text-[#FFFFFF] font-semibold text-xs animate-pulse">
            Apontando: <span className="text-[#F5B942]">{activeContender}</span>
          </div>
        ) : latestWinner && !isDrawing ? (
          <div className="px-4 py-1.5 rounded-lg bg-[#161C2C] text-[#FFFFFF] font-semibold text-xs border border-[#F5B942]/60 tabular-nums shadow-md">
            Contemplado: <span className="text-[#F5B942] font-bold">{latestWinner.name}</span> ·{' '}
            <span className="font-mono text-[#B9FC01]">#{latestWinner.number}</span>
          </div>
        ) : (
          <div className="text-xs text-[#94A3B8] font-mono tabular-nums">
            {eligibleSlices.length} {eligibleSlices.length === 1 ? 'participante elegível' : 'participantes elegíveis'} · {totalEligibleTickets} {totalEligibleTickets === 1 ? 'bilhete ativo' : 'bilhetes ativos'}
          </div>
        )}
      </div>

      {/* Canvas Wheel */}
      <div className="relative p-2.5 rounded-full bg-[#10141E] border border-[#161C2C] shadow-xl flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={440}
          height={440}
          className="w-[260px] min-[370px]:w-[300px] sm:w-[360px] md:w-[380px] max-w-full h-auto aspect-square rounded-full cursor-pointer select-none"
          onClick={handleUserTrigger}
          aria-label="Roleta proporcional interativa. Clique para girar."
        />
      </div>

      {/* Spin Button */}
      <button
        type="button"
        disabled={isDrawing || computed.eligibleTickets.length === 0}
        onClick={handleUserTrigger}
        className={`w-full min-h-[52px] py-3.5 px-6 rounded-xl font-extrabold text-sm sm:text-base flex items-center justify-center gap-2.5 transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B9FC01] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080A0F] ${
          !isDrawing && computed.eligibleTickets.length > 0
            ? 'bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] shadow-xl shadow-blue-600/25 cursor-pointer'
            : 'bg-[#161C2C] text-[#94A3B8] border border-[#161C2C] cursor-not-allowed opacity-60'
        }`}
      >
        {isDrawing ? (
          <>
            <Sparkles className="w-5 h-5 animate-spin text-[#FFFFFF]" />
            <span>Girando a Roleta...</span>
          </>
        ) : (
          <>
            <Play className="w-4 h-4 fill-current" />
            <span>SORTEAR AGORA NA ROLETA</span>
          </>
        )}
      </button>
    </div>
  );
};
