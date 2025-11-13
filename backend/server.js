const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// MySQL Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: 'restor1_db',
    waitForConnections: true,
    connectionLimit: 10
});

// ========== RESTAURANTS ==========

// Get all restaurants
app.get('/api/restaurants', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM restaurants ORDER BY rating DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get restaurant by ID
app.get('/api/restaurants/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM restaurants WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get restaurant menu
app.get('/api/restaurants/:id/menu', async (req, res) => {
    try {
        const query = `
            SELECT d.* FROM dishes d
            INNER JOIN restaurant_dishes rd ON d.id = rd.dish_id
            WHERE rd.restaurant_id = ?
        `;
        const [rows] = await pool.query(query, [req.params.id]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== DISHES ==========

// Get all dishes with filters
app.get('/api/dishes', async (req, res) => {
    try {
        const { search, category, min_price, max_price } = req.query;
        let query = 'SELECT * FROM dishes WHERE 1=1';
        const params = [];

        if (search) {
            query += ' AND (name LIKE ? OR description LIKE ? OR ingredients LIKE ?)';
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam);
        }
        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        if (min_price) {
            query += ' AND price >= ?';
            params.push(min_price);
        }
        if (max_price) {
            query += ' AND price <= ?';
            params.push(max_price);
        }

        query += ' ORDER BY name';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get dish by ID
app.get('/api/dishes/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM dishes WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get restaurants where dish is available
app.get('/api/dishes/:id/restaurants', async (req, res) => {
    try {
        const query = `
            SELECT r.* FROM restaurants r
            INNER JOIN restaurant_dishes rd ON r.id = rd.restaurant_id
            WHERE rd.dish_id = ?
        `;
        const [rows] = await pool.query(query, [req.params.id]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== SEARCH ==========

// Unified search
app.get('/api/search', async (req, res) => {
    try {
        const { query, type = 'all' } = req.query;
        if (!query) return res.status(400).json({ error: 'Query required' });

        const results = {};
        const searchParam = `%${query}%`;

        if (type === 'all' || type === 'restaurants') {
            const [restaurants] = await pool.query(
                'SELECT * FROM restaurants WHERE name LIKE ? OR address LIKE ? OR type LIKE ? LIMIT 20',
                [searchParam, searchParam, searchParam]
            );
            results.restaurants = restaurants;
        }

        if (type === 'all' || type === 'dishes') {
            const [dishes] = await pool.query(
                'SELECT * FROM dishes WHERE name LIKE ? OR description LIKE ? OR category LIKE ? OR ingredients LIKE ? LIMIT 20',
                [searchParam, searchParam, searchParam, searchParam]
            );
            results.dishes = dishes;
        }

        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', database: 'MySQL' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Restor-1 API running on port ${PORT}`);
    console.log(`📊 Database: MySQL (restor1_db)`);
    console.log(`🗺️  OpenStreetMap + Leaflet ready`);
});
