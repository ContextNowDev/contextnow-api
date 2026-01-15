require('dotenv').config();
const express = require('express');
const { Connection, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = require('@solana/spl-token');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// SOLANA & USDC CONFIGURATION
// ============================================

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const SOLANA_WALLET_ADDRESS = process.env.SOLANA_WALLET_ADDRESS || '';

// USDC-SPL Token Configuration (Mainnet)
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6; // 1 USDC = 1,000,000 base units

// Solana connection
const solanaConnection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Store used transaction signatures to prevent replay attacks
const usedTransactionSignatures = new Set();

// ============================================
// USDC PAYMENT VERIFICATION
// ============================================

async function getOurUSDCTokenAccount() {
  if (!SOLANA_WALLET_ADDRESS) {
    throw new Error('SOLANA_WALLET_ADDRESS not configured');
  }
  const walletPubkey = new PublicKey(SOLANA_WALLET_ADDRESS);
  return await getAssociatedTokenAddress(USDC_MINT, walletPubkey);
}

async function verifyUSDCPayment(transactionSignature, expectedAmountUSDC) {
  try {
    // Check if transaction was already used (replay attack prevention)
    if (usedTransactionSignatures.has(transactionSignature)) {
      return {
        valid: false,
        code: 'REPLAY_ATTACK',
        error: 'Transaction already used',
        message: 'This transaction signature has already been used for a previous purchase. Each purchase requires a new USDC transaction.',
        action: 'Send a new USDC payment and use the new transaction signature'
      };
    }

    // Fetch the transaction
    const transaction = await solanaConnection.getParsedTransaction(
      transactionSignature,
      { maxSupportedTransactionVersion: 0 }
    );

    if (!transaction) {
      return {
        valid: false,
        code: 'TX_NOT_FOUND',
        error: 'Transaction not found on Solana blockchain',
        message: 'The transaction signature was not found. It may still be processing or the signature may be incorrect.',
        action: 'Wait a few seconds for confirmation, then retry. If the issue persists, verify the transaction signature is correct.',
        solscan_url: `https://solscan.io/tx/${transactionSignature}`
      };
    }

    // Check if transaction is confirmed
    if (!transaction.meta || transaction.meta.err) {
      return {
        valid: false,
        code: 'TX_FAILED',
        error: 'Transaction failed or not confirmed',
        message: 'The transaction exists but failed or has not been confirmed yet.',
        action: 'Check the transaction on Solscan. If it failed, send a new payment.',
        solscan_url: `https://solscan.io/tx/${transactionSignature}`
      };
    }

    // Get our USDC token account
    const ourTokenAccount = await getOurUSDCTokenAccount();
    const ourTokenAccountStr = ourTokenAccount.toBase58();

    // Parse token transfer instructions
    const instructions = transaction.transaction.message.instructions;
    let validPaymentFound = false;
    let receivedAmount = 0;

    for (const instruction of instructions) {
      // Check if it's a parsed instruction (SPL Token)
      if (instruction.parsed && instruction.program === 'spl-token') {
        const { type, info } = instruction.parsed;

        // Look for transfer or transferChecked instructions
        if (type === 'transfer' || type === 'transferChecked') {
          const destination = info.destination;
          const mint = info.mint;
          const amount = info.amount || info.tokenAmount?.amount;

          // Verify it's USDC going to our account
          if (destination === ourTokenAccountStr) {
            // For transferChecked, verify mint is USDC
            if (type === 'transferChecked' && mint !== USDC_MINT.toBase58()) {
              continue;
            }
            receivedAmount = parseInt(amount);
            validPaymentFound = true;
            break;
          }
        }
      }
    }

    if (!validPaymentFound) {
      return {
        valid: false,
        code: 'WRONG_RECIPIENT',
        error: 'Payment sent to wrong address',
        message: 'No USDC transfer to our wallet was found in this transaction. You may have sent to the wrong address or sent SOL instead of USDC.',
        action: 'Send USDC (not SOL) to the correct token account address',
        correct_address: ourTokenAccountStr,
        solscan_url: `https://solscan.io/tx/${transactionSignature}`
      };
    }

    // Convert expected amount to base units
    const expectedBaseUnits = Math.floor(expectedAmountUSDC * Math.pow(10, USDC_DECIMALS));

    // Allow 1% tolerance for rounding
    const tolerance = expectedBaseUnits * 0.01;
    const minAmount = expectedBaseUnits - tolerance;

    if (receivedAmount < minAmount) {
      const receivedUSDC = receivedAmount / Math.pow(10, USDC_DECIMALS);
      return {
        valid: false,
        code: 'INSUFFICIENT_AMOUNT',
        error: `Insufficient amount (expected ${expectedAmountUSDC} USDC, received ${receivedUSDC} USDC)`,
        message: `The payment amount is too low. You sent ${receivedUSDC} USDC but ${expectedAmountUSDC} USDC is required.`,
        action: `Send an additional ${(expectedAmountUSDC - receivedUSDC).toFixed(6)} USDC to complete the purchase`,
        expected: expectedAmountUSDC,
        received: receivedUSDC,
        shortfall: expectedAmountUSDC - receivedUSDC
      };
    }

    // Mark transaction as used
    usedTransactionSignatures.add(transactionSignature);

    return {
      valid: true,
      amountReceived: receivedAmount / Math.pow(10, USDC_DECIMALS),
      transactionSignature
    };

  } catch (error) {
    console.error('Payment verification error:', error);
    return {
      valid: false,
      code: 'VERIFICATION_ERROR',
      error: `Verification failed: ${error.message}`,
      message: 'An error occurred while verifying your payment. Please try again.',
      action: 'Retry the request. If the issue persists, contact support.'
    };
  }
}

// ============================================
// EXPRESS MIDDLEWARE
// ============================================

app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'ContextNow');
  res.setHeader('X-Service-Version', '1.0.0');
  next();
});

app.use(express.json());

