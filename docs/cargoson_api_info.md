# Cargoson API - Dokumentacja dla systemu monitorowania kosztów wysyłki

## 1. Informacje podstawowe

### Base URL
```
https://www.cargoson.com/api/v1
```

### Autoryzacja
Każdy request wymaga dwóch nagłówków:
```http
Authorization: Bearer YOUR_API_KEY
Accept: application/vnd.api.v1
```

---

## 2. Endpoint do pobierania kosztów wysyłki (Rate API)

### URL
```
POST /freightPrices/list
```

Pełny URL: `https://www.cargoson.com/api/v1/freightPrices/list`

### Wymagane parametry

| Parametr | Typ | Opis |
|----------|-----|------|
| `collection_date` | string | Data odbioru (format: YYYY-MM-DD) |
| `collection_postcode` | string | Kod pocztowy miejsca odbioru |
| `collection_country` | string | Kraj odbioru (ISO 3166-1 alpha-2, np. "DE", "PL") |
| `delivery_postcode` | string | Kod pocztowy miejsca dostawy |
| `delivery_country` | string | Kraj dostawy (ISO 3166-1 alpha-2, np. "SE", "DE") |
| `rows_attributes` | array | Tablica z informacjami o paczkach/paletach |

### Opcjonalne parametry (dodatkowe usługi)

| Parametr | Typ | Opis |
|----------|-----|------|
| `collection_with_tail_lift` | boolean | Odbiór z windą załadowczą |
| `collection_prenotification` | boolean | Powiadomienie przed odbiorem |
| `delivery_with_tail_lift` | boolean | Dostawa z windą załadowczą |
| `delivery_prenotification` | boolean | Powiadomienie przed dostawą |
| `delivery_return_document` | boolean | Zwrot dokumentów |
| `delivery_to_private_person` | boolean | Dostawa do osoby prywatnej |
| `frigo` | boolean | Transport chłodniczy |
| `adr` | boolean | Towary niebezpieczne (ADR) |

### Struktura `rows_attributes` (informacje o paczkach)

| Pole | Typ | Opis |
|------|-----|------|
| `quantity` | integer | Liczba jednostek |
| `package_type` | string | Typ opakowania: "EUR" (europaleta), "FIN" (paleta fińska), itp. |
| `weight` | float | Waga w kg |
| `description` | string | Opis towaru (opcjonalnie) |

---

## 3. Przykładowy request

### cURL
```bash
curl -X POST 'https://www.cargoson.com/api/v1/freightPrices/list' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Accept: application/vnd.api.v1' \
  -d '{
    "collection_date": "2026-02-15",
    "collection_postcode": "10115",
    "collection_country": "DE",
    "delivery_postcode": "11122",
    "delivery_country": "SE",
    "rows_attributes": [
      {
        "quantity": 1,
        "package_type": "EUR",
        "weight": 100.0
      }
    ]
  }'
```

### Python (requests)
```python
import requests

url = "https://www.cargoson.com/api/v1/freightPrices/list"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_KEY",
    "Accept": "application/vnd.api.v1"
}
payload = {
    "collection_date": "2026-02-15",
    "collection_postcode": "10115",
    "collection_country": "DE",
    "delivery_postcode": "11122",
    "delivery_country": "SE",
    "rows_attributes": [
        {
            "quantity": 1,
            "package_type": "EUR",
            "weight": 100.0
        }
    ]
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()
```

---

## 4. Struktura odpowiedzi - gdzie znajduje się koszt bazowy

### Przykładowa odpowiedź
```json
{
  "status": 200,
  "object": {
    "prices": [
      {
        "carrier": "A Cargo SIA",
        "reg_no": "40203240936",
        "id": 1637,
        "service": "Main",
        "service_id": 85,
        "price": "19.13",
        "unit": "payable_weight",
        "type": "price_list"
      },
      {
        "carrier": "A Cargo SIA",
        "reg_no": "40203240936",
        "id": 1637,
        "service": "Express Service",
        "service_id": 123,
        "price": "32.50",
        "unit": "real_weight",
        "type": "online"
      }
    ]
  }
}
```

### 🎯 Lokalizacja kosztu bazowego

**Ścieżka do ceny:** `response.object.prices[].price`

| Pole | Opis |
|------|------|
| `price` | **Koszt bazowy wysyłki** (string, wartość liczbowa) |
| `carrier` | Nazwa przewoźnika |
| `service` | Nazwa usługi |
| `service_id` | ID usługi (używane do bezpośredniej rezerwacji) |
| `unit` | Jednostka kalkulacji: `payable_weight` lub `real_weight` |
| `type` | Typ ceny: `price_list` (z cennika) lub `online` (dynamiczna) |

### Kod do ekstrakcji cen (Python)
```python
def get_base_prices(response_data):
    """Wyciąga koszty bazowe z odpowiedzi API"""
    prices = []
    for price_entry in response_data.get("object", {}).get("prices", []):
        prices.append({
            "carrier": price_entry["carrier"],
            "service": price_entry["service"],
            "service_id": price_entry["service_id"],
            "base_price": float(price_entry["price"]),  # KOSZT BAZOWY
            "unit": price_entry["unit"],
            "type": price_entry["type"]
        })
    return prices
```

---

## 5. Inne przydatne endpointy

### Booking (rezerwacja wysyłki)
```
POST /queries
```
- Użyj `direct_booking_service_id` z odpowiedzi Rate API
- Wymaga pełnych danych adresowych (nadawca i odbiorca)

### Tracking (śledzenie)
```
GET /bookings/{reference}
```
- Zwraca status przesyłki, URL do śledzenia

### Lista usług
```
GET /services/list
```
- Zwraca dostępne usługi przewoźników

---

## 6. Podsumowanie dla implementacji monitoringu

### Workflow monitorowania kosztów:
1. **Pobierz ceny** → `POST /freightPrices/list`
2. **Parsuj odpowiedź** → `response.object.prices[]`
3. **Wyciągnij koszt bazowy** → pole `price` z każdego obiektu
4. **Zapisz do bazy/porównaj** → monitoruj zmiany w czasie

### Minimalne dane do zapytania:
- Data odbioru
- Kraj i kod pocztowy (odbiór)
- Kraj i kod pocztowy (dostawa)
- Dane paczki (ilość, typ, waga)

### Uwagi:
- Ceny są zwracane jako string, należy konwertować na float
- API może zwrócić wiele cen od różnych przewoźników/usług
- `service_id` jest potrzebny do późniejszej rezerwacji
