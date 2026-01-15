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

// Landing Page HTML
const LANDING_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ContextNow - Fresh Documentation for AI Agents</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg-primary: #0a0e17;
      --bg-secondary: #111827;
      --bg-card: #1a2332;
      --cyan: #06b6d4;
      --cyan-dim: #0891b2;
      --cyan-glow: rgba(6, 182, 212, 0.3);
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-dim: #64748b;
      --border: #1e293b;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* Navigation */
    nav {
      padding: 20px 0;
      border-bottom: 1px solid var(--border);
    }

    nav .container {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--cyan);
      text-decoration: none;
    }

    .logo span { color: var(--text-primary); }

    .nav-links { display: flex; gap: 24px; }

    .nav-links a {
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.95rem;
      transition: color 0.2s;
    }

    .nav-links a:hover { color: var(--cyan); }

    /* Hero Section */
    .hero {
      padding: 100px 0 80px;
      text-align: center;
      background: radial-gradient(ellipse at top, rgba(6, 182, 212, 0.1) 0%, transparent 60%);
    }

    .hero-badge {
      display: inline-block;
      padding: 6px 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 50px;
      font-size: 0.85rem;
      color: var(--cyan);
      margin-bottom: 24px;
    }

    .hero h1 {
      font-size: clamp(2.5rem, 6vw, 4rem);
      font-weight: 700;
      margin-bottom: 20px;
      background: linear-gradient(135deg, var(--text-primary) 0%, var(--cyan) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .hero p {
      font-size: 1.25rem;
      color: var(--text-secondary);
      max-width: 600px;
      margin: 0 auto 40px;
    }

    .hero-buttons { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }

    .btn {
      padding: 14px 32px;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
    }

    .btn-primary {
      background: var(--cyan);
      color: var(--bg-primary);
    }

    .btn-primary:hover {
      background: var(--cyan-dim);
      box-shadow: 0 0 30px var(--cyan-glow);
    }

    .btn-secondary {
      background: var(--bg-card);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }

    .btn-secondary:hover { border-color: var(--cyan); }

    /* How It Works */
    .how-it-works {
      padding: 80px 0;
      background: var(--bg-secondary);
    }

    .section-title {
      text-align: center;
      font-size: 2rem;
      margin-bottom: 60px;
    }

    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 32px;
    }

    .step {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px;
      text-align: center;
      transition: border-color 0.2s;
    }

    .step:hover { border-color: var(--cyan); }

    .step-number {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, var(--cyan), var(--cyan-dim));
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.25rem;
      margin: 0 auto 20px;
      color: var(--bg-primary);
    }

    .step h3 {
      font-size: 1.25rem;
      margin-bottom: 12px;
    }

    .step p { color: var(--text-secondary); }

    /* API Examples */
    .api-examples {
      padding: 80px 0;
    }

    .code-blocks {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 24px;
    }

    @media (max-width: 500px) {
      .code-blocks { grid-template-columns: 1fr; }
    }

    .code-block {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }

    .code-header {
      padding: 12px 20px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .code-title {
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    .code-badge {
      padding: 4px 10px;
      background: var(--bg-primary);
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .code-badge.error { color: #f87171; }
    .code-badge.success { color: #4ade80; }

    pre {
      padding: 20px;
      overflow-x: auto;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.9rem;
      line-height: 1.5;
    }

    .comment { color: var(--text-dim); }
    .keyword { color: #c084fc; }
    .string { color: #4ade80; }
    .number { color: #fb923c; }
    .property { color: var(--cyan); }

    /* Pricing */
    .pricing {
      padding: 80px 0;
      background: var(--bg-secondary);
    }

    .pricing-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
    }

    .price-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px;
      transition: all 0.2s;
    }

    .price-card:hover {
      border-color: var(--cyan);
      transform: translateY(-4px);
    }

    .price-card.featured {
      border-color: var(--cyan);
      position: relative;
    }

    .price-card.featured::before {
      content: 'POPULAR';
      position: absolute;
      top: -12px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--cyan);
      color: var(--bg-primary);
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .price-card h3 {
      font-size: 1.25rem;
      margin-bottom: 8px;
    }

    .price-card .description {
      color: var(--text-secondary);
      font-size: 0.9rem;
      margin-bottom: 20px;
    }

    .price {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--cyan);
    }

    .price span {
      font-size: 1rem;
      color: var(--text-secondary);
      font-weight: 400;
    }

    .price-features {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
    }

    .price-features li {
      list-style: none;
      padding: 8px 0;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .price-features li::before {
      content: '✓';
      color: var(--cyan);
      font-weight: 700;
    }

    /* Footer */
    footer {
      padding: 40px 0;
      border-top: 1px solid var(--border);
      text-align: center;
    }

    .footer-links {
      display: flex;
      justify-content: center;
      gap: 32px;
      margin-bottom: 20px;
    }

    .footer-links a {
      color: var(--text-secondary);
      text-decoration: none;
      transition: color 0.2s;
    }

    .footer-links a:hover { color: var(--cyan); }

    .copyright {
      color: var(--text-dim);
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <nav>
    <div class="container">
      <a href="/" class="logo">⚡ Context<span>Now</span></a>
      <div class="nav-links">
        <a href="#how-it-works">How It Works</a>
        <a href="#api">API</a>
        <a href="#pricing">Pricing</a>
        <a href="https://github.com/contextnow/contextnow-api" target="_blank">GitHub</a>
      </div>
    </div>
  </nav>

  <section class="hero">
    <div class="container">
      <div class="hero-badge">HTTP 402 • Micropayments • AI-Native</div>
      <h1>Fresh documentation for AI agents</h1>
      <p>Stop scraping outdated docs. Pay-per-request access to always-current API documentation, designed for autonomous AI agents.</p>
      <div class="hero-buttons">
        <a href="/catalog" class="btn btn-primary">View Catalog</a>
        <a href="https://github.com/contextnow/contextnow-api" class="btn btn-secondary" target="_blank">GitHub →</a>
      </div>
    </div>
  </section>

  <section class="how-it-works" id="how-it-works">
    <div class="container">
      <h2 class="section-title">How It Works</h2>
      <div class="steps">
        <div class="step">
          <div class="step-number">1</div>
          <h3>Request Documentation</h3>
          <p>Your AI agent makes a GET request to /buy/:item for the documentation it needs.</p>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <h3>Receive 402 Payment Required</h3>
          <p>We return pricing details including amount, currency, and payment address.</p>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <h3>Pay & Access</h3>
          <p>Send micropayment, include proof in header, receive fresh documentation instantly.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="api-examples" id="api">
    <div class="container">
      <h2 class="section-title">Live API Examples</h2>
      <div class="code-blocks">
        <div class="code-block">
          <div class="code-header">
            <span class="code-title">Request without payment</span>
            <span class="code-badge error">402</span>
          </div>
          <pre><span class="comment"># Freeloader attempt</span>
curl http://localhost:3000/buy/stripe-2026

<span class="comment"># Response:</span>
{
  <span class="property">"error"</span>: <span class="string">"Payment Required"</span>,
  <span class="property">"pricing"</span>: {
    <span class="property">"amount"</span>: <span class="number">0.001</span>,
    <span class="property">"currency"</span>: <span class="string">"USD"</span>,
    <span class="property">"receiver_address"</span>: <span class="string">"0x742d..."</span>
  }
}</pre>
        </div>
        <div class="code-block">
          <div class="code-header">
            <span class="code-title">Request with valid payment</span>
            <span class="code-badge success">200</span>
          </div>
          <pre><span class="comment"># Authenticated request</span>
curl http://localhost:3000/buy/stripe-2026 \\
  -H <span class="string">"Authorization: valid_proof"</span>

<span class="comment"># Response:</span>
{
  <span class="property">"success"</span>: <span class="keyword">true</span>,
  <span class="property">"content"</span>: <span class="string">"# Stripe API..."</span>,
  <span class="property">"charged"</span>: <span class="number">0.001</span>
}</pre>
        </div>
      </div>
    </div>
  </section>

  <section class="pricing" id="pricing">
    <div class="container">
      <h2 class="section-title">Documentation Catalog</h2>
      <div class="pricing-grid">
        <div class="price-card">
          <h3>Stripe API 2026</h3>
          <p class="description">Complete Stripe SDK documentation with latest features</p>
          <div class="price">$0.001 <span>/ request</span></div>
          <ul class="price-features">
            <li>Payment Intents API</li>
            <li>Neural verification docs</li>
            <li>Quantum encryption guide</li>
          </ul>
        </div>
        <div class="price-card featured">
          <h3>OpenAI SDK 2026</h3>
          <p class="description">Python SDK documentation for GPT-5 and beyond</p>
          <div class="price">$0.002 <span>/ request</span></div>
          <ul class="price-features">
            <li>Chat Completions API</li>
            <li>Multimodal input guide</li>
            <li>1M context examples</li>
          </ul>
        </div>
        <div class="price-card">
          <h3>Combined Bundle</h3>
          <p class="description">Everything included plus integration patterns</p>
          <div class="price">$0.005 <span>/ request</span></div>
          <ul class="price-features">
            <li>All documentation</li>
            <li>Integration patterns</li>
            <li>Best practices guide</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <footer>
    <div class="container">
      <div class="footer-links">
        <a href="https://github.com/contextnow/contextnow-api" target="_blank">GitHub</a>
        <a href="https://twitter.com/contextnowdev" target="_blank">Twitter</a>
        <a href="/catalog">API Catalog</a>
      </div>
      <p class="copyright">© 2026 ContextNow. Pay for what you use.</p>
    </div>
  </footer>
</body>
</html>`;

// Routes
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(LANDING_PAGE);
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
