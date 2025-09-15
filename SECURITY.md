# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability, please report it by emailing security@submithunt.com. We will respond within 24 hours.

## Environment Variables

This project uses environment variables for sensitive configuration. Never commit the following to version control:

- `.env` files containing actual secrets
- Hardcoded API keys or tokens
- Database credentials
- Service role keys

## Required Environment Variables

Create a `.env` file based on `.env.example` with these variables:

```bash
# Supabase configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Email service
RESEND_API_KEY=your_resend_api_key
```

## Security Best Practices

1. **Never commit secrets to version control**
2. **Use environment variables for all sensitive data**
3. **Rotate keys regularly**
4. **Use least-privilege access principles**
5. **Keep dependencies updated**

## GitHub Secrets

For GitHub Actions, configure these secrets in your repository settings:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`

## Key Rotation

If any secrets are exposed:

1. Immediately rotate the compromised keys in Supabase Dashboard
2. Update GitHub repository secrets
3. Update production environment variables
4. Review access logs for unauthorized usage
