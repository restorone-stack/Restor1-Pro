const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ charset: 'utf-8' }));
app.use(express.urlencoded({ extended: true, charset: 'utf-8' }));

// Set default charset for all responses
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
});

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// MySQL Connection Pool with better error handling
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: 'restor1_db',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

console.log('🔧 Database Configuration:');
console.log(`   Host: ${dbConfig.host}`);
console.log(`   User: ${dbConfig.user}`);
console.log(`   Database: ${dbConfig.database}`);

const pool = mysql.createPool(dbConfig);

// Test database connection on startup
async function testDatabaseConnection() {
    try {
        const connection = await pool.getConnection();
        
        // Set connection charset
        await connection.query("SET NAMES 'utf8mb4'");
        await connection.query("SET CHARACTER SET utf8mb4");
        
        console.log('✅ Database connection successful!');
        
        // Check if tables exist
        const [tables] = await connection.query("SHOW TABLES");
        console.log(`📊 Found ${tables.length} tables in database`);
        
        // Check restaurant count
        const [restaurants] = await connection.query("SELECT COUNT(*) as count FROM restaurants");
        console.log(`🏪 Restaurants in database: ${restaurants[0].count}`);
        
        // Check dishes count
        const [dishes] = await connection.query("SELECT COUNT(*) as count FROM dishes");
        console.log(`🍽️  Dishes in database: ${dishes[0].count}`);
        
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed!');
        console.error('Error:', error.message);
        console.error('\n📝 Troubleshooting steps:');
        console.error('1. Check if MySQL is running: sudo systemctl status mysql');
        console.error('2. Check if database exists: mysql -u root -p -e "SHOW DATABASES;"');
        console.error('3. Create database: mysql -u root -p < database/restor1_full.sql');
        console.error('4. Check credentials in backend/.env file\n');
        return false;
    }
}

// ========== RESTAURANTS ==========

// Get all restaurants
app.get('/api/restaurants', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        await connection.query("SET NAMES 'utf8mb4'");
        const [rows] = await connection.query('SELECT * FROM restaurants ORDER BY rating DESC');
        connection.release();
        
        console.log(`✅ Retrieved ${rows.length} restaurants`);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(rows);
    } catch (error) {
        console.error('❌ Error fetching restaurants:', error.message);
        res.status(500).json({ 
            error: 'Database error', 
            message: error.message,
            hint: 'Check if database is running and tables exist'
        });
    }
});

// Get restaurant by ID
app.get('/api/restaurants/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM restaurants WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            console.log(`⚠️  Restaurant not found: ID ${req.params.id}`);
            return res.status(404).json({ error: 'Restaurant not found' });
        }
        console.log(`✅ Retrieved restaurant: ${rows[0].name}`);
        res.json(rows[0]);
    } catch (error) {
        console.error('❌ Error fetching restaurant:', error.message);
        res.status(500).json({ error: 'Database error', message: error.message });
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
        console.log(`✅ Retrieved ${rows.length} dishes for restaurant ID ${req.params.id}`);
        res.json(rows);
    } catch (error) {
        console.error('❌ Error fetching menu:', error.message);
        res.status(500).json({ error: 'Database error', message: error.message });
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
            console.log(`🔍 Searching dishes for: "${search}"`);
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
        console.log(`✅ Found ${rows.length} dishes`);
        res.json(rows);
    } catch (error) {
        console.error('❌ Error fetching dishes:', error.message);
        res.status(500).json({ error: 'Database error', message: error.message });
    }
});

// Get dish by ID
app.get('/api/dishes/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM dishes WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            console.log(`⚠️  Dish not found: ID ${req.params.id}`);
            return res.status(404).json({ error: 'Dish not found' });
        }
        console.log(`✅ Retrieved dish: ${rows[0].name}`);
        res.json(rows[0]);
    } catch (error) {
        console.error('❌ Error fetching dish:', error.message);
        res.status(500).json({ error: 'Database error', message: error.message });
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
        console.log(`✅ Dish ID ${req.params.id} available in ${rows.length} restaurants`);
        res.json(rows);
    } catch (error) {
        console.error('❌ Error fetching restaurants for dish:', error.message);
        res.status(500).json({ error: 'Database error', message: error.message });
    }
});