// Inventory - Premium API documentation content
// Organized by category with pricing tiers based on complexity
const INVENTORY = {
  // ============================================
  // AI / LLM DOCUMENTATION
  // ============================================
  'openai-python': {
    name: 'OpenAI Python SDK',
    content: `# OpenAI Python SDK Documentation (2026 Edition)\n\n## Chat Completions\n\n\`\`\`python\nfrom openai import OpenAI\nclient = OpenAI()\nresponse = client.chat.completions.create(\n    model="gpt-5-turbo",\n    messages=[{"role": "user", "content": "Hello!"}]\n)\n\`\`\`\n\n## Features\n- Native multimodal input\n- Real-time streaming v2\n- Context window: 1M tokens`,
    price: 0.002,
    category: 'ai',
    icon: '🤖',
    docs: 'https://platform.openai.com/docs'
  },
  'anthropic-claude': {
    name: 'Anthropic Claude SDK',
    content: `# Anthropic Claude SDK Documentation (2026 Edition)\n\n## Messages API\n\n\`\`\`python\nimport anthropic\nclient = anthropic.Anthropic()\nmessage = client.messages.create(\n    model="claude-4-opus",\n    max_tokens=1024,\n    messages=[{"role": "user", "content": "Hello, Claude!"}]\n)\n\`\`\`\n\n## Features\n- Extended thinking mode\n- Computer use capabilities\n- 500K context window`,
    price: 0.002,
    category: 'ai',
    icon: '🧠',
    docs: 'https://docs.anthropic.com'
  },
  'langchain-python': {
    name: 'LangChain Python',
    content: `# LangChain Python Documentation (2026 Edition)\n\n## Chains & Agents\n\n\`\`\`python\nfrom langchain_openai import ChatOpenAI\nfrom langchain.agents import create_tool_calling_agent\n\nllm = ChatOpenAI(model="gpt-5-turbo")\nagent = create_tool_calling_agent(llm, tools, prompt)\n\`\`\`\n\n## Features\n- LangGraph integration\n- Tool calling agents\n- RAG pipelines`,
    price: 0.002,
    category: 'ai',
    icon: '🦜',
    docs: 'https://python.langchain.com/docs'
  },
  'langchain-js': {
    name: 'LangChain JS',
    content: `# LangChain JS Documentation (2026 Edition)\n\n## Chains & Agents\n\n\`\`\`typescript\nimport { ChatOpenAI } from "@langchain/openai";\nimport { createToolCallingAgent } from "langchain/agents";\n\nconst llm = new ChatOpenAI({ model: "gpt-5-turbo" });\nconst agent = createToolCallingAgent({ llm, tools, prompt });\n\`\`\``,
    price: 0.002,
    category: 'ai',
    icon: '🦜',
    docs: 'https://js.langchain.com/docs'
  },
  'huggingface-transformers': {
    name: 'Hugging Face Transformers',
    content: `# Hugging Face Transformers Documentation (2026 Edition)\n\n## Pipeline API\n\n\`\`\`python\nfrom transformers import pipeline\n\nclassifier = pipeline("sentiment-analysis")\nresult = classifier("I love using transformers!")\n\`\`\`\n\n## Features\n- 500K+ pretrained models\n- AutoModel classes\n- Trainer API`,
    price: 0.002,
    category: 'ai',
    icon: '🤗',
    docs: 'https://huggingface.co/docs/transformers'
  },

  // ============================================
  // PAYMENTS / FINTECH
  // ============================================
  'stripe-node': {
    name: 'Stripe Node.js SDK',
    content: `# Stripe Node.js Documentation (2026 Edition)\n\n## Payment Intents\n\n\`\`\`javascript\nconst stripe = require('stripe')('sk_test_xxx');\n\nconst paymentIntent = await stripe.paymentIntents.create({\n  amount: 2000,\n  currency: 'usd',\n  payment_method_types: ['card'],\n});\n\`\`\`\n\n## Features\n- Neural payment verification\n- Quantum-resistant encryption\n- AI fraud detection v3`,
    price: 0.001,
    category: 'payments',
    icon: '💳',
    docs: 'https://stripe.com/docs/api'
  },

  // ============================================
  // WEB FRAMEWORKS
  // ============================================
  'nextjs': {
    name: 'Next.js',
    content: `# Next.js Documentation (2026 Edition)\n\n## App Router\n\n\`\`\`typescript\n// app/page.tsx\nexport default function Page() {\n  return <h1>Hello, Next.js!</h1>\n}\n\`\`\`\n\n## Features\n- Server Components by default\n- Streaming & Suspense\n- Turbopack bundler`,
    price: 0.002,
    category: 'framework',
    icon: '▲',
    docs: 'https://nextjs.org/docs'
  },
  'remix': {
    name: 'Remix',
    content: `# Remix Documentation (2026 Edition)\n\n## Loaders & Actions\n\n\`\`\`typescript\nexport async function loader({ request }) {\n  const user = await getUser(request);\n  return json({ user });\n}\n\`\`\`\n\n## Features\n- Nested routing\n- Progressive enhancement\n- Web standards focused`,
    price: 0.002,
    category: 'framework',
    icon: '💿',
    docs: 'https://remix.run/docs'
  },
  'astro': {
    name: 'Astro',
    content: `# Astro Documentation (2026 Edition)\n\n## Components\n\n\`\`\`astro\n---\nconst name = "Astro";\n---\n<h1>Hello, {name}!</h1>\n\`\`\`\n\n## Features\n- Zero JS by default\n- Content collections\n- Island architecture`,
    price: 0.002,
    category: 'framework',
    icon: '🚀',
    docs: 'https://docs.astro.build'
  },

  // ============================================
  // COMMUNICATION
  // ============================================
  'twilio-node': {
    name: 'Twilio Node.js SDK',
    content: `# Twilio Node.js Documentation (2026 Edition)\n\n## Send SMS\n\n\`\`\`javascript\nconst twilio = require('twilio');\nconst client = twilio(accountSid, authToken);\n\nawait client.messages.create({\n  body: 'Hello from Twilio!',\n  to: '+1234567890',\n  from: '+0987654321'\n});\n\`\`\``,
    price: 0.001,
    category: 'communication',
    icon: '📱',
    docs: 'https://www.twilio.com/docs'
  },
  'sendgrid-node': {
    name: 'SendGrid Node.js SDK',
    content: `# SendGrid Node.js Documentation (2026 Edition)\n\n## Send Email\n\n\`\`\`javascript\nconst sgMail = require('@sendgrid/mail');\nsgMail.setApiKey(process.env.SENDGRID_API_KEY);\n\nawait sgMail.send({\n  to: 'user@example.com',\n  from: 'sender@example.com',\n  subject: 'Hello',\n  text: 'Hello from SendGrid!'\n});\n\`\`\``,
    price: 0.001,
    category: 'communication',
    icon: '📧',
    docs: 'https://docs.sendgrid.com'
  },

  // ============================================
  // DATABASE
  // ============================================
  'supabase-js': {
    name: 'Supabase JS',
    content: `# Supabase JS Documentation (2026 Edition)\n\n## Client Setup\n\n\`\`\`javascript\nimport { createClient } from '@supabase/supabase-js';\nconst supabase = createClient(url, key);\n\nconst { data } = await supabase\n  .from('posts')\n  .select('*');\n\`\`\`\n\n## Features\n- Realtime subscriptions\n- Auth & Storage\n- Edge Functions`,
    price: 0.002,
    category: 'database',
    icon: '⚡',
    docs: 'https://supabase.com/docs'
  },
  'mongodb-node': {
    name: 'MongoDB Node.js Driver',
    content: `# MongoDB Node.js Documentation (2026 Edition)\n\n## CRUD Operations\n\n\`\`\`javascript\nconst { MongoClient } = require('mongodb');\nconst client = new MongoClient(uri);\n\nconst db = client.db('mydb');\nconst docs = await db.collection('users').find({}).toArray();\n\`\`\``,
    price: 0.001,
    category: 'database',
    icon: '🍃',
    docs: 'https://www.mongodb.com/docs/drivers/node/current'
  },
  'planetscale-js': {
    name: 'PlanetScale Database JS',
    content: `# PlanetScale JS Documentation (2026 Edition)\n\n## Serverless Driver\n\n\`\`\`javascript\nimport { connect } from '@planetscale/database';\nconst conn = connect({ url: process.env.DATABASE_URL });\n\nconst results = await conn.execute('SELECT * FROM users');\n\`\`\``,
    price: 0.001,
    category: 'database',
    icon: '🪐',
    docs: 'https://planetscale.com/docs'
  },
  'prisma': {
    name: 'Prisma ORM',
    content: `# Prisma Documentation (2026 Edition)\n\n## Client Usage\n\n\`\`\`typescript\nimport { PrismaClient } from '@prisma/client';\nconst prisma = new PrismaClient();\n\nconst users = await prisma.user.findMany({\n  include: { posts: true }\n});\n\`\`\`\n\n## Features\n- Type-safe queries\n- Auto-generated migrations\n- Prisma Studio`,
    price: 0.002,
    category: 'database',
    icon: '🔷',
    docs: 'https://www.prisma.io/docs'
  },
  'drizzle-orm': {
    name: 'Drizzle ORM',
    content: `# Drizzle ORM Documentation (2026 Edition)\n\n## Query Builder\n\n\`\`\`typescript\nimport { drizzle } from 'drizzle-orm/node-postgres';\nimport { users } from './schema';\n\nconst db = drizzle(pool);\nconst allUsers = await db.select().from(users);\n\`\`\`\n\n## Features\n- SQL-like syntax\n- Zero dependencies\n- Drizzle Kit migrations`,
    price: 0.002,
    category: 'database',
    icon: '💧',
    docs: 'https://orm.drizzle.team/docs'
  },

  // ============================================
  // INFRASTRUCTURE
  // ============================================
  'vercel': {
    name: 'Vercel CLI & SDK',
    content: `# Vercel Documentation (2026 Edition)\n\n## Deploy\n\n\`\`\`bash\n# Deploy to production\nvercel --prod\n\n# Set environment variables\nvercel env add SECRET production\n\`\`\`\n\n## Features\n- Edge Functions\n- Preview deployments\n- Analytics & Speed Insights`,
    price: 0.001,
    category: 'infrastructure',
    icon: '▲',
    docs: 'https://vercel.com/docs'
  },
  'railway': {
    name: 'Railway CLI',
    content: `# Railway Documentation (2026 Edition)\n\n## Deploy\n\n\`\`\`bash\n# Deploy from current directory\nrailway up\n\n# Link to project\nrailway link\n\`\`\`\n\n## Features\n- Instant deployments\n- Database provisioning\n- Automatic scaling`,
    price: 0.001,
    category: 'infrastructure',
    icon: '🚂',
    docs: 'https://docs.railway.app'
  },

  // ============================================
  // WEB3 / BLOCKCHAIN
  // ============================================
  'wagmi': {
    name: 'wagmi',
    content: `# wagmi Documentation (2026 Edition)\n\n## React Hooks\n\n\`\`\`typescript\nimport { useAccount, useConnect } from 'wagmi';\n\nfunction App() {\n  const { address, isConnected } = useAccount();\n  const { connect, connectors } = useConnect();\n}\n\`\`\`\n\n## Features\n- 40+ React hooks\n- TypeScript native\n- Wallet connectors`,
    price: 0.002,
    category: 'web3',
    icon: '🔗',
    docs: 'https://wagmi.sh'
  },
  'viem': {
    name: 'viem',
    content: `# viem Documentation (2026 Edition)\n\n## Client Setup\n\n\`\`\`typescript\nimport { createPublicClient, http } from 'viem';\nimport { mainnet } from 'viem/chains';\n\nconst client = createPublicClient({\n  chain: mainnet,\n  transport: http()\n});\n\`\`\`\n\n## Features\n- TypeScript native\n- Modular & tree-shakeable\n- 99% test coverage`,
    price: 0.002,
    category: 'web3',
    icon: '💎',
    docs: 'https://viem.sh'
  },
  'solana-web3': {
    name: 'Solana Web3.js',
    content: `# Solana Web3.js Documentation (2026 Edition)\n\n## Transaction\n\n\`\`\`javascript\nimport { Connection, PublicKey } from '@solana/web3.js';\n\nconst connection = new Connection('https://api.mainnet-beta.solana.com');\nconst balance = await connection.getBalance(publicKey);\n\`\`\`\n\n## Features\n- Full RPC client\n- Transaction building\n- Account management`,
    price: 0.002,
    category: 'web3',
    icon: '◎',
    docs: 'https://solana-labs.github.io/solana-web3.js'
  },
  'ethers': {
    name: 'Ethers.js',
    content: `# Ethers.js Documentation (2026 Edition)\n\n## Provider & Signer\n\n\`\`\`javascript\nimport { ethers } from 'ethers';\n\nconst provider = new ethers.BrowserProvider(window.ethereum);\nconst signer = await provider.getSigner();\nconst balance = await provider.getBalance(address);\n\`\`\``,
    price: 0.002,
    category: 'web3',
    icon: '⟠',
    docs: 'https://docs.ethers.org'
  },

  // ============================================
  // TESTING
  // ============================================
  'vitest': {
    name: 'Vitest',
    content: `# Vitest Documentation (2026 Edition)\n\n## Test Example\n\n\`\`\`typescript\nimport { describe, it, expect } from 'vitest';\n\ndescribe('math', () => {\n  it('adds numbers', () => {\n    expect(1 + 1).toBe(2);\n  });\n});\n\`\`\`\n\n## Features\n- Vite-native\n- Jest compatible\n- Browser mode`,
    price: 0.001,
    category: 'testing',
    icon: '⚡',
    docs: 'https://vitest.dev'
  },
  'playwright': {
    name: 'Playwright',
    content: `# Playwright Documentation (2026 Edition)\n\n## E2E Test\n\n\`\`\`typescript\nimport { test, expect } from '@playwright/test';\n\ntest('homepage', async ({ page }) => {\n  await page.goto('https://example.com');\n  await expect(page).toHaveTitle(/Example/);\n});\n\`\`\`\n\n## Features\n- Cross-browser testing\n- Auto-wait & assertions\n- Trace viewer`,
    price: 0.001,
    category: 'testing',
    icon: '🎭',
    docs: 'https://playwright.dev/docs'
  },

  // ============================================
  // BUNDLES
  // ============================================
  'bundle-ai': {
    name: 'AI/LLM Bundle',
    content: `# AI/LLM Documentation Bundle\n\nIncludes all AI documentation:\n- OpenAI Python SDK\n- Anthropic Claude SDK\n- LangChain Python & JS\n- Hugging Face Transformers\n\n*Complete documentation delivered upon purchase*`,
    price: 0.008,
    category: 'bundle',
    icon: '📦',
    docs: '/catalog'
  },
  'bundle-web3': {
    name: 'Web3 Bundle',
    content: `# Web3 Documentation Bundle\n\nIncludes all Web3 documentation:\n- wagmi\n- viem\n- Solana Web3.js\n- Ethers.js\n\n*Complete documentation delivered upon purchase*`,
    price: 0.006,
    category: 'bundle',
    icon: '📦',
    docs: '/catalog'
  },
  'bundle-all': {
    name: 'Complete Bundle',
    content: `# Complete Documentation Bundle\n\nIncludes ALL 24 documentation packages:\n- 5 AI/LLM libraries\n- 5 Database libraries\n- 4 Web3 libraries\n- 3 Web frameworks\n- And more...\n\n*Best value - save 50%*`,
    price: 0.025,
    category: 'bundle',
    icon: '🎁',
    docs: '/catalog'
  }
};

