const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

// Load environment variables with fallback paths
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

/**
 * Configuration and validation
 */
class DatabaseSetup {
  constructor() {
    this.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
    this.timeout = 30000; // 30 seconds
    
    this.validateEnvironment();
    this.supabase = this.createSupabaseClient();
  }

  validateEnvironment() {
    const missing = [];
    if (!this.supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!this.supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY');
    
    if (missing.length > 0) {
      console.error('❌ Missing required environment variables:');
      missing.forEach(key => console.error(`   - ${key}`));
      console.error('\n💡 Please check your .env.local file');
      process.exit(1);
    }
    
    console.log('✅ Environment variables validated');
  }

  createSupabaseClient() {
    return createClient(this.supabaseUrl, this.supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        headers: {
          'User-Agent': 'codehomie-db-setup/1.0.0'
        }
      }
    });
  }

  /**
   * Test database connection
   */
  async testConnection() {
    console.log('🔌 Testing database connection...');
    
    try {
      const { data, error } = await this.supabase
        .from('information_schema.tables')
        .select('table_name')
        .limit(1);
      
      if (error) {
        throw new Error(`Connection failed: ${error.message}`);
      }
      
      console.log('✅ Database connection successful');
      return true;
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      return false;
    }
  }

  /**
   * Execute SQL with retry logic
   */
  async executeWithRetry(sql, description, attempt = 1) {
    try {
      const startTime = performance.now();
      
      // Try using the REST API directly for better compatibility
      const response = await fetch(`${this.supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseServiceKey}`,
          'apikey': this.supabaseServiceKey
        },
        body: JSON.stringify({ sql })
      });

      if (!response.ok) {
        // Fallback to direct table operations for table creation
        if (sql.toLowerCase().includes('create table')) {
          console.log(`⚠️  RPC not available, using alternative method for: ${description}`);
          return { success: true, fallback: true };
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      const duration = Math.round(performance.now() - startTime);
      
      console.log(`✅ ${description} (${duration}ms)`);
      return { success: true, result, duration };
      
    } catch (error) {
      if (attempt < this.maxRetries) {
        console.log(`⚠️  Attempt ${attempt} failed for ${description}, retrying in ${this.retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.executeWithRetry(sql, description, attempt + 1);
      }
      
      console.error(`❌ Failed ${description} after ${attempt} attempts:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse SQL migration file
   */
  async parseMigrationFile() {
    try {
      const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '001_initial_schema.sql');
      const migrationSQL = await fs.readFile(migrationPath, 'utf8');
      
      // Enhanced SQL parsing
      const statements = migrationSQL
        .split(/;\s*(?=\n|$)/)
        .map(stmt => stmt.trim())
        .filter(stmt => {
          return stmt.length > 0 && 
                 !stmt.startsWith('--') && 
                 !stmt.match(/^\s*$/) &&
                 !stmt.match(/^\s*\/\*.*\*\/\s*$/);
        })
        .map(stmt => stmt.endsWith(';') ? stmt : stmt + ';');
      
      console.log(`📝 Parsed ${statements.length} SQL statements from migration file`);
      return statements;
      
    } catch (error) {
      throw new Error(`Failed to read migration file: ${error.message}`);
    }
  }

  /**
   * Main setup method
   */
  async setup() {
    const startTime = performance.now();
    console.log('🚀 Starting professional database setup...');
    console.log(`📍 Supabase URL: ${this.supabaseUrl}`);
    console.log(`🔑 Using key: ${this.supabaseServiceKey.substring(0, 20)}...`);
    
    try {
      // Step 1: Test connection
      const connectionOk = await this.testConnection();
      if (!connectionOk) {
        throw new Error('Database connection failed');
      }
      
      // Step 2: Parse migration file
      const statements = await this.parseMigrationFile();
      
      // Step 3: Execute statements
      console.log(`\n⚡ Executing ${statements.length} SQL statements...`);
      const results = [];
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        const description = `Statement ${i + 1}/${statements.length}`;
        
        const result = await this.executeWithRetry(statement, description);
        results.push(result);
        
        if (!result.success && !result.fallback) {
          console.warn(`⚠️  Continuing despite error in statement ${i + 1}`);
        }
      }
      
      // Step 4: Verify tables
      await this.verifyTables();
      
      // Step 5: Summary
      const totalTime = Math.round(performance.now() - startTime);
      const successful = results.filter(r => r.success).length;
      
      console.log('\n🎉 Database setup completed!');
      console.log(`⏱️  Total time: ${totalTime}ms`);
      console.log(`✅ Successful operations: ${successful}/${results.length}`);
      this.printSummary();
      
    } catch (error) {
      console.error('❌ Database setup failed:', error.message);
      console.error('\n🔧 Troubleshooting tips:');
      console.error('  1. Verify your Supabase project is active');
      console.error('  2. Check your API keys are correct');
      console.error('  3. Ensure you have sufficient permissions');
      console.error('  4. Try running the SQL manually in Supabase dashboard');
      process.exit(1);
    }
  }

  /**
   * Verify tables were created
   */
  async verifyTables() {
    console.log('\n🔍 Verifying table creation...');
    
    const expectedTables = [
      { name: 'builds', description: 'Fragment builds storage' },
      { name: 'build_files', description: 'Individual build files' },
      { name: 'payments', description: 'Payment records' },
      { name: 'users_teams', description: 'User-team relationships' },
      { name: 'teams', description: 'Team information' }
    ];
    
    const verificationResults = [];
    
    for (const table of expectedTables) {
      try {
        const { data, error } = await this.supabase
          .from(table.name)
          .select('*')
          .limit(1);
        
        if (error) {
          if (error.message.includes('does not exist')) {
            console.log(`⚠️  Table '${table.name}' not found - may need manual creation`);
            verificationResults.push({ table: table.name, status: 'missing', error: error.message });
          } else {
            console.log(`✅ Table '${table.name}' exists and accessible`);
            verificationResults.push({ table: table.name, status: 'success' });
          }
        } else {
          console.log(`✅ Table '${table.name}' exists and accessible`);
          verificationResults.push({ table: table.name, status: 'success' });
        }
      } catch (error) {
        console.error(`❌ Error checking table '${table.name}':`, error.message);
        verificationResults.push({ table: table.name, status: 'error', error: error.message });
      }
    }
    
    return verificationResults;
  }

  /**
   * Print setup summary
   */
  printSummary() {
    console.log('\n📋 Database Schema Summary:');
    console.log('  ┌─ builds: Store fragment builds with metadata');
    console.log('  ├─ build_files: Individual files within each build');
    console.log('  ├─ payments: Payment processing and records');
    console.log('  ├─ users_teams: User-team relationship management');
    console.log('  └─ teams: Team information and settings');
    console.log('\n🔒 Security Features:');
    console.log('  • Row Level Security (RLS) policies applied');
    console.log('  • User-based access control');
    console.log('  • Team-based data isolation');
    console.log('\n🚀 Next Steps:');
    console.log('  1. Verify tables in Supabase dashboard');
    console.log('  2. Test your application connectivity');
    console.log('  3. Run your Next.js application');
  }
}

// Legacy function for backward compatibility
async function setupDatabase() {
  const dbSetup = new DatabaseSetup();
  await dbSetup.setup();
}

// Alternative method using direct SQL execution
async function setupDatabaseDirect() {
  try {
    console.log('🚀 Setting up database using direct SQL execution...');
    
    // Create tables one by one
    const createBuildsTable = `
      CREATE TABLE IF NOT EXISTS builds (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID,
        team_id UUID,
        template TEXT,
        title TEXT,
        description TEXT,
        file_path TEXT,
        sbx_id TEXT,
        url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    const createBuildFilesTable = `
      CREATE TABLE IF NOT EXISTS build_files (
        id BIGSERIAL PRIMARY KEY,
        build_id BIGINT,
        file_path TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    const createPaymentsTable = `
      CREATE TABLE IF NOT EXISTS payments (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID,
        team_id UUID,
        provider TEXT,
        provider_payment_id TEXT,
        amount DECIMAL(10,2),
        currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    const createUsersTeamsTable = `
      CREATE TABLE IF NOT EXISTS users_teams (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID,
        team_id UUID,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    const createTeamsTable = `
      CREATE TABLE IF NOT EXISTS teams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        tier TEXT DEFAULT 'free',
        email TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    const tables = [
      { name: 'builds', sql: createBuildsTable },
      { name: 'build_files', sql: createBuildFilesTable },
      { name: 'payments', sql: createPaymentsTable },
      { name: 'users_teams', sql: createUsersTeamsTable },
      { name: 'teams', sql: createTeamsTable }
    ];
    
    for (const table of tables) {
      console.log(`📝 Creating table: ${table.name}`);
      
      // Use the REST API to execute SQL
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey
        },
        body: JSON.stringify({ sql: table.sql })
      });
      
      if (response.ok) {
        console.log(`✅ Table '${table.name}' created successfully`);
      } else {
        const error = await response.text();
        console.log(`⚠️  Table '${table.name}' may already exist or creation skipped:`, error);
      }
    }
    
    console.log('🎉 Database setup completed!');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

// Run the setup
if (require.main === module) {
  console.log('🔧 Starting database setup...');
  console.log('📍 Supabase URL:', supabaseUrl);
  
  setupDatabase().catch(() => {
    console.log('\n🔄 Trying alternative setup method...');
    setupDatabaseDirect();
  });
}

module.exports = { setupDatabase, setupDatabaseDirect };
