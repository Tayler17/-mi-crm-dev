-- ============================================================
-- AutoMarkIQ – Help Center Seed (English)
-- Run after migration: docker exec -i crm_postgres psql -U crm -d crm_dev < scripts/help-center-seed-en.sql
-- ============================================================

DELETE FROM help_articles WHERE is_global = true AND lang = 'en';

-- ===== 1. GETTING STARTED =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, lang, created_at, updated_at) VALUES

('b2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
'What is AutoMarkIQ?',
E'# What is AutoMarkIQ?\n\nAutoMarkIQ is an omnichannel CRM and communication platform that centralizes all your customer conversations in one place.\n\n## What can you do?\n\n- **Centralize messages** from WhatsApp, Instagram, Email and Webchat in a single inbox\n- **Automate support** with AI chatbots available 24/7\n- **Call customers** with intelligent voice bots\n- **Manage sales opportunities** with a visual pipeline\n- **Organize your team** by assigning conversations to the right agents\n- **Know your contacts** with a complete history of every interaction\n\n## Basic structure\n\n| Concept | Description |\n|---------|-------------|\n| **Workspace** | Your company working space |\n| **Inboxes** | Connected communication channels |\n| **Agents** | Your team members |\n| **Contacts** | Customers you interact with |\n| **Conversations** | Active message threads |\n\n---\n\nIf this is your first time, start with **Set up your account** in this same category.',
NULL, 0, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
'Set up your account',
E'# Set up your account\n\nFollow these steps to get your workspace ready in under 10 minutes.\n\n## Step 1 – Complete your profile\n\n1. Click your avatar in the bottom corner of the sidebar\n2. Select **My profile**\n3. Upload your photo and fill in your name and role\n4. Save changes\n\n## Step 2 – Customize your workspace\n\n1. Go to **Settings → General**\n2. Enter your company name\n3. Upload your logo (it appears in the sidebar and on the Webchat widget)\n\n## Step 3 – Connect your first channel\n\nWithout connected channels you cannot receive messages. Available options:\n\n- 📱 **WhatsApp Business** – via Meta Business\n- 📸 **Instagram Direct** – via Meta Business\n- 💬 **Webchat** – widget for your website\n- 📧 **Email** – shared team inbox\n\nGo to **Connections → New connection** and select your preferred channel.\n\n## Step 4 – Invite your team\n\nGo to **Settings → Team** and invite your agents by email.\n\n---\n\n> **Tip:** Start with **Webchat** — it''s the fastest channel to set up and requires no Meta approval.',
NULL, 1, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
'Invite your team',
E'# Invite your team\n\nAdd collaborators so your team can handle conversations together.\n\n## How to invite an agent\n\n1. Go to **Settings → Team**\n2. Click **Invite agent**\n3. Enter the collaborator''s email address\n4. Select a role\n5. Click **Send invitation**\n\nThe collaborator will receive an email to create their password.\n\n## Available roles\n\n| Role | What they can do |\n|------|------------------|\n| **Agent** | View and reply to assigned conversations |\n| **Admin** | Everything above + manage inboxes, contacts and settings |\n| **Owner** | Full access including billing and platform configuration |\n\n## Managing existing members\n\n- **Change role**: click the three dots → Change role\n- **Deactivate**: the user cannot log in but their data is preserved\n- **Delete**: permanent action — reassign their active conversations first\n\n---\n\n> **Note:** Depending on your plan there may be a maximum agent limit. Check it in **Settings → Billing**.',
NULL, 2, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
'Dashboard tour',
E'# Dashboard tour\n\nWhen you log in you''ll see the main dashboard. Here''s what each section does.\n\n## Left sidebar\n\n| Icon | Section | Purpose |\n|------|---------|--------|\n| 💬 | Conversations | Omnichannel inbox |\n| 👥 | Contacts | Customer database |\n| 📊 | Deals | Sales pipeline |\n| 🤖 | AI Chatbots | Automated text bots |\n| 📞 | Call Bots | AI voice bots |\n| 📣 | Campaigns | Bulk messaging |\n| 📅 | Appointments | Scheduling |\n| 📋 | Tasks | Internal follow-ups |\n| 📢 | Announcements | Internal team notices |\n| ⚙️ | Settings | Workspace configuration |\n| ❓ | Help | This help center |\n\n## Conversations panel\n\nInside **Conversations** you''ll see three columns:\n\n1. **Inbox list** – filter by channel\n2. **Conversation list** – sorted by most recent\n3. **Active thread** – the selected chat with full history\n\n## Dashboard metrics\n\nOn the home screen you''ll see: open conversations, resolved today, first response time and active agents.',
NULL, 3, true, true, 'en', NOW(), NOW());

