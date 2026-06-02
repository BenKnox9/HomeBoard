export interface ContainArea {
  offsetX: number;
  offsetY: number;
  displayW: number;
  displayH: number;
}

export type HoldColor = "green" | "blue" | "purple" | "red";
export type HoldSize = "small" | "medium" | "large";

export interface Hold {
  id: string;
  x: number;
  y: number;
  color: HoldColor;
  size?: HoldSize;
}

export function computeContainArea(
  naturalW: number,
  naturalH: number,
  containerW: number,
  containerH: number
): ContainArea {
  if (naturalW <= 0 || naturalH <= 0 || containerW <= 0 || containerH <= 0) {
    return { offsetX: 0, offsetY: 0, displayW: containerW, displayH: containerH };
  }
  const imgAspect = naturalW / naturalH;
  const conAspect = containerW / containerH;
  if (imgAspect > conAspect) {
    const displayW = containerW;
    const displayH = containerW / imgAspect;
    return { offsetX: 0, offsetY: (containerH - displayH) / 2, displayW, displayH };
  } else {
    const displayH = containerH;
    const displayW = containerH * imgAspect;
    return { offsetX: (containerW - displayW) / 2, offsetY: 0, displayW, displayH };
  }
}

export function parseHolds(raw: string | undefined | null): Hold[] | null {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function sortByOrder<T extends { id: string }>(routes: T[], order: string[]): T[] {
  if (order.length === 0) return routes;
  return [
    ...order.map((oid) => routes.find((r) => r.id === oid)).filter(Boolean) as T[],
    ...routes.filter((r) => !order.includes(r.id)),
  ];
}

export function isRouteDuplicate(
  name: string,
  existingRoutes: { name: string }[]
): boolean {
  const lower = name.trim().toLowerCase();
  return existingRoutes.some((r) => r.name.toLowerCase() === lower);
}
