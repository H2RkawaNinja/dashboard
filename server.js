const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, or Postman)
        if (!origin) return callback(null, true);
        
        // Allow specific origins
        const allowedOrigins = [
            'http://localhost',
            'http://localhost:3000',
            'http://127.0.0.1',
            'http://127.0.0.1:3000',
            null // For file:// protocol
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes(null)) {
            callback(null, true);
        } else {
            callback(null, true); // Allow all origins in development
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['set-cookie']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('.'));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // 24 Stunden
        httpOnly: true,
        secure: true,
        sameSite: 'lax'
    }
}));

// Datenbankverbindung mit Connection Pool
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test der Verbindung
db.getConnection((err, connection) => {
    if (err) {
        console.error('Fehler bei der Datenbankverbindung:', err);
        return;
    }
    console.log('Mit MySQL Datenbank verbunden');
    
    // Migriere gang_transactions: notes-Spalte hinzufügen falls fehlt
    connection.query("ALTER TABLE gang_transactions ADD COLUMN IF NOT EXISTS notes TEXT", (err) => {
        if (err && err.code !== 'ER_DUP_FIELDNAME') {
            connection.query("SHOW COLUMNS FROM gang_transactions LIKE 'notes'", (err2, cols) => {
                if (!err2 && cols.length === 0) {
                    connection.query('ALTER TABLE gang_transactions ADD COLUMN notes TEXT', () => {
                        console.log('gang_transactions.notes Spalte hinzugefügt');
                    });
                }
            });
        }
    });

    // Migriere member_contributions: locked + uebertrag_betrag-Spalten hinzufügen
    const migrateContributionCols = (col, def) => {
        connection.query(`ALTER TABLE member_contributions ADD COLUMN IF NOT EXISTS ${col} ${def}`, (err) => {
            if (err && err.code !== 'ER_DUP_FIELDNAME') {
                connection.query(`SHOW COLUMNS FROM member_contributions LIKE '${col}'`, (err2, cols) => {
                    if (!err2 && cols.length === 0) {
                        connection.query(`ALTER TABLE member_contributions ADD COLUMN ${col} ${def}`, () => {
                            console.log(`member_contributions.${col} Spalte hinzugefügt`);
                        });
                    }
                });
            }
        });
    };
    migrateContributionCols('locked', 'TINYINT(1) NOT NULL DEFAULT 0');
    migrateContributionCols('uebertrag_betrag', 'DECIMAL(10,2) NOT NULL DEFAULT 0');

    // Migriere fence_purchases: is_private-Spalte hinzufügen
    const migrateFencePurchaseCols = (col, def) => {
        connection.query(`ALTER TABLE fence_purchases ADD COLUMN IF NOT EXISTS ${col} ${def}`, (err) => {
            if (err && err.code !== 'ER_DUP_FIELDNAME') {
                connection.query(`SHOW COLUMNS FROM fence_purchases LIKE '${col}'`, (err2, cols) => {
                    if (!err2 && cols.length === 0) {
                        connection.query(`ALTER TABLE fence_purchases ADD COLUMN ${col} ${def}`, () => {
                            console.log(`fence_purchases.${col} Spalte hinzugefügt`);
                        });
                    }
                });
            }
        });
    };
    migrateFencePurchaseCols('is_private', 'TINYINT(1) NOT NULL DEFAULT 0');

    // Prüfe und initialisiere hero_inventory wenn leer
    connection.query('SELECT COUNT(*) as count FROM hero_inventory', (err, results) => {
        if (!err && results[0].count === 0) {
            connection.query('INSERT INTO hero_inventory (quantity, unit_cost, sale_price, gang_percentage) VALUES (0, 150, 250, 60)', (err) => {
                if (!err) {
                    console.log('Hero Inventory initialisiert');
                }
            });
        }
    });
    
    connection.release();
});

// Middleware: Login prüfen
function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Nicht eingeloggt' });
    }
    next();
}

// ========== AUTHENTICATION ==========

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    db.query(
        'SELECT * FROM members WHERE username = ? AND is_active = TRUE',
        [username],
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            if (results.length === 0) {
                return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
            }

            const user = results[0];

            const ok = bcrypt.compareSync(password, user.password);
            if (!ok) {
                return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
            }

            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.rank = user.rank;
            req.session.canAddMembers = user.can_add_members;
            req.session.canViewFence = user.can_view_fence;
            req.session.canManageFence = user.can_manage_fence;
            req.session.canViewRecipes = user.can_view_recipes;
            req.session.canManageRecipes = user.can_manage_recipes;
            req.session.canViewStorage = user.can_view_storage;
            req.session.canManageStorage = user.can_manage_storage;
            req.session.canViewTreasury = user.can_view_treasury;
            req.session.canManageTreasury = user.can_manage_treasury;
            req.session.canViewActivity = user.can_view_activity;
            req.session.canViewStats = user.can_view_stats;
            req.session.canManageSystem = user.can_manage_system;

            // Techniker haben alle Berechtigungen
            if (user.rank === 'Techniker') {
                req.session.canAddMembers = true;
                req.session.canViewFence = true;
                req.session.canManageFence = true;
                req.session.canViewRecipes = true;
                req.session.canManageRecipes = true;
                req.session.canViewStorage = true;
                req.session.canManageStorage = true;
                req.session.canViewTreasury = true;
                req.session.canManageTreasury = true;
                req.session.canViewActivity = true;
                req.session.canViewStats = true;
                req.session.canManageSystem = true;
            }

            db.query('UPDATE members SET last_login = NOW() WHERE id = ?', [user.id]);
            db.query(
                'INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                [user.id, 'login', `${user.full_name} hat sich eingeloggt`]
            );

            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    full_name: user.full_name,
                    rank: user.rank,
                    can_add_members: req.session.canAddMembers,
                    can_view_fence: req.session.canViewFence,
                    can_manage_fence: req.session.canManageFence,
                    can_view_recipes: req.session.canViewRecipes,
                    can_manage_recipes: req.session.canManageRecipes,
                    can_view_storage: req.session.canViewStorage,
                    can_manage_storage: req.session.canManageStorage,
                    can_view_treasury: req.session.canViewTreasury,
                    can_manage_treasury: req.session.canManageTreasury,
                    can_view_activity: req.session.canViewActivity,
                    can_view_stats: req.session.canViewStats,
                    can_manage_system: req.session.canManageSystem
                }
            });
        }
    );
});


// Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Session check
app.get('/api/auth/session', (req, res) => {
    if (req.session.userId) {
        db.query('SELECT id, username, full_name, rank, can_add_members, can_view_fence, can_manage_fence, can_view_recipes, can_manage_recipes, can_view_storage, can_manage_storage, can_view_treasury, can_manage_treasury, can_view_activity, can_view_stats, can_manage_system FROM members WHERE id = ?', 
            [req.session.userId], (err, results) => {
            if (err || results.length === 0) {
                return res.json({ logged_in: false });
            }
            
            const user = results[0];
            // Techniker haben alle Berechtigungen
            if (user.rank === 'Techniker') {
                user.can_add_members = true;
                user.can_view_fence = true;
                user.can_manage_fence = true;
                user.can_view_recipes = true;
                user.can_manage_recipes = true;
                user.can_view_storage = true;
                user.can_manage_storage = true;
                user.can_view_treasury = true;
                user.can_manage_treasury = true;
                user.can_view_activity = true;
                user.can_view_stats = true;
                user.can_manage_system = true;
                // Session-Variablen auch aktualisieren
                req.session.canAddMembers = true;
                req.session.canViewFence = true;
                req.session.canManageHero = true;
                req.session.canManageFence = true;
                req.session.canViewRecipes = true;
                req.session.canManageRecipes = true;
                req.session.canViewStorage = true;
                req.session.canManageStorage = true;
                req.session.canViewTreasury = true;
                req.session.canManageTreasury = true;
                req.session.canViewActivity = true;
                req.session.canViewStats = true;
                req.session.canManageSystem = true;
            } else {
                // Session-Variablen mit aktuellen DB-Werten synchronisieren
                req.session.canAddMembers = user.can_add_members;
                req.session.canViewFence = user.can_view_fence;
                req.session.canManageFence = user.can_manage_fence;
                req.session.canViewRecipes = user.can_view_recipes;
                req.session.canManageRecipes = user.can_manage_recipes;
                req.session.canViewStorage = user.can_view_storage;
                req.session.canManageStorage = user.can_manage_storage;
                req.session.canViewTreasury = user.can_view_treasury;
                req.session.canManageTreasury = user.can_manage_treasury;
                req.session.canViewActivity = user.can_view_activity;
                req.session.canViewStats = user.can_view_stats;
                req.session.canManageSystem = user.can_manage_system;
            }
            
            res.json({ logged_in: true, user: user });
        });
    } else {
        res.json({ logged_in: false });
    }
});

// Session löschen (ohne Logout-Log)
app.post('/api/auth/clear-session', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Fehler beim Löschen der Session' });
        }
        res.json({ success: true });
    });
});

// ========== DASHBOARD STATS ==========

// ========== DASHBOARD STATS ==========

app.get('/api/stats/dashboard', requireLogin, (req, res) => {
    const stats = {
        total_members: 0,
        hero_stock: 0,
        fence_pending: 0,
        warehouse_value: 0
    };
    
    // Alle Queries parallel ausführen
    Promise.all([
        new Promise((resolve) => {
            db.query('SELECT COUNT(*) as count FROM members WHERE is_active = TRUE', (err, results) => {
                if (!err && results.length > 0) stats.total_members = results[0].count;
                resolve();
            });
        }),
        new Promise((resolve) => {
            db.query('SELECT quantity FROM hero_inventory LIMIT 1', (err, results) => {
                if (!err && results.length > 0) stats.hero_stock = results[0].quantity;
                resolve();
            });
        }),
        new Promise((resolve) => {
            db.query('SELECT COALESCE(SUM(total_price), 0) as total FROM fence_purchases WHERE DATE(purchase_date) = CURDATE() AND (is_private IS NULL OR is_private = 0)', (err, results) => {
                if (!err && results.length > 0) stats.fence_pending = results[0].total;
                resolve();
            });
        }),
        new Promise((resolve) => {
            db.query('SELECT COALESCE(SUM(quantity * unit_value), 0) as total FROM warehouse', (err, results) => {
                if (!err && results.length > 0) stats.warehouse_value = results[0].total;
                resolve();
            });
        })
    ]).then(() => {
        res.json(stats);
    });
});

app.get('/api/dashboard/stats', requireLogin, (req, res) => {
    const query = `
        SELECT 
            (SELECT COUNT(*) FROM members WHERE is_active = TRUE) as total_members,
            (SELECT quantity FROM hero_inventory LIMIT 1) as hero_stock,
            (SELECT COUNT(*) FROM hero_distributions WHERE status = 'outstanding') as outstanding_distributions,
            (SELECT COALESCE(SUM(gang_share), 0) FROM hero_sales WHERE paid_to_gang = FALSE) as pending_payments,
            (SELECT COALESCE(SUM(total_price), 0) FROM fence_purchases WHERE DATE(purchase_date) = CURDATE() AND (is_private IS NULL OR is_private = 0)) as fence_purchases_today,
            (SELECT COALESCE(SUM(total_value), 0) FROM warehouse) as warehouse_value
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results[0]);
    });
});

// ========== ÜBERSICHTS-NOTIZEN ==========

app.get('/api/stats/overview-notes', requireLogin, (req, res) => {
    db.query('SELECT stat_value as notes FROM gang_stats WHERE stat_key = "overview_notes"', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        const notes = results.length > 0 ? results[0].notes : '';
        res.json({ notes });
    });
});

app.post('/api/stats/overview-notes', requireLogin, (req, res) => {
    const { notes } = req.body;
    
    // Überprüfe ob bereits ein Eintrag existiert
    db.query('SELECT id FROM gang_stats WHERE stat_key = "overview_notes"', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (results.length > 0) {
            // Update existing
            db.query('UPDATE gang_stats SET stat_value = ? WHERE stat_key = "overview_notes"', 
                [notes], (err, results) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({ success: true });
            });
        } else {
            // Insert new
            db.query('INSERT INTO gang_stats (stat_key, stat_value) VALUES ("overview_notes", ?)', 
                [notes], (err, results) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({ success: true });
            });
        }
    });
});

// ========== MITGLIEDER ==========

app.get('/api/members', requireLogin, (req, res) => {
    const query = `
        SELECT 
            id, username, full_name, rank, phone, joined_date, last_login, is_active, is_password_set,
            COALESCE(can_add_members, FALSE) as can_add_members,
            COALESCE(can_view_fence, FALSE) as can_view_fence,
            COALESCE(can_manage_fence, FALSE) as can_manage_fence,
            COALESCE(can_view_recipes, FALSE) as can_view_recipes,
            COALESCE(can_manage_recipes, FALSE) as can_manage_recipes,
            COALESCE(can_view_storage, FALSE) as can_view_storage,
            COALESCE(can_manage_storage, FALSE) as can_manage_storage,
            COALESCE(can_view_treasury, FALSE) as can_view_treasury,
            COALESCE(can_manage_treasury, FALSE) as can_manage_treasury,
            COALESCE(can_view_activity, FALSE) as can_view_activity,
            COALESCE(can_view_stats, FALSE) as can_view_stats,
            COALESCE(can_manage_system, FALSE) as can_manage_system
        FROM members 
        ORDER BY FIELD(rank, 'OG', '2OG', 'Soldat', 'Member', 'Runner', 'Techniker'), full_name
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        res.json(results);
    });
});