-- ===== 2. CONVERSATIONS =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, lang, created_at, updated_at) VALUES

('b2000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
'How the inbox works',
E'# How the inbox works\n\nThe inbox centralizes all messages from your channels in one place.\n\n## Conversation statuses\n\n| Status | Description |\n|--------|-------------|\n| **Open** | Requires team attention |\n| **Pending** | Waiting for the customer''s reply |\n| **Resolved** | Support completed |\n| **Spam** | Marked as unwanted |\n\n## Available filters\n\n- By **inbox** (WhatsApp, Instagram, Webchat, Email)\n- By **assigned agent**\n- By **status** (open / pending / resolved)\n- By **labels**\n\n## Inside a conversation\n\n- **Full message history** from the channel\n- **Right side panel** with contact details\n- **Reply bar** with text, emoji and attachments\n- **Notes tab** for internal team communication\n\n## Resolving a conversation\n\nWhen you''ve finished helping a customer, click **Resolve** (green button top right). The conversation moves to Resolved status and leaves the active inbox.',
NULL, 0, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
'Assign and reassign conversations',
E'# Assign and reassign conversations\n\nAssigning conversations ensures each customer is handled by the right person.\n\n## Assign to an agent\n\n1. Open the conversation\n2. In the right panel find **Assigned agent**\n3. Click the dropdown and select an agent\n4. The agent receives a notification\n\n## Automatic assignment by chatbot\n\nWhen an AI chatbot cannot resolve a query, it can **automatically escalate** to a human agent.\n\nConfigure this in: **AI Chatbots → your bot → Behavior → Escalate if unsure**.\n\n## Reassign a conversation\n\n1. Open the conversation\n2. Change the agent in the right panel dropdown\n3. The new agent will see it in their inbox\n\n## Best practices\n\n- Assign sales to the commercial team\n- Assign technical support to the help team\n- Use labels to make future searches easier\n- If you''ll be away, reassign your active conversations',
NULL, 1, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
'Internal notes',
E'# Internal notes\n\nNotes are messages visible only to your team — the customer never sees them.\n\n## How to write a note\n\n1. Open the conversation\n2. In the bottom bar, click the **Note** tab\n3. Write your comment\n4. Click **Add note**\n\nNotes appear with a yellow background to distinguish them from customer messages.\n\n## What to use them for\n\n- Leave context for the next agent who takes the conversation\n- Record verbal agreements with the customer\n- Coordinate with the team without the customer seeing it\n- Note relevant information about the case\n\n## Mention a teammate\n\nType `@name` inside a note to notify a specific agent. They will receive an in-platform notification.',
NULL, 2, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
'Labels and filters',
E'# Labels and filters\n\nLabels categorize conversations so you can find them easily.\n\n## Add a label\n\n1. Open the conversation\n2. In the right panel find the **Labels** section\n3. Type the label name and press Enter\n4. You can add multiple labels to the same conversation\n\n## Useful label examples\n\n- `hot-lead` – leads with immediate purchase intent\n- `support` – technical help queries\n- `follow-up` – customers who need a follow-up\n- `high-priority` – urgent cases\n- `paid` – customers who completed a purchase\n\n## Filter by label\n\n1. In the inbox use the **Label** filter\n2. Select the label you want to see\n3. You''ll see only conversations with that label\n\n## Bulk resolve\n\nSelect multiple conversations with the checkbox and use **Resolve selected** to close them all at once.',
NULL, 3, true, true, 'en', NOW(), NOW());

-- ===== 3. CONTACTS =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, lang, created_at, updated_at) VALUES

