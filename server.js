// ============================================================
// BST Gang Management System v2.0 – server.js
// ============================================================
const express = require('express');
const mysql   = require('mysql2');
const session = require('express-session');
const path    = require('path');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
require('dotenv').config();

const app  = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────
app.use((req, res, next) => {
    try { decodeURIComponent(req.path); next(); } catch { res.status(400).end(); }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('.'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'bst-secret-fallback-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, secure: false, sameSite: 'lax' }
}));

// ── CORS ───────────────────────────────────────────────────
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ── Datenbank ──────────────────────────────────────────────
const db = mysql.createPool({
    host:             process.env.DB_HOST     || 'localhost',
    user:             process.env.DB_USER     || 'root',
    password:         process.env.DB_PASSWORD || '',
    database:         process.env.DB_NAME     || 'gang_management',
    port:             process.env.DB_PORT     || 3306,
    waitForConnections: true,
    connectionLimit:  10,
    queueLimit:       0
});

db.getConnection((err, conn) => {
    if (err) { console.error('DB-Verbindung fehlgeschlagen:', err.message); return; }
    console.log('✓ MySQL verbunden');

    // Migrations: fehlende Spalten sicher hinzufügen
    const safeAddCol = (table, col, def) => {
        conn.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${def}`, () => {});
    };
    safeAddCol('members',           'can_view_storage_password', 'BOOLEAN DEFAULT FALSE');
    safeAddCol('rank_permissions',  'can_view_storage_password', 'BOOLEAN DEFAULT FALSE');
    safeAddCol('member_contributions', 'locked',           'TINYINT(1) NOT NULL DEFAULT 0');
    safeAddCol('member_contributions', 'uebertrag_betrag', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
    safeAddCol('member_contributions', 'notes',            'TEXT');
    safeAddCol('storage_slots',     'aufgabe',             'VARCHAR(200)');
    safeAddCol('gang_transactions',  'notes',              'TEXT');
    safeAddCol('fence_item_templates', 'sale_price',       'DECIMAL(10,2) DEFAULT 0');

    // Dealer-Karte Tabelle erstellen falls nicht vorhanden
    conn.query(`CREATE TABLE IF NOT EXISTS dealer_spots (
        id                 INT AUTO_INCREMENT PRIMARY KEY,
        name               VARCHAR(100) NOT NULL,
        description        TEXT,
        x_pos              DECIMAL(6,3) NOT NULL,
        y_pos              DECIMAL(6,3) NOT NULL,
        color              VARCHAR(20) DEFAULT '#ef4444',
        category           VARCHAR(20) DEFAULT 'dealer',
        assigned_member_id INT NULL,
        created_by         INT NULL,
        created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        // Add category column if not exists (migration for existing DBs)
        conn.query(`ALTER TABLE dealer_spots ADD COLUMN IF NOT EXISTS category VARCHAR(20) DEFAULT 'dealer'`, () => {});
    });

    // Hero Inventory: Sicherstellen dass ein Eintrag existiert
    conn.query('SELECT COUNT(*) as c FROM hero_inventory', (e, r) => {
        if (!e && r[0].c === 0) {
            conn.query('INSERT INTO hero_inventory (quantity, unit_cost, sale_price, gang_percentage) VALUES (0, 150, 250, 60)');
        }
    });

    conn.release();
});

// ── Hilfsfunktionen ────────────────────────────────────────

// Berechtigungen aus DB-User-Objekt extrahieren (einheitlich, keine Techniker-Sonderrolle)
function extractPerms(u) {
    return {
        can_add_members:           !!u.can_add_members,
        can_view_fence:            !!u.can_view_fence,
        can_manage_fence:          !!u.can_manage_fence,
        can_view_recipes:          !!u.can_view_recipes,
        can_manage_recipes:        !!u.can_manage_recipes,
        can_view_storage:          !!u.can_view_storage,
        can_manage_storage:        !!u.can_manage_storage,
        can_view_storage_password: !!u.can_view_storage_password,
        can_view_treasury:         !!u.can_view_treasury,
        can_manage_treasury:       !!u.can_manage_treasury,
        can_view_activity:         !!u.can_view_activity,
        can_view_stats:            !!u.can_view_stats,
        can_manage_system:         !!u.can_manage_system
    };
}

function requireLogin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Nicht eingeloggt' });
    next();
}

function requirePerm(perm) {
    return (req, res, next) => {
        if (!req.session[perm]) return res.status(403).json({ error: 'Keine Berechtigung' });
        next();
    };
}

function logActivity(memberId, actionType, description) {
    db.query('INSERT INTO activity_log (member_id, action_type, description) VALUES (?, ?, ?)',
        [memberId, actionType, description], () => {});
}

// ══════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });

    db.query(
        `SELECT id, username, full_name, \`rank\`, password, is_active, is_password_set,
                can_add_members, can_view_fence, can_manage_fence, can_view_recipes, can_manage_recipes,
                can_view_storage, can_manage_storage, can_view_storage_password,
                can_view_treasury, can_manage_treasury, can_view_activity, can_view_stats, can_manage_system
         FROM members WHERE username = ? AND is_active = TRUE`,
        [username],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });

            const u = rows[0];
            if (!bcrypt.compareSync(password, u.password)) {
                return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
            }

            const perms = extractPerms(u);
            req.session.userId   = u.id;
            req.session.username = u.username;
            req.session.rank     = u.rank;
            Object.assign(req.session, perms);

            db.query('UPDATE members SET last_login = NOW() WHERE id = ?', [u.id]);
            logActivity(u.id, 'login', `${u.full_name} hat sich eingeloggt`);

            res.json({
                success: true,
                user: {
                    id: u.id, username: u.username, full_name: u.full_name, rank: u.rank,
                    is_password_set: u.is_password_set,
                    ...perms
                }
            });
        }
    );
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/auth/session', (req, res) => {
    if (!req.session.userId) return res.json({ logged_in: false });

    db.query(
        `SELECT id, username, full_name, \`rank\`, is_password_set,
                can_add_members, can_view_fence, can_manage_fence, can_view_recipes, can_manage_recipes,
                can_view_storage, can_manage_storage, can_view_storage_password,
                can_view_treasury, can_manage_treasury, can_view_activity, can_view_stats, can_manage_system
         FROM members WHERE id = ? AND is_active = TRUE`,
        [req.session.userId],
        (err, rows) => {
            if (err || !rows.length) return res.json({ logged_in: false });
            const u     = rows[0];
            const perms = extractPerms(u);
            Object.assign(req.session, perms);
            res.json({ logged_in: true, user: { id: u.id, username: u.username, full_name: u.full_name, rank: u.rank, is_password_set: u.is_password_set, ...perms } });
        }
    );
});

app.post('/api/auth/clear-session', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

// ══════════════════════════════════════════════════════════
// DASHBOARD STATS
// ══════════════════════════════════════════════════════════

app.get('/api/stats/dashboard', requireLogin, (req, res) => {
    const stats = { total_members: 0, hero_stock: 0, fence_pending: 0, warehouse_value: 0 };
    Promise.all([
        new Promise(r => db.query('SELECT COUNT(*) c FROM members WHERE is_active=TRUE',          (e,d) => { if (!e) stats.total_members  = d[0].c; r(); })),
        new Promise(r => db.query('SELECT quantity FROM hero_inventory LIMIT 1',                  (e,d) => { if (!e && d.length) stats.hero_stock = d[0].quantity; r(); })),
        new Promise(r => db.query('SELECT COALESCE(SUM(total_price),0) t FROM fence_purchases WHERE DATE(purchase_date)=CURDATE()', (e,d) => { if (!e) stats.fence_pending = d[0].t; r(); })),
        new Promise(r => db.query('SELECT COALESCE(SUM(quantity*unit_value),0) t FROM warehouse', (e,d) => { if (!e) stats.warehouse_value = d[0].t; r(); }))
    ]).then(() => res.json(stats));
});

app.get('/api/stats/overview-notes', requireLogin, (req, res) => {
    db.query('SELECT stat_value notes FROM gang_stats WHERE stat_key="overview_notes"', (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ notes: r.length ? r[0].notes : '' });
    });
});

app.post('/api/stats/overview-notes', requireLogin, (req, res) => {
    const { notes } = req.body;
    db.query('INSERT INTO gang_stats (stat_key, stat_value) VALUES ("overview_notes",?) ON DUPLICATE KEY UPDATE stat_value=VALUES(stat_value)', [notes], e => {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true });
    });
});

// ══════════════════════════════════════════════════════════
// MITGLIEDER
// ══════════════════════════════════════════════════════════

const MEMBER_COLS = `id, username, full_name, \`rank\`, phone, joined_date, last_login, is_active, is_password_set,
    COALESCE(can_add_members,FALSE) can_add_members,
    COALESCE(can_view_fence,FALSE) can_view_fence,
    COALESCE(can_manage_fence,FALSE) can_manage_fence,
    COALESCE(can_view_recipes,FALSE) can_view_recipes,
    COALESCE(can_manage_recipes,FALSE) can_manage_recipes,
    COALESCE(can_view_storage,FALSE) can_view_storage,
    COALESCE(can_manage_storage,FALSE) can_manage_storage,
    COALESCE(can_view_storage_password,FALSE) can_view_storage_password,
    COALESCE(can_view_treasury,FALSE) can_view_treasury,
    COALESCE(can_manage_treasury,FALSE) can_manage_treasury,
    COALESCE(can_view_activity,FALSE) can_view_activity,
    COALESCE(can_view_stats,FALSE) can_view_stats,
    COALESCE(can_manage_system,FALSE) can_manage_system`;

app.get('/api/members', requireLogin, (req, res) => {
    db.query(
        `SELECT ${MEMBER_COLS} FROM members ORDER BY FIELD(\`rank\`,'Techniker','OG','2OG','Member','Soldat','Runner'), full_name`,
        (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json(r); }
    );
});

app.get('/api/members/:id', requireLogin, (req, res) => {
    db.query(`SELECT ${MEMBER_COLS} FROM members WHERE id=?`, [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        res.json(r[0]);
    });
});