app.get('/api/members/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM members WHERE id = ?', [id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }
        res.json(results[0]);
    });
});

// Mitglied hinzufügen
// Mitglied hinzufügen
app.post('/api/members/add', requireLogin, (req, res) => {
    // Prüfe Berechtigung - Techniker haben immer die Berechtigung
    if (!req.session.canAddMembers && req.session.rank !== 'Techniker') {
        return res.status(403).json({ error: 'Keine Berechtigung zum Hinzufügen von Mitgliedern' });
    }
    
    const { username, full_name, rank, phone, can_add_members, can_view_fence, can_manage_fence, can_view_recipes, can_manage_recipes, can_view_storage, can_manage_storage, can_view_treasury, can_manage_treasury, can_view_activity, can_view_stats, can_manage_system } = req.body;
    
    // Prüfe ob Username bereits existiert
    db.query('SELECT id FROM members WHERE username = ?', [username], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (results.length > 0) {
            return res.status(400).json({ error: 'Benutzername bereits vergeben' });
        }
        
        // Generiere Einladungs-Token
        const token = require('crypto').randomBytes(32).toString('hex');
        const tempPassword = 'PENDING_SETUP';
        const tokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 Tage gültig
        
        // Füge Mitglied hinzu
        const query = 'INSERT INTO members (username, password, full_name, rank, phone, can_add_members, can_view_fence, can_manage_fence, can_view_recipes, can_manage_recipes, can_view_storage, can_manage_storage, can_view_treasury, can_manage_treasury, can_view_activity, can_view_stats, can_manage_system, invitation_token, is_password_set, token_expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, ?)';
        
        db.query(query, [username, tempPassword, full_name, rank, phone || null, can_add_members || false, can_view_fence || false, can_manage_fence || false, can_view_recipes || false, can_manage_recipes || false, can_view_storage || false, can_manage_storage || false, can_view_treasury || false, can_manage_treasury || false, can_view_activity || false, can_view_stats || false, can_manage_system || false, token, tokenExpires], (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Log erstellen
            db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                [req.session.userId, 'member_added', `${full_name} wurde als ${rank} hinzugefügt`]);
            
            const inviteLink = `https://bstribe.com/setup.html?token=${token}`;

            
            res.json({ 
                success: true, 
                message: 'Mitglied erfolgreich hinzugefügt',
                member_id: result.insertId,
                invite_link: inviteLink,
                token: token
            });
        });
    });
});

// Mitglied bearbeiten
app.put('/api/members/:id/edit', requireLogin, (req, res) => {
    // Prüfe Berechtigung - Techniker haben immer die Berechtigung
    if (!req.session.canAddMembers && req.session.rank !== 'Techniker') {
        return res.status(403).json({ error: 'Keine Berechtigung zum Bearbeiten von Mitgliedern' });
    }
    
    const { id } = req.params;
const { full_name, rank, phone, can_add_members, can_view_fence, can_manage_fence, can_view_recipes, can_manage_recipes, can_view_storage, can_manage_storage, can_view_treasury, can_manage_treasury, can_view_activity, can_view_stats, can_manage_system, is_active } = req.body;

    const query = 'UPDATE members SET full_name = ?, rank = ?, phone = ?, can_add_members = ?, can_view_fence = ?, can_manage_fence = ?, can_view_recipes = ?, can_manage_recipes = ?, can_view_storage = ?, can_manage_storage = ?, can_view_treasury = ?, can_manage_treasury = ?, can_view_activity = ?, can_view_stats = ?, can_manage_system = ?, is_active = ? WHERE id = ?';
    const params = [full_name, rank, phone, can_add_members, can_view_fence, can_manage_fence, can_view_recipes, can_manage_recipes, can_view_storage, can_manage_storage, can_view_treasury, can_manage_treasury, can_view_activity, can_view_stats, can_manage_system, is_active, id];
    
    db.query(query, params, (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Falls der bearbeitete User gerade eingeloggt ist und zum Techniker befördert wurde, 
        // Session-Berechtigungen aktualisieren
        if (parseInt(id) === req.session.userId && rank === 'Techniker') {
            req.session.canAddMembers = true;
            req.session.canViewFence = true;
            req.session.canManageFence = true;
            req.session.canViewTreasury = true;
            req.session.canManageTreasury = true;
            req.session.canViewActivity = true;
        }
        
        // Log
        db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
            [req.session.userId, 'member_edited', `Mitglied ${full_name} wurde bearbeitet`]);
        
        res.json({ success: true, message: 'Mitglied aktualisiert' });
    });
});

// Mitglied löschen
app.delete('/api/members/:id', requireLogin, (req, res) => {
    // Prüfe Berechtigung - Techniker haben immer die Berechtigung
    if (!req.session.canAddMembers && req.session.rank !== 'Techniker') {
        return res.status(403).json({ error: 'Keine Berechtigung zum Löschen von Mitgliedern' });
    }
    
    const { id } = req.params;
    
    // Verhindere dass man sich selbst löscht
    if (parseInt(id) === req.session.userId) {
        return res.status(400).json({ error: 'Du kannst dich nicht selbst löschen' });
    }
    
    // Hole Mitgliedsnamen für Log
    db.query('SELECT full_name FROM members WHERE id = ?', [id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }
        
        const memberName = results[0].full_name;
        
        // Lösche Mitglied dauerhaft - verknüpfte Daten bleiben erhalten (ON DELETE SET NULL)
        db.query('DELETE FROM members WHERE id = ?', [id], (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Log
            db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                [req.session.userId, 'member_deleted', `Mitglied ${memberName} wurde aus der Gang entfernt`]);
            
            res.json({ success: true, message: 'Mitglied gelöscht' });
        });
    });});

// Passwort-Setup über Einladungs-Token
// Passwort-Setup über Einladungs-Token
app.post('/api/members/setup-password', (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ error: 'Token und Passwort erforderlich' });
    }

    db.query(
        'SELECT * FROM members WHERE invitation_token = ? AND is_password_set = FALSE',
        [token],
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            if (results.length === 0) {
                return res.status(404).json({ error: 'Ungültiger oder bereits verwendeter Token' });
            }

            const member = results[0];

            if (member.token_expires && new Date(member.token_expires) < new Date()) {
                return res.status(400).json({ error: 'Dieser Einladungslink ist abgelaufen' });
            }

            // 🔐 Passwort HASHEN
            const hashedPassword = bcrypt.hashSync(password, 10);

            db.query(
                'UPDATE members SET password = ?, is_password_set = TRUE, invitation_token = NULL, token_expires = NULL WHERE id = ?',
                [hashedPassword, member.id],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });

                    db.query(
                        'INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                        [member.id, 'password_setup', `${member.full_name} hat das Passwort eingerichtet`]
                    );

                    res.json({
                        success: true,
                        message: 'Passwort erfolgreich eingerichtet',
                        username: member.username
                    });
                }
            );
        }
    );
});


// Token validieren (für Setup-Seite)
app.get('/api/members/validate-token/:token', (req, res) => {
    const { token } = req.params;
    
    db.query('SELECT id, username, full_name, rank FROM members WHERE invitation_token = ? AND is_password_set = FALSE', 
        [token], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Ungültiger Token' });
        }
        
        const member = results[0];
        
        // Prüfe Ablauf
        if (member.token_expires && new Date(member.token_expires) < new Date()) {
            return res.status(400).json({ error: 'Token abgelaufen' });
        }
        
        res.json({ 
            valid: true,
            member: {
                username: member.username,
                full_name: member.full_name,
                rank: member.rank
            }
        });
    });
});

// Passwort anzeigen (nur für Techniker)
app.get('/api/members/:id/password', requireLogin, (req, res) => {
    // Nur Techniker darf Passwörter sehen
    if (req.session.rank !== 'Techniker') {
        return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    
    const { id } = req.params;
    
    db.query('SELECT username, full_name, password, is_password_set FROM members WHERE id = ?', [id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        }
        
        res.json(results[0]);
    });
});

// ========== HERO SYSTEM ==========

// Hero Lager Status
app.get('/api/hero/inventory', requireLogin, (req, res) => {
    db.query('SELECT * FROM hero_inventory LIMIT 1', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results[0] || { quantity: 0, unit_cost: 0, sale_price: 250, gang_percentage: 60 });
    });
});

// Hero Lager auffüllen - nur Menge (ARCHIVIERUNG bei neuer Lieferung)
app.post('/api/hero/inventory/restock', requireLogin, (req, res) => {
    const { quantity } = req.body;
    
    // Ermittle die nächste Lieferungsnummer
    db.query('SELECT COALESCE(MAX(delivery_number), 0) + 1 as next_delivery FROM hero_deliveries', (err, deliveryResults) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const deliveryNumber = deliveryResults[0].next_delivery;
        
        // Zähle vorhandene Daten für Aktivitätslog
        db.query('SELECT COUNT(*) as dist_count FROM hero_distributions', (err, distCount) => {
            const distributionCount = distCount && distCount[0] ? distCount[0].dist_count : 0;
            
            db.query('SELECT COUNT(*) as sales_count FROM hero_sales', (err, salesCount) => {
                const salesCountNum = salesCount && salesCount[0] ? salesCount[0].sales_count : 0;
                
                // Bei neuer Lieferung: Verschiebe alle Verteilungen ins Archiv
                db.query(`INSERT INTO hero_distributions_archive 
                          (original_id, member_id, member_name, quantity, unit_cost, total_cost, 
                           distributed_date, status, notes, archived_by, delivery_number)
                          SELECT d.id, d.member_id, m.full_name, d.quantity, d.unit_cost, d.total_cost,
                                 d.distributed_date, d.status, d.notes, ?, ?
                          FROM hero_distributions d
                          JOIN members m ON d.member_id = m.id`, 
                          [req.session.userId, deliveryNumber - 1], (err, archiveResult) => {
                    if (err) {
                        console.error('Fehler beim Archivieren der Verteilungen:', err);
                        return res.status(500).json({ error: err.message });
                    }
                    
                    // Log für archivierte Verteilungen
                    if (distributionCount > 0) {
                        db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                            [req.session.userId, 'hero_archive', `${distributionCount} Verteilung(en) in Archiv verschoben (Lieferung #${deliveryNumber - 1})`]);
                    }
                    
                    // Verschiebe alle Verkäufe ins Archiv
                    db.query(`INSERT INTO hero_sales_archive 
                              (original_id, member_id, member_name, quantity, unit_cost, sale_price,
                               total_sale, gang_share, member_share, sale_date, archived_by, delivery_number)
                              SELECT s.id, s.member_id, m.full_name, 
                                     COALESCE(s.quantity_sold, 0) as quantity,
                                     0 as unit_cost,
                                     COALESCE(s.sale_price, 0) as sale_price,
                                     COALESCE(s.total_revenue, 0) as total_sale,
                                     COALESCE(s.gang_share, 0) as gang_share,
                                     COALESCE(s.member_share, 0) as member_share,
                                     s.sale_date, ?, ?
                              FROM hero_sales s
                              JOIN members m ON s.member_id = m.id`,
                              [req.session.userId, deliveryNumber - 1], (err, salesArchiveResult) => {
                        if (err) {
                            console.error('Fehler beim Archivieren der Verkäufe:', err);
                            return res.status(500).json({ error: err.message });
                        }
                        
                        // Log für archivierte Verkäufe
                        if (salesCountNum > 0) {
                            db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                                [req.session.userId, 'hero_archive', `${salesCountNum} Verkauf/Abrechnung(en) in Archiv verschoben (Lieferung #${deliveryNumber - 1})`]);
                        }
                
                // Lösche alte Daten nach erfolgreicher Archivierung
                db.query('DELETE FROM hero_distributions', (err) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    
                    db.query('DELETE FROM hero_sales', (err) => {
                        if (err) {
                            return res.status(500).json({ error: err.message });
                        }
                        
                        // Speichere neue Lieferung
                        db.query('INSERT INTO hero_deliveries (delivery_number, quantity, received_by) VALUES (?, ?, ?)',
                            [deliveryNumber, quantity, req.session.userId], (err) => {
                            if (err) {
                                return res.status(500).json({ error: err.message });
                            }
                            
                            // Log für neue Lieferung
                            db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                                [req.session.userId, 'hero_delivery', `Neue Lieferung #${deliveryNumber} erhalten: ${quantity} Hero`]);
                            
                            // Prüfe ob Eintrag existiert, wenn nicht, erstelle einen
                            db.query('SELECT id FROM hero_inventory LIMIT 1', (err, results) => {
                                if (err) {
                                    return res.status(500).json({ error: err.message });
                                }
                                
                                if (results.length === 0) {
                                    // Erstelle initialen Eintrag
                                    db.query('INSERT INTO hero_inventory (quantity, unit_cost, sale_price, gang_percentage) VALUES (?, 150, 250, 60)',
                                        [quantity], (err) => {
                                        if (err) {
                                            return res.status(500).json({ error: err.message });
                                        }
                                        
                                        db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                                            [req.session.userId, 'hero_restock', `Lager auf ${quantity} Hero gesetzt (Lieferung #${deliveryNumber})`]);
                                        
                                        res.json({ success: true, message: `Lieferung #${deliveryNumber} erfasst - ${distributionCount} Verteilungen und ${salesCountNum} Verkäufe archiviert`, deliveryNumber });
                                    });
                                } else {
                                    // Setze Bestand komplett neu (nicht addieren!)
                                    db.query('UPDATE hero_inventory SET quantity = ? WHERE id = ?', 
                                        [quantity, results[0].id], (err) => {
                                        if (err) {
                                            return res.status(500).json({ error: err.message });
                                        }
                                        
                                        db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                                            [req.session.userId, 'hero_restock', `Lager auf ${quantity} Hero gesetzt (Lieferung #${deliveryNumber})`]);
                                        
                                        res.json({ success: true, message: `Lieferung #${deliveryNumber} erfasst - ${distributionCount} Verteilungen und ${salesCountNum} Verkäufe archiviert`, deliveryNumber });
                                    });
                                }
                            });
                        });
                    });
                });
                    });
                });
            });
        });
    });
});

