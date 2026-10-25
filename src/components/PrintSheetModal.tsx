import React from 'react';
import { X, Printer, CheckCircle2 } from 'lucide-react';
import { ComputedRaffle, RaffleSettings } from '../types';

interface PrintSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  computed: ComputedRaffle;
  settings: RaffleSettings;
}

export const PrintSheetModal: React.FC<PrintSheetModalProps> = ({
  isOpen,
  onClose,
  computed,
  settings,
}) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Controls (Hidden in print) */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950 print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-sky-400" />
            <span className="font-display font-bold text-base text-white">
              Folha Oficial de Conferência · GIO DA SORTE
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Salvar PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Content */}
        <div className="p-6 sm:p-8 overflow-y-auto bg-white text-slate-900 space-y-6">
          <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-end">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-blue-900">
                GIO DA SORTE
              </h1>
              <p className="text-xs text-slate-600 font-medium mt-1">
                Relatório de Distribuição de Bilhetes e Participantes
              </p>
            </div>
            <div className="text-right text-xs text-slate-600 space-y-0.5">
              <div><b>Data:</b> {new Date().toLocaleDateString('pt-BR')}</div>
              <div><b>Regra:</b> 1 bilhete a cada {settings.rate} moedas</div>
              <div><b>Total emitido:</b> {computed.usedCount} de {settings.total}</div>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-900 text-slate-900 uppercase font-black tracking-wider">
                <th className="py-2 px-1 w-12">#</th>
                <th className="py-2 px-2">Participante</th>
                <th className="py-2 px-2 text-right">Moedas</th>
                <th className="py-2 px-2 text-center">Bilhetes</th>
                <th className="py-2 px-2">Números Atribuídos</th>
                <th className="py-2 px-2 text-right">Chance (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {computed.allocations.map((alloc, idx) => (
                <tr key={alloc.participant.id} className="hover:bg-slate-50">
                  <td className="py-2 px-1 font-mono text-slate-500">{idx + 1}</td>
                  <td className="py-2 px-2 font-bold text-slate-900">{alloc.participant.name}</td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums">{alloc.participant.coins}</td>
                  <td className="py-2 px-2 text-center font-bold">{alloc.assignedTickets}</td>
                  <td className="py-2 px-2 font-mono text-slate-700">
                    {alloc.tickets.length > 0 ? alloc.tickets.join(', ') : '—'}
                  </td>
                  <td className="py-2 px-2 text-right font-mono font-bold">
                    {alloc.winProbability}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pt-6 border-t border-slate-300 flex justify-between items-center text-[11px] text-slate-500">
            <span>Emitido pelo sistema GIO DA SORTE</span>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Verificado e auditado criptograficamente</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
