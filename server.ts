import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: any;

function initDB() {
  db = new Database("markez.db");
  db.exec("PRAGMA foreign_keys = ON;");
  console.log("Database connected and foreign keys enabled.");

  // Initialize Database
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      delivery_date DATE,
      material TEXT,
      work_type TEXT, -- Sala, Silla, Asiento Carro, Camion
      total DECIMAL(10,2),
      advance DECIMAL(10,2),
      status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      concept TEXT,
      amount DECIMAL(10,2),
      type TEXT, -- income, expense
      category TEXT,
      order_id INTEGER,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT UNIQUE,
      limit_amount DECIMAL(10,2),
      period TEXT DEFAULT 'monthly'
    );

    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      business_name TEXT,
      address TEXT,
      phone TEXT,
      logo_url TEXT,
      tax_data TEXT,
      whatsapp_template TEXT DEFAULT '*{empresa} - Confirmación de Pedido*

👤 *Cliente:* {cliente}
🛠️ *Trabajo:* {trabajo}
🧵 *Material:* {material}
📅 *Entrega:* {entrega}

💰 *Total:* \${total}
💵 *Anticipo:* \${anticipo}
📉 *Restante:* \${restante}

¡Gracias por su confianza!',
      use_whatsapp_business INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS capacity_limits (
      work_type TEXT PRIMARY KEY,
      limit_val INTEGER
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'admin'
    );

    INSERT OR IGNORE INTO profile (id, business_name) VALUES (1, 'Markez Tapicería');
    
    INSERT OR IGNORE INTO capacity_limits (work_type, limit_val) VALUES ('Sala', 2);
    INSERT OR IGNORE INTO capacity_limits (work_type, limit_val) VALUES ('Silla', 5);
    INSERT OR IGNORE INTO capacity_limits (work_type, limit_val) VALUES ('Asiento Carro', 3);
    INSERT OR IGNORE INTO capacity_limits (work_type, limit_val) VALUES ('Camion', 8);

    INSERT OR IGNORE INTO users (username, password) VALUES ('admin', 'markez2024');
  `);

  // Migration: Add use_whatsapp_business to profile if it doesn't exist
  try {
    db.prepare("ALTER TABLE profile ADD COLUMN use_whatsapp_business INTEGER DEFAULT 0").run();
  } catch (e) {
    // Column already exists or other error
  }
}

// initDB(); // Moved inside startServer

async function startServer() {
  console.log("Starting server initialization...");
  const app = express();
  const PORT = 3000;

  // Start listening immediately to avoid SERVER_SLEEPING
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is now listening on http://0.0.0.0:${PORT}`);
  });

  try {
    initDB();
    console.log("Database initialized successfully.");
  } catch (dbErr) {
    console.error("Database initialization failed:", dbErr);
  }

  // Setup Cron Jobs
  try {
    cron.schedule('0 21 * * *', async () => {
      console.log('Running daily backup at 9:00 PM...');
      try {
        const backupPath = path.join(__dirname, 'markez_backup.db');
        await db.backup(backupPath);
        console.log('Backup completed successfully at', new Date().toLocaleString());
      } catch (error) {
        console.error('Backup failed:', error);
      }
    });
  } catch (cronErr) {
    console.error("Cron setup failed:", cronErr);
  }

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Anti-cache middleware for HTML, Manifest and SW
  app.use((req, res, next) => {
    const isHtml = req.headers.accept?.includes('text/html');
    const isManifest = req.url.includes('manifest.json');
    const isSW = req.url.includes('sw.js');
    
    if (isHtml || isManifest || isSW) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  // API Routes
  app.post("/api/backup", async (req, res) => {
    try {
      const backupPath = path.join(__dirname, 'markez_backup.db');
      await db.backup(backupPath);
      res.json({ status: "ok", message: "Backup created" });
    } catch (error) {
      console.error('Backup failed:', error);
      res.status(500).json({ error: "Backup failed" });
    }
  });

  app.post("/api/restore", (req, res) => {
    try {
      const backupPath = path.join(__dirname, 'markez_backup.db');
      const dbPath = path.join(__dirname, 'markez.db');
      if (fs.existsSync(backupPath)) {
        db.close();
        fs.copyFileSync(backupPath, dbPath);
        initDB();
        res.json({ status: "ok", message: "Restore completed" });
      } else {
        res.status(404).json({ error: "No backup found" });
      }
    } catch (error) {
      console.error('Restore failed:', error);
      res.status(500).json({ error: "Restore failed" });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/config/gemini", (req, res) => {
    const key = process.env.MI_PROPIA_CLAVE || process.env.GEMINI_API_KEY || process.env.API_KEY || "";
    res.json({ 
      apiKey: key,
      prefix: key ? key.substring(0, 6) : ""
    });
  });

  // Log all API requests
  app.use("/api", (req, res, next) => {
    console.log(`[API] ${req.method} ${req.url}`);
    next();
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ? AND password = ?").get(username, password);
    if (user) {
      res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    } else {
      res.status(401).json({ success: false, message: "Credenciales inválidas" });
    }
  });

  app.post("/api/auth/change-password", (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: "Faltan datos" });
      }

      const adminUser = db.prepare("SELECT * FROM users WHERE username = 'admin' AND password = ?").get(oldPassword);
      if (!adminUser) {
        return res.status(401).json({ error: "Contraseña antigua incorrecta" });
      }

      db.prepare("UPDATE users SET password = ? WHERE username = 'admin'").run(newPassword);
      res.json({ status: "ok" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Error al cambiar la contraseña" });
    }
  });

  app.post("/api/import", (req, res) => {
    const { orders, transactions, profile, customLimits } = req.body;
    
    try {
      // Disable foreign keys temporarily for import - MUST be outside transaction
      db.exec("PRAGMA foreign_keys = OFF;");
      
      db.transaction(() => {
        // Clear existing data (except users)
        // Delete in order to respect constraints even if pragma failed
        db.prepare("DELETE FROM transactions").run();
        db.prepare("DELETE FROM orders").run();
        
        // Restore orders
        const insertOrder = db.prepare(`
          INSERT INTO orders (id, customer_name, phone, address, registration_date, delivery_date, material, work_type, total, advance, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        (orders || []).forEach((o: any) => {
          insertOrder.run(
            o.id ?? null, 
            o.customer_name ?? null, 
            o.phone ?? null, 
            o.address ?? null, 
            o.registration_date ?? null, 
            o.delivery_date ?? null, 
            o.material ?? null, 
            o.work_type ?? null, 
            o.total ?? null, 
            o.advance ?? null, 
            o.status ?? null
          );
        });

        // Restore transactions
        const insertTrans = db.prepare(`
          INSERT INTO transactions (id, date, concept, amount, type, category, order_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        (transactions || []).forEach((t: any) => {
          insertTrans.run(
            t.id ?? null, 
            t.date ?? null, 
            t.concept ?? null, 
            t.amount ?? null, 
            t.type ?? null, 
            t.category ?? null, 
            t.order_id ?? null
          );
        });

        // Restore profile
        if (profile) {
          db.prepare(`
            UPDATE profile 
            SET business_name = ?, address = ?, phone = ?, whatsapp_template = ?, use_whatsapp_business = ?, logo_url = ?
            WHERE id = 1
          `).run(
            profile.business_name ?? null, 
            profile.address ?? null, 
            profile.phone ?? null, 
            profile.whatsapp_template ?? null, 
            profile.use_whatsapp_business ? 1 : 0, 
            profile.logo_url ?? null
          );
        }

        // Restore limits
        if (customLimits) {
          const updateLimit = db.prepare("UPDATE capacity_limits SET limit_val = ? WHERE work_type = ?");
          Object.entries(customLimits).forEach(([type, val]) => {
            updateLimit.run(val ?? null, type ?? null);
          });
        }
      })();
      
      res.json({ success: true });
    } catch (error) {
      console.error("Import error details:", error);
      res.status(500).json({ 
        error: "Error al restaurar datos", 
        details: error instanceof Error ? error.message : String(error) 
      });
    } finally {
      // Re-enable foreign keys always
      db.exec("PRAGMA foreign_keys = ON;");
    }
  });

  app.get("/api/orders", (req, res) => {
    try {
      const orders = db.prepare("SELECT * FROM orders ORDER BY registration_date DESC").all();
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Error al obtener pedidos" });
    }
  });

  app.post("/api/orders", (req, res) => {
    try {
      const { 
        customer_name, phone, address, delivery_date, material, work_type, total, advance
      } = req.body;
      const info = db.prepare(`
        INSERT INTO orders (
          customer_name, phone, address, delivery_date, material, work_type, total, advance
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        customer_name ?? null, 
        phone ?? null, 
        address ?? null, 
        delivery_date ?? null, 
        material ?? null, 
        work_type ?? null, 
        total ?? null, 
        advance ?? null
      );
      
      // Auto-create income transaction if advance > 0
      if (advance > 0) {
        db.prepare(`
          INSERT INTO transactions (concept, amount, type, category, order_id)
          VALUES (?, ?, 'income', 'Anticipo', ?)
        `).run(`Anticipo de ${customer_name}`, advance, info.lastInsertRowid);
      }

      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ error: "Error al crear el pedido" });
    }
  });

  app.post("/api/orders/:id/complete", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      console.log(`[API] Intentando completar pedido ID: ${id}`);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "ID de pedido inválido" });
      }

      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
      
      if (!order) {
        console.error(`[API] Pedido no encontrado: ${id}`);
        return res.status(404).json({ error: "Pedido no encontrado" });
      }
      
      if (order.status === 'completed') {
        console.warn(`[API] El pedido ${id} ya estaba completado`);
        return res.status(400).json({ error: "El pedido ya está completado" });
      }

      const total = Number(order.total) || 0;
      const advance = Number(order.advance) || 0;
      const remaining = total - advance;

      console.log(`[API] Pedido ${id}: Total=${total}, Anticipo=${advance}, Restante=${remaining}`);

      // Ejecutar actualización y registro de transacción
      db.transaction(() => {
        const updateResult = db.prepare("UPDATE orders SET status = 'completed' WHERE id = ?").run(id);
        console.log(`[API] Resultado update pedido ${id}:`, updateResult);
        
        if (remaining > 0) {
          const transResult = db.prepare(`
            INSERT INTO transactions (concept, amount, type, category, order_id)
            VALUES (?, ?, 'income', 'Pago Final', ?)
          `).run(`Pago Final de ${order.customer_name} (Pedido #${id})`, remaining, id);
          console.log(`[API] Resultado insert transacción pedido ${id}:`, transResult);
        }
      })();

      console.log(`[API] Pedido ${id} completado con éxito`);
      res.json({ status: "ok", remaining });
    } catch (error) {
      console.error("[API] Error fatal al completar pedido:", error);
      res.status(500).json({ error: "Error interno del servidor", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/orders/:id/payment", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { amount } = req.body;
      
      if (isNaN(id) || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "Datos inválidos" });
      }

      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
      
      if (!order) {
        return res.status(404).json({ error: "Pedido no encontrado" });
      }

      const total = Number(order.total) || 0;
      const currentAdvance = Number(order.advance) || 0;
      const remaining = total - currentAdvance;

      if (amount > remaining) {
        return res.status(400).json({ error: "El abono no puede ser mayor al restante" });
      }

      const newAdvance = currentAdvance + amount;

      db.transaction(() => {
        db.prepare("UPDATE orders SET advance = ? WHERE id = ?").run(newAdvance, id);
        
        db.prepare(`
          INSERT INTO transactions (concept, amount, type, category, order_id)
          VALUES (?, ?, 'income', 'Abono', ?)
        `).run(`Abono de ${order.customer_name} (Pedido #${id})`, amount, id);
      })();

      res.json({ status: "ok", newAdvance, remaining: total - newAdvance });
    } catch (error) {
      console.error("[API] Error al registrar abono:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  });

  app.get("/api/transactions", (req, res) => {
    try {
      const transactions = db.prepare("SELECT * FROM transactions ORDER BY date DESC").all();
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Error al obtener transacciones" });
    }
  });

  app.post("/api/transactions", (req, res) => {
    try {
      const { concept, amount, type, category } = req.body;
      const info = db.prepare(`
        INSERT INTO transactions (concept, amount, type, category)
        VALUES (?, ?, ?, ?)
      `).run(concept ?? null, amount ?? null, type ?? null, category ?? null);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating transaction:", error);
      res.status(500).json({ error: "Error al crear la transacción" });
    }
  });

  app.delete("/api/orders/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { password } = req.body;

      if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

      if (!password) {
        return res.status(400).json({ error: "Se requiere contraseña" });
      }

      const adminUser = db.prepare("SELECT * FROM users WHERE username = 'admin' AND password = ?").get(password);
      if (!adminUser) {
        return res.status(401).json({ error: "Contraseña incorrecta" });
      }

      db.transaction(() => {
        // Delete related transactions first to avoid FK issues if enabled
        db.prepare("DELETE FROM transactions WHERE order_id = ?").run(id);
        db.prepare("DELETE FROM orders WHERE id = ?").run(id);
      })();
      
      res.json({ status: "ok" });
    } catch (error) {
      console.error("Error deleting order:", error);
      res.status(500).json({ error: "Error al eliminar el pedido" });
    }
  });

  app.delete("/api/transactions/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
      
      db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
      res.json({ status: "ok" });
    } catch (error) {
      console.error("Error deleting transaction:", error);
      res.status(500).json({ error: "Error al eliminar la transacción" });
    }
  });

  app.get("/api/export/csv", (req, res) => {
    try {
      const orders = db.prepare("SELECT * FROM orders").all();
      const transactions = db.prepare("SELECT * FROM transactions").all();
      
      let csv = "--- PEDIDOS ---\n";
      csv += "ID,Cliente,Telefono,Direccion,Registro,Entrega,Material,Tipo,Total,Anticipo,Estado\n";
      orders.forEach((o: any) => {
        csv += `${o.id},"${o.customer_name}",${o.phone},"${o.address}",${o.registration_date},${o.delivery_date},"${o.material}",${o.work_type},${o.total},${o.advance},${o.status}\n`;
      });
      
      csv += "\n--- TRANSACCIONES ---\n";
      csv += "ID,Fecha,Concepto,Monto,Tipo,Categoria\n";
      transactions.forEach((t: any) => {
        csv += `${t.id},${t.date},"${t.concept}",${t.amount},${t.type},${t.category}\n`;
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=markez_backup.csv');
      res.status(200).send(csv);
    } catch (error) {
      res.status(500).json({ error: "Error al exportar datos" });
    }
  });

  app.get("/api/profile", (req, res) => {
    try {
      const profile = db.prepare("SELECT * FROM profile WHERE id = 1").get();
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ error: "Error al obtener perfil" });
    }
  });

  app.post("/api/profile", (req, res) => {
    try {
      const { business_name, address, phone, whatsapp_template, use_whatsapp_business, logo_url } = req.body;
      db.prepare(`
        UPDATE profile 
        SET business_name = ?, address = ?, phone = ?, whatsapp_template = ?, use_whatsapp_business = ?, logo_url = ?
        WHERE id = 1
      `).run(
        business_name ?? null, 
        address ?? null, 
        phone ?? null, 
        whatsapp_template ?? null, 
        use_whatsapp_business ? 1 : 0, 
        logo_url ?? null
      );
      res.json({ status: "ok" });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Error al actualizar perfil" });
    }
  });

  app.get("/api/limits", (req, res) => {
    try {
      const limits = db.prepare("SELECT * FROM capacity_limits").all();
      res.json(limits);
    } catch (error) {
      console.error("Error fetching limits:", error);
      res.status(500).json({ error: "Error al obtener límites" });
    }
  });

  app.post("/api/limits", (req, res) => {
    try {
      const { work_type, limit_val } = req.body;
      db.prepare("UPDATE capacity_limits SET limit_val = ? WHERE work_type = ?").run(limit_val, work_type);
      res.json({ status: "ok" });
    } catch (error) {
      console.error("Error updating limits:", error);
      res.status(500).json({ error: "Error al actualizar límites" });
    }
  });

  app.get("/api/stats/capacity", (req, res) => {
    const stats = db.prepare(`
      SELECT work_type, COUNT(*) as count 
      FROM orders 
      WHERE status = 'pending'
      GROUP BY work_type
    `).all();
    res.json(stats);
  });

  app.get("/api/stats/finances", (req, res) => {
    const income = db.prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'income'").get();
    const expense = db.prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'expense'").get();
    res.json({ income: income.total || 0, expense: expense.total || 0 });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Initializing Vite middleware...");
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite middleware initialized.");
    } catch (vErr) {
      console.error("Vite middleware failed to initialize:", vErr);
    }
  } else {
    console.log("Serving production build from dist/");
    const distPath = path.join(__dirname, "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    } else {
      console.error("Dist folder not found! Production build might be missing.");
      app.get("*", (req, res) => {
        res.status(500).send("Production build missing. Please run build first.");
      });
    }
  }

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("[Global Error Handler]", err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(500).json({ 
      error: "Error interno del servidor", 
      details: err.message 
    });
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
