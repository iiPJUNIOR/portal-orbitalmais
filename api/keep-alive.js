import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://jfbjeavkedcojarfygzf.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_iZF7xYWylMX9Lp56OTarSw_WjI1Tt5K";

export default async function handler(req, res) {
  // Opcional: Garante que a requisição venha do cron do Vercel
  // Se quiser testar no navegador ou Postman, você pode comentar esta verificação
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const isManualTrigger = req.query.bypass === 'true';

  if (!isVercelCron && !isManualTrigger) {
    return res.status(401).json({ error: 'Acesso não autorizado. Apenas requisições do Vercel Cron são permitidas.' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Executa uma query simples na tabela de produtos para manter o banco ativo
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .limit(1);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: 'Banco do Supabase pingado com sucesso!',
      data
    });
  } catch (error) {
    console.error('Erro ao pingar o Supabase:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
