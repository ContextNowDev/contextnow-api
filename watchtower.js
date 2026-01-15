const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ============================================
// DOCUMENTATION SOURCES TO MONITOR
// ============================================
// Each source has: name, GitHub repo, docs URL, and category

const SOURCES = [
  // --- AI / LLM ---
  {
    name: 'OpenAI Python',
    repo: 'openai/openai-python',
    docs: 'https://platform.openai.com/docs',
    category: 'ai'
  },
  {
    name: 'Anthropic Claude',
    repo: 'anthropics/anthropic-sdk-python',
    docs: 'https://docs.anthropic.com',
    category: 'ai'
  },
  {
    name: 'LangChain Python',
    repo: 'langchain-ai/langchain',
    docs: 'https://python.langchain.com/docs',
    category: 'ai'
  },
  {
    name: 'LangChain JS',
    repo: 'langchain-ai/langchainjs',
    docs: 'https://js.langchain.com/docs',
    category: 'ai'
  },
  {
    name: 'Hugging Face Transformers',
    repo: 'huggingface/transformers',
    docs: 'https://huggingface.co/docs/transformers',
    category: 'ai'
  },

  // --- Payments / Fintech ---
  {
    name: 'Stripe Node',
    repo: 'stripe/stripe-node',
    docs: 'https://stripe.com/docs/api',
    category: 'payments'
  },

  // --- Web Frameworks ---
  {
    name: 'Next.js',
    repo: 'vercel/next.js',
    docs: 'https://nextjs.org/docs',
    category: 'framework'
  },
  {
    name: 'Remix',
    repo: 'remix-run/remix',
    docs: 'https://remix.run/docs',
    category: 'framework'
  },
  {
    name: 'Astro',
    repo: 'withastro/astro',
    docs: 'https://docs.astro.build',
    category: 'framework'
  },

  // --- Communication ---
  {
    name: 'Twilio Node',
    repo: 'twilio/twilio-node',
    docs: 'https://www.twilio.com/docs',
    category: 'communication'
  },
  {
    name: 'SendGrid Node',
    repo: 'sendgrid/sendgrid-nodejs',
    docs: 'https://docs.sendgrid.com',
    category: 'communication'
  },

  // --- Backend / Database ---
  {
    name: 'Supabase JS',
    repo: 'supabase/supabase-js',
    docs: 'https://supabase.com/docs',
    category: 'database'
  },
  {
    name: 'MongoDB Node',
    repo: 'mongodb/node-mongodb-native',
    docs: 'https://www.mongodb.com/docs/drivers/node/current',
    category: 'database'
  },
  {
    name: 'PlanetScale Database JS',
    repo: 'planetscale/database-js',
    docs: 'https://planetscale.com/docs',
    category: 'database'
  },
  {
    name: 'Prisma',
    repo: 'prisma/prisma',
    docs: 'https://www.prisma.io/docs',
    category: 'database'
  },
  {
    name: 'Drizzle ORM',
    repo: 'drizzle-team/drizzle-orm',
    docs: 'https://orm.drizzle.team/docs',
    category: 'database'
  },

  // --- Deployment / Infrastructure ---
  {
    name: 'Vercel CLI',
    repo: 'vercel/vercel',
    docs: 'https://vercel.com/docs',
    category: 'infrastructure'
  },
  {
    name: 'Railway CLI',
    repo: 'railwayapp/cli',
    docs: 'https://docs.railway.app',
    category: 'infrastructure'
  },

  // --- Web3 / Blockchain ---
  {
    name: 'wagmi',
    repo: 'wevm/wagmi',
    docs: 'https://wagmi.sh',
    category: 'web3'
  },
  {
    name: 'viem',
    repo: 'wevm/viem',
    docs: 'https://viem.sh',
    category: 'web3'
  },
  {
    name: 'Solana Web3.js',
    repo: 'solana-labs/solana-web3.js',
    docs: 'https://solana-labs.github.io/solana-web3.js',
    category: 'web3'
  },
  {
    name: 'Ethers.js',
    repo: 'ethers-io/ethers.js',
    docs: 'https://docs.ethers.org',
    category: 'web3'
  },

  // --- Testing / Dev Tools ---
  {
    name: 'Vitest',
    repo: 'vitest-dev/vitest',
    docs: 'https://vitest.dev',
    category: 'testing'
  },
  {
    name: 'Playwright',
    repo: 'microsoft/playwright',
    docs: 'https://playwright.dev/docs',
    category: 'testing'
  }
];

// Legacy array for backwards compatibility
const REPOS = SOURCES.map(s => s.repo);

const DB_PATH = path.join(__dirname, 'version_db.json');

async function getLatestRelease(repo) {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${repo}/releases/latest`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Context-Service-MVP'
        }
      }
    );
    return response.data.tag_name;
  } catch (error) {
    if (error.response?.status === 404) {
      // No releases found, try tags instead
      const tagsResponse = await axios.get(
        `https://api.github.com/repos/${repo}/tags`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Context-Service-MVP'
          }
        }
      );
      if (tagsResponse.data.length > 0) {
        return tagsResponse.data[0].name;
      }
    }
    console.error(`Error fetching ${repo}:`, error.message);
    return null;
  }
}

function loadDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('Creating new version database...');
    return {};
  }
  const data = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(data);
}

function saveDatabase(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

async function checkForUpdates() {
  console.log('='.repeat(60));
  console.log('WATCHTOWER - Documentation Release Monitor');
  console.log(`Monitoring ${SOURCES.length} libraries across ${new Set(SOURCES.map(s => s.category)).size} categories`);
  console.log(`Checking at: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  const db = loadDatabase();
  const updates = [];
  const errors = [];
  const categoryCount = {};

  for (const source of SOURCES) {
    const { name, repo, docs, category } = source;
    categoryCount[category] = (categoryCount[category] || 0) + 1;

    process.stdout.write(`Checking ${name}...`);
    const latestVersion = await getLatestRelease(repo);

    if (!latestVersion) {
      console.log(' [ERROR]');
      errors.push(name);
      continue;
    }

    const storedVersion = db[repo];

    if (!storedVersion) {
      console.log(` ${latestVersion} [NEW]`);
      db[repo] = latestVersion;
      updates.push({ name, repo, oldVersion: null, newVersion: latestVersion, docs });
    } else if (storedVersion !== latestVersion) {
      console.log(` ${storedVersion} -> ${latestVersion} [UPDATED]`);
      updates.push({ name, repo, oldVersion: storedVersion, newVersion: latestVersion, docs });
      db[repo] = latestVersion;
    } else {
      console.log(` ${latestVersion} [OK]`);
    }
  }

  saveDatabase(db);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  console.log('\nLibraries by category:');
  Object.entries(categoryCount).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`);
  });

  if (updates.length > 0) {
    console.log(`\n${updates.length} UPDATE(S) DETECTED:`);
    updates.forEach(u => {
      if (u.oldVersion) {
        console.log(`  - ${u.name}: ${u.oldVersion} -> ${u.newVersion}`);
      } else {
        console.log(`  - ${u.name}: ${u.newVersion} (first scan)`);
      }
      console.log(`    Docs: ${u.docs}`);
    });
  } else {
    console.log('\nNo updates found. All versions are current.');
  }

  if (errors.length > 0) {
    console.log(`\n${errors.length} ERROR(S):`);
    errors.forEach(e => console.log(`  - ${e}`));
  }

  console.log('\n' + '='.repeat(60));
  return { updates, errors };
}

// Run the check
checkForUpdates();

// Export for use in other modules
module.exports = { SOURCES, checkForUpdates };