app.post('/api/members/add', requireLogin, requirePerm('can_add_members'), (req, res) => {
    const {
        username, full_name, rank, phone,
        can_add_members, can_view_fence, can_manage_fence, can_view_recipes, can_manage_recipes,
        can_view_storage, can_manage_storage, can_view_storage_password,
        can_view_treasury, can_manage_treasury, can_view_activity, can_view_stats, can_manage_system
    } = req.body;

    if (!username || !full_name || !rank) return res.status(400).json({ error: 'Name, Benutzername und Rang erforderlich' });

    db.query('SELECT id FROM members WHERE username=?', [username], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (r.length) return res.status(400).json({ error: 'Benutzername bereits vergeben' });

        const token       = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        db.query(
            `INSERT INTO members
             (username, password, full_name, \`rank\`, phone,
              can_add_members, can_view_fence, can_manage_fence, can_view_recipes, can_manage_recipes,
              can_view_storage, can_manage_storage, can_view_storage_password,
              can_view_treasury, can_manage_treasury, can_view_activity, can_view_stats, can_manage_system,
              invitation_token, is_password_set, token_expires)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,FALSE,?)`,
            [username, 'PENDING_SETUP', full_name, rank, phone || null,
             !!can_add_members, !!can_view_fence, !!can_manage_fence, !!can_view_recipes, !!can_manage_recipes,
             !!can_view_storage, !!can_manage_storage, !!can_view_storage_password,
             !!can_view_treasury, !!can_manage_treasury, !!can_view_activity, !!can_view_stats, !!can_manage_system,
             token, tokenExpiry],
            (e2, result) => {
                if (e2) return res.status(500).json({ error: e2.message });
                logActivity(req.session.userId, 'member_added', `${full_name} (${rank}) wurde hinzugefügt`);
                const inviteLink = `${req.protocol}://${req.get('host')}/setup.html?token=${token}`;
                res.json({ success: true, member_id: result.insertId, invite_link: inviteLink, token });
            }
        );
    });
});

app.put('/api/members/:id/edit', requireLogin, requirePerm('can_add_members'), (req, res) => {
    const { id } = req.params;
    const {
        full_name, rank, phone, is_active,
        can_add_members, can_view_fence, can_manage_fence, can_view_recipes, can_manage_recipes,
        can_view_storage, can_manage_storage, can_view_storage_password,
        can_view_treasury, can_manage_treasury, can_view_activity, can_view_stats, can_manage_system
    } = req.body;

    db.query(
        `UPDATE members SET full_name=?, \`rank\`=?, phone=?, is_active=?,
         can_add_members=?, can_view_fence=?, can_manage_fence=?, can_view_recipes=?, can_manage_recipes=?,
         can_view_storage=?, can_manage_storage=?, can_view_storage_password=?,
         can_view_treasury=?, can_manage_treasury=?, can_view_activity=?, can_view_stats=?, can_manage_system=?
         WHERE id=?`,
        [full_name, rank, phone || null, !!is_active,
         !!can_add_members, !!can_view_fence, !!can_manage_fence, !!can_view_recipes, !!can_manage_recipes,
         !!can_view_storage, !!can_manage_storage, !!can_view_storage_password,
         !!can_view_treasury, !!can_manage_treasury, !!can_view_activity, !!can_view_stats, !!can_manage_system,
         id],
        e => {
            if (e) return res.status(500).json({ error: e.message });
            logActivity(req.session.userId, 'member_edited', `Mitglied ${full_name} bearbeitet`);
            res.json({ success: true });
        }
    );
});

app.delete('/api/members/:id', requireLogin, requirePerm('can_add_members'), (req, res) => {
    const { id } = req.params;
    if (parseInt(id) === req.session.userId) return res.status(400).json({ error: 'Du kannst dich nicht selbst löschen' });

    db.query('SELECT full_name FROM members WHERE id=?', [id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Mitglied nicht gefunden' });
        const name = r[0].full_name;
        db.query('DELETE FROM members WHERE id=?', [id], e2 => {
            if (e2) return res.status(500).json({ error: e2.message });
            logActivity(req.session.userId, 'member_deleted', `${name} wurde entfernt`);
            res.json({ success: true });
        });
    });
});

app.post('/api/members/setup-password', (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token und Passwort erforderlich' });
    if (password.length < 6) return res.status(400).json({ error: 'Passwort mindestens 6 Zeichen' });

    db.query('SELECT * FROM members WHERE invitation_token=? AND is_password_set=FALSE', [token], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Ungültiger oder bereits verwendeter Token' });
        const m = r[0];
        if (m.token_expires && new Date(m.token_expires) < new Date())
            return res.status(400).json({ error: 'Einladungslink abgelaufen' });

        const hashed = bcrypt.hashSync(password, 10);
        db.query('UPDATE members SET password=?, is_password_set=TRUE, invitation_token=NULL, token_expires=NULL WHERE id=?',
            [hashed, m.id], e2 => {
                if (e2) return res.status(500).json({ error: e2.message });
                logActivity(m.id, 'password_setup', `${m.full_name} hat Passwort eingerichtet`);
                res.json({ success: true, username: m.username });
            });
    });
});

app.get('/api/members/validate-token/:token', (req, res) => {
    db.query('SELECT id, username, full_name, `rank`, token_expires FROM members WHERE invitation_token=? AND is_password_set=FALSE',
        [req.params.token], (e, r) => {
            if (e) return res.status(500).json({ error: e.message });
            if (!r.length) return res.status(404).json({ error: 'Ungültiger Token' });
            const m = r[0];
            if (m.token_expires && new Date(m.token_expires) < new Date())
                return res.status(400).json({ error: 'Token abgelaufen' });
            res.json({ valid: true, member: { username: m.username, full_name: m.full_name, rank: m.rank } });
        });
});

app.get('/api/members/:id/password', requireLogin, (req, res) => {
    if (!req.session.can_manage_system) return res.status(403).json({ error: 'Keine Berechtigung' });
    db.query('SELECT username, full_name, password, is_password_set FROM members WHERE id=?', [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Nicht gefunden' });
        res.json(r[0]);
    });
});

// ══════════════════════════════════════════════════════════
// HERO SYSTEM
// ══════════════════════════════════════════════════════════

app.get('/api/hero/inventory', requireLogin, (req, res) => {
    db.query('SELECT * FROM hero_inventory LIMIT 1', (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json(r[0] || { quantity: 0, unit_cost: 150, sale_price: 250, gang_percentage: 60 });
    });
});

app.put('/api/hero/inventory/settings', requireLogin, (req, res) => {
    const { sale_price, gang_percentage } = req.body;
    db.query('UPDATE hero_inventory SET sale_price=?, gang_percentage=? LIMIT 1', [sale_price, gang_percentage], e => {
        if (e) return res.status(500).json({ error: e.message });
        logActivity(req.session.userId, 'hero_settings', `Hero: Preis $${sale_price}, Gang-Anteil ${gang_percentage}%`);
        res.json({ success: true });
    });
});

app.put('/api/hero/inventory/set', requireLogin, (req, res) => {
    const { quantity } = req.body;
    db.query('SELECT id, quantity old_qty FROM hero_inventory LIMIT 1', (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) {
            db.query('INSERT INTO hero_inventory (quantity, unit_cost, sale_price, gang_percentage) VALUES (?,150,250,60)', [quantity], e2 => {
                if (e2) return res.status(500).json({ error: e2.message });
                logActivity(req.session.userId, 'hero_adjustment', `Bestand auf ${quantity} gesetzt`);
                res.json({ success: true });
            });
        } else {
            db.query('UPDATE hero_inventory SET quantity=? WHERE id=?', [quantity, r[0].id], e2 => {
                if (e2) return res.status(500).json({ error: e2.message });
                logActivity(req.session.userId, 'hero_adjustment', `Bestand von ${r[0].old_qty} auf ${quantity} geändert`);
                res.json({ success: true });
            });
        }
    });
});

app.post('/api/hero/inventory/restock', requireLogin, (req, res) => {
    const { quantity } = req.body;
    if (!quantity || quantity < 1) return res.status(400).json({ error: 'Ungültige Menge' });

    db.query('SELECT COALESCE(MAX(delivery_number),0)+1 next FROM hero_deliveries', (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        const deliveryNum = r[0].next;

        // Archivieren Distributions
        db.query(`INSERT INTO hero_distributions_archive
            (original_id,member_id,member_name,quantity,unit_cost,total_cost,distributed_date,status,notes,archived_by,delivery_number)
            SELECT d.id,d.member_id,m.full_name,d.quantity,d.unit_cost,d.total_cost,d.distributed_date,d.status,d.notes,?,?
            FROM hero_distributions d JOIN members m ON d.member_id=m.id`,
            [req.session.userId, deliveryNum - 1], () => {});

        // Archivieren Sales
        db.query(`INSERT INTO hero_sales_archive
            (original_id,member_id,member_name,quantity,unit_cost,sale_price,total_sale,gang_share,member_share,sale_date,archived_by,delivery_number)
            SELECT s.id,s.member_id,m.full_name,s.quantity,s.unit_cost,s.sale_price,s.total_sale,s.gang_share,s.member_share,s.sale_date,?,?
            FROM hero_sales s JOIN members m ON s.member_id=m.id`,
            [req.session.userId, deliveryNum - 1], () => {});

        db.query('DELETE FROM hero_distributions', () => {});
        db.query('DELETE FROM hero_sales', () => {});

        db.query('INSERT INTO hero_deliveries (delivery_number,quantity,received_by) VALUES (?,?,?)', [deliveryNum, quantity, req.session.userId], e2 => {
            if (e2) return res.status(500).json({ error: e2.message });
            db.query('UPDATE hero_inventory SET quantity=? LIMIT 1', [quantity], e3 => {
                if (e3) return res.status(500).json({ error: e3.message });
                logActivity(req.session.userId, 'hero_delivery', `Lieferung #${deliveryNum}: ${quantity} Hero`);
                res.json({ success: true, deliveryNumber: deliveryNum });
            });
        });
    });
});

