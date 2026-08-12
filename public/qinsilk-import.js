'use strict';
(() => {
  const utf8 = new TextDecoder('utf-8');
  const HEADER_WORDS = ['名称','商品名称','货号','商品编码','条码','采购价','零售价','建议零售价','图片链接','客户名称','客户类型','手机','电话','销售单号','订单号','单据编号','销售时间','开单时间','数量','销售数量','当前库存','库存数量','仓库'];

  const cleanHeader = value => String(value ?? '').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+/g,'').trim();
  const cleanText = value => {
    const text = String(value ?? '').trim();
    return ['无','暂无','null','NULL','undefined','-','--'].includes(text) ? '' : text;
  };
  const toNumber = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const text = String(value ?? '').replace(/[￥¥,%\s]/g,'').replace(/，/g,',').replace(/,/g,'').trim();
    const num = Number(text);
    return Number.isFinite(num) ? num : 0;
  };
  const excelDateToISO = value => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === 'number' && value > 20000 && value < 90000) {
      const ms = Date.UTC(1899,11,30) + value * 86400000;
      return new Date(ms).toISOString();
    }
    const text = cleanText(value);
    if (!text) return '';
    const normalized = text.replace(/[年/.]/g,'-').replace(/月/g,'-').replace(/日/g,'').replace(/\s+/g,' ').trim();
    const date = new Date(normalized.includes('T') ? normalized : normalized.replace(' ','T'));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
    const dateOnly = new Date(`${normalized}T00:00:00`);
    return Number.isNaN(dateOnly.getTime()) ? '' : dateOnly.toISOString();
  };
  const normalizeKey = value => cleanHeader(value).toLowerCase().replace(/[（）()：:]/g,'');
  const xmlDecode = value => String(value ?? '')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
    .replace(/&apos;/g,"'").replace(/&amp;/g,'&')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));

  function getAttr(source, name) {
    const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(source || '');
    return match ? xmlDecode(match[1]) : '';
  }
  function cellColumnIndex(ref='A1') {
    const letters = (String(ref).match(/[A-Z]+/i)||['A'])[0].toUpperCase();
    let result = 0;
    for (const char of letters) result = result * 26 + char.charCodeAt(0) - 64;
    return Math.max(0,result-1);
  }
  function readU16(view,offset){return view.getUint16(offset,true);}
  function readU32(view,offset){return view.getUint32(offset,true);}

  class ZipReader {
    constructor(buffer){
      this.buffer=buffer;
      this.bytes=new Uint8Array(buffer);
      this.view=new DataView(buffer);
      this.entries=new Map();
      this.parseDirectory();
    }
    parseDirectory(){
      const min=Math.max(0,this.bytes.length-65557);let eocd=-1;
      for(let i=this.bytes.length-22;i>=min;i--){if(readU32(this.view,i)===0x06054b50){eocd=i;break;}}
      if(eocd<0)throw new Error('不是有效的 XLSX 文件：未找到 ZIP 目录');
      const total=readU16(this.view,eocd+10),offset=readU32(this.view,eocd+16);let p=offset;
      for(let i=0;i<total;i++){
        if(readU32(this.view,p)!==0x02014b50)throw new Error('XLSX ZIP 目录损坏');
        const method=readU16(this.view,p+10),compressedSize=readU32(this.view,p+20),uncompressedSize=readU32(this.view,p+24);
        const nameLength=readU16(this.view,p+28),extraLength=readU16(this.view,p+30),commentLength=readU16(this.view,p+32),localOffset=readU32(this.view,p+42);
        const name=utf8.decode(this.bytes.slice(p+46,p+46+nameLength));
        this.entries.set(name,{name,method,compressedSize,uncompressedSize,localOffset});
        p+=46+nameLength+extraLength+commentLength;
      }
    }
    has(name){return this.entries.has(name);}
    async bytesFor(name){
      const entry=this.entries.get(name);if(!entry)throw new Error(`XLSX 缺少文件：${name}`);
      const p=entry.localOffset;if(readU32(this.view,p)!==0x04034b50)throw new Error(`XLSX 条目损坏：${name}`);
      const nameLength=readU16(this.view,p+26),extraLength=readU16(this.view,p+28),start=p+30+nameLength+extraLength;
      const compressed=this.bytes.slice(start,start+entry.compressedSize);
      if(entry.method===0)return compressed;
      if(entry.method!==8)throw new Error(`暂不支持 XLSX 压缩方式 ${entry.method}`);
      if(typeof DecompressionStream==='undefined')throw new Error('当前浏览器不支持解压 XLSX，请把文件另存为 CSV 后导入');
      const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    async text(name){return utf8.decode(await this.bytesFor(name));}
  }

  function parseSharedStrings(xml=''){
    const result=[];const si=/<si\b[^>]*>([\s\S]*?)<\/si>/g;let match;
    while((match=si.exec(xml))){
      let text='';const t=/<t\b[^>]*>([\s\S]*?)<\/t>/g;let part;
      while((part=t.exec(match[1])))text+=xmlDecode(part[1]);
      result.push(text);
    }
    return result;
  }
  function parseWorksheet(xml,sharedStrings=[]){
    const matrix=[];const rowRegex=/<row\b([^>]*)>([\s\S]*?)<\/row>/g;let rowMatch;
    while((rowMatch=rowRegex.exec(xml))){
      const row=[];const body=rowMatch[2];const cellRegex=/<c\b([^>]*)>([\s\S]*?)<\/c>/g;let cellMatch;
      while((cellMatch=cellRegex.exec(body))){
        const attrs=cellMatch[1],content=cellMatch[2],ref=getAttr(attrs,'r'),type=getAttr(attrs,'t');
        const col=cellColumnIndex(ref);let value='';
        if(type==='inlineStr'){
          const parts=[];const t=/<t\b[^>]*>([\s\S]*?)<\/t>/g;let p;while((p=t.exec(content)))parts.push(xmlDecode(p[1]));value=parts.join('');
        }else{
          const v=/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(content);const raw=v?xmlDecode(v[1]):'';
          if(type==='s')value=sharedStrings[Number(raw)] ?? '';
          else if(type==='b')value=raw==='1';
          else if(type==='str')value=raw;
          else if(raw!==''&&!Number.isNaN(Number(raw)))value=Number(raw);
          else value=raw;
        }
        row[col]=value;
      }
      while(row.length&&String(row[row.length-1]??'').trim()==='')row.pop();
      matrix.push(row);
    }
    return matrix;
  }
  function parseCSV(text){
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i],next=text[i+1];
      if(ch==='"'&&quoted&&next==='"'){cell+='"';i++;}
      else if(ch==='"')quoted=!quoted;
      else if(ch===','&&!quoted){row.push(cell);cell='';}
      else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);cell='';if(row.some(x=>String(x??'').trim()))rows.push(row);row=[];}
      else cell+=ch;
    }
    row.push(cell);if(row.some(x=>String(x??'').trim()))rows.push(row);return rows;
  }
  function findHeaderRow(matrix){
    let best={index:-1,score:-1,count:0};
    matrix.slice(0,30).forEach((row,index)=>{
      const keys=row.map(cleanHeader).filter(Boolean);const score=keys.reduce((sum,key)=>sum+(HEADER_WORDS.some(word=>key.includes(word))?1:0),0);
      if(score>best.score||(score===best.score&&keys.length>best.count))best={index,score,count:keys.length};
    });
    if(best.index>=0&&best.count>=2)return best.index;
    return matrix.findIndex(row=>row.some(v=>String(v??'').trim()));
  }
  function matrixToObjects(matrix){
    const headerIndex=findHeaderRow(matrix);if(headerIndex<0)return {headers:[],rows:[],headerIndex:-1};
    const headers=matrix[headerIndex].map((v,i)=>cleanHeader(v)||`未命名列${i+1}`);
    const rows=matrix.slice(headerIndex+1).map((values,rowIndex)=>{
      const object={__rowNumber:headerIndex+rowIndex+2};headers.forEach((header,i)=>{object[header]=values[i]??'';});return object;
    }).filter(row=>Object.entries(row).some(([k,v])=>k!=='__rowNumber'&&String(v??'').trim()!==''));
    return {headers,rows,headerIndex};
  }
  async function sha256(buffer){
    if(!crypto?.subtle)return '';
    const digest=await crypto.subtle.digest('SHA-256',buffer);
    return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
  }
  async function readFile(file){
    const name=String(file?.name||'');const lower=name.toLowerCase();const buffer=await file.arrayBuffer();let matrix=[];
    if(lower.endsWith('.csv'))matrix=parseCSV(utf8.decode(buffer).replace(/^\uFEFF/,''));
    else if(lower.endsWith('.xlsx')){
      const zip=new ZipReader(buffer);const shared=zip.has('xl/sharedStrings.xml')?parseSharedStrings(await zip.text('xl/sharedStrings.xml')):[];
      const sheetPath=zip.has('xl/worksheets/sheet1.xml')?'xl/worksheets/sheet1.xml':[...zip.entries.keys()].find(x=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(x));
      if(!sheetPath)throw new Error('XLSX 中没有可读取的工作表');
      matrix=parseWorksheet(await zip.text(sheetPath),shared);
    }else throw new Error('请选择 .xlsx 或 .csv 文件');
    const data=matrixToObjects(matrix);
    return {...data,fileName:name,fileSize:file.size,hash:await sha256(buffer),matrixRows:matrix.length};
  }

  function createAccessor(row){
    const map=new Map(Object.keys(row).filter(k=>k!=='__rowNumber').map(k=>[normalizeKey(k),row[k]]));
    return (...candidates)=>{
      for(const candidate of candidates){const key=normalizeKey(candidate);if(map.has(key))return map.get(key);}
      for(const candidate of candidates){const key=normalizeKey(candidate);for(const [actual,value] of map){if(actual.includes(key)||key.includes(actual))return value;}}
      return '';
    };
  }
  function detectKind(headers,fileName=''){
    const joined=headers.join(' ');
    if(/销售|订单|单据/.test(fileName)||headers.some(h=>/销售单号|订单号|单据编号|开单时间|销售时间/.test(h)))return 'sales';
    if(/客户/.test(fileName)||(headers.some(h=>/客户名称/.test(h))&&headers.some(h=>/客户类型|会员等级|客户余额/.test(h))))return 'customers';
    if(/库存/.test(fileName)&&headers.some(h=>/库存|结存/.test(h)))return 'inventory';
    if(headers.some(h=>/货号|商品编码/.test(h))&&headers.some(h=>/采购价|零售价|建议零售价|图片链接|分类/.test(h)))return 'products';
    if(headers.some(h=>/当前库存|库存数量|可用库存|结存数量/.test(h)))return 'inventory';
    if(/销售|订单|单据/.test(joined)&&headers.some(h=>/数量|商品/.test(h)))return 'sales';
    return 'unknown';
  }
  function normalizeProductRows(rows){
    return rows.map(row=>{
      const get=createAccessor(row);const retail=toNumber(get('零售价','销售价'));const suggested=toNumber(get('建议零售价'));const wholesale=toNumber(get('批发价'));
      const stockRaw=get('当前库存','库存数量','可用库存','实际库存','结存数量');
      return {
        rowNumber:row.__rowNumber,name:cleanText(get('名称','商品名称')),code:cleanText(get('货号','商品编码','编码')),barcode:cleanText(get('条码')),
        image:cleanText(get('图片链接','商品图片链接')),category:cleanText(get('分类')),brand:cleanText(get('品牌')),supplier:cleanText(get('供应商')),unit:cleanText(get('单位')),
        color:cleanText(get('颜色')),size:cleanText(get('尺码','规格')),material:cleanText(get('材质')),status:cleanText(get('状态')),
        costPrice:toNumber(get('采购价','成本价')),wholesalePrice:wholesale,retailPrice:retail,suggestedPrice:suggested,salePrice:retail||suggested||wholesale,
        hasStock:stockRaw!==''&&stockRaw!==null&&stockRaw!==undefined,stock:Math.max(0,toNumber(stockRaw)),launchDate:excelDateToISO(get('上市日','建立时间','创建时间')),
      };
    });
  }
  function normalizeCustomerRows(rows){
    return rows.map(row=>{const get=createAccessor(row);return {
      rowNumber:row.__rowNumber,name:cleanText(get('客户名称','名称')),type:cleanText(get('客户类型')),tags:cleanText(get('客户标签','标签')),contact:cleanText(get('联系人')),
      phone:cleanText(get('手机','电话','会员手机')),wechat:cleanText(get('会员微信','微信','微信号')),address:cleanText(get('地址')),note:cleanText(get('备注')),
      source:cleanText(get('来源方式')),createdAt:excelDateToISO(get('建立时间','创建时间')),lastPurchaseAt:excelDateToISO(get('上次购买')),
      balance:toNumber(get('客户余额(元)','客户余额')),points:toNumber(get('当前剩余积分')),
    };});
  }
  function normalizeInventoryRows(rows){
    return rows.map(row=>{const get=createAccessor(row);const stockRaw=get('当前库存','库存数量','可用库存','实际库存','结存数量','库存');return {
      rowNumber:row.__rowNumber,code:cleanText(get('货号','商品货号','商品编码','编码')),name:cleanText(get('商品名称','名称')),warehouse:cleanText(get('仓库','门店','仓库名称','门店名称')),
      stock:Math.max(0,toNumber(stockRaw)),hasStock:stockRaw!==''&&stockRaw!==null&&stockRaw!==undefined,costPrice:toNumber(get('采购价','成本价','库存成本')),
    };});
  }
  function normalizeSaleRows(rows){
    return rows.map(row=>{
      const get=createAccessor(row);
      const qty=toNumber(get('单品数量','销售数量','数量','出库数量'));
      const originalPrice=toNumber(get('单价','销售单价','成交单价'));
      const discountPercent=toNumber(get('折扣(%)','折扣%','折扣率'));
      let price=toNumber(get('折后价','折后单价','成交单价','销售单价','单价'));
      const amount=toNumber(get('折后金额','销售金额','商品金额','金额'));
      if(!price&&qty)price=amount/Math.abs(qty);
      let costPrice=toNumber(get('采购均价','成本价','销售成本单价','采购价'));
      const costAmount=toNumber(get('采购成本','销售成本'));
      if(!costPrice&&qty&&costAmount)costPrice=costAmount/Math.abs(qty);
      const profitAmount=toNumber(get('毛利润','毛利'));
      const receivedRaw=get('实收金额');
      const orderTotalRaw=get('单据总金额');
      const received=receivedRaw===''||receivedRaw===null||receivedRaw===undefined?null:toNumber(receivedRaw);
      const orderTotal=orderTotalRaw===''||orderTotalRaw===null||orderTotalRaw===undefined?null:toNumber(orderTotalRaw);
      const status=cleanText(get('状态','单据状态','业务类别','业务类型','类型'));
      const note=[cleanText(get('单据备注','备注')),cleanText(get('单据单品备注')),cleanText(get('商品备注'))].filter(Boolean).join('；');
      return {
        rowNumber:row.__rowNumber,
        orderNo:cleanText(get('销售单号','订单号','单据编号','单号','流水号')),
        date:excelDateToISO(get('销售时间','开单时间','单据日期','日期','时间')),
        customerName:cleanText(get('客户名称','客户','会员名称')),
        code:cleanText(get('商品货号','货号','商品编码','编码')),
        name:cleanText(get('商品名称','名称')),
        color:cleanText(get('颜色')),
        qty,price,originalPrice,discountPercent,amount,costPrice,costAmount,profitAmount,received,orderTotal,status,
        returnLike:qty<0||/退货|退款|作废|撤销/.test(status),note,
      };
    });
  }
  function normalize(kind,rows){
    if(kind==='products')return normalizeProductRows(rows);
    if(kind==='customers')return normalizeCustomerRows(rows);
    if(kind==='inventory')return normalizeInventoryRows(rows);
    if(kind==='sales')return normalizeSaleRows(rows);
    return [];
  }
  function kindLabel(kind){return ({products:'商品资料',customers:'客户资料',inventory:'库存明细',sales:'销售明细',unknown:'无法识别'})[kind]||kind;}

  window.QinSilkImport={readFile,detectKind,normalize,kindLabel,cleanText,toNumber,excelDateToISO};
})();