('b2000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003',
'Create and manage contacts',
E'# Create and manage contacts\n\nContacts are the database of customers and prospects in your workspace.\n\n## Create a contact manually\n\n1. Go to **Contacts** in the sidebar\n2. Click **New contact**\n3. Fill in the fields:\n   - First and last name\n   - Phone (with country code, e.g. +447911123456)\n   - Email\n   - Company\n4. Click **Save**\n\n## Contact information available\n\n- **Basic data** – name, phone, email, company\n- **Conversations** – history of all interactions\n- **Deals** – associated sales opportunities\n- **Notes** – notes about the customer\n- **Activity** – chronological event log\n\n## Search for a contact\n\nUse the search bar in **Contacts** to search by name, phone or email.\n\n## Edit or delete\n\n- **Edit**: three dots (...) → Edit\n- **Delete**: three dots → Delete (irreversible action)\n\n> **Note:** If you delete a contact, their historical conversations are kept but will have no associated contact.',
NULL, 0, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003',
'Import contacts from CSV',
E'# Import contacts from CSV\n\nUpload hundreds of contacts at once with a CSV file.\n\n## File format\n\n```\nfirst_name,last_name,phone,email,company\nJohn,Smith,+447911000001,john@company.com,Acme Ltd\nJane,Doe,+447911000002,jane@other.com,\n```\n\n- First row: headers\n- Phone must include country code (`+44`, `+1`, `+34`, etc.)\n- Empty fields are valid except `first_name`\n\n## Steps to import\n\n1. Go to **Contacts**\n2. Click **Import** (upload icon)\n3. Select your `.csv` file\n4. Review the data preview\n5. Click **Confirm import**\n\n## Duplicate contacts\n\nIf a contact with the same phone or email already exists, the system will **update** it instead of creating a duplicate.\n\n## Limits by plan\n\n| Plan | Maximum contacts |\n|------|------------------|\n| Free | 500 |\n| Pro | 5,000 |\n| Business | Unlimited |\n\nCheck your plan at **Settings → Billing**.',
NULL, 1, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003',
'Contact history and activity',
E'# Contact history and activity\n\nEvery contact has a complete record of all their interactions with your company.\n\n## View the history\n\n1. Go to **Contacts** and open the contact\n2. Browse the tabs:\n   - **Conversations** – all chat threads from any channel\n   - **Deals** – linked sales opportunities\n   - **Activity** – chronological event timeline\n\n## What appears in the activity\n\n- Date of first conversation\n- Agent assignment changes\n- Deals created or updated\n- Notes added\n- Label changes\n\n## Link a deal to a contact\n\n1. Open the contact → **Deals** tab\n2. Click **Add deal**\n3. Fill in name, value and pipeline stage\n\n## View historical conversations\n\nFrom the **Conversations** tab you can access any previous thread directly, regardless of which channel the customer used.',
NULL, 2, true, true, 'en', NOW(), NOW());

-- ===== 4. CONNECTIONS =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, lang, created_at, updated_at) VALUES