// Hero Lager direkt setzen (zum Korrigieren)
app.put('/api/hero/inventory/set', requireLogin, (req, res) => {
    const { quantity } = req.body;
    
    // Prüfe ob Eintrag existiert
    db.query('SELECT id, quantity as old_quantity FROM hero_inventory LIMIT 1', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (results.length === 0) {
            // Erstelle initialen Eintrag
            db.query('INSERT INTO hero_inventory (quantity, unit_cost, sale_price, gang_percentage) VALUES (?, 150, 250, 60)',
                [quantity], (err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                    [req.session.userId, 'hero_adjustment', `Lagerbestand gesetzt auf: ${quantity} Hero`]);
                
                res.json({ success: true, message: 'Lagerbestand gesetzt' });
            });
        } else {
            const oldQuantity = results[0].old_quantity;
            const diff = quantity - oldQuantity;
            const action = diff > 0 ? 'erhöht' : 'reduziert';
            
            // Update existierenden Eintrag
            db.query('UPDATE hero_inventory SET quantity = ? WHERE id = ?', 
                [quantity, results[0].id], (err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                    [req.session.userId, 'hero_adjustment', `Lagerbestand ${action}: von ${oldQuantity} auf ${quantity} Hero (${Math.abs(diff)} Stück)`]);
                
                res.json({ success: true, message: 'Lagerbestand aktualisiert' });
            });
        }
    });
});

// Hero an Mitglied ausgeben
app.post('/api/hero/distributions', requireLogin, (req, res) => {
    const { member_id, quantity } = req.body;
    
    // Hole aktuelle Einstellungen und prüfe Lagerbestand
    db.query('SELECT quantity, unit_cost, sale_price, gang_percentage FROM hero_inventory LIMIT 1', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (!results || results.length === 0) {
            return res.status(400).json({ error: 'Hero Inventar nicht initialisiert' });
        }
        
        const inventory = results[0];
        if (inventory.quantity < quantity) {
            return res.status(400).json({ error: 'Nicht genug Hero im Lager' });
        }
        
        const total_cost = quantity * inventory.unit_cost;
        const expected_sale_price = quantity * inventory.sale_price;
        const gang_share = expected_sale_price * (inventory.gang_percentage / 100);
        
        // Ausgabe erstellen
        db.query('INSERT INTO hero_distributions (member_id, quantity, unit_cost, total_cost, expected_sale_price, gang_share) VALUES (?, ?, ?, ?, ?, ?)',
            [member_id, quantity, inventory.unit_cost, total_cost, expected_sale_price, gang_share], (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Lager reduzieren
            db.query('UPDATE hero_inventory SET quantity = quantity - ? WHERE id = (SELECT id FROM hero_inventory LIMIT 1)', [quantity], (err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                // Log
                db.query('SELECT full_name FROM members WHERE id = ?', [member_id], (err, memberResults) => {
                    if (!err && memberResults && memberResults.length > 0) {
                        const memberName = memberResults[0].full_name;
                        db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                            [req.session.userId, 'hero_distribution', `${quantity} Hero an ${memberName} ausgegeben`]);
                    }
                });
                
                res.json({ 
                    success: true, 
                    message: 'Hero ausgegeben',
                    distribution_id: result.insertId
                });
            });
        });
    });
});

// Hero Ausgaben abrufen
app.get('/api/hero/distributions', requireLogin, (req, res) => {
    const query = `
        SELECT d.*, m.full_name, m.username
        FROM hero_distributions d
        JOIN members m ON d.member_id = m.id
        ORDER BY d.distributed_date DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Hero Zahlungsstatistiken
app.get('/api/hero/payment-stats', requireLogin, (req, res) => {
    const query = `
        SELECT 
            COALESCE(SUM(gang_share), 0) as total_expected,
            COALESCE(SUM(paid_amount), 0) as paid,
            COALESCE(SUM(gang_share - paid_amount), 0) as outstanding
        FROM hero_distributions
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results[0]);
    });
});

// Zahlung auf Hero-Ausgabe buchen
app.post('/api/hero/distributions/:id/payment', requireLogin, (req, res) => {
    const distributionId = req.params.id;
    const { amount } = req.body;
    
    // Hole aktuelle Ausgabe
    db.query('SELECT * FROM hero_distributions WHERE id = ?', [distributionId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Ausgabe nicht gefunden' });
        }
        
        const distribution = results[0];
        const newPaidAmount = parseFloat(distribution.paid_amount) + parseFloat(amount);
        const gangShare = parseFloat(distribution.gang_share);
        
        let newStatus = 'outstanding';
        if (newPaidAmount >= gangShare) {
            newStatus = 'paid';
        } else if (newPaidAmount > 0) {
            newStatus = 'partial';
        }
        
        // Update Zahlung
        db.query('UPDATE hero_distributions SET paid_amount = ?, status = ? WHERE id = ?',
            [newPaidAmount, newStatus, distributionId], (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Log
            db.query('SELECT full_name FROM members WHERE id = ?', [distribution.member_id], (err, memberResults) => {
                if (!err && memberResults && memberResults.length > 0) {
                    const memberName = memberResults[0].full_name;
                    db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                        [req.session.userId, 'hero_payment', `$${amount} Zahlung von ${memberName} gebucht`]);                }
            });
            
            res.json({ 
                success: true, 
                message: 'Zahlung gebucht',
                new_paid_amount: newPaidAmount,
                status: newStatus
            });
        });
    });
});

// Hero Einstellungen ändern (Verkaufspreis & Gang-Prozentsatz)
app.put('/api/hero/inventory/settings', requireLogin, (req, res) => {
    const { sale_price, gang_percentage } = req.body;
    
    // Prüfe ob Eintrag existiert
    db.query('SELECT id FROM hero_inventory LIMIT 1', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (results.length === 0) {
            // Erstelle initialen Eintrag
            db.query('INSERT INTO hero_inventory (quantity, unit_cost, sale_price, gang_percentage) VALUES (0, 150, ?, ?)',
                [sale_price, gang_percentage], (err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                    [req.session.userId, 'hero_settings', `Hero-Einstellungen geändert: Verkaufspreis €${sale_price}, Gang-Anteil ${gang_percentage}%`]);
                
                res.json({ success: true, message: 'Einstellungen gespeichert' });
            });
        } else {
            db.query('UPDATE hero_inventory SET sale_price = ?, gang_percentage = ? WHERE id = ?', 
                [sale_price, gang_percentage, results[0].id], (err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                    [req.session.userId, 'hero_settings', `Hero-Einstellungen geändert: Verkaufspreis €${sale_price}, Gang-Anteil ${gang_percentage}%`]);
                
                res.json({ success: true, message: 'Einstellungen gespeichert' });
            });
        }
    });
});

// Hero-Verkauf
app.post('/api/hero/sales', requireLogin, (req, res) => {
    const { member_id, quantity } = req.body;
    
    // Hole aktuelle Einstellungen
    db.query('SELECT unit_cost, sale_price, gang_percentage FROM hero_inventory LIMIT 1', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const inventory = results[0];
        
        const total_cost = quantity * inventory.unit_cost;
        const total_sale = quantity * inventory.sale_price;
        const gang_share = total_sale * (inventory.gang_percentage / 100);
        const member_share = total_sale - gang_share;
        
        // Verkauf erstellen
        db.query('INSERT INTO hero_sales (member_id, quantity, unit_cost, sale_price, total_sale, gang_share, member_share) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [member_id, quantity, inventory.unit_cost, inventory.sale_price, total_sale, gang_share, member_share], (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Log
            db.query('SELECT full_name FROM members WHERE id = ?', [member_id], (err, memberResults) => {
                const memberName = memberResults[0]?.full_name || 'Unbekannt';
                db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                    [req.session.userId, 'hero_sale', `${memberName} hat ${quantity} Hero verkauft für €${total_sale.toFixed(2)} (Gang: €${gang_share.toFixed(2)}, Mitglied: €${member_share.toFixed(2)})`]);
            });
            
            res.json({ 
                success: true, 
                message: 'Verkauf erfolgreich',
                sale: {
                    total_sale,
                    gang_share,
                    member_share
                }
            });
        });
    });
});

// Hero Verkäufe abrufen
app.get('/api/hero/sales', requireLogin, (req, res) => {
    const query = `
        SELECT s.*, m.full_name, m.username
        FROM hero_sales s
        JOIN members m ON s.member_id = m.id
        ORDER BY s.sale_date DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Zahlung markieren
app.put('/api/hero/sales/:id/mark-paid', requireLogin, (req, res) => {
    const { id } = req.params;
    
    db.query('UPDATE hero_sales SET paid_to_gang = TRUE, payment_date = NOW() WHERE id = ?', [id], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Zahlung als bezahlt markiert' });
    });
});

// ========== HEHLER SYSTEM ==========

// Ankauf eintragen
app.post('/api/fence/purchases', requireLogin, (req, res) => {
    const { item_name, quantity, unit_price, seller_info, stored_in_warehouse, notes, is_private } = req.body;
    const total_price = quantity * unit_price;
    // Private Ankäufe kommen nie ins Lager
    const storeInWarehouse = is_private ? false : (stored_in_warehouse || false);
    
    db.query(
        'INSERT INTO fence_purchases (member_id, item_name, quantity, unit_price, total_price, seller_info, stored_in_warehouse, notes, is_private) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [req.session.userId, item_name, quantity, unit_price, total_price, seller_info || null, storeInWarehouse, notes || null, is_private ? 1 : 0],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Wenn ins Lager (und nicht privat), auch dort eintragen
            if (storeInWarehouse) {
                // Prüfe ob Item bereits im Lager existiert (mit storage_location UNSORTED oder ohne)
                db.query(
                    'SELECT id, quantity, storage_location FROM warehouse WHERE item_name = ? AND category = ? AND (storage_location = "UNSORTED" OR storage_location IS NULL)',
                    [item_name, 'fence_goods'],
                    (err, warehouseResults) => {
                        if (err) {
                            console.error('Fehler beim Prüfen des Lagerbestands:', err);
                            return;
                        }
                        
                        if (warehouseResults.length > 0) {
                            // Item existiert bereits als unsortiert - Menge erhöhen
                            const existingItem = warehouseResults[0];
                            db.query(
                                'UPDATE warehouse SET quantity = quantity + ? WHERE id = ?',
                                [quantity, existingItem.id]
                            );
                        } else {
                            // Neues Item als UNSORTED hinzufügen
                            db.query(
                                'INSERT INTO warehouse (item_name, category, quantity, unit_value, storage_location) VALUES (?, ?, ?, ?, ?)',
                                [item_name, 'fence_goods', quantity, unit_price, 'UNSORTED']
                            );
                        }
                    }
                );
            }
            
            // Log
            db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                [req.session.userId, 'fence_purchase', `Ankauf: ${quantity}x ${item_name} für €${total_price}`]);
            
            res.json({ success: true, purchase_id: result.insertId, total_price });
        }
    );
});

// Summary muss VOR der allgemeinen purchases-Route kommen
app.get('/api/fence/purchases/summary', requireLogin, (req, res) => {
    const purchasesQuery = `
        SELECT 
            COUNT(*) as total_purchases,
            COALESCE(SUM(total_price), 0) as total_spent,
            COALESCE(SUM(quantity), 0) as total_items
        FROM fence_purchases
        WHERE DATE(purchase_date) = CURDATE()
        AND (is_private IS NULL OR is_private = 0)
    `;
    
    const salesQuery = `
        SELECT 
            COALESCE(SUM(total_price), 0) as total_revenue,
            COALESCE(SUM(profit), 0) as total_profit
        FROM fence_sales
        WHERE DATE(sale_date) = CURDATE()
    `;
    
    db.query(purchasesQuery, (err, purchasesResults) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        db.query(salesQuery, (err, salesResults) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            const summary = {
                ...purchasesResults[0],
                total_revenue: salesResults[0].total_revenue,
                total_profit: salesResults[0].total_profit
            };
            
            res.json(summary);
        });
    });
});

// Ankäufe abrufen
app.get('/api/fence/purchases', requireLogin, (req, res) => {
    const query = `
        SELECT p.*, m.full_name
        FROM fence_purchases p
        LEFT JOIN members m ON p.member_id = m.id
        ORDER BY p.purchase_date DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Einzelnen Ankauf abrufen
app.get('/api/fence/purchases/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM fence_purchases WHERE id = ?', [id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Ankauf nicht gefunden' });
        }
        res.json(results[0]);
    });
});

// Ankauf bearbeiten
app.put('/api/fence/purchases/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    const { item_name, quantity, unit_price, seller_info, stored_in_warehouse, notes } = req.body;
    const total_price = quantity * unit_price;
    
    db.query(
        'UPDATE fence_purchases SET item_name = ?, quantity = ?, unit_price = ?, total_price = ?, seller_info = ?, stored_in_warehouse = ?, notes = ? WHERE id = ?',
        [item_name, quantity, unit_price, total_price, seller_info, stored_in_warehouse, notes, id],
        (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: 'Ankauf aktualisiert' });
        }
    );
});