// x402 Payment Required Middleware (USDC-SPL on Solana)
async function x402Middleware(req, res, next) {
  // Check both headers and query params for payment proof
  const paymentProof = req.headers['x-payment-proof'] ||
                       req.headers['authorization'] ||
                       req.query.payment_proof ||
                       req.query.proof;
  const item = req.params.item;
  const inventoryItem = INVENTORY[item];

  // DEBUG: Log incoming request details
  console.log('\n[x402] === Payment Request ===');
  console.log('[x402] Item:', item);
  console.log('[x402] Headers:', JSON.stringify({
    'x-payment-proof': req.headers['x-payment-proof'],
    'authorization': req.headers['authorization']
  }));
  console.log('[x402] Query params:', JSON.stringify(req.query));
  console.log('[x402] Payment proof received:', paymentProof ? `"${paymentProof.substring(0, 20)}..."` : 'NONE');

  // Item doesn't exist
  if (!inventoryItem) {
    console.log('[x402] ERROR: Item not found');
    return res.status(404).json({
      error: 'Not Found',
      message: `Item '${item}' not found in inventory`,
      available_items: Object.keys(INVENTORY)
    });
  }

  // No payment proof provided - return 402 Payment Required
  if (!paymentProof) {
    console.log('[x402] BRANCH: No payment proof - returning payment instructions');
    let usdcTokenAccount = null;
    try {
      if (SOLANA_WALLET_ADDRESS) {
        usdcTokenAccount = (await getOurUSDCTokenAccount()).toBase58();
      }
    } catch (e) {
      console.error('Error getting USDC token account:', e.message);
    }

    return res.status(402).json({
      error: 'Payment Required',
      message: 'This content requires USDC micropayment on Solana',
      pricing: {
        item: item,
        amount: inventoryItem.price,
        currency: 'USDC',
        network: 'Solana (Mainnet)'
      },
      payment_instructions: {
        step1: 'Get USDC on Solana (swap SOL for USDC on Jupiter, Raydium, or buy on exchange)',
        step2: `Send exactly ${inventoryItem.price} USDC to our wallet`,
        step3: 'Include the transaction signature in x-payment-proof header',
        step4: 'Retry this request with the header'
      },
      payment_details: {
        wallet_address: SOLANA_WALLET_ADDRESS || 'Not configured',
        usdc_token_account: usdcTokenAccount || 'Not configured',
        usdc_mint: USDC_MINT.toBase58(),
        amount_usdc: inventoryItem.price,
        amount_base_units: Math.floor(inventoryItem.price * Math.pow(10, USDC_DECIMALS))
      },
      example_header: 'x-payment-proof: <your-solana-transaction-signature>',
      info_endpoint: '/payment-info',
      support: 'support@contextnow.dev'
    });
  }

  // Development/testing bypass
  if (paymentProof === 'valid_proof' && process.env.NODE_ENV !== 'production') {
    console.log('[x402] BRANCH: Development bypass - valid_proof accepted');
    return next();
  }

  // Verify USDC payment on Solana
  console.log('[x402] BRANCH: Verifying USDC payment on Solana...');
  console.log('[x402] Calling verifyUSDCPayment with:', {
    signature: paymentProof.substring(0, 20) + '...',
    expectedAmount: inventoryItem.price
  });

  const verification = await verifyUSDCPayment(paymentProof, inventoryItem.price);

  console.log('[x402] Verification result:', JSON.stringify(verification, null, 2));

  if (!verification.valid) {
    console.log('[x402] BRANCH: Payment verification FAILED - code:', verification.code);
    // Get USDC token account for retry info
    let usdcTokenAccount = null;
    try {
      if (SOLANA_WALLET_ADDRESS) {
        usdcTokenAccount = (await getOurUSDCTokenAccount()).toBase58();
      }
    } catch (e) {}

    return res.status(402).json({
      error: 'Payment Verification Failed',
      code: verification.code,
      reason: verification.error,
      details: verification.message,
      action_required: verification.action,

      // Include any additional context from verification
      ...(verification.solscan_url && { solscan_url: verification.solscan_url }),
      ...(verification.correct_address && { correct_address: verification.correct_address }),
      ...(verification.expected && {
        amount_expected: verification.expected,
        amount_received: verification.received,
        amount_shortfall: verification.shortfall
      }),

      // Retry information
      retry_info: {
        item: item,
        required_amount: inventoryItem.price,
        currency: 'USDC',
        payment_address: usdcTokenAccount || SOLANA_WALLET_ADDRESS || 'Not configured',
        header_to_use: 'x-payment-proof',
        header_value: '<your-new-transaction-signature>'
      },

      // Help links
      resources: {
        payment_info: '/payment-info',
        get_usdc: 'https://jup.ag',
        check_transaction: 'https://solscan.io'
      },
      support: 'support@contextnow.dev'
    });
  }

  // Payment verified - attach info to request and proceed
  console.log('[x402] BRANCH: Payment verification SUCCESS!');
  console.log('[x402] Amount received:', verification.amountReceived, 'USDC');
  req.paymentInfo = verification;
  next();
}

