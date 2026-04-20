// Shared "check prices" logic. Used by:
//   - POST /api/check-prices            (interactive button in /dashboard/check-prices)
//   - POST /api/cron/check-prices       (systemd timer; bearer-auth'd)
//
// Handles: pulling active recipients + active pricelist, calling Cargoson once
// per (country, dimensions) group with bounded concurrency, computing
// discrepancies in PLN, persisting Alerts (deduping per day) and CheckHistory,
// and dispatching Slack notifications when alerts fire.

import { prisma } from "@/lib/db";
import { getFreightPrices, formatCollectionDate, calculateCBM } from "@/lib/cargoson";
import { carrierNamesMatch, normalizeCarrierName } from "@/lib/carriers";
import { sendSlackNotification } from "@/lib/slack";

const EUR_TO_PLN = 4.3;

export interface PriceResult {
  recipientName: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  carrier: string;
  serviceMethod: string;
  dimensions: string;
  weight: number;
  apiPrice: number;
  apiCurrency: string;
  apiPricePLN: number;
  priceListPrice: number | null;
  priceListCurrency?: string;
  priceListPricePLN?: number | null;
}

export interface CheckPricesSummary {
  ok: boolean;
  reason?: "no-recipients" | "no-pricelist" | "monitoring-disabled" | "in-pause-window" | "interval-not-elapsed";
  results: PriceResult[];
  errors: string[];
  recipientsChecked: number;
  alertsCreated?: number;
  discrepanciesFound: number;
  checkHistoryId?: string;
}

function getDimensionKey(length: number, width: number, height: number, weight: number): string {
  return `${length}x${width}x${height}_${weight}`;
}

