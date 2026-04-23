import { useRef, useState } from 'react';
import { useFlashcardState } from '../useFlashcardState';

export function SettingsPanel() {
  const { settings, updateSettings, exportJson, importJson } = useFlashcardState();
  const [advanced, setAdvanced] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mille-mots-srs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    const text = await file.text();
    const ok = importJson(text);
    setImportMsg(ok ? 'Import successful' : 'Import failed — invalid or incompatible file');
    setTimeout(() => setImportMsg(null), 3000);
  };

  return (
    <div className="flex flex-col gap-6 p-4">
      <section>
        <label className="block text-sm font-medium mb-2">
          New words per day: <span className="tabular-nums font-semibold">{settings.newPerDay}</span>
        </label>
        <input
          type="range"
          min={0}
          max={50}
          step={1}
          value={settings.newPerDay}
          onChange={(e) => updateSettings({ newPerDay: Number(e.target.value) })}
          className="w-full accent-emphasis"
        />
        <p className="text-[11px] text-text-subtle mt-1">How many new cards can enter your daily queue.</p>
      </section>

      <section>
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm font-medium">Type to check answer</span>
          <input
            type="checkbox"
            checked={settings.typedCheck}
            onChange={(e) => updateSettings({ typedCheck: e.target.checked })}
            className="accent-emphasis size-4"
          />
        </label>
        <p className="text-[11px] text-text-subtle mt-1">Adds a text input to type your answer before revealing.</p>
      </section>

      <section>
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="text-xs text-text-subtle hover:text-text"
        >
          {advanced ? '− Hide advanced' : '+ Advanced'}
        </button>
        {advanced && (
          <div className="mt-3">
            <label className="block text-sm font-medium mb-2">
              Target retention: <span className="tabular-nums font-semibold">{Math.round(settings.requestRetention * 100)}%</span>
            </label>
            <input
              type="range"
              min={80}
              max={95}
              step={1}
              value={Math.round(settings.requestRetention * 100)}
              onChange={(e) => updateSettings({ requestRetention: Number(e.target.value) / 100 })}
              className="w-full accent-emphasis"
            />
            <p className="text-[11px] text-text-subtle mt-1">FSRS schedules reviews so your recall stays near this value.</p>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Backup</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-2 rounded-md border border-border text-sm hover:bg-surface-muted"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-3 py-2 rounded-md border border-border text-sm hover:bg-surface-muted"
          >
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
              e.target.value = '';
            }}
          />
        </div>
        {importMsg && <p className="text-xs mt-2 text-text-muted">{importMsg}</p>}
      </section>
    </div>
  );
}
