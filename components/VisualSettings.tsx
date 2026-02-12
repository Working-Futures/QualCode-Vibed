import React from 'react';
import { AppSettings, AppTheme } from '../types';
import { Type, AlignJustify, Eye, Palette, Layout } from 'lucide-react';

interface Props {
  settings: AppSettings;
  onUpdate: (s: AppSettings) => void;
}

export const VisualSettings: React.FC<Props> = ({ settings, onUpdate }) => {
  return (
    <div className="absolute top-16 right-4 z-40 bg-[var(--bg-panel)] p-4 rounded-xl shadow-xl border border-[var(--border)] w-72 animate-in fade-in slide-in-from-top-2 text-[var(--text-main)]">
      <h3 className="font-bold text-[var(--text-main)] mb-4 flex items-center gap-2">
        <Eye size={16} /> Appearance
      </h3>

      <div className="space-y-4">
        {/* Theme Selector */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[var(--text-muted)] uppercase flex items-center gap-2">
            <Palette size={12} /> Vibe Theme
          </label>
          <select
            className="w-full p-2 border rounded text-sm bg-[var(--bg-main)] text-[var(--text-main)]"
            value={settings.theme}
            onChange={(e) => onUpdate({ ...settings, theme: e.target.value as AppTheme })}
          >
            <option value="default">QualCode Standard</option>
            <option value="hobbit">Hobbit Study (Earth)</option>
            <option value="dark">Night Mode (Neutral)</option>
            <option value="bluedark">Deep Ocean (Dark)</option>
            <option value="corporate">Corporate (Gray)</option>
          </select>
        </div>

        <hr className="border-[var(--border)]" />

        {/* Font Family */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[var(--text-muted)] uppercase flex items-center gap-2">
            <Type size={12} /> Typography
          </label>
          <select
            className="w-full p-2 border rounded text-sm bg-[var(--bg-main)] text-[var(--text-main)]"
            value={settings.fontFamily}
            onChange={(e) => onUpdate({ ...settings, fontFamily: e.target.value as any })}
          >
            <option value="sans">Clean Sans (Inter)</option>
            <option value="serif">Academic Serif (Merriweather)</option>
            <option value="mono">Monospace (Code)</option>
            <option value="times">Times New Roman</option>
            <option value="arial">Arial</option>
            <option value="georgia">Georgia</option>
          </select>
        </div>

        {/* Font Size & Spacing */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-[var(--text-muted)]">Text Size</label>
            <input
              type="range" min="12" max="32" step="1"
              className="w-full"
              value={settings.fontSize}
              onChange={(e) => onUpdate({ ...settings, fontSize: parseInt(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">Spacing</label>
            <input
              type="range" min="0" max="2" step="0.1"
              className="w-full"
              value={settings.charSpacing}
              onChange={(e) => onUpdate({ ...settings, charSpacing: parseFloat(e.target.value) })}
            />
          </div>
        </div>

        {/* Sidebar Width */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[var(--text-muted)] uppercase flex items-center gap-2">
            <Layout size={12} /> Sidebar Width
          </label>
          <input
            type="range" min="200" max="500" step="10"
            className="w-full"
            value={settings.sidebarWidth || 288}
            onChange={(e) => onUpdate({ ...settings, sidebarWidth: parseInt(e.target.value) })}
          />
        </div>

        <div className="border-t border-[var(--border)] pt-3 space-y-3">
          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-sm font-medium text-[var(--text-main)] flex items-center gap-2">
              <AlignJustify size={14} /> Zebra Striping
            </span>
            <input
              type="checkbox"
              className="toggle checkbox-primary"
              checked={settings.zebraStriping}
              onChange={(e) => onUpdate({ ...settings, zebraStriping: e.target.checked })}
            />
          </label>
        </div>
      </div>
    </div>
  );
};