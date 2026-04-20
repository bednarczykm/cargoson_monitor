import json
import sys

try:
    with open('/home/ubuntu/.config/abacusai_auth_secrets.json', 'r') as f:
        data = json.load(f)
    
    if 'cargoson' in data and 'secrets' in data['cargoson'] and 'api_key' in data['cargoson']['secrets']:
        api_key = data['cargoson']['secrets']['api_key']['value']
        print(api_key)
    else:
        print("ERROR: API key not found", file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
