import React, { useState, useEffect } from 'react';
import {
  User,
  ShieldCheck,
  ShieldAlert,
  Link2,
  Unlink,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Lock,
  ExternalLink,
} from 'lucide-react';
import type { User as FirebaseUser } from '../firebase';

export interface TikTokProfileData {
  linked: boolean;
  openId: string | null;
  displayName?: string;
  avatarUrl?: string;
  username?: string;
  scope?: string | null;
  linkedAt?: number | null;
  statusState?: 'CONNECTED' | 'DISCONNECTED' | 'LINKING' | 'EXPIRED' | 'CONFLICT';
}

interface UserProfileProps {
  currentUser: FirebaseUser | null;
  linkedTikTokProfile: TikTokProfileData;
  onStartLinkFlow: () => void;
  onUnlinkTikTok: () => Promise<void>;
  loading?: boolean;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  currentUser,
  linkedTikTokProfile,
  onStartLinkFlow,
  onUnlinkTikTok,
  loading = false,
}) => {
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!currentUser) return null;

  const isTikTokControlledUser = currentUser.uid.startsWith('gio_tt_');

  const handleConfirmDisconnect = async () => {
    setDisconnecting(true);
    setFeedbackMsg(null);
    try {
      await onUnlinkTikTok();
      setShowConfirmDisconnect(false);
      setFeedbackMsg({
        type: 'success',
        text: 'Integração TikTok desconectada com sucesso. Seus sorteios, bilhetes e conta GIO foram totalmente preservados.',
      });
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Falha ao desconectar conta TikTok.',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const statusBadge = () => {
    if (!linkedTikTokProfile.linked) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#080D18] text-[#A5B1C5] border border-[var(--gio-border-subtle)]">
          <Unlink className="w-3 h-3 text-[#A5B1C5]" /> Desconectado
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35">
        <CheckCircle2 className="w-3 h-3 text-[#A6C957]" /> Conectado
      </span>
    );
  };

  const handleDisplay = linkedTikTokProfile.username
    ? `@${linkedTikTokProfile.username.replace(/^@/, '')}`
    : null;

  return (
    <div className="space-y-4">
      {/* Primary Account Info Banner */}
      <div className="bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-2xl p-4 flex items-center gap-4">
        {currentUser.photoURL ? (
          <img
            src={currentUser.photoURL}
            alt={currentUser.displayName || 'Avatar'}
            referrerPolicy="no-referrer"
            className="w-14 h-14 rounded-full border-2 border-[#0131CD]/50 object-cover shrink-0 shadow-lg"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#0131CD] to-[#0131CD] text-[#FFFFFF] font-bold flex items-center justify-center text-xl shrink-0 border border-[#0131CD]/40 shadow-lg">
            {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : 'G'}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-[#FFFFFF] text-base truncate">
              {currentUser.displayName || 'Sorteador GIO'}
            </h3>
            {isTikTokControlledUser && (
              <span className="bg-[#0131CD]/20 text-[#FFFFFF] border border-[#0131CD]/40 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                TikTok Auth
              </span>
            )}
          </div>
          <div className="text-xs text-[#A5B1C5] truncate mt-0.5">{currentUser.email || 'Acesso via TikTok OAuth'}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[11px] text-[#A6C957] flex items-center gap-1 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" /> Firebase Auth OK
            </span>
          </div>
        </div>
      </div>

      {/* Dedicated TikTok Linked Account Card */}
      <div className="bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-2xl p-4 space-y-3.5">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--gio-border-subtle)]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#A6C957]" />
            <h4 className="font-bold text-sm text-[#FFFFFF]">Conta TikTok Vinculada</h4>
          </div>
          {statusBadge()}
        </div>

        {feedbackMsg && (
          <div
            className={`p-3 rounded-xl text-xs flex items-start gap-2.5 ${
              feedbackMsg.type === 'success'
                ? 'bg-[#A6C957]/15 border border-[#A6C957]/35 text-[#A6C957]'
                : 'bg-[#F05262]/15 border border-[#F05262]/40 text-[#F05262]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{feedbackMsg.text}</span>
          </div>
        )}

        {linkedTikTokProfile.linked ? (
          <div className="space-y-3">
            <div className="bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-xl p-3 flex items-center gap-3">
              {linkedTikTokProfile.avatarUrl ? (
                <img
                  src={linkedTikTokProfile.avatarUrl}
                  alt={linkedTikTokProfile.displayName || 'TikTok Avatar'}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full border border-[#0131CD]/40 object-cover shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#0131CD]/20 text-[#FFFFFF] border border-[#0131CD]/30 flex items-center justify-center font-bold text-sm shrink-0">
                  TT
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="font-bold text-xs text-[#FFFFFF] truncate">
                  {linkedTikTokProfile.displayName || 'Criador TikTok'}
                </div>
                {handleDisplay && (
                  <div className="text-xs font-semibold text-[#A6C957] truncate">{handleDisplay}</div>
                )}
                <div className="text-[11px] text-[#A5B1C5] truncate mt-0.5">
                  Escopo: {linkedTikTokProfile.scope || 'user.info.basic'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-[#A5B1C5]">
                Vínculo ativo via TikTok Login Kit v2
              </span>
              <button
                type="button"
                disabled={loading || disconnecting}
                onClick={() => setShowConfirmDisconnect(true)}
                className="px-3 py-1.5 rounded-xl bg-[#F05262]/15 hover:bg-[#F05262]/25 border border-[#F05262]/40 text-[#F05262] text-xs font-bold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Desconectar TikTok</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[#A5B1C5] leading-relaxed">
              Vincule sua conta oficial do TikTok para entrar rapidamente no GIO DA SORTE com 1 clique e manter seus sorteios e inscrições centralizados.
            </p>
            <button
              type="button"
              disabled={loading}
              onClick={onStartLinkFlow}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#0131CD] to-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-[#0131CD]/25 transition active:scale-95 disabled:opacity-50"
            >
              <Link2 className="w-4 h-4" />
              <span>Conectar Conta TikTok (OAuth 2.0)</span>
            </button>
          </div>
        )}
      </div>

      {/* Disconnect Confirmation Modal */}
      {showConfirmDisconnect && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#080D18]/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="bg-[#111B30] border border-[#F05262]/50 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#F05262]/15 border border-[#F05262]/40 flex items-center justify-center text-[#F05262] shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-[#FFFFFF]">Desconectar TikTok?</h4>
                <p className="text-[11px] text-[#A5B1C5]">Esta ação revoga o token de API oficial.</p>
              </div>
            </div>

            <div className="bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-xl p-3 text-xs text-[#A5B1C5] space-y-1.5 leading-relaxed">
              <p className="text-[#FFFFFF] font-semibold">O que acontece ao desconectar:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Sua conta GIO e plano continuam 100% preservados.</li>
                <li>Seus sorteios, bilhetes e histórico não serão excluídos.</li>
                <li>Seus tokens privados de API serão revogados do cofre.</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={disconnecting}
                onClick={() => setShowConfirmDisconnect(false)}
                className="py-2.5 px-3 rounded-xl bg-[#080D18] hover:bg-[#111B30] text-[#FFFFFF] text-xs font-bold transition border border-[var(--gio-border-subtle)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={disconnecting}
                onClick={handleConfirmDisconnect}
                className="py-2.5 px-3 rounded-xl bg-[#F05262] hover:brightness-110 text-[#FFFFFF] text-xs font-bold transition shadow-lg shadow-[#F05262]/30 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {disconnecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                <span>{disconnecting ? 'Desconectando...' : 'Sim, Desconectar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