// Ankauf löschen
app.delete('/api/fence/purchases/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    
    db.query('DELETE FROM fence_purchases WHERE id = ?', [id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Ankauf nicht gefunden' });
        }
        res.json({ success: true, message: 'Ankauf gelöscht' });
    });
});

// Hehler-Artikel-Vorlagen abrufen (nur aktive)
app.get('/api/fence/templates', requireLogin, (req, res) => {
    db.query('SELECT * FROM fence_item_templates WHERE is_active = TRUE ORDER BY category, item_name', 
        (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Alle Produkte abrufen (inkl. inaktive)
app.get('/api/fence/templates/all', requireLogin, (req, res) => {
    db.query('SELECT * FROM fence_item_templates ORDER BY category, item_name', 
        (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Einzelnes Produkt abrufen
app.get('/api/fence/templates/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM fence_item_templates WHERE id = ?', [id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Produkt nicht gefunden' });
        }
        res.json(results[0]);
    });
});

// Produkt hinzufügen
app.post('/api/fence/templates', requireLogin, (req, res) => {
    const { item_name, category, typical_price, is_active = true } = req.body;
    
    db.query(
        'INSERT INTO fence_item_templates (item_name, category, typical_price, is_active) VALUES (?, ?, ?, ?)',
        [item_name, category, typical_price, is_active],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, product_id: result.insertId });
        }
    );
});

// Produkt bearbeiten
app.put('/api/fence/templates/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    const { item_name, category, typical_price, is_active } = req.body;
    
    db.query(
        'UPDATE fence_item_templates SET item_name = ?, category = ?, typical_price = ?, is_active = ? WHERE id = ?',
        [item_name, category, typical_price, is_active, id],
        (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: 'Produkt aktualisiert' });
        }
    );
});

// Produkt löschen
app.delete('/api/fence/templates/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    
    db.query('DELETE FROM fence_item_templates WHERE id = ?', [id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Produkt nicht gefunden' });
        }
        res.json({ success: true, message: 'Produkt gelöscht' });
    });
});

// Hehler Verkauf erfassen
app.post('/api/fence/sales', requireLogin, (req, res) => {
    const { purchase_id, item_name, quantity, unit_cost, unit_price, buyer_info } = req.body;
    const total_price = quantity * unit_price;
    const profit = total_price - (quantity * unit_cost);
    
    console.log('=== VERKAUF GESTARTET ===');
    console.log('Item:', item_name, 'Menge:', quantity, 'Purchase ID:', purchase_id);
    
    db.query(
        'INSERT INTO fence_sales (purchase_id, item_name, quantity, unit_price, total_price, profit, buyer_info) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [purchase_id || null, item_name, quantity, unit_price, total_price, profit, buyer_info || null],
        (err, result) => {
            if (err) {
                console.error('Fehler beim Einfügen des Verkaufs:', err);
                return res.status(500).json({ error: err.message });
            }
            
            console.log('Verkauf gespeichert mit ID:', result.insertId);
            
            // Log Activity
            db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                [req.session.userId, 'fence_sale', `Verkauf: ${quantity}x ${item_name} für €${total_price} (Gewinn: €${profit})`]);
            
            // Wenn purchase_id angegeben, nutze diese, sonst suche nach Artikel
            const purchaseQuery = purchase_id 
                ? 'SELECT id, quantity, stored_in_warehouse FROM fence_purchases WHERE id = ?'
                : 'SELECT id, quantity, stored_in_warehouse FROM fence_purchases WHERE item_name = ? ORDER BY purchase_date ASC LIMIT 1';
            
            const purchaseParams = purchase_id ? [purchase_id] : [item_name];
            
            console.log('Suche Ankauf mit Query:', purchaseQuery, 'Params:', purchaseParams);
            
            db.query(purchaseQuery, purchaseParams, (err, purchaseResults) => {
                if (err) {
                    console.error('Fehler beim Abrufen des Ankaufs:', err);
                    return res.json({ success: true, sale_id: result.insertId, total_price, profit });
                }
                
                if (purchaseResults.length === 0) {
                    console.error('KEIN Ankauf gefunden für:', item_name);
                    // Trotzdem erfolgreich zurückgeben, da der Verkauf gespeichert wurde
                    return res.json({ success: true, sale_id: result.insertId, total_price, profit });
                }
                
                console.log('Ankauf gefunden:', purchaseResults[0]);
                
                const purchase = purchaseResults[0];
                const currentQuantity = purchase.quantity;
                const storedInWarehouse = purchase.stored_in_warehouse;
                const newQuantity = currentQuantity - quantity;
                
                console.log('Aktuelle Menge:', currentQuantity, 'Verkaufte Menge:', quantity, 'Neue Menge:', newQuantity);
                
                // Update oder Delete fence_purchases
                const updatePurchaseQuery = newQuantity <= 0
                    ? 'DELETE FROM fence_purchases WHERE id = ?'
                    : 'UPDATE fence_purchases SET quantity = ? WHERE id = ?';
                
                const updatePurchaseParams = newQuantity <= 0
                    ? [purchase.id]
                    : [newQuantity, purchase.id];
                
                console.log('Update Purchase Query:', updatePurchaseQuery, 'Params:', updatePurchaseParams);
                
                db.query(updatePurchaseQuery, updatePurchaseParams, (err) => {
                    if (err) {
                        console.error('Fehler beim Aktualisieren des Ankaufs:', err);
                    } else {
                        console.log('Ankauf erfolgreich aktualisiert/gelöscht');
                    }
                    
                    // Wenn im Lager, auch dort reduzieren/löschen
                    if (storedInWarehouse) {
                        db.query(
                            'SELECT id, quantity FROM warehouse WHERE item_name = ? AND category = "fence_goods" ORDER BY id ASC LIMIT 1',
                            [item_name],
                            (err, warehouseResults) => {
                                if (err || warehouseResults.length === 0) {
                                    // Kein Lager-Item gefunden, aber Verkauf war erfolgreich
                                    return res.json({ success: true, sale_id: result.insertId, total_price, profit });
                                }
                                
                                const warehouseItem = warehouseResults[0];
                                const newWarehouseQty = warehouseItem.quantity - quantity;
                                
                                const updateWarehouseQuery = newWarehouseQty <= 0
                                    ? 'DELETE FROM warehouse WHERE id = ?'
                                    : 'UPDATE warehouse SET quantity = ? WHERE id = ?';
                                
                                const updateWarehouseParams = newWarehouseQty <= 0
                                    ? [warehouseItem.id]
                                    : [newWarehouseQty, warehouseItem.id];
                                
                                db.query(updateWarehouseQuery, updateWarehouseParams, (err) => {
                                    if (err) {
                                        console.error('Fehler beim Aktualisieren des Lagers:', err);
                                    }
                                    // Jetzt erst Response senden, nachdem ALLES fertig ist
                                    res.json({ success: true, sale_id: result.insertId, total_price, profit });
                                });
                            }
                        );
                    } else {
                        // Nicht im Lager, also jetzt Response senden
                        res.json({ success: true, sale_id: result.insertId, total_price, profit });
                    }
                });
            });
        }
    );
});

// Hehler Verkäufe abrufen
app.get('/api/fence/sales', requireLogin, (req, res) => {
    const query = `
        SELECT s.*, m.full_name
        FROM fence_sales s
        LEFT JOIN members m ON s.purchase_id IN (SELECT id FROM fence_purchases WHERE member_id = m.id)
        ORDER BY s.sale_date DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Verkäufe Zusammenfassung
app.get('/api/fence/sales/summary', requireLogin, (req, res) => {
    const query = `
        SELECT 
            COUNT(*) as total_sales,
            COALESCE(SUM(total_price), 0) as total_revenue,
            COALESCE(SUM(profit), 0) as total_profit
        FROM fence_sales
        WHERE DATE(sale_date) = CURDATE()
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results[0]);
    });
});

// Verkauf löschen
app.delete('/api/fence/sales/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    
    db.query('DELETE FROM fence_sales WHERE id = ?', [id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Verkauf nicht gefunden' });
        }
        res.json({ success: true, message: 'Verkauf gelöscht' });
    });
});

// ========== LAGER ==========

app.get('/api/warehouse', requireLogin, (req, res) => {
    db.query('SELECT * FROM warehouse ORDER BY category, item_name', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

app.post('/api/warehouse', requireLogin, (req, res) => {
    const { item_name, category, quantity, unit_value, location } = req.body;
    
    db.query(
        'INSERT INTO warehouse (item_name, category, quantity, unit_value, location) VALUES (?, ?, ?, ?, ?)',
        [item_name, category, quantity, unit_value, location],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, item_id: result.insertId });
        }
    );
});

app.put('/api/warehouse/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    const { quantity, unit_value } = req.body;
    
    db.query('UPDATE warehouse SET quantity = ?, unit_value = ? WHERE id = ?', 
        [quantity, unit_value, id], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Lager aktualisiert' });
    });
});

// Lagerplatz aktualisieren (für Drag & Drop)
app.put('/api/warehouse/:id/location', requireLogin, (req, res) => {
    const { id } = req.params;
    const { storage_location } = req.body;
    
    // Hole zuerst die Artikel-Info und den Mitgliedsnamen
    db.query('SELECT item_name, quantity FROM warehouse WHERE id = ?', [id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Artikel nicht gefunden' });
        }
        
        const itemName = results[0].item_name;
        const quantity = results[0].quantity;
        
        // Hole den Namen des Mitglieds
        db.query('SELECT full_name FROM members WHERE id = ?', [req.session.userId], (err, memberResults) => {
            if (err) {
                console.error('Fehler beim Abrufen des Mitgliedsnamens:', err);
            }
            
            const memberName = memberResults && memberResults.length > 0 ? memberResults[0].full_name : 'Unbekannt';
            
            db.query('UPDATE warehouse SET storage_location = ? WHERE id = ?', 
                [storage_location, id], (err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                // Aktivität loggen
                db.query(
                    'INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                    [req.session.userId, 'warehouse', `${memberName} hat ${quantity}x ${itemName} in Lager ${storage_location} sortiert`],
                    (err) => {
                        if (err) console.error('Fehler beim Loggen der Aktivität:', err);
                    }
                );
                
                res.json({ success: true, message: 'Lagerplatz aktualisiert' });
            });
        });
    });
});

// Markiere Artikel als fertig sortiert
app.put('/api/warehouse/:id/complete', requireLogin, (req, res) => {
    const { id } = req.params;
    
    db.query('UPDATE warehouse SET sorting_complete = TRUE WHERE id = ?', [id], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Artikel als sortiert markiert' });
    });
});

app.delete('/api/warehouse/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    
    db.query('DELETE FROM warehouse WHERE id = ?', [id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Artikel nicht gefunden' });
        }
        res.json({ success: true, message: 'Artikel gelöscht' });
    });
});

// ========== LAGERPLÄTZE ==========

