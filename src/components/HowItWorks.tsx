import React, { useState } from 'react';
import { HelpCircle, Calculator, CheckCircle2, ShieldCheck, Sparkles, Tv } from 'lucide-react';
import { RaffleSettings } from '../types';

interface HowItWorksProps {
  settings: RaffleSettings;
}

export const HowItWorks: React.FC<HowItWorksProps> = ({ settings }) => {
  const [testCoins, setTestCoins] = useState('250');

  const parsedCoins = parseInt(testCoins, 10) || 0;
  const calculatedTickets = Math.floor(parsedCoins / settings.rate);
  const remainder = parsedCoins % settings.rate;
  const coinsNeededForNext = settings.rate - remainder;

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols): Interactive Coin Simulator */}
        <div className="lg:col-span-5 gio-card p-6 space-y-4 border-[#0131CD]/45">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#161C2C]">
            <div className="w-9 h-9 rounded-xl bg-[#0131CD]/20 border border-[#0131CD]/35 flex items-center justify-center text-[#FFFFFF]">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg text-[#FFFFFF]">
                Simulador de Conversão de Moedas
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Taxa ativa: <strong className="font-mono text-[#FFFFFF]">{settings.rate} moedas = 1 bilhete</strong>
              </p>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
            Digite qualquer quantidade de moedas abaixo para simular quantos bilhetes um participante receberá automaticamente no <strong className="text-[#FFFFFF]">GIO DA SORTE</strong>.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                Quantidade de moedas do participante:
              </label>
              <input
                type="number"
                min="0"
                step="10"
                value={testCoins}
                onChange={(e) => setTestCoins(e.target.value)}
                className="gio-input font-mono font-bold text-base text-[#B9FC01] tabular-nums"
              />
            </div>

            <div className="p-4 rounded-xl bg-[#10141E] border border-[#161C2C] space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#94A3B8] font-medium">Bilhetes gerados:</span>
                <span className="font-mono font-extrabold text-[#B9FC01] text-base tabular-nums">
                  {calculatedTickets} {calculatedTickets === 1 ? 'bilhete' : 'bilhetes'}
                </span>
              </div>
              <p className="text-xs text-[#94A3B8]">
                {calculatedTickets === 0 ? (
                  <span className="text-[#B9FC01]">
                    Ainda sem bilhete. Faltam <strong className="font-mono text-[#FFFFFF]">{coinsNeededForNext} moedas</strong> para o 1º número.
                  </span>
                ) : remainder > 0 ? (
                  <span>
                    Recebe <strong className="font-mono text-[#FFFFFF]">{calculatedTickets} bilhetes</strong> e sobram{' '}
                    <strong className="font-mono text-[#FFFFFF]">{remainder} moedas</strong> (faltam{' '}
                    <span className="font-mono">{coinsNeededForNext}</span> para o próximo).
                  </span>
                ) : (
                  <span className="text-[#20C997] font-medium">
                    Conversão exata de <strong className="font-mono">{calculatedTickets} bilhetes</strong> sem sobras!
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column (7 cols): Manual Operacional */}
        <div className="lg:col-span-7 gio-card p-6 space-y-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#161C2C]">
            <div className="w-9 h-9 rounded-xl bg-[#20C997]/15 border border-[#20C997]/35 flex items-center justify-center text-[#20C997]">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg text-[#FFFFFF]">
                Manual Rápido da Plataforma · GIO DA SORTE
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Funcionamento das regras proporcionais, criptografia e transmissão
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
            <div className="p-4 rounded-xl bg-[#10141E] border border-[#161C2C] space-y-1.5">
              <h3 className="font-bold text-[#FFFFFF] text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#20C997] shrink-0" />
                <span>1. Regra Proporcional</span>
              </h3>
              <p className="text-xs text-[#94A3B8]">
                A cada lote de <span className="font-mono text-[#FFFFFF]">{settings.rate}</span> moedas, o participante recebe 1 bilhete numerado. Quanto mais moedas acumular, maiores são suas chances matemáticas.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#10141E] border border-[#161C2C] space-y-1.5">
              <h3 className="font-bold text-[#FFFFFF] text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#B9FC01] shrink-0" />
                <span>2. Criptografia CSPRNG</span>
              </h3>
              <p className="text-xs text-[#94A3B8]">
                O sorteio utiliza entropia criptográfica (<code className="font-mono text-[#B9FC01]">crypto.getRandomValues</code>) e gera um hash imutável SHA-256 da lista de bilhetes.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#10141E] border border-[#161C2C] space-y-1.5">
              <h3 className="font-bold text-[#FFFFFF] text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#B9FC01] shrink-0" />
                <span>3. Globo Digital & Roleta</span>
              </h3>
              <p className="text-xs text-[#94A3B8]">
                Alterne livremente entre o <strong className="text-[#FFFFFF]">Globo Digital</strong> de bilhetes e a <strong className="text-[#FFFFFF]">Roleta Visual</strong> proporcional às cotas de cada participante.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#10141E] border border-[#161C2C] space-y-1.5">
              <h3 className="font-bold text-[#FFFFFF] text-sm flex items-center gap-2">
                <Tv className="w-4 h-4 text-[#B9FC01] shrink-0" />
                <span>4. Modo Telão & OBS</span>
              </h3>
              <p className="text-xs text-[#94A3B8]">
                Para transmissões ao vivo, utilize o <strong className="text-[#FFFFFF]">Modo Telão</strong> em tela cheia ou o <strong className="text-[#FFFFFF]">OBS Overlay</strong> com fundo transparente.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
