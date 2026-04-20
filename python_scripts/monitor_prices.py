#!/usr/bin/env python3
import json
import sys
import os
import requests
import psycopg2
from datetime import datetime
import uuid

# Configuration
DATABASE_URL = os.environ.get('DATABASE_URL')
API_KEY = sys.argv[1] if len(sys.argv) > 1 else None
LOG_FILE = '/home/ubuntu/shared/cargoson_monitor/logs/cargoson_check.log'
OUTPUT_FILE = '/home/ubuntu/shared/cargoson_monitor/output/last_run_summary.json'

def log(message):
    timestamp = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    log_msg = f"[{timestamp}] {message}"
    print(log_msg)
    with open(LOG_FILE, 'a') as f:
        f.write(log_msg + '\n')

def main():
    if not API_KEY:
        log("ERROR: API key not provided")
        sys.exit(1)
    
    if not DATABASE_URL:
        log("ERROR: DATABASE_URL not set")
        sys.exit(1)
    
    conn = None
    try:
        # Connect to database
        log("Connecting to database")
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        # Fetch settings
        log("Fetching settings")
        cur.execute('SELECT "tolerancePercent", "alertEmail", "slackWebhook", "monitoringEnabled", "collectionPostcode", "collectionCountry" FROM "Settings" LIMIT 1')
        settings_row = cur.fetchone()
        
        if not settings_row:
            log("ERROR: No settings found")
            sys.exit(1)
        
        tolerance_percent, alert_email, slack_webhook, monitoring_enabled, collection_postcode, collection_country = settings_row
        
        log(f"Settings: tolerance={tolerance_percent}%, monitoring_enabled={monitoring_enabled}")
        
        if not monitoring_enabled:
            log("Monitoring is disabled - exiting")
            summary = {
                "timestamp": datetime.utcnow().isoformat() + 'Z',
                "tolerance": tolerance_percent,
                "total_recipients": 0,
                "checked_items": 0,
                "alert_count": 0,
                "has_alerts": False,
                "alerts": [],
                "email_to": alert_email,
                "slack_webhook": slack_webhook,
                "status": "monitoring_disabled"
            }
            with open(OUTPUT_FILE, 'w') as f:
                json.dump(summary, f, indent=2)
            conn.close()
            return
        
        # Fetch recipients
        log("Fetching recipients")
        cur.execute('SELECT id, name, city, "postalCode", country FROM "Recipient"')
        recipients = cur.fetchall()
        
        if not recipients:
            log("No recipients found - exiting")
            summary = {
                "timestamp": datetime.utcnow().isoformat() + 'Z',
                "tolerance": tolerance_percent,
                "total_recipients": 0,
                "checked_items": 0,
                "alert_count": 0,
                "has_alerts": False,
                "alerts": [],
                "email_to": alert_email,
                "slack_webhook": slack_webhook,
                "status": "no_recipients"
            }
            with open(OUTPUT_FILE, 'w') as f:
                json.dump(summary, f, indent=2)
            conn.close()
            return
        
        log(f"Found {len(recipients)} recipients")
        
        # Fetch price list items
        log("Fetching price list items")
        cur.execute('SELECT id, carrier, "basePrice", length, width, height, weight FROM "PriceListItem"')
        price_items = cur.fetchall()
        
        if not price_items:
            log("No price list items found - exiting")
            summary = {
                "timestamp": datetime.utcnow().isoformat() + 'Z',
                "tolerance": tolerance_percent,
                "total_recipients": len(recipients),
                "checked_items": 0,
                "alert_count": 0,
                "has_alerts": False,
                "alerts": [],
                "email_to": alert_email,
                "slack_webhook": slack_webhook,
                "status": "no_price_list"
            }
            with open(OUTPUT_FILE, 'w') as f:
                json.dump(summary, f, indent=2)
            conn.close()
            return
        
        log(f"Found {len(price_items)} price list items")
        
        # Build carrier price dictionary (normalized carrier name -> list of prices)
        carrier_prices = {}
        for item in price_items:
            item_id, carrier, base_price, length, width, height, weight = item
            carrier_normalized = carrier.lower().strip()
            if carrier_normalized not in carrier_prices:
                carrier_prices[carrier_normalized] = []
            carrier_prices[carrier_normalized].append({
                'id': item_id,
                'carrier': carrier,
                'basePrice': base_price,
                'length': length,
                'width': width,
                'height': height,
                'weight': weight
            })
        
        log(f"Built price dictionary with {len(carrier_prices)} unique carriers")
        
        # Create CheckHistory record
        log("Creating CheckHistory record")
        check_id = 'chk_' + uuid.uuid4().hex[:20]
        cur.execute(
            'INSERT INTO "CheckHistory" (id, "checkDate", "recipientsCount", "alertsCount", status) VALUES (%s, NOW(), %s, %s, %s)',
            (check_id, 0, 0, 'completed')
        )
        conn.commit()
        log(f"Created CheckHistory record: {check_id}")
        
        # Process each recipient
        alerts_summary = []
        checked_items = 0
        alert_count = 0
        
        for recipient in recipients:
            recipient_id, recipient_name, city, postal_code, country = recipient
            
            log(f"Processing recipient: {recipient_name} ({city}, {postal_code}, {country})")
            
            # Call Cargoson API
            # Calculate collection date (tomorrow)
            from datetime import timedelta
            collection_date = (datetime.utcnow() + timedelta(days=1)).strftime('%Y-%m-%d')
            
            payload = {
                "collection_date": collection_date,
                "collection_postcode": collection_postcode,
                "collection_country": collection_country,
                "delivery_postcode": postal_code,
                "delivery_country": country,
                "rows_attributes": [
                    {
                        "quantity": 1,
                        "package_type": "EUR",
                        "weight": 2.0
                    }
                ]
            }
            
            try:
                response = requests.post(
                    'https://www.cargoson.com/api/freightPrices/list',
                    json=payload,
                    headers={
                        'Authorization': f'Bearer {API_KEY}',
                        'Accept': 'application/vnd.api.v1',
                        'Content-Type': 'application/json'
                    },
                    timeout=20
                )
                
                if response.status_code == 204:
                    log(f"  INFO: No pricing options available for this route (HTTP 204)")
                    continue
                
                if response.status_code != 200:
                    log(f"  ERROR: API returned status {response.status_code} for recipient {recipient_id}: {response.text[:200]}")
                    continue
                
                try:
                    api_data = response.json()
                except:
                    log(f"  ERROR: Failed to parse JSON response for recipient {recipient_id}")
                    continue
                
                if 'object' not in api_data or 'prices' not in api_data['object']:
                    log(f"  WARNING: No 'object.prices' field in API response for recipient {recipient_id}")
                    continue
                
                pricing_options = api_data['object']['prices']
                log(f"  Received {len(pricing_options)} pricing options from API")
                
                # Process each pricing option
                for option in pricing_options:
                    if 'carrier' not in option or 'price' not in option:
                        log(f"  WARNING: Missing carrier or price in option: {option}")
                        continue
                    
                    carrier = option['carrier']
                    api_price = float(option['price'])
                    carrier_normalized = carrier.lower().strip()
                    
                    checked_items += 1
                    
                    # Find matching price list item
                    if carrier_normalized not in carrier_prices:
                        log(f"  WARNING: No price list match for carrier '{carrier}' (normalized: '{carrier_normalized}')")
                        continue
                    
                    # Use first matching price list item
                    price_item = carrier_prices[carrier_normalized][0]
                    base_price = price_item['basePrice']
                    
                    # Calculate difference
                    diff_value = api_price - base_price
                    diff_percent = (diff_value / base_price) * 100 if base_price != 0 else 0
                    
                    log(f"  {carrier}: API={api_price}, Base={base_price}, Diff={diff_percent:.2f}%")
                    
                    # Check if exceeds tolerance
                    if abs(diff_percent) > tolerance_percent:
                        log(f"  ALERT: Difference {diff_percent:.2f}% exceeds tolerance {tolerance_percent}%")
                        
                        # Create alert record
                        alert_id = 'alt_' + uuid.uuid4().hex[:20]
                        cur.execute(
                            '''INSERT INTO "Alert" 
                            (id, "checkDate", "recipientId", "recipientName", city, carrier, 
                             "apiPrice", "priceListPrice", difference, "percentDiff", status)
                            VALUES (%s, NOW(), %s, %s, %s, %s, %s, %s, %s, %s, %s)''',
                            (alert_id, recipient_id, recipient_name, city, carrier,
                             api_price, base_price, diff_value, diff_percent, 'unresolved')
                        )
                        
                        # Add to summary
                        alerts_summary.append({
                            'recipient_name': recipient_name,
                            'city': city,
                            'postal_code': postal_code,
                            'country': country,
                            'carrier': carrier,
                            'api_price': api_price,
                            'base_price': base_price,
                            'difference': diff_value,
                            'percent_diff': diff_percent
                        })
                        
                        alert_count += 1
                
            except requests.exceptions.Timeout:
                log(f"  ERROR: API request timeout for recipient {recipient_id}")
            except requests.exceptions.RequestException as e:
                log(f"  ERROR: API request failed for recipient {recipient_id}: {e}")
            except Exception as e:
                log(f"  ERROR: Unexpected error processing recipient {recipient_id}: {e}")
        
        # Update CheckHistory
        log(f"Updating CheckHistory: recipients={len(recipients)}, alerts={alert_count}")
        cur.execute(
            'UPDATE "CheckHistory" SET "recipientsCount" = %s, "alertsCount" = %s WHERE id = %s',
            (len(recipients), alert_count, check_id)
        )
        conn.commit()
        
        # Create summary JSON
        summary = {
            "timestamp": datetime.utcnow().isoformat() + 'Z',
            "tolerance": tolerance_percent,
            "total_recipients": len(recipients),
            "checked_items": checked_items,
            "alert_count": alert_count,
            "has_alerts": alert_count > 0,
            "alerts": alerts_summary,
            "email_to": alert_email,
            "slack_webhook": slack_webhook,
            "status": "completed"
        }
        
        log(f"Writing summary to {OUTPUT_FILE}")
        with open(OUTPUT_FILE, 'w') as f:
            json.dump(summary, f, indent=2)
        
        log(f"Monitoring completed: {alert_count} alerts generated from {checked_items} checks")
        
    except Exception as e:
        log(f"FATAL ERROR: {e}")
        import traceback
        log(traceback.format_exc())
        sys.exit(1)
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    main()
