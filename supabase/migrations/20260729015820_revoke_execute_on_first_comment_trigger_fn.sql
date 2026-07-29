-- post_first_comment_on_launch() is a SECURITY DEFINER trigger function, so
-- PostgREST exposes it at /rest/v1/rpc/post_first_comment_on_launch by default.
-- Postgres refuses to run a trigger function outside a trigger context, so it
-- was not exploitable, but an unauthenticated EXECUTE grant on a definer
-- function has no reason to exist. Revoking EXECUTE does not affect the
-- triggers themselves: they fire as the table owner, not as the caller.
--
-- Flagged by the Supabase security advisor
-- (lint 0028_anon_security_definer_function_executable) right after the
-- first_comment_on_launch migration was applied.
REVOKE EXECUTE ON FUNCTION public.post_first_comment_on_launch() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_first_comment_on_launch() FROM anon;
REVOKE EXECUTE ON FUNCTION public.post_first_comment_on_launch() FROM authenticated;
