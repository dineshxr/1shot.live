-- Remove the "1 upvote per day" cap from upvote_startup.
--
-- The free-submission unlock gate now asks makers to upvote at least 3 products
-- (sh_free_submission_status), which the old daily cap made impossible. Upvotes
-- are still one-per-startup (toggle), just no longer limited to one per day.
--
-- Both overloads are re-created without the daily-limit branch (the auth.uid()
-- variant and the email-param variant the client actually calls). Everything
-- else is preserved verbatim from the live definitions.

create or replace function public.upvote_startup(startup_id_param uuid, user_email_param text)
returns json
language plpgsql
security definer
as $function$
declare
    existing_vote_count integer;
    new_upvote_count integer;
    result json;
begin
    -- Already voted for this startup? Toggle it off.
    select count(*) into existing_vote_count
    from public.votes
    where startup_id = startup_id_param and user_email = user_email_param;

    if existing_vote_count > 0 then
        delete from public.votes
        where startup_id = startup_id_param and user_email = user_email_param;

        update public.startups
        set upvote_count = greatest(upvote_count - 1, 0), updated_at = now()
        where id = startup_id_param;

        select upvote_count into new_upvote_count
        from public.startups where id = startup_id_param;

        result := json_build_object(
            'success', true, 'action', 'removed',
            'upvote_count', new_upvote_count, 'user_voted', false
        );
    else
        -- Add a vote. No daily limit: the free unlock gate asks for 3+ upvotes.
        insert into public.votes (startup_id, user_id, user_email, voted_at)
        values (startup_id_param, gen_random_uuid(), user_email_param, now());

        update public.startups
        set upvote_count = upvote_count + 1, updated_at = now()
        where id = startup_id_param;

        select upvote_count into new_upvote_count
        from public.startups where id = startup_id_param;

        result := json_build_object(
            'success', true, 'action', 'added',
            'upvote_count', new_upvote_count, 'user_voted', true
        );
    end if;

    return result;
end;
$function$;

create or replace function public.upvote_startup(startup_id_param uuid)
returns json
language plpgsql
security definer
as $function$
declare
    current_user_id uuid;
    existing_vote_id uuid;
    new_upvote_count integer;
begin
    current_user_id := auth.uid();
    if current_user_id is null then
        return json_build_object('error', 'User not authenticated');
    end if;

    select id into existing_vote_id
    from votes
    where user_id = current_user_id and startup_id = startup_id_param;

    if existing_vote_id is not null then
        delete from votes where id = existing_vote_id;

        update startups
        set upvote_count = greatest(upvote_count - 1, 0), updated_at = now()
        where id = startup_id_param;

        select upvote_count into new_upvote_count
        from startups where id = startup_id_param;

        return json_build_object(
            'success', true, 'action', 'removed',
            'upvote_count', new_upvote_count, 'user_voted', false
        );
    else
        -- No daily limit (see note above).
        insert into votes (user_id, startup_id, voted_at)
        values (current_user_id, startup_id_param, now());

        update startups
        set upvote_count = upvote_count + 1, updated_at = now()
        where id = startup_id_param;

        select upvote_count into new_upvote_count
        from startups where id = startup_id_param;

        return json_build_object(
            'success', true, 'action', 'added',
            'upvote_count', new_upvote_count, 'user_voted', true
        );
    end if;
end;
$function$;
