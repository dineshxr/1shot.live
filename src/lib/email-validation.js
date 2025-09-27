// Email validation utility to block temporary email providers
// This helps prevent spam and ensures legitimate user submissions

// Comprehensive list of temporary/disposable email providers
const TEMP_EMAIL_DOMAINS = [
  // Popular temporary email services
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  '2prong.com',
  '30minutemail.com',
  '3d-painting.com',
  '7tags.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  'guerrillamail.de',
  'guerrillamail.biz',
  'guerrillamail.info',
  'mailinator.com',
  'mailinator.net',
  'mailinator.org',
  'mailinator2.com',
  'sogetthis.com',
  'spamhereasap.com',
  'binkmail.com',
  'bobmail.info',
  'chammy.info',
  'devnullmail.com',
  'letthemeatspam.com',
  'mailinater.com',
  'mailinator.gq',
  'mailinator.tk',
  'notmailinator.com',
  'reconmail.com',
  'safetymail.info',
  'sendspamhere.com',
  'sofort-mail.de',
  'spamherelots.com',
  'spamhereplease.com',
  'spamthisplease.com',
  'streetwisemail.com',
  'tempemail.com',
  'tempemail.net',
  'tempinbox.com',
  'tempmail.it',
  'tempmail.net',
  'tempmail.org',
  'tempmail2.com',
  'tempmailer.com',
  'tempmailer.de',
  'tempmailaddress.com',
  'tempmailid.com',
  'throwaway.email',
  'trashmail.com',
  'trashmail.net',
  'trashmail.org',
  'wegwerfmail.de',
  'wegwerfmail.net',
  'wegwerfmail.org',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'cool.fr.nf',
  'jetable.fr.nf',
  'nospam.ze.tc',
  'nomail.xl.cx',
  'mega.zik.dj',
  'speed.1s.fr',
  'courriel.fr.nf',
  'moncourrier.fr.nf',
  'monemail.fr.nf',
  'monmail.fr.nf',
  'hide.biz.st',
  'mymail.infos.st',
  
  // Additional common temporary email services
  'temp-mail.org',
  'temp-mail.ru',
  'tempail.com',
  'tempbox.org',
  'tempr.email',
  'tmpmail.org',
  'tmpmail.net',
  'tmpnator.com',
  'mohmal.com',
  'fakeinbox.com',
  'fake-mail.ml',
  'fakemail.net',
  'throwawaymail.com',
  'disposablemail.com',
  'dispostable.com',
  'spambox.us',
  'spamcannon.net',
  'spamcannon.com',
  'spamfree24.org',
  'spamfree24.de',
  'spamfree24.eu',
  'spamgourmet.com',
  'spamgourmet.net',
  'spamgourmet.org',
  'spamhole.com',
  'spaml.com',
  'spaml.de',
  'spammotel.com',
  'spamavert.com',
  'spambob.net',
  'spambob.com',
  'spambog.com',
  'spambog.de',
  'spambog.ru',
  'spamcorptastic.com',
  'spamday.com',
  'spamex.com',
  'spamfighter.cf',
  'spamfighter.ga',
  'spamfighter.gq',
  'spamfighter.ml',
  'spamfighter.tk',
  'spamify.com',
  'spamkill.info',
  'spaml.com',
  'spaml.de',
  'spamspot.com',
  'spamstack.net',
  'spamthis.co.uk',
  'spamtroll.net',
  'speed.1s.fr',
  'spoofmail.de',
  'stuffmail.de',
  'super-auswahl.de',
  'superrito.com',
  'supermailer.jp',
  'suremail.info',
  'tagyourself.com',
  'talkinator.com',
  'tapchicuoihoi.com',
  'teewars.org',
  'teleworm.com',
  'teleworm.us',
  'temp.emeraldwebmail.com',
  'temp.headstrong.de',
  'temp.maildu.de',
  'tempail.com',
  'tempalias.com',
  'tempe-mail.com',
  'tempemail.biz',
  'tempemail.com',
  'tempinbox.co.uk',
  'tempinbox.com',
  'tempmail.eu',
  'tempmaildemo.com',
  'tempmailer.com',
  'tempmailer.de',
  'tempmailgenerator.com',
  'tempthe.net',
  'thanksnospam.info',
  'thankyou2010.com',
  'thc.st',
  'thelimestones.com',
  'thisisnotmyrealemail.com',
  'thismail.net',
  'throwam.com',
  'tilien.com',
  'tittbit.in',
  'tmail.ws',
  'tmailinator.com',
  'toiea.com',
  'toomail.biz',
  'topranklist.de',
  'tradermail.info',
  'trash2009.com',
  'trash2010.com',
  'trash2011.com',
  'trash-amil.com',
  'trashdevil.com',
  'trashemail.de',
  'trashmail.at',
  'trashmail.com',
  'trashmail.de',
  'trashmail.me',
  'trashmail.net',
  'trashmail.org',
  'trashmail.ws',
  'trashmailer.com',
  'trashymail.com',
  'trashymail.net',
  'trbvm.com',
  'turual.com',
  'twinmail.de',
  'tyldd.com',
  'uggsrock.com',
  'umail.net',
  'upliftnow.com',
  'uplipht.com',
  'uroid.com',
  'us.af',
  'venompen.com',
  'veryrealemail.com',
  'vidchart.com',
  'viditag.com',
  'viewcastmedia.com',
  'viewcastmedia.net',
  'viewcastmedia.org',
  'vomoto.com',
  'vubby.com',
  'walala.org',
  'walkmail.net',
  'webemail.me',
  'weg-werf-email.de',
  'wegwerf-emails.de',
  'wegwerfadresse.de',
  'wegwerfemail.com',
  'wegwerfemail.de',
  'wegwerfmail.de',
  'wegwerfmail.net',
  'wegwerfmail.org',
  'wh4f.org',
  'whyspam.me',
  'willselfdestruct.com',
  'winemaven.info',
  'wronghead.com',
  'wuzup.net',
  'wuzupmail.net',
  'www.e4ward.com',
  'www.gishpuppy.com',
  'www.mailinator.com',
  'wwwnew.eu',
  'x.ip6.li',
  'xagloo.com',
  'xemaps.com',
  'xents.com',
  'xmaily.com',
  'xoxy.net',
  'yapped.net',
  'yeah.net',
  'yep.it',
  'yogamaven.com',
  'yomail.info',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'youmailr.com',
  'yourdomain.com',
  'ypmail.webredirect.org',
  'yuurok.com',
  'zehnminutenmail.de',
  'zetmail.com',
  'zippymail.info',
  'zoaxe.com',
  'zoemail.net',
  'zoemail.org',
  'zomg.info',
  'zxcv.com',
  'zxcvbnm.com',
  'zzz.com',
  
  // Additional services found in 2024
  'emailondeck.com',
  'emailfake.com',
  'maildrop.cc',
  'mailnesia.com',
  'mailcatch.com',
  'mailhazard.com',
  'mailhazard.us',
  'mailmetrash.com',
  'mailnull.com',
  'mailsac.com',
  'mailtothis.com',
  'makemetheking.com',
  'mintemail.com',
  'mytrashmail.com',
  'nada.email',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamail.biz',
  'guerrillamail.de',
  'grr.la',
  'sharklasers.com',
  'guerrillamailblock.com',
  'pokemail.net',
  'spam4.me',
  'tempmail.plus',
  'tempmail.ninja',
  'tempmail.dev',
  'tempmail.altmails.com',
  'tempmail.email',
  'tempmail.io',
  'tempmail.lol',
  'tempmail.us.com',
  'tempmailo.com',
  'tempmails.net',
  'tempr.email',
  'tmpbox.net',
  'tmpmail.net',
  'tmpmail.org',
  'tmpnator.com',
  'trashmail.ws',
  'trbvm.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net'
];

