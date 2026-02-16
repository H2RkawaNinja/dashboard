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
    can_view_fence BOOLEAN DEFAULT FALSE,
    can_manage_fence BOOLEAN DEFAULT FALSE,
    can_view_recipes BOOLEAN DEFAULT FALSE,
    can_manage_recipes BOOLEAN DEFAULT FALSE,
    can_view_storage BOOLEAN DEFAULT FALSE,
    can_manage_storage BOOLEAN DEFAULT FALSE,
    can_view_treasury BOOLEAN DEFAULT FALSE,
    can_manage_treasury BOOLEAN DEFAULT FALSE,
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

-- Tabelle: Standard-Berechtigungen pro Rang
CREATE TABLE IF NOT EXISTS rank_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rank_name VARCHAR(50) NOT NULL UNIQUE,
    can_add_members BOOLEAN DEFAULT FALSE,
    can_view_fence BOOLEAN DEFAULT FALSE,
    can_manage_fence BOOLEAN DEFAULT FALSE,
    can_view_recipes BOOLEAN DEFAULT FALSE,
    can_manage_recipes BOOLEAN DEFAULT FALSE,
    can_view_storage BOOLEAN DEFAULT FALSE,
    can_manage_storage BOOLEAN DEFAULT FALSE,
    can_view_treasury BOOLEAN DEFAULT FALSE,
    can_manage_treasury BOOLEAN DEFAULT FALSE,
    can_view_activity BOOLEAN DEFAULT FALSE,
    can_view_stats BOOLEAN DEFAULT FALSE,
    can_manage_system BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Standard Rang-Berechtigungen
