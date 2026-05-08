#!/usr/bin/env node
/**
 * Auto-translate help center articles using the platform's AI API.
 * Reads Spanish articles from DB, translates to pt/tr/ar, inserts results.
 *
 * Usage (run on server):
 *   cd /opt/crm
 *   node scripts/help-center-translate.js
 *
 * Requirements: npm install pg (already in api deps, or install globally)
 */

const { Client } = require('pg');
const https = require('https');

// ── Config ────────────────────────────────────────────────────────────────────

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'crm_dev',
  user: process.env.DB_USER || 'crm',
  password: process.env.DB_PASS || process.env.POSTGRES_PASSWORD || '',
};

const LANGS = [
  { code: 'pt', name: 'Brazilian Portuguese' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ar', name: 'Modern Standard Arabic' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({ hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error(`Invalid JSON: ${raw.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function translateWithOpenAI(apiKey, model, text, targetLang) {
  const result = await httpsPost('api.openai.com', '/v1/chat/completions', {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }, {
    model: model || 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Translate the following markdown text to ${targetLang}. Keep all markdown formatting (# headings, **bold**, tables with |, code blocks with \`\`\`, bullet points with -). Translate only the text content, not the markdown syntax. Return only the translated text with no explanations.`,
      },
      { role: 'user', content: text },
    ],
    temperature: 0.2,
  });
  return result.choices?.[0]?.message?.content ?? text;
}

async function translateWithAnthropic(apiKey, model, text, targetLang) {
  const result = await httpsPost('api.anthropic.com', '/v1/messages', {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  }, {
    model: model || 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Translate the following markdown text to ${targetLang}. Keep all markdown formatting (# headings, **bold**, tables with |, code blocks with \`\`\`, bullet points with -). Translate only the text content, not the markdown syntax. Return only the translated text with no explanations.\n\n${text}`,
    }],
  });
  return result.content?.[0]?.text ?? text;
}

function generateUUID(baseId, lang) {
  // Map b1... -> b3... (pt), b4... (tr), b5... (ar)
  const prefix = { pt: 'b3', tr: 'b4', ar: 'b5' }[lang] || 'b9';
  return baseId.replace(/^b[0-9]/, prefix);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = new Client(DB_CONFIG);
  await db.connect();
  console.log('Connected to database');

  // Get platform AI settings
  const settingsRows = await db.query(`SELECT key, value FROM platform_settings WHERE key IN ('ai.api_key', 'ai.provider', 'ai.model')`);
  const settings = Object.fromEntries(settingsRows.rows.map(r => [r.key, r.value]));

  const apiKey = settings['ai.api_key'] || process.env.PLATFORM_AI_API_KEY;
  const provider = (settings['ai.provider'] || process.env.PLATFORM_AI_PROVIDER || 'openai').toLowerCase();
  const model = settings['ai.model'] || process.env.PLATFORM_AI_MODEL;

  if (!apiKey) {
    console.error('ERROR: No AI API key found in platform_settings or environment. Add it via Settings → Platform → AI.');
    process.exit(1);
  }

  console.log(`Using AI provider: ${provider}, model: ${model || 'default'}`);

  // Read all Spanish global articles
  const { rows: articles } = await db.query(
    `SELECT id, category_id, title, body, video_url, position, is_published, is_global
     FROM help_articles
     WHERE is_global = true AND lang = 'es'
     ORDER BY position ASC`
  );

  console.log(`Found ${articles.length} Spanish articles to translate`);

  for (const lang of LANGS) {
    console.log(`\n── Translating to ${lang.name} (${lang.code}) ──`);

    // Delete existing translations for this lang
    await db.query(`DELETE FROM help_articles WHERE is_global = true AND lang = $1`, [lang.code]);

    for (const article of articles) {
      process.stdout.write(`  → "${article.title}" ... `);

      try {
        const translatedTitle = await (provider === 'anthropic'
          ? translateWithAnthropic(apiKey, model, article.title, lang.name)
          : translateWithOpenAI(apiKey, model, article.title, lang.name));

        const translatedBody = article.body
          ? await (provider === 'anthropic'
            ? translateWithAnthropic(apiKey, model, article.body, lang.name)
            : translateWithOpenAI(apiKey, model, article.body, lang.name))
          : null;

        const newId = generateUUID(article.id, lang.code);

        await db.query(
          `INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, lang, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, NOW(), NOW())`,
          [
            newId,
            '00000000-0000-0000-0000-000000000001',
            article.category_id,
            translatedTitle.trim(),
            translatedBody ? translatedBody.trim() : null,
            article.video_url,
            article.position,
            article.is_published,
            lang.code,
          ]
        );

        console.log('OK');

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`FAILED: ${err.message}`);
      }
    }

    console.log(`✓ ${lang.name} done`);
  }

  await db.end();
  console.log('\nAll translations complete.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
