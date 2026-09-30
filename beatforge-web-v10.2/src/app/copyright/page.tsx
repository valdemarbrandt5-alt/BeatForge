import type {Metadata} from 'next';
import LegalPage,{legalStyles as styles} from '../LegalPage';

export const metadata:Metadata={title:'Copyright Policy | BeatStrike',description:'How to report copyright concerns involving BeatStrike charts, metadata or links.',alternates:{canonical:'/copyright'}};

export default function CopyrightPage(){return <LegalPage title="Copyright Policy" label="RIGHTS & TAKEDOWN REQUESTS">
 <p>BeatStrike respects the rights of artists, labels, publishers, creators and other rights holders. The service provides rhythm charts and may use YouTube’s embedded player. Normal community gameplay does not publicly host the local audio file selected by a player.</p>
 <h2>Report a concern</h2>
 <p>Send a copyright notice to <a href="mailto:etherealgames23@gmail.com?subject=Copyright%20Notice%20%E2%80%94%20BeatStrike">etherealgames23@gmail.com</a> with the subject <strong>Copyright Notice — BeatStrike</strong>.</p>
 <p>Please include:</p>
 <ul>
  <li>Your full name, organisation if applicable, email address and a way to contact you.</li>
  <li>A clear identification of the copyrighted work or other protected material.</li>
  <li>The exact BeatStrike URL and enough information to identify the chart, link or content in question.</li>
  <li>An explanation of why the use is not authorised by the rights holder, its agent or the law.</li>
  <li>A statement that the information in the notice is accurate and that you are the rights holder or authorised to act for them.</li>
 </ul>
 <p className={styles.note}>Submitting false or misleading notices may have legal consequences. If you are unsure whether material infringes your rights, consider seeking independent legal advice.</p>
 <h2>What happens next</h2>
 <p>We will review sufficiently complete notices and may remove or disable access to content while investigating. We may contact the chart creator or reporting party for more information. Repeated infringement or serious misuse may lead to account restrictions.</p>
 <h2>Response or correction</h2>
 <p>If your chart was removed and you believe this was a mistake, email the same address with the removal details, your reasons and evidence that you are authorised to use the material. We will review the response and take appropriate action.</p>
 </LegalPage>}