INSERT INTO rank_permissions (rank_name, can_add_members, can_view_fence, can_manage_fence, can_view_recipes, can_manage_recipes, can_view_storage, can_manage_storage, can_view_treasury, can_manage_treasury, can_view_activity, can_view_stats, can_manage_system) VALUES
('OG', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE),
('2OG', FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE, TRUE, FALSE),
('Member', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
('Techniker', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
('Soldat', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
('Runner', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
ON DUPLICATE KEY UPDATE rank_name = VALUES(rank_name);

-- ========================================
-- GANGKASSE - EINFACHES KASSENSYSTEM
-- ========================================

-- Tabelle: Gangkasse Kontostand (getrennte Kassen)
CREATE TABLE IF NOT EXISTS gang_treasury (
    id INT AUTO_INCREMENT PRIMARY KEY,
    current_balance DECIMAL(15, 2) DEFAULT 0,
    contributions_balance DECIMAL(15, 2) DEFAULT 0,
    goals_balance DECIMAL(15, 2) DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    wochenbeitrag_standard DECIMAL(10, 2) DEFAULT 50.00,
    notes TEXT
);

-- Tabelle: Kassenbuch (alle Ein- und Auszahlungen)
CREATE TABLE IF NOT EXISTS gang_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT,
    type ENUM('beitrag', 'einzahlung', 'auszahlung', 'ziel_einzahlung', 'korrektur') NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    description VARCHAR(500),
    ziel_id INT NULL,
    recorded_by INT,
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES members(id) ON DELETE SET NULL
);

-- Tabelle: Mitglieder Beiträge (Wöchentliche Abgaben)
CREATE TABLE IF NOT EXISTS member_contributions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    woche VARCHAR(20) NOT NULL, -- z.B. "KW07-2026"
    woche_start DATE NOT NULL,
    woche_ende DATE NOT NULL,
    soll_betrag DECIMAL(10, 2) NOT NULL,
    ist_betrag DECIMAL(10, 2) DEFAULT 0,
    status ENUM('offen', 'teilweise', 'bezahlt') DEFAULT 'offen',
    bezahlt_am TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    UNIQUE KEY einzigartig_pro_woche (member_id, woche)
);

-- Tabelle: Gemeinsame Ziele (Sammelaktionen)
CREATE TABLE IF NOT EXISTS treasury_goals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titel VARCHAR(200) NOT NULL,
    beschreibung TEXT,
    ziel_betrag DECIMAL(10, 2) NOT NULL,
    aktueller_betrag DECIMAL(10, 2) DEFAULT 0,
    status ENUM('aktiv', 'erreicht', 'abgebrochen') DEFAULT 'aktiv',
    deadline DATE NULL,
    erstellt_von INT,
    erstellt_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    abgeschlossen_am TIMESTAMP NULL,
    FOREIGN KEY (erstellt_von) REFERENCES members(id) ON DELETE SET NULL
);

-- Tabelle: Einzahlungen in Ziele
CREATE TABLE IF NOT EXISTS goal_contributions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    goal_id INT NOT NULL,
    member_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    datum TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    kommentar VARCHAR(500),
    FOREIGN KEY (goal_id) REFERENCES treasury_goals(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- Initial Wartungseinstellungen  
INSERT INTO maintenance_settings (module_name, is_disabled) VALUES
('members', FALSE),
('hero', FALSE),
('fence', FALSE),
('warehouse', FALSE),
('storage', FALSE),
('treasury', FALSE),
('recipes', FALSE),
('intelligence', FALSE),
('activity', FALSE);

-- Initial Gangkasse Setup
INSERT INTO gang_treasury (current_balance, contributions_balance, goals_balance, wochenbeitrag_standard, notes) VALUES 
(0.00, 0.00, 0.00, 50.00, 'Startsaldo der Gangkasse');

-- Gang Stats
INSERT INTO gang_stats (stat_key, stat_value) VALUES
('gang_name', 'Black Street Empire'),
('total_members', '0'),
('total_revenue_today', '0'),
('overview_notes', ''),
('treasury_balance', '0.00'),
('wochenbeitrag_standard', '50.00');

-- ========================================
-- MIGRATION: Neue Berechtigungsspalten hinzufügen (falls DB bereits existiert)
-- ========================================
ALTER TABLE members ADD COLUMN IF NOT EXISTS can_view_fence BOOLEAN DEFAULT FALSE AFTER can_add_members;
ALTER TABLE members ADD COLUMN IF NOT EXISTS can_view_recipes BOOLEAN DEFAULT FALSE AFTER can_manage_fence;
ALTER TABLE members ADD COLUMN IF NOT EXISTS can_view_storage BOOLEAN DEFAULT FALSE AFTER can_manage_recipes;
ALTER TABLE members ADD COLUMN IF NOT EXISTS can_view_treasury BOOLEAN DEFAULT FALSE AFTER can_manage_storage;
ALTER TABLE members ADD COLUMN IF NOT EXISTS can_manage_treasury BOOLEAN DEFAULT FALSE AFTER can_view_treasury;

ALTER TABLE rank_permissions ADD COLUMN IF NOT EXISTS can_view_fence BOOLEAN DEFAULT FALSE AFTER can_add_members;
ALTER TABLE rank_permissions ADD COLUMN IF NOT EXISTS can_view_recipes BOOLEAN DEFAULT FALSE AFTER can_manage_fence;
ALTER TABLE rank_permissions ADD COLUMN IF NOT EXISTS can_view_storage BOOLEAN DEFAULT FALSE AFTER can_manage_recipes;
ALTER TABLE rank_permissions ADD COLUMN IF NOT EXISTS can_view_treasury BOOLEAN DEFAULT FALSE AFTER can_manage_storage;
ALTER TABLE rank_permissions ADD COLUMN IF NOT EXISTS can_manage_treasury BOOLEAN DEFAULT FALSE AFTER can_view_treasury;

-- Bestehende Ränge mit neuen Rechten aktualisieren
UPDATE rank_permissions SET can_view_fence = TRUE, can_view_recipes = TRUE, can_view_storage = TRUE, can_view_treasury = TRUE, can_manage_treasury = TRUE WHERE rank_name IN ('OG', 'Techniker');
UPDATE rank_permissions SET can_view_fence = TRUE, can_view_recipes = TRUE, can_view_storage = TRUE, can_view_treasury = TRUE WHERE rank_name = '2OG';

-- Migration: Getrennte Kassen-Spalten hinzufügen
ALTER TABLE gang_treasury ADD COLUMN IF NOT EXISTS contributions_balance DECIMAL(15, 2) DEFAULT 0 AFTER current_balance;
ALTER TABLE gang_treasury ADD COLUMN IF NOT EXISTS goals_balance DECIMAL(15, 2) DEFAULT 0 AFTER contributions_balance;
