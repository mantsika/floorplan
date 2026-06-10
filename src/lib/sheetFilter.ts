import { DEFAULT_SHEET_ID } from "../types";

export function belongsToSheet<T extends { sheetId?: string }>(
  item: T,
  activeSheetId: string
): boolean {
  return (item.sheetId ?? DEFAULT_SHEET_ID) === activeSheetId;
}

export function filterBySheet<T extends { sheetId?: string }>(
  items: T[],
  activeSheetId: string
): T[] {
  return items.filter((item) => belongsToSheet(item, activeSheetId));
}

export function tagWithSheet<T extends object>(item: T, sheetId: string): T & { sheetId: string } {
  return { ...item, sheetId };
}
