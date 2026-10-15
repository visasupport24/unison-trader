import express from 'express';
import mysql from 'mysql2';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Aiven MySQL কানেকশন পুশ
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 24802,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// প্রথমবার রান করার সময় ডেটাবেজ টেবিল তৈরি
pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        balance DECIMAL(10,2) DEFAULT 100.00,
        invested DECIMAL(10,2) DEFAULT 50.00,
        earnings DECIMAL(10,2) DEFAULT 5.50
    )
`, (err) => { if (err) console.error("Database table error:", err); });

// লগইন ও রেজিস্ট্রেশন API
app.post('/api/auth/login', (req, res) => {
    const { email } = req.body;
    pool.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length > 0) return res.json(results[0]); // Object পাঠানো হচ্ছে
        
        pool.query('INSERT INTO users (email) VALUES (?)', [email], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: result.insertId, email, balance: 100.00, invested: 50.00, earnings: 5.50 });
        });
    });
});

// ইনভেস্টমেন্ট প্রসেস API
app.post('/api/invest', (req, res) => {
    const { userId, amount } = req.body;
    pool.query('UPDATE users SET balance = balance - ?, invested = invested + ? WHERE id = ? AND balance >= ?', [amount, amount, userId, amount], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.affectedRows === 0) return res.status(400).json({ error: "Insufficient balance" });
        
        pool.query('SELECT * FROM users WHERE id = ?', [userId], (err, users) => {
            res.json({ message: "Investment Successful", user: users[0] });
        });
    });
});

// React ফ্রন্টএন্ডের বিল্ড ফাইল (dist) সার্ভ করা
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
