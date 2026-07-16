export type ScoreInput = {
  ownership_status?: string | null;
  company_status?: string | null;
  vacancy_signal?: number;
  planning_signal?: number;
  access_signal?: number;
  assembly_signal?: number;
  constraint_penalty?: number;
  evidence_confidence?: number;
  area_sqm?: number | null;
};
const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
export function scoreOpportunity(input:ScoreInput){
  const vacancy=clamp(input.vacancy_signal??0);
  const planning=clamp(input.planning_signal??0);
  const access=clamp(input.access_signal??0);
  const assembly=clamp(input.assembly_signal??0);
  const constraints=clamp(input.constraint_penalty??0);
  const confidence=clamp(input.evidence_confidence??50);
  const dissolved=input.company_status?.toLowerCase().includes("dissolved")?18:0;
  const unclear=input.ownership_status?.toLowerCase().includes("unregistered")?12:input.ownership_status?.toLowerCase().includes("unclear")?8:0;
  const sizeBonus=input.area_sqm&&input.area_sqm>=500?5:0;
  const raw=vacancy*.22+planning*.24+access*.18+assembly*.12+confidence*.18+dissolved+unclear+sizeBonus-constraints*.28;
  return Math.round(clamp(raw));
}
export function explainScore(input:ScoreInput,score:number){
  const reasons:string[]=[];
  if((input.planning_signal??0)>=65) reasons.push("strong planning or development signal");
  if((input.vacancy_signal??0)>=65) reasons.push("credible vacancy or under-use evidence");
  if((input.access_signal??0)>=65) reasons.push("apparent road or service access");
  if(input.company_status?.toLowerCase().includes("dissolved")) reasons.push("registered proprietor appears dissolved");
  if(input.ownership_status?.toLowerCase().includes("unregistered")) reasons.push("possible unregistered-title lead requiring SIM verification");
  if((input.constraint_penalty??0)>=60) reasons.push("material planning or environmental constraints reduce score");
  return `${score}/100: ${reasons.length?reasons.join("; "):"early-stage lead requiring more evidence"}.`;
}
