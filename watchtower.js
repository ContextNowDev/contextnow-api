const axios = require('axios');
const fs = require('fs');
const path = require('path');

const REPOS = [
  'openai/openai-python',
  'stripe/stripe-node'
];

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
  console.log('='.repeat(50));
  console.log('WATCHTOWER - GitHub Release Monitor');
  console.log(`Checking at: ${new Date().toISOString()}`);
  console.log('='.repeat(50));

  const db = loadDatabase();
  let hasUpdates = false;

  for (const repo of REPOS) {
    console.log(`\nChecking ${repo}...`);
    const latestVersion = await getLatestRelease(repo);

    if (!latestVersion) {
      console.log(`  Could not fetch version for ${repo}`);
      continue;
    }

    const storedVersion = db[repo];

    if (!storedVersion) {
      console.log(`  First run - storing version: ${latestVersion}`);
      db[repo] = latestVersion;
      hasUpdates = true;
    } else if (storedVersion !== latestVersion) {
      console.log(`  NEW PRODUCT ALERT for ${repo}!`);
      console.log(`  Old version: ${storedVersion}`);
      console.log(`  New version: ${latestVersion}`);
      db[repo] = latestVersion;
      hasUpdates = true;
    } else {
      console.log(`  No updates (current: ${latestVersion})`);
    }
  }

  saveDatabase(db);

  console.log('\n' + '='.repeat(50));
  if (hasUpdates) {
    console.log('Database updated with new versions.');
  } else {
    console.log('No updates found. All versions are current.');
  }
  console.log('='.repeat(50));
}

// Run the check
checkForUpdates();
