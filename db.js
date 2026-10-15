// db.js
const mysql = require('mysql2');
const dotenv = require('dotenv');

dotenv.config();

// আপনার দেওয়া Aiven MySQL ডেটাবেজের তথ্য সরাসরি এখানে যুক্ত করা হলো
const pool = mysql.createPool({
    host: process.env.DB_HOST || '://aivencloud.com',
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD || 'AVNS_IH3y',
    database: process.env.DB_NAME || 'defaultdb',
    port: process.env.DB_PORT || 25255,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false // Aiven-এর সিকিউর ক্লাউড কানেকশনের জন্য এটি অত্যন্ত জরুরি
    }
});

// ব্যাকএন্ডে async/await (Modern Javascript) ব্যবহার করার জন্য প্রমিজ পুল তৈরি
const promisePool = pool.promise();

console.log("🗄️ Aiven MySQL Database Connection Pool Initialized Successfully.");

module.exports = promisePool;
