const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

// Load JSON data
let restaurantsData = [];
let dishesData = [];

try {
    const restaurantsPath = path.join(__dirname, '../database/БД(Заведений) (2).json');
    const dishesPath = path.join(__dirname, '../database/dishes_export.json');
    
    const restaurantsFile = JSON.parse(fs.readFileSync(restaurantsPath, 'utf8'));
    restaurantsData = restaurantsFile.restaurants || [];
    dishesData = JSON.parse(fs.readFileSync(dishesPath, 'utf8'));
    
    // Filter out empty objects and objects without names
    dishesData = dishesData.filter(dish => 
        dish && typeof dish === 'object' && dish.name && typeof dish.name === 'string' && dish.name.trim() !== ''
    );
    
    // Add coordinates to restaurants without them (Almaty area)
    restaurantsData = restaurantsData.map(restaurant => {
        if (!restaurant.latitude || !restaurant.longitude) {
            // Random coordinates in Almaty area (43.2-43.3 lat, 76.8-77.0 lng)
            restaurant.latitude = 43.2 + Math.random() * 0.1;
            restaurant.longitude = 76.8 + Math.random() * 0.2;
        }
        return restaurant;
    });
    
    console.log(`📦 Loaded ${restaurantsData.length} restaurants from JSON`);
    console.log(`📦 Loaded ${dishesData.length} dishes from JSON`);
} catch (error) {
    console.warn('⚠️ Could not load JSON data:', error.message);
}

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

// Test database connection on startup (optional for JSON mode)
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
        console.warn('⚠️ MySQL database not available - using JSON data only');
        console.warn('This is normal if you\'re running in JSON-only mode');
        return false;
    }
}

// ========== RESTAURANTS ==========

// Get all restaurants
app.get('/api/restaurants', async (req, res) => {
    try {
        // Return data from JSON files
        console.log(`✅ Retrieved ${restaurantsData.length} restaurants from JSON`);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(restaurantsData);
    } catch (error) {
        console.error('❌ Error fetching restaurants:', error.message);
        res.status(500).json({ 
            error: 'Database error', 
            message: error.message,
            hint: 'Check if JSON files exist'
        });
    }
});

// Get restaurant by ID
app.get('/api/restaurants/:id', async (req, res) => {
    try {
        const restaurant = restaurantsData.find(r => r.id == req.params.id);
        if (!restaurant) {
            console.log(`⚠️  Restaurant not found: ID ${req.params.id}`);
            return res.status(404).json({ error: 'Restaurant not found' });
        }
        console.log(`✅ Retrieved restaurant: ${restaurant.name}`);
        res.json(restaurant);
    } catch (error) {
        console.error('❌ Error fetching restaurant:', error.message);
        res.status(500).json({ error: 'Database error', message: error.message });
    }
});

// Get restaurant menu
app.get('/api/restaurants/:id/menu', async (req, res) => {
    try {
        const restaurantId = parseInt(req.params.id);
        const menu = dishesData.filter(dish => 
            dish.restaurants && dish.restaurants.includes(restaurantId)
        );
        console.log(`✅ Retrieved ${menu.length} dishes for restaurant ID ${restaurantId}`);
        res.json(menu);
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
        let filteredDishes = [...dishesData];

        if (search) {
            const searchLower = search.toLowerCase();
            filteredDishes = filteredDishes.filter(dish => 
                dish.name.toLowerCase().includes(searchLower) ||
                (dish.category && dish.category.toLowerCase().includes(searchLower)) ||
                (dish.ingredients && dish.ingredients.some(ing => ing.toLowerCase().includes(searchLower)))
            );
            console.log(`🔍 Searching dishes for: "${search}"`);
        }
        if (category) {
            filteredDishes = filteredDishes.filter(dish => dish.category === category);
        }
        if (min_price) {
            filteredDishes = filteredDishes.filter(dish => dish.price >= parseFloat(min_price));
        }
        if (max_price) {
            filteredDishes = filteredDishes.filter(dish => dish.price <= parseFloat(max_price));
        }

        filteredDishes.sort((a, b) => a.name.localeCompare(b.name));
        console.log(`✅ Found ${filteredDishes.length} dishes`);
        res.json(filteredDishes);
    } catch (error) {
        console.error('❌ Error fetching dishes:', error.message);
        res.status(500).json({ error: 'Database error', message: error.message });
    }
});

