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
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="font-display font-bold text-lg text-white">
              Auditoria de Honestidade & Simulação de Monte Carlo
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs sm:text-sm text-slate-300">
          {/* Cryptographic SHA-256 Seal */}
          <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Hash Criptográfico de Integridade (SHA-256)</span>
              </span>
              <button
                type="button"
                onClick={handleCopyHash}
                className="flex items-center gap-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-md transition"
              >
                {copiedHash ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Hash</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Publique este hash no chat da live ou no grupo antes do sorteio. Qualquer mudança de nome, participante
              ou quantidade de moedas alterará completamente este hash, provando que o sorteio é 100% autêntico e
              imparcial.
            </p>

            <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 font-mono text-[11px] text-amber-300 break-all select-all">
              {hash || 'Gerando assinatura...'}
            </div>
          </div>

          {/* Monte Carlo Simulator */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-display font-bold text-base text-white flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-amber-400" />
                  <span>Simulador Estatístico de 10.000 Sorteios</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Roda 10.000 sorteios matemáticos virtuais e compara a vitória simulada com a probabilidade teórica.
                </p>
              </div>

              <button
                type="button"
                disabled={isSimulating || computed.eligibleTickets.length === 0}
                onClick={handleRunSimulation}
                className="py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl transition shadow-md shadow-amber-400/20 active:scale-95 flex items-center justify-center gap-2 shrink-0"
              >
                {isSimulating ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin" />
                    <span>Simulando 10k...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-slate-950" />
                    <span>Executar Simulação (10k)</span>
                  </>
                )}
              </button>
            </div>

            {/* Results table */}
            {simulationResults.length > 0 && (
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="py-2 px-3">Participante</th>
                      <th className="py-2 px-2 text-center">Bilhetes</th>
                      <th className="py-2 px-2 text-right">Chance Teórica</th>
                      <th className="py-2 px-2 text-right">Vitórias (em 10k)</th>
                      <th className="py-2 px-2 text-right">Simulado (%)</th>
                      <th className="py-2 px-3 text-right">Desvio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {simulationResults.slice(0, 15).map((res) => (
                      <tr key={res.participantId} className="hover:bg-slate-900/40">
                        <td className="py-2 px-3 font-sans font-bold text-white truncate max-w-[140px]">
                          {res.name}
                        </td>
                        <td className="py-2 px-2 text-center text-slate-300">{res.tickets}</td>
                        <td className="py-2 px-2 text-right text-slate-300">{res.theoreticalPct}%</td>
                        <td className="py-2 px-2 text-right text-amber-400 font-bold">{res.simulatedWins}</td>
                        <td className="py-2 px-2 text-right text-amber-400 font-bold">{res.simulatedPct}%</td>
                        <td
                          className={`py-2 px-3 text-right font-bold ${
                            Math.abs(res.difference) <= 1.0 ? 'text-emerald-400' : 'text-slate-400'
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
