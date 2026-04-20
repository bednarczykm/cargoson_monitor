#!/usr/bin/env python3
"""
Script to authenticate with NextAuth and call the check-prices API endpoint
"""
import requests
import json
from datetime import datetime
import pytz
import os

# Configuration
APP_URL = "https://ceny-wysylek.abacusai.app"
EMAIL = "john@doe.com"
PASSWORD = "johndoe123"
LOG_DIR = "/home/ubuntu/shared/cargoson_monitor/logs"

def log(message):
    """Log message to file and console"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_file = os.path.join(LOG_DIR, "cargoson_check.log")
    
    # Ensure log directory exists
    os.makedirs(LOG_DIR, exist_ok=True)
    
    with open(log_file, 'a') as f:
        f.write(f"[{timestamp}] {message}\n")
    print(f"[{timestamp}] {message}")

def check_pause_window():
    """Check if current Warsaw time is in pause window (00:00-05:00)"""
    warsaw_tz = pytz.timezone('Europe/Warsaw')
    warsaw_time = datetime.now(warsaw_tz)
    hour = warsaw_time.hour
    
    if 0 <= hour < 5:
        log(f"Current Warsaw time is {warsaw_time.strftime('%H:%M:%S')} - in pause window (00:00-05:00). Skipping check.")
        return True
    
    log(f"Current Warsaw time is {warsaw_time.strftime('%H:%M:%S')} - outside pause window. Proceeding with check.")
    return False

def authenticate():
    """Authenticate with NextAuth and get session cookie"""
    log("Authenticating with NextAuth...")
    
    session = requests.Session()
    
    # Get CSRF token
    try:
        csrf_response = session.get(f"{APP_URL}/api/auth/csrf", timeout=10)
        csrf_response.raise_for_status()
        csrf_token = csrf_response.json().get('csrfToken')
        log(f"Got CSRF token: {csrf_token[:20]}...")
    except Exception as e:
        log(f"ERROR: Failed to get CSRF token: {str(e)}")
        return None
    
    # Sign in
    try:
        signin_data = {
            'email': EMAIL,
            'password': PASSWORD,
            'csrfToken': csrf_token,
            'callbackUrl': f"{APP_URL}/dashboard",
            'json': 'true'
        }
        
        signin_response = session.post(
            f"{APP_URL}/api/auth/callback/credentials",
            data=signin_data,
            timeout=10,
            allow_redirects=False
        )
        
        # Check if authentication was successful
        if signin_response.status_code in [200, 302]:
            log("Authentication successful")
            return session
        else:
            log(f"ERROR: Authentication failed with status {signin_response.status_code}")
            log(f"Response: {signin_response.text[:200]}")
            return None
            
    except Exception as e:
        log(f"ERROR: Failed to authenticate: {str(e)}")
        return None

def call_check_prices_api(session):
    """Call the check-prices API endpoint"""
    log("Calling check-prices API endpoint...")
    
    try:
        response = session.post(
            f"{APP_URL}/api/check-prices",
            timeout=300  # 5 minutes timeout for the check
        )
        
        if response.status_code == 200:
            result = response.json()
            log(f"Check completed successfully")
            log(f"Recipients checked: {result.get('recipientsChecked', 0)}")
            log(f"Alerts created: {result.get('alertsCreated', 0)}")
            
            # Log detailed results
            if result.get('alertsCreated', 0) > 0:
                log(f"ALERTS DETECTED: {result.get('alertsCreated')} price discrepancies found")
            
            return result
        else:
            log(f"ERROR: API call failed with status {response.status_code}")
            log(f"Response: {response.text[:500]}")
            return None
            
    except requests.exceptions.Timeout:
        log("ERROR: API call timed out after 5 minutes")
        return None
    except Exception as e:
        log(f"ERROR: Failed to call API: {str(e)}")
        return None

def main():
    log("=" * 80)
    log("Starting Cargoson price check")
    
    # Check if in pause window
    if check_pause_window():
        log("Exiting due to pause window")
        return
    
    # Authenticate
    session = authenticate()
    if not session:
        log("ERROR: Authentication failed. Exiting.")
        return
    
    # Call check-prices API
    result = call_check_prices_api(session)
    
    if result:
        log("Price check completed successfully")
    else:
        log("ERROR: Price check failed")
    
    log("=" * 80)

if __name__ == "__main__":
    main()
