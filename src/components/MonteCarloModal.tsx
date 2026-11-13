import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Play, CheckCircle2, Copy, BarChart2, Sparkles } from 'lucide-react';
import { ComputedRaffle, RaffleSettings, Participant, MonteCarloResult } from '../types';
import { generateRosterHash, runMonteCarloSimulation } from '../utils/hash';

interface MonteCarloModalProps {
  isOpen: boolean;
  onClose: () => void;
  computed: ComputedRaffle;
  settings: RaffleSettings;
  participants: Participant[];
}

export const MonteCarloModal: React.FC<MonteCarloModalProps> = ({
  isOpen,
  onClose,
  computed,
  settings,
  participants,
}) => {
  const [hash, setHash] = useState<string>('');
  const [copiedHash, setCopiedHash] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResults, setSimulationResults] = useState<MonteCarloResult[]>([]);

  useEffect(() => {
    if (isOpen) {
      generateRosterHash(participants, settings).then(setHash);
    }
  }, [isOpen, participants, settings]);

  if (!isOpen) return null;

  const handleCopyHash = () => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      const results = runMonteCarloSimulation(computed, 10000);
      setSimulationResults(results);
      setIsSimulating(false);
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#080D18]/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="p-5 border-b border-[var(--gio-border-subtle)] flex items-center justify-between bg-[#080D18]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#A6C957]" />
            <h3 className="font-bold text-lg text-[#FFFFFF]">
              Auditoria de Honestidade & Simulação de Monte Carlo
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#111B30] rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs sm:text-sm text-[#A5B1C5]">
          {/* Cryptographic SHA-256 Seal */}
          <div className="bg-[#080D18] border border-[#A6C957]/30 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#A6C957] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Hash Criptográfico de Integridade (SHA-256)</span>
              </span>
              <button
                type="button"
                onClick={handleCopyHash}
                className="flex items-center gap-1 text-xs text-[#FFFFFF] bg-[#111B30] hover:bg-[#0131CD] px-2.5 py-1 rounded-md transition border border-[var(--gio-border-subtle)]"
              >
                {copiedHash ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#A6C957]" />
                    <span className="text-[#A6C957]">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Hash</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-[#A5B1C5]">
              Publique este hash no chat da live ou no grupo antes do sorteio. Qualquer mudança de nome, participante
              ou quantidade de moedas alterará completamente este hash, provando que o sorteio é 100% autêntico e
              imparcial.
            </p>

            <div className="p-2.5 bg-[#111B30] rounded-lg border border-[var(--gio-border-subtle)] font-mono text-[11px] text-[#A6C957] break-all select-all">
              {hash || 'Gerando assinatura...'}
            </div>
          </div>

          {/* Monte Carlo Simulator */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-base text-[#FFFFFF] flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-[#A6C957]" />
                  <span>Simulador Estatístico de 10.000 Sorteios</span>
                </h4>
                <p className="text-xs text-[#A5B1C5] mt-0.5">
                  Roda 10.000 sorteios matemáticos virtuais e compara a vitória simulada com a probabilidade teórica.
                </p>
              </div>

              <button
                type="button"
                disabled={isSimulating || computed.eligibleTickets.length === 0}
                onClick={handleRunSimulation}
                className="py-2.5 px-4 bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-xs rounded-xl transition shadow-md shadow-[#0131CD]/20 active:scale-95 flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
              >
                {isSimulating ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin" />
                    <span>Simulando 10k...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-[#FFFFFF]" />
                    <span>Executar Simulação (10k)</span>
                  </>
                )}
              </button>
            </div>

            {/* Results table */}
            {simulationResults.length > 0 && (
              <div className="border border-[var(--gio-border-subtle)] rounded-xl overflow-hidden bg-[#080D18]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#111B30] border-b border-[var(--gio-border-subtle)] text-[#A5B1C5] font-semibold">
                    <tr>
                      <th className="py-2 px-3">Participante</th>
                      <th className="py-2 px-2 text-center">Bilhetes</th>
                      <th className="py-2 px-2 text-right">Chance Teórica</th>
                      <th className="py-2 px-2 text-right">Vitórias (em 10k)</th>
                      <th className="py-2 px-2 text-right">Simulado (%)</th>
                      <th className="py-2 px-3 text-right">Desvio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--gio-border-subtle)] tabular-nums">
                    {simulationResults.slice(0, 15).map((res) => (
                      <tr key={res.participantId} className="hover:bg-[#111B30]/60">
                        <td className="py-2 px-3 font-bold text-[#FFFFFF] truncate max-w-[140px]">
                          {res.name}
                        </td>
                        <td className="py-2 px-2 text-center text-[#A5B1C5]">{res.tickets}</td>
                        <td className="py-2 px-2 text-right text-[#A5B1C5]">{res.theoreticalPct}%</td>
                        <td className="py-2 px-2 text-right text-[#A6C957] font-bold">{res.simulatedWins}</td>
                        <td className="py-2 px-2 text-right text-[#A6C957] font-bold">{res.simulatedPct}%</td>
                        <td
                          className={`py-2 px-3 text-right font-bold ${
                            Math.abs(res.difference) <= 1.0 ? 'text-[#A6C957]' : 'text-[#FFFFFF]'
                          }`}
                        >
                          {res.difference > 0 ? `+${res.difference}` : res.difference}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
