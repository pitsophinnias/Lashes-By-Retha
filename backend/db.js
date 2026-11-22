const { Pool, types } = require('pg')
const siteSettingsDefaults = require('./src/siteSettings/defaults')
const systemSettingsDefaults = require('./src/systemSettings/defaults')

// pg's default DATE parser builds a JS Date at local midnight - serialising
// that with toISOString() (as res.json() does) can silently shift the date
// by a day depending on the server's local timezone. A plain-date column
// (preferred_start_date, promised_by_date) has no time component anyway, so
// keep it as the raw 'YYYY-MM-DD' string instead. OID 1082 = date.
types.setTypeParser(1082, (value) => value)

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

    CREATE TABLE IF NOT EXISTS media (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      item_id INTEGER NOT NULL,
      url VARCHAR(500) NOT NULL,
      public_id VARCHAR(255),
      resource_type VARCHAR(20),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (type, item_id)
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

    CREATE TABLE IF NOT EXISTS site_settings (
      key VARCHAR(20) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS site_settings_history (
      id SERIAL PRIMARY KEY,
      key VARCHAR(20) NOT NULL,
      value JSONB NOT NULL,
      saved_at TIMESTAMPTZ DEFAULT NOW(),
      saved_by INTEGER REFERENCES users(id)
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

  // Cloudinary public id for a gallery file, so it can be migrated or
  // removed from Cloudinary later without re-deriving it from the filename.
  await pool.query(`
    ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS public_id VARCHAR(255);
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

  // Ozow pay-by-bank support. payment_method/payment_status default every
  // existing and future EFT order to exactly today's behaviour; public_token
  // lets the customer site look up its own order without logging in.
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'eft';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS public_token VARCHAR(64) UNIQUE;

    CREATE TABLE IF NOT EXISTS ozow_payments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id),
      transaction_reference VARCHAR(50) UNIQUE NOT NULL,
      ozow_transaction_id VARCHAR(50),
      amount NUMERIC(10,2) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'started',
      status_message TEXT,
      is_test BOOLEAN,
      raw_notification JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  // Orders auto-archive after 7 days, like notifications already do - see
  // archiveOldOrders in index.js.
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
  `)

  // Lets a student "finish" a class instead of being deleted, so Retha keeps
  // a history of past students. Existing students default to active.
  await pool.query(`
    ALTER TABLE students ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
    ALTER TABLE students ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
  `)

  // Payflex buy-now-pay-later support, mirroring the Ozow payments table.
  // customer_email is needed for Payflex orders; nullable since Ozow/old EFT
  // orders never collected one.
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);

    CREATE TABLE IF NOT EXISTS payflex_payments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id),
      merchant_reference VARCHAR(50) UNIQUE NOT NULL,
      payflex_order_id VARCHAR(100),
      amount NUMERIC(10,2) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'started',
      raw_status JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  // Online training enrolment. courses mirrors the 3 hard-coded classes both
  // frontends already show, keyed by the same ids, so uploaded images and
  // existing students (students.class_id) keep working unchanged.
  // ozow_payments/payflex_payments are shared between shop orders and
  // training payments - exactly one of order_id/student_id is set per row,
  // enforced in application code; purpose defaults to 'order' so every
  // existing payment row (all of which were for orders) keeps that meaning.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS courses (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      duration_days INTEGER NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      deposit NUMERIC(10,2) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE students ADD COLUMN IF NOT EXISTS email VARCHAR(255);
    ALTER TABLE students ADD COLUMN IF NOT EXISTS preferred_start_date DATE;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS public_token VARCHAR(64) UNIQUE;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'admin';

    ALTER TABLE ozow_payments ADD COLUMN IF NOT EXISTS student_id INTEGER REFERENCES students(id);
    ALTER TABLE ozow_payments ADD COLUMN IF NOT EXISTS purpose VARCHAR(20) NOT NULL DEFAULT 'order';
    ALTER TABLE payflex_payments ADD COLUMN IF NOT EXISTS student_id INTEGER REFERENCES students(id);
    ALTER TABLE payflex_payments ADD COLUMN IF NOT EXISTS purpose VARCHAR(20) NOT NULL DEFAULT 'order';
  `)

  // System controls: maintenance mode and payment provider switches, mirroring
  // site_settings's key/value/updated_at/updated_by shape. payment_events logs
  // rejected Ozow notifications/Payflex callbacks and valid confirmations (for
  // "last confirmation received"), for the sysadmin Payments monitor - never
  // secrets or a full request body, just enough to see what happened and when.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payment_events (
      id SERIAL PRIMARY KEY,
      provider VARCHAR(20) NOT NULL,
      reason VARCHAR(50) NOT NULL,
      reference VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  for (const key of Object.keys(systemSettingsDefaults)) {
    await pool.query(
      `INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [key, systemSettingsDefaults[key]]
    )
  }

  // Error log for the sysadmin Errors page - see src/errorLog/store.js's
  // logError, which is the only thing that ever writes to this table.
  // route/method/status describe the request, never its body; message is
  // already stripped of anything that looks like a secret, email or phone
  // number before it gets here.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS error_log (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      level VARCHAR(20) NOT NULL DEFAULT 'error',
      context VARCHAR(255),
      message TEXT,
      route VARCHAR(255),
      method VARCHAR(10),
      status INTEGER,
      user_id INTEGER REFERENCES users(id),
      resolved_at TIMESTAMPTZ
    );
  `)

  // Marks sandbox/UAT orders and training enrolments so Retha's owner/staff
  // views never see them - set automatically (see index.js's
  // markOrderTestIfNeeded/markStudentTestIfNeeded and the startup backfill
  // next to createTables()'s call site) or by hand by a sysadmin. Once set,
  // never auto-cleared - only a sysadmin unmarks a row.
  // notifications.order_id/student_id tag a notification to the order/
  // student it came from, so a test one can be hidden the same way.
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id);
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS student_id INTEGER REFERENCES students(id);
  `)

  // Bumped by "log out everywhere" (see POST /api/admin/users/:id/logout-
  // everywhere) - authenticate checks this against the token's own claim on
  // every request, so a bump invalidates every token issued before it,
  // immediately, without waiting for them to expire.
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
  `)

  // One row per backup attempt, reported by backend/scripts/backup.sh
  // running on the server that actually hosts the database - see POST
  // /api/system/backups/report. Nothing else ever writes to this table.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS backup_runs (
      id SERIAL PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ,
      status VARCHAR(20) NOT NULL,
      size_bytes BIGINT,
      location VARCHAR(255),
      message TEXT
    );
  `)

  // Wig pre-orders: a customer pays a deposit with Ozow, then the balance
  // once the item has arrived at the studio. preorder_deposit is set per
  // product by the owner; lead time (how many days until ready) is a single
  // business-wide setting, not stored per product - see
  // systemSettingsDefaults.preorders. ozow_payments/notifications gain a
  // third nullable reference, alongside order_id/student_id - exactly one of
  // the three is ever set per row, enforced in application code.
  await pool.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS preorder_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS preorder_deposit NUMERIC(10,2) NOT NULL DEFAULT 500;

    CREATE TABLE IF NOT EXISTS preorders (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      customer_name VARCHAR(255) NOT NULL,
      customer_phone VARCHAR(50) NOT NULL,
      customer_email VARCHAR(255) NOT NULL,
      fulfilment_method VARCHAR(20) NOT NULL,
      delivery_address VARCHAR(255),
      delivery_suburb VARCHAR(255),
      delivery_city VARCHAR(255),
      delivery_postal_code VARCHAR(20),
      delivery_notes TEXT,
      price_at_order NUMERIC(10,2) NOT NULL,
      deposit_amount NUMERIC(10,2) NOT NULL,
      delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
      amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'awaiting_deposit',
      dispatched_at TIMESTAMPTZ,
      courier_tracking VARCHAR(100),
      public_token VARCHAR(64) UNIQUE,
      is_test BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      arrived_at TIMESTAMPTZ,
      order_id INTEGER REFERENCES orders(id),
      promised_by_date DATE
    );

    ALTER TABLE ozow_payments ADD COLUMN IF NOT EXISTS preorder_id INTEGER REFERENCES preorders(id);
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS preorder_id INTEGER REFERENCES preorders(id);
  `)

  // Seed courses if none exist, using the same ids and values as the
  // hard-coded CLASSES list both frontends used before this table existed.
  const { rows: courseRows } = await pool.query('SELECT COUNT(*) FROM courses')
  if (parseInt(courseRows[0].count) === 0) {
    await pool.query(`
      INSERT INTO courses (id, name, duration_days, price, deposit) VALUES
        (1, 'Classic Individual Lash Training', 1, 2500, 500),
        (2, 'Classic Individual Lash Training', 2, 4000, 500),
        (3, 'Advanced Individual Lash Training', 4, 6000, 500)
      ON CONFLICT (id) DO NOTHING;
    `)
    await pool.query(`SELECT setval('courses_id_seq', (SELECT MAX(id) FROM courses))`)
    console.log('Courses seeded')
  }

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

  // "Shop by category" grid on the customer site - position orders the
  // category cards, image_url/image_public_id hold an optional Cloudinary
  // cover photo per category (mirrors media's url/public_id columns, but
  // kept directly on categories since there's only ever one cover image).
  await pool.query(`
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS position INTEGER;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_public_id TEXT;
  `)

  // One-time initial order for whichever of these categories already exist
  // (matched case-insensitively by name) - never creates a missing one,
  // Retha adds those herself in the admin. Guarded on no category having a
  // position yet, so this never runs again once any category has one,
  // whether from this migration or a sysadmin/owner reordering afterwards.
  const { rows: positionedRows } = await pool.query('SELECT COUNT(*) FROM categories WHERE position IS NOT NULL')
  if (parseInt(positionedRows[0].count) === 0) {
    const desiredOrder = ['Wigs', 'Nigerian Makeup', 'Lash extensions', 'Lash disposables', 'Lash tools & accessories']
    const allCategories = (await pool.query('SELECT id, name FROM categories ORDER BY id ASC')).rows
    const assignedIds = new Set()
    for (let i = 0; i < desiredOrder.length; i++) {
      const match = allCategories.find(c => c.name.toLowerCase() === desiredOrder[i].toLowerCase())
      if (match) {
        await pool.query('UPDATE categories SET position = $1 WHERE id = $2', [i + 1, match.id])
        assignedIds.add(match.id)
      }
    }
    let nextPosition = desiredOrder.length + 1
    for (const cat of allCategories) {
      if (assignedIds.has(cat.id)) continue
      await pool.query('UPDATE categories SET position = $1 WHERE id = $2', [nextPosition, cat.id])
      nextPosition++
    }
    if (allCategories.length > 0) console.log('Initial category order set')
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

  // Classic and YY lash trays (ids 1 and 2) now also come in CC curl, like
  // Volume. Only touches a product's detail text once its old D-only text
  // is still in place, so an owner who has since edited it by hand keeps
  // their edit.
  await pool.query(
    `UPDATE products SET detail = $1 WHERE id = 1 AND detail = $2`,
    ['Diameter: 0.15 | Curl: CC & D | Lengths: 10mm to 16mm', 'Diameter: 0.15 | Curl: D | Lengths: 10mm to 16mm']
  )
  await pool.query(
    `UPDATE products SET detail = $1 WHERE id = 2 AND detail = $2`,
    ['Diameter: 0.07 | Curl: CC & D | Lengths: 7mm to 18mm', 'Diameter: 0.07 | Curl: D | Lengths: 7mm to 18mm']
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

  // Classic (id 1) and YY (id 2) lash trays now also come in CC curl, same
  // as Volume. One-time, guarded by product: only adds CC options for a
  // product that has none yet, at the same lengths as its existing D
  // options, and never touches existing D options or their stock.
  for (const productId of [1, 2]) {
    const { rows: ccRows } = await pool.query(
      'SELECT COUNT(*) FROM product_variants WHERE product_id = $1 AND curl = $2',
      [productId, 'CC']
    )
    if (parseInt(ccRows[0].count) > 0) continue

    const { rows: lengthRows } = await pool.query(
      'SELECT length_mm FROM product_variants WHERE product_id = $1 AND curl = $2',
      [productId, 'D']
    )
    if (lengthRows.length === 0) continue

    const values = lengthRows.map((_, i) => `($1, $${i + 2}, 'CC', 0)`).join(', ')
    const params = [productId, ...lengthRows.map(r => r.length_mm)]
    await pool.query(
      `INSERT INTO product_variants (product_id, length_mm, curl, stock_quantity) VALUES ${values}
       ON CONFLICT (product_id, length_mm, curl) DO NOTHING`,
      params
    )
    console.log(`CC curl options added for product ${productId}`)
  }

  // Seed site settings defaults if a key has no row, so the public endpoint
  // and admin dashboard always have a full content/theme object to read,
  // even before an owner or sysadmin has customised anything.
  for (const key of ['content', 'theme']) {
    await pool.query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [key, siteSettingsDefaults[key]]
    )
  }

  // One-time cleanup: the backend used to add a "Dashboard ready" system
  // notification on every startup, which just piled up as noise in the
  // owner's notification feed. Nothing creates these anymore; this removes
  // any that are still there. Matches on the exact title and message only,
  // so no other notification is ever touched. Safe to run every start -
  // deletes zero rows once they're gone.
  const { rowCount: dashboardReadyRemoved } = await pool.query(
    `DELETE FROM notifications WHERE type = 'system' AND title = $1 AND message = $2`,
    ['Dashboard ready', 'Hair By Her admin dashboard is live and running.']
  )
  if (dashboardReadyRemoved > 0) {
    console.log(`Removed ${dashboardReadyRemoved} old "Dashboard ready" notification(s)`)
  }

  // General named product options (e.g. foundation shades), separate from
  // the lash length/curl variants - a product uses one or the other, never
  // both (enforced in application code). option_label names the picker
  // ("Shade", "Colour", "Size"); NULL means the product has no custom
  // options. order_items/preorders carry a snapshot of the chosen option's
  // name (option_name) so it stays correct even if the option is later
  // renamed or deactivated - the live row is still linked by id for stock.
  await pool.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS option_label VARCHAR(30);

    CREATE TABLE IF NOT EXISTS product_options (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id),
      name VARCHAR(60) NOT NULL,
      swatch_hex VARCHAR(7),
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      position INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_option_id INTEGER REFERENCES product_options(id);
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS option_name VARCHAR(60);
    ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS product_option_id INTEGER REFERENCES product_options(id);
    ALTER TABLE preorders ADD COLUMN IF NOT EXISTS product_option_id INTEGER REFERENCES product_options(id);
    ALTER TABLE preorders ADD COLUMN IF NOT EXISTS option_name VARCHAR(60);
  `)
  // A plain UNIQUE(product_id, name) can't express the case-insensitive
  // match ("Cashew" and "cashew" are the same shade) - a functional unique
  // index is the only way to enforce that at the database level.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS product_options_product_lower_name_idx
      ON product_options (product_id, lower(name));
  `)

  // Soft delete + manual sale pricing for products and their options. A
  // product with no history (no orders/stock movements/preorders) is hard
  // deleted instead - deleted_at only applies to the soft-delete path, kept
  // so old orders/analytics can still show the product's name and price.
  // sale_price/on_sale mirror each other on products, product_variants and
  // product_options: the owner switches a sale on/off herself (no dates),
  // per option, and ending a sale clears on_sale but keeps sale_price so the
  // same discount can be turned back on later without retyping it.
  await pool.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10,2);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS on_sale BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10,2);
    ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS on_sale BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE product_options ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10,2);
    ALTER TABLE product_options ADD COLUMN IF NOT EXISTS on_sale BOOLEAN NOT NULL DEFAULT FALSE;
  `)

  // Order-item and pre-order price snapshots: what the customer actually
  // paid (already captured in price/price_at_order) alongside the normal
  // price it was discounted from, so analytics never has to look at
  // today's product price to know what a past sale was worth. Backfilled
  // from the existing price for every row that predates this column, which
  // is equivalent to "no discount" for orders placed before sales existed.
  // Nullable rather than NOT NULL - a handful of tests insert order_items/
  // preorders rows directly without going through the app's own routes
  // (which always set these), and defaulting a column to another column's
  // value isn't possible in a plain DEFAULT. Every row written through the
  // app has both set; only ad-hoc/direct-SQL rows (test fixtures, and old
  // rows before this migration) can be NULL.
  await pool.query(`
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2);
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE order_items ALTER COLUMN original_price DROP NOT NULL;
    UPDATE order_items SET original_price = price WHERE original_price IS NULL;

    ALTER TABLE preorders ADD COLUMN IF NOT EXISTS original_price_at_order NUMERIC(10,2);
    ALTER TABLE preorders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE preorders ALTER COLUMN original_price_at_order DROP NOT NULL;
    UPDATE preorders SET original_price_at_order = price_at_order WHERE original_price_at_order IS NULL;
  `)

  // One row per admin login, so idle/max-session timeouts can be enforced
  // server-side (see backend/src/sessions) - the JWT itself stays stateless
  // for identity, but carries this row's id so authenticate() can look up
  // and update issued_at/last_activity_at per session, and logout/"log out
  // everywhere" can revoke one specific session without touching others.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      user_agent TEXT,
      ip_address VARCHAR(50)
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
  `)
  // CREATE TABLE IF NOT EXISTS above won't add ON DELETE CASCADE to a
  // sessions table that already exists without it - drop and re-add the
  // constraint either way, so this is safe (and a no-op) whether the table
  // is brand new or already has the right constraint.
  await pool.query(`
    ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;
    ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  `)

  // WhatsApp/email message templates - only ever holds an OWNER'S OVERRIDE
  // of a built-in default (see backend/src/messaging/templates.js), never a
  // copy of the default itself. No row for a given id means "use the
  // built-in" - that's how improving a default in code reaches every
  // template an owner hasn't touched. id is the template's own key (e.g.
  // 'order_received'), not a surrogate - there's exactly one row per
  // template, ever.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_templates (
      id VARCHAR(50) PRIMARY KEY,
      body TEXT NOT NULL,
      email_subject TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by INTEGER REFERENCES users(id)
    );
  `)

  // Lets the Dashboard's "Reminders Due" card stop nagging about the same
  // thing every day without keeping a full message history (out of scope
  // for this feature) - just enough to know "already reminded, and about
  // what" so a reminder only resurfaces once it's stale (see
  // ADMIN_REMINDER_SNOOZE_DAYS-equivalent in systemSettings.messaging) or
  // the reason for it has changed (e.g. a payment reminder becomes a
  // certificate warning).
  await pool.query(`
    ALTER TABLE students ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS last_reminder_type VARCHAR(30);
  `)

  // Confirmed course dates, replacing preferred_start_date as the source of
  // truth for reminders/messages: Retha must be able to record the real
  // start date she agreed with the student (not just what they originally
  // typed in) and the date the course actually ends, since tuition is due
  // in full before then - see src/messaging/reminders.js. Both start as
  // NULL and are backfilled below rather than defaulted, so a student still
  // missing them is visibly missing them (see "Missing course dates" on the
  // Dashboard), not silently wrong.
  await pool.query(`
    ALTER TABLE students ADD COLUMN IF NOT EXISTS start_date DATE;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS end_date DATE;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS certificate_on_hold BOOLEAN NOT NULL DEFAULT FALSE;
  `)
  // One-off backfill (guarded on the column still being empty, so it never
  // overwrites a date someone has since confirmed): start_date takes
  // whatever preferred_start_date already was, end_date is start_date +
  // the course's duration_days. A student with no preferred_start_date, or
  // whose class_id doesn't match a real course, can't be backfilled at all
  // and is reported below so Retha can fix it by hand.
  await pool.query(`
    UPDATE students SET start_date = preferred_start_date
    WHERE start_date IS NULL AND preferred_start_date IS NOT NULL
  `)
  await pool.query(`
    UPDATE students s SET end_date = s.start_date + c.duration_days
    FROM courses c
    WHERE c.id = s.class_id AND s.end_date IS NULL AND s.start_date IS NOT NULL
  `)
  const { rows: missingDateRows } = await pool.query(`
    SELECT id, name FROM students
    WHERE end_date IS NULL AND status IN ('awaiting_payment', 'active') AND is_test = FALSE
  `)
  if (missingDateRows.length > 0) {
    console.log(
      `Course dates backfill: ${missingDateRows.length} student(s) still missing an end date ` +
      `(no preferred start date, or no matching course) - ${missingDateRows.map(r => `#${r.id} ${r.name}`).join(', ')}`
    )
  }

  // The ledger behind a student's amount_paid - every payment, manual or
  // via a gateway, is one row here, and amount_paid/payment_status/status/
  // certificate_on_hold are always recomputed from this table's total (see
  // src/students/balance.js) rather than hand-incremented, so deleting or
  // correcting a payment reliably puts the balance (and a held-back
  // certificate) back to what it should be. payment_id is a loose pointer
  // into ozow_payments/payflex_payments (never students' own payments
  // table, there isn't one) - no FK, since it refers to one of two
  // different tables depending on source.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_payments (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      amount NUMERIC(10,2) NOT NULL,
      source VARCHAR(20) NOT NULL,
      payment_id INTEGER,
      note TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
  // One-off backfill for students who already had a non-zero amount_paid
  // before this ledger existed - one 'legacy' row carrying their existing
  // total, so the ledger's own sum matches reality from here on without
  // losing anything already paid. Guarded on the student having no ledger
  // rows yet, so this never double-counts on a later restart.
  const { rows: legacyBackfillRows } = await pool.query(`
    INSERT INTO student_payments (student_id, amount, source, note)
    SELECT id, amount_paid, 'legacy', 'Backfilled from students.amount_paid when the payment ledger was introduced'
    FROM students
    WHERE amount_paid > 0 AND id NOT IN (SELECT DISTINCT student_id FROM student_payments)
    RETURNING student_id
  `)
  if (legacyBackfillRows.length > 0) {
    console.log(`Payment ledger backfill: ${legacyBackfillRows.length} student(s) given a 'legacy' ledger row for their existing amount_paid`)
  }

  // Demo sale pricing, seeded once so both marketplace card styles can be
  // tried out: product 4 (no options) fully on sale, and product 2 (YY
  // Lash Trays) with only one of its lengths on sale, for the "From R X"
  // card. Guarded on nothing being on sale yet anywhere, so a real sale the
  // owner later switches on (or off) is never touched by this again.
  const { rows: saleRows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM products WHERE on_sale = TRUE) +
      (SELECT COUNT(*) FROM product_variants WHERE on_sale = TRUE) +
      (SELECT COUNT(*) FROM product_options WHERE on_sale = TRUE) AS count
  `)
  if (parseInt(saleRows[0].count) === 0) {
    await pool.query(`UPDATE products SET on_sale = TRUE, sale_price = 85 WHERE id = 4`)
    await pool.query(`
      UPDATE product_variants SET on_sale = TRUE, sale_price = 120
      WHERE product_id = 2 AND length_mm = 10 AND curl = 'D'
    `)
    console.log('Demo sale pricing seeded')
  }

  console.log('Database tables ready')
}

module.exports = { pool, createTables }
