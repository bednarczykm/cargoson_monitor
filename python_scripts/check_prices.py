#!/usr/bin/env python3
import json
import requests
import sys
import os
from datetime import datetime
import psycopg2
import uuid

# Load environment
DATABASE_URL = os.environ.get('DATABASE_URL')
LOG_FILE = "/home/ubuntu/shared/cargoson_monitor/logs/cargoson_check.log"

def log(message):
    timestamp = datetime.now().isoformat()
    with open(LOG_FILE, 'a') as f:
        f.write(f"[{timestamp}] {message}\n")
    print(message)

# Load settings
with open('/tmp/cargoson_settings.env', 'r') as f:
    for line in f:
        key, val = line.strip().split('=', 1)
        os.environ[key] = val

TOLERANCE = float(os.environ['TOLERANCE'])
COLLECTION_POSTCODE = os.environ['COLLECTION_POSTCODE']
COLLECTION_COUNTRY = os.environ['COLLECTION_COUNTRY']

# Load API key
with open('/tmp/cargoson_api_key.txt', 'r') as f:
    API_KEY = f.read().strip()

# Load recipients
recipients = []
with open('/tmp/recipients.txt', 'r') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split('|')]
        if len(parts) >= 5:
            recipients.append({
                'id': parts[0],
                'name': parts[1],
                'city': parts[2],
                'postalCode': parts[3],
                'country': parts[4]
            })

log(f"Processing {len(recipients)} recipients")

# Load price list and create normalized lookup
pricelist_lookup = {}
with open('/tmp/pricelist.txt', 'r') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split('|')]
        if len(parts) >= 7:
            carrier = parts[1]
            carrier_normalized = carrier.lower().strip()
            if carrier_normalized not in pricelist_lookup:
                pricelist_lookup[carrier_normalized] = []
            pricelist_lookup[carrier_normalized].append({
                'id': parts[0],
                'carrier': carrier,
                'basePrice': float(parts[2]),
                'length': float(parts[3]),
                'width': float(parts[4]),
                'height': float(parts[5]),
                'weight': float(parts[6])
            })

log(f"Loaded {len(pricelist_lookup)} unique carriers in price list")

# Connect to database
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

# Counters
checked_items = 0
alerts_created = 0
alerts_summary = []

# Process each recipient
for recipient in recipients:
    log(f"Checking recipient: {recipient['name']} ({recipient['city']})")
    
    # Prepare API request - using correct Cargoson API format
    from datetime import date, timedelta
    collection_date = (date.today() + timedelta(days=1)).strftime('%Y-%m-%d')
    
    payload = {
        "collection_date": collection_date,
        "collection_postcode": COLLECTION_POSTCODE,
        "collection_country": COLLECTION_COUNTRY,
        "delivery_postcode": recipient['postalCode'],
        "delivery_country": recipient['country'],
        "rows_attributes": [{
            "quantity": 1,
            "package_type": "EUR",
            "weight": 100.0
        }]
    }
    
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Accept': 'application/vnd.api.v1',
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.post(
            'https://www.cargoson.com/api/v1/freightPrices/list',
            json=payload,
            headers=headers,
            timeout=20
        )
        
        if response.status_code != 200:
            log(f"ERROR: API call failed for recipient {recipient['id']}: status={response.status_code}, body={response.text[:200]}")
            continue
        
        api_data = response.json()
        
        # Extract pricing options - correct Cargoson API structure
        if 'object' not in api_data or 'prices' not in api_data['object']:
            log(f"WARNING: Unexpected API response format for recipient {recipient['id']}")
            continue
        
        prices = api_data['object']['prices']
        if not isinstance(prices, list):
            log(f"WARNING: Prices is not a list for recipient {recipient['id']}")
            continue
        
        for option in prices:
            checked_items += 1
            
            carrier = option.get('carrier', '')
            currency = option.get('currency', 'PLN')
            
            # Extract BASE PRICE (transport_price) from surcharges, not total price
            # This excludes fuel surcharges (BAF), energy fees, MAUT, etc.
            surcharges = option.get('surcharges', [])
            transport_surcharge = next((s for s in surcharges if s.get('identifier') == 'transport_price'), None)
            
            if transport_surcharge:
                api_price = float(transport_surcharge.get('amount', 0))
            else:
                # Fallback to total price if no transport_price found
                api_price = float(option.get('price', 0))
            
            # Convert EUR to PLN if needed
            EUR_TO_PLN = 4.3
            if currency == 'EUR':
                api_price = api_price * EUR_TO_PLN
            
            carrier_normalized = carrier.lower().strip()
            
            # Find matching price list item
            if carrier_normalized not in pricelist_lookup:
                log(f"WARNING: No price list match for carrier '{carrier}' (normalized: '{carrier_normalized}')")
                continue
            
            # Use first matching item
            pricelist_item = pricelist_lookup[carrier_normalized][0]
            base_price = pricelist_item['basePrice']
            
            # Calculate difference
            diff_value = api_price - base_price
            diff_percent = (diff_value / base_price) * 100 if base_price > 0 else 0
            
            # Check if exceeds tolerance
            if abs(diff_percent) > TOLERANCE:
                alert_id = str(uuid.uuid4())
                
                cur.execute("""
                    INSERT INTO "Alert" 
                    (id, "checkDate", "recipientId", "recipientName", city, carrier, 
                     "apiPrice", "priceListPrice", difference, "percentDiff", status)
                    VALUES (%s, NOW(), %s, %s, %s, %s, %s, %s, %s, %s, 'unresolved')
                """, (alert_id, recipient['id'], recipient['name'], recipient['city'], 
                      carrier, api_price, base_price, diff_value, diff_percent))
                
                alerts_created += 1
                alerts_summary.append({
                    'recipient_name': recipient['name'],
                    'city': recipient['city'],
                    'postal_code': recipient['postalCode'],
                    'country': recipient['country'],
                    'carrier': carrier,
                    'api_price': api_price,
                    'base_price': base_price,
                    'diff_value': diff_value,
                    'diff_percent': diff_percent
                })
                
                log(f"ALERT: {carrier} for {recipient['name']}: API={api_price} vs Base={base_price} ({diff_percent:+.1f}%)")
    
    except requests.exceptions.Timeout:
        log(f"ERROR: Timeout calling API for recipient {recipient['id']}")
    except Exception as e:
        log(f"ERROR: Exception for recipient {recipient['id']}: {str(e)}")

# Update CheckHistory
with open('/tmp/check_history_id.txt', 'r') as f:
    check_id = f.read().strip()

cur.execute("""
    UPDATE "CheckHistory" 
    SET "recipientsCount" = %s, "alertsCount" = %s 
    WHERE id = %s
""", (len(recipients), alerts_created, check_id))

conn.commit()
cur.close()
conn.close()

log(f"Check completed: {len(recipients)} recipients, {checked_items} items checked, {alerts_created} alerts created")

# Save summary
summary = {
    'timestamp': datetime.now().isoformat(),
    'tolerance': TOLERANCE,
    'total_recipients': len(recipients),
    'checked_items': checked_items,
    'alert_count': alerts_created,
    'has_alerts': alerts_created > 0,
    'alerts': alerts_summary,
    'email_to': os.environ['ALERT_EMAIL'],
    'slack_webhook': os.environ['SLACK_WEBHOOK']
}

with open('/home/ubuntu/shared/cargoson_monitor/output/last_run_summary.json', 'w') as f:
    json.dump(summary, f, indent=2)

log("Summary saved to last_run_summary.json")
