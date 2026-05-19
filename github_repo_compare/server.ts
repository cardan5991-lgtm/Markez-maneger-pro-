import express from "express";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // --- In-Memory Database for Preview ---
  let orders: any[] = [];
  let transactions: any[] = [];
  let profile = {
    business_name: 'Markez Tapicería',
    address: 'Av. Principal 123',
    phone: '5551234567',
    logo_url: '',
    whatsapp_template: 'Estimado/a {cliente}, le saludamos de {empresa}. Su pedido de {trabajo} estará listo el {entrega}. Total: ${total} | Restante: ${restante}. Agradecemos su confianza y preferencia.',
    use_whatsapp_business: false
  };
  let limits: any[] = [
    { work_type: 'Sala', limit_val: 5 },
    { work_type: 'Silla', limit_val: 20 },
    { work_type: 'Asiento Carro', limit_val: 10 },
    { work_type: 'Camion', limit_val: 2 }
  ];

  // --- API Routes ---
  app.post('/api/auth/login', (req, res) => {
    // Basic mock login
    if (req.body.username === 'admin' && req.body.password) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Credenciales inválidas' });
    }
  });

  app.post('/api/auth/change-password', (req, res) => {
    res.json({ success: true });
  });

  app.get('/api/orders', (req, res) => res.json(orders));
  
  app.post('/api/orders', (req, res) => {
    const newOrder = { id: Date.now(), ...req.body, status: 'pending', registration_date: new Date().toISOString() };
    orders.push(newOrder);
    res.json(newOrder);
  });
  
  app.delete('/api/orders/:id', (req, res) => {
    orders = orders.filter(o => o.id !== Number(req.params.id));
    res.json({ success: true });
  });
  
  app.post('/api/orders/:id/complete', (req, res) => {
    const order = orders.find(o => o.id === Number(req.params.id));
    if (order) order.status = 'completed';
    res.json({ success: true });
  });
  
  app.post('/api/orders/:id/payment', (req, res) => {
    const order = orders.find(o => o.id === Number(req.params.id));
    if (order) order.advance += Number(req.body.amount);
    res.json({ success: true });
  });

  app.get('/api/transactions', (req, res) => res.json(transactions));
  
  app.post('/api/transactions', (req, res) => {
    const newTx = { id: Date.now(), date: new Date().toISOString(), ...req.body };
    transactions.push(newTx);
    res.json(newTx);
  });
  
  app.delete('/api/transactions/:id', (req, res) => {
    transactions = transactions.filter(t => t.id !== Number(req.params.id));
    res.json({ success: true });
  });

  app.get('/api/profile', (req, res) => res.json(profile));
  
  app.post('/api/profile', (req, res) => {
    profile = { ...profile, ...req.body };
    res.json({ success: true, profile });
  });

  app.get('/api/limits', (req, res) => res.json(limits));
  
  app.post('/api/limits', (req, res) => {
    const { work_type, limit_val } = req.body;
    const existingLimit = limits.find(l => l.work_type === work_type);
    if (existingLimit) {
      existingLimit.limit_val = limit_val;
    } else {
      limits.push({ work_type, limit_val });
    }
    res.json({ success: true, limits });
  });
  
  app.get('/api/config/gemini', (req, res) => {
    res.json({ apiKey: process.env.GEMINI_API_KEY });
  });

  app.post('/api/import', (req, res) => {
    const data = req.body;
    if (data.orders) orders = data.orders;
    if (data.transactions) transactions = data.transactions;
    if (data.profile) profile = data.profile;
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const path = await import('path');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
