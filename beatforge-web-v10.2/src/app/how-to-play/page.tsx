import type {Metadata} from 'next';
import Link from 'next/link';
import LegalPage,{legalStyles as styles} from '../LegalPage';

export const metadata:Metadata={title:'How to Play BeatStrike | Rhythm Game Guide',description:'Learn BeatStrike controls, notes, holds, combos, scoring, difficulties, instruments and how to start a song.',alternates:{canonical:'/how-to-play'}};

export default function HowToPlayPage(){return <LegalPage title="How to Play BeatStrike" label="PLAYER GUIDE">
 <p>BeatStrike is a lane based rhythm game. Notes travel toward the receptors and you press the matching keyboard key when a note reaches its target. Accurate timing builds score and combo; missed notes break the combo. You can start with the built in demo or choose a chart from the public song library.</p>
 <h2>1. Choose a song and chart</h2>
 <p>Open the <Link href="/songs">song library</Link> and choose a song. A song can have more than one playable chart. When multiple instruments or difficulties are available, select the version you want before starting the run.</p>
 <h2>2. Pick an instrument</h2>
 <p>BeatStrike can support <strong>vocals, drums, bass, melody and full mix</strong>. These are different gameplay interpretations rather than cosmetic labels. Vocal charts follow vocal phrases, instrument charts focus on their respective musical parts, and full mix charts draw rhythm from the combined track. Not every song has every instrument available.</p>
 <h2>3. Choose your difficulty</h2>
 <p>Difficulty controls how demanding the chart is. Easier settings reduce the amount of information you need to react to, while harder settings are intended for faster reading and more precise play. If a chart feels overwhelming, lower the difficulty first and learn its rhythm before chasing an expert score.</p>
 <h2>4. Hit normal notes</h2>
 <p>Each lane has a keyboard binding. Press the matching key as the note reaches the receptor. Timing matters: cleaner hits receive better judgements and contribute more strongly to your final result. Your current key bindings can be changed in the player settings.</p>
 <h2>5. Hold sustained notes</h2>
 <p>Long notes have a head followed by a sustained section. Hit the head at the correct time and keep the lane key held while the sustain continues. Releasing too early gives up part of the hold and can reduce the quality of the run.</p>
 <h2>6. Build a combo</h2>
 <p>Consecutive successful hits increase your combo. Long clean sequences are important because BeatStrike rewards consistent play rather than a handful of isolated perfect hits. A miss resets the active combo, so a stable run can beat a reckless one even when both players hit many of the same notes.</p>
 <h2>7. Understand your result</h2>
 <p>At the end of a run, use the score, accuracy, judgement counts, maximum combo and star result to see where you improved. A high score tells you how productive the run was, while accuracy is useful for comparing how cleanly you played. Replaying the same chart is the easiest way to learn difficult sections and set a new personal best.</p>
 <h2>Solo and competitive play</h2>
 <p>Solo play is ideal for learning charts and improving personal bests. BeatStrike also includes competitive features and leaderboards where scores can be compared with other players. Competitive systems may evolve as the player pool and game develop.</p>
 <h2>Before your first serious run</h2>
 <ul>
  <li>Use a desktop browser and a keyboard for the intended control scheme.</li>
  <li>Check your volume and key bindings before the song starts.</li>
  <li>Start on a comfortable difficulty and move up when you can read the chart consistently.</li>
  <li>Focus on timing and survival before trying to maximize every combo bonus.</li>
  <li>If a particular chart appears incorrect, use the <Link href="/contact">contact page</Link> and include the song and chart details.</li>
 </ul>
 <p className={styles.note}><strong>Start playing</strong><br/><Link href="/songs">Browse BeatStrike songs</Link> or return to the <Link href="/">game</Link>.</p>
 </LegalPage>}
