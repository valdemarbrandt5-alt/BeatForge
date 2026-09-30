import type {Metadata} from 'next';
import LegalPage,{legalStyles as styles} from '../LegalPage';

export const metadata:Metadata={title:'Privacy Policy | BeatStrike',description:'How Ethereal Games collects, uses and protects information when you use BeatStrike.',alternates:{canonical:'/privacy'}};

export default function PrivacyPage(){return <LegalPage title="Privacy Policy" label="YOUR DATA IN BEATSTRIKE">
 <p>This policy explains how <strong>Ethereal Games</strong> handles personal information when you use BeatStrike at beatstrike.app. Questions and privacy requests can be sent to <a href="mailto:etherealgames23@gmail.com">etherealgames23@gmail.com</a>.</p>
 <h2>Information we collect</h2>
 <ul>
  <li><strong>Account information:</strong> your email address, username, account identifier and authentication information.</li>
  <li><strong>Gameplay information:</strong> scores, accuracy, streaks, rankings, match results, likes, friend connections and player settings.</li>
  <li><strong>Community content:</strong> charts you create or share, including song titles, artist names, chart notes, instrument choices and YouTube links.</li>
  <li><strong>Technical information:</strong> browser, device, IP address, diagnostic and security logs may be processed by us or our service providers when you use the site.</li>
  <li><strong>Information stored on your device:</strong> BeatStrike stores preferences, session state and, when you choose a local audio file, may cache that file in your browser.</li>
 </ul>
 <p className={styles.note}><strong>Your local audio:</strong> a local song file you select for gameplay is kept in your browser storage and is not made public with a community chart. Charts can instead use a YouTube link for playback.</p>
 <h2>Why we use information</h2>
 <p>We use information to provide and secure accounts, run gameplay and leaderboards, sync settings, enable community and multiplayer features, prevent abuse, troubleshoot problems and improve BeatStrike. We rely on providing the service you request, our legitimate interests in operating a safe game, and consent where the law requires it.</p>
 <h2>Services that process information</h2>
 <ul>
  <li><strong>Supabase</strong> provides authentication, database and account-related services.</li>
  <li><strong>Vercel</strong> hosts and delivers the BeatStrike website.</li>
  <li><strong>Railway</strong> hosts parts of the chart-analysis service.</li>
  <li><strong>YouTube/Google</strong> provides embedded video playback. Loading or using an embedded player may allow Google to receive device, usage and network information under its own policies.</li>
 </ul>
 <p>We do not sell personal information. We may disclose information when required by law, to protect users or the service, or to suppliers working for us under appropriate obligations.</p>
 <h2>Retention and security</h2>
 <p>We keep account and gameplay information while your account is active and for as long as reasonably needed to operate the service, resolve disputes, prevent abuse or meet legal obligations. Browser-stored information remains until you remove it or your browser clears it. No online service can guarantee absolute security, but we use reasonable safeguards and reputable service providers.</p>
 <h2>Your choices and rights</h2>
 <p>Depending on where you live, you may have rights to access, correct, delete, restrict or object to processing, receive a copy of your information, and withdraw consent. To make a request or delete your account data, email us from the address connected to your account. You may also complain to your local data protection authority; in Denmark this is Datatilsynet.</p>
 <h2>Children</h2>
 <p>BeatStrike is not intended for children under 13. If you believe a child has provided personal information contrary to applicable law, contact us so we can investigate and remove it where required.</p>
 <h2>Changes</h2>
 <p>We may update this policy as BeatStrike changes. The effective date above shows when this version took effect. Material changes will be communicated on the site where appropriate.</p>
 </LegalPage>}

