import type { Prisma, PriceListItem } from "@prisma/client";

export type PriceSource = "manual" | "csv" | "cargoson_api";
export type PriceHistoryAction = "created" | "changed" | "deleted";

type RouteKey = Pick<
  PriceListItem,
  "length" | "width" | "height" | "weight" | "carrier" | "serviceMethod" | "destinationCountry"
>;

type Db = Prisma.TransactionClient;

// Ceny porównujemy z dokładnością do grosza/centa: API Cargoson potrafi
// zwrócić 21.8 i 21.800000001 dla tej samej stawki.
export function samePrice(
  oldPrice: number,
  oldCurrency: string | null | undefined,
  newPrice: number,
  newCurrency: string | null | undefined,
): boolean {
  return (
    Math.round(oldPrice * 100) === Math.round(newPrice * 100) &&
    (oldCurrency || "PLN").toUpperCase() === (newCurrency || "PLN").toUpperCase()
  );
}

export function sameRoute(a: RouteKey, b: RouteKey): boolean {
  return (
    a.length === b.length &&
    a.width === b.width &&
    a.height === b.height &&
    a.weight === b.weight &&
    a.carrier === b.carrier &&
    a.serviceMethod === b.serviceMethod &&
    a.destinationCountry === b.destinationCountry
  );
}

export function describeRoute(r: RouteKey): string {
  return `${r.length}x${r.width}x${r.height} cm, ${r.weight} kg, ${r.carrier} ${r.serviceMethod}, ${r.destinationCountry}`;
}

function routeSnapshot(r: RouteKey) {
  return {
    length: r.length,
    width: r.width,
    height: r.height,
    weight: r.weight,
    carrier: r.carrier,
    serviceMethod: r.serviceMethod,
    destinationCountry: r.destinationCountry,
  };
}

export function createdEntry(
  item: PriceListItem,
  source: PriceSource,
  changedBy: string | null | undefined,
): Prisma.PriceHistoryCreateManyInput {
  return {
    priceListItemId: item.id,
    action: "created",
    ...routeSnapshot(item),
    newPrice: item.basePrice,
    newCurrency: item.currency,
    source,
    changedBy: changedBy ?? null,
  };
}

export function changedEntry(
  before: PriceListItem,
  after: PriceListItem,
  source: PriceSource,
  changedBy: string | null | undefined,
): Prisma.PriceHistoryCreateManyInput {
  return {
    priceListItemId: after.id,
    action: "changed",
    ...routeSnapshot(after),
    oldPrice: before.basePrice,
    oldCurrency: before.currency,
    newPrice: after.basePrice,
    newCurrency: after.currency,
    source,
    changedBy: changedBy ?? null,
    details: sameRoute(before, after)
      ? null
      : `Zmieniono pozycję: ${describeRoute(before)} → ${describeRoute(after)}`,
  };
}

export function deletedEntry(
  item: PriceListItem,
  source: PriceSource,
  changedBy: string | null | undefined,
): Prisma.PriceHistoryCreateManyInput {
  return {
    priceListItemId: item.id,
    action: "deleted",
    ...routeSnapshot(item),
    oldPrice: item.basePrice,
    oldCurrency: item.currency,
    source,
    changedBy: changedBy ?? null,
  };
}

// Usuwa pozycje i zapisuje w historii, jaka cena obowiązywała w chwili
// usunięcia. Używane przez kasowanie pojedyncze, masowe i „zastąp cennik”.
export async function deleteItemsWithHistory(
  db: Db,
  where: Prisma.PriceListItemWhereInput,
  source: PriceSource,
  changedBy: string | null | undefined,
): Promise<number> {
  const items = await db.priceListItem.findMany({ where });
  if (items.length === 0) return 0;
  await db.priceHistory.createMany({
    data: items.map((i) => deletedEntry(i, source, changedBy)),
  });
  const del = await db.priceListItem.deleteMany({
    where: { id: { in: items.map((i) => i.id) } },
  });
  return del.count;
}

// Od kiedy obowiązuje obecna kwota. Dla pozycji sprzed włączenia historii
// (priceSetAt = NULL) dokładnej daty nie znamy: bierzemy ostatni zapis ceny
// z API, a gdy go nie ma, datę dodania pozycji, i oznaczamy jako przybliżoną.
export function priceSince(item: Pick<PriceListItem, "priceSetAt" | "lastSyncedAt" | "createdAt">): {
  priceSince: Date;
  priceSinceApprox: boolean;
} {
  if (item.priceSetAt) return { priceSince: item.priceSetAt, priceSinceApprox: false };
  return { priceSince: item.lastSyncedAt ?? item.createdAt, priceSinceApprox: true };
}

export function sessionEmail(session: { user?: { email?: string | null } | null } | null): string | null {
  return session?.user?.email ?? null;
}