app.get('/api/hero/distributions', requireLogin, (req, res) => {
    db.query(`SELECT d.*,m.full_name,m.username FROM hero_distributions d JOIN members m ON d.member_id=m.id ORDER BY d.distributed_date DESC`, (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json(r);
    });
});

app.post('/api/hero/distributions', requireLogin, (req, res) => {
    const { member_id, quantity } = req.body;
    db.query('SELECT * FROM hero_inventory LIMIT 1', (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        const inv = r[0];
        if (!inv || inv.quantity < quantity) return res.status(400).json({ error: 'Nicht genug Hero im Lager' });
        const total_cost = quantity * inv.unit_cost;
        const exp_sale   = quantity * inv.sale_price;
        const gang_share = exp_sale * (inv.gang_percentage / 100);
        db.query('INSERT INTO hero_distributions (member_id,quantity,unit_cost,total_cost,expected_sale_price,gang_share) VALUES (?,?,?,?,?,?)',
            [member_id, quantity, inv.unit_cost, total_cost, exp_sale, gang_share], (e2, res2) => {
                if (e2) return res.status(500).json({ error: e2.message });
                db.query('UPDATE hero_inventory SET quantity=quantity-? LIMIT 1', [quantity]);
                db.query('SELECT full_name FROM members WHERE id=?', [member_id], (e3, r3) => {
                    if (!e3 && r3.length) logActivity(req.session.userId, 'hero_distribution', `${quantity} Hero an ${r3[0].full_name} ausgegeben`);
                });
                res.json({ success: true, distribution_id: res2.insertId });
            });
    });
});

app.post('/api/hero/distributions/:id/payment', requireLogin, (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;
    db.query('SELECT * FROM hero_distributions WHERE id=?', [id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Nicht gefunden' });
        const d = r[0];
        const newPaid = parseFloat(d.paid_amount) + parseFloat(amount);
        const gangs   = parseFloat(d.gang_share);
        const status  = newPaid >= gangs ? 'paid' : newPaid > 0 ? 'partial' : 'outstanding';
        db.query('UPDATE hero_distributions SET paid_amount=?, status=? WHERE id=?', [newPaid, status, id], e2 => {
            if (e2) return res.status(500).json({ error: e2.message });
            logActivity(req.session.userId, 'hero_payment', `$${amount} Zahlung gebucht`);
            res.json({ success: true, new_paid_amount: newPaid, status });
        });
    });
});

app.get('/api/hero/payment-stats', requireLogin, (req, res) => {
    db.query(`SELECT COALESCE(SUM(gang_share),0) total_expected, COALESCE(SUM(paid_amount),0) paid,
              COALESCE(SUM(gang_share-paid_amount),0) outstanding FROM hero_distributions`, (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json(r[0]);
    });
});

app.get('/api/hero/sales', requireLogin, (req, res) => {
    db.query(`SELECT s.*,m.full_name FROM hero_sales s JOIN members m ON s.member_id=m.id ORDER BY s.sale_date DESC`, (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json(r);
    });
});

app.post('/api/hero/sales', requireLogin, (req, res) => {
    const { member_id, quantity } = req.body;
    db.query('SELECT * FROM hero_inventory LIMIT 1', (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        const inv = r[0];
        const total_sale  = quantity * inv.sale_price;
        const gang_share  = total_sale * (inv.gang_percentage / 100);
        const member_share= total_sale - gang_share;
        db.query('INSERT INTO hero_sales (member_id,quantity,unit_cost,sale_price,total_sale,gang_share,member_share) VALUES (?,?,?,?,?,?,?)',
            [member_id, quantity, inv.unit_cost, inv.sale_price, total_sale, gang_share, member_share], (e2, res2) => {
                if (e2) return res.status(500).json({ error: e2.message });
                db.query('SELECT full_name FROM members WHERE id=?', [member_id], (e3, r3) => {
                    if (!e3 && r3.length) logActivity(req.session.userId, 'hero_sale', `${r3[0].full_name} hat ${quantity} Hero verkauft – Gang: $${gang_share.toFixed(2)}`);
                });
                res.json({ success: true, sale: { total_sale, gang_share, member_share } });
            });
    });
});

app.put('/api/hero/sales/:id/mark-paid', requireLogin, (req, res) => {
    db.query('UPDATE hero_sales SET paid_to_gang=TRUE, payment_date=NOW() WHERE id=?', [req.params.id], e => {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true });
    });
});

app.get('/api/hero/deliveries', requireLogin, (req, res) => {
    db.query(`SELECT d.*,m.full_name received_by_name FROM hero_deliveries d LEFT JOIN members m ON d.received_by=m.id ORDER BY d.delivery_date DESC`, (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json(r);
    });
});

app.get('/api/hero/archive/distributions/:deliveryNumber?', requireLogin, (req, res) => {
    const dn = req.params.deliveryNumber;
    let q = `SELECT a.*,m.full_name FROM hero_distributions_archive a LEFT JOIN members m ON a.member_id=m.id`;
    const p = [];
    if (dn) { q += ' WHERE a.delivery_number=?'; p.push(dn); }
    q += ' ORDER BY a.distributed_date DESC';
    db.query(q, p, (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json(r); });
});

app.get('/api/hero/archive/sales/:deliveryNumber?', requireLogin, (req, res) => {
    const dn = req.params.deliveryNumber;
    let q = `SELECT a.*,m.full_name FROM hero_sales_archive a LEFT JOIN members m ON a.member_id=m.id`;
    const p = [];
    if (dn) { q += ' WHERE a.delivery_number=?'; p.push(dn); }
    q += ' ORDER BY a.sale_date DESC';
    db.query(q, p, (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json(r); });
});

app.get('/api/hero/archive/overview', requireLogin, (req, res) => {
    const q = `SELECT d.delivery_number, d.quantity delivery_quantity, d.delivery_date,
        m.full_name received_by_name,
        COUNT(DISTINCT da.id) total_distributions, COALESCE(SUM(da.quantity),0) total_distributed,
        COUNT(DISTINCT sa.id) total_sales, COALESCE(SUM(sa.total_sale),0) total_revenue,
        COALESCE(SUM(sa.gang_share),0) total_gang_share
        FROM hero_deliveries d
        LEFT JOIN members m ON d.received_by=m.id
        LEFT JOIN hero_distributions_archive da ON d.delivery_number=da.delivery_number+1
        LEFT JOIN hero_sales_archive sa ON d.delivery_number=sa.delivery_number+1
        GROUP BY d.delivery_number, d.quantity, d.delivery_date, m.full_name
        ORDER BY d.delivery_date DESC`;
    db.query(q, (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json(r); });
});

// ══════════════════════════════════════════════════════════
// HEHLER SYSTEM
// ══════════════════════════════════════════════════════════

// Zusammenfassung muss VOR :id Routen stehen
app.get('/api/fence/purchases/summary', requireLogin, (req, res) => {
    Promise.all([
        new Promise(resolve => db.query(
            'SELECT COUNT(*) total_purchases, COALESCE(SUM(total_price),0) total_spent, COALESCE(SUM(quantity),0) total_items FROM fence_purchases WHERE DATE(purchase_date)=CURDATE()',
            (e, r) => resolve(r[0]))),
        new Promise(resolve => db.query(
            'SELECT COALESCE(SUM(total_price),0) total_revenue, COALESCE(SUM(profit),0) total_profit FROM fence_sales WHERE DATE(sale_date)=CURDATE()',
            (e, r) => resolve(r[0])))
    ]).then(([p, s]) => res.json({ ...p, total_revenue: s.total_revenue, total_profit: s.total_profit }));
});

app.get('/api/fence/sales/summary', requireLogin, (req, res) => {
    db.query('SELECT COUNT(*) total_sales, COALESCE(SUM(total_price),0) total_revenue, COALESCE(SUM(profit),0) total_profit FROM fence_sales WHERE DATE(sale_date)=CURDATE()',
        (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json(r[0]); });
});

app.get('/api/fence/templates/all', requireLogin, (req, res) => {
    db.query('SELECT * FROM fence_item_templates ORDER BY category, item_name', (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json(r); });
});

app.get('/api/fence/templates', requireLogin, (req, res) => {
    db.query('SELECT * FROM fence_item_templates WHERE is_active=TRUE ORDER BY category, item_name', (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json(r); });
});

app.get('/api/fence/templates/:id', requireLogin, (req, res) => {
    db.query('SELECT * FROM fence_item_templates WHERE id=?', [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Produkt nicht gefunden' });
        res.json(r[0]);
    });
});

app.post('/api/fence/templates', requireLogin, requirePerm('can_manage_fence'), (req, res) => {
    const { item_name, category, typical_price, sale_price, is_active = true } = req.body;
    db.query('INSERT INTO fence_item_templates (item_name,category,typical_price,sale_price,is_active) VALUES (?,?,?,?,?)',
        [item_name, category, typical_price || 0, sale_price || 0, is_active], (e, r) => {
            if (e) return res.status(500).json({ error: e.message });
            res.json({ success: true, product_id: r.insertId });
        });
});

app.put('/api/fence/templates/:id', requireLogin, requirePerm('can_manage_fence'), (req, res) => {
    const { item_name, category, typical_price, sale_price, is_active } = req.body;
    db.query('UPDATE fence_item_templates SET item_name=?,category=?,typical_price=?,sale_price=?,is_active=? WHERE id=?',
        [item_name, category, typical_price, sale_price || 0, is_active, req.params.id], e => {
            if (e) return res.status(500).json({ error: e.message });
            res.json({ success: true });
        });
});

app.delete('/api/fence/templates/:id', requireLogin, requirePerm('can_manage_fence'), (req, res) => {
    db.query('DELETE FROM fence_item_templates WHERE id=?', [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.affectedRows) return res.status(404).json({ error: 'Produkt nicht gefunden' });
        res.json({ success: true });
    });
});

app.get('/api/fence/purchases', requireLogin, (req, res) => {
    db.query(`SELECT p.*,m.full_name FROM fence_purchases p LEFT JOIN members m ON p.member_id=m.id ORDER BY p.purchase_date DESC`, (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json(r);
    });
});

