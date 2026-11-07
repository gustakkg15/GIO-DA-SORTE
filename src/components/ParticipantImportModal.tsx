import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Participant, RaffleSettings } from '../types';
import {
  parseRawTextList,
  parseExcelBuffer,
  generateSampleExcelBlob,
  generateSampleCsvContent,
  generateSampleTxtContent,
  generateUid,
} from '../utils/raffle';

interface ParticipantImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentParticipants: Participant[];
  settings: RaffleSettings;
  onConfirmImport: (newParticipants: Participant[], replace: boolean) => void;
}

export const ParticipantImportModal: React.FC<ParticipantImportModalProps> = ({
  isOpen,
  onClose,
  currentParticipants,
  settings,
  onConfirmImport,
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'paste'>('file');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'sum' | 'overwrite' | 'ignore' | 'separate'>('sum');
  const [defaultCoins, setDefaultCoins] = useState<number>(settings.rate || 100);

  const [pastedText, setPastedText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [parsedItems, setParsedItems] = useState<{ name: string; coins: number }[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  if (!isOpen) return null;

  // Process text or pasted data
  const handleParseText = (text: string) => {
    setErrorMsg(null);
    if (!text.trim()) {
      setParsedItems([]);
      return;
    }
    const results = parseRawTextList(text, defaultCoins);
    if (results.length === 0) {
      setErrorMsg('Nenhum participante válido foi encontrado. Verifique o formato.');
    }
    setParsedItems(results);
  };

  // Process uploaded file
  const handleProcessFile = async (file: File) => {
    setErrorMsg(null);
    setFileName(file.name);
    setFileLoading(true);
    const extension = file.name.split('.').pop()?.toLowerCase();

    try {
      if (extension === 'xlsx' || extension === 'xls') {
        const buffer = await file.arrayBuffer();
        const results = parseExcelBuffer(buffer, defaultCoins);
        if (results.length === 0) {
          setErrorMsg('Nenhum participante encontrado na planilha. Verifique se há uma coluna com nomes.');
        }
        setParsedItems(results);
      } else if (extension === 'json') {
        const text = await file.text();
        const results = parseRawTextList(text, defaultCoins);
        if (results.length === 0) {
          setErrorMsg('JSON inválido ou sem array de participantes.');
        }
        setParsedItems(results);
      } else {
        // csv, txt, tsv
        const text = await file.text();
        const results = parseRawTextList(text, defaultCoins);
        if (results.length === 0) {
          setErrorMsg('Nenhum participante encontrado no arquivo de texto/CSV.');
        }
        setParsedItems(results);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao ler o arquivo. Certifique-se de que o arquivo não está corrompido.');
    } finally {
      setFileLoading(false);
    }
  };

  // Handle Drag & Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleProcessFile(file);
  };

  // Compute final merged list for preview and confirmation
  const generateMergedList = (): Participant[] => {
    let baseList: Participant[] = replaceExisting
      ? []
      : currentParticipants.map((p) => ({ ...p }));

    const existingMap = new Map<string, Participant>();
    baseList.forEach((p) => existingMap.set(p.name.toLowerCase().trim(), p));

    for (const item of parsedItems) {
      const key = item.name.toLowerCase().trim();
      if (!key) continue;

      if (existingMap.has(key)) {
        const existing = existingMap.get(key)!;
        if (duplicateStrategy === 'sum') {
          existing.coins += item.coins;
        } else if (duplicateStrategy === 'overwrite') {
          existing.coins = item.coins;
        } else if (duplicateStrategy === 'separate') {
          baseList.push({
            id: generateUid(),
            name: `${item.name} (2)`,
            coins: item.coins,
            addedAt: Date.now(),
          });
        }
        // 'ignore' does nothing
      } else {
        const newP: Participant = {
          id: generateUid(),
          name: item.name,
          coins: item.coins,
          addedAt: Date.now(),
        };
        existingMap.set(key, newP);
        baseList.push(newP);
      }
    }

    return baseList;
  };

  const finalPreview = generateMergedList();
  const totalCoins = parsedItems.reduce((acc, p) => acc + p.coins, 0);
  const estimatedTickets = Math.floor(totalCoins / (settings.rate || 100));

  // Downloads for templates
  const handleDownloadSampleExcel = () => {
    const blob = generateSampleExcelBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_participantes_gio_da_sorte.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSampleCsv = () => {
    const content = generateSampleCsvContent();
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_participantes_gio_da_sorte.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSampleTxt = () => {
    const content = generateSampleTxtContent();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_participantes_gio_da_sorte.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirm = () => {
    if (parsedItems.length === 0) return;
    const merged = generateMergedList();
    onConfirmImport(merged, true); // Replace existing state with calculated merged
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#050D20]/85 backdrop-blur-md animate-fade-in">
      <div className="bg-[#101F3D] border border-[#182943] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-slide-up">
        {/* Header */}
        <div className="p-5 border-b border-[#182943] flex items-center justify-between bg-[#0B1730]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#0866F5]/20 border border-[#00A9FF]/40 flex items-center justify-center text-[#00A9FF]">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-[#F8FAFC]">Importar Lista de Participantes</h3>
              <p className="text-xs text-[#94A3B8]">
                Excel (.xlsx, .xls), CSV, Bloco de Notas (.txt), TSV ou JSON
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#94A3B8] hover:text-[#F8FAFC] p-2 rounded-xl hover:bg-[#182943] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="p-3 bg-[#0B1730]/80 border-b border-[#182943] flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 p-1 bg-[#101F3D] rounded-xl border border-[#182943]">
            <button
              type="button"
              onClick={() => setActiveTab('file')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === 'file'
                  ? 'bg-[#0866F5] text-[#F8FAFC] shadow-sm'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Enviar Arquivo</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === 'paste'
                  ? 'bg-[#0866F5] text-[#F8FAFC] shadow-sm'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Colar Texto / Chat</span>
            </button>
          </div>

          {/* Sample template links */}
          <div className="flex items-center gap-1 text-[11px] text-[#94A3B8]">
            <span className="hidden sm:inline">Modelos:</span>
            <button
              type="button"
              onClick={handleDownloadSampleExcel}
              className="text-[#00A9FF] hover:text-[#35B9F5] px-1.5 py-0.5 rounded hover:bg-[#182943] font-semibold transition"
            >
              .XLSX
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={handleDownloadSampleCsv}
              className="text-[#00A9FF] hover:text-[#35B9F5] px-1.5 py-0.5 rounded hover:bg-[#182943] font-semibold transition"
            >
              .CSV
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={handleDownloadSampleTxt}
              className="text-[#00A9FF] hover:text-[#35B9F5] px-1.5 py-0.5 rounded hover:bg-[#182943] font-semibold transition"
            >
              .TXT
            </button>
          </div>
        </div>

        {/* Body Container */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3 bg-[#F05262]/15 border border-[#F05262]/40 rounded-xl text-[#F05262] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* File Upload Tab */}
          {activeTab === 'file' && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition flex flex-col items-center justify-center gap-2.5 ${
                isDragOver
                  ? 'border-[#00A9FF] bg-[#0866F5]/15'
                  : 'border-[#182943] bg-[#0B1730] hover:border-[#00A9FF]/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt,.tsv,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleProcessFile(file);
                }}
              />
              <div className="w-12 h-12 rounded-xl bg-[#0866F5]/20 border border-[#00A9FF]/40 text-[#00A9FF] flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#F8FAFC]">
                  {fileName ? `Arquivo: ${fileName}` : 'Clique para escolher ou arraste o arquivo aqui'}
                </p>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Formatos aceitos: Planilhas Excel (.xlsx, .xls), Arquivos CSV (.csv), Texto (.txt) ou JSON (.json)
                </p>
              </div>
            </div>
          )}

          {/* Paste Tab */}
          {activeTab === 'paste' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#F8FAFC] block">
                Cole a lista de participantes (um por linha):
              </label>
              <textarea
                rows={5}
                value={pastedText}
                onChange={(e) => {
                  setPastedText(e.target.value);
                  handleParseText(e.target.value);
                }}
                placeholder="Exemplos aceitos:&#10;Ana Beatriz 350&#10;Carlos Eduardo, 500&#10;Mariana Silva - 200 moedas&#10;Lucas Gabriel (apenas o nome também funciona!)"
                className="w-full bg-[#0B1730] border border-[#182943] rounded-xl p-3 text-xs sm:text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00A9FF] font-mono"
              />
              <p className="text-[11px] text-[#94A3B8]">
                Aceita separadores como vírgula, ponto-e-vírgula, dois-pontos, traço, espaços ou apenas nomes.
              </p>
            </div>
          )}

          {/* ADVANCED IMPORT CONFIGURATION OPTIONS */}
          <div className="bg-[#0B1730] border border-[#182943] rounded-2xl p-4 space-y-4 text-xs">
            <span className="font-bold uppercase tracking-wider text-[#00A9FF] block">
              Opções Avançadas de Importação
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Replace or Add */}
              <div>
                <label className="block text-[#F8FAFC] font-semibold mb-1.5">Ação na lista atual:</label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-[#94A3B8] cursor-pointer">
                    <input
                      type="radio"
                      name="action_mode"
                      checked={!replaceExisting}
                      onChange={() => setReplaceExisting(false)}
                      className="text-[#0866F5] bg-[#101F3D] border-[#182943]"
                    />
                    <span>Adicionar à lista existente ({currentParticipants.length} atuais)</span>
                  </label>
                  <label className="flex items-center gap-2 text-[#94A3B8] cursor-pointer">
                    <input
                      type="radio"
                      name="action_mode"
                      checked={replaceExisting}
                      onChange={() => setReplaceExisting(true)}
                      className="text-[#0866F5] bg-[#101F3D] border-[#182943]"
                    />
                    <span>Substituir lista existente (apagar atuais)</span>
                  </label>
                </div>
              </div>

              {/* Duplicate Strategy */}
              <div>
                <label className="block text-[#F8FAFC] font-semibold mb-1.5">
                  Se um participante já existir:
                </label>
                <select
                  value={duplicateStrategy}
                  onChange={(e) => setDuplicateStrategy(e.target.value as any)}
                  className="w-full bg-[#101F3D] border border-[#182943] rounded-xl p-2 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00A9FF]"
                >
                  <option value="sum">Somar moedas (+) [Recomendado para Lives]</option>
                  <option value="overwrite">Sobrescrever saldo com novo valor</option>
                  <option value="ignore">Ignorar (manter saldo original)</option>
                  <option value="separate">Cadastrar como nova entrada ("Nome (2)")</option>
                </select>
              </div>

              {/* Default Coins */}
              <div className="sm:col-span-2 flex items-center justify-between gap-4 pt-2 border-t border-[#182943]">
                <div>
                  <span className="text-[#F8FAFC] font-semibold block">Moedas padrão para nomes sem valor:</span>
                  <span className="text-[#94A3B8] text-[11px]">
                    Se uma linha tiver apenas o nome da pessoa, ela receberá esta quantia.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min="1"
                    value={defaultCoins}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (val > 0) {
                        setDefaultCoins(val);
                        if (pastedText) {
                          setParsedItems(parseRawTextList(pastedText, val));
                        }
                      }
                    }}
                    className="w-24 bg-[#101F3D] border border-[#182943] rounded-xl px-3 py-1.5 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00A9FF] font-mono tabular-nums font-bold"
                  />
                  <span className="text-[#94A3B8] text-xs">moedas</span>
                </div>
              </div>
            </div>
          </div>

          {/* PREVIEW SECTION */}
          {parsedItems.length > 0 && (
            <div className="space-y-3 pt-2">
              {/* Summary KPIs */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-[#0B1730] p-3 rounded-xl border border-[#182943] text-center">
                  <span className="text-[10px] text-[#94A3B8] uppercase tracking-wider block">Detectados</span>
                  <span className="text-lg font-mono font-bold text-[#F8FAFC] tabular-nums">{parsedItems.length}</span>
                </div>
                <div className="bg-[#0B1730] p-3 rounded-xl border border-[#182943] text-center">
                  <span className="text-[10px] text-[#94A3B8] uppercase tracking-wider block">Total Moedas</span>
                  <span className="text-lg font-mono font-bold text-[#00A9FF] tabular-nums">{totalCoins}</span>
                </div>
                <div className="bg-[#0B1730] p-3 rounded-xl border border-[#182943] text-center">
                  <span className="text-[10px] text-[#94A3B8] uppercase tracking-wider block">Bilhetes</span>
                  <span className="text-lg font-mono font-bold text-[#20C997] tabular-nums">~{estimatedTickets}</span>
                </div>
              </div>

              {/* First few preview rows */}
              <div className="bg-[#0B1730] border border-[#182943] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                  <span className="font-semibold text-[#F8FAFC]">
                    Prévia dos primeiros participantes ({Math.min(parsedItems.length, 6)} de {parsedItems.length}):
                  </span>
                  <span>{replaceExisting ? 'Substituirá lista' : `Total final: ${finalPreview.length} pessoas`}</span>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {parsedItems.slice(0, 8).map((p, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-[#101F3D] text-xs"
                    >
                      <span className="font-bold text-[#F8FAFC] truncate">{p.name}</span>
                      <span className="text-[#00A9FF] font-mono font-bold tabular-nums">{p.coins} moedas</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#182943] bg-[#0B1730] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#182943] hover:bg-[#101F3D] text-[#94A3B8] hover:text-[#F8FAFC] text-xs font-bold rounded-xl transition"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={parsedItems.length === 0 || fileLoading}
            className="px-5 py-2.5 bg-[#0866F5] hover:bg-[#00A9FF] disabled:opacity-50 text-[#F8FAFC] text-xs font-bold rounded-xl transition shadow-lg flex items-center gap-1.5 active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {parsedItems.length === 0
                ? 'Selecione ou Cole uma Lista'
                : `Importar ${parsedItems.length} Participantes`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
