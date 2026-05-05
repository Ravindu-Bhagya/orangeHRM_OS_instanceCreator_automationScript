const nodemailer = require('nodemailer');

async function sendInstanceCreatedEmail({ to, instanceName, serverName }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'sandbox.smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER || 'f4e26042fe5273',
      pass: process.env.SMTP_PASS || '424f393bd77cfb',
    },
  });

  const instanceUrl = `http://${instanceName}/installer/index.php`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"OrangeHRM Instance Creator" <noreply@orangehrm.com>',
    to,
    subject: `Your OrangeHRM Instance is Ready: ${instanceName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;">
        <h2 style="color:#ff6b35;">OrangeHRM Instance Created</h2>
        <p>Your hosted instance has been set up and is ready for the installation wizard.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px;color:#666;width:140px;">Instance Name</td>
            <td style="padding:8px;font-family:monospace;font-weight:bold;">${instanceName}</td>
          </tr>
          <tr style="background:#f9f9f9;">
            <td style="padding:8px;color:#666;">Server</td>
            <td style="padding:8px;font-family:monospace;">${serverName}</td>
          </tr>
          <tr>
            <td style="padding:8px;color:#666;">Installer URL</td>
            <td style="padding:8px;"><a href="${instanceUrl}" style="color:#ff6b35;">${instanceUrl}</a></td>
          </tr>
        </table>
        <p style="color:#888;font-size:0.9em;">
          Please complete the rest of the installation through the web UI at the URL above.
        </p>
      </div>
    `,
  });
}

module.exports = { sendInstanceCreatedEmail };
