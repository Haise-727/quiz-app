/**
 * Sends one plain text email with Amazon SES. Used by the stream trigger (a quiz needs marking, a quiz was marked) and the
 * weekly summary.
 *
 * SES starts every account in a SANDBOX: it only delivers to addresses that have been verified, and the sender must be a
 * verified address too. So an email to anyone else is refused with MessageRejected. That is not an error for us: the
 * in app notification is the main channel and the email is a bonus, so a refusal is logged and ignored. Asking AWS to lift
 * the sandbox (a form in the SES console) would let every address receive them.
 *
 * Cost: 0.10 dollars per thousand emails.
 */
export async function sendMail({ to, subject, text }, deps = {}) {
  const from = deps.from ?? process.env.SES_FROM;
  if (!from || !to) return { sent: false, reason: 'not configured' };
  try {
    if (deps.send) await deps.send({ from, to, subject, text });
    else {
      const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2');
      await new SESv2Client({}).send(new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [to] },
        Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' } } } },
      }));
    }
    return { sent: true };
  } catch (err) {
    console.log(`EVT mail_skipped reason=${err?.name || 'error'}`);          // never the address or the body
    return { sent: false, reason: err?.name || 'error' };
  }
}
