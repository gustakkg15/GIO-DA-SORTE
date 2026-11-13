import React, { useState } from 'react';
import {
  X,
  Calendar,
  Gift,
  Tv,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
} from 'lucide-react';
import { TikTokLiveSession, CampaignLegalStatus, CampaignMode } from '../types.js';
import { createCampaign, addSessionToCampaign } from '../utils/campaignService.js';

interface CampaignCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableSessions: TikTokLiveSession[];
  onCampaignCreated: () => void;
}

export const CampaignCreateModal: React.FC<CampaignCreateModalProps> = ({
  isOpen,
  onClose,
  availableSessions,
  onCampaignCreated,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [prizeName, setPrizeName] = useState('');
  const [campaignMode, setCampaignMode] = useState<CampaignMode>('SINGLE_DRAW');
  const [allowDuplicateWinners, setAllowDuplicateWinners] = useState<boolean>(false);
  const [startDateStr, setStartDateStr] = useState(() => new Date().toISOString().slice(0, 16));
  const [cutoffDays, setCutoffDays] = useState('7');
  const [eligibilityRule, setEligibilityRule] = useState<'ALL_TICKETS' | 'CUTOFF_TIMESTAMP' | 'CAMPAIGN_WINDOW'>('ALL_TICKETS');
  const [defaultRate, setDefaultRate] = useState('10');
  const [maxTicketsPerUser, setMaxTicketsPerUser] = useState('');
  const [maxTotalTickets, setMaxTotalTickets] = useState('');
  const [rulesSummary, setRulesSummary] = useState('');
  const [legalStatus, setLegalStatus] = useState<CampaignLegalStatus>('Pendente de análise');
  const [organizerName, setOrganizerName] = useState('');
  const [modality, setModality] = useState('Campanha Acumulada Multi-LIVE por Moedas Enviadas');
  const [resultsDisclosureChannel, setResultsDisclosureChannel] = useState(
    'Transmissão oficial ao vivo e certificado SHA-256 no painel'
  );
  const [contestationProcedure, setContestationProcedure] = useState(
    'Protocolo na Central de Suporte com ID da campanha e hash SHA-256'
  );
  const [authorizationDocumentation, setAuthorizationDocumentation] = useState('');

  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleSession = (sessionId: string) => {
    setSelectedSessionIds((prev) =>
      prev.includes(sessionId)
        ? prev.filter((id) => id !== sessionId)
        : [...prev, sessionId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Informe o título da Campanha.');
      return;
    }
    if (!prizeName.trim()) {
      setErrorMsg('Informe o nome do prêmio.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const parsedStart = startDateStr ? new Date(startDateStr).getTime() : Date.now();
      const startDate = Number.isFinite(parsedStart) ? parsedStart : Date.now();
      const days = parseInt(cutoffDays, 10) || 7;
      const cutoffDate = startDate + days * 24 * 60 * 60 * 1000;
      const parsedRate = Math.max(1, parseInt(defaultRate, 10) || 10);
      const parsedMaxPerUser =
        maxTicketsPerUser.trim() !== '' && Number(maxTicketsPerUser) > 0
          ? Math.floor(Number(maxTicketsPerUser))
          : null;
      const parsedMaxTotal =
        maxTotalTickets.trim() !== '' && Number(maxTotalTickets) > 0
          ? Math.floor(Number(maxTotalTickets))
          : null;

      const campaign = await createCampaign({
        title,
        description,
        prizeName,
        startDate,
        cutoffDate,
        defaultRate: parsedRate,
        maxTicketsPerUser: parsedMaxPerUser,
        maxTotalTickets: parsedMaxTotal,
        eligibilityRuleDefault: eligibilityRule,
        rulesSummary: rulesSummary.trim() || description.trim(),
        legalStatus,
        organizerName: organizerName.trim(),
        modality: modality.trim(),
        resultsDisclosureChannel: resultsDisclosureChannel.trim(),
        contestationProcedure: contestationProcedure.trim(),
        authorizationDocumentation: authorizationDocumentation.trim(),
        campaignMode,
        allowDuplicateWinners,
      });

      for (const sid of selectedSessionIds) {
        await addSessionToCampaign(campaign.campaignId, sid, {
          eligibilityRule,
          cutoffTimestamp: cutoffDate,
        });
      }

      onCampaignCreated();
      onClose();
    } catch (err) {
      setErrorMsg(`Erro ao criar campanha: ${(err as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-create-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#080D18]/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--gio-border-subtle)] bg-[#080D18]/60">
          <div className="flex items-center gap-3">
            <img
              src="/icon.svg"
              alt="GIO DA SORTE"
              className="w-8 h-8 object-contain shrink-0"
            />
            <div>
              <h2 id="campaign-create-modal-title" className="text-base font-bold text-[#FFFFFF] tracking-tight">Nova Campanha Multi-LIVE</h2>
              <p className="text-xs text-[#A5B1C5]">Configure regras, regulamento individual, status legal e transmissões vinculadas</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="p-1.5 text-[#A5B1C5] hover:text-[#FFFFFF] rounded-lg hover:bg-[#080D18] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-[#F05262]/15 border border-[#F05262]/40 text-xs text-[#FFFFFF] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#F05262]" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#FFFFFF] mb-1.5">
                Título da Campanha Acumulada *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Super Sorteio Acumulado da Semana"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] text-sm text-[#FFFFFF] placeholder-[#A5B1C5]/60 focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#FFFFFF] mb-1.5">
                Prêmio Oficial em Disputa *
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={prizeName}
                  onChange={(e) => setPrizeName(e.target.value)}
                  placeholder="Ex: iPhone 16 Pro Max 256GB"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] text-sm text-[#FFFFFF] placeholder-[#A5B1C5]/60 focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35 transition"
                />
                <Gift className="w-4 h-4 text-[#A6C957] absolute left-3 top-3" />
              </div>
            </div>
          </div>

          {/* Rules & Limits Row */}
          <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#FFFFFF]">
                Regras de Conversão e Limites da Campanha
              </span>
              <span className="text-[11px] font-medium text-[#A6C957]">Persistido no Firestore</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[#A5B1C5] mb-1">
                  Conversão Padrão (Moedas/Bilhete)
                </label>
                <input
                  type="number"
                  min={1}
                  value={defaultRate}
                  onChange={(e) => setDefaultRate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-xs tabular-nums text-[#FFFFFF] font-semibold focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30 transition"
                />
              </div>

              <div>
                <label className="block text-xs text-[#A5B1C5] mb-1">
                  Limite Máx. por Participante
                </label>
                <input
                  type="number"
                  min={1}
                  value={maxTicketsPerUser}
                  onChange={(e) => setMaxTicketsPerUser(e.target.value)}
                  placeholder="Sem limite (opcional)"
                  className="w-full px-3 py-2 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-xs tabular-nums text-[#FFFFFF] placeholder-[#A5B1C5]/60 focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30 transition"
                />
              </div>

              <div>
                <label className="block text-xs text-[#A5B1C5] mb-1">
                  Limite Total da Campanha
                </label>
                <input
                  type="number"
                  min={1}
                  value={maxTotalTickets}
                  onChange={(e) => setMaxTotalTickets(e.target.value)}
                  placeholder="Sem limite (opcional)"
                  className="w-full px-3 py-2 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-xs tabular-nums text-[#FFFFFF] placeholder-[#A5B1C5]/60 focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30 transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs text-[#A5B1C5] mb-1">
                  Modalidade do Ciclo da Campanha
                </label>
                <select
                  value={campaignMode}
                  onChange={(e) => setCampaignMode(e.target.value as CampaignMode)}
                  className="w-full px-3 py-2 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-xs text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35 transition"
                >
                  <option value="SINGLE_DRAW">Sorteio Único (1 ciclo oficial e encerramento)</option>
                  <option value="RECURRING_RESET">Recorrente com Reset (Zera bilhetes a cada ciclo)</option>
                  <option value="RECURRING_CUMULATIVE">Recorrente Acumulativo (Preserva bilhetes e saldo)</option>
                </select>
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#FFFFFF]">
                  <input
                    type="checkbox"
                    checked={allowDuplicateWinners}
                    onChange={(e) => setAllowDuplicateWinners(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--gio-border-subtle)] bg-[#111B30] text-[#0131CD] focus:ring-2 focus:ring-[#A6C957] focus:ring-offset-1 focus:ring-offset-[#080D18]"
                  />
                  <span>Permitir ganhadores repetidos entre ciclos</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#A5B1C5] mb-1">
                Regra de Elegibilidade das LIVEs Vinculadas
              </label>
              <select
                value={eligibilityRule}
                onChange={(e) => setEligibilityRule(e.target.value as 'ALL_TICKETS' | 'CUTOFF_TIMESTAMP' | 'CAMPAIGN_WINDOW')}
                className="w-full px-3 py-2 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-xs text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35 transition"
              >
                <option value="ALL_TICKETS">Todos os bilhetes emitidos nas LIVEs selecionadas</option>
                <option value="CUTOFF_TIMESTAMP">Bilhetes emitidos até a data de encerramento</option>
                <option value="CAMPAIGN_WINDOW">Estritamente entre Data de Início e Encerramento</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#FFFFFF] mb-1.5">
                Data / Hora de Início
              </label>
              <input
                type="datetime-local"
                value={startDateStr}
                onChange={(e) => setStartDateStr(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] text-xs tabular-nums text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#FFFFFF] mb-1.5">
                Encerramento / Prazo da Campanha
              </label>
              <div className="relative">
                <select
                  value={cutoffDays}
                  onChange={(e) => setCutoffDays(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] text-xs text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35 transition"
                >
                  <option value="1">Encerrar em 1 dia (24h)</option>
                  <option value="3">Encerrar em 3 dias</option>
                  <option value="7">Encerrar em 7 dias (1 semana)</option>
                  <option value="15">Encerrar em 15 dias</option>
                  <option value="30">Encerrar em 30 dias (1 mês)</option>
                </select>
                <Calendar className="w-4 h-4 text-[#A6C957] absolute left-3 top-2.5" />
              </div>
            </div>
          </div>

          {/* Individual Campaign Regulation & Legal Status */}
          <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#FFFFFF]">
                Regulamento Individual e Status Legal da Campanha
              </span>
              <span className="text-[11px] text-[#A5B1C5]">Transparência Documental</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#A5B1C5] mb-1">
                  Identificação do Organizador Responsável
                </label>
                <input
                  type="text"
                  value={organizerName}
                  onChange={(e) => setOrganizerName(e.target.value)}
                  placeholder="Nome ou Razão Social do organizador"
                  className="w-full px-3 py-2 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-[#FFFFFF] placeholder-[#A5B1C5]/60 focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35 transition"
                />
              </div>

              <div>
                <label className="block text-xs text-[#A5B1C5] mb-1">
                  Status Legal / Documental
                </label>
                <select
                  value={legalStatus}
                  onChange={(e) => setLegalStatus(e.target.value as CampaignLegalStatus)}
                  className="w-full px-3 py-2 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-[#FFFFFF] font-medium focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35 transition"
                >
                  <option value="Pendente de análise">Pendente de análise</option>
                  <option value="Documentação pendente">Documentação pendente</option>
                  <option value="Aguardando autorização">Aguardando autorização</option>
                  <option value="Autorizada, após validação documental">
                    Autorizada, após validação documental
                  </option>
                  <option value="Não autorizada">Não autorizada</option>
                  <option value="Encerrada">Encerrada</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#A5B1C5] mb-1">
                  Modalidade e Divulgação dos Resultados
                </label>
                <input
                  type="text"
                  value={resultsDisclosureChannel}
                  onChange={(e) => setResultsDisclosureChannel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35 transition"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A5B1C5] mb-1">
                  Documentação / Número de Processo (Se aplicável)
                </label>
                <input
                  type="text"
                  value={authorizationDocumentation}
                  onChange={(e) => setAuthorizationDocumentation(e.target.value)}
                  placeholder="Informe apenas se houver documento validado"
                  className="w-full px-3 py-2 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-[#FFFFFF] placeholder-[#A5B1C5]/60 focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#A5B1C5] mb-1">
                Procedimento de Contestação e Regras de Participação
              </label>
              <textarea
                rows={2}
                value={rulesSummary || description}
                onChange={(e) => {
                  setRulesSummary(e.target.value);
                  setDescription(e.target.value);
                  setContestationProcedure(e.target.value);
                }}
                placeholder="Ex: Acúmulo válido para todas as transmissões oficiais da semana. Contestações via protocolo na Central de Suporte."
                className="w-full px-3.5 py-2 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-xs text-[#FFFFFF] placeholder-[#A5B1C5]/60 focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35 transition"
              />
            </div>
          </div>

          {/* Select Existing Sessions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[#FFFFFF]">
                Transmissões LIVE para Incluir Imediatamente
              </label>
              <span className="text-xs text-[#A6C957] tabular-nums font-medium">
                {selectedSessionIds.length} selecionada(s)
              </span>
            </div>

            {availableSessions.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] text-center text-xs text-[#A5B1C5]">
                Nenhuma LIVE anterior gravada no banco. Você poderá vincular novas transmissões a qualquer momento com a campanha aberta.
              </div>
            ) : (
              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                {availableSessions.map((session) => {
                  const isSelected = selectedSessionIds.includes(session.sessionId);
                  return (
                    <div
                      key={session.sessionId}
                      onClick={() => toggleSession(session.sessionId)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#080D18] border-[#0131CD] text-[#FFFFFF]'
                          : 'bg-[#080D18]/60 border-[var(--gio-border-subtle)] text-[#A5B1C5] hover:border-[#0131CD]/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Tv className="w-4 h-4 text-[#A6C957] shrink-0" />
                        <div className="truncate">
                          <p className="text-xs font-medium text-[#FFFFFF] truncate">
                            {session.raffleTitle || session.roomTitle || `LIVE @${session.username}`}
                          </p>
                          <p className="text-[11px] text-[#A5B1C5] tabular-nums">
                            {session.totalCoins.toLocaleString('pt-BR')} moedas enviadas · {session.currentTicketCounter} bilhetes
                          </p>
                        </div>
                      </div>
                      <div>
                        {isSelected ? (
                          <CheckCircle2 className="w-4 h-4 text-[#A6C957]" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-[var(--gio-border-subtle)]" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-[var(--gio-border-subtle)] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-[#A5B1C5] hover:text-[#FFFFFF] transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl font-semibold text-xs text-[#FFFFFF] bg-[#0131CD] hover:brightness-110 transition flex items-center gap-1.5 disabled:opacity-50 shadow-lg"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'Salvando Campanha...' : 'Criar Campanha Acumulada'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
