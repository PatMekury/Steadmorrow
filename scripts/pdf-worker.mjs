import {parentPort,workerData} from 'node:worker_threads';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createRequire} from 'node:module';
import {dirname,join,sep} from 'node:path';
const require=createRequire(import.meta.url);
try{
  const task=getDocument({data:new Uint8Array(workerData.bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,stopAtErrors:true,standardFontDataUrl:join(dirname(require.resolve('pdfjs-dist/package.json')),'standard_fonts').replaceAll('\\','/')+'/'});
  const doc=await task.promise,start=workerData.start,end=Math.min(doc.numPages,start+3),pages=[];
  if(start>doc.numPages)throw new Error('Invalid PDF page');
  for(let n=start;n<=end;n++){
    const page=await doc.getPage(n),content=await page.getTextContent();let text='',y;
    for(const item of content.items){if(!('str' in item))continue;const next=item.transform?.[5];if(y!==undefined&&Math.abs(next-y)>3)text+='\n';text+=item.str+(item.hasEOL?'\n':' | ');y=next;}
    pages.push({page:n,text:text.slice(0,16000),truncated:text.length>16000});page.cleanup();
  }
  parentPort.postMessage({pages,pageCount:doc.numPages});await doc.destroy();
}catch{parentPort.postMessage({error:'PDF text extraction failed; use another official copy.'});}