app.get('/api/storage-slots', requireLogin, (req, res) => {
    db.query('SELECT id, slot_code, name, section, owner, warehouse_id, location, created_at FROM storage_slots ORDER BY section, slot_code', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

app.post('/api/storage-slots', requireLogin, async (req, res) => {
    const { warehouse_id, owner, password, location } = req.body;
    
    console.log('Received data:', { warehouse_id, owner, password: !!password, location });
    
    try {
        // Validiere, dass warehouse_id genau 8 Ziffern hat
        if (!warehouse_id || !/^[0-9]{8}$/.test(warehouse_id)) {
            return res.status(400).json({ error: 'Lager-ID muss genau 8 Ziffern enthalten' });
        }
        
        // Validiere, dass Passwort genau 4 Ziffern hat (wenn vorhanden)
        if (password && !/^[0-9]{4}$/.test(password)) {
            return res.status(400).json({ error: 'Passwort muss genau 4 Ziffern enthalten' });
        }
        
        // Verwende warehouse_id auch als slot_code
        const slot_code = warehouse_id;
        
        console.log('Using warehouse_id as slot_code:', slot_code);
        
        // Hash das Passwort wenn vorhanden
        let hashedPassword = null;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }
        
        db.query(
            'INSERT INTO storage_slots (slot_code, name, section, owner, warehouse_id, password, location) VALUES (?, NULL, "Lager", ?, ?, ?, ?)',
            [slot_code, owner || null, warehouse_id, hashedPassword, location || 'Paleto'],
            (err, result) => {
                if (err) {
                    console.error('Database error:', err);
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.status(400).json({ error: 'Lager-ID existiert bereits' });
                    }
                    return res.status(500).json({ error: err.message });
                }
                
                // Aktivität loggen
                db.query(
                    'INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                    [req.session.userId, 'warehouse', `Lager ${warehouse_id} (${location}) erstellt - Besitzer: ${owner || 'Keiner'}`],
                    (err) => {
                        if (err) console.error('Fehler beim Loggen der Aktivität:', err);
                    }
                );
                
                res.json({ success: true, slot_id: result.insertId });
            }
        );
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/storage-slots/:id', requireLogin, async (req, res) => {
    const { id } = req.params;
    const { warehouse_id, old_code, owner, password, location } = req.body;
    
    try {
        // Validiere, dass warehouse_id genau 8 Ziffern hat
        if (!warehouse_id || !/^[0-9]{8}$/.test(warehouse_id)) {
            return res.status(400).json({ error: 'Lager-ID muss genau 8 Ziffern enthalten' });
        }
        
        // Validiere, dass Passwort genau 4 Ziffern hat (wenn vorhanden)
        if (password && !/^[0-9]{4}$/.test(password)) {
            return res.status(400).json({ error: 'Passwort muss genau 4 Ziffern enthalten' });
        }
        
        // Verwende warehouse_id auch als neuer slot_code
        const new_slot_code = warehouse_id;
        
        // Wenn Code geändert wurde, aktualisiere auch Warehouse-Einträge
        if (old_code && new_slot_code !== old_code) {
            db.query(
                'UPDATE warehouse SET storage_location = ? WHERE storage_location = ?',
                [new_slot_code, old_code],
                (err) => {
                    if (err) console.error('Fehler beim Aktualisieren der Warehouse-Einträge:', err);
                }
            );
        }
        
        // Hash das Passwort wenn vorhanden und geändert
        let updateQuery;
        let updateParams;
        
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateQuery = 'UPDATE storage_slots SET slot_code = ?, owner = ?, warehouse_id = ?, password = ?, location = ? WHERE id = ?';
            updateParams = [new_slot_code, owner || null, warehouse_id, hashedPassword, location || 'Paleto', id];
        } else {
            updateQuery = 'UPDATE storage_slots SET slot_code = ?, owner = ?, warehouse_id = ?, location = ? WHERE id = ?';
            updateParams = [new_slot_code, owner || null, warehouse_id, location || 'Paleto', id];
        }
        
        db.query(updateQuery, updateParams, (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'Lager-ID existiert bereits' });
                }
                return res.status(500).json({ error: err.message });
            }
            
            // Aktivität loggen
            db.query(
                'INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                [req.session.userId, 'warehouse', `Lager ${warehouse_id} (${location}) bearbeitet - Besitzer: ${owner || 'Keiner'}`],
                (err) => {
                    if (err) console.error('Fehler beim Loggen der Aktivität:', err);
                }
            );
            
            res.json({ success: true, message: 'Lagerplatz aktualisiert' });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/storage-slots/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    
    // Hole den Slot-Code vor dem Löschen
    db.query('SELECT slot_code FROM storage_slots WHERE id = ?', [id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Lagerplatz nicht gefunden' });
        }
        
        const slotCode = results[0].slot_code;
        
        // Hole den Namen des Mitglieds für die Aktivität
        db.query('SELECT full_name FROM members WHERE id = ?', [req.session.userId], (err, memberResults) => {
            if (err) {
                console.error('Fehler beim Abrufen des Mitgliedsnamens:', err);
            }
            
            const memberName = memberResults && memberResults.length > 0 ? memberResults[0].full_name : 'Unbekannt';
            
            // Verschiebe alle Artikel zu UNSORTED und setze sorting_complete auf FALSE
            db.query(
                'UPDATE warehouse SET storage_location = "UNSORTED", sorting_complete = FALSE WHERE storage_location = ?',
                [slotCode],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    
                    // Lösche den Lagerplatz
                    db.query('DELETE FROM storage_slots WHERE id = ?', [id], (err) => {
                        if (err) {
                            return res.status(500).json({ error: err.message });
                        }
                        
                        // Aktivität loggen
                        db.query(
                            'INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                            [req.session.userId, 'warehouse', `Lager ${slotCode} gelöscht von ${memberName} - Artikel zurück in Sortierbereich`],
                            (err) => {
                                if (err) console.error('Fehler beim Loggen der Aktivität:', err);
                            }
                        );
                        
                        res.json({ success: true, message: 'Lagerplatz gelöscht' });
                    });
                }
            );
        });
    });
});

// ========== AKTIVITÄTEN ==========

app.get('/api/activity/recent', requireLogin, (req, res) => {
    const query = `
        SELECT a.*, m.full_name
        FROM activity_log a
        LEFT JOIN members m ON a.member_id = m.id
        ORDER BY a.timestamp DESC
        LIMIT 50
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// ===== ARCHIV ENDPOINTS =====

// Hero Lieferungen abrufen
app.get('/api/hero/deliveries', requireLogin, (req, res) => {
    const query = `
        SELECT d.*, m.full_name as received_by_name
        FROM hero_deliveries d
        LEFT JOIN members m ON d.received_by = m.id
        ORDER BY d.delivery_date DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Archivierte Hero Verteilungen abrufen (nach Lieferung)
app.get('/api/hero/archive/distributions/:deliveryNumber?', requireLogin, (req, res) => {
    const deliveryNumber = req.params.deliveryNumber;
    
    let query = `
        SELECT a.*, m.full_name, m.username
        FROM hero_distributions_archive a
        LEFT JOIN members m ON a.member_id = m.id
    `;
    
    const params = [];
    if (deliveryNumber) {
        query += ' WHERE a.delivery_number = ?';
        params.push(deliveryNumber);
    }
    
    query += ' ORDER BY a.distributed_date DESC';
    
    db.query(query, params, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Archivierte Hero Verkäufe abrufen (nach Lieferung)
app.get('/api/hero/archive/sales/:deliveryNumber?', requireLogin, (req, res) => {
    const deliveryNumber = req.params.deliveryNumber;
    
    let query = `
        SELECT a.*, m.full_name, m.username
        FROM hero_sales_archive a
        LEFT JOIN members m ON a.member_id = m.id
    `;
    
    const params = [];
    if (deliveryNumber) {
        query += ' WHERE a.delivery_number = ?';
        params.push(deliveryNumber);
    }
    
    query += ' ORDER BY a.sale_date DESC';
    
    db.query(query, params, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Archiv-Übersicht mit Statistiken pro Lieferung
app.get('/api/hero/archive/overview', requireLogin, (req, res) => {
    const query = `
        SELECT 
            d.delivery_number,
            d.quantity as delivery_quantity,
            d.delivery_date,
            m.full_name as received_by_name,
            COUNT(DISTINCT da.id) as total_distributions,
            COALESCE(SUM(da.quantity), 0) as total_distributed,
            COUNT(DISTINCT sa.id) as total_sales,
            COALESCE(SUM(sa.total_sale), 0) as total_revenue,
            COALESCE(SUM(sa.gang_share), 0) as total_gang_share
        FROM hero_deliveries d
        LEFT JOIN members m ON d.received_by = m.id
        LEFT JOIN hero_distributions_archive da ON d.delivery_number = da.delivery_number + 1
        LEFT JOIN hero_sales_archive sa ON d.delivery_number = sa.delivery_number + 1
        GROUP BY d.delivery_number, d.quantity, d.delivery_date, m.full_name
        ORDER BY d.delivery_date DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// ========== INTELLIGENCE SYSTEM ==========

// Alle Informationen abrufen
app.get('/api/intelligence', requireLogin, (req, res) => {
    const query = `
        SELECT i.*, m.full_name as added_by_name
        FROM intelligence i
        LEFT JOIN members m ON i.added_by = m.id
        ORDER BY 
            CASE i.importance
                WHEN 'Kritisch' THEN 1
                WHEN 'Hoch' THEN 2
                WHEN 'Mittel' THEN 3
                WHEN 'Niedrig' THEN 4
            END,
            i.created_at DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Einzelne Information abrufen
app.get('/api/intelligence/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM intelligence WHERE id = ?', [id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Information nicht gefunden' });
        }
        res.json(results[0]);
    });
});

// Neue Information hinzufügen
app.post('/api/intelligence', requireLogin, (req, res) => {
    const { category, title, subject_name, description, importance, status, source, tags, color, gang_id } = req.body;
    
    db.query(
        'INSERT INTO intelligence (category, title, subject_name, description, importance, status, source, tags, color, gang_id, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [category, title, subject_name, description || null, importance || 'Mittel', status || 'Unbestätigt', source || null, tags || null, color || null, gang_id || null, req.session.userId],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Log
            db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                [req.session.userId, 'intelligence', `Intel hinzugefügt: ${title} (${category})`]);
            
            res.json({ success: true, id: result.insertId });
        }
    );
});

// Information bearbeiten
app.put('/api/intelligence/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    const { category, title, subject_name, description, importance, status, source, tags, color, gang_id } = req.body;
    
    db.query(
        'UPDATE intelligence SET category = ?, title = ?, subject_name = ?, description = ?, importance = ?, status = ?, source = ?, tags = ?, color = ?, gang_id = ? WHERE id = ?',
        [category, title, subject_name, description, importance, status, source, tags, color || null, gang_id || null, id],
        (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Log
            db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                [req.session.userId, 'intelligence', `Intel aktualisiert: ${title}`]);
            
            res.json({ success: true, message: 'Information aktualisiert' });
        }
    );
});

// Information löschen
app.delete('/api/intelligence/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    
    // Hole Titel für Log
    db.query('SELECT title, category FROM intelligence WHERE id = ?', [id], (err, results) => {
        if (err) {
            console.error('Delete error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Information nicht gefunden' });
        }
        
        const title = results[0].title;
        const category = results[0].category;
        
        // Wenn es eine Gang ist, prüfe ob Personen zugeordnet sind und gib Info zurück
        if (category === 'Gang') {
            db.query('SELECT COUNT(*) as count FROM intelligence WHERE gang_id = ?', [id], (err, countResults) => {
                if (err) {
                    console.error('Count error:', err);
                    return res.status(500).json({ error: err.message });
                }
                
                const personCount = countResults[0].count;
                
                if (personCount > 0) {
                    // Entferne die Gang-Zuordnung bei allen Personen
                    db.query('UPDATE intelligence SET gang_id = NULL WHERE gang_id = ?', [id], (err) => {
                        if (err) {
                            console.error('Update gang_id error:', err);
                            return res.status(500).json({ error: err.message });
                        }
                        
                        // Jetzt die Gang löschen
                        deleteIntelligence(id, title, req, res, `${personCount} Person(en) wurden von der Gang entfernt`);
                    });
                } else {
                    // Keine Personen zugeordnet, Gang kann direkt gelöscht werden
                    deleteIntelligence(id, title, req, res);
                }
            });
        } else {
            // Personen können direkt gelöscht werden
            deleteIntelligence(id, title, req, res);
        }
    });
});

function deleteIntelligence(id, title, req, res, additionalInfo = null) {
    db.query('DELETE FROM intelligence WHERE id = ?', [id], (err, result) => {
        if (err) {
            console.error('Delete query error:', err);
            return res.status(500).json({ error: err.message });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Information nicht gefunden' });
        }
        
        console.log(`Intel gelöscht: ${title} (ID: ${id})`);
        
        // Log
        const logMessage = additionalInfo ? `Intel gelöscht: ${title} (${additionalInfo})` : `Intel gelöscht: ${title}`;
        db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
            [req.session.userId, 'intelligence', logMessage]);
        
        const message = additionalInfo ? `Information gelöscht. ${additionalInfo}` : 'Information gelöscht';
        res.json({ success: true, message: message });
    });
}

// ============================================
// REZEPTE ROUTEN
// ============================================

// Alle Rezepte abrufen
app.get('/api/recipes', requireLogin, (req, res) => {
    const query = `
        SELECT r.*, 
               m.full_name as creator_name,
               (SELECT COUNT(*) FROM recipe_ingredients WHERE recipe_id = r.id) as ingredient_count
        FROM recipes r
        LEFT JOIN members m ON r.created_by = m.id
        WHERE r.is_active = TRUE
        ORDER BY r.created_date DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Recipes query error:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Einzelnes Rezept mit Zutaten abrufen
app.get('/api/recipes/:id', requireLogin, (req, res) => {
    const recipeId = req.params.id;
    
    const recipeQuery = 'SELECT * FROM recipes WHERE id = ? AND is_active = TRUE';
    const ingredientsQuery = 'SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY id';
    
    db.query(recipeQuery, [recipeId], (err, recipeResults) => {
        if (err) {
            console.error('Recipe query error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (recipeResults.length === 0) {
            return res.status(404).json({ error: 'Rezept nicht gefunden' });
        }
        
        db.query(ingredientsQuery, [recipeId], (err, ingredientResults) => {
            if (err) {
                console.error('Ingredients query error:', err);
                return res.status(500).json({ error: err.message });
            }
            
            const recipe = recipeResults[0];
            recipe.ingredients = ingredientResults;
            
            res.json(recipe);
        });
    });
});

// Neues Rezept erstellen
app.post('/api/recipes', requireLogin, (req, res) => {
    const { recipe_name, category, description, crafting_time, output_item, output_quantity, product_image, notes, ingredients } = req.body;
    
    if (!recipe_name || !category) {
        return res.status(400).json({ error: 'Rezeptname und Kategorie sind erforderlich' });
    }
    
    if (!ingredients || ingredients.length === 0) {
        return res.status(400).json({ error: 'Mindestens eine Zutat ist erforderlich' });
    }
    
    const recipeQuery = `
        INSERT INTO recipes (recipe_name, category, description, crafting_time, output_item, output_quantity, product_image, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.query(recipeQuery, [recipe_name, category, description, crafting_time || 0, output_item, output_quantity || 1, product_image || null, notes, req.session.userId], (err, result) => {
        if (err) {
            console.error('Recipe insert error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const recipeId = result.insertId;
        
        // Zutaten einfügen
        const ingredientValues = ingredients.map(ing => [recipeId, ing.ingredient_name, ing.quantity, ing.unit]);
        const ingredientQuery = 'INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity, unit) VALUES ?';
        
        db.query(ingredientQuery, [ingredientValues], (err) => {
            if (err) {
                console.error('Ingredients insert error:', err);
                // Rollback: Rezept wieder löschen
                db.query('DELETE FROM recipes WHERE id = ?', [recipeId]);
                return res.status(500).json({ error: err.message });
            }
            
            console.log(`Rezept erstellt: ${recipe_name} (ID: ${recipeId})`);
            
            // Log
            db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                [req.session.userId, 'recipe', `Rezept erstellt: ${recipe_name}`]);
            
            res.json({ success: true, id: recipeId, message: 'Rezept erfolgreich erstellt' });
        });
    });
});

// Rezept aktualisieren
app.put('/api/recipes/:id', requireLogin, (req, res) => {
    const recipeId = req.params.id;
    const { recipe_name, category, description, crafting_time, output_item, output_quantity, product_image, notes, ingredients } = req.body;
    
    if (!recipe_name || !category) {
        return res.status(400).json({ error: 'Rezeptname und Kategorie sind erforderlich' });
    }
    
    if (!ingredients || ingredients.length === 0) {
        return res.status(400).json({ error: 'Mindestens eine Zutat ist erforderlich' });
    }
    
    const updateQuery = `
        UPDATE recipes 
        SET recipe_name = ?, category = ?, description = ?, crafting_time = ?, 
            output_item = ?, output_quantity = ?, product_image = ?, notes = ?
        WHERE id = ?
    `;
    
    db.query(updateQuery, [recipe_name, category, description, crafting_time || 0, output_item, output_quantity || 1, product_image || null, notes, recipeId], (err, result) => {
        if (err) {
            console.error('Recipe update error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Rezept nicht gefunden' });
        }
        
        // Alte Zutaten löschen
        db.query('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [recipeId], (err) => {
            if (err) {
                console.error('Delete ingredients error:', err);
                return res.status(500).json({ error: err.message });
            }
            
            // Neue Zutaten einfügen
            const ingredientValues = ingredients.map(ing => [recipeId, ing.ingredient_name, ing.quantity, ing.unit]);
            const ingredientQuery = 'INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity, unit) VALUES ?';
            
            db.query(ingredientQuery, [ingredientValues], (err) => {
                if (err) {
                    console.error('Ingredients insert error:', err);
                    return res.status(500).json({ error: err.message });
                }
                
                console.log(`Rezept aktualisiert: ${recipe_name} (ID: ${recipeId})`);
                
                // Log
                db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                    [req.session.userId, 'recipe', `Rezept aktualisiert: ${recipe_name}`]);
                
                res.json({ success: true, message: 'Rezept erfolgreich aktualisiert' });
            });
        });
    });
});

