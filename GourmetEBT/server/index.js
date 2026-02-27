const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ============================================================
// In-memory data store (replace with database in production)
// ============================================================
const users = new Map();
const orders = new Map();
const kitchenOrders = new Map();
const ebtCards = new Map();

// ============================================================
// EBT Payment Routes
// ============================================================

// Link an EBT card
app.post('/api/ebt/link', (req, res) => {
  const { userId, cardNumber, pin } = req.body;

  if (!cardNumber || !pin) {
    return res.status(400).json({ error: 'Card number and PIN are required' });
  }

  const cleaned = cardNumber.replace(/\D/g, '');
  if (cleaned.length < 16 || cleaned.length > 19) {
    return res.status(400).json({ error: 'Invalid EBT card number' });
  }
  if (pin.length < 4) {
    return res.status(400).json({ error: 'PIN must be 4 digits' });
  }

  // In production, this would call an EBT payment processor API
  // (e.g., Forage, Soda, or direct USDA FNS integration)
  const last4 = cleaned.slice(-4);
  const mockBalance = 487.50;

  ebtCards.set(userId || 'default', {
    last4,
    balance: mockBalance,
    linkedAt: new Date().toISOString(),
  });

  res.json({
    success: true,
    last4,
    balance: mockBalance,
    message: 'EBT card linked successfully',
  });
});

// Check EBT balance
app.get('/api/ebt/balance/:userId', (req, res) => {
  const card = ebtCards.get(req.params.userId) || ebtCards.get('default');
  if (!card) {
    return res.status(404).json({ error: 'No EBT card linked' });
  }
  res.json({ balance: card.balance, last4: card.last4 });
});

// Process EBT payment
app.post('/api/ebt/charge', (req, res) => {
  const { userId, amount, orderId } = req.body;

  const card = ebtCards.get(userId) || ebtCards.get('default');
  if (!card) {
    return res.status(404).json({ error: 'No EBT card linked' });
  }
  if (card.balance < amount) {
    return res.status(400).json({ error: 'Insufficient EBT balance' });
  }

  // In production: call EBT processor to authorize and capture payment
  // EBT-eligible items must be SNAP-approved food items
  card.balance -= amount;

  res.json({
    success: true,
    transactionId: `EBT-${uuidv4().slice(0, 8).toUpperCase()}`,
    amountCharged: amount,
    remainingBalance: card.balance,
    message: 'EBT payment processed successfully',
  });
});

// ============================================================
// Order Routes
// ============================================================

// Place a new order
app.post('/api/orders', (req, res) => {
  const { userId, items, kitchenId, paymentMethod, address, instructions } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Order must have at least one item' });
  }

  const total = items.reduce((t, item) => t + item.price * item.quantity, 0);
  const groceryCost = items.reduce((t, item) => t + (item.groceryCost || 0) * item.quantity, 0);

  const order = {
    id: `ORD-${Date.now()}`,
    userId: userId || 'guest',
    items,
    kitchenId,
    total,
    groceryCost,
    chefFee: total - groceryCost,
    paymentMethod,
    status: 'confirmed',
    statusHistory: [
      {
        status: 'confirmed',
        timestamp: new Date().toISOString(),
        message: 'Order confirmed! Chef is reviewing your order.',
      },
    ],
    address,
    instructions,
    createdAt: new Date().toISOString(),
    estimatedDelivery: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
  };

  orders.set(order.id, order);

  // Create a corresponding kitchen order with grocery shopping list
  const groceryList = items.flatMap((item) =>
    (item.ingredients || []).map((ing) => ({
      name: ing,
      checked: false,
    }))
  );

  const kitchenOrder = {
    ...order,
    groceryList,
    customerName: 'Customer',
    assignedChef: null,
    assignedDriver: null,
  };
  kitchenOrders.set(order.id, kitchenOrder);

  res.status(201).json({
    success: true,
    order,
    message: 'Order placed successfully! Chef will begin shopping for your ingredients.',
  });
});

