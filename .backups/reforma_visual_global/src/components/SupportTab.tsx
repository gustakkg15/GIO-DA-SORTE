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
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Gratitude Hero Banner */}
      <div className="bg-gradient-to-br from-[#0866F5]/20 via-[#101F3D] to-[#0B1730] border border-[#0866F5]/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#00A9FF]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0866F5]/25 border border-[#00A9FF]/40 text-[#00A9FF] text-xs font-bold uppercase tracking-wider">
            <Heart className="w-3.5 h-3.5 fill-[#00A9FF] text-[#00A9FF]" />
            <span>Colaboração & Gratidão</span>
          </div>

          <h2 className="font-display font-black text-2xl sm:text-4xl text-[#F8FAFC] tracking-tight">
            Ajude a Manter o GIO DA SORTE Ativo e 100% Gratuito
          </h2>

          <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
            O <b className="text-[#F8FAFC]">GIO DA SORTE</b> foi desenvolvido com carinho para ser uma plataforma limpa, sem assinaturas pagas. Para garantir que os servidores rápidos, os bancos de dados e as ferramentas ao vivo continuem sempre disponíveis para a comunidade, você pode contribuir voluntariamente com qualquer valor via Pix ou PayPal, ou apoiar divulgando o projeto!
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Column: Direct Support with Pix & PayPal (7 cols) */}
        <div className="md:col-span-7 space-y-6">
          <div className="bg-[#101F3D] border border-[#182943] rounded-2xl p-6 shadow-xl space-y-5">
            {/* Payment Method Switcher Tabs */}
            <div className="flex items-center justify-between pb-3 border-b border-[#182943]">
              <div className="flex items-center gap-2">
                <Coffee className="w-5 h-5 text-[#00A9FF]" />
                <h3 className="font-display font-bold text-lg text-[#F8FAFC]">Contribuição Espontânea</h3>
              </div>

              <div className="flex items-center p-1 bg-[#050D20] border border-[#182943] rounded-xl">
                <button
                  type="button"
                  onClick={() => setSelectedMethod('pix')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                    selectedMethod === 'pix'
                      ? 'bg-[#0866F5] text-[#F8FAFC] shadow-md shadow-[#0866F5]/30'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
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
                      ? 'bg-[#0866F5] text-[#F8FAFC] shadow-md shadow-[#0866F5]/30'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
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
                  <span className="text-xs text-[#94A3B8]">Transferência rápida e sem taxas pelo Banco Central</span>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#20C997] bg-[#20C997]/15 border border-[#20C997]/40 px-2.5 py-1 rounded-full">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#20C997]" />
                    <span>Chave Oficial Verificada</span>
                  </div>
                </div>

                {/* Pix Visual Display Box */}
                <div className="bg-[#0B1730] border border-[#0866F5]/50 rounded-2xl p-5 space-y-4 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#00A9FF]">
                      <QrCode className="w-4 h-4 text-[#00A9FF]" />
                      <span>Chave Pix Oficial</span>
                    </div>
                    <span className="text-[10px] font-mono bg-[#0866F5]/20 border border-[#0866F5]/40 text-[#35B9F5] px-2 py-0.5 rounded-full">
                      Instantâneo 24h
                    </span>
                  </div>

                  <div className="p-3.5 bg-[#050D20] rounded-xl border border-[#182943] flex items-center justify-between gap-3">
                    <div className="font-mono text-sm sm:text-base font-bold text-[#F8FAFC] break-all select-all">
                      {pixKey}
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyPix}
                      className="px-3.5 py-2 rounded-lg bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-bold text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 shadow-md shadow-[#0866F5]/30"
                    >
                      {copiedPixKey ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#20C997]" />
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
                    <span className="text-xs font-semibold text-[#94A3B8] block">Valores sugeridos de incentivo:</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                      <div className="p-2 bg-[#101F3D] border border-[#182943] rounded-xl">
                        <span className="font-mono font-bold text-[#F8FAFC] block">R$ 2,00</span>
                        <span className="text-[10px] text-[#94A3B8]">Um cafezinho ☕</span>
                      </div>
                      <div className="p-2 bg-[#101F3D] border border-[#182943] rounded-xl">
                        <span className="font-mono font-bold text-[#00A9FF] block">R$ 5,00</span>
                        <span className="text-[10px] text-[#94A3B8]">Moeda da sorte 🪙</span>
                      </div>
                      <div className="p-2 bg-[#101F3D] border border-[#182943] rounded-xl">
                        <span className="font-mono font-bold text-[#20C997] block">R$ 10,00</span>
                        <span className="text-[10px] text-[#94A3B8]">Incentivo top 🚀</span>
                      </div>
                      <div className="p-2 bg-[#101F3D] border border-[#182943] rounded-xl">
                        <span className="font-mono font-bold text-[#F5B942] block">R$ 25,00+</span>
                        <span className="text-[10px] text-[#94A3B8]">Super patrono 👑</span>
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
                  <span className="text-xs text-[#94A3B8]">Cartão de crédito, saldo PayPal e suporte internacional</span>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#35B9F5] bg-[#0866F5]/20 border border-[#00A9FF]/40 px-2.5 py-1 rounded-full">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#00A9FF]" />
                    <span>Conta Oficial Verificada</span>
                  </div>
                </div>

                {/* PayPal Visual Display Box */}
                <div className="bg-[#0B1730] border border-[#00A9FF]/50 rounded-2xl p-5 space-y-4 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#00A9FF]">
                      <Globe className="w-4 h-4 text-[#00A9FF]" />
                      <span>Conta PayPal Oficial</span>
                    </div>
                    <span className="text-[10px] font-mono bg-[#0866F5]/20 border border-[#0866F5]/40 text-[#35B9F5] px-2 py-0.5 rounded-full">
                      Cartão & Global
                    </span>
                  </div>

                  <div className="p-3.5 bg-[#050D20] rounded-xl border border-[#182943] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="font-mono text-sm sm:text-base font-bold text-[#F8FAFC] break-all select-all">
                      {paypalAccount}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleCopyPaypal}
                        className="px-3 py-2 rounded-lg bg-[#101F3D] hover:bg-[#182943] text-[#F8FAFC] font-bold text-xs flex items-center gap-1.5 transition active:scale-95 border border-[#182943]"
                      >
                        {copiedPaypal ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#20C997]" />
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
                        className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-[#0866F5] to-[#00A9FF] hover:from-[#00A9FF] hover:to-[#35B9F5] text-[#F8FAFC] font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-[#0866F5]/30"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Abrir PayPal</span>
                      </a>
                    </div>
                  </div>

                  {/* Suggested contribution cards for PayPal with direct links */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-[#94A3B8] block">Valores sugeridos com 1 clique:</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                      <a
                        href={getPaypalLink(5)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-[#101F3D] hover:bg-[#182943] border border-[#182943] hover:border-[#00A9FF]/50 rounded-xl transition group block"
                      >
                        <span className="font-mono font-bold text-[#F8FAFC] group-hover:text-[#00A9FF] block">R$ 5,00</span>
                        <span className="text-[10px] text-[#94A3B8]">Moeda da sorte 🪙</span>
                      </a>
                      <a
                        href={getPaypalLink(15)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-[#101F3D] hover:bg-[#182943] border border-[#182943] hover:border-[#00A9FF]/50 rounded-xl transition group block"
                      >
                        <span className="font-mono font-bold text-[#00A9FF] group-hover:text-[#35B9F5] block">R$ 15,00</span>
                        <span className="text-[10px] text-[#94A3B8]">Apoio mensal ☕</span>
                      </a>
                      <a
                        href={getPaypalLink(30)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-[#101F3D] hover:bg-[#182943] border border-[#182943] hover:border-[#00A9FF]/50 rounded-xl transition group block"
                      >
                        <span className="font-mono font-bold text-[#20C997] block">R$ 30,00</span>
                        <span className="text-[10px] text-[#94A3B8]">Incentivo live 🚀</span>
                      </a>
                      <a
                        href={getPaypalLink(60)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-[#101F3D] hover:bg-[#182943] border border-[#182943] hover:border-[#00A9FF]/50 rounded-xl transition group block"
                      >
                        <span className="font-mono font-bold text-[#F5B942] block">R$ 60,00+</span>
                        <span className="text-[10px] text-[#94A3B8]">Super patrono 👑</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="text-xs text-[#94A3B8] flex items-center gap-1.5 justify-center">
              <ShieldCheck className="w-4 h-4 text-[#20C997] shrink-0" />
              <span>Contribuição direta, segura e voluntária sem intermediários</span>
            </div>
          </div>

          {/* Transparent Cost Breakdown */}
          <div className="bg-[#101F3D] border border-[#182943] rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="font-display font-bold text-base text-[#F8FAFC] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#00A9FF]" />
              <span>Onde Sua Colaboração é Aplicada?</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 bg-[#050D20] border border-[#182943] rounded-xl space-y-1">
                <Server className="w-5 h-5 text-[#0866F5]" />
                <h4 className="font-bold text-[#F8FAFC]">Servidores & Tráfego</h4>
                <p className="text-[#94A3B8] text-[11px]">
                  Mantém a resposta instantânea e o tempo de atividade 24/7 sem lentidões.
                </p>
              </div>

              <div className="p-3.5 bg-[#050D20] border border-[#182943] rounded-xl space-y-1">
                <Cloud className="w-5 h-5 text-[#00A9FF]" />
                <h4 className="font-bold text-[#F8FAFC]">Nuvem & Banco de Dados</h4>
                <p className="text-[#94A3B8] text-[11px]">
                  Armazenamento seguro das contas de sorteadores e bilhetes de sorteios.
                </p>
              </div>

              <div className="p-3.5 bg-[#050D20] border border-[#182943] rounded-xl space-y-1">
                <Code2 className="w-5 h-5 text-[#20C997]" />
                <h4 className="font-bold text-[#F8FAFC]">Evolução & Inovação</h4>
                <p className="text-[#94A3B8] text-[11px]">
                  Criação contínua de novos modos como Roleta, Battle Royale e Overlays.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Support Without Spending & Gratitude Wall (5 cols) */}
        <div className="md:col-span-5 space-y-6">
          {/* Free Ways to Support Card */}
          <div className="bg-[#101F3D] border border-[#182943] rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="font-display font-bold text-base text-[#F8FAFC] flex items-center gap-2">
              <Share2 className="w-4 h-4 text-[#00A9FF]" />
              <span>Apoie Sem Gastar Nada</span>
            </h3>

            <p className="text-xs text-[#94A3B8]">
              Divulgar o GIO DA SORTE nos seus grupos, lives e comunidades nos ajuda imensamente a crescer!
            </p>

            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full py-3 px-4 rounded-xl bg-[#050D20] hover:bg-[#0B1730] text-[#F8FAFC] font-bold text-xs flex items-center justify-center gap-2 border border-[#182943] hover:border-[#00A9FF]/50 transition active:scale-95"
            >
              {copiedLink ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#20C997]" />
                  <span>Link Copiado com Sucesso!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-[#00A9FF]" />
                  <span>Compartilhar Link do GIO DA SORTE</span>
                </>
              )}
            </button>
          </div>

          {/* Gratitude Wall */}
          <div className="bg-[#101F3D] border border-[#182943] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[#182943]">
              <MessageSquare className="w-4 h-4 text-[#00A9FF]" />
              <h3 className="font-display font-bold text-base text-[#F8FAFC]">Mural de Gratidão</h3>
            </div>

            {/* Leave a message form */}
            <form onSubmit={handleAddMessage} className="space-y-2">
              <input
                type="text"
                placeholder="Seu nome ou canal..."
                value={authorInput}
                onChange={(e) => setAuthorInput(e.target.value)}
                className="w-full bg-[#050D20] border border-[#182943] rounded-lg p-2 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#00A9FF]"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Escreva uma mensagem de incentivo..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  className="flex-1 bg-[#050D20] border border-[#182943] rounded-lg p-2 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#00A9FF]"
                />
                <button
                  type="submit"
                  className="px-3 py-2 bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-bold text-xs rounded-lg transition shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>

            {/* Message feed */}
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {messages.map((m) => (
                <div key={m.id} className="p-3 bg-[#050D20] border border-[#182943] rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between text-[#94A3B8]">
                    <span className="font-bold text-[#00A9FF]">{m.name}</span>
                    <span className="text-[10px] text-[#64748B]">{m.date}</span>
                  </div>
                  <p className="text-[#F8FAFC] text-xs italic">"{m.text}"</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
