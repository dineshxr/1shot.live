export default async function handler(req, res) {
  // Verify this is a cron job request from Vercel
  const authHeader = req.headers.authorization;
  
  // Only allow cron jobs or requests with the correct secret
  if (req.headers['x-vercel-cron'] !== '1' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const SUPABASE_URL = 'https://lbayphzxmdtdmrqmeomt.supabase.co';
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_ANON_KEY) {
      console.error('SUPABASE_ANON_KEY not configured');
      return res.status(500).json({ error: 'Missing configuration' });
    }

    // Call the send-live-notifications Edge Function
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-live-notifications`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Edge Function error:', data);
      return res.status(response.status).json({ error: 'Edge Function failed', details: data });
    }

    console.log('Notifications sent successfully:', data);
    return res.status(200).json({ success: true, data });

  } catch (error) {
    console.error('Cron job error:', error);
    return res.status(500).json({ error: error.message });
  }
}
