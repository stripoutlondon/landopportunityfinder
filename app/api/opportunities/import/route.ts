import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { getSupabaseAdmin } from "@/lib/supabase";
import { explainScore, scoreOpportunity } from "@/lib/scoring";
export async function POST(req:Request){
  const supabase=getSupabaseAdmin();if(!supabase)return NextResponse.json({error:"Supabase is not configured"},{status:503});
  const form=await req.formData();const file=form.get("file");if(!(file instanceof File))return NextResponse.json({error:"CSV file required"},{status:400});
  const records=parse(await file.text(),{columns:true,skip_empty_lines:true,trim:true});
  const rows=records.map((r:any)=>{const input={ownership_status:r.ownership_status||null,company_status:r.company_status||null,vacancy_signal:Number(r.vacancy_signal||0),planning_signal:Number(r.planning_signal||0),access_signal:Number(r.access_signal||0),assembly_signal:Number(r.assembly_signal||0),constraint_penalty:Number(r.constraint_penalty||0),evidence_confidence:Number(r.evidence_confidence||50),area_sqm:r.area_sqm?Number(r.area_sqm):null};const opportunity_score=scoreOpportunity(input);return {...r,...input,opportunity_score,rationale:r.rationale||explainScore(input,opportunity_score),source_type:r.source_type||"csv",status:r.status||"new"};});
  const {data,error}=await supabase.from("opportunities").insert(rows).select();if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({imported:data.length});
}
