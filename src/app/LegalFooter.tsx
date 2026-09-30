import Link from 'next/link';
import styles from './LegalFooter.module.css';

export default function LegalFooter(){
 return <footer className={styles.footer}>
  <span>© {new Date().getFullYear()} Ethereal Games</span>
  <Link href="/privacy">Privacy</Link>
  <Link href="/cookies">Cookies</Link>
  <Link href="/terms">Terms</Link>
  <Link href="/copyright">Copyright</Link>
  <Link href="/contact">Contact</Link>
 </footer>;
}

