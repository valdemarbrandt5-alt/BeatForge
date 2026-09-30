import type {Metadata} from 'next';
import LegalPage,{legalStyles as styles} from '../LegalPage';

export const metadata:Metadata={title:'Contact | BeatStrike',description:'Contact Ethereal Games about BeatStrike support, privacy, accounts or business enquiries.',alternates:{canonical:'/contact'}};

export default function ContactPage(){return <LegalPage title="Contact" label="ETHEREAL GAMES">
 <p>For BeatStrike support, account questions, privacy requests, business enquiries or feedback, contact:</p>
 <p className={styles.note}><strong>Ethereal Games</strong><br/><a href="mailto:etherealgames23@gmail.com">etherealgames23@gmail.com</a></p>
 <h2>Help us answer quickly</h2>
 <ul>
  <li>Include a short, clear subject such as “Account help”, “Privacy request” or “Chart problem”.</li>
  <li>For account requests, write from the email address connected to the account when possible.</li>
  <li>For a broken or disputed chart, include the exact BeatStrike page URL and song title.</li>
  <li>Do not email passwords, payment details or other sensitive credentials.</li>
 </ul>
 <h2>Copyright reports</h2>
 <p>For copyright or other rights complaints, follow the information on our <a href="/copyright">Copyright Policy</a> so the report contains what we need to investigate.</p>
 </LegalPage>}

