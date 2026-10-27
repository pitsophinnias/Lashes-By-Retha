const { Pool } = require('pg')

// Local Postgres (DATABASE_URL pointing at localhost) has no SSL listener,
// but managed providers like Render require it.
const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
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

    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL,
      name VARCHAR(255) NOT NULL,
      whatsapp VARCHAR(50) NOT NULL,
      payment_status VARCHAR(50) NOT NULL DEFAULT 'unpaid',
      notes TEXT DEFAULT '',
      enrolled_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      email VARCHAR(255),
      password_hash VARCHAR(255) NOT NULL,
      role_id INTEGER REFERENCES roles(id),
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      username VARCHAR(100),
      action VARCHAR(255) NOT NULL,
      details TEXT,
      ip_address VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      detail VARCHAR(255) NOT NULL DEFAULT '',
      price NUMERIC(10,2) NOT NULL DEFAULT 0,
      badge VARCHAR(100),
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER NOT NULL DEFAULT 3,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id),
      change INTEGER NOT NULL,
      reason VARCHAR(50) NOT NULL,
      order_id INTEGER REFERENCES orders(id),
      user_id INTEGER REFERENCES users(id),
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id),
      length_mm INTEGER NOT NULL,
      curl VARCHAR(10) NOT NULL,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER NOT NULL DEFAULT 3,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (product_id, length_mm, curl)
    );
  `)

  // order_items and stock_movements predate lash length/curl options; add the
  // columns needed to record which option an order line or stock change was
  // for for existing installs, without touching rows that already exist.
  await pool.query(`
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id);
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS length_mm INTEGER;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS curl VARCHAR(10);
    ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id);
  `)

  // Delivery/pickup fields on orders. Nullable so existing orders placed
  // before this feature keep working - the admin screen shows them as
  // "Not recorded" rather than guessing.
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilment_method VARCHAR(20);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address VARCHAR(255);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_suburb VARCHAR(255);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_city VARCHAR(255);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_postal_code VARCHAR(20);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_notes TEXT;
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

  // Seed roles if none exist
  const { rows: roleRows } = await pool.query('SELECT COUNT(*) FROM roles')
  if (parseInt(roleRows[0].count) === 0) {
    await pool.query(`
      INSERT INTO roles (name, description) VALUES
        ('sysadmin', 'Full system access including user management, audit logs and system settings'),
        ('owner', 'Business operations including orders, products, classes and business notifications'),
        ('staff', 'Read-only access to dashboard and order confirmation only')
      ON CONFLICT (name) DO NOTHING;
    `)
    console.log('Roles seeded')
  }

  // Seed sysadmin user if none exist
  const { rows: userRows } = await pool.query('SELECT COUNT(*) FROM users')
  if (parseInt(userRows[0].count) === 0) {
    const isProd = process.env.NODE_ENV === 'production'
    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || (isProd ? null : 'hbh@1234')
    if (!defaultPassword) {
      console.error('ADMIN_DEFAULT_PASSWORD is required in production. Skipping sysadmin seed.')
    } else {
      const bcrypt = require('bcrypt')
      const hash = await bcrypt.hash(defaultPassword, 12)
      const roleResult = await pool.query("SELECT id FROM roles WHERE name = 'sysadmin'")
      await pool.query(
        `INSERT INTO users (username, email, password_hash, role_id, must_change_password)
         VALUES ($1, $2, $3, $4, TRUE)`,
        ['Pitso', 'pitso@hairbyher.co.za', hash, roleResult.rows[0].id]
      )
      console.log('Sysadmin user seeded: Pitso')
    }
  }

  // Seed products if none exist. Ids 1-4 are kept exactly as the old
  // hard-coded list used them, because uploaded images, image positions
  // and section assignments are all keyed by these same ids.
  const { rows: productRows } = await pool.query('SELECT COUNT(*) FROM products')
  if (parseInt(productRows[0].count) === 0) {
    await pool.query(`
      INSERT INTO products (id, name, description, detail, price, badge, stock_quantity, low_stock_threshold, is_active) VALUES
        (1, 'Classic Lash Trays', 'Professional classic lash trays for individual lash extensions. Perfect for creating a natural, elegant look.', 'Diameter: 0.15 | Curl: D', 130, NULL, 10, 3, TRUE),
        (2, 'YY Lash Trays', 'YY lash trays designed for a wispy, textured finish. Ideal for creating that effortlessly full look.', 'Diameter: 0.07 | Curl: D', 150, 'Popular', 10, 3, TRUE),
        (3, 'Volume Lash Trays', 'Ultra-fine volume lash trays for handmade fans and Russian volume sets. Available in two curl options.', 'Diameter: 0.05 | Curl: Cc & D', 150, 'Pro Pick', 10, 3, TRUE),
        (4, 'Lash Shampoo and Cleansing Brush Combo', 'Keep your lash extensions clean and fresh with our gentle foaming lash shampoo paired with a soft cleansing brush.', 'Recommended for daily use', 100, 'Best Seller', 10, 3, TRUE)
      ON CONFLICT (id) DO NOTHING;
    `)
    // Keep the id sequence ahead of the explicit ids above, so the next
    // product created through the admin dashboard gets id 5, not a clash.
    await pool.query(`SELECT setval('products_id_seq', (SELECT MAX(id) FROM products))`)
    console.log('Products seeded')
  }

  // One-time detail-text update for the lash trays, now that they carry
  // length options. Only touches rows still holding the old text, so an
  // owner who has since edited a product's detail by hand keeps their edit.
  await pool.query(
    `UPDATE products SET detail = $1 WHERE id = 1 AND detail = $2`,
    ['Diameter: 0.15 | Curl: D | Lengths: 10mm to 16mm', 'Diameter: 0.15 | Curl: D']
  )
  await pool.query(
    `UPDATE products SET detail = $1 WHERE id = 2 AND detail = $2`,
    ['Diameter: 0.07 | Curl: D | Lengths: 7mm to 18mm', 'Diameter: 0.07 | Curl: D']
  )
  await pool.query(
    `UPDATE products SET detail = $1 WHERE id = 3 AND detail = $2`,
    ['Diameter: 0.05 | Curl: CC & D | Lengths: 9mm to 16mm', 'Diameter: 0.05 | Curl: Cc & D']
  )

  // Seed lash length/curl options if none exist yet. Stock of 5 per option
  // is a placeholder for the owner to correct once real counts are known.
  const { rows: variantRows } = await pool.query('SELECT COUNT(*) FROM product_variants')
  if (parseInt(variantRows[0].count) === 0) {
    const options = []
    for (let mm = 10; mm <= 16; mm++) options.push([1, mm, 'D'])          // Classic
    for (let mm = 7; mm <= 18; mm++) options.push([2, mm, 'D'])           // YY
    for (let mm = 9; mm <= 16; mm++) { options.push([3, mm, 'CC']); options.push([3, mm, 'D']) } // Volume

    const values = options.map((_, i) =>
      `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3}, 5)`
    ).join(', ')
    const params = options.flat()
    await pool.query(
      `INSERT INTO product_variants (product_id, length_mm, curl, stock_quantity) VALUES ${values}
       ON CONFLICT (product_id, length_mm, curl) DO NOTHING`,
      params
    )
    console.log(`Product options seeded (${options.length})`)
  }

  console.log('Database tables ready')
}

module.exports = { pool, createTables }
