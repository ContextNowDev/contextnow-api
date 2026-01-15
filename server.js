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

    .hero-logo {
      font-size: 5rem;
      margin-bottom: 16px;
      filter: drop-shadow(0 0 20px var(--cyan-glow));
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
      margin-bottom: 20px;
    }

    .section-subtitle {
      text-align: center;
      color: var(--text-secondary);
      font-size: 1.1rem;
      margin-bottom: 50px;
    }

    .how-it-works .section-title,
    .api-examples .section-title,
    .why-solana .section-title {
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

    /* Why Solana Section */
    .why-solana {
      padding: 80px 0;
    }

    .benefits-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 32px;
    }

    .benefit {
      text-align: center;
      padding: 32px 24px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      transition: all 0.2s;
    }

    .benefit:hover {
      border-color: var(--cyan);
      transform: translateY(-4px);
    }

    .benefit-icon {
      font-size: 2.5rem;
      margin-bottom: 16px;
    }

    .benefit h3 {
      font-size: 1.25rem;
      margin-bottom: 12px;
      color: var(--cyan);
    }

    .benefit p {
      color: var(--text-secondary);
      font-size: 0.95rem;
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
        <a href="#pricing">Pricing</a>
        <a href="#why-solana">Why Solana</a>
        <a href="/payment-info">API</a>
      </div>
    </div>
  </nav>

  <section class="hero">
    <div class="container">
      <div class="hero-badge">HTTP 402 • USDC on Solana • Real Micropayments</div>
      <div class="hero-logo">⚡</div>
      <h1>Fresh documentation for AI agents</h1>
      <p>Stop scraping outdated docs. Pay $0.001-$0.005 USDC on Solana for instant access to always-current API documentation.</p>
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
          <h3>Receive 402 + USDC Details</h3>
          <p>We return USDC amount, Solana wallet address, and payment instructions.</p>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <h3>Send 0.001-0.005 USDC</h3>
          <p>Send USDC on Solana (~$0.00025 fee). Transaction confirms in ~400ms.</p>
        </div>
        <div class="step">
          <div class="step-number">4</div>
          <h3>Get Instant Access</h3>
          <p>Include transaction signature in header, receive fresh documentation instantly.</p>
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
          <pre><span class="comment"># No payment = 402 with instructions</span>
curl https://contextnow.dev/buy/stripe-2026

<span class="comment"># Response:</span>
{
  <span class="property">"error"</span>: <span class="string">"Payment Required"</span>,
  <span class="property">"pricing"</span>: {
    <span class="property">"amount"</span>: <span class="number">0.001</span>,
    <span class="property">"currency"</span>: <span class="string">"USDC"</span>,
    <span class="property">"network"</span>: <span class="string">"Solana (Mainnet)"</span>
  },
  <span class="property">"payment_details"</span>: {
    <span class="property">"usdc_token_account"</span>: <span class="string">"GbNZA3pV..."</span>
  }
}</pre>
        </div>
        <div class="code-block">
          <div class="code-header">
            <span class="code-title">Request with Solana tx signature</span>
            <span class="code-badge success">200</span>
          </div>
          <pre><span class="comment"># Include your Solana tx signature</span>
curl https://contextnow.dev/buy/stripe-2026 \\
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
  </section>

  <section class="pricing" id="pricing">
    <div class="container">
      <h2 class="section-title">Documentation Catalog</h2>
      <p class="section-subtitle">Real USDC micropayments on Solana Mainnet. Not a demo.</p>
      <div class="pricing-grid">
        <div class="price-card">
          <h3>Stripe API 2026</h3>
          <p class="description">Complete Stripe SDK documentation with latest features</p>
          <div class="price">0.001 <span>USDC</span></div>
          <ul class="price-features">
            <li>Payment Intents API</li>
            <li>Neural verification docs</li>
            <li>Quantum encryption guide</li>
          </ul>
        </div>
        <div class="price-card featured">
          <h3>OpenAI SDK 2026</h3>
          <p class="description">Python SDK documentation for GPT-5 and beyond</p>
          <div class="price">0.002 <span>USDC</span></div>
          <ul class="price-features">
            <li>Chat Completions API</li>
            <li>Multimodal input guide</li>
            <li>1M context examples</li>
          </ul>
        </div>
        <div class="price-card">
          <h3>Combined Bundle</h3>
          <p class="description">Everything included plus integration patterns</p>
          <div class="price">0.005 <span>USDC</span></div>
          <ul class="price-features">
            <li>All documentation</li>
            <li>Integration patterns</li>
            <li>Best practices guide</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <section class="why-solana" id="why-solana">
    <div class="container">
      <h2 class="section-title">Why Solana + USDC?</h2>
      <div class="benefits-grid">
        <div class="benefit">
          <div class="benefit-icon">&#9889;</div>
          <h3>400ms Finality</h3>
          <p>Transactions confirm in under a second. Your agent gets docs instantly.</p>
        </div>
        <div class="benefit">
          <div class="benefit-icon">&#128184;</div>
          <h3>~$0.00025 Fees</h3>
          <p>Send $0.001 and only pay a fraction of a cent in network fees.</p>
        </div>
        <div class="benefit">
          <div class="benefit-icon">&#128311;</div>
          <h3>USDC Stablecoin</h3>
          <p>No crypto volatility. 1 USDC = $1 USD, always. Circle-backed.</p>
        </div>
        <div class="benefit">
          <div class="benefit-icon">&#128142;</div>
          <h3>Production-Grade</h3>
          <p>Solana processes 65,000 TPS. Built for real-world scale.</p>
        </div>
      </div>
    </div>
  </section>

  <footer>
    <div class="container">
      <div class="footer-links">
        <a href="/catalog">Documentation Catalog</a>
        <a href="/payment-info">Payment API</a>
        <a href="https://solscan.io" target="_blank">Solscan</a>
        <a href="https://jup.ag" target="_blank">Get USDC</a>
        <a href="mailto:support@contextnow.dev">Contact</a>
      </div>
      <p class="copyright">© 2026 ContextNow. Powered by USDC on Solana.</p>
      <p class="copyright" style="margin-top: 8px;">Questions? <a href="mailto:support@contextnow.dev" style="color: var(--cyan);">support@contextnow.dev</a></p>
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
    'bundle': { title: 'Bundles', subtitle: 'Best value - save up to 50%', order: 0 },
    'ai': { title: 'AI / LLM', subtitle: 'OpenAI, Anthropic, LangChain & more', order: 1 },
    'database': { title: 'Database', subtitle: 'ORMs, drivers & serverless databases', order: 2 },
    'web3': { title: 'Web3 / Blockchain', subtitle: 'Ethereum, Solana & wallet libraries', order: 3 },
    'framework': { title: 'Web Frameworks', subtitle: 'Next.js, Remix, Astro', order: 4 },
    'communication': { title: 'Communication', subtitle: 'SMS, email & messaging', order: 5 },
    'infrastructure': { title: 'Infrastructure', subtitle: 'Deployment & hosting', order: 6 },
    'payments': { title: 'Payments', subtitle: 'Payment processing', order: 7 },
    'testing': { title: 'Testing', subtitle: 'Unit & E2E testing', order: 8 }
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
    const config = categoryConfig[cat] || { title: cat, subtitle: '' };
    const items = byCategory[cat];

    const cards = items.map(item => {
      const isBundle = item.category === 'bundle';
      const isFeatured = item.id === 'bundle-all';
      return `
        <div class="product-card${isFeatured ? ' featured' : ''}">
          ${isFeatured ? '<div class="featured-badge">BEST VALUE</div>' : ''}
          <div class="product-icon">${item.icon}</div>
          <h3>${item.name}</h3>
          <div class="product-price">
            <span class="price-amount">${item.price}</span>
            <span class="price-unit">USDC</span>
          </div>
          <a href="/buy/${item.id}" class="btn btn-purchase">Purchase</a>
          ${item.docs && item.docs !== '/catalog' ? `<a href="${item.docs}" class="docs-link" target="_blank">Official Docs →</a>` : ''}
        </div>
      `;
    }).join('');

    return `
      <section class="category-section">
        <div class="category-header">
          <h2>${config.title}</h2>
          <p>${config.subtitle}</p>
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
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg-primary: #0F172A;
      --bg-secondary: #1E293B;
      --bg-card: #334155;
      --blue: #00D9FF;
      --blue-dim: #00b8d9;
      --blue-glow: rgba(0, 217, 255, 0.3);
      --indigo: #6366F1;
      --indigo-dim: #4F46E5;
      --text-primary: #F8FAFC;
      --text-secondary: #CBD5E1;
      --text-dim: #64748B;
      --border: #475569;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      min-height: 100vh;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px;
    }

    nav {
      padding: 20px 0;
      border-bottom: 1px solid var(--border);
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(10px);
      position: sticky;
      top: 0;
      z-index: 100;
    }

    nav .container {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--blue);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .logo span { color: var(--text-primary); }

    .back-link {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.95rem;
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid var(--border);
      transition: all 0.2s;
    }

    .back-link:hover {
      color: var(--blue);
      border-color: var(--blue);
    }

    .page-header {
      padding: 60px 0 40px;
      text-align: center;
      background: radial-gradient(ellipse at top, rgba(99, 102, 241, 0.15) 0%, transparent 60%);
    }

    .page-header h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 16px;
      background: linear-gradient(135deg, var(--text-primary) 0%, var(--blue) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .page-header p {
      color: var(--text-secondary);
      font-size: 1.1rem;
      max-width: 600px;
      margin: 0 auto;
    }

    .category-section {
      padding: 40px 0;
      border-bottom: 1px solid var(--border);
    }

    .category-section:last-child {
      border-bottom: none;
    }

    .category-header {
      margin-bottom: 32px;
    }

    .category-header h2 {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 8px;
    }

    .category-header p {
      color: var(--text-dim);
      font-size: 0.95rem;
    }

    .products-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 20px;
    }

    @media (max-width: 640px) {
      .products-grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 400px) {
      .products-grid { grid-template-columns: 1fr; }
    }

    .product-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      position: relative;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .product-card:hover {
      transform: translateY(-4px);
      border-color: var(--blue);
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.3);
    }

    .product-card.featured {
      border-color: var(--indigo);
      background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(99, 102, 241, 0.1) 100%);
    }

    .product-card.featured:hover {
      border-color: var(--indigo);
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.3), 0 0 20px rgba(99, 102, 241, 0.2);
    }

    .featured-badge {
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, var(--indigo) 0%, var(--indigo-dim) 100%);
      color: white;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .product-icon {
      font-size: 2rem;
      margin-bottom: 12px;
    }

    .product-card h3 {
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--text-primary);
      line-height: 1.3;
    }

    .product-price {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 4px;
      margin-bottom: 16px;
      padding: 8px 12px;
      background: var(--bg-primary);
      border-radius: 8px;
      width: 100%;
    }

    .price-amount {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--blue);
    }

    .price-unit {
      color: var(--text-dim);
      font-size: 0.75rem;
    }

    .btn-purchase {
      display: block;
      width: 100%;
      padding: 10px 16px;
      background: linear-gradient(135deg, var(--blue) 0%, var(--blue-dim) 100%);
      color: var(--bg-primary);
      text-decoration: none;
      text-align: center;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.85rem;
      transition: all 0.2s;
    }

    .btn-purchase:hover {
      transform: scale(1.02);
      box-shadow: 0 4px 12px var(--blue-glow);
    }

    .product-card.featured .btn-purchase {
      background: linear-gradient(135deg, var(--indigo) 0%, var(--indigo-dim) 100%);
    }

    .docs-link {
      display: block;
      margin-top: 8px;
      color: var(--text-dim);
      text-decoration: none;
      font-size: 0.75rem;
      transition: color 0.2s;
    }

    .docs-link:hover {
      color: var(--blue);
    }

    .api-notice {
      text-align: center;
      padding: 24px;
      background: var(--bg-secondary);
      border-radius: 12px;
      margin: 40px 0;
      border: 1px solid var(--border);
    }

    .api-notice p {
      color: var(--text-secondary);
      font-size: 0.9rem;
    }

    .api-notice a {
      color: var(--blue);
      text-decoration: none;
    }

    .api-notice a:hover {
      text-decoration: underline;
    }

    .stats-bar {
      display: flex;
      justify-content: center;
      gap: 48px;
      padding: 24px;
      background: var(--bg-secondary);
      border-radius: 12px;
      margin-bottom: 40px;
      border: 1px solid var(--border);
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--blue);
    }

    .stat-label {
      font-size: 0.85rem;
      color: var(--text-dim);
    }

    footer {
      padding: 30px 0;
      border-top: 1px solid var(--border);
      text-align: center;
    }

    .copyright {
      color: var(--text-dim);
      font-size: 0.85rem;
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
      <h1>Documentation Catalog</h1>
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
      <p class="copyright">© 2026 ContextNow. Pay for what you use.</p>
      <p class="copyright" style="margin-top: 8px;">Need help? <a href="mailto:support@contextnow.dev" style="color: var(--blue);">support@contextnow.dev</a></p>
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
