const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'ContextNow');
  res.setHeader('X-Service-Version', '1.0.0');
  next();
});

// Inventory - Premium API documentation content
const INVENTORY = {
  'stripe-2026': {
    content: `# Stripe API Documentation (2026 Edition)

## Payment Intents API

Create a PaymentIntent to initiate a payment flow.

\`\`\`javascript
const stripe = require('stripe')('sk_test_xxx');

const paymentIntent = await stripe.paymentIntents.create({
  amount: 2000,
  currency: 'usd',
  payment_method_types: ['card'],
});
\`\`\`

## New in 2026
- Neural payment verification
- Quantum-resistant encryption
- AI-powered fraud detection v3
`,
    price: 0.001
  },
  'openai-2026': {
    content: `# OpenAI Python SDK Documentation (2026 Edition)

## Chat Completions

\`\`\`python
from openai import OpenAI

client = OpenAI()

response = client.chat.completions.create(
    model="gpt-5-turbo",
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)
\`\`\`

## New in 2026
- Native multimodal input
- Real-time streaming v2
- Context window: 1M tokens
`,
    price: 0.002
  },
  'combined-bundle': {
    content: `# Premium API Bundle

This bundle includes documentation for:
- Stripe API 2026
- OpenAI Python SDK 2026
- Integration patterns and best practices

*Full content delivered upon purchase*
`,
    price: 0.005
  }
};

// x402 Payment Required Middleware
function x402Middleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const item = req.params.item;
  const inventoryItem = INVENTORY[item];

  // Item doesn't exist
  if (!inventoryItem) {
    return res.status(404).json({
      error: 'Not Found',
      message: `Item '${item}' not found in inventory`,
      available_items: Object.keys(INVENTORY)
    });
  }

  // No payment proof provided - return 402 Payment Required
  if (!authHeader) {
    return res.status(402).json({
      error: 'Payment Required',
      message: 'This content requires micropayment to access',
      pricing: {
        item: item,
        amount: inventoryItem.price,
        currency: 'USD',
        receiver_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
        payment_methods: ['ETH', 'USDC', 'Lightning'],
        instructions: 'Include payment proof in Authorization header'
      }
    });
  }

  // Valid payment proof
  if (authHeader === 'valid_proof') {
    return next();
  }

  // Invalid payment proof
  return res.status(403).json({
    error: 'Forbidden',
    message: 'Invalid payment proof provided',
    hint: 'Ensure your payment transaction was confirmed'
  });
}

// Routes
app.get('/', (req, res) => {
  res.json({
    service: 'ContextNow',
    tagline: 'Fresh documentation for AI agents via HTTP 402 micropayments',
    version: '1.0.0',
    description: 'Stop waiting. Start building.',
    endpoints: {
      'GET /catalog': 'View available documentation',
      'GET /buy/:item': 'Purchase and download documentation (requires payment)'
    },
    links: {
      website: 'https://contextnow.dev',
      github: 'https://github.com/contextnow/contextnow-api',
      twitter: 'https://twitter.com/contextnowdev'
    }
  });
});

app.get('/catalog', (req, res) => {
  const catalog = Object.entries(INVENTORY).map(([key, value]) => ({
    id: key,
    price: value.price,
    currency: 'USD',
    preview: value.content.substring(0, 100) + '...'
  }));

  res.json({
    available_items: catalog,
    payment_info: {
      receiver_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
      accepted_methods: ['ETH', 'USDC', 'Lightning']
    }
  });
});

app.get('/buy/:item', x402Middleware, (req, res) => {
  const item = req.params.item;
  const inventoryItem = INVENTORY[item];

  res.json({
    success: true,
    item: item,
    charged: inventoryItem.price,
    currency: 'USD',
    content: inventoryItem.content,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 CONTEXTNOW - Fresh Docs for AI Agents');
  console.log('='.repeat(50));
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`\nAvailable items: ${Object.keys(INVENTORY).join(', ')}`);
  console.log('\nEndpoints:');
  console.log('  GET /          - Service info');
  console.log('  GET /catalog   - View available docs');
  console.log('  GET /buy/:item - Purchase documentation');
  console.log('='.repeat(50));
});
