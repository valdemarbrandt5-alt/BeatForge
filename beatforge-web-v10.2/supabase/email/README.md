# BeatStrike authentication emails

Supabase sends these emails. Website deployments do not update the templates in Supabase automatically.

In your Supabase project, open **Authentication → Emails → Templates**. For each row below, replace the subject and paste the entire contents of its HTML file into **Body → Source**, then save. Keep the Supabase placeholders unchanged.

| Supabase template | Subject | HTML file |
| --- | --- | --- |
| Confirm sign up | `Confirm your BeatStrike account` | `confirm-signup.html` |
| Invite user | `You're invited to BeatStrike` | `invite-user.html` |
| Magic link or OTP | `Your BeatStrike sign in link` | `magic-link.html` |
| Change email address | `Confirm your new BeatStrike email` | `change-email.html` |
| Reset password | `Reset your BeatStrike password` | `reset-password.html` |
| Reauthentication | `{{ .Token }} is your BeatStrike verification code` | `reauthentication.html` |

The first five templates use `{{ .ConfirmationURL }}` for their action links. The reauthentication email shows `{{ .Token }}` as a six digit code. All six use `{{ .SiteURL }}` in the footer. The change email template also uses `{{ .NewEmail }}`. Supabase fills these values when it sends the email.

Set **Authentication → URL Configuration → Site URL** to `https://www.beatstrike.app` so default authentication links return to the right domain. Test confirmation, recovery, and invitation flows with fresh accounts after saving. The visual template does not implement an in app password reset screen; that flow needs a separate functional check.

The sender name and address are configured under **Authentication → SMTP Settings**, separately from the email templates.
