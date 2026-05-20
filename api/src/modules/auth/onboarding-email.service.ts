import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import * as nodemailer from 'nodemailer';

type EmailType = 'welcome' | 'day1' | 'day3' | 'day7';
type Lang = 'es' | 'en' | 'pt' | 'tr' | 'ar';

interface EmailContent {
  subject: string;
  title: string;
  body: string;
  cta: string;
  url: string;
}

const APP = 'https://app.automarkiq.com';

const T: Record<Lang, Record<EmailType, (first: string, ws: string) => EmailContent>> = {
  es: {
    welcome: (first, ws) => ({
      subject: '¡Bienvenido a AutoMarkIQ! Empieza en 3 pasos',
      title: `¡Bienvenido a AutoMarkIQ, ${first}!`,
      body: `<p>Tu workspace <strong>${ws}</strong> está listo. En 10 minutos puedes tener tu primera bandeja operativa:</p>
<div style="background:#f8fafc;border-radius:12px;padding:24px;margin:24px 0;border-left:4px solid #6366f1;">
  <p style="margin:0 0 10px;font-weight:700;color:#0f172a;">3 pasos para empezar</p>
  <p style="margin:0 0 8px;color:#475569;">1. <strong>Conecta un canal</strong> — WhatsApp, Instagram o Email en Conexiones</p>
  <p style="margin:0 0 8px;color:#475569;">2. <strong>Crea tu primera bandeja</strong> — agrupa conversaciones por canal</p>
  <p style="margin:0;color:#475569;">3. <strong>Invita a tu equipo</strong> — añade agentes en Configuración → Usuarios</p>
</div>
<p>Cualquier pregunta, responde a este email y te ayudamos.</p>`,
      cta: 'Ir al dashboard →', url: `${APP}/dashboard`,
    }),
    day1: (first) => ({
      subject: '¿Ya conectaste tu primer canal? 📱',
      title: `${first}, ¿ya conectaste tu primer canal?`,
      body: `<p>Con AutoMarkIQ recibes mensajes de <strong>WhatsApp, Instagram, Messenger, Telegram, Email y SMS</strong> en una sola bandeja.</p>
<div style="background:#f0f4ff;border-radius:12px;padding:24px;margin:24px 0;">
  <p style="margin:0 0 10px;color:#475569;">📱 <strong>WhatsApp</strong> — escanea un QR o usa la API de Meta</p>
  <p style="margin:0 0 10px;color:#475569;">📸 <strong>Instagram</strong> — conecta con tu cuenta de negocio</p>
  <p style="margin:0;color:#475569;">📧 <strong>Email</strong> — SMTP/IMAP con Gmail, Outlook o tu servidor</p>
</div>
<p>Una vez conectado, todos los mensajes llegan a una bandeja unificada. Tu equipo responde desde un solo lugar.</p>`,
      cta: 'Conectar mi primer canal →', url: `${APP}/connections`,
    }),
    day3: (first) => ({
      subject: 'Tu chatbot IA podría atender clientes 24/7 🤖',
      title: `Tu chatbot IA podría atender clientes mientras duermes, ${first}`,
      body: `<p>El <strong>70% de las consultas</strong> son preguntas repetitivas que un chatbot puede responder automáticamente.</p>
<div style="background:#f0fdf4;border-radius:12px;padding:24px;margin:24px 0;border-left:4px solid #10b981;">
  <p style="margin:0 0 10px;font-weight:700;color:#0f172a;">Con un chatbot IA puedes:</p>
  <p style="margin:0 0 8px;color:#475569;">🤖 Responder preguntas frecuentes automáticamente</p>
  <p style="margin:0 0 8px;color:#475569;">📋 Calificar leads antes de pasarlos a tu equipo</p>
  <p style="margin:0 0 8px;color:#475569;">📅 Agendar citas y enviar confirmaciones</p>
  <p style="margin:0;color:#475569;">⬆️ Escalar a un agente humano cuando sea necesario</p>
</div>
<p>Configurarlo tarda menos de 15 minutos. Sin código, sin técnicos.</p>`,
      cta: 'Crear mi chatbot IA →', url: `${APP}/ai-chatbots`,
    }),
    day7: (first, ws) => ({
      subject: '¿Cómo va todo en AutoMarkIQ? 💬',
      title: `¿Cómo va todo en AutoMarkIQ, ${first}?`,
      body: `<p>Ya llevas una semana con <strong>${ws}</strong>. Si aún tienes el plan gratuito, esto es lo que podrías estar perdiendo:</p>
<div style="background:#fff7ed;border-radius:12px;padding:24px;margin:24px 0;border-left:4px solid #f59e0b;">
  <p style="margin:0 0 8px;color:#475569;">🤖 <strong>Chatbots IA</strong> — disponibles desde el plan Pro</p>
  <p style="margin:0 0 8px;color:#475569;">📞 <strong>Bots de voz</strong> — llamadas automatizadas con IA</p>
  <p style="margin:0 0 8px;color:#475569;">📊 <strong>Reportes avanzados</strong> — mide el rendimiento del equipo</p>
  <p style="margin:0;color:#475569;">👥 <strong>Hasta 10 agentes</strong> y 5 bandejas simultáneas</p>
</div>
<p>El plan Pro cuesta <strong>$49/mes</strong> y puedes cancelarlo cuando quieras.</p>`,
      cta: 'Ver planes premium →', url: 'https://automarkiq.com/#pricing',
    }),
  },

  en: {
    welcome: (first, ws) => ({
      subject: 'Welcome to AutoMarkIQ! Get started in 3 steps',
      title: `Welcome to AutoMarkIQ, ${first}!`,
      body: `<p>Your workspace <strong>${ws}</strong> is ready. Here's how to get up and running in 10 minutes:</p>
<div style="background:#f8fafc;border-radius:12px;padding:24px;margin:24px 0;border-left:4px solid #6366f1;">
  <p style="margin:0 0 10px;font-weight:700;color:#0f172a;">3 steps to get started</p>
  <p style="margin:0 0 8px;color:#475569;">1. <strong>Connect a channel</strong> — WhatsApp, Instagram or Email in Connections</p>
  <p style="margin:0 0 8px;color:#475569;">2. <strong>Create your first inbox</strong> — group conversations by channel</p>
  <p style="margin:0;color:#475569;">3. <strong>Invite your team</strong> — add agents in Settings → Users</p>
</div>
<p>Any questions? Reply to this email and we'll help you personally.</p>`,
      cta: 'Go to dashboard →', url: `${APP}/dashboard`,
    }),
    day1: (first) => ({
      subject: 'Have you connected your first channel? 📱',
      title: `${first}, have you connected your first channel?`,
      body: `<p>With AutoMarkIQ you receive messages from <strong>WhatsApp, Instagram, Messenger, Telegram, Email and SMS</strong> in one single inbox.</p>
<div style="background:#f0f4ff;border-radius:12px;padding:24px;margin:24px 0;">
  <p style="margin:0 0 10px;color:#475569;">📱 <strong>WhatsApp</strong> — scan a QR code or use the Meta API</p>
  <p style="margin:0 0 10px;color:#475569;">📸 <strong>Instagram</strong> — connect your business account</p>
  <p style="margin:0;color:#475569;">📧 <strong>Email</strong> — SMTP/IMAP with Gmail, Outlook or your server</p>
</div>
<p>Once connected, all messages arrive in your unified inbox. Your team replies from one place.</p>`,
      cta: 'Connect my first channel →', url: `${APP}/connections`,
    }),
    day3: (first) => ({
      subject: 'Your AI chatbot could be handling customers 24/7 🤖',
      title: `Your AI chatbot could handle customers while you sleep, ${first}`,
      body: `<p><strong>70% of customer inquiries</strong> are repetitive questions that a chatbot can answer automatically.</p>
<div style="background:#f0fdf4;border-radius:12px;padding:24px;margin:24px 0;border-left:4px solid #10b981;">
  <p style="margin:0 0 10px;font-weight:700;color:#0f172a;">With an AI chatbot you can:</p>
  <p style="margin:0 0 8px;color:#475569;">🤖 Answer FAQs automatically</p>
  <p style="margin:0 0 8px;color:#475569;">📋 Qualify leads before passing them to your team</p>
  <p style="margin:0 0 8px;color:#475569;">📅 Schedule appointments and send confirmations</p>
  <p style="margin:0;color:#475569;">⬆️ Escalate to a human agent when needed</p>
</div>
<p>Setup takes less than 15 minutes. No code. No engineers.</p>`,
      cta: 'Create my AI chatbot →', url: `${APP}/ai-chatbots`,
    }),
    day7: (first, ws) => ({
      subject: 'How is everything going in AutoMarkIQ? 💬',
      title: `How's everything going, ${first}?`,
      body: `<p>You've been using <strong>${ws}</strong> for a week now. If you're still on the free plan, here's what you might be missing:</p>
<div style="background:#fff7ed;border-radius:12px;padding:24px;margin:24px 0;border-left:4px solid #f59e0b;">
  <p style="margin:0 0 8px;color:#475569;">🤖 <strong>AI Chatbots</strong> — available from the Pro plan</p>
  <p style="margin:0 0 8px;color:#475569;">📞 <strong>Voice Bots</strong> — AI-powered automated calls</p>
  <p style="margin:0 0 8px;color:#475569;">📊 <strong>Advanced Reports</strong> — measure team performance</p>
  <p style="margin:0;color:#475569;">👥 <strong>Up to 10 agents</strong> and 5 simultaneous inboxes</p>
</div>
<p>The Pro plan is <strong>$49/month</strong> and you can cancel anytime.</p>`,
      cta: 'View premium plans →', url: 'https://automarkiq.com/#pricing',
    }),
  },

  pt: {
    welcome: (first, ws) => ({
      subject: 'Bem-vindo ao AutoMarkIQ! Comece em 3 passos',
      title: `Bem-vindo ao AutoMarkIQ, ${first}!`,
      body: `<p>O seu workspace <strong>${ws}</strong> está pronto. Em 10 minutos pode ter a sua primeira caixa de entrada a funcionar:</p>
<div style="background:#f8fafc;border-radius:12px;padding:24px;margin:24px 0;border-left:4px solid #6366f1;">
  <p style="margin:0 0 10px;font-weight:700;color:#0f172a;">3 passos para começar</p>
  <p style="margin:0 0 8px;color:#475569;">1. <strong>Conecte um canal</strong> — WhatsApp, Instagram ou E-mail em Conexões</p>
  <p style="margin:0 0 8px;color:#475569;">2. <strong>Crie a sua primeira caixa</strong> — agrupe conversas por canal</p>
  <p style="margin:0;color:#475569;">3. <strong>Convide a sua equipa</strong> — adicione agentes em Definições → Utilizadores</p>
</div>
<p>Qualquer dúvida, responda a este email e ajudamo-lo pessoalmente.</p>`,
      cta: 'Ir para o dashboard →', url: `${APP}/dashboard`,
    }),
    day1: (first) => ({
      subject: 'Já conectou o seu primeiro canal? 📱',
      title: `${first}, já conectou o seu primeiro canal?`,
      body: `<p>Com o AutoMarkIQ recebe mensagens do <strong>WhatsApp, Instagram, Messenger, Telegram, E-mail e SMS</strong> numa única caixa de entrada.</p>
<div style="background:#f0f4ff;border-radius:12px;padding:24px;margin:24px 0;">
  <p style="margin:0 0 10px;color:#475569;">📱 <strong>WhatsApp</strong> — digitalize um QR ou use a API da Meta</p>
  <p style="margin:0 0 10px;color:#475569;">📸 <strong>Instagram</strong> — conecte a sua conta de negócio</p>
  <p style="margin:0;color:#475569;">📧 <strong>E-mail</strong> — SMTP/IMAP com Gmail, Outlook ou o seu servidor</p>
</div>
<p>Depois de conectado, todas as mensagens chegam a uma caixa unificada. A sua equipa responde de um só lugar.</p>`,
      cta: 'Conectar o meu primeiro canal →', url: `${APP}/connections`,
    }),
    day3: (first) => ({
      subject: 'O seu chatbot IA pode atender clientes 24/7 🤖',
      title: `O seu chatbot IA pode atender clientes enquanto dorme, ${first}`,
      body: `<p><strong>70% das consultas</strong> dos clientes são perguntas repetitivas que um chatbot pode responder automaticamente.</p>
<div style="background:#f0fdf4;border-radius:12px;padding:24px;margin:24px 0;border-left:4px solid #10b981;">
  <p style="margin:0 0 10px;font-weight:700;color:#0f172a;">Com um chatbot IA pode:</p>
  <p style="margin:0 0 8px;color:#475569;">🤖 Responder perguntas frequentes automaticamente</p>
  <p style="margin:0 0 8px;color:#475569;">📋 Qualificar leads antes de os passar à equipa</p>
  <p style="margin:0 0 8px;color:#475569;">📅 Agendar reuniões e enviar confirmações</p>
  <p style="margin:0;color:#475569;">⬆️ Escalar para um agente humano quando necessário</p>
</div>
<p>A configuração demora menos de 15 minutos. Sem código, sem técnicos.</p>`,
      cta: 'Criar o meu chatbot IA →', url: `${APP}/ai-chatbots`,
    }),
    day7: (first, ws) => ({
      subject: 'Como está correndo tudo no AutoMarkIQ? 💬',
      title: `Como está correndo tudo, ${first}?`,
      body: `<p>Já tem <strong>${ws}</strong> há uma semana. Se ainda está no plano gratuito, veja o que pode estar a perder:</p>
<div style="background:#fff7ed;border-radius:12px;padding:24px;margin:24px 0;border-left:4px solid #f59e0b;">
  <p style="margin:0 0 8px;color:#475569;">🤖 <strong>Chatbots IA</strong> — disponíveis a partir do plano Pro</p>
  <p style="margin:0 0 8px;color:#475569;">📞 <strong>Bots de voz</strong> — chamadas automatizadas com IA</p>
  <p style="margin:0 0 8px;color:#475569;">📊 <strong>Relatórios avançados</strong> — meça o desempenho da equipa</p>
  <p style="margin:0;color:#475569;">👥 <strong>Até 10 agentes</strong> e 5 caixas simultâneas</p>
</div>
<p>O plano Pro custa <strong>$49/mês</strong> e pode cancelar quando quiser.</p>`,
      cta: 'Ver planos premium →', url: 'https://automarkiq.com/#pricing',
    }),
  },

  tr: {
    welcome: (first, ws) => ({
      subject: "AutoMarkIQ'a hoş geldin! 3 adımda başla",
      title: `AutoMarkIQ'a hoş geldin, ${first}!`,
      body: `<p><strong>${ws}</strong> çalışma alanın hazır. 10 dakikada ilk gelen kutunu aktif hale getirebilirsin:</p>
<div style="background:#f8fafc;border-radius:12px;padding:24px;margin:24px 0;border-left:4px solid #6366f1;">
  <p style="margin:0 0 10px;font-weight:700;color:#0f172a;">Başlamak için 3 adım</p>
  <p style="margin:0 0 8px;color:#475569;">1. <strong>Kanal bağla</strong> — Bağlantılar'da WhatsApp, Instagram veya E-posta</p>
  <p style="margin:0 0 8px;color:#475569;">2. <strong>İlk gelen kutunu oluştur</strong> — Konuşmaları kanala göre grupla</p>
  <p style="margin:0;color:#475569;">3. <strong>Ekibini davet et</strong> — Ayarlar → Kullanıcılar'dan temsilci ekle</p>
</div>
<p>Herhangi bir sorun olursa bu e-postaya yanıt ver, sana yardımcı olalım.</p>`,
      cta: 'Panele git →', url: `${APP}/dashboard`,
    }),
    day1: (first) => ({
      subject: 'İlk kanalını bağladın mı? 📱',
      title: `${first}, ilk kanalını bağladın mı?`,
      body: `<p>AutoMarkIQ ile <strong>WhatsApp, Instagram, Messenger, Telegram, E-posta ve SMS</strong> mesajlarını tek bir gelen kutusunda alırsın.</p>
<div style="background:#f0f4ff;border-radius:12px;padding:24px;margin:24px 0;">
  <p style="margin:0 0 10px;color:#475569;">📱 <strong>WhatsApp</strong> — QR kodu tara veya Meta API kullan</p>
  <p style="margin:0 0 10px;color:#475569;">📸 <strong>Instagram</strong> — İşletme hesabını bağla</p>
  <p style="margin:0;color:#475569;">📧 <strong>E-posta</strong> — Gmail, Outlook veya kendi sunucunla SMTP/IMAP</p>
</div>
<p>Bağlandıktan sonra tüm mesajlar birleşik gelen kutuna gelir. Ekibin tek bir yerden yanıtlar.</p>`,
      cta: 'İlk kanalımı bağla →', url: `${APP}/connections`,
    }),
    day3: (first) => ({
      subject: 'Yapay zeka chatbotun 7/24 müşterileri karşılayabilir 🤖',
      title: `Yapay zeka chatbotun uyurken müşterileri karşılayabilir, ${first}`,
      body: `<p>Müşteri sorgularının <strong>%70'i</strong>, bir chatbotun otomatik olarak yanıtlayabileceği tekrarlayan sorulardır.</p>
<div style="background:#f0fdf4;border-radius:12px;padding:24px;margin:24px 0;border-left:4px solid #10b981;">
  <p style="margin:0 0 10px;font-weight:700;color:#0f172a;">Yapay zeka chatbotu ile:</p>
  <p style="margin:0 0 8px;color:#475569;">🤖 Sık sorulan soruları otomatik yanıtla</p>
  <p style="margin:0 0 8px;color:#475569;">📋 Müşteri adaylarını ekibine geçmeden önce nitele</p>
  <p style="margin:0 0 8px;color:#475569;">📅 Randevu planla ve onay gönder</p>
  <p style="margin:0;color:#475569;">⬆️ Gerektiğinde insan temsilciye aktar</p>
</div>
<p>Kurulum 15 dakikadan az sürer. Kod yok, teknik ekip gerekmez.</p>`,
      cta: 'Yapay zeka chatbotumu oluştur →', url: `${APP}/ai-chatbots`,
    }),
    day7: (first, ws) => ({
      subject: "AutoMarkIQ'da işler nasıl gidiyor? 💬",
      title: `İşler nasıl gidiyor, ${first}?`,
      body: `<p><strong>${ws}</strong> ile bir haftadır çalışıyorsun. Hâlâ ücretsiz plandaysan, kaçırabileceğin özellikler:</p>
<div style="background:#fff7ed;border-radius:12px;padding:24px;margin:24px 0;border-left:4px solid #f59e0b;">
  <p style="margin:0 0 8px;color:#475569;">🤖 <strong>Yapay Zeka Chatbotları</strong> — Pro plandan itibaren mevcut</p>
  <p style="margin:0 0 8px;color:#475569;">📞 <strong>Sesli Botlar</strong> — Yapay zeka destekli otomatik aramalar</p>
  <p style="margin:0 0 8px;color:#475569;">📊 <strong>Gelişmiş Raporlar</strong> — Ekip performansını ölç</p>
  <p style="margin:0;color:#475569;">👥 <strong>10 temsilciye kadar</strong> ve 5 gelen kutusu</p>
</div>
<p>Pro plan <strong>49$/ay</strong> ve istediğin zaman iptal edebilirsin.</p>`,
      cta: 'Premium planları gör →', url: 'https://automarkiq.com/#pricing',
    }),
  },

  ar: {
    welcome: (first, ws) => ({
      subject: 'مرحباً بك في AutoMarkIQ! ابدأ في 3 خطوات',
      title: `مرحباً بك في AutoMarkIQ، ${first}!`,
      body: `<p>مساحة عملك <strong>${ws}</strong> جاهزة. في 10 دقائق يمكنك تشغيل صندوق بريدك الأول:</p>
<div style="background:#f8fafc;border-radius:12px;padding:24px;margin:24px 0;border-right:4px solid #6366f1;">
  <p style="margin:0 0 10px;font-weight:700;color:#0f172a;">3 خطوات للبدء</p>
  <p style="margin:0 0 8px;color:#475569;">1. <strong>اربط قناة</strong> — واتساب أو إنستغرام أو البريد في الاتصالات</p>
  <p style="margin:0 0 8px;color:#475569;">2. <strong>أنشئ صندوق بريدك الأول</strong> — جمّع المحادثات حسب القناة</p>
  <p style="margin:0;color:#475569;">3. <strong>ادعُ فريقك</strong> — أضف وكلاء في الإعدادات → المستخدمون</p>
</div>
<p>لأي سؤال، رد على هذا البريد الإلكتروني وسنساعدك شخصياً.</p>`,
      cta: 'انتقل إلى لوحة التحكم →', url: `${APP}/dashboard`,
    }),
    day1: (first) => ({
      subject: 'هل ربطت قناتك الأولى؟ 📱',
      title: `${first}، هل ربطت قناتك الأولى؟`,
      body: `<p>مع AutoMarkIQ تستقبل رسائل <strong>واتساب وإنستغرام وماسنجر وتيليغرام والبريد الإلكتروني والرسائل القصيرة</strong> في صندوق بريد واحد.</p>
<div style="background:#f0f4ff;border-radius:12px;padding:24px;margin:24px 0;">
  <p style="margin:0 0 10px;color:#475569;">📱 <strong>واتساب</strong> — امسح رمز QR أو استخدم Meta API</p>
  <p style="margin:0 0 10px;color:#475569;">📸 <strong>إنستغرام</strong> — اربط حسابك التجاري</p>
  <p style="margin:0;color:#475569;">📧 <strong>البريد الإلكتروني</strong> — SMTP/IMAP مع Gmail أو Outlook أو خادمك</p>
</div>
<p>بمجرد الربط، تصل جميع الرسائل إلى صندوق بريد موحد. يرد فريقك من مكان واحد.</p>`,
      cta: 'اربط قناتي الأولى →', url: `${APP}/connections`,
    }),
    day3: (first) => ({
      subject: 'روبوت الدردشة الذكي يمكنه خدمة العملاء 24/7 🤖',
      title: `روبوت الدردشة الذكي يمكنه خدمة العملاء أثناء نومك، ${first}`,
      body: `<p><strong>70% من استفسارات العملاء</strong> هي أسئلة متكررة يمكن للروبوت الإجابة عليها تلقائياً.</p>
<div style="background:#f0fdf4;border-radius:12px;padding:24px;margin:24px 0;border-right:4px solid #10b981;">
  <p style="margin:0 0 10px;font-weight:700;color:#0f172a;">مع روبوت الدردشة الذكي يمكنك:</p>
  <p style="margin:0 0 8px;color:#475569;">🤖 الإجابة على الأسئلة الشائعة تلقائياً</p>
  <p style="margin:0 0 8px;color:#475569;">📋 تأهيل العملاء المحتملين قبل تمريرهم للفريق</p>
  <p style="margin:0 0 8px;color:#475569;">📅 جدولة المواعيد وإرسال التأكيدات</p>
  <p style="margin:0;color:#475569;">⬆️ التصعيد لوكيل بشري عند الحاجة</p>
</div>
<p>الإعداد يستغرق أقل من 15 دقيقة. بدون كود، بدون مطورين.</p>`,
      cta: 'إنشاء روبوت الدردشة الذكي →', url: `${APP}/ai-chatbots`,
    }),
    day7: (first, ws) => ({
      subject: 'كيف تسير الأمور في AutoMarkIQ؟ 💬',
      title: `كيف تسير الأمور، ${first}؟`,
      body: `<p>لقد مضى أسبوع على استخدام <strong>${ws}</strong>. إذا كنت لا تزال على الخطة المجانية، إليك ما قد تفتقده:</p>
<div style="background:#fff7ed;border-radius:12px;padding:24px;margin:24px 0;border-right:4px solid #f59e0b;">
  <p style="margin:0 0 8px;color:#475569;">🤖 <strong>روبوتات الدردشة الذكية</strong> — متاحة من خطة Pro</p>
  <p style="margin:0 0 8px;color:#475569;">📞 <strong>روبوتات الصوت</strong> — مكالمات آلية بالذكاء الاصطناعي</p>
  <p style="margin:0 0 8px;color:#475569;">📊 <strong>التقارير المتقدمة</strong> — قِس أداء الفريق</p>
  <p style="margin:0;color:#475569;">👥 <strong>حتى 10 وكلاء</strong> و5 صناديق بريد متزامنة</p>
</div>
<p>خطة Pro بـ <strong>49$/شهر</strong> ويمكنك الإلغاء في أي وقت.</p>`,
      cta: 'عرض الخطط المميزة →', url: 'https://automarkiq.com/#pricing',
    }),
  },
};