// Landing Page HTML
const LANDING_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ContextNow - Fresh Documentation for AI Agents</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&family=Syne:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg-void: #030305;
      --bg-primary: #08080c;
      --bg-elevated: #0d0d12;
      --bg-card: #111118;
      --bg-card-hover: #16161f;
      --cyan: #00F0FF;
      --cyan-dim: #00c4d4;
      --cyan-glow: rgba(0, 240, 255, 0.4);
      --magenta: #FF00FF;
      --magenta-dim: #cc00cc;
      --magenta-glow: rgba(255, 0, 255, 0.3);
      --amber: #FFB800;
      --text-primary: #f0f0f5;
      --text-secondary: #8888a0;
      --text-dim: #55556a;
      --border: #1a1a24;
      --border-glow: #2a2a3a;
    }

    @keyframes flicker {
      0%, 100% { opacity: 1; }
      92% { opacity: 1; }
      93% { opacity: 0.8; }
      94% { opacity: 1; }
      96% { opacity: 0.9; }
      97% { opacity: 1; }
    }

    @keyframes pulse-glow {
      0%, 100% { box-shadow: 0 0 20px var(--cyan-glow), inset 0 0 20px rgba(0, 240, 255, 0.05); }
      50% { box-shadow: 0 0 40px var(--cyan-glow), inset 0 0 30px rgba(0, 240, 255, 0.1); }
    }

    @keyframes scan {
      0% { transform: translateY(-100%); }
      100% { transform: translateY(100vh); }
    }

    @keyframes typing {
      from { width: 0; }
      to { width: 100%; }
    }

    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }

    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-10px); }
    }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(30px); }
      to { opacity: 1; transform: translateY(0); }
    }

    body {
      font-family: 'Outfit', sans-serif;
      background: var(--bg-void);
      color: var(--text-primary);
      line-height: 1.7;
      overflow-x: hidden;
      position: relative;
    }

    /* Scanline overlay */
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 0, 0, 0.03) 2px,
        rgba(0, 0, 0, 0.03) 4px
      );
      pointer-events: none;
      z-index: 9999;
    }

    /* Grid background */
    body::after {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image:
        linear-gradient(rgba(0, 240, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 240, 255, 0.03) 1px, transparent 1px);
      background-size: 60px 60px;
      pointer-events: none;
      z-index: -1;
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
      background: rgba(8, 8, 12, 0.9);
      backdrop-filter: blur(20px);
      position: sticky;
      top: 0;
      z-index: 1000;
    }

    nav .container {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-family: 'Syne', sans-serif;
      font-size: 1.6rem;
      font-weight: 800;
      color: var(--cyan);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 8px;
      text-shadow: 0 0 20px var(--cyan-glow);
      animation: flicker 4s infinite;
    }

    .logo-icon {
      font-size: 1.8rem;
      filter: drop-shadow(0 0 10px var(--cyan));
    }

    .logo span { color: var(--text-primary); text-shadow: none; }

    .nav-links { display: flex; gap: 32px; }

    .nav-links a {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-dim);
      text-decoration: none;
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      transition: all 0.3s;
      position: relative;
    }

    .nav-links a::before {
      content: '>';
      margin-right: 6px;
      color: var(--cyan);
      opacity: 0;
      transition: opacity 0.3s;
    }

    .nav-links a:hover {
      color: var(--cyan);
      text-shadow: 0 0 10px var(--cyan-glow);
    }

    .nav-links a:hover::before { opacity: 1; }

    /* Hero Section */
    .hero {
      min-height: 90vh;
      display: flex;
      align-items: center;
      padding: 80px 0;
      position: relative;
      overflow: hidden;
    }

    .hero::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background:
        radial-gradient(ellipse at 30% 20%, rgba(0, 240, 255, 0.08) 0%, transparent 50%),
        radial-gradient(ellipse at 70% 80%, rgba(255, 0, 255, 0.05) 0%, transparent 50%);
      animation: float 20s ease-in-out infinite;
    }

    .hero-content {
      position: relative;
      z-index: 1;
      text-align: center;
      width: 100%;
    }

    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 10px 24px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: var(--text-dim);
      margin-bottom: 40px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      animation: fadeInUp 0.8s ease-out;
    }

    .badge-dot {
      width: 8px;
      height: 8px;
      background: var(--cyan);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--cyan);
      animation: blink 1s infinite;
    }

    .hero-logo {
      font-size: 8rem;
      margin-bottom: 32px;
      filter: drop-shadow(0 0 60px var(--cyan-glow));
      animation: float 3s ease-in-out infinite, fadeInUp 0.8s ease-out 0.1s backwards;
    }

    .hero h1 {
      font-family: 'Syne', sans-serif;
      font-size: clamp(3rem, 8vw, 5.5rem);
      font-weight: 800;
      line-height: 1.1;
      margin-bottom: 24px;
      letter-spacing: -0.02em;
      animation: fadeInUp 0.8s ease-out 0.2s backwards;
    }

    .hero h1 .gradient {
      background: linear-gradient(135deg, var(--cyan) 0%, var(--magenta) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .hero-subtitle {
      font-size: 1.25rem;
      color: var(--text-secondary);
      max-width: 650px;
      margin: 0 auto 48px;
      font-weight: 300;
      animation: fadeInUp 0.8s ease-out 0.3s backwards;
    }

    .hero-subtitle strong {
      color: var(--cyan);
      font-weight: 500;
    }

    .hero-buttons {
      display: flex;
      gap: 20px;
      justify-content: center;
      flex-wrap: wrap;
      animation: fadeInUp 0.8s ease-out 0.4s backwards;
    }

    .btn {
      font-family: 'JetBrains Mono', monospace;
      padding: 16px 36px;
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: none;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
    }

    .btn-primary {
      background: var(--cyan);
      color: var(--bg-void);
      border: none;
      clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
    }

    .btn-primary::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
      transition: left 0.5s;
    }

    .btn-primary:hover::before { left: 100%; }

    .btn-primary:hover {
      box-shadow: 0 0 40px var(--cyan-glow), 0 0 80px rgba(0, 240, 255, 0.2);
      transform: translateY(-2px);
    }

    .btn-secondary {
      background: transparent;
      color: var(--text-primary);
      border: 1px solid var(--border);
      clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
    }

    .btn-secondary:hover {
      border-color: var(--magenta);
      color: var(--magenta);
      box-shadow: 0 0 30px var(--magenta-glow);
    }

    /* ASCII Decorations */
    .ascii-border {
      font-family: 'JetBrains Mono', monospace;
      color: var(--border);
      font-size: 0.7rem;
      white-space: pre;
      text-align: center;
      margin: 60px 0;
      opacity: 0.5;
    }

    /* Protocol Section */
    .protocol {
      padding: 100px 0;
      background: var(--bg-primary);
      position: relative;
    }

    .protocol::before {
      content: 'PROTOCOL_SEQUENCE';
      position: absolute;
      top: 40px;
      left: 50%;
      transform: translateX(-50%);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
      color: var(--text-dim);
      letter-spacing: 0.3em;
      opacity: 0.5;
    }

    .section-header {
      text-align: center;
      margin-bottom: 80px;
    }

    .section-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
      color: var(--cyan);
      letter-spacing: 0.3em;
      text-transform: uppercase;
      margin-bottom: 16px;
      display: block;
    }

    .section-title {
      font-family: 'Syne', sans-serif;
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 16px;
    }

    .section-subtitle {
      color: var(--text-secondary);
      font-size: 1.1rem;
      font-weight: 300;
    }

    .steps {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 2px;
      background: var(--border);
      border: 1px solid var(--border);
    }

    @media (max-width: 900px) {
      .steps { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 500px) {
      .steps { grid-template-columns: 1fr; }
    }

    .step {
      background: var(--bg-card);
      padding: 48px 32px;
      position: relative;
      transition: all 0.4s;
    }

    .step:hover {
      background: var(--bg-card-hover);
    }

    .step:hover .step-number {
      color: var(--bg-void);
      background: var(--cyan);
      box-shadow: 0 0 30px var(--cyan-glow);
    }

    .step-number {
      font-family: 'Syne', sans-serif;
      font-size: 2rem;
      font-weight: 800;
      color: var(--cyan);
      background: var(--bg-elevated);
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
      transition: all 0.4s;
      clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
    }

    .step h3 {
      font-family: 'Syne', sans-serif;
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .step p {
      color: var(--text-secondary);
      font-size: 0.9rem;
      font-weight: 300;
    }

    /* Terminal Section */
    .terminal-section {
      padding: 100px 0;
      position: relative;
    }

    .terminal-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
    }

    @media (max-width: 800px) {
      .terminal-grid { grid-template-columns: 1fr; }
    }

    .terminal {
      background: var(--bg-card);
      border: 1px solid var(--border);
      overflow: hidden;
      position: relative;
    }

    .terminal::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--cyan), transparent);
      opacity: 0;
      transition: opacity 0.3s;
    }

    .terminal:hover::before { opacity: 1; }

    .terminal-header {
      padding: 16px 20px;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .terminal-dots {
      display: flex;
      gap: 8px;
    }

    .terminal-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--border);
    }

    .terminal-dot.red { background: #ff5f57; }
    .terminal-dot.yellow { background: #febc2e; }
    .terminal-dot.green { background: #28c840; }

    .terminal-title {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: var(--text-dim);
      letter-spacing: 0.1em;
    }

    .terminal-badge {
      font-family: 'JetBrains Mono', monospace;
      padding: 4px 12px;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.05em;
    }

    .terminal-badge.error {
      background: rgba(248, 113, 113, 0.1);
      color: #f87171;
      border: 1px solid rgba(248, 113, 113, 0.3);
    }

    .terminal-badge.success {
      background: rgba(74, 222, 128, 0.1);
      color: #4ade80;
      border: 1px solid rgba(74, 222, 128, 0.3);
    }

    .terminal-body {
      padding: 24px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      line-height: 1.8;
      overflow-x: auto;
    }

    .terminal-body pre {
      margin: 0;
      font-family: inherit;
    }

    .comment { color: var(--text-dim); }
    .keyword { color: var(--magenta); }
    .string { color: #4ade80; }
    .number { color: var(--amber); }
    .property { color: var(--cyan); }
    .prompt { color: var(--magenta); }

    /* Pricing Matrix */
    .pricing {
      padding: 100px 0;
      background: var(--bg-primary);
      position: relative;
    }

    .pricing::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--border), transparent);
    }

    .pricing-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }

    @media (max-width: 900px) {
      .pricing-grid { grid-template-columns: 1fr; }
    }

    .price-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      padding: 40px;
      position: relative;
      transition: all 0.4s;
      clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px));
    }

    .price-card:hover {
      border-color: var(--cyan);
      transform: translateY(-8px);
    }

    .price-card.featured {
      border-color: var(--magenta);
      background: linear-gradient(135deg, var(--bg-card) 0%, rgba(255, 0, 255, 0.05) 100%);
    }

    .price-card.featured:hover {
      border-color: var(--magenta);
      box-shadow: 0 0 60px var(--magenta-glow);
    }

    .price-card.featured::before {
      content: 'RECOMMENDED';
      position: absolute;
      top: -1px;
      left: 40px;
      background: var(--magenta);
      color: var(--bg-void);
      padding: 6px 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.1em;
    }

    .price-card h3 {
      font-family: 'Syne', sans-serif;
      font-size: 1.3rem;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .price-card .description {
      color: var(--text-dim);
      font-size: 0.85rem;
      margin-bottom: 24px;
      font-weight: 300;
    }

    .price {
      font-family: 'Syne', sans-serif;
      font-size: 3rem;
      font-weight: 800;
      color: var(--cyan);
      line-height: 1;
      margin-bottom: 8px;
    }

    .price-card.featured .price { color: var(--magenta); }

    .price-unit {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: var(--text-dim);
      letter-spacing: 0.1em;
    }

    .price-features {
      margin-top: 32px;
      padding-top: 32px;
      border-top: 1px solid var(--border);
    }

    .price-features li {
      list-style: none;
      padding: 10px 0;
      color: var(--text-secondary);
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .price-features li::before {
      content: '//';
      font-family: 'JetBrains Mono', monospace;
      color: var(--cyan);
      font-size: 0.8rem;
    }

    .price-card.featured .price-features li::before { color: var(--magenta); }

    /* Benefits Grid */
    .benefits {
      padding: 100px 0;
    }

    .benefits-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 2px;
      background: var(--border);
      border: 1px solid var(--border);
    }

    @media (max-width: 900px) {
      .benefits-grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 500px) {
      .benefits-grid { grid-template-columns: 1fr; }
    }

    .benefit {
      background: var(--bg-card);
      padding: 48px 32px;
      text-align: center;
      position: relative;
      transition: all 0.4s;
    }

    .benefit:hover {
      background: var(--bg-card-hover);
    }

    .benefit:hover .benefit-icon {
      transform: scale(1.1);
      text-shadow: 0 0 40px var(--cyan-glow);
    }

    .benefit-icon {
      font-size: 3rem;
      margin-bottom: 20px;
      display: block;
      transition: all 0.4s;
    }

    .benefit h3 {
      font-family: 'Syne', sans-serif;
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--cyan);
    }

    .benefit p {
      color: var(--text-secondary);
      font-size: 0.85rem;
      font-weight: 300;
    }

    /* Footer */
    footer {
      padding: 60px 0 40px;
      border-top: 1px solid var(--border);
      background: var(--bg-primary);
    }

    .footer-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 48px;
    }

    @media (max-width: 700px) {
      .footer-content {
        flex-direction: column;
        gap: 32px;
      }
    }

    .footer-brand {
      max-width: 300px;
    }

    .footer-logo {
      font-family: 'Syne', sans-serif;
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--cyan);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }

    .footer-logo span { color: var(--text-primary); }

    .footer-tagline {
      color: var(--text-dim);
      font-size: 0.85rem;
      font-weight: 300;
    }

    .footer-links {
      display: flex;
      gap: 48px;
    }

    @media (max-width: 500px) {
      .footer-links {
        flex-direction: column;
        gap: 24px;
      }
    }

    .footer-column h4 {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
      color: var(--text-dim);
      letter-spacing: 0.2em;
      text-transform: uppercase;
      margin-bottom: 16px;
    }

    .footer-column a {
      display: block;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.9rem;
      padding: 6px 0;
      transition: all 0.3s;
    }

    .footer-column a:hover {
      color: var(--cyan);
      padding-left: 8px;
    }

    .footer-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 32px;
      border-top: 1px solid var(--border);
    }

    @media (max-width: 500px) {
      .footer-bottom {
        flex-direction: column;
        gap: 16px;
        text-align: center;
      }
    }

    .copyright {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-dim);
      font-size: 0.75rem;
      letter-spacing: 0.05em;
    }

    .footer-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: var(--text-dim);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      background: #4ade80;
      border-radius: 50%;
      box-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
    }
  </style>