('b2000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004',
'Connect WhatsApp Business (Meta)',
E'# Connect WhatsApp Business\n\nAutoMarkIQ connects to WhatsApp through the official Meta Business API.\n\n## Prerequisites\n\n- Account in **Meta Business Manager** (business.facebook.com)\n- A phone number **not linked** to a personal WhatsApp\n- Meta app configured by the platform administrator\n\n## Steps to connect\n\n1. Go to **Connections → New connection**\n2. Select **WhatsApp Business**\n3. Click **Connect with Facebook**\n4. Log in with your Meta Business account\n5. Select the Facebook Page linked to your business\n6. Select (or create) your WhatsApp Business number\n7. Authorize the requested permissions\n8. The inbox appears as active in your list\n\n## Verify it works\n\nSend a message to the number from another phone. You should see it in **Conversations** within seconds.\n\n## Official API limitations\n\n- You can only initiate conversations with Meta pre-approved templates\n- Replies to incoming messages are free for **24 hours**\n- Marketing messages require prior template approval\n\n> If you have connection issues, contact your platform administrator.',
NULL, 0, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004',
'Connect Instagram Direct',
E'# Connect Instagram Direct\n\nReceive and reply to Instagram direct messages from AutoMarkIQ.\n\n## Prerequisites\n\n- An **Instagram Business** account (not personal)\n- Instagram Business linked to a **Facebook Page**\n- Administrator permissions on the Facebook Page\n\n## Steps to connect\n\n1. Go to **Connections → New connection**\n2. Select **Instagram**\n3. Click **Connect with Facebook**\n4. Log in with your Meta account\n5. Select the Facebook Page linked to your Instagram Business account\n6. Authorize the messaging permissions\n7. The Instagram inbox becomes active\n\n## What messages will you receive?\n\n- Direct messages (DMs) from users\n- Story replies when users send a DM from a story\n\n## Verify it works\n\nSend a test DM from another Instagram account. It should appear in **Conversations** within seconds.\n\n> **Tip:** Enable messages in your Facebook Page settings in Meta Business Suite for the webhook to work correctly.',
NULL, 1, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004',
'Set up Webchat on your website',
E'# Set up Webchat on your website\n\nWebchat is a chat widget that appears on your site and lets visitors message you in real time.\n\n## Create the Webchat inbox\n\n1. Go to **Connections → New connection**\n2. Select **Webchat**\n3. Give it a name (e.g. "Website chat")\n4. Customize the color and welcome message\n5. Click **Create**\n\n## Get the installation code\n\n1. Open the Webchat inbox you just created\n2. Go to the **Installation** tab\n3. Copy the JavaScript snippet\n\n## Install on your site\n\n- **WordPress**: paste in Appearance → Theme editor → footer.php before `</body>`\n- **Shopify**: paste in Online Store → Themes → Edit code → theme.liquid before `</body>`\n- **Plain HTML**: paste before the closing `</body>` tag\n- **React/Next.js**: use it in a component with `useEffect` or with a `<Script>` component\n\n## Verify installation\n\n1. Visit your website\n2. You should see the chat button in the bottom right corner\n3. Send a test message and verify it arrives in AutoMarkIQ',
NULL, 2, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004',
'Email channel',
E'# Email channel\n\nManage your company emails from the same inbox as all your other channels.\n\n## Option A – Your own email (SMTP/IMAP)\n\n1. Go to **Connections → New connection → Email**\n2. Enter your email address\n3. Configure SMTP settings (server, port, username, password)\n4. Configure IMAP settings for receiving emails\n5. Click **Verify and save**\n\nWorks with Gmail, Outlook, Zoho or any IMAP/SMTP provider.\n\n## Option B – Forwarding address\n\n1. Create the Email inbox in AutoMarkIQ\n2. Copy the generated forwarding address\n3. Set up automatic forwarding in your email provider to that address\n\n## What you''ll see in the inbox\n\n- Email subject as the conversation title\n- Grouped reply threads\n- Downloadable attachments\n- Reply directly from AutoMarkIQ\n\n> **Ideal for:** support teams who receive tickets by email and want to centralize them alongside other channels.',
NULL, 3, true, true, 'en', NOW(), NOW());

-- ===== 5. AI CHATBOTS =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, lang, created_at, updated_at) VALUES

