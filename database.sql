-- Gang Management System
-- Datenbank wird neu erstellt
-- Diese SQL-Datei direkt in phpMyAdmin importieren

CREATE DATABASE IF NOT EXISTS gang_management;
USE gang_management;

-- ========================================
-- TABELLEN ERSTELLEN
-- ========================================

-- Tabelle: Mitglieder mit Login
CREATE TABLE IF NOT EXISTS members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    `rank` VARCHAR(50) NOT NULL,
    can_add_members BOOLEAN DEFAULT FALSE,
    can_manage_fence BOOLEAN DEFAULT FALSE,
    can_manage_recipes BOOLEAN DEFAULT FALSE,
    can_manage_storage BOOLEAN DEFAULT FALSE,
    can_view_activity BOOLEAN DEFAULT FALSE,
    can_view_stats BOOLEAN DEFAULT FALSE,
    can_manage_system BOOLEAN DEFAULT FALSE,
    phone VARCHAR(20),
    invitation_token VARCHAR(100) UNIQUE,
    is_password_set BOOLEAN DEFAULT FALSE,
    token_expires TIMESTAMP NULL,
    joined_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT
);

-- Tabelle: Hehler Ankauf
    gang_share DECIMAL(10, 2) DEFAULT 0,
    distributed_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('outstanding', 'partial', 'paid') DEFAULT 'outstanding',
    notes TEXT,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- Tabelle: Vordefinierte Hehler-Artikel
CREATE TABLE IF NOT EXISTS fence_item_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    typical_price DECIMAL(10, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- Tabelle: Allgemeines Lager
CREATE TABLE IF NOT EXISTS warehouse (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    quantity INT DEFAULT 0,
    unit_value DECIMAL(10, 2) DEFAULT 0,
    total_value DECIMAL(15, 2) GENERATED ALWAYS AS (quantity * unit_value) STORED,
    location VARCHAR(100),
    storage_location VARCHAR(20) DEFAULT 'UNSORTED',
    sorting_complete BOOLEAN DEFAULT FALSE,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabelle: Lagerplätze
CREATE TABLE IF NOT EXISTS storage_slots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slot_code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    section VARCHAR(50) NOT NULL,
    owner VARCHAR(100),
    warehouse_id VARCHAR(50),
    password VARCHAR(255),
    location ENUM('Paleto', 'Grapseed', 'Northside', 'Westside', 'Eastside', 'Mirror Park', 'Southside', 'Harmony') DEFAULT 'Paleto',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabelle: Hehler Ankäufe
CREATE TABLE IF NOT EXISTS fence_purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT,
    item_name VARCHAR(100) NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(15, 2) NOT NULL,
    seller_info VARCHAR(200),
    purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    stored_in_warehouse BOOLEAN DEFAULT FALSE,
    notes TEXT,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
);

-- Tabelle: Hehler Verkäufe
CREATE TABLE IF NOT EXISTS fence_sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id INT,
    item_name VARCHAR(100) NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(15, 2) NOT NULL,
    profit DECIMAL(15, 2),
    buyer_info VARCHAR(200),
    sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_id) REFERENCES fence_purchases(id) ON DELETE SET NULL
);

-- Tabelle: Aktivitäten Log
CREATE TABLE IF NOT EXISTS activity_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT,
    action_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
);

-- Tabelle: Informations-Sammlung (Intelligence)
CREATE TABLE IF NOT EXISTS intelligence (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category ENUM('Gang', 'Person', 'Ort', 'Geschäft', 'Sonstiges') NOT NULL,
    title VARCHAR(200) NOT NULL,
    subject_name VARCHAR(200) NOT NULL,
    description TEXT,
    importance ENUM('Niedrig', 'Mittel', 'Hoch', 'Kritisch') DEFAULT 'Mittel',
    status ENUM('Aktuell', 'Veraltet', 'Bestätigt', 'Unbestätigt') DEFAULT 'Unbestätigt',
    source VARCHAR(200),
    tags VARCHAR(500),
    color VARCHAR(7),
    gang_id INT,
    added_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (added_by) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY (gang_id) REFERENCES intelligence(id) ON DELETE SET NULL
);

-- Tabelle: Gang Statistiken
CREATE TABLE IF NOT EXISTS gang_stats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stat_key VARCHAR(50) UNIQUE NOT NULL,
    stat_value TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabelle: Rezepte (Crafting/Herstellung)
CREATE TABLE IF NOT EXISTS recipes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recipe_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    crafting_time INT DEFAULT 0,
    output_item VARCHAR(100),
    output_quantity INT DEFAULT 1,
    product_image VARCHAR(255) DEFAULT NULL,
    notes TEXT,
    created_by INT,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL
);

-- Tabelle: Rezept-Zutaten
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recipe_id INT NOT NULL,
    ingredient_name VARCHAR(100) NOT NULL,
    quantity INT NOT NULL,
    unit VARCHAR(20),
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

-- ========================================
-- STANDARD-DATEN EINFÜGEN
-- ========================================

