import type { PictogramType } from '../types/flightPlan';
import catalog from '@shared/pictogramCatalog.json';

export type PictogramCategory = 'landmark' | 'threat' | 'friendly' | 'reference';

export interface PictogramDef {
  id: PictogramType;
  label: string;
  category: PictogramCategory;
  isRanged: boolean;
}

type CatalogEntry = { label: string; category: string; isRanged: boolean; svgContent: string };
const _catalog = catalog as Record<string, CatalogEntry>;

const PICTOGRAM_CATALOG: PictogramDef[] = (Object.keys(_catalog) as PictogramType[]).map(id => ({
  id,
  label: _catalog[id].label,
  category: _catalog[id].category as PictogramCategory,
  isRanged: _catalog[id].isRanged,
}));

export const getPictogramDef = (type: PictogramType): PictogramDef => {
  const def = PICTOGRAM_CATALOG.find(d => d.id === type);
  if (!def) throw new Error(`Unknown pictogram type: ${type}`);
  return def;
};

export const isRangedType = (type: PictogramType): boolean =>
  getPictogramDef(type).isRanged;

export const getAllPictograms = (): PictogramDef[] => PICTOGRAM_CATALOG;

export const getPictogramsByCategory = (category: PictogramCategory): PictogramDef[] =>
  PICTOGRAM_CATALOG.filter(d => d.category === category);

/** Returns a complete SVG string with the given color (defaults to currentColor). */
export const getPictogramSvg = (type: PictogramType, color = 'currentColor', size = 24): string => {
  const content = _catalog[type]?.svgContent ?? '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" color="${color}">${content}</svg>`;
};

/** Returns a data URL suitable for use as an OpenLayers Icon src. */
export const getPictogramDataUrl = (type: PictogramType, color: string, size = 24): string => {
  const svg = getPictogramSvg(type, color, size);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};
