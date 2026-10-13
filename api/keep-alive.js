import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://jfbjeavkedcojarfygzf.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_iZF7xYWylMX9Lp56OTarSw_WjI1Tt5K";

export default async function handler(req, res) {
  // Configura cabeçalhos de CORS e previne cache intermediário
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Executa queries em duas tabelas para redundância e garantir atividade no banco
    const [productsRes, settingsRes] = await Promise.all([
      supabase.from('products').select('id').limit(1),
      supabase.from('user_settings').select('user_id').limit(1),
    ]);

    // Se ambas falharem, reporta erro
    if (productsRes.error && settingsRes.error) {
      throw new Error(`Falha nas queries: products (${productsRes.error.message}), user_settings (${settingsRes.error.message})`);
    }

    const durationMs = Date.now() - startTime;
    const report = {
      success: true,
      message: 'Banco do Supabase mantido ativo com sucesso!',
      timestamp: new Date().toISOString(),
      durationMs,
      checks: {
        products: !productsRes.error,
        user_settings: !settingsRes.error,
      }
    };

    // Despacha e-mail do sistema para o administrador se solicitado ou na rotina diária
    const shouldSendEmail = req.query.email !== 'false';
    let emailStatus = null;
    if (shouldSendEmail) {
      emailStatus = await sendSystemEmail(report);
    }

    return res.status(200).json({
      ...report,
      emailNotification: emailStatus
    });
  } catch (error) {
    console.error('Erro ao pingar o Supabase:', error);
    const failureReport = {
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message || 'Erro desconhecido ao conectar no Supabase'
    };

    try {
      await sendSystemEmail(failureReport);
    } catch (e) {
      console.error('Falha ao despachar e-mail de alerta:', e);
    }

    return res.status(500).json(failureReport);
  }
}

async function sendSystemEmail(report) {
  const recipient = 'junior.8350i@gmail.com';
  const isOk = report.success;
  const subject = isOk
    ? `[Portal Orbitalmais] Status do Sistema: SAUDAVEL (OK) - ${new Date().toLocaleDateString('pt-BR')}`
    : `[Portal Orbitalmais] ALERTA: Falha no Supabase!`;

  try {
    const payload = {
      _subject: subject,
      _template: 'table',
      _captcha: 'false',
      Status_Geral: isOk ? 'ONLINE E SAUDAVEL' : 'ALERTA / FALHA',
      Data_Hora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      Tempo_de_Resposta: `${report.durationMs || 0}ms`,
      Tabela_Produtos: report.checks?.products ? 'OK (Online)' : (isOk ? 'OK' : 'Falha'),
      Tabela_Configuracoes: report.checks?.user_settings ? 'OK (Online)' : (isOk ? 'OK' : 'Falha'),
      Mensagem: isOk
        ? 'O banco Supabase foi consultado com sucesso e todos os servicos estao 100% operacionais.'
        : `Erro reportado: ${report.error || 'Falha de conexao com o banco'}`
    };

    const response = await fetch(`https://formsubmit.co/ajax/${recipient}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://portal-orbitalmais.vercel.app',
        'Referer': 'https://portal-orbitalmais.vercel.app/'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    return { sent: true, response: data };
  } catch (err) {
    console.error('Erro no envio de e-mail do sistema:', err);
    return { sent: false, error: err.message };
  }
}
