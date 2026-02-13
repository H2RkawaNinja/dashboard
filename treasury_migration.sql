-- ========================================
-- TREASURY SYSTEM MIGRATION - EUR zu USD & Flexible Beitragsperioden
-- ========================================
-- Dieses Script migriert das bestehende Treasury-System
-- Führe diese SQLs in phpMyAdmin aus um das System zu aktualisieren

USE gang_management;

-- ========================================
-- 1. GANG_TREASURY TABELLE UPDATEN
-- ========================================

-- Neue Spalten hinzufügen
ALTER TABLE gang_treasury 
ADD COLUMN current_balance_usd DECIMAL(15, 2) DEFAULT 0 AFTER id,
ADD COLUMN currency VARCHAR(3) DEFAULT 'USD' AFTER current_balance_usd;

-- Daten von alter Spalte zur neuen kopieren (EUR zu USD Conversion - Faktor 1.1 als Beispiel)
UPDATE gang_treasury 
SET current_balance_usd = current_balance * 1.1,
    currency = 'USD'
WHERE current_balance_usd = 0;

-- Alte Spalte löschen
ALTER TABLE gang_treasury DROP COLUMN current_balance;

-- ========================================
-- 2. GANG_TRANSACTIONS TABELLE UPDATEN  
-- ========================================

-- Neue Spalten hinzufügen
ALTER TABLE gang_transactions 
ADD COLUMN amount_usd DECIMAL(15, 2) NOT NULL DEFAULT 0 AFTER type,
ADD COLUMN currency VARCHAR(3) DEFAULT 'USD' AFTER amount_usd;

-- Daten von alter Spalte zur neuen kopieren (EUR zu USD Conversion)
UPDATE gang_transactions 
SET amount_usd = amount * 1.1,
    currency = 'USD'
WHERE amount_usd = 0;

-- Alte Spalte löschen
ALTER TABLE gang_transactions DROP COLUMN amount;

-- ========================================
-- 3. MEMBER_CONTRIBUTIONS TABELLE KOMPLETT NEU STRUKTURIEREN
-- ========================================

-- Backup der alten Daten erstellen
CREATE TABLE member_contributions_backup AS 
SELECT * FROM member_contributions;

-- Alte Tabelle löschen
DROP TABLE member_contributions;

-- Neue Tabelle mit flexiblen Perioden erstellen
CREATE TABLE member_contributions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    period_type ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'custom') DEFAULT 'monthly',
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    period_description VARCHAR(100), -- z.B. "KW 7 2026", "Februar 2026", etc.
    required_amount_usd DECIMAL(10, 2) DEFAULT 0,
    paid_amount_usd DECIMAL(10, 2) DEFAULT 0,
    status ENUM('nicht_bezahlt', 'teilweise_bezahlt', 'vollständig_bezahlt') DEFAULT 'nicht_bezahlt',
    due_date DATE,
    payment_date TIMESTAMP NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    UNIQUE KEY unique_member_period (member_id, period_start, period_end)
);

-- Alte Daten in neues Format migrieren
INSERT INTO member_contributions (
    member_id, 
    period_type, 
    period_start, 
    period_end, 
    period_description,
    required_amount_usd, 
    paid_amount_usd, 
    status, 
    due_date, 
    payment_date, 
    notes, 
    created_at,
    updated_at
)
SELECT 
    member_id,
    'monthly' as period_type,
    STR_TO_DATE(CONCAT(period_year, '-', LPAD(period_month, 2, '0'), '-01'), '%Y-%m-%d') as period_start,
    LAST_DAY(STR_TO_DATE(CONCAT(period_year, '-', LPAD(period_month, 2, '0'), '-01'), '%Y-%m-%d')) as period_end,
    CONCAT(
        CASE period_month
            WHEN 1 THEN 'Januar'
            WHEN 2 THEN 'Februar' 
            WHEN 3 THEN 'März'
            WHEN 4 THEN 'April'
            WHEN 5 THEN 'Mai'
            WHEN 6 THEN 'Juni'
            WHEN 7 THEN 'Juli'
            WHEN 8 THEN 'August'
            WHEN 9 THEN 'September'
            WHEN 10 THEN 'Oktober'
            WHEN 11 THEN 'November'
            WHEN 12 THEN 'Dezember'
        END,
        ' ', period_year
    ) as period_description,
    required_amount * 1.1 as required_amount_usd, -- EUR zu USD Conversion
    paid_amount * 1.1 as paid_amount_usd,         -- EUR zu USD Conversion
    status,
    due_date,
    payment_date,
    notes,
    created_at,
    updated_at
FROM member_contributions_backup;

-- ========================================
-- 4. GANG_STATS TABELLE UPDATEN
-- ========================================

-- Treasury Balance Stat updaten
UPDATE gang_stats 
SET stat_key = 'treasury_balance_usd',
    stat_value = ROUND(CAST(stat_value AS DECIMAL(15,2)) * 1.1, 2)
WHERE stat_key = 'treasury_balance';

-- Monthly Contribution zu Default Contribution ändern
UPDATE gang_stats 
SET stat_key = 'default_contribution_usd',
    stat_value = ROUND(CAST(stat_value AS DECIMAL(10,2)) * 1.1, 2)
WHERE stat_key = 'monthly_contribution';

-- Default Contribution Period hinzufügen
INSERT IGNORE INTO gang_stats (stat_key, stat_value) 
VALUES ('default_contribution_period', 'weekly');

-- ========================================
-- 5. AUFRÄUMEN
-- ========================================

-- Optional: Backup-Tabelle löschen nach erfolgreicher Migration
-- DROP TABLE member_contributions_backup;

-- ========================================
-- 6. TREASURY DATEN NEUSETZEN (OPTIONAL)
-- ========================================

-- Falls du mit frischen Daten starten möchtest:
/*
TRUNCATE TABLE gang_treasury;
TRUNCATE TABLE gang_transactions; 
TRUNCATE TABLE member_contributions;

-- Neues Treasury Setup
INSERT INTO gang_treasury (current_balance_usd, currency, notes) VALUES 
(0.00, 'USD', 'Migration abgeschlossen - Startsaldo in US-Dollar');
*/

-- ========================================
-- MIGRATION ABGESCHLOSSEN
-- ========================================
-- Nach der Migration solltest du:
-- 1. Die Anwendung neu starten
-- 2. Treasury-Balance prüfen
-- 3. Test-Transaktionen durchführen
-- 4. Beiträge testen
-- ========================================