</head>
<body>
  <nav>
    <div class="container">
      <a href="/" class="logo">
        <span class="logo-icon">⚡</span>
        Context<span>Now</span>
      </a>
      <div class="nav-links">
        <a href="#protocol">Protocol</a>
        <a href="#pricing">Pricing</a>
        <a href="#network">Network</a>
        <a href="/payment-info">API</a>
      </div>
    </div>
  </nav>

  <section class="hero">
    <div class="hero-content">
      <div class="container">
        <div class="hero-badge">
          <span class="badge-dot"></span>
          HTTP 402 • USDC on Solana • Live on Mainnet
        </div>
        <div class="hero-logo">⚡</div>
        <h1>Fresh docs for<br><span class="gradient">AI agents</span></h1>
        <p class="hero-subtitle">Stop scraping outdated documentation. Pay <strong>$0.001 USDC</strong> on Solana for instant access to always-current API docs. Transaction confirms in <strong>~400ms</strong>.</p>
        <div class="hero-buttons">
          <a href="/catalog" class="btn btn-primary">Access Catalog</a>
          <a href="https://github.com/contextnow/contextnow-api" class="btn btn-secondary" target="_blank">View Source</a>
        </div>
      </div>
    </div>
  </section>

  <div class="ascii-border">
┌──────────────────────────────────────────────────────────────────────────────┐
│  TRANSMISSION PROTOCOL v1.0.0  //  SECURE CHANNEL ESTABLISHED  //  READY    │
└──────────────────────────────────────────────────────────────────────────────┘
  </div>

  <section class="protocol" id="protocol">
    <div class="container">
      <div class="section-header">
        <span class="section-tag">// How it works</span>
        <h2 class="section-title">Four-step protocol</h2>
        <p class="section-subtitle">Seamless micropayments for AI agents</p>
      </div>
      <div class="steps">
        <div class="step">
          <div class="step-number">01</div>
          <h3>Request Documentation</h3>
          <p>Your AI agent sends a GET request to /buy/:item for the documentation it needs.</p>
        </div>
        <div class="step">
          <div class="step-number">02</div>
          <h3>Receive 402 Response</h3>
          <p>Server returns USDC amount, Solana wallet address, and payment instructions.</p>
        </div>
        <div class="step">
          <div class="step-number">03</div>
          <h3>Send USDC Payment</h3>
          <p>Send USDC on Solana with ~$0.00025 fee. Transaction confirms in ~400ms.</p>
        </div>
        <div class="step">
          <div class="step-number">04</div>
          <h3>Receive Content</h3>
          <p>Include transaction signature in header, receive fresh documentation instantly.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="terminal-section" id="api">
    <div class="container">
      <div class="section-header">
        <span class="section-tag">// Live examples</span>
        <h2 class="section-title">API in action</h2>
        <p class="section-subtitle">Real requests, real responses</p>
      </div>
      <div class="terminal-grid">
        <div class="terminal">
          <div class="terminal-header">
            <div class="terminal-dots">
              <span class="terminal-dot red"></span>
              <span class="terminal-dot yellow"></span>
              <span class="terminal-dot green"></span>
            </div>
            <span class="terminal-title">request.sh</span>
            <span class="terminal-badge error">402</span>
          </div>
          <div class="terminal-body">
