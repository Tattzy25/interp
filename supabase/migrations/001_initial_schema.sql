-- Create builds table for storing fragment builds
CREATE TABLE IF NOT EXISTS builds (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  team_id UUID,
  template TEXT,
  title TEXT,
  description TEXT,
  file_path TEXT,
  sbx_id TEXT,
  url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create build_files table for storing individual files within builds
CREATE TABLE IF NOT EXISTS build_files (
  id BIGSERIAL PRIMARY KEY,
  build_id BIGINT REFERENCES builds(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create payments table for future monetization
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  team_id UUID,
  provider TEXT,
  provider_payment_id TEXT,
  amount DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create users_teams table for team management
CREATE TABLE IF NOT EXISTS users_teams (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  team_id UUID,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create teams table
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tier TEXT DEFAULT 'free',
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE build_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE users_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Builds policies
CREATE POLICY "Users can view their own builds" ON builds
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own builds" ON builds
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own builds" ON builds
  FOR UPDATE USING (auth.uid() = user_id);

-- Build files policies
CREATE POLICY "Users can view build files for their builds" ON build_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM builds 
      WHERE builds.id = build_files.build_id 
      AND builds.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert build files for their builds" ON build_files
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM builds 
      WHERE builds.id = build_files.build_id 
      AND builds.user_id = auth.uid()
    )
  );

-- Payments policies
CREATE POLICY "Users can view their own payments" ON payments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own payments" ON payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Teams and users_teams policies
CREATE POLICY "Users can view their team memberships" ON users_teams
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view teams they belong to" ON teams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users_teams 
      WHERE users_teams.team_id = teams.id 
      AND users_teams.user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_builds_user_id ON builds(user_id);
CREATE INDEX IF NOT EXISTS idx_builds_created_at ON builds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_build_files_build_id ON build_files(build_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_users_teams_user_id ON users_teams(user_id);
CREATE INDEX IF NOT EXISTS idx_users_teams_team_id ON users_teams(team_id);