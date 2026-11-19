/**
 * Scheduled job: mark SLA breaches and auto-close resolved tickets.
 *
 * Deploy: `supabase functions deploy it-support-sla-cron`
 * Schedule (Dashboard → Edge Functions → Cron, or config): every 5 minutes
 *   POST /functions/v1/it-support-sla-cron
 *
 * Auth: service role / cron secret via Authorization Bearer or x-cron-secret.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    const cronSecret = Deno.env.get('IT_SUPPORT_CRON_SECRET') || ''
    const auth = req.headers.get('Authorization') || ''
    const headerSecret = req.headers.get('x-cron-secret') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''

    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    const allowed =
      (serviceKey && bearer === serviceKey) ||
      (cronSecret && (bearer === cronSecret || headerSecret === cronSecret))

    if (!allowed) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ message: 'Missing Supabase env' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await supabase.rpc('it_process_sla_and_autoclose')
    if (error) {
      console.error('[it-support-sla-cron]', error)
      return new Response(JSON.stringify({ message: error.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, result: data }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[it-support-sla-cron]', err)
    return new Response(JSON.stringify({ message: err?.message || 'Cron failed' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
