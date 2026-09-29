import type {SupabaseClient} from '@supabase/supabase-js';

export const CHALLENGER_MMR=2000;

export function rankInfo(mmr:number){
  if(mmr<800)return{name:'BRONZE',floor:0,next:800,cls:'bronze'};
  if(mmr<1000)return{name:'SILVER',floor:800,next:1000,cls:'silver'};
  if(mmr<1200)return{name:'GOLD',floor:1000,next:1200,cls:'gold'};
  if(mmr<1400)return{name:'PLATINUM',floor:1200,next:1400,cls:'platinum'};
  if(mmr<1600)return{name:'DIAMOND',floor:1400,next:1600,cls:'diamond'};
  if(mmr<1800)return{name:'MASTER',floor:1600,next:1800,cls:'master'};
  if(mmr<CHALLENGER_MMR)return{name:'GRANDMASTER',floor:1800,next:CHALLENGER_MMR,cls:'grandmaster'};
  return{name:'CHALLENGER',floor:CHALLENGER_MMR,next:null,cls:'challenger'};
}

export const rankName=(mmr:number)=>rankInfo(mmr).name;

// Only real players have ranked_players rows. The UUID breaks equal-MMR ties
// consistently, so two Challengers never receive the same world position.
export async function challengerPosition(db:SupabaseClient,userId:string,mmr:number):Promise<number|null>{
  if(mmr<CHALLENGER_MMR)return null;
  const [above,ties]=await Promise.all([
    db.from('ranked_players').select('user_id',{count:'exact',head:true}).gt('mmr',mmr),
    db.from('ranked_players').select('user_id',{count:'exact',head:true}).eq('mmr',mmr).lt('user_id',userId)
  ]);
  if(above.error||ties.error)return null;
  return 1+(above.count??0)+(ties.count??0);
}
