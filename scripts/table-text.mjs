// Preserve row/column associations in original HTML tables, including spanning
// use labels. This transcribes the publication; it does not decide permission.
export function transcribeTables($, body) {
 const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
 const districtColumns=new Set();
 body.find('table').each((_,table)=>{
  const matrix=[];
  $(table).find('tr').slice(0,250).each((row,tr)=>{
   matrix[row]??=[];let col=0;
   $(tr).children('th,td').each((_,cell)=>{
    while(matrix[row][col]!==undefined)col++;
    const text=clean($(cell).text()),rs=Math.min(250,Math.max(1,Number($(cell).attr('rowspan'))||1)),cs=Math.min(30,Math.max(1,Number($(cell).attr('colspan'))||1));
    for(let y=row;y<Math.min(row+rs,250);y++){matrix[y]??=[];for(let x=col;x<Math.min(col+cs,30);x++)matrix[y][x]=text;}
    col+=cs;
   });
  });
  const district=/^[A-Z]{1,3}\d{0,2}(?:-[A-Z0-9.]+)?$/;
  const header=matrix.findIndex(row=>row[0]&&!district.test(row[0])&&row.filter(v=>district.test(v??'')).length>=2);
  const labels=header>=0?matrix[header]:null;
  if(labels)labels.filter(v=>district.test(v??'')).forEach(v=>districtColumns.add(v));
  const paragraphs=matrix.map((row,i)=>{
   const uniform=row.every(v=>v===row[0]);
   if(uniform)return row[0]??'';
   if(labels&&i>header)return row.map((v,j)=>`${labels[j]||'Column '+(j+1)}: ${v||'—'}`).join('; ');
   return row.join(' | ');
  });
  const replacement=$('<div>');for(const line of paragraphs)replacement.append($('<p>').text(line+' '));$(table).replaceWith(replacement);
 });
 return [...districtColumns];
}