export async function runCheckPrices(opts: { testOnly?: boolean } = {}): Promise<CheckPricesSummary> {
  const testOnly = !!opts.testOnly;

  const recipients = await prisma.recipient.findMany({ where: { isActive: true } });
  const priceList = await prisma.priceListItem.findMany({ where: { isActive: true } });
  const settings = await prisma.settings.findFirst();

  if (recipients.length === 0) {
    return { ok: false, reason: "no-recipients", results: [], errors: [], recipientsChecked: 0, discrepanciesFound: 0 };
  }
  if (priceList.length === 0) {
    return { ok: false, reason: "no-pricelist", results: [], errors: [], recipientsChecked: 0, discrepanciesFound: 0 };
  }

  const collectionPostcode = settings?.collectionPostcode || "43-300";
  const collectionCountry = settings?.collectionCountry || "PL";
  const collectionDate = formatCollectionDate();

  const results: PriceResult[] = [];
  const errors: string[] = [];

  const recipientByCountry = new Map<string, typeof recipients[number]>();
  for (const r of recipients) {
    const cc = r.country.toUpperCase();
    if (!recipientByCountry.has(cc)) recipientByCountry.set(cc, r);
  }

  type Dims = { length: number; width: number; height: number; weight: number };
  type Group = {
    country: string;
    dims: Dims;
    dimKey: string;
    recipient: typeof recipients[number];
    items: typeof priceList;
  };
  const groups = new Map<string, Group>();
  for (const item of priceList) {
    const cc = item.destinationCountry.toUpperCase();
    const recipient = recipientByCountry.get(cc);
    if (!recipient) continue;
    const dimKey = `${cc}|${getDimensionKey(item.length, item.width, item.height, item.weight)}`;
    const g = groups.get(dimKey);
    if (g) g.items.push(item);
    else {
      groups.set(dimKey, {
        country: cc,
        dims: { length: item.length, width: item.width, height: item.height, weight: item.weight },
        dimKey,
        recipient,
        items: [item],
      });
    }
  }

  const tasks: Group[] = Array.from(groups.values());
  const CONCURRENCY = 8;

  const runOne = async (task: Group) => {
    const { recipient, dimKey, dims, items } = task;
    try {
      const response = await getFreightPrices({
        collection_date: collectionDate,
        collection_postcode: collectionPostcode,
        collection_country: collectionCountry,
        delivery_postcode: recipient.postalCode,
        delivery_country: recipient.country,
        rows_attributes: {
          "0": {
            quantity: "1",
            package_type: "CTN",
            weight: dims.weight.toString(),
            length: dims.length.toString(),
            width: dims.width.toString(),
            height: dims.height.toString(),
            cbm: calculateCBM(dims.length, dims.width, dims.height),
            ldm: "0",
            description: "Goods",
          },
        },
      });

      const prices = response?.object?.prices ?? [];

      for (const priceItem of items) {
        const listCur = (priceItem.currency || "PLN").toUpperCase();
        const listInPLN = listCur === "EUR" ? priceItem.basePrice * EUR_TO_PLN : priceItem.basePrice;

        const matchingApi = prices.find(
          (p) =>
            carrierNamesMatch(p.carrier || "", priceItem.carrier) &&
            (p.service || "Standard") === priceItem.serviceMethod,
        );

        if (!matchingApi) {
          results.push({
            recipientName: recipient.name,
            street: recipient.street,
            city: recipient.city,
            postalCode: recipient.postalCode,
            country: recipient.country,
            carrier: priceItem.carrier,
            serviceMethod: priceItem.serviceMethod,
            dimensions: `${dims.length}x${dims.width}x${dims.height}`,
            weight: dims.weight,
            apiPrice: -1,
            apiCurrency: "N/A",
            apiPricePLN: -1,
            priceListPrice: priceItem.basePrice,
            priceListCurrency: listCur,
            priceListPricePLN: Math.round(listInPLN * 100) / 100,
          });
          continue;
        }

        const apiCurrency = matchingApi.currency || "PLN";
        const surcharges = matchingApi.surcharges ?? [];
        const transport = surcharges.find((s) => s.identifier === "transport_price");
        const apiPrice = transport
          ? parseFloat(transport.amount || "0")
          : parseFloat(matchingApi.price || "0");
        const apiPricePLN = apiCurrency === "EUR" ? apiPrice * EUR_TO_PLN : apiPrice;

        results.push({
          recipientName: recipient.name,
          street: recipient.street,
          city: recipient.city,
          postalCode: recipient.postalCode,
          country: recipient.country,
          carrier: normalizeCarrierName(matchingApi.carrier || priceItem.carrier),
          serviceMethod: matchingApi.service || priceItem.serviceMethod,
          dimensions: `${dims.length}x${dims.width}x${dims.height}`,
          weight: dims.weight,
          apiPrice,
          apiCurrency,
          apiPricePLN: Math.round(apiPricePLN * 100) / 100,
          priceListPrice: priceItem.basePrice,
          priceListCurrency: listCur,
          priceListPricePLN: Math.round(listInPLN * 100) / 100,
        });
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      errors.push(`${recipient.name} (${dimKey}): ${errMsg}`);
    }
  };

  let taskCursor = 0;
  const worker = async () => {
    while (taskCursor < tasks.length) {
      const i = taskCursor++;
      await runOne(tasks[i]);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const tolerancePercent = settings?.tolerancePercent ?? 0;
  const alertsToCreate: {
    recipientId: string;
    recipientName: string;
    city: string;
    country: string;
    carrier: string;
    apiPrice: number;
    priceListPrice: number;
    difference: number;
    percentDiff: number;
  }[] = [];

  for (const result of results) {
    if (result.apiPricePLN <= 0 || result.priceListPrice === null) continue;

    const priceListPricePLN =
      result.priceListPricePLN != null
        ? result.priceListPricePLN
        : (result.priceListCurrency || "PLN").toUpperCase() === "EUR"
          ? Math.round(result.priceListPrice * EUR_TO_PLN * 100) / 100
          : result.priceListPrice;

    if (!priceListPricePLN || priceListPricePLN <= 0) continue;

    const rawDifference = result.apiPricePLN - priceListPricePLN;
    const difference = Math.round(rawDifference * 100) / 100;
    const percentDiff = (difference / priceListPricePLN) * 100;

    if (Math.abs(difference) < 0.01) continue;
    if (Math.abs(percentDiff) > tolerancePercent) {
      const recipient = recipients.find((r) => r.name === result.recipientName);
      if (recipient) {
        alertsToCreate.push({
          recipientId: recipient.id,
          recipientName: result.recipientName,
          city: result.city,
          country: result.country,
          carrier: `${result.carrier} - ${result.serviceMethod}`,
          apiPrice: result.apiPricePLN,
          priceListPrice: priceListPricePLN,
          difference,
          percentDiff: Math.round(percentDiff * 100) / 100,
        });
      }
    }
  }

  let alertsCreated = 0;
  const createdAlerts: Array<{
    id: string;
    recipientName: string;
    city: string;
    carrier: string;
    apiPrice: number;
    priceListPrice: number;
    difference: number;
    percentDiff: number;
  }> = [];

  if (!testOnly && alertsToCreate.length > 0) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    for (const alertData of alertsToCreate) {
      const existingAlert = await prisma.alert.findFirst({
        where: {
          recipientId: alertData.recipientId,
          carrier: alertData.carrier,
          status: "unresolved",
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      });
      if (!existingAlert) {
        const newAlert = await prisma.alert.create({ data: alertData });
        alertsCreated++;
        createdAlerts.push({
          id: newAlert.id,
          recipientName: alertData.recipientName,
          city: alertData.city,
          carrier: alertData.carrier,
          apiPrice: alertData.apiPrice,
          priceListPrice: alertData.priceListPrice,
          difference: alertData.difference,
          percentDiff: alertData.percentDiff,
        });
      }
    }

    if (createdAlerts.length > 0 && settings?.slackWebhook) {
      await sendSlackNotification(settings.slackWebhook, createdAlerts);
    }
  }

  let checkHistoryId: string | undefined;
  if (!testOnly) {
    const ch = await prisma.checkHistory.create({
      data: {
        recipientsCount: recipients.length,
        alertsCount: alertsCreated,
        discrepanciesCount: alertsToCreate.length,
        status: "completed",
        csvData: JSON.stringify(results),
      },
    });
    checkHistoryId = ch.id;
  }

  return {
    ok: true,
    results,
    errors,
    recipientsChecked: recipients.length,
    alertsCreated,
    discrepanciesFound: alertsToCreate.length,
    checkHistoryId,
  };
}

// HH:MM "now" in local time, used for pause-window check.
function hhmmNow(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// True if `now` is within [start, end). Handles overnight windows where
// start > end (e.g. 23:00..05:00).
function isWithinPause(start: string, end: string, now: string = hhmmNow()): boolean {
  if (!start || !end) return false;
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  // overnight
  return now >= start || now < end;
}

export interface CronGate {
  shouldRun: boolean;
  reason?: "monitoring-disabled" | "in-pause-window" | "interval-not-elapsed" | "no-settings";
  nextRunAt?: Date;
  lastRunAt?: Date;
}

// Should the systemd-timer fire actually run check-prices right now?
// Considers Settings.monitoringEnabled, pauseStart/pauseEnd window, and the
// minimum gap between runs (checkIntervalMinutes vs the most-recent
// CheckHistory.checkDate).
export async function shouldRunNow(): Promise<CronGate> {
  const settings = await prisma.settings.findFirst();
  if (!settings) return { shouldRun: false, reason: "no-settings" };
  if (!settings.monitoringEnabled) return { shouldRun: false, reason: "monitoring-disabled" };

  if (isWithinPause(settings.pauseStart, settings.pauseEnd)) {
    return { shouldRun: false, reason: "in-pause-window" };
  }

  const last = await prisma.checkHistory.findFirst({
    orderBy: { checkDate: "desc" },
    select: { checkDate: true },
  });
  if (last) {
    const elapsedMin = (Date.now() - last.checkDate.getTime()) / 60_000;
    if (elapsedMin < settings.checkIntervalMinutes) {
      const nextRunAt = new Date(last.checkDate.getTime() + settings.checkIntervalMinutes * 60_000);
      return { shouldRun: false, reason: "interval-not-elapsed", nextRunAt, lastRunAt: last.checkDate };
    }
  }

  return { shouldRun: true, lastRunAt: last?.checkDate };
}
