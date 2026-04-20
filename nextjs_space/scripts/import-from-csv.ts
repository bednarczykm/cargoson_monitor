/**
 * Import seed data from a CSV export (`sprawdzenie_YYYY-MM-DD.csv` format).
 *
 * Usage:
 *   npx tsx scripts/import-from-csv.ts [path/to/file.csv]
 *
 * Default path: scripts/seed-data.csv
 *
 * The CSV is produced by the old Cargoson Monitor's "check prices" job. Each
 * row is one (recipient × carrier × service method) comparison between the
 * Cargoson API price and the local pricelist. We rebuild three tables from it:
 *   - Recipient           : one per unique (name, street, city, postal, country)
 *   - PriceListItem       : one per (country, carrier, serviceMethod) where a
 *                           pricelist price was known (Cena cennik (PLN) != '')
 *   - CheckHistory        : one row for this run (date = 2026-02-27)
 *   - Alert               : one per row with a non-zero difference
 *
 * Idempotent — re-running upserts the same keys.
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const prisma = new PrismaClient()

type Row = {
  'Nazwa odbiorcy': string
  'Ulica': string
  'Miejscowość': string
  'Kod pocztowy': string
  'Kraj': string
  'Wymiary (cm)': string
  'Waga (kg)': string
  'Carrier': string
  'Metoda wysylki': string
  'Cena API': string
  'Waluta': string
  'Cena API (PLN)': string
  'Cena cennik (PLN)': string
  'Roznica (PLN)': string
}

function parseCSV(text: string): Row[] {
  // tiny quoted-CSV parser — handles "" escapes and quoted commas
  const rows: string[][] = []
  let cur: string[] = []
  let buf = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { buf += '"'; i++; continue }
      if (ch === '"') { inQ = false; continue }
      buf += ch
      continue
    }
    if (ch === '"') { inQ = true; continue }
    if (ch === ',') { cur.push(buf); buf = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') { cur.push(buf); rows.push(cur); cur = []; buf = ''; continue }
    buf += ch
  }
  if (buf.length || cur.length) { cur.push(buf); rows.push(cur) }
  const header = rows.shift() as string[]
  return rows
    .filter(r => r.length === header.length && r.some(c => c !== ''))
    .map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])) as unknown as Row)
}

async function main() {
  const argPath = process.argv[2] ?? 'scripts/seed-data.csv'
  const path = resolve(argPath)

  if (!existsSync(path)) {
    throw new Error(`CSV not found: ${path} (run from nextjs_space/ directory)`)
  }

  const text = readFileSync(path, 'utf-8')
  const rows = parseCSV(text)
  console.log(`read ${rows.length} rows from ${path}`)

  // 1) Recipients — dedup by (name, street, city, postal, country)
  const recKey = (r: Row) =>
    `${r['Nazwa odbiorcy']}|${r['Ulica']}|${r['Miejscowość']}|${r['Kod pocztowy']}|${r['Kraj']}`
  const recSeen = new Map<string, Row>()
  for (const r of rows) recSeen.set(recKey(r), r)

  let recCount = 0
  for (const r of recSeen.values()) {
    await prisma.recipient.upsert({
      where: {
        // composite-lookup via a synthetic unique we don't have — fall back to name+city
        id: `seed-${r['Kod pocztowy']}-${r['Kraj']}`,
      },
      update: {
        name: r['Nazwa odbiorcy'],
        street: r['Ulica'],
        city: r['Miejscowość'],
        postalCode: r['Kod pocztowy'],
        country: r['Kraj'],
        isActive: true,
      },
      create: {
        id: `seed-${r['Kod pocztowy']}-${r['Kraj']}`,
        name: r['Nazwa odbiorcy'],
        street: r['Ulica'],
        city: r['Miejscowość'],
        postalCode: r['Kod pocztowy'],
        country: r['Kraj'],
        isActive: true,
      },
    })
    recCount++
  }
  console.log(`upserted ${recCount} recipients`)

  // 2) PriceListItem — from rows where Cena cennik (PLN) is set
  const pliKey = (r: Row) =>
    `${r['Kraj']}|${r['Carrier']}|${r['Metoda wysylki']}`
  const pliSeen = new Map<string, Row>()
  for (const r of rows) {
    if (r['Cena cennik (PLN)'] && r['Cena cennik (PLN)'].trim() !== '') {
      pliSeen.set(pliKey(r), r)
    }
  }

  const [L, W, H] = '10x10x10'.split('x').map(Number)
  const WEIGHT = 2

  let pliCount = 0
  for (const r of pliSeen.values()) {
    const basePrice = parseFloat(r['Cena cennik (PLN)'].replace(',', '.'))
    if (Number.isNaN(basePrice)) continue
    await prisma.priceListItem.upsert({
      where: {
        length_width_height_weight_carrier_serviceMethod_destinationCountry: {
          length: L,
          width: W,
          height: H,
          weight: WEIGHT,
          carrier: r['Carrier'],
          serviceMethod: r['Metoda wysylki'],
          destinationCountry: r['Kraj'],
        },
      },
      update: { basePrice, isActive: true },
      create: {
        length: L,
        width: W,
        height: H,
        weight: WEIGHT,
        carrier: r['Carrier'],
        serviceMethod: r['Metoda wysylki'],
        destinationCountry: r['Kraj'],
        basePrice,
        isActive: true,
      },
    })
    pliCount++
  }
  console.log(`upserted ${pliCount} pricelist items`)

  // 3) CheckHistory — single record for this run
  // Date derived from filename if we can; otherwise today.
  const dateMatch = path.match(/(\d{4}-\d{2}-\d{2})/)
  const checkDate = dateMatch ? new Date(`${dateMatch[1]}T10:00:00Z`) : new Date()
  const alertsPlanned = rows.filter(r => {
    const d = parseFloat((r['Roznica (PLN)'] || '0').replace(',', '.'))
    return Number.isFinite(d) && d !== 0
  }).length

  const history = await prisma.checkHistory.create({
    data: {
      checkDate,
      recipientsCount: recSeen.size,
      alertsCount: alertsPlanned,
      discrepanciesCount: alertsPlanned,
      status: 'completed',
    },
  })
  console.log(`created CheckHistory ${history.id} (${checkDate.toISOString()})`)

  // 4) Alerts — one per row with non-zero diff
  let alertCount = 0
  for (const r of rows) {
    const diff = parseFloat((r['Roznica (PLN)'] || '').replace(',', '.'))
    if (!Number.isFinite(diff) || diff === 0) continue

    const apiPrice = parseFloat((r['Cena API (PLN)'] || '').replace(',', '.'))
    const listPrice = parseFloat((r['Cena cennik (PLN)'] || '').replace(',', '.'))
    if (!Number.isFinite(apiPrice)) continue

    const percentDiff =
      Number.isFinite(listPrice) && listPrice !== 0
        ? ((apiPrice - listPrice) / listPrice) * 100
        : 0

    await prisma.alert.create({
      data: {
        checkDate,
        recipientId: `seed-${r['Kod pocztowy']}-${r['Kraj']}`,
        recipientName: r['Nazwa odbiorcy'],
        city: r['Miejscowość'],
        carrier: r['Carrier'],
        apiPrice,
        priceListPrice: Number.isFinite(listPrice) ? listPrice : null,
        difference: diff,
        percentDiff,
        status: 'unresolved',
      },
    })
    alertCount++
  }
  console.log(`created ${alertCount} alerts`)

  console.log('\n✓ import done')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