@Injectable()
export class OnboardingEmailService implements OnModuleInit {
  private readonly logger = new Logger(OnboardingEmailService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS onboarding_email_log (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email_type TEXT NOT NULL,
        sent_to    TEXT NOT NULL,
        sent_at    TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tenant_id, email_type)
      )
    `).catch(() => {});

    const job = new CronJob('0 9 * * *', () => this.runDailyCheck());
    try { this.schedulerRegistry.addCronJob('onboarding-emails', job as any); job.start(); } catch {}
    this.logger.log('Onboarding email scheduler registered (09:00 UTC daily)');
  }

  async runDailyCheck() {
    this.logger.log('Running onboarding email check...');
    await this.sendScheduledBatch(1, 'day1');
    await this.sendScheduledBatch(3, 'day3');
    await this.sendScheduledBatch(7, 'day7');
  }

  private async sendScheduledBatch(days: number, type: EmailType) {
    const rows = await this.db.query(`
      SELECT t.id, t.name, COALESCE(t.lang, 'es') AS lang, u.email, u.full_name
      FROM tenants t
      JOIN users u ON u.tenant_id = t.id AND u.role = 'admin' AND u.is_active = true
      WHERE t.created_at BETWEEN NOW() - INTERVAL '${days} days 3 hours'
                              AND NOW() - INTERVAL '${days} days'
        AND t.slug != 'demo'
        AND t.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM onboarding_email_log l
          WHERE l.tenant_id = t.id AND l.email_type = $1
        )
    `, [type]);

    for (const row of rows) {
      await this.send(row.id, row.email, row.full_name, row.name, row.lang, type);
    }
  }

  async sendWelcome(tenantId: string, email: string, fullName: string, workspaceName: string, lang = 'es') {
    await this.send(tenantId, email, fullName, workspaceName, lang, 'welcome');
  }

  private async send(tenantId: string, to: string, fullName: string, workspace: string, lang: string, type: EmailType) {
    try {
      const { transport, from } = await this.getTransporter();
      const safeLang = (['es','en','pt','tr','ar'].includes(lang) ? lang : 'es') as Lang;
      const content  = T[safeLang][type](fullName.split(' ')[0], workspace);
      const isRtl    = safeLang === 'ar';

      await transport.sendMail({
        from, to,
        subject: content.subject,
        html: this.buildHtml(content, isRtl),
      });
      await this.db.query(
        `INSERT INTO onboarding_email_log (tenant_id, email_type, sent_to) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [tenantId, type, to],
      );
      this.logger.log(`Onboarding "${type}" [${safeLang}] → ${to}`);
    } catch (err: any) {
      this.logger.error(`Onboarding "${type}" failed for ${to}: ${err?.message}`);
    }
  }

  private async getTransporter(): Promise<{ transport: nodemailer.Transporter; from: string }> {
    const smtpHost = process.env.SMTP_HOST || '';
    if (!smtpHost || smtpHost === 'mailhog') {
      const rows = await this.db.query(
        `SELECT credentials FROM channel_connections
         WHERE channel_type = 'email' AND is_active = true
           AND (credentials->>'host') IS NOT NULL AND (credentials->>'host') != ''
         ORDER BY created_at ASC LIMIT 1`,
      );
      if (rows.length) {
        const c = rows[0].credentials ?? {};
        return {
          transport: nodemailer.createTransport({
            host: String(c.host).trim(), port: Number(c.port) || 587,
            secure: Number(c.port) === 465,
            auth: { user: c.user, pass: c.password },
            tls: { rejectUnauthorized: false },
          }),
          from: `AutoMarkIQ <${c.user}>`,
        };
      }
    }
    return {
      transport: nodemailer.createTransport({
        host: smtpHost || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      }),
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@automarkiq.com',
    };
  }

  private buildHtml(c: EmailContent, rtl: boolean): string {
    const dir = rtl ? 'rtl' : 'ltr';
    const footerNote = rtl
      ? 'تستقبل هذا البريد لأنك سجّلت في AutoMarkIQ.'
      : 'You receive this email because you signed up for AutoMarkIQ.';
    return `<!DOCTYPE html>
<html dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;direction:${dir};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:linear-gradient(135deg,#6366f1,#7c3aed);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
    <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;">AutoMarkIQ</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px;">CRM omnicanal · AI-powered</div>
  </td></tr>
  <tr><td style="background:#ffffff;padding:40px;border-radius:0 0 16px 16px;">
    <h1 style="font-size:22px;font-weight:800;color:#0f172a;margin:0 0 20px;line-height:1.3;">${c.title}</h1>
    <div style="font-size:15px;color:#475569;line-height:1.8;">${c.body}</div>
    <div style="text-align:center;margin:36px 0;">
      <a href="${c.url}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">${c.cta}</a>
    </div>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0;">
    <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0;">
      ${footerNote}<br>
      <a href="https://automarkiq.com" style="color:#6366f1;text-decoration:none;">automarkiq.com</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  }
}