app.get('/api/fence/purchases/:id', requireLogin, (req, res) => {
    db.query('SELECT * FROM fence_purchases WHERE id=?', [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Nicht gefunden' });
        res.json(r[0]);
    });
});

app.post('/api/fence/purchases', requireLogin, requirePerm('can_manage_fence'), (req, res) => {
    const { item_name, quantity, unit_price, seller_info, stored_in_warehouse, notes } = req.body;
    const total_price = quantity * unit_price;

    db.query('INSERT INTO fence_purchases (member_id,item_name,quantity,unit_price,total_price,seller_info,stored_in_warehouse,notes) VALUES (?,?,?,?,?,?,?,?)',
        [req.session.userId, item_name, quantity, unit_price, total_price, seller_info || null, !!stored_in_warehouse, notes || null],
        (e, r) => {
            if (e) return res.status(500).json({ error: e.message });
            if (stored_in_warehouse) {
                db.query('SELECT id FROM warehouse WHERE item_name=? AND category="fence_goods" AND storage_location="UNSORTED" LIMIT 1',
                    [item_name], (e2, r2) => {
                        if (!e2 && r2.length) {
                            db.query('UPDATE warehouse SET quantity=quantity+? WHERE id=?', [quantity, r2[0].id]);
                        } else {
                            db.query('INSERT INTO warehouse (item_name,category,quantity,unit_value,storage_location) VALUES (?,?,?,?,"UNSORTED")',
                                [item_name, 'fence_goods', quantity, unit_price]);
                        }
                    });
            }
            logActivity(req.session.userId, 'fence_purchase', `Ankauf: ${quantity}x ${item_name} für $${total_price}`);
            res.json({ success: true, purchase_id: r.insertId, total_price });
        });
});

app.put('/api/fence/purchases/:id', requireLogin, requirePerm('can_manage_fence'), (req, res) => {
    const { item_name, quantity, unit_price, seller_info, stored_in_warehouse, notes } = req.body;
    const total_price = quantity * unit_price;
    db.query('UPDATE fence_purchases SET item_name=?,quantity=?,unit_price=?,total_price=?,seller_info=?,stored_in_warehouse=?,notes=? WHERE id=?',
        [item_name, quantity, unit_price, total_price, seller_info, !!stored_in_warehouse, notes, req.params.id], e => {
            if (e) return res.status(500).json({ error: e.message });
            res.json({ success: true });
        });
});

app.delete('/api/fence/purchases/:id', requireLogin, requirePerm('can_manage_fence'), (req, res) => {
    db.query('DELETE FROM fence_purchases WHERE id=?', [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.affectedRows) return res.status(404).json({ error: 'Nicht gefunden' });
        res.json({ success: true });
    });
});

app.get('/api/fence/sales', requireLogin, (req, res) => {
    db.query(`SELECT s.* FROM fence_sales s ORDER BY s.sale_date DESC`, (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json(r);
    });
});

app.post('/api/fence/sales', requireLogin, requirePerm('can_manage_fence'), (req, res) => {
    const { purchase_id, item_name, quantity, unit_cost, unit_price, buyer_info } = req.body;
    const total_price = quantity * unit_price;
    const profit = total_price - (quantity * (unit_cost || 0));

    db.query('INSERT INTO fence_sales (purchase_id,item_name,quantity,unit_price,total_price,profit,buyer_info) VALUES (?,?,?,?,?,?,?)',
        [purchase_id || null, item_name, quantity, unit_price, total_price, profit, buyer_info || null],
        (e, result) => {
            if (e) return res.status(500).json({ error: e.message });
            logActivity(req.session.userId, 'fence_sale', `Verkauf: ${quantity}x ${item_name} für $${total_price}`);

            // Ankauf reduzieren
            const pq = purchase_id
                ? 'SELECT id,quantity,stored_in_warehouse FROM fence_purchases WHERE id=?'
                : 'SELECT id,quantity,stored_in_warehouse FROM fence_purchases WHERE item_name=? ORDER BY purchase_date ASC LIMIT 1';
            db.query(pq, [purchase_id || item_name], (e2, r2) => {
                if (e2 || !r2.length) return res.json({ success: true, sale_id: result.insertId, total_price, profit });
                const p    = r2[0];
                const newQ = p.quantity - quantity;
                const updateQ = newQ <= 0
                    ? 'DELETE FROM fence_purchases WHERE id=?'
                    : 'UPDATE fence_purchases SET quantity=? WHERE id=?';
                const updateP = newQ <= 0 ? [p.id] : [newQ, p.id];
                db.query(updateQ, updateP, () => {
                    if (p.stored_in_warehouse) {
                        db.query('SELECT id,quantity FROM warehouse WHERE item_name=? AND category="fence_goods" LIMIT 1',
                            [item_name], (e3, r3) => {
                                if (!e3 && r3.length) {
                                    const newWQ = r3[0].quantity - quantity;
                                    if (newWQ <= 0) db.query('DELETE FROM warehouse WHERE id=?', [r3[0].id]);
                                    else db.query('UPDATE warehouse SET quantity=? WHERE id=?', [newWQ, r3[0].id]);
                                }
                                res.json({ success: true, sale_id: result.insertId, total_price, profit });
                            });
                    } else {
                        res.json({ success: true, sale_id: result.insertId, total_price, profit });
                    }
                });
            });
        });
});

app.delete('/api/fence/sales/:id', requireLogin, requirePerm('can_manage_fence'), (req, res) => {
    db.query('DELETE FROM fence_sales WHERE id=?', [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.affectedRows) return res.status(404).json({ error: 'Nicht gefunden' });
        res.json({ success: true });
    });
});

// ══════════════════════════════════════════════════════════
// LAGER / WAREHOUSE
// ══════════════════════════════════════════════════════════

app.get('/api/warehouse', requireLogin, (req, res) => {
    if (!req.session.can_view_storage && !req.session.can_manage_storage)
        return res.status(403).json({ error: 'Keine Berechtigung' });
    db.query('SELECT * FROM warehouse ORDER BY category, item_name', (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json(r);
    });
});

app.post('/api/warehouse', requireLogin, requirePerm('can_manage_storage'), (req, res) => {
    const { item_name, category, quantity, unit_value, location } = req.body;
    db.query('INSERT INTO warehouse (item_name,category,quantity,unit_value,location) VALUES (?,?,?,?,?)',
        [item_name, category, quantity, unit_value, location], (e, r) => {
            if (e) return res.status(500).json({ error: e.message });
            res.json({ success: true, item_id: r.insertId });
        });
});

app.put('/api/warehouse/:id', requireLogin, requirePerm('can_manage_storage'), (req, res) => {
    const { quantity, unit_value } = req.body;
    db.query('UPDATE warehouse SET quantity=?, unit_value=? WHERE id=?', [quantity, unit_value, req.params.id], e => {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true });
    });
});

app.put('/api/warehouse/:id/location', requireLogin, requirePerm('can_manage_storage'), (req, res) => {
    const { storage_location } = req.body;
    db.query('SELECT item_name, quantity FROM warehouse WHERE id=?', [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Nicht gefunden' });
        db.query('UPDATE warehouse SET storage_location=? WHERE id=?', [storage_location, req.params.id], e2 => {
            if (e2) return res.status(500).json({ error: e2.message });
            logActivity(req.session.userId, 'warehouse', `${r[0].quantity}x ${r[0].item_name} → Lager ${storage_location}`);
            res.json({ success: true });
        });
    });
});

app.put('/api/warehouse/:id/complete', requireLogin, requirePerm('can_manage_storage'), (req, res) => {
    db.query('UPDATE warehouse SET sorting_complete=TRUE WHERE id=?', [req.params.id], e => {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true });
    });
});

app.delete('/api/warehouse/:id', requireLogin, requirePerm('can_manage_storage'), (req, res) => {
    db.query('DELETE FROM warehouse WHERE id=?', [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.affectedRows) return res.status(404).json({ error: 'Nicht gefunden' });
        res.json({ success: true });
    });
});

// ── Lagerplätze ────────────────────────────────────────────

app.get('/api/storage-slots', requireLogin, (req, res) => {
    if (!req.session.can_view_storage && !req.session.can_manage_storage)
        return res.status(403).json({ error: 'Keine Berechtigung' });
    const canSeePw = req.session.can_manage_storage || req.session.can_view_storage_password;
    const pwCol    = canSeePw ? ', password' : '';
    db.query(`SELECT id,slot_code,name,section,owner,warehouse_id,aufgabe,location,created_at${pwCol} FROM storage_slots ORDER BY section, slot_code`,
        (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json(r); });
});

app.post('/api/storage-slots', requireLogin, requirePerm('can_manage_storage'), (req, res) => {
    const { warehouse_id, owner, password, aufgabe, location } = req.body;
    if (!warehouse_id || !/^\d{8}$/.test(warehouse_id))
        return res.status(400).json({ error: 'Lager-ID muss genau 8 Ziffern haben' });
    if (password && !/^\d{4}$/.test(password))
        return res.status(400).json({ error: 'Passwort muss genau 4 Ziffern haben' });

    db.query('INSERT INTO storage_slots (slot_code,name,section,owner,warehouse_id,password,aufgabe,location) VALUES (?,NULL,"Lager",?,?,?,?,?)',
        [warehouse_id, owner || null, warehouse_id, password || null, aufgabe || null, location || 'Paleto'],
        (e, r) => {
            if (e) {
                if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Lager-ID existiert bereits' });
                return res.status(500).json({ error: e.message });
            }
            logActivity(req.session.userId, 'warehouse', `Lager ${warehouse_id} (${location || 'Paleto'}) erstellt`);
            res.json({ success: true, slot_id: r.insertId });
        });
});