<pre><span class="comment"># No payment = 402 with instructions</span>
<span class="prompt">$</span> curl https://contextnow.dev/buy/stripe-node

<span class="comment"># Response:</span>
{
  <span class="property">"error"</span>: <span class="string">"Payment Required"</span>,
  <span class="property">"pricing"</span>: {
    <span class="property">"amount"</span>: <span class="number">0.001</span>,
    <span class="property">"currency"</span>: <span class="string">"USDC"</span>,
    <span class="property">"network"</span>: <span class="string">"Solana (Mainnet)"</span>
  },
  <span class="property">"payment_details"</span>: {
    <span class="property">"usdc_token_account"</span>: <span class="string">"GbNZA3..."</span>
  }
}</pre>
          </div>
        </div>
        <div class="terminal">
          <div class="terminal-header">
            <div class="terminal-dots">
              <span class="terminal-dot red"></span>
              <span class="terminal-dot yellow"></span>
              <span class="terminal-dot green"></span>
            </div>
            <span class="terminal-title">request.sh</span>
            <span class="terminal-badge success">200</span>
          </div>
          <div class="terminal-body">
<pre><span class="comment"># Include Solana tx signature</span>
<span class="prompt">$</span> curl https://contextnow.dev/buy/stripe-node \\
  -H <span class="string">"x-payment-proof: 5UfD4v..."</span>

<span class="comment"># Response:</span>
{
  <span class="property">"success"</span>: <span class="keyword">true</span>,
  <span class="property">"content"</span>: <span class="string">"# Stripe API..."</span>,
  <span class="property">"charged"</span>: <span class="number">0.001</span>,
  <span class="property">"currency"</span>: <span class="string">"USDC"</span>
}</pre>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="pricing" id="pricing">
    <div class="container">
      <div class="section-header">
        <span class="section-tag">// Pricing matrix</span>
        <h2 class="section-title">Documentation packages</h2>
        <p class="section-subtitle">Real USDC micropayments on Solana Mainnet</p>
      </div>
      <div class="pricing-grid">
        <div class="price-card">
          <h3>Stripe API</h3>
          <p class="description">Complete SDK documentation with latest features</p>
          <div class="price">0.001</div>
          <div class="price-unit">USDC</div>
          <ul class="price-features">
            <li>Payment Intents API</li>
            <li>Webhook handling</li>
            <li>Error reference</li>
          </ul>
        </div>
        <div class="price-card featured">
          <h3>OpenAI SDK</h3>
          <p class="description">Python SDK documentation for GPT models</p>
          <div class="price">0.002</div>
          <div class="price-unit">USDC</div>
          <ul class="price-features">
            <li>Chat Completions API</li>
            <li>Multimodal input</li>
            <li>Streaming examples</li>
          </ul>
        </div>
        <div class="price-card">
          <h3>Complete Bundle</h3>
          <p class="description">All 27 packages included</p>
          <div class="price">0.025</div>
          <div class="price-unit">USDC</div>
          <ul class="price-features">
            <li>All documentation</li>
            <li>Integration patterns</li>
            <li>50% savings</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <section class="benefits" id="network">
    <div class="container">
      <div class="section-header">
        <span class="section-tag">// Why Solana + USDC</span>
        <h2 class="section-title">Network advantages</h2>
        <p class="section-subtitle">Built for micropayments at scale</p>
      </div>
      <div class="benefits-grid">
        <div class="benefit">
          <span class="benefit-icon">⚡</span>
          <h3>400ms Finality</h3>
          <p>Transactions confirm in under a second. Your agent gets docs instantly.</p>
        </div>
        <div class="benefit">
          <span class="benefit-icon">💸</span>
          <h3>~$0.00025 Fees</h3>
          <p>Send $0.001 and only pay a fraction of a cent in network fees.</p>
        </div>
        <div class="benefit">
          <span class="benefit-icon">🔵</span>
          <h3>USDC Stablecoin</h3>
          <p>No crypto volatility. 1 USDC = $1 USD, always. Circle-backed.</p>
        </div>
        <div class="benefit">
          <span class="benefit-icon">💎</span>
          <h3>65,000 TPS</h3>
          <p>Solana handles massive throughput. Built for real-world scale.</p>
        </div>
      </div>
    </div>
  </section>

  <footer>
    <div class="container">
      <div class="footer-content">
        <div class="footer-brand">
          <a href="/" class="footer-logo">⚡ Context<span>Now</span></a>
          <p class="footer-tagline">Fresh documentation for AI agents via HTTP 402 micropayments on Solana.</p>
        </div>
        <div class="footer-links">
          <div class="footer-column">
            <h4>Product</h4>
            <a href="/catalog">Documentation Catalog</a>
            <a href="/payment-info">Payment API</a>
            <a href="https://github.com/contextnow/contextnow-api" target="_blank">GitHub</a>
          </div>
          <div class="footer-column">
            <h4>Resources</h4>
            <a href="https://solscan.io" target="_blank">Solscan</a>
            <a href="https://jup.ag" target="_blank">Get USDC</a>
            <a href="mailto:support@contextnow.dev">Support</a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <span class="copyright">© 2026 CONTEXTNOW // POWERED BY USDC ON SOLANA</span>
        <div class="footer-status">
          <span class="status-dot"></span>
          All systems operational
        </div>
      </div>
    </div>
  </footer>
