const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Uploads-Ordner erstellen falls nicht vorhanden
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Multer-Konfiguration für Datei-Uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Nur Bilder erlaubt (JPG, PNG, GIF)'));
        }
    }
});

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

app.use(express.json());
app.use(express.static('.'));
app.use('/uploads', express.static('uploads')); // Statische Dateien für Uploads
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
            req.session.canManageHero = user.can_manage_hero;
            req.session.canManageFence = user.can_manage_fence;
            req.session.canViewActivity = user.can_view_activity;

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
                    profile_photo: user.profile_photo,
                    can_add_members: user.can_add_members,
                    can_manage_hero: user.can_manage_hero,
                    can_manage_fence: user.can_manage_fence,
                    can_view_activity: user.can_view_activity
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
        db.query('SELECT id, username, full_name, rank, can_add_members, can_manage_hero, can_manage_fence FROM members WHERE id = ?', 
            [req.session.userId], (err, results) => {
            if (err || results.length === 0) {
                return res.json({ logged_in: false });
            }
            res.json({ logged_in: true, user: results[0] });
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
            db.query('SELECT COALESCE(SUM(total_price), 0) as total FROM fence_purchases WHERE DATE(purchase_date) = CURDATE()', (err, results) => {
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
            (SELECT COALESCE(SUM(total_price), 0) FROM fence_purchases WHERE DATE(purchase_date) = CURDATE()) as fence_purchases_today,
            (SELECT COALESCE(SUM(total_value), 0) FROM warehouse) as warehouse_value
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results[0]);
    });
});

// ========== MITGLIEDER ==========

app.get('/api/members', requireLogin, (req, res) => {
    db.query('SELECT id, username, full_name, rank, phone, joined_date, last_login, is_active, is_password_set FROM members ORDER BY rank, full_name', 
        (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
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
app.post('/api/members/add', requireLogin, upload.single('profile_photo'), (req, res) => {
    // Prüfe Berechtigung
    if (!req.session.canAddMembers) {
        return res.status(403).json({ error: 'Keine Berechtigung zum Hinzufügen von Mitgliedern' });
    }
    
    const { username, full_name, rank, phone, can_add_members, can_manage_hero, can_manage_fence, can_view_activity } = req.body;
    const profile_photo = req.file ? `/uploads/${req.file.filename}` : null;
    
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
        const query = 'INSERT INTO members (username, password, full_name, rank, phone, profile_photo, can_add_members, can_manage_hero, can_manage_fence, can_view_activity, invitation_token, is_password_set, token_expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, ?)';
        
        db.query(query, [username, tempPassword, full_name, rank, phone || null, profile_photo, can_add_members === 'true' || false, can_manage_hero === 'true' || false, can_manage_fence === 'true' || false, can_view_activity === 'true' || false, token, tokenExpires], (err, result) => {
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
app.put('/api/members/:id/edit', requireLogin, upload.single('profile_photo'), (req, res) => {
    // Prüfe Berechtigung
    if (!req.session.canAddMembers) {
        return res.status(403).json({ error: 'Keine Berechtigung zum Bearbeiten von Mitgliedern' });
    }
    
    const { id } = req.params;
    const { full_name, rank, phone, can_add_members, can_manage_hero, can_manage_fence, can_view_activity, is_active } = req.body;
    
    // Wenn neues Foto hochgeladen wurde
    let query, params;
    if (req.file) {
        const profile_photo = `/uploads/${req.file.filename}`;
        query = 'UPDATE members SET full_name = ?, rank = ?, phone = ?, profile_photo = ?, can_add_members = ?, can_manage_hero = ?, can_manage_fence = ?, can_view_activity = ?, is_active = ? WHERE id = ?';
        params = [full_name, rank, phone, profile_photo, can_add_members === 'true', can_manage_hero === 'true', can_manage_fence === 'true', can_view_activity === 'true', is_active === 'true', id];
    } else {
        query = 'UPDATE members SET full_name = ?, rank = ?, phone = ?, can_add_members = ?, can_manage_hero = ?, can_manage_fence = ?, can_view_activity = ?, is_active = ? WHERE id = ?';
        params = [full_name, rank, phone, can_add_members === 'true', can_manage_hero === 'true', can_manage_fence === 'true', can_view_activity === 'true', is_active === 'true', id];
    }
    
    db.query(query, params, (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Log
        db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
            [req.session.userId, 'member_edited', `Mitglied ${full_name} wurde bearbeitet`]);
        
        res.json({ success: true, message: 'Mitglied aktualisiert' });
    });
});

// Mitglied löschen
app.delete('/api/members/:id', requireLogin, (req, res) => {
    // Prüfe Berechtigung
    if (!req.session.canAddMembers) {
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

// Passwort anzeigen (nur für Boss/Admin)
app.get('/api/members/:id/password', requireLogin, (req, res) => {
    // Nur Boss darf Passwörter sehen
    if (req.session.rank !== 'Boss') {
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
    const { item_name, quantity, unit_price, seller_info, stored_in_warehouse, notes } = req.body;
    const total_price = quantity * unit_price;
    
    db.query(
        'INSERT INTO fence_purchases (member_id, item_name, quantity, unit_price, total_price, seller_info, stored_in_warehouse, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [req.session.userId, item_name, quantity, unit_price, total_price, seller_info || null, stored_in_warehouse || false, notes || null],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Wenn ins Lager, auch dort eintragen
            if (stored_in_warehouse) {
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
    const { item_name, category, typical_price } = req.body;
    
    db.query(
        'INSERT INTO fence_item_templates (item_name, category, typical_price) VALUES (?, ?, ?)',
        [item_name, category, typical_price],
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
        
        // Wenn es eine Gang ist, prüfe ob Personen zugeordnet sind
        if (category === 'Gang') {
            db.query('SELECT COUNT(*) as count FROM intelligence WHERE gang_id = ?', [id], (err, countResults) => {
                if (err) {
                    console.error('Count error:', err);
                    return res.status(500).json({ error: err.message });
                }
                
                if (countResults[0].count > 0) {
                    return res.status(400).json({ 
                        error: `Gang kann nicht gelöscht werden. ${countResults[0].count} Person(en) sind dieser Gang zugeordnet. Bitte zuerst die Personen löschen oder einer anderen Gang zuordnen.` 
                    });
                }
                
                // Keine Personen zugeordnet, Gang kann gelöscht werden
                deleteIntelligence(id, title, req, res);
            });
        } else {
            // Personen können direkt gelöscht werden
            deleteIntelligence(id, title, req, res);
        }
    });
});

function deleteIntelligence(id, title, req, res) {
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
        db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
            [req.session.userId, 'intelligence', `Intel gelöscht: ${title}`]);
        
        res.json({ success: true, message: 'Information gelöscht' });
    });
}

// Server starten
app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
});
