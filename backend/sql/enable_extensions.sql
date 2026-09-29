-- Run once in the Supabase SQL editor (or enable both in Database → Extensions).
-- Supabase installs these into the extensions schema. The API sets
-- search_path to public, extensions on every connection.

create extension if not exists vector with schema extensions;
create extension if not exists postgis with schema extensions;

-- Tables, indexes, and the measured embedding dimension are created by the
-- API on startup (SQLAlchemy). You do not need to create them by hand.