// Rezept löschen
app.delete('/api/recipes/:id', requireLogin, (req, res) => {
    const recipeId = req.params.id;
    
    // Erst Rezeptname holen für Log
    db.query('SELECT recipe_name FROM recipes WHERE id = ?', [recipeId], (err, results) => {
        if (err) {
            console.error('Recipe query error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Rezept nicht gefunden' });
        }
        
        const recipeName = results[0].recipe_name;
        
        // Soft delete: is_active auf FALSE setzen
        db.query('UPDATE recipes SET is_active = FALSE WHERE id = ?', [recipeId], (err, result) => {
            if (err) {
                console.error('Recipe delete error:', err);
                return res.status(500).json({ error: err.message });
            }
            
            console.log(`Rezept gelöscht: ${recipeName} (ID: ${recipeId})`);
            
            // Log
            db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                [req.session.userId, 'recipe', `Rezept gelöscht: ${recipeName}`]);
            
            res.json({ success: true, message: 'Rezept erfolgreich gelöscht' });
        });
    });
});

// ========== DASHBOARD STATS EINSTELLUNGEN ==========

// Dashboard-Statistik-Einstellungen abrufen (für alle eingeloggten User)
app.get('/api/dashboard/stat-settings', requireLogin, (req, res) => {
    db.query('SELECT stat_key, label, is_visible, sort_order FROM dashboard_stat_settings ORDER BY sort_order', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, settings: results });
    });
});

// Dashboard-Statistik-Einstellungen speichern (nur Techniker)
app.post('/api/dashboard/stat-settings', requireLogin, (req, res) => {
    if (req.session.rank !== 'Techniker') {
        return res.status(403).json({ error: 'Nur Techniker können Dashboard-Einstellungen verwalten' });
    }
    
    const { settings } = req.body;
    if (!settings || !Array.isArray(settings)) {
        return res.status(400).json({ error: 'Ungültige Einstellungen' });
    }
    
    let updateCount = 0;
    const total = settings.length;
    
    settings.forEach(stat => {
        db.query(
            'UPDATE dashboard_stat_settings SET is_visible = ?, sort_order = ? WHERE stat_key = ?',
            [stat.is_visible ? 1 : 0, stat.sort_order || 0, stat.stat_key],
            (err) => {
                if (err) console.error('Dashboard stat update error:', err);
                updateCount++;
                if (updateCount === total) {
                    db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                        [req.session.userId, 'dashboard_settings', 'Dashboard-Statistik-Einstellungen geändert'],
                        () => {}
                    );
                    res.json({ success: true, message: 'Dashboard-Einstellungen gespeichert' });
                }
            }
        );
    });
});

// ========== SYSTEM WARTUNG (nur für Techniker) ==========

// Wartungseinstellungen abrufen
app.get('/api/maintenance/settings', requireLogin, (req, res) => {
    // Nur Techniker können zugreifen
    if (req.session.rank !== 'Techniker') {
        return res.status(403).json({ error: 'Nur Techniker können Wartungseinstellungen verwalten' });
    }
    
    db.query('SELECT * FROM maintenance_settings', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const settings = {};
        results.forEach(row => {
            settings[row.module_name] = {
                is_disabled: row.is_disabled,
                disabled_by: row.disabled_by,
                disabled_at: row.disabled_at,
                reason: row.reason
            };
        });
        
        res.json({ success: true, settings: settings });
    });
});

// Wartungseinstellungen speichern
app.post('/api/maintenance/settings', requireLogin, (req, res) => {
    // Nur Techniker können zugreifen
    if (req.session.rank !== 'Techniker') {
        return res.status(403).json({ error: 'Nur Techniker können Wartungseinstellungen verwalten' });
    }
    
    const { settings } = req.body;
    console.log('DEBUG - Empfangene Wartungseinstellungen:', settings);
    let updateCount = 0;
    let totalSettings = Object.keys(settings).length;
    
    Object.keys(settings).forEach(module_name => {
        const is_disabled = settings[module_name];
        console.log(`DEBUG - Aktualisiere ${module_name}: is_disabled = ${is_disabled}`);
        
        const query = 'UPDATE maintenance_settings SET is_disabled = ?, disabled_by = ?, disabled_at = ?, reason = ? WHERE module_name = ?';
        const params = [
            is_disabled,
            is_disabled ? req.session.userId : null,
            is_disabled ? new Date() : null,
            is_disabled ? `Wartungsmodus aktiviert von ${req.session.username}` : null,
            module_name
        ];
        
        db.query(query, params, (err, result) => {
            if (err) {
                console.error('Maintenance update error:', err);
                return res.status(500).json({ error: err.message });
            }
            
            console.log(`DEBUG - UPDATE Ergebnis für ${module_name}:`, result);
            updateCount++;
            
            if (updateCount === totalSettings) {
                // Log
                db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                    [req.session.userId, 'maintenance', 'Wartungseinstellungen geändert']);
                
                res.json({ success: true, message: 'Wartungseinstellungen gespeichert' });
            }
        });
    });
});

// Wartungsstatus für spezifisches Modul prüfen
app.get('/api/maintenance/status/:module', requireLogin, (req, res) => {
    const { module } = req.params;
    console.log(`DEBUG - Prüfe Wartungsstatus für Modul: ${module}`);
    
    db.query('SELECT is_disabled, reason FROM maintenance_settings WHERE module_name = ?', [module], (err, results) => {
        if (err) {
            console.error(`DEBUG - Fehler bei Wartungsstatus-Abfrage für ${module}:`, err);
            return res.status(500).json({ error: err.message });
        }
        
        console.log(`DEBUG - Wartungsabfrage-Ergebnisse für ${module}:`, results);
        
        if (results.length === 0) {
            console.log(`DEBUG - Kein Eintrag gefunden für ${module}, gebe false zurück`);
            return res.json({ success: true, is_disabled: false });
        }
        
        const setting = results[0];
        console.log(`DEBUG - Gefundene Einstellung für ${module}:`, setting);
        res.json({ 
            success: true, 
            is_disabled: setting.is_disabled,
            reason: setting.reason
        });
    });
});

// ========================================
// RANG-BERECHTIGUNGEN ENDPUNKTE
// ========================================

// Alle Rang-Vorlagen laden
app.get('/api/rank-permissions', requireLogin, (req, res) => {
    if (req.session.rank !== 'Techniker') {
        return res.status(403).json({ error: 'Nur Techniker können Rang-Berechtigungen verwalten' });
    }
    
    db.query('SELECT * FROM rank_permissions ORDER BY FIELD(rank_name, "Techniker", "OG", "2OG", "Member", "Soldat", "Runner")', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, ranks: results });
    });
});

// Rang-Vorlage speichern
app.put('/api/rank-permissions/:rankName', requireLogin, (req, res) => {
    if (req.session.rank !== 'Techniker') {
        return res.status(403).json({ error: 'Nur Techniker können Rang-Berechtigungen verwalten' });
    }
    
    const { rankName } = req.params;
    const { can_add_members, can_view_fence, can_manage_fence, can_view_recipes, can_manage_recipes, can_view_storage, can_manage_storage, can_view_treasury, can_manage_treasury, can_view_activity, can_view_stats, can_manage_system } = req.body;
    
    const query = `INSERT INTO rank_permissions (rank_name, can_add_members, can_view_fence, can_manage_fence, can_view_recipes, can_manage_recipes, can_view_storage, can_manage_storage, can_view_treasury, can_manage_treasury, can_view_activity, can_view_stats, can_manage_system) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
        ON DUPLICATE KEY UPDATE 
            can_add_members = VALUES(can_add_members),
            can_view_fence = VALUES(can_view_fence),
            can_manage_fence = VALUES(can_manage_fence),
            can_view_recipes = VALUES(can_view_recipes),
            can_manage_recipes = VALUES(can_manage_recipes),
            can_view_storage = VALUES(can_view_storage),
            can_manage_storage = VALUES(can_manage_storage),
            can_view_treasury = VALUES(can_view_treasury),
            can_manage_treasury = VALUES(can_manage_treasury),
            can_view_activity = VALUES(can_view_activity),
            can_view_stats = VALUES(can_view_stats),
            can_manage_system = VALUES(can_manage_system)`;
    
    db.query(query, [rankName, can_add_members, can_view_fence, can_manage_fence, can_view_recipes, can_manage_recipes, can_view_storage, can_manage_storage, can_view_treasury, can_manage_treasury, can_view_activity, can_view_stats, can_manage_system], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
            [req.session.userId, 'rank_permissions', `Rang-Berechtigungen für "${rankName}" geändert`]);
        
        res.json({ success: true, message: `Berechtigungen für "${rankName}" gespeichert` });
    });
});

// Rang-Vorlage auf alle Mitglieder dieses Rangs anwenden
app.post('/api/rank-permissions/:rankName/apply', requireLogin, (req, res) => {
    if (req.session.rank !== 'Techniker') {
        return res.status(403).json({ error: 'Nur Techniker können Rang-Berechtigungen anwenden' });
    }
    
    const { rankName } = req.params;
    
    // Erst Rang-Vorlage laden
    db.query('SELECT * FROM rank_permissions WHERE rank_name = ?', [rankName], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Rang-Vorlage nicht gefunden' });
        }
        
        const rp = results[0];
        
        // Auf alle aktiven Mitglieder mit diesem Rang anwenden
        const updateQuery = `UPDATE members SET 
            can_add_members = ?, can_view_fence = ?, can_manage_fence = ?, can_view_recipes = ?, can_manage_recipes = ?, 
            can_view_storage = ?, can_manage_storage = ?, can_view_treasury = ?, can_manage_treasury = ?, can_view_activity = ?, can_view_stats = ?, can_manage_system = ?
            WHERE \`rank\` = ? AND is_active = TRUE`;
        
        db.query(updateQuery, [
            rp.can_add_members, rp.can_view_fence, rp.can_manage_fence, rp.can_view_recipes, rp.can_manage_recipes,
            rp.can_view_storage, rp.can_manage_storage, rp.can_view_treasury, rp.can_manage_treasury, rp.can_view_activity, rp.can_view_stats, rp.can_manage_system,
            rankName
        ], (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                [req.session.userId, 'rank_permissions_applied', `Rang-Berechtigungen auf ${result.affectedRows} "${rankName}"-Mitglieder angewendet`]);
            
            res.json({ 
                success: true, 
                message: `Berechtigungen auf ${result.affectedRows} Mitglieder mit Rang "${rankName}" angewendet`,
                affected: result.affectedRows
            });
        });
    });
});

