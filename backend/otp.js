require('dotenv').config();
const nodemailer = require('nodemailer');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

let transporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS && process.env.OTP_DEV_MODE !== 'true') {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendOTP(identifier, code, type) {
  if (process.env.OTP_DEV_MODE === 'true') {
    console.log(`\n🔐 OTP for ${identifier}: ${code}\n`);
    return true;
  }

  if (type === 'email' && transporter) {
    await transporter.sendMail({
      from: process.env.OTP_FROM || 'ZapChat <noreply@zapchat.app>',
      to: identifier,
      subject: `${code} is your ZapChat code`,
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px;">
          <h2 style="font-size:22px;font-weight:700;margin-bottom:8px;">Your ZapChat code</h2>
          <p style="color:#555;margin-bottom:24px;">Enter this code to sign in. It expires in 10 minutes.</p>
          <div style="background:#F5F5F5;border-radius:12px;padding:24px;text-align:center;letter-spacing:8px;font-size:32px;font-weight:700;color:#0057FF;">${code}</div>
          <p style="color:#999;font-size:12px;margin-top:24px;">If you didn't request this, you can ignore this email.</p>
        </div>`,
    });
  } else {
    console.log(`📱 SMS OTP for ${identifier}: ${code} (integrate Twilio/AWS SNS for real SMS)`);
  }
  return true;
}

module.exports = { generateOTP, sendOTP };
