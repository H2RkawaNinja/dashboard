# BST Gang Management System

Ein umfassendes Verwaltungssystem für Gang-Aktivitäten mit Mitgliederverwaltung, Lager-System, Hero-Verkauf, Hehler-Geschäft und Intelligence-Sammlung.

## Features

- **Mitgliederverwaltung**: Vollständige Verwaltung von Gang-Mitgliedern mit Rang-System und Berechtigungen
- **Hero-Verkauf**: Lager-Management, Ausgabe an Mitglieder, Verkaufs-Tracking und Abrechnungen
- **Hehler-Geschäft**: Ankäufe und Verkäufe von gestohlenen Waren mit Gewinnberechnungen
- **Lager-System**: Sortier-Bereich für unsortierte Waren und Lagerplatz-Verwaltung
- **Rezepte**: Crafting-Rezepte mit Zutaten und Herstellungszeiten
- **Intelligence**: Sammlung von Informationen über Gangs und Personen
- **Aktivitäts-Log**: Überwachung aller Aktionen im System

## Technologie-Stack

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Backend**: Node.js mit Express
- **Datenbank**: MySQL
- **Session-Management**: express-session mit MySQL-Store

## Installation

### Voraussetzungen

- Node.js (v14 oder höher)
- MySQL Server
- phpMyAdmin (optional, aber empfohlen)

### Schritte

1. **Repository klonen**
   ```bash
   git clone https://github.com/H2RkawaNinja/dashboard.git
   cd dashboard
   ```

2. **Dependencies installieren**
   ```bash
   npm install
   ```

3. **Datenbank einrichten**
   - Importiere `database.sql` in phpMyAdmin oder MySQL
   - Die Datei erstellt automatisch die Datenbank `gang_management` und alle Tabellen
   - Falls du bereits eine Datenbank hast, nutze `update_hero_distributions.sql` für Updates

4. **Server-Konfiguration**
   - Öffne `server.js` und passe die MySQL-Verbindungsdaten an:
   ```javascript
   const db = mysql.createConnection({
       host: 'localhost',
       user: 'dein_username',
       password: 'dein_passwort',
       database: 'gang_management'
   });
   ```

5. **Server starten**
   ```bash
   node server.js
   ```
   Der Server läuft standardmäßig auf Port 3000

6. **Zugriff**
   - Öffne deinen Browser und gehe zu `http://localhost:3000`
   - Standard-Login: `boss` / `password123`

## Konfiguration

### Deaktivieren von Bereichen

In `app.js` kannst du einzelne Bereiche deaktivieren:

```javascript
const DISABLED_PAGES = [
    'hero',        // Hero-Verkauf deaktivieren
    'fence',       // Hehler-Geschäft deaktivieren
    'warehouse',   // Sortier Bereich deaktivieren
    'intelligence' // Intel-Sammlung deaktivieren
];
```

VerfU00fcgbare Bereiche: `overview`, `members`, `hero`, `fence`, `warehouse`, `storage`, `recipes`, `intelligence`, `activity`

## Datenbankstruktur

- **members**: Mitglieder mit Login-Daten und Berechtigungen
- **hero_inventory**: Hero-Lagerbestand und Preise
- **hero_distributions**: Ausgaben an Mitglieder
- **hero_sales**: Verkaufs-Tracking
- **fence_purchases**: Ankäufe beim Hehler
- **fence_sales**: Hehler-Verkäufe
- **warehouse**: Allgemeines Lager
- **storage_slots**: Lagerplätze mit Zugangsdaten
- **recipes**: Crafting-Rezepte
- **recipe_ingredients**: Zutaten für Rezepte
- **intelligence**: Informationssammlung
- **activity_log**: Aktivitätenprotokoll

## Berechtigungssystem

- **can_add_members**: Darf neue Mitglieder hinzufügen
- **can_manage_hero**: Darf Hero-Lager verwalten und ausgeben
- **can_manage_fence**: Darf Hehler-Geschäfte tätigen
- **can_view_activity**: Darf Aktivitätslog einsehen

## Sicherheitshinweise

⚠️ **WICHTIG**: Dies ist eine Demo-Anwendung. Für Produktiv-Einsatz:

- Passwort-Hashing implementieren (bcrypt)
- HTTPS verwenden
- Umgebungsvariablen für sensible Daten nutzen
- Input-Validierung verstärken
- Rate-Limiting hinzufügen
- CORS-Konfiguration anpassen

## Lizenz

MIT License

## Autor

H2RkawaNinja