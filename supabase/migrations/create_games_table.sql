-- Create games table
create table if not exists public.games (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    url text not null unique,
    title text not null,
    description text,
    slug text not null unique,
    views integer default 0,
    images jsonb default '[]'::jsonb,
    author jsonb not null
);

-- Enable Row Level Security (RLS)
alter table public.games enable row level security;

-- Create policy to allow anonymous read access
create policy "Allow anonymous read access"
    on public.games
    for select
    to anon
    using (true);

-- Create policy to allow authenticated users to insert
create policy "Allow authenticated insert"
    on public.games
    for insert
    to authenticated
    with check (true);

-- Create index on slug for faster lookups
create index if not exists games_slug_idx on public.games (slug);
