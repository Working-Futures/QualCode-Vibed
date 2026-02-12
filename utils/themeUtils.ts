import { AppTheme } from '../types';

export const applyTheme = (theme: AppTheme) => {
  const root = document.documentElement;

  const themes = {
    default: {
      '--bg-main': '#f1f5f9',       // Slate 100
      '--bg-panel': '#ffffff',      // White
      '--bg-header': '#0f172a',     // Slate 900
      '--text-main': '#0f172a',     // Slate 900
      '--text-muted': '#64748b',    // Slate 500
      '--border': '#e2e8f0',        // Slate 200
      '--accent': '#2563eb',        // Blue 600
      '--accent-text': '#ffffff',
      '--bg-paper': '#ffffff',      // Paper Color
      '--zebra-odd': '#e2e8f0',     // [MODIFIED] Darker for visibility (Slate 200)
    },
    hobbit: {
      '--bg-main': '#e6d5c3',       // Warmer Light Brown / Tan
      '--bg-panel': '#fdf6e3',      // Light Parchment
      '--bg-header': '#2c3e28',     // Deep Forest Green (Reverted)
      '--text-main': '#433422',     // Dark Brown
      '--text-muted': '#8c7b64',    // Light Brown
      '--border': '#d3c6a0',        // Darker Parchment
      '--accent': '#6b8c42',        // Moss Green (kept green for hobbit feel, but could change if requested)
      '--accent-text': '#ffffff',
      '--bg-paper': '#fdf6e3',      // Paper Color (match panel)
      '--zebra-odd': '#f2e9c9',
    },
    // Modern Dark Mode (Softened)
    dark: {
      '--bg-main': '#121212',       // Dark Grey (Material Dark)
      '--bg-panel': '#1e1e1e',      // Slightly lighter grey
      '--bg-header': '#2d2d2d',     // Lighter header
      '--text-main': '#e0e0e0',     // Off-white
      '--text-muted': '#a0a0a0',    // Grey
      '--border': '#404040',        // Neutral Grey
      '--accent': '#8b5cf6',        // Violet 500 (Vibrant but not orange)
      '--accent-text': '#ffffff',
      '--bg-paper': '#1e1e1e',      // Dark Paper
      '--zebra-odd': '#262626',     // Subtle stripe
    },
    // Updated Blue Dark (Ocean) to be more distinct Blue
    bluedark: {
      '--bg-main': '#0f172a',       // Slate 900
      '--bg-panel': '#1e293b',      // Slate 800
      '--bg-header': '#020617',     // Slate 950
      '--text-main': '#e2e8f0',     // Slate 200
      '--text-muted': '#94a3b8',    // Slate 400
      '--border': '#334155',        // Slate 700
      '--accent': '#38bdf8',        // Sky 400
      '--accent-text': '#0f172a',
      '--bg-paper': '#1e293b',      // Dark Paper
      '--zebra-odd': '#253147',
    },
    corporate: {
      '--bg-main': '#d4d4d4',       // Neutral 300 (Darker Grey Background)
      '--bg-panel': '#f5f5f5',      // Neutral 100 (Light Grey Panel)
      '--bg-header': '#262626',     // Neutral 800
      '--text-main': '#171717',     // Neutral 900
      '--text-muted': '#525252',    // Neutral 600
      '--border': '#a3a3a3',        // Neutral 400 (High contrast border)
      '--accent': '#000000',        // Black
      '--accent-text': '#ffffff',
      '--bg-paper': '#ffffff',      // White Paper
      '--zebra-odd': '#e5e5e5',     // [MODIFIED] Visible Grey Striping
    }
  };

  const selected = themes[theme];

  Object.entries(selected).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
};