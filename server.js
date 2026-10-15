const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Aiven MySQL Live Connection Routing Pipeline Configuration
const db = mysql.createConnection({
    host: process.env.DB_HOST || '://aivencloud.com',
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD || 'AVNS_IH3y',
    database: process.env.DB_NAME || 'defaultdb',
    port: process.env.DB_PORT || 25255,
    ssl: { rejectUnauthorized: false } // Crucial cloud flag configuration mandatory for Aiven database verification
});

db.connect((err) => {
    if (err) {
        console.error('CRITICAL ERROR: Cloud network database channel bridge failure: ' + err.stack);
    } else {
        console.log('SUCCESS CHANNEL: Connected seamlessly with live Aiven MySQL server node instance.');
        createTables();
    }
});

// Dynamic Structural Database Auto Schema Engine Setup
function createTables() {
    const userTableQuery = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NULL,
            phone VARCHAR(50) NULL,
            password VARCHAR(255) NOT NULL,
            balance DECIMAL(10,2) DEFAULT 0.00,
            earnings DECIMAL(10,2) DEFAULT 0.00,
            role VARCHAR(50) DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    
    const transactionTableQuery = `
        CREATE TABLE IF NOT EXISTS transactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            type VARCHAR(50) NOT NULL,
            address VARCHAR(255) NOT NULL,
            status VARCHAR(50) DEFAULT 'Pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    db.query(userTableQuery, (err) => {
        if (err) console.error("Database Engine Execution Warning [users schema block]: ", err);
    });

    db.query(transactionTableQuery, (err) => {
        if (err) console.error("Database Engine Execution Warning [transactions schema block]: ", err);
    });
}

// 🔄 30 Global Live Dynamic Transaction String Constructor Engine
function generateFakeTRC20() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789';
    let address = 'T';
    for (let i = 0; i < 33; i++) {
        address += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return address.substring(0, 6) + '...' + address.substring(address.length - 6);
}

app.get('/api/live-transactions', (req, res) => {
    const fakeData = [];
    const types = ['Deposit', 'Withdraw'];
    for (let i = 1; i <= 30; i++) {
        fakeData.push({
            id: `USR${Math.floor(10000 + Math.random() * 90000)}`,
            amount: `$${(Math.random() * 2450 + 50).toFixed(2)}`,
            type: types[Math.floor(Math.random() * types.length)],
            address: generateFakeTRC20()
        });
    }
    res.json(fakeData);
});

// --- CORE TRANSACTION AUTHENTICATION SYSTEM GATEWAYS ---

app.post('/api/register', (req, res) => {
    const { email, phone, password } = req.body;
    const query = `INSERT INTO users (email, phone, password) VALUES (?, ?, ?)`;
    db.query(query, [email || null, phone || null, password], (err, result) => {
        if (err) {
            return res.send(`<script>alert("Registration Pipeline Aborted: ${err.message}"); window.location.href = "/register";</script>`);
        }
        res.send(`<script>alert("Account registration finalized successfully!"); window.location.href = "/dashboard?uid=${result.insertId}";</script>`);
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const query = `SELECT * FROM users WHERE (email = ? OR phone = ?) AND password = ?`;
    db.query(query, [email, email, password], (err, results) => {
        if (err || results.length === 0) {
            return res.send(`<script>alert("Invalid security credentials provided. Verification failed."); window.location.href = "/login";</script>`);
        }
        res.redirect('/dashboard?uid=' + results[0].id);
    });
});

app.post('/api/transaction', (req, res) => {
    const { uid, amount, type, address } = req.body;
    
    if (!uid || !amount || !type || !address) {
        return res.send(`<script>alert("Error: All transaction field parameters mandatory!"); window.history.back();</script>`);
    }

    const query = `INSERT INTO transactions (user_id, amount, type, address, status) VALUES (?, ?, ?, ?, 'Pending')`;
    db.query(query, [uid, amount, type, address], (err, result) => {
        if (err) {
            return res.send(`<script>alert("Gateway Interface Error: ${err.message}"); window.history.back();</script>`);
        }
        res.send(`<script>alert("${type} submission processed! Status set to pending validation review."); window.location.href = "/dashboard?uid=" + ${uid};</script>`);
    });
});

app.get('/api/user/:id', (req, res) => {
    const query = `SELECT id, email, phone, balance, earnings FROM users WHERE id = ?`;
    db.query(query, [req.params.id], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ error: "Client structural records empty" });
        res.json(results);
    });
});

// App Router Controls Interface Mapping
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/affiliate', (req, res) => res.sendFile(path.join(__dirname, 'affiliate.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.listen(PORT, () => console.log(`Engine running flawlessly live listening on infrastructure allocation access point port: ${PORT}`));
