// Puts the linked coins in order: the one nothing points at first, then whatever it points to.
import type { BoardLink } from "./board";

export function chainOrder(links: BoardLink[]): string[] {
  if (!links.length) return [];
  const to = new Set(links.map((l) => l.to));
  let cur = links.find((l) => !to.has(l.from))?.from ?? links[0].from;
  const order = [cur];
  for (let i = 0; i < links.length; i++) {
    const next = links.find((l) => l.from === cur && !order.includes(l.to));
    if (!next) break;
    order.push(next.to);
    cur = next.to;
  }
  return order;
}
