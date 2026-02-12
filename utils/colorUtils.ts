// Generate a palette index
export const generateColor = (index: number): string => {
  const hues = [
    '#EF4444', // Red
    '#F97316', // Orange
    '#F59E0B', // Amber
    '#84CC16', // Lime
    '#10B981', // Emerald
    '#06B6D4', // Cyan
    '#3B82F6', // Blue
    '#8B5CF6', // Violet
    '#EC4899', // Pink
  ];
  return hues[index % hues.length];
};

// Generate a hierarchical shade
// If parent is Red, child will be a lighter/darker Red
export const generateChildColor = (parentColor: string, siblingIndex: number): string => {
  const num = parseInt(parentColor.replace("#", ""), 16);
  // Alternate between lighter and darker, with increasing offset for each sibling
  const direction = siblingIndex % 2 === 0 ? 1 : -1;
  const magnitude = 20 + Math.floor(siblingIndex / 2) * 15;
  const amt = direction * magnitude;

  const clamp = (v: number) => Math.max(0, Math.min(255, v));

  const r = clamp(((num >> 16) & 0xFF) + amt);
  const g = clamp(((num >> 8) & 0xFF) + amt);
  const b = clamp((num & 0xFF) + amt);

  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
};

export const getContrastText = (hexColor: string): string => {
  const r = parseInt(hexColor.substr(1, 2), 16);
  const g = parseInt(hexColor.substr(3, 2), 16);
  const b = parseInt(hexColor.substr(5, 2), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? '#000000' : '#ffffff';
};