</body>
</html>`;

// Routes
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(LANDING_PAGE);
});

// Catalog Page HTML Generator
function generateCatalogPage() {
  // Category display configuration
  const categoryConfig = {
    'bundle': { title: 'Bundles', subtitle: 'Best value - save up to 50%', order: 0, icon: '📦' },
    'ai': { title: 'AI / LLM', subtitle: 'OpenAI, Anthropic, LangChain & more', order: 1, icon: '🧠' },
    'database': { title: 'Database', subtitle: 'ORMs, drivers & serverless databases', order: 2, icon: '💾' },
    'web3': { title: 'Web3 / Blockchain', subtitle: 'Ethereum, Solana & wallet libraries', order: 3, icon: '⛓️' },
    'framework': { title: 'Web Frameworks', subtitle: 'Next.js, Remix, Astro', order: 4, icon: '🚀' },
    'communication': { title: 'Communication', subtitle: 'SMS, email & messaging', order: 5, icon: '📡' },
    'infrastructure': { title: 'Infrastructure', subtitle: 'Deployment & hosting', order: 6, icon: '☁️' },
    'payments': { title: 'Payments', subtitle: 'Payment processing', order: 7, icon: '💳' },
    'testing': { title: 'Testing', subtitle: 'Unit & E2E testing', order: 8, icon: '🧪' }
  };

  // Group items by category
  const byCategory = {};
  Object.entries(INVENTORY).forEach(([id, item]) => {
    const cat = item.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({ id, ...item });
  });

  // Sort categories by order
  const sortedCategories = Object.keys(byCategory).sort((a, b) => {
    return (categoryConfig[a]?.order ?? 99) - (categoryConfig[b]?.order ?? 99);
  });

  // Generate HTML for each category section
  const sections = sortedCategories.map(cat => {
    const config = categoryConfig[cat] || { title: cat, subtitle: '', icon: '📄' };
    const items = byCategory[cat];

    const cards = items.map(item => {
      const isFeatured = item.id === 'bundle-all';
      return `
        <div class="product-card${isFeatured ? ' featured' : ''}">
          ${isFeatured ? '<div class="featured-badge">// BEST VALUE</div>' : ''}
          <div class="product-icon">${item.icon}</div>
          <h3>${item.name}</h3>
          <div class="product-price">
            <span class="price-amount">${item.price}</span>
            <span class="price-unit">USDC</span>
          </div>
          <a href="/buy/${item.id}" class="btn-purchase">
            <span class="btn-text">Purchase</span>
            <span class="btn-arrow">→</span>
          </a>
          ${item.docs && item.docs !== '/catalog' ? `<a href="${item.docs}" class="docs-link" target="_blank">View official docs</a>` : ''}
        </div>
      `;
    }).join('');

    return `
      <section class="category-section">
        <div class="category-header">
          <div class="category-icon">${config.icon}</div>
          <div class="category-info">
            <h2>${config.title}</h2>
            <p>${config.subtitle}</p>
          </div>
          <div class="category-count">${items.length} packages</div>
        </div>
        <div class="products-grid">
          ${cards}
        </div>
      </section>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Catalog - ContextNow</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&family=Syne:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg-void: #030305;
      --bg-primary: #08080c;
      --bg-elevated: #0d0d12;
      --bg-card: #111118;
      --bg-card-hover: #16161f;
      --cyan: #00F0FF;
      --cyan-dim: #00c4d4;
      --cyan-glow: rgba(0, 240, 255, 0.4);
      --magenta: #FF00FF;
      --magenta-dim: #cc00cc;
      --magenta-glow: rgba(255, 0, 255, 0.3);
      --amber: #FFB800;
      --text-primary: #f0f0f5;
      --text-secondary: #8888a0;
      --text-dim: #55556a;
      --border: #1a1a24;
      --border-glow: #2a2a3a;
    }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    body {
      font-family: 'Outfit', sans-serif;
      background: var(--bg-void);
      color: var(--text-primary);
      line-height: 1.7;
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Scanline overlay */
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 0, 0, 0.03) 2px,
        rgba(0, 0, 0, 0.03) 4px
      );
      pointer-events: none;
      z-index: 9999;
    }

    /* Grid background */
    body::after {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image:
        linear-gradient(rgba(0, 240, 255, 0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 240, 255, 0.02) 1px, transparent 1px);
      background-size: 50px 50px;
      pointer-events: none;
      z-index: -1;
    }

    .container {
      max-width: 1300px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* Navigation */
    nav {
      padding: 20px 0;
      border-bottom: 1px solid var(--border);
      background: rgba(8, 8, 12, 0.95);
      backdrop-filter: blur(20px);
      position: sticky;
      top: 0;
      z-index: 1000;
    }

    nav .container {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-family: 'Syne', sans-serif;
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--cyan);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 8px;
      text-shadow: 0 0 20px var(--cyan-glow);
    }

    .logo span { color: var(--text-primary); text-shadow: none; }

    .back-link {
      font-family: 'JetBrains Mono', monospace;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-dim);
      text-decoration: none;
      font-size: 0.8rem;
      padding: 10px 20px;
      border: 1px solid var(--border);
      letter-spacing: 0.05em;
      transition: all 0.3s;
      clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
    }

    .back-link:hover {
      color: var(--cyan);
      border-color: var(--cyan);
      box-shadow: 0 0 20px var(--cyan-glow);
    }

    /* Page Header */
    .page-header {
      padding: 80px 0 60px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }

    .page-header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background:
        radial-gradient(ellipse at 30% 0%, rgba(0, 240, 255, 0.08) 0%, transparent 50%),
        radial-gradient(ellipse at 70% 100%, rgba(255, 0, 255, 0.05) 0%, transparent 50%);
      pointer-events: none;
    }

    .page-header h1 {
      font-family: 'Syne', sans-serif;
      font-size: clamp(2.5rem, 5vw, 4rem);
      font-weight: 800;
      margin-bottom: 16px;
      position: relative;
    }

    .page-header h1 .gradient {
      background: linear-gradient(135deg, var(--cyan) 0%, var(--magenta) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .page-header p {
      color: var(--text-secondary);
      font-size: 1.1rem;
      max-width: 500px;
      margin: 0 auto;
      font-weight: 300;
      position: relative;
    }

    /* Stats Bar */
    .stats-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 2px;
      background: var(--border);
      border: 1px solid var(--border);
      margin: 40px 0 60px;
      animation: fadeInUp 0.6s ease-out 0.2s backwards;
    }

    @media (max-width: 700px) {
      .stats-bar { grid-template-columns: repeat(2, 1fr); }
    }

    .stat {
      background: var(--bg-card);
      padding: 32px 24px;
      text-align: center;
      transition: all 0.3s;
    }

    .stat:hover {
      background: var(--bg-card-hover);
    }

    .stat-value {
      font-family: 'Syne', sans-serif;
      font-size: 2.5rem;
      font-weight: 800;
      color: var(--cyan);
      line-height: 1;
      margin-bottom: 8px;
    }

    .stat-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
      color: var(--text-dim);
      letter-spacing: 0.15em;
      text-transform: uppercase;
    }

    /* Category Sections */
    .category-section {
      margin-bottom: 60px;
      animation: fadeInUp 0.6s ease-out backwards;
    }

    .category-section:nth-child(1) { animation-delay: 0.1s; }
    .category-section:nth-child(2) { animation-delay: 0.15s; }
    .category-section:nth-child(3) { animation-delay: 0.2s; }
    .category-section:nth-child(4) { animation-delay: 0.25s; }
    .category-section:nth-child(5) { animation-delay: 0.3s; }

    .category-header {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }

    @media (max-width: 600px) {
      .category-header {
        flex-wrap: wrap;
      }
      .category-count {
        width: 100%;
        text-align: left;
        margin-top: 8px;
      }
    }

    .category-icon {
      font-size: 2rem;
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-card);
      border: 1px solid var(--border);
      clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
    }

    .category-info {
      flex: 1;
    }

    .category-info h2 {
      font-family: 'Syne', sans-serif;
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .category-info p {
      color: var(--text-dim);
      font-size: 0.9rem;
      font-weight: 300;
    }

    .category-count {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: var(--cyan);
      background: var(--bg-card);
      padding: 8px 16px;
      border: 1px solid var(--border);
      letter-spacing: 0.05em;
    }

    /* Products Grid */
    .products-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
    }

    @media (max-width: 500px) {
      .products-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
    }

    @media (max-width: 380px) {
      .products-grid { grid-template-columns: 1fr; }
    }

    .product-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      padding: 24px 20px;
      position: relative;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
    }

    .product-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--cyan), transparent);
      opacity: 0;
      transition: opacity 0.3s;
    }

    .product-card:hover {
      transform: translateY(-6px);
      border-color: var(--cyan);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 30px var(--cyan-glow);
    }

    .product-card:hover::before { opacity: 1; }

    .product-card.featured {
      border-color: var(--magenta);
      background: linear-gradient(135deg, var(--bg-card) 0%, rgba(255, 0, 255, 0.08) 100%);
    }

    .product-card.featured::before {
      background: linear-gradient(90deg, transparent, var(--magenta), transparent);
    }

    .product-card.featured:hover {
      border-color: var(--magenta);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 40px var(--magenta-glow);
    }

    .featured-badge {
      position: absolute;
      top: -1px;
      left: 20px;
      background: var(--magenta);
      color: var(--bg-void);
      padding: 4px 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.6rem;
      font-weight: 700;
      letter-spacing: 0.05em;
    }

    .product-icon {
      font-size: 2.2rem;
      margin-bottom: 16px;
      filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.1));
    }

    .product-card h3 {
      font-family: 'Outfit', sans-serif;
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 16px;
      color: var(--text-primary);
      line-height: 1.3;
    }

    .product-price {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 6px;
      margin-bottom: 20px;
      padding: 12px 16px;
      background: var(--bg-elevated);
      width: 100%;
      border: 1px solid var(--border);
    }

    .price-amount {
      font-family: 'Syne', sans-serif;
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--cyan);
    }

    .product-card.featured .price-amount { color: var(--magenta); }

    .price-unit {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-dim);
      font-size: 0.7rem;
      letter-spacing: 0.05em;
    }

    .btn-purchase {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 12px 20px;
      background: var(--cyan);
      color: var(--bg-void);
      text-decoration: none;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      transition: all 0.3s;
      clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
    }

    .btn-purchase:hover {
      box-shadow: 0 0 30px var(--cyan-glow);
      transform: scale(1.02);
    }

    .btn-arrow {
      transition: transform 0.3s;
    }

    .btn-purchase:hover .btn-arrow {
      transform: translateX(4px);
    }

    .product-card.featured .btn-purchase {
      background: var(--magenta);
    }

    .product-card.featured .btn-purchase:hover {
      box-shadow: 0 0 30px var(--magenta-glow);
    }

    .docs-link {
      display: block;
      margin-top: 12px;
      color: var(--text-dim);
      text-decoration: none;
      font-size: 0.75rem;
      transition: all 0.3s;
      font-family: 'JetBrains Mono', monospace;
    }

    .docs-link:hover {
      color: var(--cyan);
    }

    /* API Notice */
    .api-notice {
      text-align: center;
      padding: 40px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      margin: 60px 0;
      position: relative;
      clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px));
    }

    .api-notice::before {
      content: '// API ACCESS';
      position: absolute;
      top: -1px;
      left: 40px;
      background: var(--bg-void);
      color: var(--text-dim);
      padding: 4px 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
      letter-spacing: 0.1em;
      border: 1px solid var(--border);
      border-top: none;
    }

    .api-notice p {
      color: var(--text-secondary);
      font-size: 0.95rem;
      font-weight: 300;
    }

    .api-notice a {
      color: var(--cyan);
      text-decoration: none;
      font-weight: 500;
      transition: all 0.3s;
    }

    .api-notice a:hover {
      text-shadow: 0 0 10px var(--cyan-glow);
    }

    /* Footer */
    footer {
      padding: 40px 0;
      border-top: 1px solid var(--border);
      background: var(--bg-primary);
    }

    .footer-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    @media (max-width: 600px) {
      .footer-content {
        flex-direction: column;
        gap: 16px;
        text-align: center;
      }
    }

    .copyright {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-dim);
      font-size: 0.75rem;
      letter-spacing: 0.05em;
    }

    .copyright a {
      color: var(--cyan);
      text-decoration: none;
    }

    .footer-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: var(--text-dim);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      background: #4ade80;
      border-radius: 50%;
      box-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
      animation: pulse 2s infinite;
    }
  </style>
