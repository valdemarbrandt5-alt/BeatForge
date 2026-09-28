/** Merge near-duplicate vocal attacks in older saved charts without moving the beat. */
export function spaceVocalOnsets<T extends {time:number;duration?:number}>(notes:T[], minGap=.18):T[] {
  const spaced:T[]=[];
  for(const note of [...notes].sort((a,b)=>a.time-b.time)){
    const previous=spaced.at(-1);
    if(previous && note.time-previous.time<minGap){
      // Keep explicit held notes and the first attack of a rapid syllable.
      if((note.duration||0)>(previous.duration||0)+.2)spaced[spaced.length-1]=note;
    }else spaced.push(note);
  }
  return spaced;
}
