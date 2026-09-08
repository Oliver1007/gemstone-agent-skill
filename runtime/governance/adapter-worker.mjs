// Fixed internal child entry: temp environment is supplied by the governed parent.
import {buildCandidate,auditCandidate,renderCandidate} from '../production/adapter/engine-tool-adapter.mjs';
let text='';for await(const chunk of process.stdin)text+=chunk;
try {const {operation,input}=JSON.parse(text);const op={BUILD:buildCandidate,AUDIT:auditCandidate,RENDER:renderCandidate}[operation];if(!op)throw Error('UNAUTHORIZED_OPERATION');const result=await op(input);process.stdout.write(JSON.stringify({ok:true,result}));}
catch(e){process.stdout.write(JSON.stringify({ok:false,error:{code:e.code??'RUNTIME_ERROR',message:e.message,details:e.details??null}}));process.exitCode=1;}
