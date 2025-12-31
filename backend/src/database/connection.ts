import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'followly',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export async function initializeDatabase(): Promise<void> {
  try {
    const client = await pool.connect();
    console.log('✅ Database connected');
    client.release();
    
    // Run migrations
    await runMigrations();
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Create migrations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Run all migrations
    const migrations = [
      createUsersTable,
      createContactsTable,
      createListsTable,
      createListContactsTable,
      createCampaignsTable,
      createAutomationsTable,
      createAutomationStepsTable,
      createAutomationExecutionsTable,
      createEmailQueueTable,
      createEmailEventsTable,
      createSuppressionListTable,
      createProviderConfigsTable,
      createWarmupSchedulesTable,
      createCustomFieldsTable,
      createTagsTable,
      createContactTagsTable,
    ];
    
    for (const migration of migrations) {
      const migrationName = migration.name;
      const result = await client.query(
        'SELECT id FROM migrations WHERE name = $1',
        [migrationName]
      );
      
      if (result.rows.length === 0) {
        await migration(client);
        await client.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [migrationName]
        );
        console.log(`✅ Migration executed: ${migrationName}`);
      }
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Migration functions
async function createUsersTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      company VARCHAR(255),
      role VARCHAR(50) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function createContactsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      company VARCHAR(255),
      role VARCHAR(255),
      country VARCHAR(100),
      subscription_status VARCHAR(50) DEFAULT 'subscribed',
      health_score INTEGER DEFAULT 100,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, email)
    )
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contacts_subscription_status ON contacts(subscription_status)
  `);
}

async function createListsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS lists (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL CHECK (type IN ('static', 'smart')),
      description TEXT,
      rules JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_lists_user_id ON lists(user_id)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_lists_type ON lists(type)
  `);
}

async function createListContactsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS list_contacts (
      id SERIAL PRIMARY KEY,
      list_id INTEGER REFERENCES lists(id) ON DELETE CASCADE,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(list_id, contact_id)
    )
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_list_contacts_list_id ON list_contacts(list_id)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_list_contacts_contact_id ON list_contacts(contact_id)
  `);
}

async function createCampaignsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL CHECK (type IN ('broadcast', 'lifecycle')),
      subject VARCHAR(500),
      content TEXT NOT NULL,
      from_email VARCHAR(255),
      from_name VARCHAR(255),
      list_id INTEGER REFERENCES lists(id) ON DELETE SET NULL,
      status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled')),
      scheduled_at TIMESTAMP,
      sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled_at ON campaigns(scheduled_at)
  `);
}

async function createAutomationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS automations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      trigger_type VARCHAR(50) NOT NULL,
      trigger_config JSONB,
      status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_automations_user_id ON automations(user_id)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_automations_status ON automations(status)
  `);
}

async function createAutomationStepsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS automation_steps (
      id SERIAL PRIMARY KEY,
      automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL,
      action_type VARCHAR(50) NOT NULL,
      action_config JSONB NOT NULL,
      delay_hours INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_automation_steps_automation_id ON automation_steps(automation_id)
  `);
}

async function createAutomationExecutionsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS automation_executions (
      id SERIAL PRIMARY KEY,
      automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
      current_step INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'exited')),
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
      UNIQUE(automation_id, contact_id)
    )
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_automation_executions_automation_id ON automation_executions(automation_id)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_automation_executions_contact_id ON automation_executions(contact_id)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_automation_executions_status ON automation_executions(status)
  `);
}

async function createEmailQueueTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS email_queue (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
      campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
      automation_id INTEGER REFERENCES automations(id) ON DELETE SET NULL,
      automation_step_id INTEGER REFERENCES automation_steps(id) ON DELETE SET NULL,
      to_email VARCHAR(255) NOT NULL,
      subject VARCHAR(500) NOT NULL,
      content TEXT NOT NULL,
      from_email VARCHAR(255) NOT NULL,
      from_name VARCHAR(255),
      provider VARCHAR(50),
      status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sending', 'sent', 'failed', 'bounced', 'complained')),
      scheduled_at TIMESTAMP NOT NULL,
      sent_at TIMESTAMP,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled_at ON email_queue(scheduled_at)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_email_queue_user_id ON email_queue(user_id)
  `);
}

async function createEmailEventsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS email_events (
      id SERIAL PRIMARY KEY,
      email_queue_id INTEGER REFERENCES email_queue(id) ON DELETE CASCADE,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
      campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
      event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed')),
      provider_event_id VARCHAR(255),
      metadata JSONB,
      occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_email_events_email_queue_id ON email_events(email_queue_id)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_email_events_contact_id ON email_events(contact_id)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events(event_type)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_email_events_occurred_at ON email_events(occurred_at)
  `);
}

async function createSuppressionListTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS suppression_list (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      reason VARCHAR(100) NOT NULL CHECK (reason IN ('unsubscribed', 'bounced', 'complained', 'manual')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, email)
    )
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_suppression_list_user_id ON suppression_list(user_id)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_suppression_list_email ON suppression_list(email)
  `);
}

async function createProviderConfigsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS provider_configs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      provider VARCHAR(50) NOT NULL CHECK (provider IN ('brevo', 'mailjet', 'resend')),
      api_key VARCHAR(500),
      api_secret VARCHAR(500),
      from_email VARCHAR(255),
      from_name VARCHAR(255),
      daily_limit INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_provider_configs_user_id ON provider_configs(user_id)
  `);
}

async function createWarmupSchedulesTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS warmup_schedules (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      domain VARCHAR(255) NOT NULL,
      provider VARCHAR(50) NOT NULL,
      phase INTEGER DEFAULT 1,
      daily_limit INTEGER NOT NULL,
      current_count INTEGER DEFAULT 0,
      start_date DATE NOT NULL,
      last_reset_date DATE,
      metrics JSONB DEFAULT '{}',
      status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, domain, provider)
    )
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_warmup_schedules_user_id ON warmup_schedules(user_id)
  `);
}

async function createCustomFieldsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS custom_fields (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
      field_name VARCHAR(255) NOT NULL,
      field_value TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_custom_fields_contact_id ON custom_fields(contact_id)
  `);
}

async function createTagsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS tags (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      color VARCHAR(7),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    )
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id)
  `);
}

async function createContactTagsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS contact_tags (
      id SERIAL PRIMARY KEY,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(contact_id, tag_id)
    )
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contact_tags_contact_id ON contact_tags(contact_id)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contact_tags_tag_id ON contact_tags(tag_id)
  `);
}

export { pool };
export default pool;

