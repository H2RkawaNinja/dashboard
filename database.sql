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

-- Tabelle: System Wartungseinstellungen (nur für Techniker)
CREATE TABLE IF NOT EXISTS maintenance_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    module_name VARCHAR(50) NOT NULL UNIQUE,
    is_disabled BOOLEAN DEFAULT FALSE,
    disabled_by INT,
    disabled_at TIMESTAMP NULL,
    reason TEXT,
    FOREIGN KEY (disabled_by) REFERENCES members(id) ON DELETE SET NULL
);

-- Initial Wartungseinstellungen
INSERT INTO maintenance_settings (module_name, is_disabled) VALUES
('members', FALSE),
('fence', FALSE),
('storage', FALSE);

-- Gang Stats
INSERT INTO gang_stats (stat_key, stat_value) VALUES
('gang_name', 'Black Street Empire'),
('total_members', '0'),
('total_revenue_today', '0'),
('overview_notes', '');