app.put('/api/storage-slots/:id', requireLogin, requirePerm('can_manage_storage'), (req, res) => {
    const { warehouse_id, old_code, owner, password, aufgabe, location } = req.body;
    if (!warehouse_id || !/^\d{8}$/.test(warehouse_id))
        return res.status(400).json({ error: 'Lager-ID muss genau 8 Ziffern haben' });
    if (password && !/^\d{4}$/.test(password))
        return res.status(400).json({ error: 'Passwort muss genau 4 Ziffern haben' });

    if (old_code && warehouse_id !== old_code)
        db.query('UPDATE warehouse SET storage_location=? WHERE storage_location=?', [warehouse_id, old_code], () => {});

    if (password) {
        db.query('UPDATE storage_slots SET slot_code=?,owner=?,warehouse_id=?,password=?,aufgabe=?,location=? WHERE id=?',
            [warehouse_id, owner || null, warehouse_id, password, aufgabe || null, location || 'Paleto', req.params.id], e => {
                if (e) return res.status(500).json({ error: e.message });
                logActivity(req.session.userId, 'warehouse', `Lager ${warehouse_id} bearbeitet`);
                res.json({ success: true });
            });
    } else {
        db.query('UPDATE storage_slots SET slot_code=?,owner=?,warehouse_id=?,aufgabe=?,location=? WHERE id=?',
            [warehouse_id, owner || null, warehouse_id, aufgabe || null, location || 'Paleto', req.params.id], e => {
                if (e) return res.status(500).json({ error: e.message });
                logActivity(req.session.userId, 'warehouse', `Lager ${warehouse_id} bearbeitet`);
                res.json({ success: true });
            });
    }
});

app.delete('/api/storage-slots/:id', requireLogin, requirePerm('can_manage_storage'), (req, res) => {
    db.query('SELECT slot_code FROM storage_slots WHERE id=?', [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Nicht gefunden' });
        const code = r[0].slot_code;
        db.query('UPDATE warehouse SET storage_location="UNSORTED", sorting_complete=FALSE WHERE storage_location=?', [code], () => {
            db.query('DELETE FROM storage_slots WHERE id=?', [req.params.id], e2 => {
                if (e2) return res.status(500).json({ error: e2.message });
                logActivity(req.session.userId, 'warehouse', `Lager ${code} gelöscht`);
                res.json({ success: true });
            });
        });
    });
});

// ══════════════════════════════════════════════════════════
// AKTIVITÄTEN
// ══════════════════════════════════════════════════════════

app.get('/api/activity/recent', requireLogin, (req, res) => {
    if (!req.session.can_view_activity) return res.status(403).json({ error: 'Keine Berechtigung' });
    db.query(`SELECT a.*,m.full_name FROM activity_log a LEFT JOIN members m ON a.member_id=m.id ORDER BY a.timestamp DESC LIMIT 100`,
        (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json(r); });
});

// ══════════════════════════════════════════════════════════
// INTELLIGENCE
// ══════════════════════════════════════════════════════════

app.get('/api/intelligence', requireLogin, (req, res) => {
    db.query(`SELECT i.*,m.full_name added_by_name FROM intelligence i LEFT JOIN members m ON i.added_by=m.id
              ORDER BY CASE i.importance WHEN 'Kritisch' THEN 1 WHEN 'Hoch' THEN 2 WHEN 'Mittel' THEN 3 ELSE 4 END, i.created_at DESC`,
        (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json(r); });
});

app.get('/api/intelligence/:id', requireLogin, (req, res) => {
    db.query('SELECT * FROM intelligence WHERE id=?', [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Nicht gefunden' });
        res.json(r[0]);
    });
});

app.post('/api/intelligence', requireLogin, (req, res) => {
    const { category, title, subject_name, description, importance, status, source, tags, color, gang_id } = req.body;
    db.query('INSERT INTO intelligence (category,title,subject_name,description,importance,status,source,tags,color,gang_id,added_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [category, title, subject_name, description || null, importance || 'Mittel', status || 'Unbestätigt',
         source || null, tags || null, color || null, gang_id || null, req.session.userId],
        (e, r) => {
            if (e) return res.status(500).json({ error: e.message });
            logActivity(req.session.userId, 'intelligence', `Intel hinzugefügt: ${title} (${category})`);
            res.json({ success: true, id: r.insertId });
        });
});

app.put('/api/intelligence/:id', requireLogin, (req, res) => {
    const { category, title, subject_name, description, importance, status, source, tags, color, gang_id } = req.body;
    db.query('UPDATE intelligence SET category=?,title=?,subject_name=?,description=?,importance=?,status=?,source=?,tags=?,color=?,gang_id=? WHERE id=?',
        [category, title, subject_name, description, importance, status, source, tags, color || null, gang_id || null, req.params.id],
        e => {
            if (e) return res.status(500).json({ error: e.message });
            logActivity(req.session.userId, 'intelligence', `Intel aktualisiert: ${title}`);
            res.json({ success: true });
        });
});

app.delete('/api/intelligence/:id', requireLogin, (req, res) => {
    db.query('SELECT title, category FROM intelligence WHERE id=?', [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Nicht gefunden' });
        const { title, category } = r[0];
        const doDelete = (extra = '') => {
            db.query('DELETE FROM intelligence WHERE id=?', [req.params.id], e2 => {
                if (e2) return res.status(500).json({ error: e2.message });
                logActivity(req.session.userId, 'intelligence', `Intel gelöscht: ${title}${extra}`);
                res.json({ success: true, message: `Gelöscht${extra}` });
            });
        };
        if (category === 'Gang') {
            db.query('SELECT COUNT(*) c FROM intelligence WHERE gang_id=?', [req.params.id], (e2, r2) => {
                if (!e2 && r2[0].c > 0)
                    db.query('UPDATE intelligence SET gang_id=NULL WHERE gang_id=?', [req.params.id], () => doDelete(` (${r2[0].c} Personen entknüpft)`));
                else doDelete();
            });
        } else doDelete();
    });
});

// ══════════════════════════════════════════════════════════
// REZEPTE
// ══════════════════════════════════════════════════════════

app.get('/api/recipes', requireLogin, (req, res) => {
    if (!req.session.can_view_recipes && !req.session.can_manage_recipes)
        return res.status(403).json({ error: 'Keine Berechtigung' });
    db.query(`SELECT r.*, m.full_name creator_name, (SELECT COUNT(*) FROM recipe_ingredients WHERE recipe_id=r.id) ingredient_count
              FROM recipes r LEFT JOIN members m ON r.created_by=m.id WHERE r.is_active=TRUE ORDER BY r.created_date DESC`,
        (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json(r); });
});

app.get('/api/recipes/:id', requireLogin, (req, res) => {
    db.query('SELECT * FROM recipes WHERE id=? AND is_active=TRUE', [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Nicht gefunden' });
        db.query('SELECT * FROM recipe_ingredients WHERE recipe_id=? ORDER BY id', [req.params.id], (e2, r2) => {
            if (e2) return res.status(500).json({ error: e2.message });
            res.json({ ...r[0], ingredients: r2 });
        });
    });
});

app.post('/api/recipes', requireLogin, requirePerm('can_manage_recipes'), (req, res) => {
    const { recipe_name, category, description, crafting_time, output_item, output_quantity, product_image, notes, ingredients } = req.body;
    if (!recipe_name || !category) return res.status(400).json({ error: 'Name und Kategorie erforderlich' });
    if (!ingredients || !ingredients.length) return res.status(400).json({ error: 'Mindestens eine Zutat erforderlich' });

    db.query('INSERT INTO recipes (recipe_name,category,description,crafting_time,output_item,output_quantity,product_image,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?)',
        [recipe_name, category, description, crafting_time || 0, output_item, output_quantity || 1, product_image || null, notes, req.session.userId],
        (e, r) => {
            if (e) return res.status(500).json({ error: e.message });
            const id = r.insertId;
            const vals = ingredients.map(i => [id, i.ingredient_name, i.quantity, i.unit]);
            db.query('INSERT INTO recipe_ingredients (recipe_id,ingredient_name,quantity,unit) VALUES ?', [vals], e2 => {
                if (e2) { db.query('DELETE FROM recipes WHERE id=?', [id]); return res.status(500).json({ error: e2.message }); }
                logActivity(req.session.userId, 'recipe', `Rezept erstellt: ${recipe_name}`);
                res.json({ success: true, id });
            });
        });
});

app.put('/api/recipes/:id', requireLogin, requirePerm('can_manage_recipes'), (req, res) => {
    const { recipe_name, category, description, crafting_time, output_item, output_quantity, product_image, notes, ingredients } = req.body;
    if (!recipe_name || !category) return res.status(400).json({ error: 'Name und Kategorie erforderlich' });
    if (!ingredients || !ingredients.length) return res.status(400).json({ error: 'Mindestens eine Zutat erforderlich' });

    db.query('UPDATE recipes SET recipe_name=?,category=?,description=?,crafting_time=?,output_item=?,output_quantity=?,product_image=?,notes=? WHERE id=?',
        [recipe_name, category, description, crafting_time || 0, output_item, output_quantity || 1, product_image || null, notes, req.params.id],
        (e, r) => {
            if (e) return res.status(500).json({ error: e.message });
            if (!r.affectedRows) return res.status(404).json({ error: 'Nicht gefunden' });
            db.query('DELETE FROM recipe_ingredients WHERE recipe_id=?', [req.params.id], () => {
                const vals = ingredients.map(i => [req.params.id, i.ingredient_name, i.quantity, i.unit]);
                db.query('INSERT INTO recipe_ingredients (recipe_id,ingredient_name,quantity,unit) VALUES ?', [vals], e2 => {
                    if (e2) return res.status(500).json({ error: e2.message });
                    logActivity(req.session.userId, 'recipe', `Rezept aktualisiert: ${recipe_name}`);
                    res.json({ success: true });
                });
            });
        });
});

app.delete('/api/recipes/:id', requireLogin, requirePerm('can_manage_recipes'), (req, res) => {
    db.query('SELECT recipe_name FROM recipes WHERE id=?', [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Nicht gefunden' });
        db.query('UPDATE recipes SET is_active=FALSE WHERE id=?', [req.params.id], e2 => {
            if (e2) return res.status(500).json({ error: e2.message });
            logActivity(req.session.userId, 'recipe', `Rezept gelöscht: ${r[0].recipe_name}`);
            res.json({ success: true });
        });
    });
});

// ══════════════════════════════════════════════════════════
// GANGKASSE
// ══════════════════════════════════════════════════════════