</head>
<body>
  <nav>
    <div class="container">
      <a href="/" class="logo">⚡ Context<span>Now</span></a>
      <a href="/" class="back-link">← Back to Home</a>
    </div>
  </nav>

  <header class="page-header">
    <div class="container">
      <h1>Documentation <span class="gradient">Catalog</span></h1>
      <p>27 premium documentation packages. Pay with USDC on Solana.</p>
    </div>
  </header>

  <main class="container">
    <div class="stats-bar">
      <div class="stat">
        <div class="stat-value">27</div>
        <div class="stat-label">Packages</div>
      </div>
      <div class="stat">
        <div class="stat-value">9</div>
        <div class="stat-label">Categories</div>
      </div>
      <div class="stat">
        <div class="stat-value">$0.001</div>
        <div class="stat-label">Min Price</div>
      </div>
      <div class="stat">
        <div class="stat-value">~400ms</div>
        <div class="stat-label">Tx Speed</div>
      </div>
    </div>

    ${sections}

    <div class="api-notice">
      <p>Building an AI agent? Use our <a href="/catalog/json">JSON API endpoint</a> for programmatic access, or check <a href="/payment-info">payment details</a>.</p>
    </div>
  </main>

  <footer>
    <div class="container">
      <div class="footer-content">
        <span class="copyright">© 2026 CONTEXTNOW // <a href="mailto:support@contextnow.dev">support@contextnow.dev</a></span>
        <div class="footer-status">
          <span class="status-dot"></span>
          All systems operational
        </div>
      </div>
    </div>
  </footer>
</body>
</html>`;
}

app.get('/catalog', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(generateCatalogPage());
});

app.get('/catalog/json', async (req, res) => {
  // Group items by category
  const byCategory = {};
  Object.entries(INVENTORY).forEach(([id, item]) => {
    const cat = item.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({
      id,
      name: item.name,
      price: item.price,
      currency: 'USDC',
      docs: item.docs
    });
  });

  let usdcTokenAccount = null;
  try {
    if (SOLANA_WALLET_ADDRESS) {
      usdcTokenAccount = (await getOurUSDCTokenAccount()).toBase58();
    }
  } catch (e) {}

  res.json({
    total_items: Object.keys(INVENTORY).length,
    categories: byCategory,
    payment_info: {
      network: 'Solana (Mainnet)',
      currency: 'USDC-SPL',
      wallet_address: SOLANA_WALLET_ADDRESS || 'Not configured',
      usdc_token_account: usdcTokenAccount || 'Not configured',
      usdc_mint: USDC_MINT.toBase58()
    }
  });
});

// Payment Information Endpoint
app.get('/payment-info', async (req, res) => {
  let usdcTokenAccount = null;
  try {
    if (SOLANA_WALLET_ADDRESS) {
      usdcTokenAccount = (await getOurUSDCTokenAccount()).toBase58();
    }
  } catch (e) {
    console.error('Error getting USDC token account:', e.message);
  }

  const items = Object.entries(INVENTORY).map(([id, item]) => ({
    id,
    price_usdc: item.price,
    price_base_units: Math.floor(item.price * Math.pow(10, USDC_DECIMALS))
  }));

  res.json({
    service: 'ContextNow',
    payment_method: 'USDC-SPL on Solana',
    network: 'Solana Mainnet',

    wallet: {
      address: SOLANA_WALLET_ADDRESS || 'Not configured - set SOLANA_WALLET_ADDRESS env var',
      usdc_token_account: usdcTokenAccount || 'Not configured',
      note: 'Send USDC to the usdc_token_account address'
    },

    usdc_token: {
      mint: USDC_MINT.toBase58(),
      decimals: USDC_DECIMALS,
      name: 'USD Coin',
      network: 'Solana SPL Token'
    },

    pricing: items,

    instructions: {
      step1: {
        title: 'Get USDC on Solana',
        options: [
          'Swap SOL for USDC on Jupiter (jup.ag)',
          'Swap on Raydium (raydium.io)',
          'Buy USDC on an exchange and withdraw to Solana'
        ]
      },
      step2: {
        title: 'Send USDC Payment',
        details: `Send the exact USDC amount to: ${usdcTokenAccount || 'Configure wallet first'}`,
        important: 'Send USDC tokens, NOT SOL'
      },
      step3: {
        title: 'Get Transaction Signature',
        details: 'After sending, copy the transaction signature from your wallet or Solscan'
      },
      step4: {
        title: 'Make API Request',
        details: 'Include the signature in your request header',
        example: {
          endpoint: 'GET /buy/:item',
          headers: {
            'x-payment-proof': '<your-transaction-signature>'
          }
        }
      }
    },

    verification: {
      tolerance: '1% (to account for rounding)',
      replay_protection: 'Each transaction signature can only be used once',
      confirmation: 'Transaction must be confirmed on Solana'
    },

    links: {
      jupiter_swap: 'https://jup.ag',
      solscan: 'https://solscan.io',
      usdc_info: 'https://www.circle.com/en/usdc'
    },

    support: {
      email: 'support@contextnow.dev',
      message: 'Having issues? Contact us for help with payments or integration.'
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
    currency: 'USDC',
    payment: req.paymentInfo || { method: 'development_bypass' },
    content: inventoryItem.content,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, async () => {
  console.log('='.repeat(50));
  console.log('🚀 CONTEXTNOW - Fresh Docs for AI Agents');
  console.log('   💰 Powered by USDC on Solana');
  console.log('='.repeat(50));
  console.log(`Server running at http://localhost:${PORT}`);

  // Show wallet configuration status
  if (SOLANA_WALLET_ADDRESS) {
    try {
      const usdcAccount = await getOurUSDCTokenAccount();
      console.log(`\n💳 USDC Payments Enabled`);
      console.log(`   Wallet: ${SOLANA_WALLET_ADDRESS.slice(0, 8)}...${SOLANA_WALLET_ADDRESS.slice(-8)}`);
      console.log(`   USDC Account: ${usdcAccount.toBase58().slice(0, 8)}...`);
    } catch (e) {
      console.log(`\n⚠️  Wallet configured but USDC account error: ${e.message}`);
    }
  } else {
    console.log('\n⚠️  No SOLANA_WALLET_ADDRESS configured');
    console.log('   Set it in .env to accept real payments');
    console.log('   Using "valid_proof" bypass for development');
  }

  console.log(`\n📦 Available items: ${Object.keys(INVENTORY).join(', ')}`);
  console.log('\n🔗 Endpoints:');
  console.log('   GET /             - Landing page');
  console.log('   GET /catalog      - Browse documentation');
  console.log('   GET /catalog/json - API catalog');
  console.log('   GET /payment-info - USDC payment instructions');
  console.log('   GET /buy/:item    - Purchase (requires USDC payment)');
  console.log('='.repeat(50));
});
