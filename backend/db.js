const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const createTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS product_categories (
      product_id INTEGER NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      PRIMARY KEY (product_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_name VARCHAR(255) NOT NULL,
      customer_phone VARCHAR(50) NOT NULL,
      total NUMERIC(10,2) NOT NULL DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      qty INTEGER NOT NULL,
      price NUMERIC(10,2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      read BOOLEAN NOT NULL DEFAULT FALSE,
      archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS image_positions (
      type VARCHAR(50) NOT NULL,
      item_id INTEGER NOT NULL,
      x NUMERIC(5,2) NOT NULL DEFAULT 50,
      y NUMERIC(5,2) NOT NULL DEFAULT 50,
      PRIMARY KEY (type, item_id)
    );

    CREATE TABLE IF NOT EXISTS gallery_images (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      url VARCHAR(500) NOT NULL,
      type VARCHAR(10) NOT NULL DEFAULT 'image',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  // Seed default categories if none exist
  const { rows } = await pool.query('SELECT COUNT(*) FROM categories')
  if (parseInt(rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO categories (name) VALUES ('Lashes'), ('Wigs')
      ON CONFLICT (name) DO NOTHING;
    `)
    // Assign all 4 products to Lashes (category id 1)
    await pool.query(`
      INSERT INTO product_categories (product_id, category_id)
      VALUES (1, 1), (2, 1), (3, 1), (4, 1)
      ON CONFLICT (product_id) DO NOTHING;
    `)
  }

  console.log('Database tables ready')
}

module.exports = { pool, createTables }
