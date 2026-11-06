// Sign-in codes and invites over SMTP. Without SMTP settings the message goes to the server log,
// so local runs and tests need no mail server.

import nodemailer from 'nodemailer';

export function createMailer(env = process.env) {
  const configured = Boolean(env.SMTP_HOST && env.SMTP_FROM);
  const transport = configured
    ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: Number(env.SMTP_PORT) === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
    : null;

  async function send(to, subject, text) {
    if (!configured) {
      console.log(`[email not configured] to=${to} subject="${subject}"\n${text}`);
      return;
    }
    await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
  }

  return {
    configured,
    sendCode: (to, code) => send(to, `Pyltjies code: ${code}`, `Your Pyltjies code is ${code}. It expires in 10 minutes. Never share it.`),
    sendInvite: (to, fromName, url) => send(to, `${fromName} invited you to Pyltjies`,
      `${fromName} invited you to Pyltjies, our private darts league.\n\n`
      + `Open ${url} and sign in with this email address (${to}). You'll get a 6-digit code by email.\n\n`
      + 'On an iPhone: open it in Safari, tap Share and then Add to Home Screen.'),
  };
}