app.get('/api/treasury/balance', requireLogin, (req, res) => {
    db.query('SELECT current_balance, contributions_balance, goals_balance, last_updated, notes FROM gang_treasury LIMIT 1', (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json(r[0] || { balance: 0, contributions_balance: 0, goals_balance: 0 });
    });
});

app.get('/api/treasury/stats', requireLogin, (req, res) => {
    const m  = new Date().getMonth() + 1;
    const y  = new Date().getFullYear();
    Promise.all([
        new Promise(r => db.query('SELECT current_balance, contributions_balance, goals_balance FROM gang_treasury LIMIT 1',
            (e, d) => r(d?.[0] || { current_balance: 0, contributions_balance: 0, goals_balance: 0 }))),
        new Promise(r => db.query(
            'SELECT SUM(CASE WHEN type IN (\'einzahlung\',\'beitrag\',\'ziel_einzahlung\') THEN amount ELSE 0 END) deposits, SUM(CASE WHEN type=\'auszahlung\' THEN amount ELSE 0 END) withdrawals FROM gang_transactions WHERE MONTH(transaction_date)=? AND YEAR(transaction_date)=?',
            [m, y], (e, d) => r(d?.[0] || { deposits: 0, withdrawals: 0 }))),
        new Promise(r => db.query(
            'SELECT COUNT(CASE WHEN status=\'bezahlt\' THEN 1 END) paid_count, COUNT(*) total_count FROM member_contributions WHERE woche_start<=CURDATE() AND woche_ende>=CURDATE()',
            (e, d) => r(d?.[0] || { paid_count: 0, total_count: 0 }))),
    ]).then(([bal, mon, contrib]) => {
        const outstanding = contrib.total_count > 0 ? (contrib.total_count - contrib.paid_count) * 50 : 0;
        res.json({
            balance:                  bal.current_balance,
            contributions_balance:    bal.contributions_balance,
            goals_balance:            bal.goals_balance,
            monthly_deposits:         mon.deposits || 0,
            monthly_withdrawals:      mon.withdrawals || 0,
            paid_members:             `${contrib.paid_count}/${contrib.total_count}`,
            outstanding_contributions: outstanding
        });
    }).catch(e => res.status(500).json({ error: e.message }));
});

app.get('/api/treasury/transactions', requireLogin, (req, res) => {
    db.query(`SELECT gt.id,gt.type,gt.amount,gt.description,gt.notes,gt.ziel_id,gt.transaction_date,
              m.full_name member_name, rb.full_name recorded_by_name
              FROM gang_transactions gt LEFT JOIN members m ON gt.member_id=m.id LEFT JOIN members rb ON gt.recorded_by=rb.id
              ORDER BY gt.transaction_date DESC`,
        (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json(r); });
});

app.post('/api/treasury/transactions', requireLogin, requirePerm('can_manage_treasury'), (req, res) => {
    const { member_id, type, amount, description, notes } = req.body;
    if (!type || !amount) return res.status(400).json({ error: 'Typ und Betrag erforderlich' });

    db.query('INSERT INTO gang_transactions (member_id,type,amount,description,notes,recorded_by) VALUES (?,?,?,?,?,?)',
        [member_id || null, type, amount, description, notes || null, req.session.userId], (e, r) => {
            if (e) return res.status(500).json({ error: e.message });
            let change = 0;
            if (['einzahlung', 'beitrag', 'ziel_einzahlung', 'korrektur'].includes(type)) change = parseFloat(amount);
            else if (type === 'auszahlung') change = -parseFloat(amount);
            const field = type === 'ziel_einzahlung' ? 'goals_balance' : 'contributions_balance';
            db.query(`UPDATE gang_treasury SET current_balance=current_balance+?, ${field}=${field}+?`, [change, change]);
            logActivity(req.session.userId, 'transaction_added', `${type}: $${amount}`);
            res.json({ success: true, id: r.insertId });
        });
});

app.post('/api/treasury/balance/set', requireLogin, requirePerm('can_manage_treasury'), (req, res) => {
    const { new_balance, reason, kasse = 'contributions' } = req.body;
    if (new_balance === undefined) return res.status(400).json({ error: 'Betrag erforderlich' });
    const balField   = kasse === 'goals' ? 'goals_balance' : 'contributions_balance';
    const kasseLabel = kasse === 'goals' ? 'Zielkasse' : 'Beitragskasse';

    db.query('SELECT contributions_balance, goals_balance FROM gang_treasury LIMIT 1', (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        const old = kasse === 'goals' ? parseFloat(r[0]?.goals_balance || 0) : parseFloat(r[0]?.contributions_balance || 0);
        const diff = parseFloat(new_balance) - old;
        const newC = kasse === 'goals' ? parseFloat(r[0]?.contributions_balance || 0) : parseFloat(new_balance);
        const newG = kasse === 'goals' ? parseFloat(new_balance) : parseFloat(r[0]?.goals_balance || 0);

        db.query('INSERT INTO gang_transactions (member_id,type,amount,description,recorded_by) VALUES (?,\'korrektur\',?,?,?)',
            [null, diff, reason || `${kasseLabel} Anpassung`, req.session.userId], () => {
                db.query('UPDATE gang_treasury SET current_balance=?, contributions_balance=?, goals_balance=?, last_updated=NOW()',
                    [newC + newG, newC, newG], e2 => {
                        if (e2) return res.status(500).json({ error: e2.message });
                        logActivity(req.session.userId, 'balance_adjusted', `${kasseLabel}: $${old.toFixed(2)} → $${parseFloat(new_balance).toFixed(2)}`);
                        res.json({ success: true, old_balance: old, new_balance: parseFloat(new_balance), kasse });
                    });
            });
    });
});

app.get('/api/treasury/contributions', requireLogin, (req, res) => {
    const { woche } = req.query;
    let q = `SELECT mc.*,m.full_name member_name,m.rank FROM member_contributions mc JOIN members m ON mc.member_id=m.id`;
    const p = [];
    if (woche) { q += ' WHERE mc.woche=?'; p.push(woche); }
    q += ' ORDER BY mc.woche DESC, m.full_name';
    db.query(q, p, (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json(r); });
});

app.post('/api/treasury/contributions/create-week', requireLogin, requirePerm('can_manage_treasury'), (req, res) => {
    const { woche, beitrag } = req.body;
    if (!woche) return res.status(400).json({ error: 'Kalenderwoche erforderlich' });
    const match = woche.match(/KW(\d+)-(\d+)/);
    if (!match) return res.status(400).json({ error: 'Ungültiges Format (erwartet: KWxx-yyyy)' });
    const weekNum = parseInt(match[1]), year = parseInt(match[2]);
    const jan4 = new Date(year, 0, 4);
    const dow  = jan4.getDay() || 7;
    const ws   = new Date(jan4); ws.setDate(jan4.getDate() - dow + 1 + (weekNum - 1) * 7);
    const we   = new Date(ws);  we.setDate(ws.getDate() + 6);
    const wsStr = ws.toISOString().slice(0, 10);
    const weStr = we.toISOString().slice(0, 10);

    const getBeitrag = cb => {
        if (beitrag) return cb(parseFloat(beitrag));
        db.query('SELECT wochenbeitrag_standard FROM gang_treasury LIMIT 1', (e, r) => cb(r?.[0]?.wochenbeitrag_standard || 50));
    };

    getBeitrag(std => {
        db.query('SELECT id FROM members WHERE is_active=TRUE', (e, membs) => {
            if (e) return res.status(500).json({ error: e.message });
            const promises = membs.map(m => new Promise((res2, rej) => {
                db.query('INSERT INTO member_contributions (member_id,woche,woche_start,woche_ende,soll_betrag,status) VALUES (?,?,?,?,?,\'offen\') ON DUPLICATE KEY UPDATE soll_betrag=VALUES(soll_betrag)',
                    [m.id, woche, wsStr, weStr, std], (e2, r2) => e2 ? rej(e2) : res2(r2));
            }));
            Promise.all(promises)
                .then(() => res.json({ success: true, message: `${woche}: $${std.toFixed(2)} für ${membs.length} Mitglieder angelegt` }))
                .catch(e => res.status(500).json({ error: e.message }));
        });
    });
});

app.post('/api/treasury/contributions/create-period', requireLogin, requirePerm('can_manage_treasury'), (req, res) => {
    const { start_datum, end_datum, beitrag } = req.body;
    if (!start_datum || !end_datum) return res.status(400).json({ error: 'Start- und Enddatum erforderlich' });
    if (new Date(start_datum) > new Date(end_datum)) return res.status(400).json({ error: 'Startdatum muss vor Enddatum liegen' });
    const std = parseFloat(beitrag) || 50;
    const startStr = new Date(start_datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const endStr   = new Date(end_datum).toLocaleDateString('de-DE',   { day: '2-digit', month: '2-digit', year: 'numeric' });
    const desc     = `${startStr} - ${endStr}`;

    db.query('SELECT id FROM members WHERE is_active=TRUE', (e, membs) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!membs.length) return res.status(400).json({ error: 'Keine aktiven Mitglieder' });

        db.query('UPDATE member_contributions SET locked=1 WHERE locked=0 AND woche_ende<?', [start_datum], () => {
            db.query(`SELECT member_id, SUM(soll_betrag-COALESCE(ist_betrag,0)) offen FROM member_contributions
                      WHERE locked=1 AND status!='bezahlt' AND woche_ende<? GROUP BY member_id`,
                [start_datum], (e2, carry) => {
                    const carryMap = {};
                    (carry || []).forEach(row => { if (parseFloat(row.offen) > 0) carryMap[row.member_id] = parseFloat(row.offen); });

                    const promises = membs.map(m => new Promise((res2, rej) => {
                        const ub = carryMap[m.id] || 0;
                        db.query(`INSERT INTO member_contributions (member_id,woche,woche_start,woche_ende,soll_betrag,uebertrag_betrag,status)
                                  VALUES (?,?,?,?,?,?,'offen') ON DUPLICATE KEY UPDATE soll_betrag=VALUES(soll_betrag),uebertrag_betrag=VALUES(uebertrag_betrag)`,
                            [m.id, desc, start_datum, end_datum, std + ub, ub], (e3, r3) => e3 ? rej(e3) : res2(r3));
                    }));

                    Promise.all(promises)
                        .then(() => {
                            const carryCount = Object.keys(carryMap).length;
                            logActivity(req.session.userId, 'treasury_period_created', `Zeitraum ${desc}: $${std} für ${membs.length} Mitglieder`);
                            res.json({ success: true, message: `${desc}: $${std.toFixed(2)} für ${membs.length} Mitglieder angelegt` + (carryCount > 0 ? `. ${carryCount} Mitglieder haben Übertrag.` : '') });
                        })
                        .catch(e => res.status(500).json({ error: e.message }));
                });
        });
    });
});

