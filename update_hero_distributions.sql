-- Update Script: Füge fehlende Spalten zur hero_distributions Tabelle hinzu
-- Dieses Script in phpMyAdmin ausführen, um die bestehende Datenbank zu aktualisieren

USE gang_management;

-- Füge expected_sale_price Spalte hinzu (falls nicht vorhanden)
ALTER TABLE hero_distributions 
ADD COLUMN IF NOT EXISTS expected_sale_price DECIMAL(10, 2) DEFAULT 0 AFTER total_cost;

-- Füge gang_share Spalte hinzu (falls nicht vorhanden)
ALTER TABLE hero_distributions 
ADD COLUMN IF NOT EXISTS gang_share DECIMAL(10, 2) DEFAULT 0 AFTER expected_sale_price;

-- Aktualisiere auch die Archive-Tabelle
ALTER TABLE hero_distributions_archive 
ADD COLUMN IF NOT EXISTS expected_sale_price DECIMAL(10, 2) DEFAULT 0 AFTER total_cost;

ALTER TABLE hero_distributions_archive 
ADD COLUMN IF NOT EXISTS gang_share DECIMAL(10, 2) DEFAULT 0 AFTER expected_sale_price;

-- Optional: Aktualisiere bestehende Einträge mit berechneten Werten
-- (Nur wenn die Spalten neu hinzugefügt wurden und Daten vorhanden sind)
UPDATE hero_distributions d
JOIN hero_inventory i ON 1=1
SET 
    d.expected_sale_price = d.quantity * i.sale_price,
    d.gang_share = (d.quantity * i.sale_price) * (i.gang_percentage / 100)
WHERE d.expected_sale_price = 0 OR d.expected_sale_price IS NULL;

-- Prüfe das Ergebnis
SELECT 'Update abgeschlossen! Die hero_distributions und hero_distributions_archive Tabellen wurden aktualisiert.' as Status;
SELECT * FROM hero_distributions LIMIT 5;