('b2000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005',
'Create your first AI chatbot',
E'# Create your first AI chatbot\n\nAI chatbots automatically respond to your customers using artificial intelligence, available 24/7.\n\n## Before you start\n\nThe platform administrator must have configured an AI API key in **Settings → Platform → AI**. Without it the bot cannot work.\n\n## Create the chatbot\n\n1. Go to **AI Chatbots** in the sidebar\n2. Click **New chatbot**\n3. Fill in:\n   - **Name**: internal identifier (e.g. "Sales Bot")\n   - **Provider**: OpenAI, Anthropic or Ollama\n   - **Model**: GPT-4o, Claude 3.5, etc.\n4. Click **Create**\n\n## Configure the behavior\n\nOnce created:\n\n- **System prompt**: defines how the bot should behave (tone, role, limitations)\n- **Temperature**: response creativity (0 = precise, 1 = creative)\n- **Welcome message**: what the customer sees first\n- **Escalate to human**: conditions for passing the conversation to an agent\n\n## Activate on a channel\n\n1. Open the chatbot\n2. Go to the **Inboxes** tab\n3. Select the channels where you want to activate it\n4. Toggle it on\n\nFrom that moment the bot will automatically respond on those channels.',
NULL, 0, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005',
'Configure behavior and prompts',
E'# Configure behavior and prompts\n\nThe system prompt is the main instruction that tells the AI how to act.\n\n## Structure of a good prompt\n\n1. **Role**: what the bot is\n2. **Company**: information about the business\n3. **Goal**: what it should achieve\n4. **Tone**: formal, friendly, technical\n5. **Limits**: what it should NOT answer\n\n## Example prompt\n\n```\nYou are the virtual assistant of [Company], an online clothing store.\nHelp customers with:\n- Product and sizing queries\n- Order status\n- Returns policy\n\nTone: friendly and professional. Use the customer''s name if known.\n\nIf they ask about anything outside these topics, tell them you''ll\nconnect them with an advisor using the phrase: "let me connect you\nwith an advisor".\n\nNever invent prices or availability.\n```\n\n## Advanced parameters\n\n| Parameter | Description | Recommended |\n|-----------|-------------|-------------|\n| Temperature | Creativity (0–1) | 0.3–0.5 for support / 0.7 for sales |\n| Max tokens | Response length | 500–800 |\n| Escalate if unsure | Passes to human automatically | Always enable |\n\n## Best practices\n\n- Be specific about what the bot can and cannot do\n- Include real frequently asked questions from the business\n- Test with **Test message** before activating in production',
NULL, 1, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005',
'Test the chatbot before activating',
E'# Test the chatbot before activating\n\nBefore activating the bot on a real channel, test it without affecting customers.\n\n## How to test\n\n1. Open the chatbot\n2. Click **Test message**\n3. Write a question as if you were a customer\n4. Review the generated response\n\n## What to review\n\n- Is the response correct and coherent?\n- Is the tone appropriate?\n- Does it respect the prompt limits?\n- Is the length appropriate?\n\n## Recommended test cases\n\n| Case | What to expect |\n|------|----------------|\n| Typical business question | Accurate response |\n| Off-topic question | Declines politely |\n| Ambiguous question | Asks for clarification |\n| "I want to speak to a person" | Escalates to human agent |\n| Rude language | Responds calmly or escalates |\n\n## Adjust based on results\n\nIf responses are not as expected:\n\n1. Modify the **system prompt** to be more specific\n2. Lower the **temperature** if responses are too creative\n3. Add concrete examples of questions and answers to the prompt\n4. Test again until the behavior is correct',
NULL, 2, true, true, 'en', NOW(), NOW());

-- ===== 6. CALL BOTS =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, lang, created_at, updated_at) VALUES

('b2000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000006',
'What are call bots?',
E'# What are call bots?\n\nCall bots are automated voice agents that make or receive phone calls using artificial intelligence and voice synthesis.\n\n## What are they used for?\n\n- **Follow-up calls** to leads or customers\n- **Appointment confirmation** or booking reminders\n- **Satisfaction surveys** automated\n- **Payment reminders** or renewal notices\n- **Inbound support** outside office hours\n\n## How it works\n\n1. The bot calls (or receives the call) on the assigned number\n2. Plays a personalized greeting\n3. Listens to the customer''s response using voice recognition\n4. The AI processes the response and replies naturally\n5. The conversation is logged with transcript and duration\n\n## Technology used\n\n- **Twilio**: telephony provider (calls and numbers)\n- **ElevenLabs** (optional): more natural and expressive voice\n- **OpenAI / Anthropic**: AI to process the dialogue\n\n## Requirements\n\n- Administrator must have Twilio configured with available numbers\n- Call credits are required in the Twilio account\n\n> This feature is available on **Pro** plans and above.',
NULL, 0, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000006',
'Create and configure a call bot',
E'# Create and configure a call bot\n\n## Create the bot\n\n1. Go to **Call Bots** in the sidebar\n2. Click **New bot**\n3. Fill in:\n   - **Name**: internal identifier (e.g. "Commercial follow-up bot")\n   - **Phone number**: select from the available pool\n   - **Voice**: choose from available voices\n4. Click **Create**\n\n## Configure the behavior\n\n### Greeting message\nThe first thing the customer hears. Be clear and direct:\n```\nHi, I''m calling from [Company]. Do you have a moment to talk?\n```\n\n### System prompt\nDefine the call goal:\n```\nYou are a sales assistant for [Company]. Your goal is to confirm\nwhether the customer received our proposal and if they have any questions.\nBe friendly. If they don''t want to talk, thank them for their time\nand end the call.\n```\n\n### Voice settings\n- **Speed**: adjust the speaking pace\n- **ElevenLabs**: enable if available for more natural voice\n\n## Make a test call\n\n1. Open the configured bot\n2. Click **Call now**\n3. Enter your phone number\n4. Receive the call and verify the behavior\n5. Review the transcript in the logs',
NULL, 1, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000006',
'View call logs',
E'# View call logs\n\nEvery call is logged with detailed information.\n\n## Access the logs\n\n1. Go to **Call Bots**\n2. Click the **Logs** tab\n3. You''ll see all calls for your workspace\n\n## Information in each log\n\n| Field | Description |\n|-------|-------------|\n| Date and time | When the call occurred |\n| Number | Customer''s phone number |\n| Duration | Total call time |\n| Status | Completed / No answer / Busy / Failed |\n| Bot | Which bot handled the call |\n| Transcript | Full conversation text |\n\n## Filter logs\n\n- By specific **bot**\n- By **date** (range)\n- By **status**\n\n## Read the transcript\n\nClick any log to see the full conversation. Use it to:\n- Audit bot quality\n- Identify questions the bot couldn''t answer\n- Improve the system prompt\n\n> **Tip:** Review logs weekly to identify opportunities to improve the bot''s behavior.',
NULL, 2, true, true, 'en', NOW(), NOW());