app.post('/api/treasury/contributions/mark-paid', requireLogin, requirePerm('can_manage_treasury'), (req, res) => {
    const { contribution_id, paid_amount, notes } = req.body;
    if (!contribution_id || paid_amount === undefined) return res.status(400).json({ error: 'ID und Betrag erforderlich' });

    db.query('SELECT * FROM member_contributions WHERE id=?', [contribution_id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Nicht gefunden' });
        const c = r[0];
        if (c.locked) return res.status(403).json({ error: 'Zeitraum gesperrt' });
        if (c.status === 'bezahlt') return res.status(400).json({ error: 'Bereits vollständig bezahlt' });

        const amount = parseFloat(paid_amount);
        if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Betrag muss > 0 sein' });

        const newIst    = parseFloat(c.ist_betrag || 0) + amount;
        const newStatus = newIst >= parseFloat(c.soll_betrag) ? 'bezahlt' : 'teilweise';
        const setParts  = ['ist_betrag=?', 'status=?'];
        const setParams = [newIst, newStatus];
        if (newStatus === 'bezahlt') setParts.push('bezahlt_am=NOW()');
        setParams.push(contribution_id);

        db.getConnection((ce, conn) => {
            if (ce) return res.status(500).json({ error: ce.message });
            conn.beginTransaction(te => {
                if (te) { conn.release(); return res.status(500).json({ error: te.message }); }
                conn.query(`UPDATE member_contributions SET ${setParts.join(',')} WHERE id=?`, setParams, ue => {
                    if (ue) return conn.rollback(() => { conn.release(); res.status(500).json({ error: ue.message }); });
                    conn.query(`INSERT INTO gang_transactions (member_id,type,amount,description,recorded_by) VALUES (?,'beitrag',?,?,?)`,
                        [c.member_id, amount, `Beitrag ${c.woche}: ${newStatus === 'bezahlt' ? 'vollständig' : 'Teilzahlung $' + amount.toFixed(2)}`, req.session.userId], te2 => {
                            if (te2) return conn.rollback(() => { conn.release(); res.status(500).json({ error: te2.message }); });
                            conn.query('UPDATE gang_treasury SET current_balance=current_balance+?,contributions_balance=contributions_balance+?,last_updated=NOW() LIMIT 1',
                                [amount, amount], be => {
                                    if (be) return conn.rollback(() => { conn.release(); res.status(500).json({ error: be.message }); });
                                    conn.commit(cme => {
                                        if (cme) return conn.rollback(() => { conn.release(); res.status(500).json({ error: cme.message }); });
                                        conn.release();
                                        logActivity(req.session.userId, 'treasury_contribution_paid', `Beitrag $${amount} für Mitglied ${c.member_id} gebucht`);
                                        res.json({ success: true, new_status: newStatus, new_ist_betrag: newIst });
                                    });
                                });
                        });
                });
            });
        });
    });
});

app.delete('/api/treasury/contributions/:id', requireLogin, requirePerm('can_manage_treasury'), (req, res) => {
    db.query('SELECT * FROM member_contributions WHERE id=?', [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Nicht gefunden' });
        db.query('DELETE FROM member_contributions WHERE id=?', [req.params.id], e2 => {
            if (e2) return res.status(500).json({ error: e2.message });
            logActivity(req.session.userId, 'treasury_contribution_deleted', `Beitrag ${r[0].woche} gelöscht`);
            res.json({ success: true });
        });
    });
});

app.put('/api/treasury/contributions/:id', requireLogin, requirePerm('can_manage_treasury'), (req, res) => {
    const { soll_betrag, notes } = req.body;
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige ID' });

    const soll = parseFloat(soll_betrag);
    if (isNaN(soll) || soll < 0) return res.status(400).json({ error: 'Soll-Betrag ungültig' });

    db.query('SELECT * FROM member_contributions WHERE id=?', [id], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Beitrag nicht gefunden' });
        const c = r[0];

        // Status neu berechnen basierend auf neuem Soll-Betrag
        const ist = parseFloat(c.ist_betrag || 0);
        let newStatus = c.status;
        if (ist >= soll) newStatus = 'bezahlt';
        else if (ist > 0) newStatus = 'teilweise';
        else newStatus = 'offen';

        db.query(
            'UPDATE member_contributions SET soll_betrag=?, notes=?, status=? WHERE id=?',
            [soll, notes || null, newStatus, id],
            (e2) => {
                if (e2) return res.status(500).json({ error: e2.message });
                logActivity(req.session.userId, 'treasury_contribution_updated',
                    `Beitrag ${c.woche} für Mitglied ${c.member_id} aktualisiert (Soll: $${soll.toFixed(2)})`);
                res.json({ success: true, new_status: newStatus });
            }
        );
    });
});

app.get('/api/treasury/goals', requireLogin, (req, res) => {
    db.query(`SELECT g.*,m.full_name erstellt_von_name FROM treasury_goals g LEFT JOIN members m ON g.erstellt_von=m.id
              ORDER BY CASE WHEN g.status='aktiv' THEN 1 ELSE 2 END, g.erstellt_am DESC`,
        (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json(r); });
});

app.post('/api/treasury/goals', requireLogin, requirePerm('can_manage_treasury'), (req, res) => {
    const { titel, beschreibung, ziel_betrag, deadline } = req.body;
    if (!titel || !ziel_betrag) return res.status(400).json({ error: 'Titel und Zielbetrag erforderlich' });
    db.query('INSERT INTO treasury_goals (titel,beschreibung,ziel_betrag,deadline,erstellt_von) VALUES (?,?,?,?,?)',
        [titel, beschreibung, ziel_betrag, deadline || null, req.session.userId], (e, r) => {
            if (e) return res.status(500).json({ error: e.message });
            logActivity(req.session.userId, 'goal_created', `Ziel erstellt: ${titel} ($${ziel_betrag})`);
            res.json({ success: true, id: r.insertId });
        });
});

app.post('/api/treasury/goals/contribute', requireLogin, requirePerm('can_manage_treasury'), (req, res) => {
    const { goal_id, member_id, amount, kommentar } = req.body;
    if (!goal_id || !member_id || !amount) return res.status(400).json({ error: 'Ziel, Mitglied und Betrag erforderlich' });
    db.query('INSERT INTO goal_contributions (goal_id,member_id,amount,kommentar) VALUES (?,?,?,?)',
        [goal_id, member_id, amount, kommentar], e => {
            if (e) return res.status(500).json({ error: e.message });
            db.query('UPDATE treasury_goals SET aktueller_betrag=aktueller_betrag+? WHERE id=?', [amount, goal_id]);
            db.query(`INSERT INTO gang_transactions (member_id,type,amount,description,ziel_id,recorded_by) VALUES (?,'ziel_einzahlung',?,?,?,?)`,
                [member_id, amount, `Einzahlung in Ziel #${goal_id}`, goal_id, req.session.userId]);
            db.query('UPDATE gang_treasury SET current_balance=current_balance+?,goals_balance=goals_balance+?', [amount, amount]);
            res.json({ success: true });
        });
});

app.put('/api/treasury/goals/:id/complete', requireLogin, requirePerm('can_manage_treasury'), (req, res) => {
    db.query(`UPDATE treasury_goals SET status='erreicht',abgeschlossen_am=NOW() WHERE id=?`, [req.params.id], e => {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true });
    });
});

app.put('/api/treasury/goals/:id/cancel', requireLogin, requirePerm('can_manage_treasury'), (req, res) => {
    db.query(`UPDATE treasury_goals SET status='abgebrochen',abgeschlossen_am=NOW() WHERE id=?`, [req.params.id], e => {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true });
    });
});

app.get('/api/treasury/goals/:id/contributors', requireLogin, (req, res) => {
    db.query(`SELECT gc.*,m.full_name member_name FROM goal_contributions gc JOIN members m ON gc.member_id=m.id WHERE gc.goal_id=? ORDER BY gc.datum DESC`,
        [req.params.id], (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json(r); });
});

// ══════════════════════════════════════════════════════════
// DASHBOARD STAT SETTINGS
// ══════════════════════════════════════════════════════════

app.get('/api/dashboard/stat-settings', requireLogin, (req, res) => {
    db.query('SELECT stat_key, label, is_visible, sort_order FROM dashboard_stat_settings ORDER BY sort_order', (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true, settings: r });
    });
});

app.post('/api/dashboard/stat-settings', requireLogin, requirePerm('can_manage_system'), (req, res) => {
    const { settings } = req.body;
    if (!Array.isArray(settings)) return res.status(400).json({ error: 'Ungültige Einstellung' });
    let done = 0;
    settings.forEach(s => {
        db.query('UPDATE dashboard_stat_settings SET is_visible=?,sort_order=? WHERE stat_key=?',
            [s.is_visible ? 1 : 0, s.sort_order || 0, s.stat_key], () => {
                if (++done === settings.length) res.json({ success: true });
            });
    });
});

// ══════════════════════════════════════════════════════════
// WARTUNG / SYSTEM
// ══════════════════════════════════════════════════════════

app.get('/api/maintenance/settings', requireLogin, requirePerm('can_manage_system'), (req, res) => {
    db.query('SELECT * FROM maintenance_settings', (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        const settings = {};
        r.forEach(row => { settings[row.module_name] = { is_disabled: !!row.is_disabled, reason: row.reason }; });
        res.json({ success: true, settings });
    });
});

