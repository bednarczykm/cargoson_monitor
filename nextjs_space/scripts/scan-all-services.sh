#!/bin/bash

# Kraje do testowania
countries=("DE:10115" "FR:75001" "ES:28001" "IT:00100" "NL:1011" "BE:1000" "CZ:11000" "AT:1010" "SK:81101" "HU:1011" "SE:11120" "DK:1000" "FI:00100" "PT:1000" "GR:10431" "RO:010011" "BG:1000" "HR:10000" "SI:1000" "LT:01100" "LV:1001" "EE:10111")

echo "=== Skanowanie usług dla wszystkich krajów ===" > /tmp/all_services.txt

for entry in "${countries[@]}"; do
  country="${entry%%:*}"
  postcode="${entry##*:}"
  
  echo "Sprawdzam $country..."
  
  result=$(curl -s 'https://www.cargoson.com/api/freightPrices/list' \
    -H 'accept: application/json' \
    -H 'authorization: Token 2CtBvedaqT5uwtZnVkN8oRZDUHj7Jqne' \
    -H 'content-type: application/json' \
    --data-raw "{\"collection_date\":\"24.02.2026\",\"collection_country\":\"PL\",\"collection_postcode\":\"43-300\",\"delivery_country\":\"$country\",\"delivery_postcode\":\"$postcode\",\"adr\":false,\"frigo\":false,\"delivery_to_private_person\":false,\"request_external_partners\":true,\"calculate_click\":true,\"rows_attributes\":{\"0\":{\"cbm\":\"0.001\",\"description\":\"Goods\",\"height\":\"10\",\"ldm\":\"0\",\"length\":\"10\",\"package_type\":\"CTN\",\"quantity\":\"1\",\"weight\":\"2\",\"width\":\"10\"}},\"options\":{\"measurement_units\":\"metric\"}}")
  
  echo "--- $country ---" >> /tmp/all_services.txt
  echo "$result" | jq -r '.object.prices[] | "\(.carrier) | \(.service) | \(.price) \(.currency)"' >> /tmp/all_services.txt 2>/dev/null || echo "No prices" >> /tmp/all_services.txt
  echo "" >> /tmp/all_services.txt
done

echo "=== Gotowe ===" >> /tmp/all_services.txt
