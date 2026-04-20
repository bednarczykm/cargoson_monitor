=== Schemat tabel Cargoson Monitor ===
                                     Table "public.Settings"
        Column        |              Type              | Collation | Nullable |      Default      
----------------------+--------------------------------+-----------+----------+-------------------
 id                   | text                           |           | not null | 
 tolerancePercent     | double precision               |           | not null | 0
 checkIntervalMinutes | integer                        |           | not null | 60
 pauseStart           | text                           |           | not null | '23:00'::text
 pauseEnd             | text                           |           | not null | '05:00'::text
 alertEmail           | text                           |           |          | 
 slackWebhook         | text                           |           |          | 
 monitoringEnabled    | boolean                        |           | not null | false
 collectionPostcode   | text                           |           | not null | '10115'::text
 collectionCountry    | text                           |           | not null | 'DE'::text
 createdAt            | timestamp(3) without time zone |           | not null | CURRENT_TIMESTAMP
 updatedAt            | timestamp(3) without time zone |           | not null | 
Indexes:
    "Settings_pkey" PRIMARY KEY, btree (id)

                                Table "public.Recipient"
   Column   |              Type              | Collation | Nullable |      Default      
------------+--------------------------------+-----------+----------+-------------------
 id         | text                           |           | not null | 
 name       | text                           |           | not null | 
 street     | text                           |           | not null | 
 city       | text                           |           | not null | 
 postalCode | text                           |           | not null | 
 country    | text                           |           | not null | 
 createdAt  | timestamp(3) without time zone |           | not null | CURRENT_TIMESTAMP
 updatedAt  | timestamp(3) without time zone |           | not null | 
Indexes:
    "Recipient_pkey" PRIMARY KEY, btree (id)

                             Table "public.PriceListItem"
  Column   |              Type              | Collation | Nullable |      Default      
-----------+--------------------------------+-----------+----------+-------------------
 id        | text                           |           | not null | 
 length    | double precision               |           | not null | 
 width     | double precision               |           | not null | 
 height    | double precision               |           | not null | 
 weight    | double precision               |           | not null | 
 carrier   | text                           |           | not null | 
 basePrice | double precision               |           | not null | 
 createdAt | timestamp(3) without time zone |           | not null | CURRENT_TIMESTAMP
 updatedAt | timestamp(3) without time zone |           | not null | 
Indexes:
    "PriceListItem_pkey" PRIMARY KEY, btree (id)
    "PriceListItem_length_width_height_weight_carrier_key" UNIQUE, btree (length, width, height, weight, carrier)

                                 Table "public.CheckHistory"
     Column      |              Type              | Collation | Nullable |      Default      
-----------------+--------------------------------+-----------+----------+-------------------
 id              | text                           |           | not null | 
 checkDate       | timestamp(3) without time zone |           | not null | CURRENT_TIMESTAMP
 recipientsCount | integer                        |           | not null | 
 alertsCount     | integer                        |           | not null | 
 status          | text                           |           | not null | 'completed'::text
 csvData         | text                           |           |          | 
 createdAt       | timestamp(3) without time zone |           | not null | CURRENT_TIMESTAMP
Indexes:
    "CheckHistory_pkey" PRIMARY KEY, btree (id)

                                    Table "public.Alert"
     Column     |              Type              | Collation | Nullable |      Default       
----------------+--------------------------------+-----------+----------+--------------------
 id             | text                           |           | not null | 
 checkDate      | timestamp(3) without time zone |           | not null | CURRENT_TIMESTAMP
 recipientId    | text                           |           | not null | 
 recipientName  | text                           |           | not null | 
 city           | text                           |           | not null | 
 carrier        | text                           |           | not null | 
 apiPrice       | double precision               |           | not null | 
 priceListPrice | double precision               |           |          | 
 difference     | double precision               |           |          | 
 percentDiff    | double precision               |           |          | 
 status         | text                           |           | not null | 'unresolved'::text
 createdAt      | timestamp(3) without time zone |           | not null | CURRENT_TIMESTAMP
 updatedAt      | timestamp(3) without time zone |           | not null | 
Indexes:
    "Alert_pkey" PRIMARY KEY, btree (id)