// Get order by ID
app.get('/api/orders/:orderId', (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json(order);
});

// Get all orders for a user
app.get('/api/orders/user/:userId', (req, res) => {
  const userOrders = Array.from(orders.values())
    .filter((o) => o.userId === req.params.userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(userOrders);
});

// Update order status
app.patch('/api/orders/:orderId/status', (req, res) => {
  const { status, message } = req.body;
  const order = orders.get(req.params.orderId);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const validStatuses = ['confirmed', 'shopping', 'preparing', 'cooking', 'ready', 'delivering', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  order.status = status;
  order.statusHistory.push({
    status,
    timestamp: new Date().toISOString(),
    message: message || `Order status updated to ${status}`,
  });

  // Also update kitchen order
  const kOrder = kitchenOrders.get(req.params.orderId);
  if (kOrder) {
    kOrder.status = status;
  }

  res.json({ success: true, order });
});

// ============================================================
// Kitchen/Chef Routes
// ============================================================

// Get all kitchen orders (for chef dashboard)
app.get('/api/kitchen/orders', (req, res) => {
  const allKitchenOrders = Array.from(kitchenOrders.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(allKitchenOrders);
});

// Get active kitchen orders
app.get('/api/kitchen/orders/active', (req, res) => {
  const active = Array.from(kitchenOrders.values())
    .filter((o) => !['delivered', 'cancelled'].includes(o.status))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(active);
});

// Update grocery list item (check off an ingredient)
app.patch('/api/kitchen/orders/:orderId/grocery/:index', (req, res) => {
  const kOrder = kitchenOrders.get(req.params.orderId);
  if (!kOrder) {
    return res.status(404).json({ error: 'Kitchen order not found' });
  }

  const index = parseInt(req.params.index);
  if (index >= 0 && index < kOrder.groceryList.length) {
    kOrder.groceryList[index].checked = !kOrder.groceryList[index].checked;
  }

  res.json({ success: true, groceryList: kOrder.groceryList });
});

// ============================================================
// Ghost Kitchen / Store Routes
// ============================================================

// Get all ghost kitchens
app.get('/api/kitchens', (req, res) => {
  // In production, this would come from a database
  res.json({
    kitchens: [
      { id: 'gk-1', name: "Chef Marcus' Soul Kitchen", cuisineType: 'Southern Comfort', ebtAccepted: true },
      { id: 'gk-2', name: "Maria's Cocina Gourmet", cuisineType: 'Latin Fusion', ebtAccepted: true },
      { id: 'gk-3', name: 'The Golden Plate', cuisineType: 'American Gourmet', ebtAccepted: true },
      { id: 'gk-4', name: "Chef Lee's Wok & Fire", cuisineType: 'Asian Fusion', ebtAccepted: true },
      { id: 'gk-5', name: 'Garden to Gourmet', cuisineType: 'Plant-Based', ebtAccepted: true },
      { id: 'gk-6', name: "Big Tony's Italian Kitchen", cuisineType: 'Italian', ebtAccepted: true },
    ],
  });
});

// ============================================================
// Health check
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'GourmetEBT API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// Start server
// ============================================================
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║                                               ║
  ║     GourmetEBT API Server                     ║
  ║     Running on port ${PORT}                      ║
  ║                                               ║
  ║     Endpoints:                                ║
  ║     POST   /api/ebt/link                      ║
  ║     GET    /api/ebt/balance/:userId            ║
  ║     POST   /api/ebt/charge                    ║
  ║     POST   /api/orders                        ║
  ║     GET    /api/orders/:orderId               ║
  ║     PATCH  /api/orders/:orderId/status        ║
  ║     GET    /api/kitchen/orders                ║
  ║     GET    /api/kitchens                      ║
  ║     GET    /api/health                        ║
  ║                                               ║
  ╚═══════════════════════════════════════════════╝
  `);
});

module.exports = app;
