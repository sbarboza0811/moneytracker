'use strict';
/* Leitura e escrita XLSX local, sem bibliotecas externas e sem enviar dados à rede. */
const Excel=(()=>{
  const dec=new TextDecoder('utf-8'),enc=new TextEncoder();
  const u16=(dv,p)=>dv.getUint16(p,true),u32=(dv,p)=>dv.getUint32(p,true);
  async function zipRead(file){
    const b=new Uint8Array(await file.arrayBuffer());if(b.byteLength>20*1024*1024)throw Error('Arquivo superior a 20 MB');
    const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);let e=-1;
    for(let p=b.length-22;p>=Math.max(0,b.length-65557);p--)if(u32(dv,p)===0x06054b50){e=p;break;}
    if(e<0)throw Error('Não é um arquivo XLSX válido.');
    const n=u16(dv,e+10);if(n>2000)throw Error('Planilha com muitas entradas ZIP.');
    let p=u32(dv,e+16);const entries=new Map();
    for(let i=0;i<n;i++){
      if(u32(dv,p)!==0x02014b50)throw Error('ZIP corrompido.');
      const method=u16(dv,p+10),size=u32(dv,p+20),un=u32(dv,p+24),nl=u16(dv,p+28),xl=u16(dv,p+30),cl=u16(dv,p+32),at=u32(dv,p+42);
      const name=dec.decode(b.subarray(p+46,p+46+nl));
      p+=46+nl+xl+cl;
      if(un>55*1024*1024)throw Error('Conteúdo XLSX muito grande.');
      if(name.startsWith('xl/'))entries.set(name,{method,size,un,at});
    }
    async function read(name){const it=entries.get(name);if(!it)return null;
      const p=it.at,st=p+30+u16(dv,p+26)+u16(dv,p+28);
      if(u32(dv,p)!==0x04034b50)throw Error('ZIP inválido.');
      const chunk=b.subarray(st,st+it.size);
      if(it.method===0)return dec.decode(chunk);
      if(it.method!==8)throw Error('Compactação XLSX incompatível.');
      if(typeof DecompressionStream==='undefined')throw Error('Seu navegador não suporta abrir XLSX offline. Use Chrome/Edge atualizado.');
      try{return await new Response(new Blob([chunk]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();}
      catch(e){throw Error('Falha ao descompactar XLSX no navegador.');}
    }
    return{entries,read};
  }
  function parseXML(str){const d=new DOMParser().parseFromString(str,'application/xml');if(d.getElementsByTagName('parsererror').length)throw Error('XML inválido dentro do XLSX.');return d;}
  const nodes=(n,tag)=>Array.from(n.getElementsByTagName(tag));
  function toCol(a){let n=0;for(const ch of String(a).replace(/\d/g,'').toUpperCase())n=n*26+(ch.charCodeAt(0)-64);return n-1;}
  function sheetRows(doc,strings){let rows=[];for(const row of nodes(doc,'row').slice(0,25000)){
    const arr=[];
    for(const c of nodes(row,'c')){
      const col=toCol(c.getAttribute('r'));if(col<0||col>80)continue;
      const type=c.getAttribute('t'),v=nodes(c,'v')[0]?.textContent??'';
      let value=type==='s'?(strings[+v]||''):type==='inlineStr'?nodes(c,'t').map(t=>t.textContent).join(''):type==='b'?(v==='1'?'1':'0'):type==='str'?v:(v===''?'':Number(v));
      arr[col]=value;
    }
    if(arr.some(v=>v!==undefined&&v!==null&&String(v).trim()))rows.push(arr.map(v=>v??''));
  }return rows;}
  async function read(file){const z=await zipRead(file);const shared=await z.read('xl/sharedStrings.xml');const ss=shared?nodes(parseXML(shared),'si').map(n=>nodes(n,'t').map(e=>e.textContent||'').join('')):[];
    const paths=[...z.entries.keys()].filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a,b)=>+a.match(/sheet(\d+)/)[1]-+b.match(/sheet(\d+)/)[1]);
    if(!paths.length)throw Error('Sem abas legíveis na planilha.');
    let out=[];for(const p of paths.slice(0,12)){const raw=await z.read(p);if(!raw)continue;const rows=sheetRows(parseXML(raw),ss);if(rows.length)out.push({sheet:p,rows});}
    return out;
  }
  function escapeXML(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
  function column(n){let x='';for(let i=n+1;i>0;i=Math.floor((i-1)/26))x=String.fromCharCode(65+(i-1)%26)+x;return x;}
  function xmlSheet(rows,cols){let xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols>';
    for(let i=0;i<cols;i++){let wid=[22,26,25,35,51,24,18,20,20][i]||18;xml+=`<col min="${i+1}" max="${i+1}" width="${wid}" customWidth="1"/>`;}
    xml+='</cols><sheetData>';
    rows.forEach((r,ri)=>{xml+=`<row r="${ri+1}">`;
      for(let ci=0;ci<cols;ci++){
        const val=r[ci];if(val===undefined||val===null||val==='')continue;
        const ref=column(ci)+(ri+1),header=ri===0;
        if(typeof val==='number'&&Number.isFinite(val)&&!header)xml+=`<c r="${ref}" s="${ci>=5?2:0}"><v>${val}</v></c>`;
        else xml+=`<c r="${ref}" t="inlineStr" s="${header?1:0}"><is><t>${escapeXML(val)}</t></is></c>`;
      }
      xml+='</row>';
    });
    xml+='</sheetData></worksheet>';return xml;
  }
  const table=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;table[n]=c>>>0;}
  function crc(bytes){let c=0xFFFFFFFF;for(const x of bytes)c=table[(c^x)&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0;}
  const wbXML=(name)=>`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXML(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const wbrels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF124336"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';
  function zipStore(files){const out=[],central=[];let offset=0;function b16(d,i,v){d[i]=v&255;d[i+1]=(v>>>8)&255;}function b32(d,i,v){b16(d,i,v&65535);b16(d,i+2,v>>>16);}
    for(const [name,data] of files){const nb=enc.encode(name),bytes=enc.encode(data),c=crc(bytes),lh=new Uint8Array(30+nb.length);b32(lh,0,0x04034b50);b16(lh,4,20);b16(lh,6,0x0800);b16(lh,8,0);b32(lh,14,c);b32(lh,18,bytes.length);b32(lh,22,bytes.length);b16(lh,26,nb.length);lh.set(nb,30);out.push(lh,bytes);
      const cd=new Uint8Array(46+nb.length);b32(cd,0,0x02014b50);b16(cd,4,20);b16(cd,6,20);b16(cd,8,0x0800);b16(cd,10,0);b32(cd,16,c);b32(cd,20,bytes.length);b32(cd,24,bytes.length);b16(cd,28,nb.length);b32(cd,42,offset);cd.set(nb,46);central.push(cd);offset+=lh.length+bytes.length;
    }
    const clen=central.reduce((a,b)=>a+b.length,0),end=new Uint8Array(22);b32(end,0,0x06054b50);b16(end,8,central.length);b16(end,10,central.length);b32(end,12,clen);b32(end,16,offset);
    return new Blob([...out,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function create(sheet,rows){return zipStore([
    ['[Content_Types].xml',types],['_rels/.rels',rels],['xl/workbook.xml',wbXML(sheet)],['xl/_rels/workbook.xml.rels',wbrels],['xl/styles.xml',styles],['xl/worksheets/sheet1.xml',xmlSheet(rows,rows[0].length)]
  ]);}
  return{read,create};
})();

window.MoneyTrackerExcel=Excel;