-- ===== 7. DEALS & PIPELINE =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, lang, created_at, updated_at) VALUES

('b2000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000007',
'Manage deals',
E'# Manage deals\n\nDeals represent sales opportunities you can track through the stages of your sales process.\n\n## What is a deal?\n\nA deal contains:\n- **Name**: description of the opportunity\n- **Value**: estimated deal amount\n- **Contact**: associated customer\n- **Stage**: where it is in the pipeline\n- **Agent**: responsible for follow-up\n- **Estimated close date**\n\n## Create a deal\n\n### From the Pipeline\n1. Go to **Deals**\n2. Click **+ New deal** in the desired column\n3. Fill in the details and click **Create**\n\n### From a contact\n1. Open the contact in **Contacts**\n2. Go to the **Deals** tab → **Add deal**\n\n## Pipeline view (Kanban)\n\n- **Drag and drop** deals between columns\n- **Total value** of each stage visible in the header\n- **Filter** by agent, label or dates\n\n## Update a deal\n\nClick any deal to edit it:\n- Change the stage\n- Update the estimated value\n- Add follow-up notes\n- Associate a different contact',
NULL, 0, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000007',
'Create custom pipelines',
E'# Create custom pipelines\n\nEach pipeline has its own stages adapted to your sales process.\n\n## Create a pipeline\n\n1. Go to **Deals**\n2. Click the pipeline selector (top left)\n3. Select **New pipeline**\n4. Enter a name (e.g. "B2B Sales", "Projects")\n5. Click **Create**\n\n## Configure stages\n\n1. With the pipeline active, click **Configure stages**\n2. Default stages: New → Qualified → Proposal → Negotiation → Closed\n3. **Add stage**: click **+ Add stage**\n4. **Rename**: click on the stage name\n5. **Reorder**: drag to the desired position\n6. **Delete**: use the bin icon (deals move to "No stage")\n\n## Examples by industry\n\n**Marketing agency:**\nProspect → Brief received → Proposal sent → Negotiating → Active project\n\n**Real estate:**\nInterested → Visit scheduled → Offer → Notary → Closed\n\n**B2B e-commerce:**\nInitial contact → Sample sent → Trial order → Repeat customer\n\n## Best practices\n\n- Create a separate pipeline for each type of business\n- Maximum 6-7 stages per pipeline\n- The last stage should always indicate the final outcome (won / lost)',
NULL, 1, true, true, 'en', NOW(), NOW());

-- ===== 8. SETTINGS =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, lang, created_at, updated_at) VALUES

