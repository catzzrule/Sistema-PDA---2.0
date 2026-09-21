// Cria o cliente Supabase único usado por todo o app.
// Depende do script UMD carregado via CDN (window.supabase) — ver index.html.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