// ========== SEARCH ==========

// Unified search
app.get('/api/search', async (req, res) => {
    try {
        const { query, type = 'all' } = req.query;
        if (!query) {
            console.log('⚠️  Search query is empty');
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        console.log(`🔍 Unified search: "${query}" (type: ${type})`);
        const results = {};
        const searchParam = `%${query}%`;

        if (type === 'all' || type === 'restaurants') {
            const [restaurants] = await pool.query(
                'SELECT * FROM restaurants WHERE name LIKE ? OR address LIKE ? OR type LIKE ? LIMIT 20',
                [searchParam, searchParam, searchParam]
            );
            results.restaurants = restaurants;
            console.log(`   Found ${restaurants.length} restaurants`);
        }

        if (type === 'all' || type === 'dishes') {
            const [dishes] = await pool.query(
                'SELECT * FROM dishes WHERE name LIKE ? OR description LIKE ? OR category LIKE ? OR ingredients LIKE ? LIMIT 20',
                [searchParam, searchParam, searchParam, searchParam]
            );
            results.dishes = dishes;
            console.log(`   Found ${dishes.length} dishes`);
        }

        res.json(results);
    } catch (error) {
        console.error('❌ Error in search:', error.message);
        res.status(500).json({ error: 'Database error', message: error.message });
    }
});

// ========== HEALTH CHECK ==========

// Health check endpoint with database status
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        const [restaurants] = await pool.query('SELECT COUNT(*) as count FROM restaurants');
        const [dishes] = await pool.query('SELECT COUNT(*) as count FROM dishes');
        
        res.json({ 
            status: 'OK',
            timestamp: new Date().toISOString(),
            database: {
                status: 'connected',
                type: 'MySQL',
                restaurants: restaurants[0].count,
                dishes: dishes[0].count
            },
            api: {
                version: '1.0.0',
                endpoints: [
                    'GET /api/restaurants',
                    'GET /api/restaurants/:id',
                    'GET /api/restaurants/:id/menu',
                    'GET /api/dishes',
                    'GET /api/dishes/:id',
                    'GET /api/dishes/:id/restaurants',
                    'GET /api/search'
                ]
            }
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'ERROR',
            timestamp: new Date().toISOString(),
            database: {
                status: 'disconnected',
                error: error.message
            }
        });
    }
});

// 404 handler
app.use((req, res) => {
    console.log(`⚠️  404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ 
        error: 'Endpoint not found',
        method: req.method,
        path: req.url,
        hint: 'Check /health endpoint for available API routes'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: err.message
    });
});

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
    // Test database connection first
    const dbOk = await testDatabaseConnection();
    
    if (!dbOk) {
        console.error('\n⚠️  WARNING: Database connection failed!');
        console.error('Server will start but API calls will fail.\n');
    }
    
    app.listen(PORT, () => {
        console.log('\n====================================');
        console.log('🚀 RESTOR-1 API SERVER');
        console.log('====================================');
        console.log(`📡 Server running on: http://localhost:${PORT}`);
        console.log(`🏥 Health check: http://localhost:${PORT}/health`);
        console.log(`📚 API endpoints: http://localhost:${PORT}/health`);
        console.log('====================================');
        console.log(`🗺️  OpenStreetMap + Leaflet ready`);
        console.log(`📊 Database: MySQL (restor1_db)`);
        console.log('====================================\n');
        
        if (!dbOk) {
            console.log('⚠️  IMPORTANT: Fix database connection before using the system!\n');
        } else {
            console.log('✅ System ready! Open frontend/index.html in your browser\n');
        }
    });
}

startServer();
