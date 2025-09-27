-- Add email domain validation to prevent temporary email providers
-- This migration adds server-side validation for email domains

-- Create a function to validate email domains
CREATE OR REPLACE FUNCTION validate_email_domain(email_address TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    domain TEXT;
    temp_domains TEXT[] := ARRAY[
        '10minutemail.com', '10minutemail.net', '20minutemail.com', '2prong.com',
        '30minutemail.com', '3d-painting.com', '7tags.com', 'guerrillamail.com',
        'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com',
        'sharklasers.com', 'grr.la', 'guerrillamail.de', 'guerrillamail.biz',
        'guerrillamail.info', 'mailinator.com', 'mailinator.net', 'mailinator.org',
        'mailinator2.com', 'sogetthis.com', 'spamhereasap.com', 'binkmail.com',
        'bobmail.info', 'chammy.info', 'devnullmail.com', 'letthemeatspam.com',
        'mailinater.com', 'mailinator.gq', 'mailinator.tk', 'notmailinator.com',
        'reconmail.com', 'safetymail.info', 'sendspamhere.com', 'sofort-mail.de',
        'spamherelots.com', 'spamhereplease.com', 'spamthisplease.com',
        'streetwisemail.com', 'tempemail.com', 'tempemail.net', 'tempinbox.com',
        'tempmail.it', 'tempmail.net', 'tempmail.org', 'tempmail2.com',
        'tempmailer.com', 'tempmailer.de', 'tempmailaddress.com', 'tempmailid.com',
        'throwaway.email', 'trashmail.com', 'trashmail.net', 'trashmail.org',
        'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org', 'yopmail.com',
        'yopmail.fr', 'yopmail.net', 'cool.fr.nf', 'jetable.fr.nf', 'nospam.ze.tc',
        'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr', 'courriel.fr.nf',
        'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf', 'hide.biz.st',
        'mymail.infos.st', 'temp-mail.org', 'temp-mail.ru', 'tempail.com',
        'tempbox.org', 'tempr.email', 'tmpmail.org', 'tmpmail.net', 'tmpnator.com',
        'mohmal.com', 'fakeinbox.com', 'fake-mail.ml', 'fakemail.net',
        'throwawaymail.com', 'disposablemail.com', 'dispostable.com', 'spambox.us',
        'spamcannon.net', 'spamcannon.com', 'spamfree24.org', 'spamfree24.de',
        'spamfree24.eu', 'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org',
        'spamhole.com', 'spaml.com', 'spaml.de', 'spammotel.com', 'spamavert.com',
        'spambob.net', 'spambob.com', 'spambog.com', 'spambog.de', 'spambog.ru',
        'emailondeck.com', 'emailfake.com', 'maildrop.cc', 'mailnesia.com',
        'mailcatch.com', 'mailhazard.com', 'mailhazard.us', 'mailmetrash.com',
        'mailnull.com', 'mailsac.com', 'mailtothis.com', 'makemetheking.com',
        'mintemail.com', 'mytrashmail.com', 'nada.email', 'pokemail.net',
        'spam4.me', 'tempmail.plus', 'tempmail.ninja', 'tempmail.dev',
        'tempmail.altmails.com', 'tempmail.email', 'tempmail.io', 'tempmail.lol',
        'tempmail.us.com', 'tempmailo.com', 'tempmails.net', 'tmpbox.net',
        'trashmail.ws', 'trbvm.com'
    ];
BEGIN
    -- Return false if email is null or empty
    IF email_address IS NULL OR email_address = '' THEN
        RETURN FALSE;
    END IF;
    
    -- Extract domain from email (convert to lowercase)
    domain := LOWER(SPLIT_PART(email_address, '@', 2));
    
    -- Return false if no domain found
    IF domain = '' THEN
        RETURN FALSE;
    END IF;
    
    -- Check if domain is in the blocked list
    IF domain = ANY(temp_domains) THEN
        RETURN FALSE;
    END IF;
    
    -- Email domain is valid
    RETURN TRUE;
END;
$$;

-- Create a trigger function to validate email domains on startup submissions
CREATE OR REPLACE FUNCTION validate_startup_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Extract email from author JSON field
    IF NEW.author IS NOT NULL AND NEW.author->>'email' IS NOT NULL THEN
        IF NOT validate_email_domain(NEW.author->>'email') THEN
            RAISE EXCEPTION 'Email domain not allowed. Please use a permanent email address from a standard email provider.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger to validate email domains on INSERT and UPDATE
DROP TRIGGER IF EXISTS validate_startup_email_trigger ON public.startups;
CREATE TRIGGER validate_startup_email_trigger
    BEFORE INSERT OR UPDATE ON public.startups
    FOR EACH ROW
    EXECUTE FUNCTION validate_startup_email();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION validate_email_domain TO authenticated;
GRANT EXECUTE ON FUNCTION validate_startup_email TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION validate_email_domain IS 'Validates email domains to prevent temporary/disposable email providers';
COMMENT ON FUNCTION validate_startup_email IS 'Trigger function to validate email domains in startup submissions';
COMMENT ON TRIGGER validate_startup_email_trigger ON public.startups IS 'Validates email domains before inserting or updating startup records';