-- System Wartungseinstellungen (nur für Techniker)
CREATE TABLE IF NOT EXISTS maintenance_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    module_name VARCHAR(50) NOT NULL UNIQUE,
    is_disabled BOOLEAN DEFAULT FALSE,
    disabled_by INT,
    disabled_at TIMESTAMP NULL,
    reason TEXT,
    FOREIGN KEY (disabled_by) REFERENCES members(id) ON DELETE SET NULL
);

-- Tabelle: Gangkasse Kontostand
CREATE TABLE IF NOT EXISTS gang_treasury (
    id INT AUTO_INCREMENT PRIMARY KEY,
    current_balance_usd DECIMAL(15, 2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    updated_by INT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (updated_by) REFERENCES members(id) ON DELETE SET NULL
);

-- Tabelle: Gangkasse Transaktionen
CREATE TABLE IF NOT EXISTS gang_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT,
    type ENUM('einzahlung', 'auszahlung', 'korrektur') NOT NULL,
    amount_usd DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    description VARCHAR(500),
    reference_number VARCHAR(50),
    recorded_by INT,
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'confirmed',
    notes TEXT,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES members(id) ON DELETE SET NULL
);

-- Tabelle: Mitglieder Beitragsstatus
CREATE TABLE IF NOT EXISTS member_contributions (
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

-- Initial Wartungseinstellungen
INSERT INTO maintenance_settings (module_name, is_disabled) VALUES
('members', FALSE),
('fence', FALSE),
('storage', FALSE),
('treasury', FALSE);

-- Initial Gangkasse Setup
INSERT INTO gang_treasury (current_balance_usd, currency, notes) VALUES 
(0.00, 'USD', 'Startsaldo der Gangkasse in US-Dollar');

-- Gang Stats
INSERT INTO gang_stats (stat_key, stat_value) VALUES
('gang_name', 'Black Street Empire'),
('total_members', '0'),
('total_revenue_today', '0'),
('overview_notes', ''),
('treasury_balance_usd', '0.00'),
('default_contribution_usd', '100.00'),
('default_contribution_period', 'weekly');

-- ========================================
-- TREASURY SYSTEM UPDATE zu USD & Flexible Perioden
-- ========================================
-- Nur ausführen wenn bestehende EUR-Daten vorhanden sind

-- Treasury Tabelle auf USD umstellen
ALTER TABLE gang_treasury 
ADD COLUMN current_balance_usd DECIMAL(15, 2) DEFAULT 0 AFTER id,
ADD COLUMN currency VARCHAR(3) DEFAULT 'USD' AFTER current_balance_usd;

UPDATE gang_treasury 
SET current_balance_usd = current_balance * 1.1,
    currency = 'USD';

ALTER TABLE gang_treasury DROP COLUMN current_balance;

-- Transactions Tabelle auf USD umstellen
ALTER TABLE gang_transactions 
ADD COLUMN amount_usd DECIMAL(15, 2) NOT NULL DEFAULT 0 AFTER type,
ADD COLUMN currency VARCHAR(3) DEFAULT 'USD' AFTER amount_usd;

UPDATE gang_transactions 
SET amount_usd = amount * 1.1,
    currency = 'USD';

ALTER TABLE gang_transactions DROP COLUMN amount;

-- Member Contributions für flexible Perioden umstellen
CREATE TABLE member_contributions_backup AS SELECT * FROM member_contributions;

DROP TABLE member_contributions;

CREATE TABLE member_contributions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    period_type ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'custom') DEFAULT 'monthly',
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    period_description VARCHAR(100),
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

INSERT INTO member_contributions (member_id, period_type, period_start, period_end, period_description, required_amount_usd, paid_amount_usd, status, due_date, payment_date, notes, created_at, updated_at)
SELECT 
    member_id,
    'monthly',
    STR_TO_DATE(CONCAT(period_year, '-', LPAD(period_month, 2, '0'), '-01'), '%Y-%m-%d'),
    LAST_DAY(STR_TO_DATE(CONCAT(period_year, '-', LPAD(period_month, 2, '0'), '-01'), '%Y-%m-%d')),
    CONCAT(
        CASE period_month 
            WHEN 1 THEN 'Januar' WHEN 2 THEN 'Februar' WHEN 3 THEN 'März' 
            WHEN 4 THEN 'April' WHEN 5 THEN 'Mai' WHEN 6 THEN 'Juni'
            WHEN 7 THEN 'Juli' WHEN 8 THEN 'August' WHEN 9 THEN 'September'
            WHEN 10 THEN 'Oktober' WHEN 11 THEN 'November' WHEN 12 THEN 'Dezember'
        END, ' ', period_year
    ),
    required_amount * 1.1,
    paid_amount * 1.1,
    status,
    due_date,
    payment_date,
    notes,
    created_at,
    updated_at
FROM member_contributions_backup;

-- Gang Stats aktualisieren
UPDATE gang_stats SET stat_key = 'treasury_balance_usd', stat_value = ROUND(CAST(stat_value AS DECIMAL(15,2)) * 1.1, 2) WHERE stat_key = 'treasury_balance';
UPDATE gang_stats SET stat_key = 'default_contribution_usd', stat_value = ROUND(CAST(stat_value AS DECIMAL(10,2)) * 1.1, 2) WHERE stat_key = 'monthly_contribution';
INSERT IGNORE INTO gang_stats (stat_key, stat_value) VALUES ('default_contribution_period', 'weekly');