// Rechte-Übersicht: Alle Mitglieder mit ihren Rechten
app.get('/api/permissions-overview', requireLogin, (req, res) => {
    if (req.session.rank !== 'Techniker') {
        return res.status(403).json({ error: 'Nur Techniker können die Rechte-Übersicht sehen' });
    }
    
    const query = `SELECT id, full_name, \`rank\`, is_active,
        COALESCE(can_add_members, FALSE) as can_add_members,
        COALESCE(can_view_fence, FALSE) as can_view_fence,
        COALESCE(can_manage_fence, FALSE) as can_manage_fence,
        COALESCE(can_view_recipes, FALSE) as can_view_recipes,
        COALESCE(can_manage_recipes, FALSE) as can_manage_recipes,
        COALESCE(can_view_storage, FALSE) as can_view_storage,
        COALESCE(can_manage_storage, FALSE) as can_manage_storage,
        COALESCE(can_view_treasury, FALSE) as can_view_treasury,
        COALESCE(can_manage_treasury, FALSE) as can_manage_treasury,
        COALESCE(can_view_activity, FALSE) as can_view_activity,
        COALESCE(can_view_stats, FALSE) as can_view_stats,
        COALESCE(can_manage_system, FALSE) as can_manage_system
        FROM members WHERE is_active = TRUE 
        ORDER BY FIELD(\`rank\`, 'Techniker', 'OG', '2OG', 'Member', 'Soldat', 'Runner'), full_name`;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, members: results });
    });
});

// ========================================
// TREASURY ENDPUNKTE
// ========================================

// Treasury Balance abrufen
app.get('/api/treasury/balance', requireLogin, (req, res) => {
    db.query('SELECT current_balance, contributions_balance, goals_balance, last_updated, notes FROM gang_treasury LIMIT 1', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (results.length === 0) {
            return res.json({ balance: 0, contributions_balance: 0, goals_balance: 0, last_updated: null, notes: null });
        }
        
        res.json({
            balance: results[0].current_balance || 0,
            contributions_balance: results[0].contributions_balance || 0,
            goals_balance: results[0].goals_balance || 0,
            last_updated: results[0].last_updated,
            notes: results[0].notes
        });
    });
});

// Treasury Balance manuell setzen
app.post('/api/treasury/balance/set', requireLogin, (req, res) => {
    const { new_balance, reason } = req.body;
    
    if (new_balance === undefined || new_balance === null) {
        return res.status(400).json({ error: 'Neuer Kassenstand ist erforderlich' });
    }
    
    const kasse = req.body.kasse || 'contributions'; // 'contributions' oder 'goals'
    const balanceField = kasse === 'goals' ? 'goals_balance' : 'contributions_balance';
    const kasseLabel = kasse === 'goals' ? 'Zielkasse' : 'Beitragskasse';
    
    // Aktuellen Stand abrufen
    db.query('SELECT current_balance, contributions_balance, goals_balance FROM gang_treasury LIMIT 1', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const oldContributions = results.length > 0 ? parseFloat(results[0].contributions_balance) || 0 : 0;
        const oldGoals = results.length > 0 ? parseFloat(results[0].goals_balance) || 0 : 0;
        const oldBalance = kasse === 'goals' ? oldGoals : oldContributions;
        const difference = parseFloat(new_balance) - oldBalance;
        
        // Korrektur-Transaktion erstellen
        const description = reason || `${kasseLabel} Anpassung: ${oldBalance.toFixed(2)} → ${parseFloat(new_balance).toFixed(2)}`;
        
        db.query(
            'INSERT INTO gang_transactions (member_id, type, amount, description, recorded_by) VALUES (?, ?, ?, ?, ?)',
            [null, 'korrektur', difference, description, req.session.userId],
            (insertErr, insertResult) => {
                if (insertErr) {
                    return res.status(500).json({ error: insertErr.message });
                }
                
                // Balance direkt auf neuen Wert setzen + current_balance synchronisieren
                const newContributions = kasse === 'goals' ? oldContributions : parseFloat(new_balance);
                const newGoals = kasse === 'goals' ? parseFloat(new_balance) : oldGoals;
                const newTotal = newContributions + newGoals;
                
                db.query('UPDATE gang_treasury SET current_balance = ?, contributions_balance = ?, goals_balance = ?, last_updated = NOW()', 
                    [newTotal, newContributions, newGoals], (updateErr) => {
                    if (updateErr) {
                        return res.status(500).json({ error: updateErr.message });
                    }
                    
                    // Zuerst Response senden
                    res.json({ 
                        success: true, 
                        old_balance: oldBalance,
                        new_balance: parseFloat(new_balance),
                        difference: difference,
                        kasse: kasse
                    });
                    
                    // Log activity (fire-and-forget, nach Response)
                    db.query(
                        'INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                        [req.session.userId, 'balance_adjusted', `${kasseLabel} angepasst: $${oldBalance.toFixed(2)} → $${parseFloat(new_balance).toFixed(2)}`],
                        (logErr) => { if (logErr) console.error('Activity log error:', logErr); }
                    );
                });
            }
        );
    });
});

// Alle Transaktionen abrufen
app.get('/api/treasury/transactions', requireLogin, (req, res) => {
    const query = `
        SELECT 
            gt.id, gt.type, gt.amount, gt.description, gt.notes, gt.ziel_id,
            gt.transaction_date,
            m.full_name as member_name,
            rb.full_name as recorded_by_name
        FROM gang_transactions gt 
        LEFT JOIN members m ON gt.member_id = m.id
        LEFT JOIN members rb ON gt.recorded_by = rb.id
        ORDER BY gt.transaction_date DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Neue Transaktion hinzufügen
app.post('/api/treasury/transactions', requireLogin, (req, res) => {
    const { member_id, type, amount, description, notes } = req.body;
    
    if (!type || !amount) {
        return res.status(400).json({ error: 'Typ und Betrag sind erforderlich' });
    }
    
    // Transaktion hinzufügen
    const insertQuery = `
        INSERT INTO gang_transactions (member_id, type, amount, description, notes, recorded_by)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    db.query(insertQuery, [member_id || null, type, amount, description, notes || null, req.session.userId], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Balance aktualisieren - getrennte Kassen
        let balanceChange = 0;
        if (type === 'einzahlung' || type === 'beitrag') {
            balanceChange = parseFloat(amount);
        } else if (type === 'ziel_einzahlung') {
            balanceChange = parseFloat(amount);
        } else if (type === 'auszahlung') {
            balanceChange = -parseFloat(amount);
        } else if (type === 'korrektur') {
            balanceChange = parseFloat(amount);
        }
        
        // Ziel-Einzahlungen gehen in goals_balance, alles andere in contributions_balance
        const balanceField = type === 'ziel_einzahlung' ? 'goals_balance' : 'contributions_balance';
        db.query(`UPDATE gang_treasury SET current_balance = current_balance + ?, ${balanceField} = ${balanceField} + ?`, [balanceChange, balanceChange], (err2) => {
            if (err2) {
                console.error('Balance update error:', err2);
            }
            
            // Log activity
            db.query(
                'INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                [req.session.userId, 'transaction_added', `${type}: $${amount}`]
            );
            
            res.json({ success: true, id: result.insertId });
        });
    });
});