app.post('/api/maintenance/settings', requireLogin, requirePerm('can_manage_system'), (req, res) => {
    const { settings } = req.body;
    const keys  = Object.keys(settings);
    let done    = 0;
    keys.forEach(mod => {
        const disabled = !!settings[mod];
        db.query('UPDATE maintenance_settings SET is_disabled=?,disabled_by=?,disabled_at=?,reason=? WHERE module_name=?',
            [disabled, disabled ? req.session.userId : null, disabled ? new Date() : null,
             disabled ? `Wartungsmodus von ${req.session.username}` : null, mod],
            () => { if (++done === keys.length) { logActivity(req.session.userId, 'maintenance', 'Wartungseinstellungen geändert'); res.json({ success: true }); } });
    });
});

app.get('/api/maintenance/status/:module', requireLogin, (req, res) => {
    db.query('SELECT is_disabled, reason FROM maintenance_settings WHERE module_name=?', [req.params.module], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.json({ success: true, is_disabled: false });
        res.json({ success: true, is_disabled: !!r[0].is_disabled, reason: r[0].reason });
    });
});

// ══════════════════════════════════════════════════════════
// RANG-BERECHTIGUNGEN
// ══════════════════════════════════════════════════════════

app.get('/api/rank-permissions', requireLogin, requirePerm('can_manage_system'), (req, res) => {
    db.query(`SELECT * FROM rank_permissions ORDER BY FIELD(rank_name,'Techniker','OG','2OG','Member','Soldat','Runner')`, (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true, ranks: r });
    });
});

app.put('/api/rank-permissions/:rankName', requireLogin, requirePerm('can_manage_system'), (req, res) => {
    const rn = req.params.rankName;
    const { can_add_members, can_view_fence, can_manage_fence, can_view_recipes, can_manage_recipes,
            can_view_storage, can_manage_storage, can_view_storage_password,
            can_view_treasury, can_manage_treasury, can_view_activity, can_view_stats, can_manage_system } = req.body;

    db.query(`INSERT INTO rank_permissions (rank_name,can_add_members,can_view_fence,can_manage_fence,can_view_recipes,can_manage_recipes,
              can_view_storage,can_manage_storage,can_view_storage_password,can_view_treasury,can_manage_treasury,can_view_activity,can_view_stats,can_manage_system)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
              ON DUPLICATE KEY UPDATE
              can_add_members=VALUES(can_add_members),can_view_fence=VALUES(can_view_fence),can_manage_fence=VALUES(can_manage_fence),
              can_view_recipes=VALUES(can_view_recipes),can_manage_recipes=VALUES(can_manage_recipes),
              can_view_storage=VALUES(can_view_storage),can_manage_storage=VALUES(can_manage_storage),
              can_view_storage_password=VALUES(can_view_storage_password),can_view_treasury=VALUES(can_view_treasury),
              can_manage_treasury=VALUES(can_manage_treasury),can_view_activity=VALUES(can_view_activity),
              can_view_stats=VALUES(can_view_stats),can_manage_system=VALUES(can_manage_system)`,
        [rn, !!can_add_members, !!can_view_fence, !!can_manage_fence, !!can_view_recipes, !!can_manage_recipes,
         !!can_view_storage, !!can_manage_storage, !!can_view_storage_password,
         !!can_view_treasury, !!can_manage_treasury, !!can_view_activity, !!can_view_stats, !!can_manage_system],
        e => {
            if (e) return res.status(500).json({ error: e.message });
            logActivity(req.session.userId, 'rank_permissions', `Rang-Berechtigungen für "${rn}" geändert`);
            res.json({ success: true });
        });
});

app.post('/api/rank-permissions/:rankName/apply', requireLogin, requirePerm('can_manage_system'), (req, res) => {
    const rn = req.params.rankName;
    db.query('SELECT * FROM rank_permissions WHERE rank_name=?', [rn], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Rang-Vorlage nicht gefunden' });
        const rp = r[0];
        db.query(`UPDATE members SET
            can_add_members=?,can_view_fence=?,can_manage_fence=?,can_view_recipes=?,can_manage_recipes=?,
            can_view_storage=?,can_manage_storage=?,can_view_storage_password=?,
            can_view_treasury=?,can_manage_treasury=?,can_view_activity=?,can_view_stats=?,can_manage_system=?
            WHERE \`rank\`=? AND is_active=TRUE`,
            [rp.can_add_members, rp.can_view_fence, rp.can_manage_fence, rp.can_view_recipes, rp.can_manage_recipes,
             rp.can_view_storage, rp.can_manage_storage, rp.can_view_storage_password || false,
             rp.can_view_treasury, rp.can_manage_treasury, rp.can_view_activity, rp.can_view_stats, rp.can_manage_system, rn],
            (e2, r2) => {
                if (e2) return res.status(500).json({ error: e2.message });
                logActivity(req.session.userId, 'rank_permissions_applied', `Rang-Rechte auf ${r2.affectedRows} "${rn}"-Mitglieder angewendet`);
                res.json({ success: true, affected: r2.affectedRows });
            });
    });
});

app.get('/api/permissions-overview', requireLogin, requirePerm('can_manage_system'), (req, res) => {
    db.query(`SELECT id, full_name, \`rank\`, is_active,
        COALESCE(can_add_members,FALSE) can_add_members, COALESCE(can_view_fence,FALSE) can_view_fence,
        COALESCE(can_manage_fence,FALSE) can_manage_fence, COALESCE(can_view_recipes,FALSE) can_view_recipes,
        COALESCE(can_manage_recipes,FALSE) can_manage_recipes, COALESCE(can_view_storage,FALSE) can_view_storage,
        COALESCE(can_manage_storage,FALSE) can_manage_storage, COALESCE(can_view_storage_password,FALSE) can_view_storage_password,
        COALESCE(can_view_treasury,FALSE) can_view_treasury, COALESCE(can_manage_treasury,FALSE) can_manage_treasury,
        COALESCE(can_view_activity,FALSE) can_view_activity, COALESCE(can_view_stats,FALSE) can_view_stats,
        COALESCE(can_manage_system,FALSE) can_manage_system
        FROM members WHERE is_active=TRUE ORDER BY FIELD(\`rank\`,'Techniker','OG','2OG','Member','Soldat','Runner'), full_name`,
        (e, r) => { if (e) return res.status(500).json({ error: e.message }); res.json({ success: true, members: r }); });
});

// ══════════════════════════════════════════════════════════
// GEBIETSKARTE
// ══════════════════════════════════════════════════════════

app.get('/api/dealer-spots', requireLogin, (req, res) => {
    db.query(
        `SELECT ds.*, m.full_name AS assigned_member_name, m.rank AS assigned_member_rank
         FROM dealer_spots ds
         LEFT JOIN members m ON ds.assigned_member_id = m.id
         ORDER BY ds.created_at ASC`,
        (e, r) => {
            if (e) return res.status(500).json({ error: e.message });
            res.json({ success: true, spots: r });
        }
    );
});

app.post('/api/dealer-spots', requireLogin, (req, res) => {
    const { name, description, x_pos, y_pos, color, category } = req.body;
    if (!name || x_pos === undefined || y_pos === undefined)
        return res.status(400).json({ error: 'Name und Position erforderlich' });
    const xf = parseFloat(x_pos), yf = parseFloat(y_pos);
    if (isNaN(xf) || isNaN(yf) || xf < 0 || xf > 100 || yf < 0 || yf > 100)
        return res.status(400).json({ error: 'Ungültige Position' });
    const validCategories = ['dealer', 'gang', 'gewerbe'];
    const cat = validCategories.includes(category) ? category : 'dealer';
    db.query(
        'INSERT INTO dealer_spots (name, description, x_pos, y_pos, color, category, created_by) VALUES (?,?,?,?,?,?,?)',
        [name.trim().substring(0,100), (description||'').trim().substring(0,500) || null,
         xf, yf, (color||'#ef4444').substring(0,20), cat, req.session.userId],
        (e, r) => {
            if (e) return res.status(500).json({ error: e.message });
            logActivity(req.session.userId, 'map_spot_created', `Karten-Spot erstellt: ${name} [${cat}]`);
            res.json({ success: true, id: r.insertId });
        }
    );
});

app.put('/api/dealer-spots/:id', requireLogin, (req, res) => {
    const { name, description, color, category } = req.body;
    if (!name) return res.status(400).json({ error: 'Name erforderlich' });
    const validCategories = ['dealer', 'gang', 'gewerbe'];
    const cat = validCategories.includes(category) ? category : 'dealer';
    db.query(
        'UPDATE dealer_spots SET name=?, description=?, color=?, category=? WHERE id=?',
        [name.trim().substring(0,100), (description||'').trim().substring(0,500) || null,
         (color||'#ef4444').substring(0,20), cat, parseInt(req.params.id)],
        (e) => {
            if (e) return res.status(500).json({ error: e.message });
            logActivity(req.session.userId, 'dealer_spot_updated', `Dealer-Spot bearbeitet: ${name}`);
            res.json({ success: true });
        }
    );
});

app.delete('/api/dealer-spots/:id', requireLogin, (req, res) => {
    db.query('SELECT name FROM dealer_spots WHERE id=?', [parseInt(req.params.id)], (e, r) => {
        if (e) return res.status(500).json({ error: e.message });
        if (!r.length) return res.status(404).json({ error: 'Spot nicht gefunden' });
        db.query('DELETE FROM dealer_spots WHERE id=?', [parseInt(req.params.id)], e2 => {
            if (e2) return res.status(500).json({ error: e2.message });
            logActivity(req.session.userId, 'dealer_spot_deleted', `Dealer-Spot gelöscht: ${r[0].name}`);
            res.json({ success: true });
        });
    });
});

// ── Error Handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
    if (err instanceof URIError) return res.status(400).end();
    console.error(err);
    res.status(500).json({ error: 'Interner Serverfehler' });
});

app.listen(PORT, () => {
    console.log(`✓ Server läuft auf Port ${PORT} → http://localhost:${PORT}`);
});

