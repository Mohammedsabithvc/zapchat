const bcrypt = require('bcryptjs');
const twilio = require('twilio');
const { query, queryOne } = require('./index');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function saveOTP(contact, otp, type) {
  await query('DELETE FROM otps WHERE contact = $1', [contact]);
  const hash = await bcrypt.hash(otp, 10);
  await query(
    'INSERT INTO otps (contact, otp_hash, type) VALUES ($1, $2, $3)',
    [contact, hash, type]
  );
}

async function verifyOTP(contact, otp) {
  const record = await queryOne(
    'SELECT * FROM otps WHERE contact = $1 AND used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
    [contact]
  );
  if (!record) return { valid: false, reason: 'OTP expired or not found. Request a new one.' };
  const match = await bcrypt.compare(otp, record.otp_hash);
  if (!match) return { valid: false, reason: 'Incorrect code. Please try again.' };
  await query('UPDATE otps SET used = TRUE WHERE id = $1', [record.id]);
  return { valid: true };
}

async function sendEmailOTP(email, otp) {
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'ZapChat', email: 'mohdsabithvc@gmail.com' },
        to: [{ email }],
        subject: `${otp} is your ZapChat verification code`,
        htmlContent: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:40px 32px;background:#fff;">
            <div style="margin-bottom:28px;">
              <span style="font-size:26px;font-weight:800;color:#111;">Zap<span style="color:#00A884;">.</span></span>
            </div>
            <h1 style="font-size:22px;font-weight:700;color:#111;margin-bottom:8px;">Your verification code</h1>
            <p style="font-size:15px;color:#555;margin-bottom:28px;line-height:1.6;">
              Use this code to verify your email address. It expires in 10 minutes.
            </p>
            <div style="background:#F5F5F5;border-radius:14px;padding:32px;text-align:center;margin-bottom:28px;">
              <div style="font-size:48px;font-weight:800;letter-spacing:12px;color:#00A884;font-variant-numeric:tabular-nums;">${otp}</div>
            </div>
            <p style="font-size:13px;color:#999;line-height:1.6;">
              If you didn't request this code, you can safely ignore this email.
            </p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
            <p style="font-size:12px;color:#bbb;">ZapChat — Secure messaging for everyone.</p>
          </div>`
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Brevo error');
    console.log(`✅ Email OTP sent to ${email}`);
    return true;
  } catch (err) {
    console.error('❌ Email OTP failed:', err.message);
    console.log(`\n📧 FALLBACK OTP for ${email}: ${otp}\n`);
    return false;
  }
}

async function sendPhoneOTP(phone, otp) {
  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: `Your ZapChat verification code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    console.log(`✅ SMS OTP sent to ${phone}`);
    return true;
  } catch (err) {
    console.error('❌ SMS OTP failed:', err.message);
    console.log(`\n📱 FALLBACK OTP for ${phone}: ${otp}\n`);
    return false;
  }
}

module.exports = { generateOTP, saveOTP, verifyOTP, sendEmailOTP, sendPhoneOTP };