// Beiträge abrufen (neues vereinfachtes Schema)
app.get('/api/treasury/contributions', requireLogin, (req, res) => {
    const { woche } = req.query;
    
    let query = `
        SELECT 
            mc.id, mc.member_id, mc.woche, mc.woche_start, mc.woche_ende,
            mc.soll_betrag, mc.ist_betrag, mc.status, mc.bezahlt_am,
            mc.locked, mc.uebertrag_betrag,
            m.full_name as member_name, m.rank
        FROM member_contributions mc
        JOIN members m ON mc.member_id = m.id
    `;
    let params = [];
    
    if (woche) {
        query += ' WHERE mc.woche = ?';
        params.push(woche);
    }
    
    query += ' ORDER BY mc.woche DESC, m.full_name';
    
    db.query(query, params, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Beitrag für alle Mitglieder festlegen
app.post('/api/treasury/contributions/set', requireLogin, (req, res) => {
    const { period_type, period_start, period_end, period_description, required_amount, due_date, notes } = req.body;
    
    if (!period_type || !period_start || !period_end || !required_amount) {
        return res.status(400).json({ error: 'Typ, Start-/Enddatum und Betrag sind erforderlich' });
    }
    
    // Alle aktiven Mitglieder abrufen
    db.query('SELECT id FROM members WHERE is_active = TRUE', (err, memberResults) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (memberResults.length === 0) {
            return res.status(400).json({ error: 'Keine aktiven Mitglieder gefunden' });
        }
        
        // Beiträge für alle Mitglieder erstellen
        const insertPromises = memberResults.map(member => {
            return new Promise((resolve, reject) => {
                const insertQuery = `
                    INSERT INTO member_contributions 
                    (member_id, period_type, period_start, period_end, period_description, required_amount_usd, due_date, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                    required_amount_usd = VALUES(required_amount_usd),
                    due_date = VALUES(due_date),
                    notes = VALUES(notes),
                    updated_at = CURRENT_TIMESTAMP
                `;
                
                db.query(insertQuery, [
                    member.id, period_type, period_start, period_end, period_description, required_amount, due_date, notes
                ], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        });
        
        Promise.all(insertPromises)
            .then(() => {
                // Log activity
                const logQuery = 'INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)';
                db.query(logQuery, [
                    req.session.userId, 
                    'treasury_contribution_set', 
                    `Beiträge für ${period_description || period_type} festgelegt: $${required_amount}`
                ]);
                
                res.json({ 
                    success: true, 
                    message: `Beiträge für ${memberResults.length} Mitglieder festgelegt` 
                });
            })
            .catch(err => {
                res.status(500).json({ error: err.message });
            });
    });
});

// Beitrag als bezahlt markieren
app.post('/api/treasury/contributions/mark-paid', requireLogin, (req, res) => {
    const { contribution_id, paid_amount, notes } = req.body;

    if (!contribution_id || paid_amount === undefined || paid_amount === null) {
        return res.status(400).json({ error: 'Beitrags-ID und Betrag sind erforderlich' });
    }

    db.query('SELECT * FROM member_contributions WHERE id = ?', [contribution_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        if (rows.length === 0) return res.status(404).json({ error: 'Beitrag nicht gefunden' });

        const contribution = rows[0];

        if (contribution.locked) {
            return res.status(403).json({ error: 'Dieser Zeitraum ist gesperrt. Beiträge können nicht mehr nachträglich verbucht werden.' });
        }

        if (contribution.status === 'bezahlt') {
            return res.status(400).json({ error: 'Dieser Beitrag wurde bereits vollständig bezahlt.' });
        }

        const amount = parseFloat(paid_amount);
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Betrag muss größer als 0 sein' });
        }

        const currentIst = parseFloat(contribution.ist_betrag) || 0;
        const soll = parseFloat(contribution.soll_betrag);
        const newIst = currentIst + amount;
        const newStatus = newIst >= soll ? 'bezahlt' : 'teilweise';
        const bezahltAmClause = newStatus === 'bezahlt' ? 'bezahlt_am = NOW(),' : '';

        db.getConnection((err, connection) => {
            if (err) return res.status(500).json({ error: err.message });

            connection.beginTransaction(err => {
                if (err) { connection.release(); return res.status(500).json({ error: err.message }); }

                connection.query(
                    `UPDATE member_contributions SET ist_betrag = ?, status = ?, ${bezahltAmClause} notes = CASE WHEN ? IS NOT NULL THEN ? ELSE notes END WHERE id = ?`,
                    [newIst, newStatus, notes || null, notes || null, contribution_id],
                    (err) => {
                        if (err) return connection.rollback(() => { connection.release(); res.status(500).json({ error: err.message }); });

                        const desc = `Beitrag ${contribution.woche}: ${newStatus === 'bezahlt' ? 'vollständig bezahlt' : 'Teilzahlung ($' + amount.toFixed(2) + ')'}`;
                        connection.query(
                            `INSERT INTO gang_transactions (member_id, type, amount, description, recorded_by) VALUES (?, 'beitrag', ?, ?, ?)`,
                            [contribution.member_id, amount, desc, req.session.userId],
                            (err) => {
                                if (err) return connection.rollback(() => { connection.release(); res.status(500).json({ error: err.message }); });

                                connection.query(
                                    'UPDATE gang_treasury SET current_balance = current_balance + ?, contributions_balance = contributions_balance + ?, last_updated = NOW() LIMIT 1',
                                    [amount, amount],
                                    (err) => {
                                        if (err) return connection.rollback(() => { connection.release(); res.status(500).json({ error: err.message }); });

                                        connection.commit(err => {
                                            if (err) return connection.rollback(() => { connection.release(); res.status(500).json({ error: err.message }); });
                                            connection.release();

                                            db.query(
                                                'INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                                                [req.session.userId, 'treasury_contribution_paid', `Beitrag $${amount} für Mitglied ${contribution.member_id} verbucht`]
                                            );

                                            res.json({ success: true, new_status: newStatus, new_ist_betrag: newIst });
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            });
        });
    });
});

// Treasury Statistiken
app.get('/api/treasury/stats', requireLogin, (req, res) => {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    // Balance
    const balanceQuery = 'SELECT current_balance, contributions_balance, goals_balance FROM gang_treasury LIMIT 1';
    
    // Monatliche Ein-/Auszahlungen
    const monthlyQuery = `
        SELECT 
            SUM(CASE WHEN type IN ('einzahlung', 'beitrag', 'ziel_einzahlung') THEN amount ELSE 0 END) as deposits,
            SUM(CASE WHEN type = 'auszahlung' THEN amount ELSE 0 END) as withdrawals
        FROM gang_transactions 
        WHERE MONTH(transaction_date) = ? AND YEAR(transaction_date) = ?
    `;
    
    // Aktuelle Beitragsstatus
    const contributionsQuery = `
        SELECT 
            COUNT(CASE WHEN status = 'bezahlt' THEN 1 END) as paid_count,
            COUNT(*) as total_count
        FROM member_contributions 
        WHERE woche_start <= CURDATE() AND woche_ende >= CURDATE()
    `;
    
    // Aktive Ziele
    const goalsQuery = `SELECT COUNT(*) as active_goals FROM treasury_goals WHERE status = 'aktiv'`;
    
    Promise.all([
        new Promise((resolve, reject) => {
            db.query(balanceQuery, (err, results) => {
                if (err) reject(err);
                else resolve(results.length > 0 ? results[0] : { current_balance: 0, contributions_balance: 0, goals_balance: 0 });
            });
        }),
        new Promise((resolve, reject) => {
            db.query(monthlyQuery, [currentMonth, currentYear], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        }),
        new Promise((resolve, reject) => {
            db.query(contributionsQuery, (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        }),
        new Promise((resolve, reject) => {
            db.query(goalsQuery, (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        })
    ]).then(([balance, monthly, contributions, goals]) => {
        res.json({
            balance: balance.current_balance || 0,
            contributions_balance: balance.contributions_balance || 0,
            goals_balance: balance.goals_balance || 0,
            monthly_deposits: monthly.deposits || 0,
            monthly_withdrawals: monthly.withdrawals || 0,
            paid_members: `${contributions.paid_count || 0}/${contributions.total_count || 0}`,
            active_goals: goals.active_goals || 0
        });
    }).catch(err => {
        res.status(500).json({ error: err.message });
    });
});

// Beitrag löschen
app.delete('/api/treasury/contributions/:id', requireLogin, (req, res) => {
    const contributionId = req.params.id;
    
    if (!contributionId) {
        return res.status(400).json({ error: 'Beitrags-ID ist erforderlich' });
    }
    
    // Prüfe ob Beitrag existiert
    db.query(
        'SELECT * FROM member_contributions WHERE id = ?',
        [contributionId],
        (err, results) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (results.length === 0) {
                return res.status(404).json({ error: 'Beitrag nicht gefunden' });
            }
            
            const contribution = results[0];
            
            // Lösche den Beitrag (auch wenn bereits bezahlt)
            db.query(
                'DELETE FROM member_contributions WHERE id = ?',
                [contributionId],
                (err, deleteResult) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    
                    if (deleteResult.affectedRows === 0) {
                        return res.status(404).json({ error: 'Beitrag konnte nicht gelöscht werden' });
                    }
                    
                    // Log activity
                    const logQuery = 'INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)';
                    db.query(logQuery, [
                        req.session.userId, 
                        'treasury_contribution_deleted', 
                        `Beitrag gelöscht: ${contribution.woche} für Mitglied ${contribution.member_id} (Betrag: $${contribution.ist_betrag || 0})`
                    ]);
                    
                    res.json({ 
                        success: true,
                        message: 'Beitrag erfolgreich gelöscht'
                    });
                }
            );
        }
    );
});

// ========== ZIELE (GOALS) ENDPOINTS ==========

// Alle Ziele abrufen
app.get('/api/treasury/goals', requireLogin, (req, res) => {
    const query = `
        SELECT g.*, m.full_name as erstellt_von_name
        FROM treasury_goals g
        LEFT JOIN members m ON g.erstellt_von = m.id
        ORDER BY 
            CASE WHEN g.status = 'aktiv' THEN 1 ELSE 2 END,
            g.erstellt_am DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Neues Ziel erstellen
app.post('/api/treasury/goals', requireLogin, (req, res) => {
    const { titel, beschreibung, ziel_betrag, deadline } = req.body;
    
    if (!titel || !ziel_betrag) {
        return res.status(400).json({ error: 'Titel und Zielbetrag sind erforderlich' });
    }
    
    const query = `
        INSERT INTO treasury_goals (titel, beschreibung, ziel_betrag, deadline, erstellt_von)
        VALUES (?, ?, ?, ?, ?)
    `;
    
    db.query(query, [titel, beschreibung, ziel_betrag, deadline || null, req.session.userId], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Log activity
        db.query(
            'INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
            [req.session.userId, 'goal_created', `Neues Ziel erstellt: ${titel} ($${ziel_betrag})`]
        );
        
        res.json({ success: true, id: result.insertId });
    });
});

// In Ziel einzahlen
app.post('/api/treasury/goals/contribute', requireLogin, (req, res) => {
    const { goal_id, member_id, amount, kommentar } = req.body;
    
    if (!goal_id || !member_id || !amount) {
        return res.status(400).json({ error: 'Ziel, Mitglied und Betrag sind erforderlich' });
    }
    
    // Einzahlung in goal_contributions speichern
    const insertQuery = `
        INSERT INTO goal_contributions (goal_id, member_id, amount, kommentar)
        VALUES (?, ?, ?, ?)
    `;
    
    db.query(insertQuery, [goal_id, member_id, amount, kommentar], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Ziel-Betrag aktualisieren
        db.query(
            'UPDATE treasury_goals SET aktueller_betrag = aktueller_betrag + ? WHERE id = ?',
            [amount, goal_id],
            (err2) => {
                if (err2) {
                    return res.status(500).json({ error: err2.message });
                }
                
                // Kassenbuch-Eintrag
                db.query(
                    `INSERT INTO gang_transactions (member_id, type, amount, description, ziel_id, recorded_by)
                     VALUES (?, 'ziel_einzahlung', ?, ?, ?, ?)`,
                    [member_id, amount, `Einzahlung in Ziel #${goal_id}`, goal_id, req.session.userId]
                );
                
                // Zielkasse aktualisieren
                db.query('UPDATE gang_treasury SET current_balance = current_balance + ?, goals_balance = goals_balance + ?', [amount, amount]);
                
                res.json({ success: true });
            }
        );
    });
});

// Ziel als erreicht markieren
app.put('/api/treasury/goals/:id/complete', requireLogin, (req, res) => {
    const goalId = req.params.id;
    
    db.query(
        `UPDATE treasury_goals SET status = 'erreicht', abgeschlossen_am = CURRENT_TIMESTAMP WHERE id = ?`,
        [goalId],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true });
        }
    );
});

// Ziel abbrechen
app.put('/api/treasury/goals/:id/cancel', requireLogin, (req, res) => {
    const goalId = req.params.id;
    
    db.query(
        `UPDATE treasury_goals SET status = 'abgebrochen', abgeschlossen_am = CURRENT_TIMESTAMP WHERE id = ?`,
        [goalId],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true });
        }
    );
});

// Einzahler für ein Ziel abrufen
app.get('/api/treasury/goals/:id/contributors', requireLogin, (req, res) => {
    const goalId = req.params.id;
    
    const query = `
        SELECT gc.*, m.full_name as member_name
        FROM goal_contributions gc
        JOIN members m ON gc.member_id = m.id
        WHERE gc.goal_id = ?
        ORDER BY gc.datum DESC
    `;
    
    db.query(query, [goalId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// ========== WÖCHENTLICHE BEITRÄGE ==========

// Wochenbeiträge für alle Mitglieder anlegen
app.post('/api/treasury/contributions/create-week', requireLogin, (req, res) => {
    const { woche, beitrag } = req.body; // Format: "KW07-2026"
    
    if (!woche) {
        return res.status(400).json({ error: 'Kalenderwoche ist erforderlich' });
    }
    
    // Woche parsen (z.B. "KW07-2026")
    const match = woche.match(/KW(\d+)-(\d+)/);
    if (!match) {
        return res.status(400).json({ error: 'Ungültiges Wochenformat' });
    }
    
    const weekNum = parseInt(match[1]);
    const year = parseInt(match[2]);
    
    // Wochenstart und -ende berechnen
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const weekStart = new Date(jan4);
    weekStart.setDate(jan4.getDate() - dayOfWeek + 1 + (weekNum - 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    const wocheStartStr = weekStart.toISOString().slice(0, 10);
    const wocheEndeStr = weekEnd.toISOString().slice(0, 10);
    
    // Beitrag aus Request verwenden oder Standard aus DB
    const beitragToUse = beitrag ? parseFloat(beitrag) : null;
    
    const getBeitrag = (callback) => {
        if (beitragToUse !== null) {
            callback(beitragToUse);
        } else {
            db.query('SELECT wochenbeitrag_standard FROM gang_treasury LIMIT 1', (err, result) => {
                callback(result?.[0]?.wochenbeitrag_standard || 50.00);
            });
        }
    };
    
    getBeitrag((standardBeitrag) => {
        // Alle aktiven Mitglieder abrufen
        db.query('SELECT id FROM members WHERE is_active = TRUE', (err, members) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (members.length === 0) {
                return res.status(400).json({ error: 'Keine aktiven Mitglieder gefunden' });
            }
            
            // Beiträge für alle Mitglieder erstellen
            const insertPromises = members.map(member => {
                return new Promise((resolve, reject) => {
                    const query = `
                        INSERT INTO member_contributions 
                        (member_id, woche, woche_start, woche_ende, soll_betrag, status)
                        VALUES (?, ?, ?, ?, ?, 'offen')
                        ON DUPLICATE KEY UPDATE soll_betrag = VALUES(soll_betrag)
                    `;
                    
                    db.query(query, [member.id, woche, wocheStartStr, wocheEndeStr, standardBeitrag], (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    });
                });
            });
            
            Promise.all(insertPromises)
                .then(() => {
                    res.json({ 
                        success: true, 
                        message: `${woche}: $${standardBeitrag.toFixed(2)} für ${members.length} Mitglieder angelegt` 
                    });
                })
                .catch(err => {
                    res.status(500).json({ error: err.message });
                });
        });
    });
});

// Beiträge für Zeitraum anlegen (Mit Datum von-bis)
app.post('/api/treasury/contributions/create-period', requireLogin, (req, res) => {
    const { start_datum, end_datum, beitrag } = req.body;
    
    if (!start_datum || !end_datum) {
        return res.status(400).json({ error: 'Start- und Enddatum sind erforderlich' });
    }
    
    const startDate = new Date(start_datum);
    const endDate = new Date(end_datum);
    
    if (startDate > endDate) {
        return res.status(400).json({ error: 'Startdatum muss vor Enddatum liegen' });
    }
    
    const standardBeitrag = beitrag ? parseFloat(beitrag) : 50.00;
    
    // Alle aktiven Mitglieder abrufen
    db.query('SELECT id FROM members WHERE is_active = TRUE', (err, members) => {
        if (err) return res.status(500).json({ error: err.message });
        if (members.length === 0) return res.status(400).json({ error: 'Keine aktiven Mitglieder gefunden' });
        
        const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
        const startStr = startDate.toLocaleDateString('de-DE', options);
        const endStr = endDate.toLocaleDateString('de-DE', options);
        const periodeDesc = `${startStr} - ${endStr}`;
        
        // 1. Vorherige (aktuell unlocked) Periode sperren
        db.query(
            'UPDATE member_contributions SET locked = 1 WHERE locked = 0 AND woche_ende < ?',
            [start_datum],
            (lockErr) => {
                if (lockErr) console.error('Lock-Fehler:', lockErr);
                
                // 2. Ausstehende Beträge der gesperrten Periode je Mitglied ermitteln
                db.query(
                    `SELECT member_id, SUM(soll_betrag - COALESCE(ist_betrag, 0)) AS offen
                     FROM member_contributions
                     WHERE locked = 1 AND status != 'bezahlt' AND woche_ende < ?
                     GROUP BY member_id`,
                    [start_datum],
                    (carryErr, carryRows) => {
                        if (carryErr) console.error('Carryover-Fehler:', carryErr);
                        
                        const carryMap = {};
                        (carryRows || []).forEach(r => {
                            const offen = parseFloat(r.offen);
                            if (offen > 0) carryMap[r.member_id] = offen;
                        });
                        
                        // 3. Neue Periodeneinträge für alle Mitglieder erstellen
                        const insertPromises = members.map(member => {
                            const uebertrag = carryMap[member.id] || 0;
                            const sollBetrag = standardBeitrag + uebertrag;
                            
                            return new Promise((resolve, reject) => {
                                db.query(
                                    `INSERT INTO member_contributions 
                                     (member_id, woche, woche_start, woche_ende, soll_betrag, uebertrag_betrag, status)
                                     VALUES (?, ?, ?, ?, ?, ?, 'offen')
                                     ON DUPLICATE KEY UPDATE 
                                     soll_betrag = VALUES(soll_betrag),
                                     uebertrag_betrag = VALUES(uebertrag_betrag)`,
                                    [member.id, periodeDesc, start_datum, end_datum, sollBetrag, uebertrag],
                                    (err, result) => { if (err) reject(err); else resolve(result); }
                                );
                            });
                        });
                        
                        Promise.all(insertPromises)
                            .then(() => {
                                const carryoverCount = Object.keys(carryMap).length;
                                
                                db.query(
                                    'INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
                                    [req.session.userId, 'treasury_period_created',
                                     `Zeitraum ${periodeDesc}: $${standardBeitrag.toFixed(2)} für ${members.length} Mitglieder`
                                     + (carryoverCount > 0 ? ` (${carryoverCount} Mitglieder mit Übertrag)` : '')]
                                );
                                
                                res.json({
                                    success: true,
                                    message: `Zeitraum ${periodeDesc}: $${standardBeitrag.toFixed(2)} für ${members.length} Mitglieder angelegt`
                                        + (carryoverCount > 0 ? `. ${carryoverCount} Mitglieder haben ausstehende Beträge übertragen bekommen.` : '')
                                });
                            })
                            .catch(err => res.status(500).json({ error: err.message }));
                    }
                );
            }
        );
    });
});

// Server starten
app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
});
