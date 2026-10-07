import type {Metadata} from 'next';
import Link from 'next/link';
import LegalPage,{legalStyles as styles} from '../LegalPage';

export const metadata:Metadata={title:'About BeatStrike | Ethereal Games',description:'Learn what BeatStrike is, how the browser rhythm game works, and what Ethereal Games is building.',alternates:{canonical:'/about'}};

export default function AboutPage(){return <LegalPage title="About BeatStrike" label="BUILT BY ETHEREAL GAMES">
 <p><strong>BeatStrike</strong> is a free browser rhythm game built around a simple idea: getting into a music game should be fast. You choose a chart, pick a difficulty and play directly from a modern desktop browser without installing a game client.</p>
 <p>The game turns songs into timed note charts across multiple lanes. Your job is to hit each note as it reaches the receptors, keep sustained notes held, protect your combo and improve your accuracy. Scores, stars and leaderboards make the same chart worth replaying when you want to squeeze out a cleaner run.</p>
 <h2>What makes BeatStrike different</h2>
 <p>BeatStrike is not just a static song list. The site contains the playable rhythm engine, chart library, scoring system, player profiles, leaderboards and competitive features. Charts can offer different instrument perspectives, including vocals, drums, bass, melody and full mix, so the rhythm you play can change even when the underlying song is the same.</p>
 <p>Difficulty and lane settings let players choose between a more approachable run and a denser challenge. The goal is to make the first game easy to start while still leaving room for high accuracy, long combos and difficult expert charts.</p>
 <h2>Why we built it</h2>
 <p>We like rhythm games, but we also like the immediacy of the web. BeatStrike is our attempt to combine those two things: open a link, find a chart and start playing. We are continuing to improve chart quality, competitive play, discovery and the overall feel of hitting notes.</p>
 <h2>Community and charts</h2>
 <p>BeatStrike includes community chart features so players can discover and play charts shared through the service. A chart contains gameplay timing and metadata; availability of instruments can differ from one song to another. Community charts and scores may change as the game and chart generation systems improve.</p>
 <p>Music and other third party material remain the property of their respective rights holders. BeatStrike does not claim ownership of third party songs. Rights holders can review our <Link href="/copyright">Copyright Policy</Link> or <Link href="/contact">contact us</Link>.</p>
 <h2>Who is behind BeatStrike?</h2>
 <p>BeatStrike is developed and operated by <strong>Ethereal Games</strong>. We are building the game iteratively and use player feedback to decide what needs improvement next. For support, privacy requests, business enquiries or general feedback, visit the <Link href="/contact">contact page</Link>.</p>
 <p className={styles.note}><strong>Ready to play?</strong><br/>Read the <Link href="/how-to-play">How to Play guide</Link> or <Link href="/songs">browse the song library</Link>.</p>
 </LegalPage>}
