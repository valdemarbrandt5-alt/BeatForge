import type {ReactNode} from 'react';
import Link from 'next/link';
import LegalFooter from './LegalFooter';
import styles from './legal.module.css';

export const legalStyles=styles;

export default function LegalPage({title,label,children}:{title:string;label:string;children:ReactNode}){
 return <main className={styles.shell}>
  <div className={styles.wrap}>
   <nav className={styles.top} aria-label="Primary navigation">
    <Link className={styles.brand} href="/">BEAT<span>STRIKE</span></Link>
    <Link className={styles.play} href="/">PLAY BEATSTRIKE</Link>
   </nav>
   <article className={styles.article}>
    <span className={styles.eyebrow}>{label}</span>
    <h1>{title}</h1>
    <p className={styles.updated}>Effective September 30, 2026</p>
    {children}
    <nav className={styles.nav} aria-label="Legal and contact pages">
     <Link href="/privacy">Privacy</Link><Link href="/cookies">Cookies</Link><Link href="/terms">Terms</Link><Link href="/copyright">Copyright</Link><Link href="/contact">Contact</Link>
    </nav>
   </article>
   <LegalFooter/>
  </div>
 </main>;
}

