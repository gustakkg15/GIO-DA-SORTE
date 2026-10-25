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
  const OFFICIAL_SUPPORT_EMAIL = 'gustakkg15@gmail.com';
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
      <div className="bg-gradient-to-br from-blue-900/40 via-slate-900 to-slate-950 border border-blue-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600/30 border border-blue-400/40 text-sky-300 text-xs font-bold uppercase tracking-wider">
            <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-400" />
            <span>Colaboração & Gratidão</span>
          </div>

          <h2 className="font-display font-black text-2xl sm:text-4xl text-white tracking-tight">
            Ajude a Manter o GIO DA SORTE Ativo e 100% Gratuito
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            O <b>GIO DA SORTE</b> foi desenvolvido com carinho para ser uma plataforma limpa, sem assinaturas pagas. Para garantir que os servidores rápidos, os bancos de dados e as ferramentas ao vivo continuem sempre disponíveis para a comunidade, você pode contribuir voluntariamente com qualquer valor via Pix ou PayPal, ou apoiar divulgando o projeto!
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Column: Direct Support with Pix & PayPal (7 cols) */}
        <div className="md:col-span-7 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            {/* Payment Method Switcher Tabs */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Coffee className="w-5 h-5 text-sky-400" />
                <h3 className="font-display font-bold text-lg text-white">Contribuição Espontânea</h3>
              </div>

              <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSelectedMethod('pix')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                    selectedMethod === 'pix'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-slate-200'
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
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-slate-200'
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
                  <span className="text-xs text-slate-400">Transferência rápida e sem taxas pelo banco do Brasil</span>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-1 rounded-full">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Chave Oficial Verificada</span>
                  </div>
                </div>

                {/* Pix Visual Display Box */}
                <div className="bg-gradient-to-br from-blue-950/60 to-slate-950 border-2 border-blue-500/50 rounded-2xl p-5 space-y-4 shadow-lg shadow-blue-950/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-300">
                      <QrCode className="w-4 h-4 text-sky-400" />
                      <span>Chave Pix Oficial</span>
                    </div>
                    <span className="text-[10px] font-mono bg-blue-900/60 border border-blue-700/60 text-sky-200 px-2 py-0.5 rounded-full">
                      Instantâneo 24h
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                    <div className="font-mono text-sm sm:text-base font-bold text-white break-all select-all">
                      {pixKey}
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyPix}
                      className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 shadow-md shadow-blue-600/30"
                    >
                      {copiedPixKey ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
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
                    <span className="text-xs font-semibold text-slate-400 block">Valores sugeridos de incentivo:</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                      <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl">
                        <span className="font-bold text-white block">R$ 2,00</span>
                        <span className="text-[10px] text-slate-400">Um cafezinho ☕</span>
                      </div>
                      <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl">
                        <span className="font-bold text-sky-400 block">R$ 5,00</span>
                        <span className="text-[10px] text-slate-400">Moeda da sorte 🪙</span>
                      </div>
                      <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl">
                        <span className="font-bold text-emerald-400 block">R$ 10,00</span>
                        <span className="text-[10px] text-slate-400">Incentivo top 🚀</span>
                      </div>
                      <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl">
                        <span className="font-bold text-amber-400 block">R$ 25,00+</span>
                        <span className="text-[10px] text-slate-400">Super patrono 👑</span>
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
                  <span className="text-xs text-slate-400">Cartão de crédito, saldo PayPal e suporte internacional</span>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-300 bg-indigo-950/60 border border-indigo-500/40 px-2.5 py-1 rounded-full">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Conta Oficial Verificada</span>
                  </div>
                </div>

                {/* PayPal Visual Display Box */}
                <div className="bg-gradient-to-br from-indigo-950/60 via-blue-950/40 to-slate-950 border-2 border-indigo-500/50 rounded-2xl p-5 space-y-4 shadow-lg shadow-indigo-950/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-300">
                      <Globe className="w-4 h-4 text-indigo-400" />
                      <span>Conta PayPal Oficial</span>
                    </div>
                    <span className="text-[10px] font-mono bg-indigo-900/60 border border-indigo-700/60 text-indigo-200 px-2 py-0.5 rounded-full">
                      Cartão & Global
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-900/90 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="font-mono text-sm sm:text-base font-bold text-white break-all select-all">
                      {paypalAccount}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleCopyPaypal}
                        className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 border border-slate-700"
                      >
                        {copiedPaypal ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
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
                        className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-blue-600/30"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Abrir PayPal</span>
                      </a>
                    </div>
                  </div>

                  {/* Suggested contribution cards for PayPal with direct links */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-400 block">Valores sugeridos com 1 clique:</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                      <a
                        href={getPaypalLink(5)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-xl transition group block"
                      >
                        <span className="font-bold text-white group-hover:text-sky-300 block">R$ 5,00</span>
                        <span className="text-[10px] text-slate-400">Moeda da sorte 🪙</span>
                      </a>
                      <a
                        href={getPaypalLink(15)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-xl transition group block"
                      >
                        <span className="font-bold text-sky-400 group-hover:text-sky-200 block">R$ 15,00</span>
                        <span className="text-[10px] text-slate-400">Apoio mensal ☕</span>
                      </a>
                      <a
                        href={getPaypalLink(30)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-xl transition group block"
                      >
                        <span className="font-bold text-emerald-400 group-hover:text-emerald-200 block">R$ 30,00</span>
                        <span className="text-[10px] text-slate-400">Incentivo live 🚀</span>
                      </a>
                      <a
                        href={getPaypalLink(60)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-xl transition group block"
                      >
                        <span className="font-bold text-amber-400 group-hover:text-amber-200 block">R$ 60,00+</span>
                        <span className="text-[10px] text-slate-400">Super patrono 👑</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="text-xs text-slate-400 flex items-center gap-1.5 justify-center">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Contribuição direta, segura e voluntária sem intermediários</span>
            </div>
          </div>

          {/* Transparent Cost Breakdown */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="font-display font-bold text-base text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span>Onde Sua Colaboração é Aplicada?</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <Server className="w-5 h-5 text-blue-400" />
                <h4 className="font-bold text-white">Servidores & Tráfego</h4>
                <p className="text-slate-400 text-[11px]">
                  Mantém a resposta instantânea e o tempo de atividade 24/7 sem lentidões.
                </p>
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <Cloud className="w-5 h-5 text-sky-400" />
                <h4 className="font-bold text-white">Nuvem & Banco de Dados</h4>
                <p className="text-slate-400 text-[11px]">
                  Armazenamento seguro das contas de sorteadores e bilhetes de sorteios.
                </p>
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <Code2 className="w-5 h-5 text-emerald-400" />
                <h4 className="font-bold text-white">Evolução & Inovação</h4>
                <p className="text-slate-400 text-[11px]">
                  Criação contínua de novos modos como Roleta, Battle Royale e Overlays.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Support Without Spending & Gratitude Wall (5 cols) */}
        <div className="md:col-span-5 space-y-6">
          {/* Free Ways to Support Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="font-display font-bold text-base text-white flex items-center gap-2">
              <Share2 className="w-4 h-4 text-sky-400" />
              <span>Apoie Sem Gastar Nada</span>
            </h3>

            <p className="text-xs text-slate-400">
              Divulgar o GIO DA SORTE nos seus grupos, lives e comunidades nos ajuda imensamente a crescer!
            </p>

            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition active:scale-95"
            >
              {copiedLink ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Link Copiado com Sucesso!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-sky-400" />
                  <span>Compartilhar Link do GIO DA SORTE</span>
                </>
              )}
            </button>
          </div>

          {/* Gratitude Wall */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
              <MessageSquare className="w-4 h-4 text-sky-400" />
              <h3 className="font-display font-bold text-base text-white">Mural de Gratidão</h3>
            </div>

            {/* Leave a message form */}
            <form onSubmit={handleAddMessage} className="space-y-2">
              <input
                type="text"
                placeholder="Seu nome ou canal..."
                value={authorInput}
                onChange={(e) => setAuthorInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-400"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Escreva uma mensagem de incentivo..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-400"
                />
                <button
                  type="submit"
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg transition shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>

            {/* Message feed */}
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {messages.map((m) => (
                <div key={m.id} className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="font-bold text-sky-300">{m.name}</span>
                    <span className="text-[10px] text-slate-500">{m.date}</span>
                  </div>
                  <p className="text-slate-300 text-xs italic">"{m.text}"</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