('b2000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000008',
'Configure your profile',
E'# Configure your profile\n\nCustomize your individual account within the workspace.\n\n## Access your profile\n\n1. Click your avatar in the bottom corner of the sidebar\n2. Select **My profile**\n\n## What you can configure\n\n### Personal information\n- **Full name** – appears in conversations assigned to you\n- **Profile photo** – visible to your teammates\n- **Role/title** – description of your position\n\n### Security\n- **Change password**: enter your current password and the new one\n- Use passwords of at least 8 characters with letters and numbers\n\n### Notifications\n- Enable/disable notifications for new conversations\n- Configure alert sounds\n- Select which inboxes to monitor\n\n### Availability\n- **Available**: you receive new conversations\n- **Busy**: you don''t receive automatic assignments\n- **Offline**: you appear as inactive\n\n## Log out\n\nClick your avatar → **Log out**. Your account and data remain intact.',
NULL, 0, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000008',
'Manage team and roles',
E'# Manage team and roles\n\nOnly **Admin** and **Owner** users can manage the team.\n\n## View the team\n\nGo to **Settings → Team** to see all members with their role and status.\n\n## Invite new members\n\n1. Click **Invite agent**\n2. Enter the collaborator''s email\n3. Select the role\n4. Click **Send invitation**\n\nThe collaborator will receive an email to activate their account.\n\n## System roles\n\n| Role | Permissions |\n|------|-------------|\n| **Agent** | View and reply to conversations, manage basic contacts |\n| **Admin** | Everything above + manage team, inboxes and settings |\n| **Owner** | Full access: billing, platform, global content |\n\n## Change a member''s role\n\n1. Three dots next to the member → **Change role**\n2. Select the new role and confirm\n\n## Deactivate or delete a member\n\n- **Deactivate**: the user cannot log in but their data is preserved\n- **Delete**: permanent — reassign their active conversations first\n\n> You cannot degrade or delete the account Owner.',
NULL, 1, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000008',
'Plans and billing',
E'# Plans and billing\n\nManage your subscription and review your current plan limits.\n\n## View your current plan\n\nGo to **Settings → Billing** to see your active plan, renewal date and current usage.\n\n## Plan comparison\n\n| Feature | Free | Pro | Business |\n|---------|:----:|:---:|:--------:|\n| Agents | 2 | 10 | Unlimited |\n| Contacts | 500 | 5,000 | Unlimited |\n| Inboxes | 1 | 5 | Unlimited |\n| AI Chatbots | ❌ | 3 | Unlimited |\n| Call Bots | ❌ | 1 | Unlimited |\n| Call minutes | ❌ | 200/mo | Unlimited |\n\n## Change plan\n\n1. Click **Change plan**\n2. Select the desired plan\n3. Enter payment details\n4. The change is immediate\n\n## FAQ\n\n**Can I cancel at any time?**\nYes. Your active plan remains until the end of the paid period.\n\n**What happens if I exceed the limits?**\nFeatures exceeding the limit will be blocked until you renew or upgrade.\n\n**Is there a free trial?**\nThe Free plan is free with no time limit. You can upgrade whenever you need.\n\n> Need a custom plan for your company? Contact us through the support chat.',
NULL, 2, true, true, 'en', NOW(), NOW()),

('b2000000-0000-0000-0000-000000000073', '00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000008',
'General workspace settings',
E'# General workspace settings\n\nCustomize how your company appears in the platform.\n\n## Access\n\nGo to **Settings → General**.\n\n## What you can configure\n\n### Identity\n- **Company name** – appears in the sidebar and communications\n- **Logo** – visible in the panel and Webchat widget\n- **Brand color** – customizes the chat widget\n\n### Business hours\n- Define the days and hours when your team is available\n- Outside hours you can configure an automatic message\n- Chatbots operate 24/7 regardless of these hours\n\n### Away message\nText customers receive outside business hours:\n\n```\nThank you for contacting us. Our hours are Mon–Fri 9am–6pm.\nWe''ll get back to you as soon as possible.\n```\n\n### Timezone\nImportant so that reports and bot schedules are correct. Select your company''s timezone.\n\n## Save changes\n\nClick **Save** after each modification. Changes are immediate.',
NULL, 3, true, true, 'en', NOW(), NOW());
