# Signup confirmation email

Supabase sends the confirmation email, so deploying the website alone does not change its appearance.

In the Supabase project dashboard, open **Authentication → Email Templates → Confirm signup**. Set the subject to `Confirm your BeatStrike account`, replace the message body with the entire contents of `confirm-signup.html`, and save. Send one test signup to check the sender name, links, and appearance in Gmail. The `{{ .ConfirmationURL }}` and `{{ .SiteURL }}` placeholders must remain intact.

The sender name and address are separate from the HTML template. Set them under **Authentication → SMTP Settings** if a custom SMTP provider is configured. A custom domain mailbox and authenticated SMTP are needed for a branded sender address; the template does not change the actual sender.

If the game name changes again, update the subject and the visible brand references in `confirm-signup.html`, then save the Supabase template again.