// Convert to Set for faster lookups
const TEMP_EMAIL_DOMAINS_SET = new Set(TEMP_EMAIL_DOMAINS.map(domain => domain.toLowerCase()));

/**
 * Validates if an email domain is from a temporary email provider
 * @param {string} email - The email address to validate
 * @returns {boolean} - True if email is valid (not temporary), false if it's from a temp provider
 */
export function isValidEmailDomain(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Extract domain from email
  const emailParts = email.toLowerCase().trim().split('@');
  if (emailParts.length !== 2) {
    return false;
  }

  const domain = emailParts[1];
  
  // Check if domain is in our blacklist
  return !TEMP_EMAIL_DOMAINS_SET.has(domain);
}

/**
 * Gets a user-friendly error message for blocked email domains
 * @param {string} email - The blocked email address
 * @returns {string} - Error message to display to user
 */
export function getEmailDomainErrorMessage(email) {
  const domain = email?.split('@')[1] || 'this domain';
  return `Email addresses from ${domain} are not allowed. Please use a permanent email address from a standard email provider like Gmail, Outlook, or your company email.`;
}

/**
 * Validates email format and domain
 * @param {string} email - The email address to validate
 * @returns {object} - Validation result with isValid boolean and error message
 */
export function validateEmail(email) {
  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!email || !emailRegex.test(email)) {
    return {
      isValid: false,
      error: 'Please enter a valid email address.'
    };
  }

  // Check if domain is allowed
  if (!isValidEmailDomain(email)) {
    return {
      isValid: false,
      error: getEmailDomainErrorMessage(email)
    };
  }

  return {
    isValid: true,
    error: null
  };
}

/**
 * List of allowed email domains (major providers)
 * This can be used as an alternative whitelist approach
 */
export const ALLOWED_EMAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.ca',
  'yahoo.com.au',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'protonmail.com',
  'proton.me',
  'tutanota.com',
  'fastmail.com',
  'zoho.com',
  'yandex.com',
  'mail.ru',
  'gmx.com',
  'gmx.de',
  'web.de',
  't-online.de',
  'freenet.de',
  'arcor.de',
  'alice.it',
  'libero.it',
  'virgilio.it',
  'orange.fr',
  'laposte.net',
  'free.fr',
  'sfr.fr',
  'wanadoo.fr',
  'naver.com',
  'daum.net',
  'hanmail.net',
  'qq.com',
  '163.com',
  '126.com',
  'sina.com',
  'sohu.com',
  'rediffmail.com',
  'sify.com',
  'vsnl.net',
  'indiatimes.com'
];

/**
 * Alternative validation using whitelist approach
 * @param {string} email - The email address to validate
 * @returns {boolean} - True if email domain is in allowed list
 */
export function isAllowedEmailDomain(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const domain = email.toLowerCase().trim().split('@')[1];
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}
