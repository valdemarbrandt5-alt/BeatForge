import Link from 'next/link';

const features = [
 {
  title: 'Play instantly in your browser',
  text: 'Start with the demo or choose a community chart. BeatStrike runs online, so there is nothing to download or install.',
 },
 {
  title: 'Choose your instrument',
  text: 'Play vocals, drums, bass, melody or the full mix. Each instrument has its own rhythm chart and feel.',
 },
 {
  title: 'Compete for the high score',
  text: 'Build long combos, earn up to five stars and compare scores with friends and the global leaderboard.',
 },
];

const questions = [
 {
  question: 'Is BeatStrike free to play?',
  answer: 'Yes. BeatStrike is a free online rhythm game that you can play directly in a modern web browser.',
 },
 {
  question: 'Do I need to download BeatStrike?',
  answer: 'No. BeatStrike runs in your browser, so you can start playing without downloading a game client.',
 },
 {
  question: 'Can I play my own songs?',
  answer: 'Yes. You can add a song and let BeatStrike generate a playable rhythm chart. You can also explore charts shared by the community.',
 },
 {
  question: 'Which instruments can I play?',
  answer: 'BeatStrike supports vocals, drums, bass, melody and full mix charts. Available instruments can vary from song to song.',
 },
];

export default function SeoContent() {
 return <section className="seoContent" aria-labelledby="about-beatstrike">
  <div className="seoIntro">
   <small>FREE ONLINE MUSIC GAME</small>
   <h2 id="about-beatstrike">A competitive rhythm game built for your browser</h2>
   <p>BeatStrike turns music into a five lane rhythm challenge. Time every note, hold sustained vocals, build your combo and chase a new personal best across solo and competitive modes.</p>
  </div>
  <div className="seoFeatures">
   {features.map(feature=><article key={feature.title}>
    <h3>{feature.title}</h3>
    <p>{feature.text}</p>
   </article>)}
  </div>
  <div className="seoHowTo">
   <div>
    <small>HOW TO PLAY</small>
    <h2>Pick a song and follow the beat</h2>
   </div>
   <ol>
    <li><strong>Choose a chart</strong><span>Open the community library or upload a song.</span></li>
    <li><strong>Select your challenge</strong><span>Choose an instrument, difficulty and number of lanes.</span></li>
    <li><strong>Hit every note</strong><span>Use your keyboard to match the notes as they reach the receptors.</span></li>
   </ol>
  </div>
  <div className="seoFaq">
   <small>FREQUENTLY ASKED QUESTIONS</small>
   <h2>About BeatStrike</h2>
   {questions.map(item=><details key={item.question}>
    <summary>{item.question}</summary>
   <p>{item.answer}</p>
   </details>)}
  </div>
  <div className="seoBrowse"><Link href="/songs">BROWSE ALL BEATSTRIKE SONGS</Link><span>Explore community charts for vocals, drums, bass, melody and full mix.</span></div>
 </section>;
}
