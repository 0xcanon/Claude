const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// Disable x-powered-by header to reduce fingerprinting
app.disable('x-powered-by');

// ============================================================
// Constants
// ============================================================
const MAX_ITEMS_PER_ORDER = 50;
const MAX_ORDERS = 10000;
const MAX_EBT_CARDS = 5000;

// ============================================================
// Middleware
// ============================================================
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : undefined; // undefined = allow all in dev

app.use(cors(allowedOrigins ? { origin: allowedOrigins } : undefined));
app.use(express.json({ limit: '50kb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Simple request logger (sanitized path)
app.use((req, res, next) => {
  const safePath = req.path.replace(/[^\w/\-.:]/g, '_').slice(0, 200);
  console.log(`[${new Date().toISOString()}] ${req.method} ${safePath}`);
  next();
});

// ============================================================
// In-memory data store (replace with database in production)
// ============================================================
const users = new Map();
const orders = new Map();
const kitchenOrders = new Map();
const ebtCards = new Map();
const processedCharges = new Set(); // Track charged orderIds for idempotency

// Valid kitchen IDs
const VALID_KITCHEN_IDS = ['gk-1', 'gk-2', 'gk-3', 'gk-4', 'gk-5', 'gk-6'];

// Valid status transitions (state machine)
const VALID_TRANSITIONS = {
  confirmed: ['shopping', 'cancelled'],
  shopping: ['preparing', 'cancelled'],
  preparing: ['cooking', 'cancelled'],
  cooking: ['ready', 'cancelled'],
  ready: ['delivering', 'cancelled'],
  delivering: ['delivered'],
  delivered: [],
  cancelled: [],
};

// ============================================================
// Input validation helpers
// ============================================================
function sanitizeString(str, maxLength = 500) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
}

function isValidAmount(amount) {
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0 && amount < 100000;
}

function roundMoney(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

function sanitizeItem(item) {
  const ALLOWED_ITEM_FIELDS = ['id', 'name', 'price', 'quantity', 'groceryCost', 'ebtEligible', 'ingredients', 'description'];
  const sanitized = {};
  for (const key of ALLOWED_ITEM_FIELDS) {
    if (key in item) {
      if (key === 'name' || key === 'description') {
        sanitized[key] = sanitizeString(item[key], 200);
      } else if (key === 'ingredients' && Array.isArray(item[key])) {
        sanitized[key] = item[key].slice(0, 30).map((ing) => sanitizeString(String(ing), 100));
      } else {
        sanitized[key] = item[key];
      }
    }
  }
  return sanitized;
}

function isValidCardNumber(cardNumber) {
  if (typeof cardNumber !== 'string') return false;
  const cleaned = cardNumber.replace(/\D/g, '');
  return cleaned.length >= 16 && cleaned.length <= 19;
}

function isValidPin(pin) {
  if (typeof pin !== 'string') return false;
  const cleaned = pin.replace(/\D/g, '');
  return cleaned.length === 4;
}

// ============================================================
// EBT Payment Routes
// ============================================================

// Link an EBT card
app.post('/api/ebt/link', (req, res) => {
  const { userId, cardNumber, pin } = req.body;

  if (!cardNumber || !pin) {
    return res.status(400).json({ success: false, error: 'Card number and PIN are required' });
  }

  if (!userId) {
    return res.status(400).json({ success: false, error: 'User ID is required' });
  }
  if (!isValidCardNumber(cardNumber)) {
    return res.status(400).json({ success: false, error: 'Invalid EBT card number (must be 16-19 digits)' });
  }
  if (!isValidPin(pin)) {
    return res.status(400).json({ success: false, error: 'PIN must be exactly 4 digits' });
  }

  // Memory limit check
  if (ebtCards.size >= MAX_EBT_CARDS) {
    return res.status(503).json({ success: false, error: 'Service temporarily at capacity' });
  }

  const cleaned = cardNumber.replace(/\D/g, '');
  const userKey = sanitizeString(userId);

  // In production, this would call an EBT payment processor API
  // (e.g., Forage, Soda, or direct USDA FNS integration)
  const last4 = cleaned.slice(-4);
  const mockBalance = 487.50;

  ebtCards.set(userKey, {
    last4,
    balance: mockBalance,
    pinHash: pin, // In production: hash the PIN, never store plaintext
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
  const card = ebtCards.get(sanitizeString(req.params.userId));
  if (!card) {
    return res.status(404).json({ success: false, error: 'No EBT card linked' });
  }
  res.json({ success: true, balance: card.balance, last4: card.last4 });
});

// Process EBT payment
app.post('/api/ebt/charge', (req, res) => {
  const { userId, amount, orderId } = req.body;

  // Validate required fields
  if (!orderId) {
    return res.status(400).json({ success: false, error: 'Order ID is required' });
  }

  // Idempotency check - prevent double-charging
  if (processedCharges.has(orderId)) {
    return res.status(409).json({ success: false, error: 'Order has already been charged' });
  }

  // Validate amount
  if (!isValidAmount(amount)) {
    return res.status(400).json({ success: false, error: 'Invalid charge amount (must be a positive number)' });
  }

  if (!userId) {
    return res.status(400).json({ success: false, error: 'User ID is required' });
  }

  // Verify order exists
  const order = orders.get(orderId);
  if (!order) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }

  const userKey = sanitizeString(userId);
  const card = ebtCards.get(userKey);
  if (!card) {
    return res.status(404).json({ success: false, error: 'No EBT card linked' });
  }

  if (card.balance < amount) {
    return res.status(402).json({
      success: false,
      error: 'Insufficient EBT balance',
      balance: card.balance,
      required: amount,
    });
  }

  // In production: call EBT processor to authorize and capture payment
  // EBT-eligible items must be SNAP-approved food items
  card.balance = roundMoney(card.balance - amount);
  card.balance = Math.max(0, card.balance);
  processedCharges.add(orderId);

  res.json({
    success: true,
    transactionId: `EBT-${uuidv4().slice(0, 8).toUpperCase()}`,
    amountCharged: roundMoney(amount),
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

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Order must have at least one item' });
  }
  if (items.length > MAX_ITEMS_PER_ORDER) {
    return res.status(400).json({ success: false, error: `Order cannot exceed ${MAX_ITEMS_PER_ORDER} items` });
  }

  // Validate each item has required fields
  for (const item of items) {
    if (!item.name || typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price <= 0) {
      return res.status(400).json({ success: false, error: 'Each item must have a name and valid price' });
    }
    if (!item.quantity || item.quantity < 1 || item.quantity > 99) {
      return res.status(400).json({ success: false, error: 'Item quantity must be between 1 and 99' });
    }
  }

  // Validate kitchen (required)
  if (!kitchenId || !VALID_KITCHEN_IDS.includes(kitchenId)) {
    return res.status(400).json({ success: false, error: 'Valid kitchen ID is required' });
  }

  // Memory limit check
  if (orders.size >= MAX_ORDERS) {
    return res.status(503).json({ success: false, error: 'Service temporarily at capacity' });
  }

  // Validate payment method
  const validPaymentMethods = ['ebt', 'cash'];
  if (paymentMethod && !validPaymentMethods.includes(paymentMethod)) {
    return res.status(400).json({ success: false, error: 'Invalid payment method' });
  }

  // Sanitize items through allowlist
  const sanitizedItems = items.map(sanitizeItem);

  const total = roundMoney(sanitizedItems.reduce((t, item) => t + roundMoney(item.price * item.quantity), 0));
  const groceryCost = roundMoney(sanitizedItems.reduce((t, item) => t + roundMoney((item.groceryCost || 0) * item.quantity), 0));

  const order = {
    id: `ORD-${uuidv4().slice(0, 12).toUpperCase()}`,
    userId: sanitizeString(userId) || 'guest',
    items: sanitizedItems,
    kitchenId,
    total,
    groceryCost,
    chefFee: roundMoney(total - groceryCost),
    paymentMethod,
    status: 'confirmed',
    statusHistory: [
      {
        status: 'confirmed',
        timestamp: new Date().toISOString(),
        message: 'Order confirmed! Chef is reviewing your order.',
      },
    ],
    address: sanitizeString(address, 300),
    instructions: sanitizeString(instructions, 500),
    createdAt: new Date().toISOString(),
    estimatedDelivery: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
  };

  orders.set(order.id, order);

  // Create a corresponding kitchen order with grocery shopping list
  const groceryList = sanitizedItems.flatMap((item) =>
    (item.ingredients || []).map((ing) => ({
      name: sanitizeString(ing, 100),
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
    return res.status(404).json({ success: false, error: 'Order not found' });
  }
  res.json({ success: true, order });
});

// Get all orders for a user
app.get('/api/orders/user/:userId', (req, res) => {
  const userOrders = Array.from(orders.values())
    .filter((o) => o.userId === req.params.userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, orders: userOrders });
});

// Update order status
app.patch('/api/orders/:orderId/status', (req, res) => {
  const { status, message } = req.body;
  const order = orders.get(req.params.orderId);

  if (!order) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }

  if (!status) {
    return res.status(400).json({ success: false, error: 'Status is required' });
  }

  // Validate status transition (state machine)
  const allowedNextStatuses = VALID_TRANSITIONS[order.status];
  if (!allowedNextStatuses) {
    return res.status(400).json({ success: false, error: `Unknown current status: ${order.status}` });
  }
  if (!allowedNextStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `Cannot transition from "${order.status}" to "${status}". Allowed: ${allowedNextStatuses.join(', ') || 'none'}`,
    });
  }

  // Refund EBT balance on cancellation
  if (status === 'cancelled' && order.paymentMethod === 'ebt' && order.groceryCost > 0) {
    const card = ebtCards.get(order.userId);
    if (card) {
      card.balance = roundMoney(card.balance + order.groceryCost);
      processedCharges.delete(order.id);
    }
  }

  order.status = status;
  order.statusHistory.push({
    status,
    timestamp: new Date().toISOString(),
    message: sanitizeString(message) || `Order status updated to ${status}`,
  });

  // Sync kitchen order status
  const kOrder = kitchenOrders.get(req.params.orderId);
  if (kOrder) {
    kOrder.status = status;
    kOrder.statusHistory = order.statusHistory;
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
  res.json({ success: true, orders: allKitchenOrders });
});

// Get active kitchen orders
app.get('/api/kitchen/orders/active', (req, res) => {
  const active = Array.from(kitchenOrders.values())
    .filter((o) => !['delivered', 'cancelled'].includes(o.status))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, orders: active });
});

// Update grocery list item (check off an ingredient)
app.patch('/api/kitchen/orders/:orderId/grocery/:index', (req, res) => {
  const kOrder = kitchenOrders.get(req.params.orderId);
  if (!kOrder) {
    return res.status(404).json({ success: false, error: 'Kitchen order not found' });
  }

  const index = parseInt(req.params.index, 10);
  if (isNaN(index) || index < 0 || index >= kOrder.groceryList.length) {
    return res.status(400).json({
      success: false,
      error: `Invalid grocery index. Must be 0-${kOrder.groceryList.length - 1}`,
    });
  }

  kOrder.groceryList[index].checked = !kOrder.groceryList[index].checked;
  res.json({ success: true, groceryList: kOrder.groceryList });
});

// ============================================================
// Ghost Kitchen / Store Routes
// ============================================================

// Get all ghost kitchens
app.get('/api/kitchens', (req, res) => {
  // In production, this would come from a database
  res.json({
    success: true,
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
// Global error handler
// ============================================================
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ success: false, error: 'Invalid JSON in request body' });
  }
  const safeMessage = String(err.message || 'Unknown error').slice(0, 500);
  console.error(`[ERROR] ${safeMessage}`);
  res.status(500).json({ success: false, error: 'Internal server error' });
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
