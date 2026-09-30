import type {Metadata} from 'next';
import LegalPage,{legalStyles as styles} from '../LegalPage';

export const metadata:Metadata={title:'Cookie Policy | BeatStrike',description:'Learn about cookies and browser storage used by BeatStrike.',alternates:{canonical:'/cookies'}};

export default function CookiesPage(){return <LegalPage title="Cookie Policy" label="COOKIES & LOCAL STORAGE">
 <p>BeatStrike uses cookies and similar browser technologies where they are needed to keep the service working, remember your choices and support embedded features.</p>
 <h2>What BeatStrike currently stores</h2>
 <ul>
  <li><strong>Authentication data</strong> helps keep you signed in and protects your account.</li>
  <li><strong>Game preferences</strong> remember settings such as volume, key bindings, note speed and lane colors.</li>
  <li><strong>Session state</strong> supports current matches and temporary game flows.</li>
  <li><strong>Local audio cache</strong> can remember an audio file you selected on that device. It is stored in your browser, not published with the chart.</li>
  <li><strong>YouTube embeds</strong> may use cookies or similar identifiers when an embedded player loads or when you interact with it.</li>
 </ul>
 <p className={styles.note}>BeatStrike does not currently set advertising cookies itself. If advertising or optional analytics are introduced, we will update this page and request consent where required before non-essential technologies are used.</p>
 <h2>Managing storage</h2>
 <p>You can remove cookies and site data through your browser settings. Blocking essential storage may sign you out, reset preferences, remove locally cached audio or prevent parts of BeatStrike from working correctly. You can also control YouTube and Google privacy choices through your Google account and browser settings.</p>
 <h2>Future advertising choices</h2>
 <p>If BeatStrike enables Google advertising, visitors in regions that require consent will be shown a consent choice through an appropriate consent platform. You will be able to accept, reject or manage non-essential purposes before they are activated.</p>
 <h2>Contact</h2>
 <p>Questions about cookies or browser storage can be sent to <a href="mailto:etherealgames23@gmail.com">etherealgames23@gmail.com</a>.</p>
 </LegalPage>}

