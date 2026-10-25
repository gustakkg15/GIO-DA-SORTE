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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Interactive Coin Calculator */}
      <div className="bg-gradient-to-br from-blue-600/20 via-slate-900 to-slate-900 border border-blue-500/40 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-sky-400" />
          <h2 className="font-display font-bold text-lg text-white">Simulador de Moedas · GIO DA SORTE</h2>
        </div>

        <p className="text-xs sm:text-sm text-slate-300">
          Atualmente, a taxa configurada é de <b>{settings.rate} moedas por bilhete</b>. Teste abaixo quantas moedas
          uma pessoa tem para ver a quantidade exata de bilhetes que ela receberá no <b>GIO DA SORTE</b>.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-5">
            <label className="block text-xs text-slate-400 mb-1">Digite uma quantidade de moedas:</label>
            <input
              type="number"
              min="0"
              step="10"
              value={testCoins}
              onChange={(e) => setTestCoins(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-sky-400 font-bold focus:outline-none focus:border-blue-400 tabular-nums"
            />
          </div>

          <div className="sm:col-span-7 bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Resultado da conversão:</span>
              <span className="font-bold text-sky-400 text-sm">{calculatedTickets} bilhetes</span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              {calculatedTickets === 0 ? (
                <span className="text-sky-300/90">
                  Ainda sem bilhete. Faltam <b>{coinsNeededForNext} moedas</b> para conquistar o 1º número.
                </span>
              ) : remainder > 0 ? (
                <span>
                  Recebe <b>{calculatedTickets} bilhetes</b> e sobram <b>{remainder} moedas</b> (faltam {coinsNeededForNext} para o próximo).
                </span>
              ) : (
                <span>
                  Recebe exatamente <b>{calculatedTickets} bilhetes</b> sem sobras!
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Structured Guides */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
          <HelpCircle className="w-5 h-5 text-sky-400" />
          <h2 className="font-display font-bold text-lg text-white">Manual Completo · GIO DA SORTE</h2>
        </div>

        <div className="space-y-5 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <div className="space-y-1.5">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>1. Como funciona a regra proporcional por moedas?</span>
            </h3>
            <p className="text-slate-400 pl-6">
              A cada cota de moedas (definida por padrão em {settings.rate}), o participante recebe 1 bilhete com um
              número da sorte. Quanto mais moedas uma pessoa acumular em sua live, gincana ou comunidade, mais números
              ela terá e proporcionalmente maiores serão suas chances matemáticas no sorteio. Moedas que não completam
              um bilhete são consideradas sobras e não geram números.
            </p>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>2. Integridade e Aleatoriedade Criptográfica</span>
            </h3>
            <p className="text-slate-400 pl-6">
              O algoritmo de sorteio utiliza a API nativa de segurança do navegador (<code>crypto.getRandomValues</code>
              ), imune a repetições previsíveis de números ou fraudes. A seleção do número premiado é feita
              exclusivamente entre todos os bilhetes emitidos e válidos.
            </p>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span>3. Ordem dos números e Roleta da Fortuna</span>
            </h3>
            <p className="text-slate-400 pl-6">
              Você pode alternar entre o modo de <b>Bilhete Azul</b> e a <b>Roleta da Fortuna</b>, onde cada fatia é
              desenhada proporcionalmente ao percentual de chances de cada participante.
            </p>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Tv className="w-4 h-4 text-indigo-400" />
              <span>4. Transmissão ao vivo, OBS Studio e Modo Telão</span>
            </h3>
            <p className="text-slate-400 pl-6">
              Para apresentar o sorteio em live stream (OBS Studio, Twitch, YouTube), use o botão <b>"Modo Telão"</b> ou
              o <b>"OBS Overlay"</b> (com suporte a fundo transparente ou chroma key verde).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
