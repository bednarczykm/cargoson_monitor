#!/usr/bin/env python3
"""
Send notifications for Cargoson price alerts
"""

import json
import sys
import subprocess
from datetime import datetime

LOG_FILE = '/home/ubuntu/shared/cargoson_monitor/logs/cargoson_check.log'
SUMMARY_FILE = '/home/ubuntu/shared/cargoson_monitor/output/last_run_summary.json'
EMAIL_HTML_FILE = '/home/ubuntu/shared/cargoson_monitor/output/alerts_email_body.html'
SLACK_PAYLOAD_FILE = '/home/ubuntu/shared/cargoson_monitor/output/alerts_slack_payload.json'

def log(message: str):
    """Write timestamped log message"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_msg = f"[{timestamp}] {message}\n"
    with open(LOG_FILE, 'a') as f:
        f.write(log_msg)
    print(log_msg.strip())

def main():
    # Step 12: Check if there are alerts
    log("Checking for alerts in summary file")
    
    with open(SUMMARY_FILE, 'r') as f:
        summary = json.load(f)
    
    if not summary.get('has_alerts', False) or summary.get('alert_count', 0) == 0:
        log("Brak alertów cenowych - nie wysyłam powiadomień")
        return
    
    log(f"Found {summary['alert_count']} alerts - preparing notifications")
    
    # Step 13: Generate HTML email body
    log("Generating HTML email body")
    
    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        h1 {{ color: #d32f2f; }}
        .summary {{ background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }}
        table {{ border-collapse: collapse; width: 100%; margin-top: 20px; }}
        th {{ background-color: #1976d2; color: white; padding: 12px; text-align: left; }}
        td {{ padding: 10px; border-bottom: 1px solid #ddd; }}
        tr:hover {{ background-color: #f5f5f5; }}
        .positive {{ color: #388e3c; }}
        .negative {{ color: #d32f2f; }}
    </style>
</head>
<body>
    <h1>⚠️ Cargoson - Wykryto odchylenia cen wysyłki</h1>
    
    <div class="summary">
        <p><strong>Data sprawdzenia:</strong> {summary['timestamp'][:19]}</p>
        <p><strong>Tolerancja:</strong> {summary['tolerance']}%</p>
        <p><strong>Liczba sprawdzonych odbiorców:</strong> {summary['total_recipients']}</p>
        <p><strong>Liczba sprawdzeń:</strong> {summary['checked_items']}</p>
        <p><strong>Liczba alertów:</strong> {summary['alert_count']}</p>
    </div>
    
    <h2>Szczegóły alertów:</h2>
    
    <table>
        <thead>
            <tr>
                <th>Odbiorca</th>
                <th>Kod pocztowy</th>
                <th>Kraj</th>
                <th>Carrier</th>
                <th>Cena z API</th>
                <th>Cena z cennika</th>
                <th>Różnica (wartość)</th>
                <th>Różnica (%)</th>
            </tr>
        </thead>
        <tbody>
"""
    
    for alert in summary['alerts']:
        diff_class = 'positive' if alert['difference'] < 0 else 'negative'
        diff_sign = '' if alert['difference'] < 0 else '+'
        
        html_content += f"""            <tr>
                <td><strong>{alert['recipientName']}</strong><br>{alert['city']}</td>
                <td>{alert['postalCode']}</td>
                <td>{alert['country']}</td>
                <td>{alert['carrier']}</td>
                <td>{alert['apiPrice']:.2f}</td>
                <td>{alert['priceListPrice']:.2f}</td>
                <td class="{diff_class}">{diff_sign}{alert['difference']:.2f}</td>
                <td class="{diff_class}">{diff_sign}{alert['percentDiff']:.2f}%</td>
            </tr>
"""
    
    html_content += """        </tbody>
    </table>
    
    <p style="margin-top: 30px; color: #666; font-size: 12px;">
        Ten email został wygenerowany automatycznie przez system monitoringu Cargoson.
    </p>
</body>
</html>"""
    
    with open(EMAIL_HTML_FILE, 'w') as f:
        f.write(html_content)
    
    log(f"HTML email body saved to {EMAIL_HTML_FILE}")
    
    # Step 14: Send email (will be done via Send_Email_Tool)
    log(f"Email prepared for: {summary['email_to']}")
    log(f"Subject: Cargoson - wykryto {summary['alert_count']} odchyleń cen wysyłki")
    
    # Step 15: Prepare Slack message
    log("Preparing Slack message")
    
    slack_text = f"🚨 *Cargoson - Alert cenowy*\n"
    slack_text += f"Data: {summary['timestamp'][:19]} | Alertów: {summary['alert_count']}\n\n"
    
    # Add first 10 alerts
    for i, alert in enumerate(summary['alerts'][:10]):
        diff_sign = '' if alert['difference'] < 0 else '+'
        slack_text += f"• *[{alert['carrier']}]* {alert['recipientName']}, {alert['city']} ({alert['postalCode']}, {alert['country']}): "
        slack_text += f"{alert['apiPrice']:.2f} vs {alert['priceListPrice']:.2f} ({diff_sign}{alert['percentDiff']:.2f}%)\n"
    
    if summary['alert_count'] > 10:
        slack_text += f"\n... i {summary['alert_count'] - 10} więcej alertów"
    
    slack_payload = {
        "text": slack_text
    }
    
    with open(SLACK_PAYLOAD_FILE, 'w') as f:
        json.dump(slack_payload, f, indent=2)
    
    log(f"Slack payload saved to {SLACK_PAYLOAD_FILE}")
    
    # Step 16: Send to Slack (will be done via curl)
    log(f"Slack webhook ready: {summary['slack_webhook']}")
    
    print("\n=== NOTIFICATIONS READY ===")
    print(f"Email recipient: {summary['email_to']}")
    print(f"Slack webhook: {summary['slack_webhook']}")
    print(f"Alert count: {summary['alert_count']}")

if __name__ == '__main__':
    main()
