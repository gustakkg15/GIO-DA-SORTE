import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Sparkles,
  Gift,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { PRIZE_PRESETS } from '../utils/prizePresets';

interface PrizeConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPrizeName: string;
  currentPrizeImage?: string;
  onSavePrize: (name: string, image: string) => void;
}

export const PrizeConfigModal: React.FC<PrizeConfigModalProps> = ({
  isOpen,
  onClose,
  currentPrizeName,
  currentPrizeImage = '',
  onSavePrize,
}) => {
  const [prizeName, setPrizeName] = useState(currentPrizeName || 'Prêmio Principal');
  const [prizeImage, setPrizeImage] = useState(currentPrizeImage || '');
  const [urlInput, setUrlInput] = useState('');
  const [activeTab, setActiveTab] = useState<'presets' | 'upload' | 'url'>('presets');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Handle local image file upload & compression
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Por favor selecione um arquivo de imagem válido (PNG, JPG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        // Resize canvas to max 400x400 to keep localStorage & sync ultra-fast
        const canvas = document.createElement('canvas');
        const maxDim = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/webp', 0.85);
          setPrizeImage(compressedDataUrl);
        } else {
          setPrizeImage(String(readerEvent.target?.result || ''));
        }
      };
      img.src = String(readerEvent.target?.result || '');
    };
    reader.readAsDataURL(file);
  };

  const handleApplyUrl = () => {
    if (!urlInput.trim()) return;
    setPrizeImage(urlInput.trim());
    setUrlInput('');
  };

  const handleSave = () => {
    const finalName = prizeName.trim() || 'Prêmio Principal';
    onSavePrize(finalName, prizeImage);
    onClose();
  };

  const quickNameSuggestions = [
    'Pix de R$ 100',
    'Pix de R$ 500',
    'Smartphone Top',
    'PlayStation 5',
    'Fone Bluetooth',
    'Cesta de Prêmios VIP',
    'Gift Card R$ 50',
    'Kit Gamer Completo',
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[#080D18]/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-[#111B30] border border-[#0131CD]/40 rounded-2xl max-w-xl w-full p-6 sm:p-7 shadow-2xl space-y-6 relative animate-slide-up">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--gio-border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#A6C957] text-[#080D18] flex items-center justify-center font-bold shadow-md">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-xl text-[#FFFFFF]">Prêmio do Sorteio</h3>
              <p className="text-xs text-[#A5B1C5]">Configure o nome e a foto do prêmio que será exibido aos participantes</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Preview Card */}
        <div className="bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-2xl p-4 flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl bg-[#111B30] border-2 border-[#A6C957]/50 flex items-center justify-center overflow-hidden shrink-0 shadow-lg relative group">
            {prizeImage ? (
              <img
                src={prizeImage}
                alt={prizeName}
                className="w-full h-full object-cover"
              />
            ) : (
              <Gift className="w-9 h-9 text-[#A6C957]" />
            )}
            {prizeImage && (
              <button
                type="button"
                onClick={() => setPrizeImage('')}
                title="Remover foto"
                className="absolute inset-0 bg-[#080D18]/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-[#F05262]"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#A6C957] bg-[#A6C957]/15 border border-[#A6C957]/35 px-2 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3 text-[#A6C957]" />
              <span>Em disputa nesta rodada</span>
            </div>
            <div className="font-bold text-lg sm:text-xl text-[#FFFFFF] truncate">
              {prizeName || 'Prêmio Principal'}
            </div>
            <p className="text-xs text-[#A5B1C5]">
              {prizeImage ? 'Foto personalizada definida com sucesso!' : 'Nenhuma imagem selecionada (usando ícone padrão).'}
            </p>
          </div>
        </div>

        {/* Section 1: Nome do Prêmio */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-[#FFFFFF] uppercase tracking-wide">
            1. Nome do Prêmio do Sorteio
          </label>
          <input
            type="text"
            value={prizeName}
            onChange={(e) => setPrizeName(e.target.value)}
            placeholder="Ex: Smartphone Galaxy, Pix R$ 100, Kit Gamer..."
            className="w-full bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-xl px-4 py-3 text-base text-[#FFFFFF] font-semibold focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30 placeholder:text-[#A5B1C5]/50"
          />

          {/* Quick Suggestions */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[11px] text-[#A5B1C5] font-semibold mr-1">Sugestões rápidas:</span>
            {quickNameSuggestions.map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => setPrizeName(sug)}
                className="text-xs px-2.5 py-1 rounded-lg bg-[#080D18] hover:bg-[#0131CD]/20 text-[#A5B1C5] hover:text-[#FFFFFF] border border-[var(--gio-border-subtle)] transition"
              >
                {sug}
              </button>
            ))}
          </div>
        </div>

        {/* Section 2: Imagem do Prêmio */}
        <div className="space-y-3">
          <label className="block text-xs font-bold text-[#FFFFFF] uppercase tracking-wide">
            2. Imagem / Foto do Prêmio
          </label>

          {/* Source Tabs */}
          <div className="flex items-center p-1 bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-center transition ${
                activeTab === 'presets'
                  ? 'bg-[#0131CD] text-[#FFFFFF] shadow-sm font-bold'
                  : 'text-[#A5B1C5] hover:text-[#FFFFFF]'
              }`}
            >
              Modelos Prontos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-center transition ${
                activeTab === 'upload'
                  ? 'bg-[#0131CD] text-[#FFFFFF] shadow-sm font-bold'
                  : 'text-[#A5B1C5] hover:text-[#FFFFFF]'
              }`}
            >
              Fazer Upload de Foto
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-center transition ${
                activeTab === 'url'
                  ? 'bg-[#0131CD] text-[#FFFFFF] shadow-sm font-bold'
                  : 'text-[#A5B1C5] hover:text-[#FFFFFF]'
              }`}
            >
              Link da Web (URL)
            </button>
          </div>

          {/* Tab 1: Presets Gallery */}
          {activeTab === 'presets' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              {PRIZE_PRESETS.map((p) => {
                const isSelected = prizeImage === p.imageUrl;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPrizeImage(p.imageUrl);
                      if (!prizeName || prizeName === 'Prêmio Principal') {
                        setPrizeName(p.name);
                      }
                    }}
                    className={`p-2.5 rounded-xl border flex flex-col items-center gap-2 transition text-center group ${
                      isSelected
                        ? 'bg-[#0131CD]/20 border-[#0131CD] ring-2 ring-[#0131CD]/40'
                        : 'bg-[#080D18] border-[var(--gio-border-subtle)] hover:border-[#0131CD]/40'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-[#111B30] border border-[var(--gio-border-subtle)]">
                      <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                    </div>
                    <span className="text-[11px] font-bold text-[#FFFFFF] line-clamp-1">
                      {p.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Tab 2: Upload File from Device */}
          {activeTab === 'upload' && (
            <div className="space-y-3 pt-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-6 border-2 border-dashed border-[var(--gio-border-subtle)] hover:border-[#0131CD] rounded-xl bg-[#080D18] cursor-pointer flex flex-col items-center justify-center gap-2 transition group text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-[#0131CD]/20 text-[#FFFFFF] flex items-center justify-center group-hover:scale-105 transition">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-sm font-bold text-[#FFFFFF]">Clique para escolher uma imagem do seu aparelho</div>
                <p className="text-xs text-[#A5B1C5]">Suporta JPG, PNG, WebP ou GIF. Redimensionado automaticamente.</p>
              </div>

              {uploadError && (
                <p className="text-xs text-[#F05262] font-semibold">{uploadError}</p>
              )}
            </div>
          )}

          {/* Tab 3: Direct Web Image URL */}
          {activeTab === 'url' && (
            <div className="space-y-2 pt-1">
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="Cole aqui o link da imagem (ex: https://...)"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="flex-1 bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30"
                />
                <button
                  type="button"
                  onClick={handleApplyUrl}
                  className="px-4 py-2.5 bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-xs rounded-xl transition shrink-0"
                >
                  Aplicar Foto
                </button>
              </div>
              <p className="text-[11px] text-[#A5B1C5]">
                Dica: Você pode copiar o endereço de qualquer imagem da internet e colar aqui.
              </p>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-[var(--gio-border-subtle)] gap-3">
          {prizeImage ? (
            <button
              type="button"
              onClick={() => setPrizeImage('')}
              className="text-xs text-[#F05262] hover:opacity-80 flex items-center gap-1.5 transition font-semibold"
            >
              <Trash2 className="w-4 h-4" />
              <span>Remover Imagem</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-[#080D18] hover:bg-[#0131CD]/20 text-[#A5B1C5] hover:text-[#FFFFFF] border border-[var(--gio-border-subtle)] font-bold text-xs transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-xs flex items-center gap-2 shadow-lg transition"
            >
              <CheckCircle2 className="w-4 h-4 text-[#FFFFFF]" />
              <span>Salvar Prêmio</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