// Get dish by ID
app.get('/api/dishes/:id', async (req, res) => {
    try {
        const dish = dishesData.find(d => d.id == req.params.id);
        if (!dish) {
            console.log(`⚠️  Dish not found: ID ${req.params.id}`);
            return res.status(404).json({ error: 'Dish not found' });
        }
        console.log(`✅ Retrieved dish: ${dish.name}`);
        res.json(dish);
    } catch (error) {
        console.error('❌ Error fetching dish:', error.message);
        res.status(500).json({ error: 'Database error', message: error.message });
    }
});

// Get restaurants where dish is available
app.get('/api/dishes/:id/restaurants', async (req, res) => {
    try {
        const dishId = parseInt(req.params.id);
        const dish = dishesData.find(d => d.id === dishId);
        if (!dish || !dish.restaurants) {
            return res.json([]);
        }
        const availableRestaurants = restaurantsData.filter(r => 
            dish.restaurants.includes(r.id)
        );
        console.log(`✅ Dish ID ${dishId} available in ${availableRestaurants.length} restaurants`);
        res.json(availableRestaurants);
    } catch (error) {
        console.error('❌ Error fetching restaurants for dish:', error.message);
        res.status(500).json({ error: 'Database error', message: error.message });
    }
});

// ========== SEARCH ==========

// Unified search (by restaurant name and dish name)
app.get('/api/search', async (req, res) => {
    try {
        const { query, type = 'all' } = req.query;
        if (!query) {
            console.log('⚠️  Search query is empty');
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        console.log(`🔍 Unified search: "${query}" (type: ${type})`);
        const results = {};
        
        // Split query into multiple search terms
        const queries = query.split(',').map(q => q.trim().toLowerCase()).filter(q => q.length > 0);

        if (type === 'all' || type === 'restaurants') {
            const foundRestaurants = restaurantsData.filter(r => 
                queries.some(q =>
                    r.name.toLowerCase().includes(q) ||
                    (r.address && r.address.toLowerCase().includes(q)) ||
                    (r.type && r.type.toLowerCase().includes(q))
                )
            ).slice(0, 20);
            results.restaurants = foundRestaurants;
            console.log(`   Found ${foundRestaurants.length} restaurants`);
        }

        if (type === 'all' || type === 'dishes') {
            const foundDishes = dishesData.filter(d => 
                d && typeof d === 'object' && d.name &&
                queries.some(q =>
                    d.name.toLowerCase().includes(q) ||
                    (d.category && d.category.toLowerCase().includes(q)) ||
                    (d.ingredients && d.ingredients.some(ing => 
                        typeof ing === 'string' && ing.toLowerCase().includes(q)
                    ))
                )
            ).slice(0, 20);
            results.dishes = foundDishes;
            console.log(`   Found ${foundDishes.length} dishes`);
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
        res.json({ 
            status: 'OK',
            timestamp: new Date().toISOString(),
            database: {
                status: 'JSON files',
                type: 'In-memory',
                restaurants: restaurantsData.length,
                dishes: dishesData.length
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
    // Test database connection (optional)
    const dbOk = await testDatabaseConnection();
    
    app.listen(PORT, () => {
        console.log('\n====================================');
        console.log('🚀 RESTOR-1 API SERVER');
        console.log('====================================');
        console.log(`📡 Server running on: http://localhost:${PORT}`);
        console.log(`🏥 Health check: http://localhost:${PORT}/health`);
        console.log(`📚 API endpoints: http://localhost:${PORT}/health`);
        console.log('====================================');
        console.log(`🗺️  OpenStreetMap + Leaflet ready`);
        console.log(`📊 Data source: JSON files (${restaurantsData.length} restaurants, ${dishesData.length} dishes)`);
        console.log('====================================\n');
        
        if (dbOk) {
            console.log('✅ MySQL database connected');
        } else {
            console.log('📄 Using JSON data files (MySQL not required)');
        }
        console.log('✅ System ready! Open frontend/index.html in your browser\n');
    });
}

startServer();
