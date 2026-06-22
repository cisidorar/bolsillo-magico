-- Add theme preference to profiles
-- Run in: Supabase → SQL Editor

alter table public.profiles
  add column if not exists theme text check (theme in ('light', 'dark'));
