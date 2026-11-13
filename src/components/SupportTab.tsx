import React, { useState } from 'react';
import {
  Heart,
  Coffee,
  Copy,
  CheckCircle2,
  Sparkles,
  Share2,
  Server,
  Cloud,
  Code2,
  MessageSquare,
  Send,
  QrCode,
  ShieldCheck,
  CreditCard,
  ExternalLink,
  Globe,
  Lock,
} from 'lucide-react';
import { RaffleSettings } from '../types';

interface SupportTabProps {
  settings: RaffleSettings;
  onUpdateSettings?: (patch: Partial<RaffleSettings>) => void;
}

export const SupportTab: React.FC<SupportTabProps> = () => {
  const [selectedMethod, setSelectedMethod] = useState<'pix' | 'paypal'>('pix');

  // Official verified contribution accounts - locked to developer
  const OFFICIAL_SUPPORT_EMAIL = 'giodasorte@gmail.com';
  const pixKey = OFFICIAL_SUPPORT_EMAIL;
  const paypalAccount = OFFICIAL_SUPPORT_EMAIL;

  const [copiedPixKey, setCopiedPixKey] = useState(false);
  const [copiedPaypal, setCopiedPaypal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Community gratitude messages
  const [messages, setMessages] = useState<{ id: string; name: string; text: string; date: string }[]>([
    {
      id: 'm1',
      name: 'Comunidade Gio da Sorte',
      text: 'Obrigado por manter o sorteador gratuito e com cálculos matemáticos perfeitos para nossas lives!',
      date: 'Hoje',
    },
    {
      id: 'm2',
      name: 'Live Streamer VIP',
      text: 'A roleta da fortuna proporcional e o overlay para OBS salvaram os sorteios do meu canal!',
      date: 'Ontem',
    },
  ]);

  const [authorInput, setAuthorInput] = useState('');
  const [messageInput, setMessageInput] = useState('');

  const handleCopyPix = () => {
    navigator.clipboard.writeText(pixKey);
    setCopiedPixKey(true);
    setTimeout(() => setCopiedPixKey(false), 2500);
  };

  const handleCopyPaypal = () => {
    navigator.clipboard.writeText(paypalAccount);
    setCopiedPaypal(true);
    setTimeout(() => setCopiedPaypal(false), 2500);
  };

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const getPaypalLink = (amount?: number) => {
    const clean = paypalAccount.trim();
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return amount && clean.includes('paypal.me') ? `${clean}/${amount}BRL` : clean;
    }
    if (clean.includes('paypal.me/')) {
      const full = `https://${clean}`;
      return amount ? `${full}/${amount}BRL` : full;
    }
    // Default PayPal email direct payment / donation link
    const base = `https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=${encodeURIComponent(clean)}&item_name=${encodeURIComponent('Apoio ao GIO DA SORTE')}&currency_code=BRL`;
    return amount ? `${base}&amount=${amount}` : base;
  };

  const handleAddMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;
    const newMsg = {
      id: Date.now().toString(),
      name: authorInput.trim() || 'Apoiador Anônimo',
      text: messageInput.trim(),
      date: 'Agora',
    };
    setMessages([newMsg, ...messages]);
    setMessageInput('');
    setAuthorInput('');
  };

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Gratitude Hero Banner */}
      <div className="bg-gradient-to-br from-[#0131CD]/20 via-[#111B30] to-[#111B30] border border-[#0131CD]/40 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#0131CD]/25 border border-[#0131CD]/40 text-[#FFFFFF] text-xs font-semibold tracking-wide">
            <Heart className="w-3.5 h-3.5 fill-[#A6C957] text-[#A6C957]" />
            <span>Suporte & Comunidade</span>
          </div>

          <h2 className="font-bold text-2xl sm:text-3xl text-[#FFFFFF] tracking-tight">
            Apoie a Evolução Contínua do GIO DA SORTE
          </h2>

          <p className="text-xs sm:text-sm text-[#A5B1C5] leading-relaxed">
            O <b className="text-[#FFFFFF]">GIO DA SORTE</b> mantém a Mesa Oficial de Sorteio gratuita para toda a comunidade, além de oferecer recursos avançados de automação no plano PRO. Você também pode apoiar voluntariamente a infraestrutura do projeto ou enviar sugestões abaixo!
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Column: Direct Support with Pix & PayPal (7 cols) */}
        <div className="md:col-span-7 space-y-6">
          <div className="bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-2xl p-6 shadow-xl space-y-5">
            {/* Payment Method Switcher Tabs */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--gio-border-subtle)]">
              <div className="flex items-center gap-2">
                <Coffee className="w-5 h-5 text-[#A6C957]" />
                <h3 className="font-bold text-lg text-[#FFFFFF]">Contribuição Espontânea</h3>
              </div>

              <div className="flex items-center p-1 bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-xl">
                <button
                  type="button"
                  onClick={() => setSelectedMethod('pix')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                    selectedMethod === 'pix'
                      ? 'bg-[#0131CD] text-[#FFFFFF] shadow-md shadow-[#0131CD]/30'
                      : 'text-[#A5B1C5] hover:text-[#FFFFFF]'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Pix</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMethod('paypal')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                    selectedMethod === 'paypal'
                      ? 'bg-[#0131CD] text-[#FFFFFF] shadow-md shadow-[#0131CD]/30'
                      : 'text-[#A5B1C5] hover:text-[#FFFFFF]'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>PayPal</span>
                </button>
              </div>
            </div>

            {/* Pix Section */}
            {selectedMethod === 'pix' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#A5B1C5]">Transferência rápida e sem taxas pelo Banco Central</span>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#A6C957] bg-[#A6C957]/15 border border-[#A6C957]/35 px-2.5 py-1 rounded-full">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#A6C957]" />
                    <span>Chave Oficial Verificada</span>
                  </div>
                </div>

                {/* Pix Visual Display Box */}
                <div className="bg-[#080D18] border border-[#0131CD]/50 rounded-2xl p-5 space-y-4 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#A6C957]">
                      <QrCode className="w-4 h-4 text-[#A6C957]" />
                      <span>Chave Pix Oficial</span>
                    </div>
                    <span className="text-[10px] font-medium bg-[#0131CD]/20 border border-[#0131CD]/40 text-[#FFFFFF] px-2 py-0.5 rounded-full">
                      Instantâneo 24h
                    </span>
                  </div>

                  <div className="p-3.5 bg-[#111B30] rounded-xl border border-[var(--gio-border-subtle)] flex items-center justify-between gap-3">
                    <div className="text-sm sm:text-base font-semibold text-[#FFFFFF] break-all select-all">
                      {pixKey}
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyPix}
                      className="px-3.5 py-2 rounded-lg bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 shadow-md shadow-[#0131CD]/30"
                    >
                      {copiedPixKey ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#A6C957]" />
                          <span>Copiada!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copiar Chave</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Suggested contribution cards */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-[#A5B1C5] block">Valores sugeridos de incentivo:</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs tabular-nums">
                      <div className="p-2 bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-xl">
                        <span className="font-semibold text-[#FFFFFF] block">R$ 2,00</span>
                        <span className="text-[10px] text-[#A5B1C5]">Um cafezinho ☕</span>
                      </div>
                      <div className="p-2 bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-xl">
                        <span className="font-semibold text-[#FFFFFF] block">R$ 5,00</span>
                        <span className="text-[10px] text-[#A5B1C5]">Moeda da sorte 🪙</span>
                      </div>
                      <div className="p-2 bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-xl">
                        <span className="font-semibold text-[#FFFFFF] block">R$ 10,00</span>
                        <span className="text-[10px] text-[#A5B1C5]">Incentivo top 🚀</span>
                      </div>
                      <div className="p-2 bg-[#111B30] border border-[#A6C957]/35 rounded-xl">
                        <span className="font-semibold text-[#A6C957] block">R$ 25,00+</span>
                        <span className="text-[10px] text-[#A5B1C5]">Super patrono 👑</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PayPal Section */}
            {selectedMethod === 'paypal' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#A5B1C5]">Cartão de crédito, saldo PayPal e suporte internacional</span>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#FFFFFF] bg-[#0131CD]/20 border border-[#0131CD]/40 px-2.5 py-1 rounded-full">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#A6C957]" />
                    <span>Conta Oficial Verificada</span>
                  </div>
                </div>

                {/* PayPal Visual Display Box */}
                <div className="bg-[#080D18] border border-[#0131CD]/50 rounded-2xl p-5 space-y-4 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#A6C957]">
                      <Globe className="w-4 h-4 text-[#A6C957]" />
                      <span>Conta PayPal Oficial</span>
                    </div>
                    <span className="text-[10px] font-medium bg-[#0131CD]/20 border border-[#0131CD]/40 text-[#FFFFFF] px-2 py-0.5 rounded-full">
                      Cartão & Global
                    </span>
                  </div>

                  <div className="p-3.5 bg-[#111B30] rounded-xl border border-[var(--gio-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-sm sm:text-base font-semibold text-[#FFFFFF] break-all select-all">
                      {paypalAccount}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleCopyPaypal}
                        className="px-3 py-2 rounded-lg bg-[#080D18] hover:bg-[#0131CD]/20 text-[#FFFFFF] font-bold text-xs flex items-center gap-1.5 transition active:scale-95 border border-[var(--gio-border-subtle)]"
                      >
                        {copiedPaypal ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#A6C957]" />
                            <span>Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>

                      <a
                        href={getPaypalLink()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 rounded-lg bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-[#0131CD]/30"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Abrir PayPal</span>
                      </a>
                    </div>
                  </div>

                  {/* Suggested contribution cards for PayPal with direct links */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-[#A5B1C5] block">Valores sugeridos com 1 clique:</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs tabular-nums">
                      <a
                        href={getPaypalLink(5)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-[#111B30] hover:bg-[#0131CD]/20 border border-[var(--gio-border-subtle)] hover:border-[#0131CD]/50 rounded-xl transition group block"
                      >
                        <span className="font-semibold text-[#FFFFFF] group-hover:text-[#A6C957] block">R$ 5,00</span>
                        <span className="text-[10px] text-[#A5B1C5]">Moeda da sorte 🪙</span>
                      </a>
                      <a
                        href={getPaypalLink(15)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-[#111B30] hover:bg-[#0131CD]/20 border border-[var(--gio-border-subtle)] hover:border-[#0131CD]/50 rounded-xl transition group block"
                      >
                        <span className="font-semibold text-[#FFFFFF] group-hover:text-[#A6C957] block">R$ 15,00</span>
                        <span className="text-[10px] text-[#A5B1C5]">Apoio mensal ☕</span>
                      </a>
                      <a
                        href={getPaypalLink(30)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-[#111B30] hover:bg-[#0131CD]/20 border border-[var(--gio-border-subtle)] hover:border-[#0131CD]/50 rounded-xl transition group block"
                      >
                        <span className="font-semibold text-[#FFFFFF] group-hover:text-[#A6C957] block">R$ 30,00</span>
                        <span className="text-[10px] text-[#A5B1C5]">Incentivo live 🚀</span>
                      </a>
                      <a
                        href={getPaypalLink(60)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-[#111B30] hover:bg-[#0131CD]/20 border border-[#A6C957]/35 hover:border-[#A6C957]/60 rounded-xl transition group block"
                      >
                        <span className="font-semibold text-[#A6C957] block">R$ 60,00+</span>
                        <span className="text-[10px] text-[#A5B1C5]">Super patrono 👑</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="text-xs text-[#A5B1C5] flex items-center gap-1.5 justify-center">
              <ShieldCheck className="w-4 h-4 text-[#A6C957] shrink-0" />
              <span>Contribuição direta, segura e voluntária sem intermediários</span>
            </div>
          </div>

          {/* Transparent Cost Breakdown */}
          <div className="bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-base text-[#FFFFFF] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#A6C957]" />
              <span>Onde Sua Colaboração é Aplicada?</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-xl space-y-1">
                <Server className="w-5 h-5 text-[#35B9F5]" />
                <h4 className="font-bold text-[#FFFFFF]">Servidores & Tráfego</h4>
                <p className="text-[#A5B1C5] text-[11px]">
                  Mantém a resposta instantânea e o tempo de atividade 24/7 sem lentidões.
                </p>
              </div>

              <div className="p-3.5 bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-xl space-y-1">
                <Cloud className="w-5 h-5 text-[#35B9F5]" />
                <h4 className="font-bold text-[#FFFFFF]">Nuvem & Banco de Dados</h4>
                <p className="text-[#A5B1C5] text-[11px]">
                  Armazenamento seguro das contas de sorteadores e bilhetes de sorteios.
                </p>
              </div>

              <div className="p-3.5 bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-xl space-y-1">
                <Code2 className="w-5 h-5 text-[#35B9F5]" />
                <h4 className="font-bold text-[#FFFFFF]">Evolução & Inovação</h4>
                <p className="text-[#A5B1C5] text-[11px]">
                  Criação contínua de novos modos como Roleta, Battle Royale e Overlays.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Support Without Spending & Gratitude Wall (5 cols) */}
        <div className="md:col-span-5 space-y-6">
          {/* Free Ways to Support Card */}
          <div className="bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-base text-[#FFFFFF] flex items-center gap-2">
              <Share2 className="w-4 h-4 text-[#A5B1C5]" />
              <span>Apoie Sem Gastar Nada</span>
            </h3>

            <p className="text-xs text-[#A5B1C5]">
              Divulgar o GIO DA SORTE nos seus grupos, lives e comunidades nos ajuda imensamente a crescer!
            </p>

            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full py-3 px-4 rounded-xl bg-[#080D18] hover:bg-[#111B30] text-[#FFFFFF] font-bold text-xs flex items-center justify-center gap-2 border border-[var(--gio-border-subtle)] hover:border-[#0131CD]/50 transition active:scale-95"
            >
              {copiedLink ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#A6C957]" />
                  <span>Link Copiado com Sucesso!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-[#A5B1C5]" />
                  <span>Compartilhar Link do GIO DA SORTE</span>
                </>
              )}
            </button>
          </div>

          {/* Gratitude Wall */}
          <div className="bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--gio-border-subtle)]">
              <MessageSquare className="w-4 h-4 text-[#A5B1C5]" />
              <h3 className="font-bold text-base text-[#FFFFFF]">Mural de Gratidão</h3>
            </div>

            {/* Leave a message form */}
            <form onSubmit={handleAddMessage} className="space-y-2">
              <input
                type="text"
                placeholder="Seu nome ou canal..."
                value={authorInput}
                onChange={(e) => setAuthorInput(e.target.value)}
                className="w-full bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-lg p-2 text-xs text-[#FFFFFF] placeholder:text-[#A5B1C5] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Escreva uma mensagem de incentivo..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  className="flex-1 bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-lg p-2 text-xs text-[#FFFFFF] placeholder:text-[#A5B1C5] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30"
                />
                <button
                  type="submit"
                  className="px-3 py-2 bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-xs rounded-lg transition shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>

            {/* Message feed */}
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {messages.map((m) => (
                <div key={m.id} className="p-3 bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between text-[#A5B1C5]">
                    <span className="font-bold text-[#A6C957]">{m.name}</span>
                    <span className="text-[10px] text-[#A5B1C5]">{m.date}</span>
                  </div>
                  <p className="text-[#FFFFFF] text-xs italic">"{m.text}"</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
