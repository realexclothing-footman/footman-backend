-- Create database if not exists
SELECT 'CREATE DATABASE footman_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'footman_db')\gexec

-- Create user if not exists
DO
$$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'footman_user') THEN
      CREATE USER footman_user WITH PASSWORD 'footman123';
   END IF;
END
$$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE footman_db TO footman_user;
