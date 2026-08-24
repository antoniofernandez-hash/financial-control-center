import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xscpqzngiiwbbqnkgzdd.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_O5WceKo4haOuL8lfQEB_AA_UIc5Gxg_'

export const supabase = createClient(url, key)
